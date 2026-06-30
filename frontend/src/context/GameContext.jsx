import React, { createContext, useState, useContext, useRef } from 'react';
import { io } from 'socket.io-client';

const GameContext = createContext();

export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
  // Wallet & Player Profile States
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [solBalance, setSolBalance] = useState(47.0);
  const [rpsRating, setRpsRating] = useState(1000);
  const [username, setUsername] = useState('Player');

  // Navigation / Views
  const [activeView, setActiveView] = useState('lobby'); // 'lobby' or 'game'
  const [activeRoom, setActiveRoom] = useState(null);

  // Custom Rooms list and creation modal states
  const [customRooms, setCustomRooms] = useState([]);
  const [createRoomModalOpen, setCreateRoomModalOpen] = useState(false);

  // Matchmaking & Core State Machine
  const [matchmakingState, setMatchmakingState] = useState('waiting_for_opponent');
  const [userReady, setUserReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  
  // Opponent Details
  const [opponent, setOpponent] = useState(null); 
  const [roundNum, setRoundNum] = useState(1);
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [playerSelection, setPlayerSelection] = useState(null);
  const [opponentSelection, setOpponentSelection] = useState(null);
  const [userLockedSelection, setUserLockedSelection] = useState(false);
  const [battleResult, setBattleResult] = useState(null); // 'win', 'loss', 'draw'
  const [playerHistory, setPlayerHistory] = useState([]);
  const [opponentHistory, setOpponentHistory] = useState([]);

  // Timers & Cooldown Line
  const [timerType, setTimerType] = useState(null); // 'cooldown_3s', 'playing_10s', 'afk_5s'
  const [timerPercent, setTimerPercent] = useState(100);
  const [timerRemaining, setTimerRemaining] = useState(0);

  // Chat State
  const [chatTab, setChatTab] = useState('general'); // 'private', 'opponent', 'general'
  const [chatMessages, setChatMessages] = useState([]);

  // Online Users / Statistics
  const [usersInRoom] = useState([]);
  const [lobbyStats, setLobbyStats] = useState({ wallets: 0, rooms: 0 });

  const socketRef = useRef(null);

  // Connect Wallet & Initialize Socket connection
  const connectWallet = () => {
    // Generate a mock wallet address if not already connected
    const mockWallet = 'Haku' + Math.random().toString(36).substring(2, 8).toUpperCase() + '324';
    setWalletAddress(mockWallet);
    setWalletConnected(true);

    // Establish WebSocket Connection
    const socketUrl = window.location.origin.includes('localhost') ? 'http://localhost:5000' : window.location.origin;
    const socket = io(socketUrl);
    socketRef.current = socket;

    socket.emit('join_lobby', mockWallet);

    // Profile Sync Listener
    socket.on('profile_sync', (profile) => {
      setUsername(profile.username);
      setRpsRating(profile.rating);
      setSolBalance(profile.solBalance);
    });

    // Lobby Updates Listener
    socket.on('lobby_update', (lobbyData) => {
      setCustomRooms(lobbyData.customRooms);
      setLobbyStats(lobbyData.stats);
      
      // Update top ranks to keep sync
      // If lobby contains general chat, sync it
      if (lobbyData.chatMessages) {
        setChatMessages(lobbyData.chatMessages);
      }
    });

    socket.on('room_created', (roomId) => {
      socket.emit('join_room', { roomId });
    });

    // Room Sync Listener
    socket.on('room_sync', (syncData) => {
      setActiveRoom({
        id: syncData.roomId,
        title: syncData.title,
        price: syncData.price,
        fee: syncData.fee
      });
      
      const isPlayer1 = syncData.player1.wallet === mockWallet;
      
      // Sync opponent details
      const oppData = isPlayer1 ? syncData.player2 : syncData.player1;
      if (oppData) {
        setOpponent({
          name: oppData.name,
          wallet: oppData.wallet,
          rating: oppData.rating,
          wins: oppData.wins,
          losses: oppData.losses,
          draws: oppData.draws
        });
        setOpponentHistory(oppData.history || []);
      } else {
        setOpponent(null);
        setOpponentHistory([]);
      }

      // Sync game details
      setRoundNum(syncData.roundNum);
      setPlayerScore(isPlayer1 ? syncData.player1Score : syncData.player2Score);
      setOpponentScore(isPlayer1 ? syncData.player2Score : syncData.player1Score);
      setPlayerHistory(isPlayer1 ? syncData.player1.history : (syncData.player2?.history || []));
      
      setMatchmakingState(syncData.matchmakingState);
      setActiveView('game');
    });

    // Ready Status Ticks Listener
    socket.on('ready_status', (status) => {
      const isPlayer1 = activeRoom?.player1?.wallet === mockWallet;
      setUserReady(isPlayer1 ? status.player1Ready : status.player2Ready);
      setOpponentReady(isPlayer1 ? status.player2Ready : status.player1Ready);
    });

    // Smooth Timer synchronization
    socket.on('timer_sync', (timer) => {
      setTimerType(timer.timerType);
      setTimerPercent(timer.percent);
      setTimerRemaining(timer.remaining);
    });

    // Start Round Event
    socket.on('start_round', (data) => {
      setRoundNum(data.roundNum);
      setPlayerSelection(null);
      setOpponentSelection(null);
      setUserLockedSelection(false);
      setBattleResult(null);
      setMatchmakingState('playing_10s');
    });

    // Move locked acknowledgement
    socket.on('move_locked', () => {
      setUserLockedSelection(true);
    });

    // Round Resolution Listener
    socket.on('round_resolved', (resolution) => {
      const isPlayer1 = activeRoom?.player1?.wallet === mockWallet;
      
      const myMove = isPlayer1 ? resolution.player1Move : resolution.player2Move;
      const oppMove = isPlayer1 ? resolution.player2Move : resolution.player1Move;
      
      setPlayerSelection(myMove);
      setOpponentSelection(oppMove);

      let result = 'draw';
      if (resolution.winner === 'draw') {
        result = 'draw';
      } else {
        const isP1Win = resolution.winner === 'player1';
        result = (isP1Win === isPlayer1) ? 'win' : 'loss';
      }

      setBattleResult(result);
      setPlayerScore(isPlayer1 ? resolution.player1Score : resolution.player2Score);
      setOpponentScore(isPlayer1 ? resolution.player2Score : resolution.player1Score);
      
      setPlayerHistory(prev => [myMove, ...prev].slice(0, 10));
      setOpponentHistory(prev => [oppMove, ...prev].slice(0, 10));
      
      setMatchmakingState('round_resolved');
      setTimerType(null);
    });

    // Profile updates after round resolutions
    socket.on('profile_sync_update', (profiles) => {
      const isPlayer1 = profiles.player1.wallet === mockWallet;
      const myProfile = isPlayer1 ? profiles.player1 : profiles.player2;
      
      setRpsRating(myProfile.rating);
      setSolBalance(myProfile.solBalance);
    });

    // Chat Broadcasts Listener
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

  const disconnectWallet = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setWalletConnected(false);
    setWalletAddress('');
    setActiveView('lobby');
    setActiveRoom(null);
  };

  // Join Room emitter
  const joinRoom = (room) => {
    if (!walletConnected) {
      connectWallet();
    }
    // Set loading searching state
    setMatchmakingState('waiting_for_opponent');
    setActiveRoom(room);
    setActiveView('game');

    // Wait slightly to allow connection setup if connecting first time
    setTimeout(() => {
      if (socketRef.current) {
        socketRef.current.emit('join_room', { roomId: room.id });
      }
    }, 500);
  };

  // Set Player Ready
  const setPlayerReady = () => {
    setUserReady(true);
    if (socketRef.current) {
      socketRef.current.emit('set_ready');
    }
  };

  // Submit selection to server
  const makeMove = (selection) => {
    if (socketRef.current) {
      socketRef.current.emit('submit_move', selection);
    }
  };

  const leaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.emit('leave_room');
    }
    setActiveView('lobby');
    setActiveRoom(null);
    setOpponent(null);
    setPlayerSelection(null);
    setOpponentSelection(null);
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

  // Mock fallbacks for unused buttons to prevent UI bugs
  const triggerOpponentAFK = () => {};
  const getBackToGame = () => {};
  const kickUser = () => {};
  const searchAnotherRoom = () => { leaveRoom(); };
  const waitNextOpponent = () => {};

  const createCustomRoom = (name, betAmount, password) => {
    if (socketRef.current) {
      socketRef.current.emit('create_room', {
        roomName: name,
        betAmount: betAmount,
        hasPassword: !!password,
        roomPassword: password
      });
    }
  };

  return (
    <GameContext.Provider value={{
      walletConnected,
      walletAddress,
      solBalance,
      rpsRating,
      username,
      activeView,
      activeRoom,
      customRooms,
      createRoomModalOpen,
      setCreateRoomModalOpen,
      createCustomRoom,
      matchmakingState,
      userReady,
      opponentReady,
      opponent,
      roundNum,
      playerScore,
      opponentScore,
      playerSelection,
      opponentSelection,
      userLockedSelection,
      battleResult,
      playerHistory,
      opponentHistory,
      timerType,
      timerPercent,
      timerRemaining,
      chatTab,
      setChatTab,
      chatMessages,
      usersInRoom,
      lobbyStats,
      connectWallet,
      disconnectWallet,
      joinRoom,
      leaveRoom,
      setPlayerReady,
      makeMove,
      triggerOpponentAFK,
      getBackToGame,
      kickUser,
      searchAnotherRoom,
      waitNextOpponent,
      sendChatMessage,
      likeMessage
    }}>
      {children}
    </GameContext.Provider>
  );
};
