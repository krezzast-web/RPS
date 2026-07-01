import React, { createContext, useState, useContext, useRef, useCallback } from 'react';
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
  const [xUsername, setXUsername] = useState('');
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

  const [usersInRoom] = useState([]);

  // Custom Notifications & Confirmations
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('info'); // 'info' | 'success' | 'error'
  const [showToast, setShowToast] = useState(false);

  const [confirmConfig, setConfirmConfig] = useState(null); // { message, onConfirm, onCancel }

  // Helpers for toast/confirm
  const triggerToast = useCallback((msg, type = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 5000);
  }, []);

  const triggerConfirm = useCallback((message, onConfirm, onCancel) => {
    setConfirmConfig({ message, onConfirm, onCancel });
  }, []);

  // Web Audio Synth Chime
  const playMatchFoundChime = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const playTone = (freq, time, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        osc.start(time);
        osc.stop(time + duration);
      };

      const now = ctx.currentTime;
      playTone(523.25, now, 0.15); // C5
      playTone(659.25, now + 0.12, 0.15); // E5
      playTone(783.99, now + 0.24, 0.4); // G5
    } catch (e) {
      console.warn('Audio chime failed to play', e);
    }
  };

  // Browser tab title flashing
  const titleFlashIntervalRef = useRef(null);
  const flashTabTitle = () => {
    if (document.hasFocus()) return;
    if (titleFlashIntervalRef.current) clearInterval(titleFlashIntervalRef.current);
    let flash = false;
    titleFlashIntervalRef.current = setInterval(() => {
      document.title = flash ? '⚔️ MATCH FOUND! ⚔️' : 'Rpsroom — Play & Win';
      flash = !flash;
    }, 1000);
  };

  // Clear tab title flashing on focus
  React.useEffect(() => {
    const handleFocus = () => {
      if (titleFlashIntervalRef.current) {
        clearInterval(titleFlashIntervalRef.current);
        titleFlashIntervalRef.current = null;
        document.title = 'Rpsroom — Play & Win';
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const socketRef = useRef(null);
  const walletRef = useRef('');
  const tokenRef = useRef(''); // Session JWT for authenticated API calls
  const currentRoomPlayer1WalletRef = useRef('');

  // ─── Auth Fetch Helper ───────────────────────────────────────────────
  const authFetch = useCallback((url, options = {}) => {
    const token = tokenRef.current || localStorage.getItem('rps_wallet_token') || '';
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  }, []);

  // ─── Socket Listeners ────────────────────────────────────────────────
  const setupSocketListeners = (socket) => {
    socket.on('profile_sync', (profile) => {
      setUsername(profile.username);
      setRpsRating(profile.rating);
      setSolBalance(parseFloat(profile.solBalance || 0));
      setCustodialWallet(profile.custodialWallet || '');
      setPlayerWins(profile.wins || 0);
      setPlayerLosses(profile.losses || 0);
      setPlayerDraws(profile.draws || 0);
      setXUsername(profile.xUsername || '');
    });

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

    socket.on('create_room_error', (msg) => {
      triggerToast(`Could not create room: ${msg}`, 'error');
    });

    socket.on('room_sync', (syncData) => {
      setActiveRoom({
        id: syncData.roomId,
        title: syncData.title,
        betSol: syncData.betSol,
        feeRate: syncData.feeRate,
        player1Wallet: syncData.player1.wallet
      });
      currentRoomPlayer1WalletRef.current = syncData.player1.wallet;

      const isPlayer1 = syncData.player1.wallet === walletRef.current;
      const myData = isPlayer1 ? syncData.player1 : syncData.player2;
      const oppData = isPlayer1 ? syncData.player2 : syncData.player1;

      if (myData) {
        setPlayerWins(myData.wins || 0);
        setPlayerLosses(myData.losses || 0);
        setPlayerDraws(myData.draws || 0);
        setPlayerHistory(myData.history || []);
      }

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
      
      // Play sound and flash tab title if opponent joins
      if (syncData.matchmakingState === 'opponent_joined' && matchmakingState === 'waiting_for_opponent') {
        playMatchFoundChime();
        flashTabTitle();
      }

      setMatchmakingState(syncData.matchmakingState);
      setActiveView('game');
    });

    socket.on('room_timeout', ({ message }) => {
      triggerToast(message || 'Room closed due to inactivity.', 'error');
      setActiveView('lobby');
      setActiveRoom(null);
      setOpponent(null);
      setMatchmakingState('waiting_for_opponent');
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

    socket.on('move_error', (msg) => {
      triggerToast(`Move error: ${msg}`, 'error');
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
      triggerToast(`Could not join room: ${err}`, 'error');
      setActiveView('lobby');
      setActiveRoom(null);
    });
  };

  // ─── Initialize socket on mount ─────────────────────────────────────
  React.useEffect(() => {
    const socketUrl = window.location.origin.includes('localhost')
      ? 'http://localhost:5000'
      : window.location.origin;
    const socket = io(socketUrl);
    socketRef.current = socket;

    setupSocketListeners(socket);

    // Auto-reconnect with saved wallet + token
    const savedWallet = localStorage.getItem('rps_wallet_address');
    const savedToken = localStorage.getItem('rps_wallet_token');
    if (savedWallet) {
      walletRef.current = savedWallet;
      tokenRef.current = savedToken || '';
      setWalletAddress(savedWallet);
      setWalletConnected(true);
      socket.emit('join_lobby', savedWallet);
    } else {
      socket.emit('join_lobby', null);
    }

    // Auto-join deep link handler
    const params = new URLSearchParams(window.location.search);
    const deepLinkRoom = params.get('room');
    if (deepLinkRoom && savedWallet) {
      setTimeout(() => {
        socket.emit('join_room', { roomId: deepLinkRoom });
        window.history.replaceState({}, document.title, window.location.pathname);
      }, 1000);
    }

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Wallet Auth — Sign nonce with Phantom ──────────────────────────
  const authenticateWallet = async (provider, pubKey) => {
    try {
      const nonceRes = await fetch(`/api/auth/nonce/${pubKey}`);
      if (!nonceRes.ok) throw new Error('Failed to get auth nonce');
      const { message } = await nonceRes.json();

      const encodedMessage = new TextEncoder().encode(message);
      const result = await provider.signMessage(encodedMessage, 'utf8');
      const signature = result.signature;

      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

      const authRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: pubKey, signature: signatureBase64 })
      });
      const authData = await authRes.json();

      if (!authRes.ok) throw new Error(authData.error || 'Authentication failed');

      const token = authData.token;
      localStorage.setItem('rps_wallet_token', token);
      tokenRef.current = token;
      return token;
    } catch (err) {
      console.error('Wallet authentication failed:', err.message);
      throw err;
    }
  };

  // ─── Connect Wallet ──────────────────────────────────────────────────
  const connectWallet = async () => {
    try {
      const isPhantom = window.solana && window.solana.isPhantom;
      const isSolflare = window.solflare && window.solflare.isSolflare;

      if (!isPhantom && !isSolflare) {
        triggerToast('Solana wallet not found! Redirecting to Phantom setup...', 'error');
        window.open('https://phantom.app', '_blank');
        return;
      }

      const provider = isPhantom ? window.solana : window.solflare;
      const resp = await provider.connect();
      const pubKey = resp.publicKey.toString();

      walletRef.current = pubKey;
      setWalletAddress(pubKey);
      localStorage.setItem('rps_wallet_address', pubKey);

      await authenticateWallet(provider, pubKey);

      setWalletConnected(true);

      if (socketRef.current) {
        socketRef.current.emit('join_lobby', pubKey);
      }
    } catch (err) {
      console.error('Wallet connection failed:', err.message);
      triggerToast('Wallet connection failed: ' + err.message, 'error');
    }
  };

  // ─── Join Room ───────────────────────────────────────────────────────
  const joinRoom = (room, password = '') => {
    if (!walletConnected) { connectWallet(); return; }
    if (!xUsername) {
      triggerToast('Please link your Twitter (X) account first to play!', 'error');
      return;
    }

    setMatchmakingState('waiting_for_opponent');
    setActiveRoom(room);
    setActiveView('game');
    currentRoomPlayer1WalletRef.current = room.player1Wallet || '';

    setTimeout(() => {
      if (socketRef.current) {
        socketRef.current.emit('join_room', { roomId: room.id, password });
      }
    }, 500);
  };

  const joinRoomWithRef = (room, password = '') => joinRoom(room, password);

  // ─── Link X Account ──────────────────────────────────────────────────
  const linkXAccount = async (xUser) => {
    if (!walletAddress) return;
    try {
      const res = await authFetch('/api/wallet/link-x', {
        method: 'POST',
        body: JSON.stringify({ wallet: walletAddress, xUsername: xUser })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setXUsername(data.xUsername);
      triggerToast('Twitter account linked successfully!', 'success');
      return data;
    } catch (err) {
      console.error('X account linking failed:', err.message);
      triggerToast('Failed to link Twitter account: ' + err.message, 'error');
      throw err;
    }
  };

  // ─── Disconnect Wallet ───────────────────────────────────────────────
  const disconnectWallet = () => {
    localStorage.removeItem('rps_wallet_address');
    localStorage.removeItem('rps_wallet_token');
    tokenRef.current = '';
    if (socketRef.current) {
      setWalletConnected(false);
      setWalletAddress('');
      setSolBalance(0);
      setCustodialWallet('');
      setXUsername('');
      setActiveView('lobby');
      setActiveRoom(null);
      walletRef.current = '';
      socketRef.current.emit('join_lobby', null);
    }
  };

  // ─── Game Actions ────────────────────────────────────────────────────
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

  // ─── Chat ────────────────────────────────────────────────────────────
  const sendChatMessage = (text) => {
    if (socketRef.current) {
      const cleanText = String(text || '').trim().slice(0, 300);
      if (!cleanText) return;
      socketRef.current.emit('send_chat', {
        roomId: activeView === 'game' ? activeRoom?.id : null,
        text: cleanText
      });
    }
  };

  const likeMessage = async (id) => {
    setChatMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, likes: msg.likes + 1 } : msg
    ));
    try {
      await authFetch(`/api/messages/${id}/like`, { method: 'POST' });
    } catch (err) {
      console.error('Like failed:', err.message);
    }
  };

  // ─── Create Custom Room ──────────────────────────────────────────────
  const createCustomRoom = (name, betSol, feeRate, password, expirationHours) => {
    if (!xUsername) {
      triggerToast('Please link your Twitter (X) account first to play!', 'error');
      return;
    }
    if (socketRef.current) {
      socketRef.current.emit('create_room', {
        roomName: name,
        betSol,
        feeRate,
        hasPassword: !!password,
        roomPassword: password,
        expirationHours
      });
    }
  };

  // ─── Stub Implementations ────────────────────────────────────────────
  const triggerOpponentAFK = () => {
    triggerToast('Opponent AFK reported.', 'info');
    leaveRoom();
  };

  const getBackToGame = () => {
    setMatchmakingState('playing_10s');
  };

  const kickUser = () => {
    triggerToast('Kick function is admin-only.', 'error');
  };

  const searchAnotherRoom = () => {
    leaveRoom();
  };

  const waitNextOpponent = () => {
    setMatchmakingState('waiting_for_opponent');
    setPlayerSelection(null);
    setOpponentSelection(null);
    setBattleResult(null);
    setUserReady(false);
    setOpponentReady(false);
    if (socketRef.current && activeRoom) {
      socketRef.current.emit('join_room', { roomId: activeRoom.id });
    }
  };

  return (
    <GameContext.Provider value={{
      walletConnected, walletAddress, solBalance, custodialWallet, rpsRating, username, xUsername,
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
      sendChatMessage, likeMessage, linkXAccount,
      authFetch,
      toastMessage, toastType, showToast, triggerToast, setShowToast,
      confirmConfig, triggerConfirm, setConfirmConfig
    }}>
      {children}
    </GameContext.Provider>
  );
};
