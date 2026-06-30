import React, { createContext, useState, useContext, useRef } from 'react';
import { io } from 'socket.io-client';

const GameContext = createContext();

export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
  // Wallet & Player Profile
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [solBalance, setSolBalance] = useState(0);
  const [custodialWallet, setCustodialWallet] = useState('');
  const [rpsRating, setRpsRating] = useState(1000);
  const [username, setUsername] = useState('Player');
  const [playerWins, setPlayerWins] = useState(0);
  const [playerLosses, setPlayerLosses] = useState(0);
  const [playerDraws, setPlayerDraws] = useState(0);

  // Navigation
  const [activeView, setActiveView] = useState('lobby');
  const [activeRoom, setActiveRoom] = useState(null);

  // Custom Rooms & Modals
  const [customRooms, setCustomRooms] = useState([]);
  const [createRoomModalOpen, setCreateRoomModalOpen] = useState(false);

  // Lobby Real Data
  const [topRanks, setTopRanks] = useState([]);
  const [giveaways, setGiveaways] = useState([]);
  const [roomTiers, setRoomTiers] = useState([]);
  const [lobbyStats, setLobbyStats] = useState({ wallets: 0, rooms: 0, matches: 0, giveaways: 0, poolSol: '0', feesCollectedSol: '0' });

  // Matchmaking State Machine
  const [matchmakingState, setMatchmakingState] = useState('waiting_for_opponent');
  const [userReady, setUserReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);

  // Opponent Details (all from server)
  const [opponent, setOpponent] = useState(null);
  const [roundNum, setRoundNum] = useState(1);
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [playerSelection, setPlayerSelection] = useState(null);
  const [opponentSelection, setOpponentSelection] = useState(null);
  const [userLockedSelection, setUserLockedSelection] = useState(false);
  const [battleResult, setBattleResult] = useState(null);
  const [playerHistory, setPlayerHistory] = useState([]);
  const [opponentHistory, setOpponentHistory] = useState([]);

  // Timers
  const [timerType, setTimerType] = useState(null);
  const [timerPercent, setTimerPercent] = useState(100);
  const [timerRemaining, setTimerRemaining] = useState(0);

  // Chat
  const [chatTab, setChatTab] = useState('general');
  const [chatMessages, setChatMessages] = useState([]);

  // Users in room list (track by socket)
  const [usersInRoom] = useState([]);

  const socketRef = useRef(null);
  const walletRef = useRef('');

  // Setup all socket event listeners in a reusable way
  const setupSocketListeners = (socket) => {
    // Profile sync from server
    socket.on('profile_sync', (profile) => {
      setUsername(profile.username);
      setRpsRating(profile.rating);
      setSolBalance(parseFloat(profile.solBalance || 0));
      setCustodialWallet(profile.custodialWallet || '');
      setPlayerWins(profile.wins || 0);
      setPlayerLosses(profile.losses || 0);
      setPlayerDraws(profile.draws || 0);
    });

    // Full lobby state from server — replaces ALL fake local data
    socket.on('lobby_update', (lobbyData) => {
      setCustomRooms(lobbyData.customRooms || []);
      setTopRanks(lobbyData.topRanks || []);
      setRoomTiers(lobbyData.roomTiers || []);
      setLobbyStats(lobbyData.stats || { wallets: 0, rooms: 0, matches: 0, giveaways: 0, poolSol: '0', feesCollectedSol: '0' });
      setGiveaways(lobbyData.giveaways || []);
      if (lobbyData.chatMessages) {
        setChatMessages(lobbyData.chatMessages.map((m, i) => ({ ...m, id: m.id || i, tab: 'general' })));
      }
    });

    socket.on('room_created', (roomId) => {
      socket.emit('join_room', { roomId });
    });

    socket.on('room_sync', (syncData) => {
      setActiveRoom({
        id: syncData.roomId,
        title: syncData.title,
        betSol: syncData.betSol,
        feeRate: syncData.feeRate,
        player1Wallet: syncData.player1.wallet
      });

      const isPlayer1 = syncData.player1.wallet === walletRef.current;
      const myData = isPlayer1 ? syncData.player1 : syncData.player2;
      const oppData = isPlayer1 ? syncData.player2 : syncData.player1;

      // Sync YOUR real stats
      if (myData) {
        setPlayerWins(myData.wins || 0);
        setPlayerLosses(myData.losses || 0);
        setPlayerDraws(myData.draws || 0);
        setPlayerHistory(myData.history || []);
      }

      // Sync opponent's real stats
      if (oppData) {
        setOpponent({
          name: oppData.name,
          wallet: oppData.wallet,
          rating: oppData.rating,
          wins: oppData.wins || 0,
          losses: oppData.losses || 0,
          draws: oppData.draws || 0
        });
        setOpponentHistory(oppData.history || []);
      } else {
        setOpponent(null);
        setOpponentHistory([]);
      }

      setRoundNum(syncData.roundNum);
      setPlayerScore(isPlayer1 ? syncData.player1Score : syncData.player2Score);
      setOpponentScore(isPlayer1 ? syncData.player2Score : syncData.player1Score);
      setMatchmakingState(syncData.matchmakingState);
      setActiveView('game');
    });

    socket.on('ready_status', (status) => {
      setUserReady(status.player1Ready);
      setOpponentReady(status.player2Ready);
    });

    socket.on('timer_sync', (timer) => {
      setTimerType(timer.timerType);
      setTimerPercent(timer.percent);
      setTimerRemaining(timer.remaining);
    });

    socket.on('start_round', (data) => {
      setRoundNum(data.roundNum);
      setPlayerSelection(null);
      setOpponentSelection(null);
      setUserLockedSelection(false);
      setBattleResult(null);
      setMatchmakingState('playing_10s');
    });

    socket.on('move_locked', () => {
      setUserLockedSelection(true);
    });

    socket.on('round_resolved', (resolution) => {
      const myWallet = walletRef.current;
      const isP1 = currentRoomPlayer1WalletRef.current === myWallet;

      const myMove = isP1 ? resolution.player1Move : resolution.player2Move;
      const oppMove = isP1 ? resolution.player2Move : resolution.player1Move;

      setPlayerSelection(myMove);
      setOpponentSelection(oppMove);

      let result = 'draw';
      if (resolution.winner !== 'draw') {
        const winnerIsP1 = resolution.winner === 'player1';
        result = (winnerIsP1 === isP1) ? 'win' : 'loss';
      }

      setBattleResult(result);
      setPlayerScore(isP1 ? resolution.player1Score : resolution.player2Score);
      setOpponentScore(isP1 ? resolution.player2Score : resolution.player1Score);

      setPlayerHistory(prev => myMove ? [myMove, ...prev].slice(0, 10) : prev);
      setOpponentHistory(prev => oppMove ? [oppMove, ...prev].slice(0, 10) : prev);
      setMatchmakingState('round_resolved');
      setTimerType(null);
    });

    socket.on('profile_sync_update', (profiles) => {
      const myWallet = walletRef.current;
      const isP1 = profiles.player1.wallet === myWallet;
      const myProfile = isP1 ? profiles.player1 : profiles.player2;
      const oppProfile = isP1 ? profiles.player2 : profiles.player1;

      setRpsRating(myProfile.rating);
      setSolBalance(parseFloat(myProfile.solBalance || 0));
      setPlayerWins(myProfile.wins || 0);
      setPlayerLosses(myProfile.losses || 0);
      setPlayerDraws(myProfile.draws || 0);

      if (oppProfile) {
        setOpponent(prev => prev ? {
          ...prev,
          rating: oppProfile.rating,
          solBalance: parseFloat(oppProfile.solBalance || 0),
          wins: oppProfile.wins || 0,
          losses: oppProfile.losses || 0,
          draws: oppProfile.draws || 0
        } : prev);
      }
    });

    socket.on('chat_broadcast', (msg) => {
      setChatMessages(prev => [...prev, {
        id: msg.id,
        sender: msg.sender,
        text: msg.text,
        time: msg.time,
        likes: msg.likes,
        tab: msg.tab
      }]);
    });

    socket.on('join_error', (err) => {
      alert(`Could not join room: ${err}`);
    });
  };

  // Initialize socket on mount so guests can view the lobby instantly
  React.useEffect(() => {
    const socketUrl = window.location.origin.includes('localhost')
      ? 'http://localhost:5000'
      : window.location.origin;
    const socket = io(socketUrl);
    socketRef.current = socket;

    setupSocketListeners(socket);

    // Auto-reconnect if previously connected
    const savedWallet = localStorage.getItem('rps_wallet_address');
    if (savedWallet) {
      walletRef.current = savedWallet;
      setWalletAddress(savedWallet);
      setWalletConnected(true);
      socket.emit('join_lobby', savedWallet);
    } else {
      socket.emit('join_lobby', null);
    }

    return () => {
      socket.disconnect();
    };
  }, []);

  const connectWallet = async () => {
    try {
      const isPhantom = window.solana && window.solana.isPhantom;
      const isSolflare = window.solflare && window.solflare.isSolflare;

      if (!isPhantom && !isSolflare) {
        alert("Solana wallet not found! Please install Phantom Wallet (https://phantom.app) or Solflare to play.");
        window.open("https://phantom.app", "_blank");
        return;
      }

      const provider = isPhantom ? window.solana : window.solflare;
      const resp = await provider.connect();
      const pubKey = resp.publicKey.toString();

      walletRef.current = pubKey;
      setWalletAddress(pubKey);
      setWalletConnected(true);
      localStorage.setItem('rps_wallet_address', pubKey);

      // Upgrade socket session to authenticated wallet
      if (socketRef.current) {
        socketRef.current.emit('join_lobby', pubKey);
      }
    } catch (err) {
      console.error("Wallet connection failed:", err);
    }
  };

  // Ref to track player1 wallet of the current room (solves stale closure in round_resolved)
  const currentRoomPlayer1WalletRef = useRef('');

  const joinRoom = (room) => {
    if (!walletConnected) connectWallet();

    setMatchmakingState('waiting_for_opponent');
    setActiveRoom(room);
    setActiveView('game');
    currentRoomPlayer1WalletRef.current = room.player1Wallet || '';

    setTimeout(() => {
      if (socketRef.current) {
        socketRef.current.emit('join_room', { roomId: room.id });
      }
    }, 500);
  };

  const joinRoomWithRef = (room) => {
    joinRoom(room);
  };

  const disconnectWallet = () => {
    localStorage.removeItem('rps_wallet_address');
    if (socketRef.current) {
      setWalletConnected(false);
      setWalletAddress('');
      setSolBalance(0);
      setCustodialWallet('');
      setActiveView('lobby');
      setActiveRoom(null);
      walletRef.current = '';
      socketRef.current.emit('join_lobby', null);
    }
  };

  const setPlayerReady = () => {
    setUserReady(true);
    if (socketRef.current) socketRef.current.emit('set_ready');
  };

  const makeMove = (selection) => {
    if (socketRef.current) socketRef.current.emit('submit_move', selection);
  };

  const leaveRoom = () => {
    if (socketRef.current) socketRef.current.emit('leave_room');
    setActiveView('lobby');
    setActiveRoom(null);
    setOpponent(null);
    setPlayerSelection(null);
    setOpponentSelection(null);
    setBattleResult(null);
    setMatchmakingState('waiting_for_opponent');
    currentRoomPlayer1WalletRef.current = '';
  };

  const sendChatMessage = (text) => {
    if (socketRef.current) {
      socketRef.current.emit('send_chat', {
        roomId: activeView === 'game' ? activeRoom?.id : null,
        text
      });
    }
  };

  const likeMessage = (id) => {
    setChatMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, likes: msg.likes + 1 } : msg
    ));
  };

  const triggerOpponentAFK = () => {};
  const getBackToGame = () => {};
  const kickUser = () => {};
  const searchAnotherRoom = () => { leaveRoom(); };
  const waitNextOpponent = () => {};

  const createCustomRoom = (name, betSol, password) => {
    if (socketRef.current) {
      socketRef.current.emit('create_room', {
        roomName: name,
        betSol,
        hasPassword: !!password,
        roomPassword: password
      });
    }
  };

  return (
    <GameContext.Provider value={{
      walletConnected, walletAddress, solBalance, custodialWallet, rpsRating, username,
      playerWins, playerLosses, playerDraws,
      activeView, activeRoom,
      customRooms, createRoomModalOpen, setCreateRoomModalOpen, createCustomRoom,
      topRanks, giveaways, lobbyStats, roomTiers,
      matchmakingState, userReady, opponentReady, opponent,
      roundNum, playerScore, opponentScore,
      playerSelection, opponentSelection, userLockedSelection, battleResult,
      playerHistory, opponentHistory,
      timerType, timerPercent, timerRemaining,
      chatTab, setChatTab, chatMessages, usersInRoom,
      connectWallet, disconnectWallet,
      joinRoom: joinRoomWithRef, leaveRoom,
      setPlayerReady, makeMove,
      triggerOpponentAFK, getBackToGame, kickUser, searchAnotherRoom, waitNextOpponent,
      sendChatMessage, likeMessage
    }}>
      {children}
    </GameContext.Provider>
  );
};
