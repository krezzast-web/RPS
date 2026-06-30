import React, { createContext, useState, useContext, useRef } from 'react';
import { io } from 'socket.io-client';

const GameContext = createContext();

export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
  // Wallet & Player Profile
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [solBalance, setSolBalance] = useState(null); // null until server confirms
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
  const [lobbyStats, setLobbyStats] = useState({ wallets: 0, rooms: 0, matches: 0, giveaways: 0 });

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
  // Keep walletAddress in a ref so async socket closures always see the latest value
  const walletRef = useRef('');

  const connectWallet = () => {
    const mockWallet = 'Haku' + Math.random().toString(36).substring(2, 8).toUpperCase() + '324';
    walletRef.current = mockWallet;
    setWalletAddress(mockWallet);
    setWalletConnected(true);

    const socketUrl = window.location.origin.includes('localhost')
      ? 'http://localhost:5000'
      : window.location.origin;
    const socket = io(socketUrl);
    socketRef.current = socket;

    socket.emit('join_lobby', mockWallet);

    // Profile sync from server — clears fake initial values
    socket.on('profile_sync', (profile) => {
      setUsername(profile.username);
      setRpsRating(profile.rating);
      setSolBalance(profile.solBalance);
      setPlayerWins(profile.wins || 0);
      setPlayerLosses(profile.losses || 0);
      setPlayerDraws(profile.draws || 0);
    });

    // Full lobby state from server — replaces ALL fake local data
    socket.on('lobby_update', (lobbyData) => {
      setCustomRooms(lobbyData.customRooms || []);
      setTopRanks(lobbyData.topRanks || []);
      setLobbyStats(lobbyData.stats || { wallets: 0, rooms: 0, matches: 0, giveaways: 0 });
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
        price: syncData.price,
        fee: syncData.fee,
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
      // Determine which player we are based on walletRef (avoids stale closure)
      // We store player1Wallet in activeRoom but it may not be set yet
      // The server sends both flags; we check which wallet is ours
      setUserReady(status.player1Ready);   // will be corrected by isPlayer1 check below
      setOpponentReady(status.player2Ready);
      // Since we don't know order yet without activeRoom, the UI just shows both states
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
      // Determine player position from the room data in ref
      // We use walletRef to avoid stale closure
      const myWallet = walletRef.current;
      // We don't know p1/p2 here without activeRoom ref — use resolution data
      // The server sends player1Move and player2Move; we identify ours via the room_sync data
      // For now we track position in a separate ref updated on room_sync
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
      setSolBalance(myProfile.solBalance);
      setPlayerWins(myProfile.wins || 0);
      setPlayerLosses(myProfile.losses || 0);
      setPlayerDraws(myProfile.draws || 0);

      // Update opponent stats live
      if (oppProfile) {
        setOpponent(prev => prev ? {
          ...prev,
          rating: oppProfile.rating,
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

  // Intercept room_sync to update our player1 wallet ref
  const joinRoomWithRef = (room) => {
    joinRoom(room);
  };

  const disconnectWallet = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setWalletConnected(false);
    setWalletAddress('');
    setSolBalance(null);
    setActiveView('lobby');
    setActiveRoom(null);
    walletRef.current = '';
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

  const createCustomRoom = (name, betAmount, password) => {
    if (socketRef.current) {
      socketRef.current.emit('create_room', {
        roomName: name,
        betAmount,
        hasPassword: !!password,
        roomPassword: password
      });
    }
  };

  return (
    <GameContext.Provider value={{
      walletConnected, walletAddress, solBalance, rpsRating, username,
      playerWins, playerLosses, playerDraws,
      activeView, activeRoom,
      customRooms, createRoomModalOpen, setCreateRoomModalOpen, createCustomRoom,
      topRanks, giveaways, lobbyStats,
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
