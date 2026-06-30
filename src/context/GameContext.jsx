import React, { createContext, useState, useEffect, useContext, useRef } from 'react';

const GameContext = createContext();

export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
  // Wallet State
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [solBalance, setSolBalance] = useState(47.0);
  const [rpsRating, setRpsRating] = useState(2324);

  // Navigation / Views
  const [activeView, setActiveView] = useState('lobby'); // 'lobby' or 'game'
  const [activeRoom, setActiveRoom] = useState(null);

  // Custom Rooms list and creation modal states (moved here from Lobby)
  const [customRooms, setCustomRooms] = useState([
    { id: 1, name: 'NIKATMG ROOM', status: 'OPEN', players: 2, price: 0.05, fee: 0.1, games: 42141 },
    { id: 2, name: 'ASMON GOLD ROOM', status: 'OPEN', players: 2, price: 0.05, fee: 0.1, games: 42141 },
    { id: 3, name: 'HUNGRYMAN ROOM', status: 'OPEN', players: 2, price: 0.05, fee: 0.1, games: 42141 },
    { id: 4, name: 'MY BUDDY ROOM', status: 'CLOSE', players: 2, price: 0.05, fee: 0.1, games: 42141 },
    { id: 5, name: 'NEW STREAMER ROOM', status: 'CLOSE', players: 2, price: 0.05, fee: 0.1, games: 42141 },
  ]);
  const [createRoomModalOpen, setCreateRoomModalOpen] = useState(false);

  // Matchmaking & Core State Machine
  // States: 'waiting_for_opponent', 'opponent_joined', 'cooldown_3s', 'playing_10s', 'round_resolved', 'afk_user', 'afk_opponent'
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
  const [playerHistory, setPlayerHistory] = useState(['R', 'P', 'R', 'S', 'R', 'S', 'P', 'P', 'S', 'P']);
  const [opponentHistory, setOpponentHistory] = useState(['R', 'P', 'R', 'S', 'R', 'S', 'P', 'P', 'S', 'P']);

  // Timers & Cooldown Line
  const [timerType, setTimerType] = useState(null); // 'cooldown_3s', 'playing_10s', 'afk_5s'
  const [timerPercent, setTimerPercent] = useState(100);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const timerIntervalRef = useRef(null);

  // Chat State
  const [chatTab, setChatTab] = useState('general'); // 'private', 'opponent', 'general'
  const [chatMessages, setChatMessages] = useState([
    { id: 1, sender: 'TOMATOBOOM', text: 'HAY BRUDAS', time: '01:22', color: 'pink', tab: 'general', likes: 0 },
    { id: 2, sender: 'ARUTATOTOMA', text: 'HAY', time: '01:23', color: 'green', tab: 'general', likes: 2 },
    { id: 3, sender: 'ARUTATOTOMA', text: 'WHAT IS THIS?', time: '01:24', color: 'green', tab: 'general', likes: 0 },
    { id: 4, sender: 'BUMBARUMBA', text: 'ARUTATOTOMA: WE EARN MONEY HERE BRADA', time: '01:24', color: 'blue', tab: 'general', likes: 5 },
    { id: 5, sender: 'ARUTATOTOMA', text: 'HUH NICE HOW?', time: '01:25', color: 'green', tab: 'general', likes: 1 },
  ]);

  // Online Users
  const [usersInRoom, setUsersInRoom] = useState([
    { name: 'Hakuna matata', rating: '2,324', isPlaying: true, avatar: '✊' },
    { name: 'TOMATOBOOM', rating: '1,942', isPlaying: false, avatar: '✋' },
    { name: 'ARUTATOTOMA', rating: '2,110', isPlaying: false, avatar: '✌️' },
    { name: 'BUMBARUMBA', rating: '2,504', isPlaying: false, avatar: '✊' },
    { name: 'BANABOANZA', rating: '2,204', isPlaying: true, avatar: '✋' },
  ]);

  // Connect / Disconnect Wallet
  const connectWallet = () => {
    setWalletConnected(true);
    setWalletAddress('Haku...324');
    setSolBalance(47.0);
    setRpsRating(2324);
  };

  const disconnectWallet = () => {
    setWalletConnected(false);
    setWalletAddress('');
    setActiveView('lobby');
    clearTimer();
  };

  // Clear running timer
  const clearTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimerType(null);
    setTimerPercent(100);
  };

  // Start smooth progress timer
  const startTimer = (type, durationSec) => {
    clearTimer();
    setTimerType(type);
    setTimerRemaining(durationSec);
    setTimerPercent(100);

    const totalMs = durationSec * 1000;
    let msPassed = 0;

    timerIntervalRef.current = setInterval(() => {
      msPassed += 100;
      const pct = Math.max(0, 100 - (msPassed / totalMs) * 100);
      setTimerPercent(pct);
      setTimerRemaining(Math.ceil((totalMs - msPassed) / 1000));

      if (msPassed >= totalMs) {
        clearTimer();
        handleTimerEnd(type);
      }
    }, 100);
  };

  // Handle timer endings
  const handleTimerEnd = (type) => {
    if (type === 'cooldown_3s') {
      // 3s cooldown finished, start the 10s round selection
      setMatchmakingState('playing_10s');
      setPlayerSelection(null);
      setUserLockedSelection(false);
      startTimer('playing_10s', 10);
    } else if (type === 'playing_10s') {
      // 10s selection finished and player hasn't locked in
      resolveRound('DRAW', true); // AFK Draw
    } else if (type === 'afk_5s') {
      // User failed to click get back to game, kick to lobby
      kickUser();
    }
  };

  // Join Game Room
  const joinRoom = (room) => {
    if (!walletConnected) {
      connectWallet();
    }
    setActiveRoom(room);
    setActiveView('game');
    setMatchmakingState('waiting_for_opponent');
    setUserReady(false);
    setOpponentReady(false);
    setOpponent(null);
    setPlayerScore(0);
    setOpponentScore(0);
    setRoundNum(1);
    setPlayerSelection(null);
    setOpponentSelection(null);
    setUserLockedSelection(false);
    setBattleResult(null);
    clearTimer();

    // Matchmaking connection trigger
    setTimeout(() => {
      setOpponent({
        name: room.type === 'ranked' ? 'BANABOANZA' : 'SHRIMP_SLAYER',
        rank: '23,111',
        rating: '2,204',
        wld: '11/14/20',
        history: ['R', 'S', 'P', 'R', 'R', 'P', 'S', 'S', 'R', 'P']
      });
      setMatchmakingState('opponent_joined');
      setOpponentReady(true); // Opponent is instantly ready, waiting for player
      
      setChatMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'SYSTEM',
        text: `Opponent connected! Waiting for ready check...`,
        time: getFormattedTime(),
        color: 'gray',
        tab: 'opponent',
        likes: 0
      }]);
    }, 2000);
  };

  // Set Player Ready
  const setPlayerReady = () => {
    setUserReady(true);
    setMatchmakingState('cooldown_3s');
    startTimer('cooldown_3s', 3);

    setChatMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'SYSTEM',
      text: `Both players ready! Round ${roundNum} starting in 3 seconds...`,
      time: getFormattedTime(),
      color: 'gray',
      tab: 'opponent',
      likes: 0
    }]);
  };

  // Lock in selection instantly upon clicking Rock, Paper, or Scissors
  const makeMove = (selection) => {
    if (matchmakingState !== 'playing_10s' || userLockedSelection) return;

    setUserLockedSelection(true);
    setPlayerSelection(selection);
    clearTimer(); // Stop the 10s select timer

    // Resolve after 600ms simulated network delay
    setTimeout(() => {
      resolveRound(selection, false);
    }, 600);
  };

  // Resolve round payouts and states
  const resolveRound = (playerMove, userAFK = false) => {
    clearTimer();

    if (userAFK) {
      // User went AFK
      setBattleResult('draw');
      setPlayerSelection(null);
      setOpponentSelection(null);
      setMatchmakingState('afk_user');
      startTimer('afk_5s', 5);

      setChatMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ARENA BOT',
        text: `Match is draw. Hakuna matata did not select a symbol.`,
        time: getFormattedTime(),
        color: 'gray',
        tab: 'opponent',
        likes: 0
      }]);
      return;
    }

    // Normal play resolution
    const moves = ['R', 'P', 'S'];
    const opponentMove = moves[Math.floor(Math.random() * 3)];
    setPlayerSelection(playerMove);
    setOpponentSelection(opponentMove);

    let result = 'draw';
    if (playerMove === opponentMove) {
      result = 'draw';
    } else if (
      (playerMove === 'R' && opponentMove === 'S') ||
      (playerMove === 'P' && opponentMove === 'R') ||
      (playerMove === 'S' && opponentMove === 'P')
    ) {
      result = 'win';
      setPlayerScore(prev => prev + 1);
    } else {
      result = 'loss';
      setOpponentScore(prev => prev + 1);
    }

    setBattleResult(result);
    setMatchmakingState('round_resolved');

    // Update histories
    setPlayerHistory(prev => [playerMove, ...prev.slice(0, 9)]);
    setOpponentHistory(prev => [opponentMove, ...prev.slice(0, 9)]);

    // Send round details in chat
    const chatMsg = {
      id: Date.now(),
      sender: 'ARENA BOT',
      text: `Round ${roundNum}: You played ${getWordFromMove(playerMove)} vs Opponent ${getWordFromMove(opponentMove)}. Result: ${result.toUpperCase()}`,
      time: getFormattedTime(),
      color: 'gray',
      tab: 'opponent',
      likes: 0
    };

    const opponentReactions = {
      win: ['gg!', 'Calculated.', 'Boom!', 'Yes!', 'Nice hand'],
      loss: ['unlucky...', 'Ah, no way!', 'Wait, what?', 'Nice prediction', 'oof'],
      draw: ['close', 'again!', 'draw haha', 'mind reader', 'hmm']
    };

    const reactionText = opponentReactions[result][Math.floor(Math.random() * opponentReactions[result].length)];
    const oppMsg = {
      id: Date.now() + 1,
      sender: opponent?.name || 'BANABOANZA',
      text: reactionText,
      time: getFormattedTime(),
      color: 'pink',
      tab: 'opponent',
      likes: 0
    };

    setTimeout(() => {
      setChatMessages(prev => [...prev, chatMsg, oppMsg]);
    }, 500);

    // Queue next round
    setTimeout(() => {
      setRoundNum(prev => prev + 1);
      setPlayerSelection(null);
      setOpponentSelection(null);
      setUserLockedSelection(false);
      setBattleResult(null);
      
      // INSTANTLY START NEXT ROUND (10s timer), bypassing 3s countdown
      setMatchmakingState('playing_10s');
      startTimer('playing_10s', 10);
    }, 3500);
  };

  // Skip Opponent (Simulating Opponent went AFK and got kicked)
  const triggerOpponentAFK = () => {
    clearTimer();
    setMatchmakingState('afk_opponent');
    
    setChatMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'SYSTEM',
      text: `${opponent?.name || 'BANABOANZA'} went AFK and was kicked from the room.`,
      time: getFormattedTime(),
      color: 'gray',
      tab: 'opponent',
      likes: 0
    }]);
  };

  // Resume play after user warning
  const getBackToGame = () => {
    clearTimer();
    // After returning from warning, start play timer instantly (no 3s count)
    setMatchmakingState('playing_10s');
    startTimer('playing_10s', 10);
  };

  // Kick to Lobby
  const kickUser = () => {
    clearTimer();
    setActiveView('lobby');
    setActiveRoom(null);
    setOpponent(null);
    alert("You were kicked from the room for being AFK.");
  };

  const leaveRoom = () => {
    clearTimer();
    setActiveView('lobby');
    setActiveRoom(null);
    setOpponent(null);
  };

  // Search next room
  const searchAnotherRoom = () => {
    clearTimer();
    setActiveView('lobby');
    setActiveRoom(null);
    setOpponent(null);
  };

  // Wait for next opponent
  const waitNextOpponent = () => {
    clearTimer();
    setMatchmakingState('waiting_for_opponent');
    setUserReady(false);
    setOpponentReady(false);
    setOpponent(null);
    setPlayerScore(0);
    setOpponentScore(0);
    setRoundNum(1);
    setPlayerSelection(null);
    setOpponentSelection(null);
    setUserLockedSelection(false);
    setBattleResult(null);

    setTimeout(() => {
      setOpponent({
        name: 'GUKA_MAN',
        rank: '12,504',
        rating: '2,912',
        wld: '34/22/19',
        history: ['S', 'P', 'R', 'S', 'P', 'R', 'S', 'P', 'R', 'S']
      });
      setMatchmakingState('opponent_joined');
      setOpponentReady(true);
    }, 2000);
  };

  // Create custom room from pop up
  const createCustomRoom = (name, betAmount, password) => {
    const newRoom = {
      id: Date.now(),
      name: name.toUpperCase() + ' ROOM',
      status: password ? 'CLOSE' : 'OPEN',
      players: 2,
      price: parseFloat(betAmount) || 0.05,
      fee: 0.1,
      games: 0,
      password: password || null
    };
    setCustomRooms(prev => [newRoom, ...prev]);
    setCreateRoomModalOpen(false);
  };

  const sendChatMessage = (text) => {
    if (!text.trim()) return;

    const newMsg = {
      id: Date.now(),
      sender: walletConnected ? 'Hakuna matata' : 'ANONYMOUS',
      text: text,
      time: getFormattedTime(),
      color: 'yellow',
      tab: chatTab,
      likes: 0
    };

    setChatMessages(prev => [...prev, newMsg]);
  };

  const likeMessage = (id) => {
    setChatMessages(prev => prev.map(msg => 
      msg.id === id ? { ...msg, likes: msg.likes + 1 } : msg
    ));
  };

  // Helpers
  const getWordFromMove = (m) => {
    if (m === 'R') return 'ROCK';
    if (m === 'P') return 'PAPER';
    if (m === 'S') return 'SCISSORS';
    return '';
  };

  const getFormattedTime = () => {
    const date = new Date();
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  };

  return (
    <GameContext.Provider value={{
      walletConnected,
      walletAddress,
      solBalance,
      rpsRating,
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
