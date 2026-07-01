import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';

export default function GameRoom() {
  const {
    walletAddress,
    username,
    rpsRating,
    playerWins,
    playerLosses,
    playerDraws,
    activeRoom,
    matchmakingState,
    userReady,
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
    leaveRoom,
    setPlayerReady,
    makeMove,
    triggerOpponentAFK,
    getBackToGame,
    searchAnotherRoom,
    waitNextOpponent,
    sendChatMessage,
    likeMessage,
    // Custom UX actions
    triggerToast,
    triggerConfirm,
    authFetch
  } = useGame();

  const [inputVal, setInputVal] = useState('');
  const [copiedType, setCopiedType] = useState(null); // 'player' or 'opponent'
  const [copiedInvite, setCopiedInvite] = useState(false);
  const chatBottomRef = useRef(null);

  // Local selection flow (selection needs manual confirmation before lock)
  const [localSelection, setLocalSelection] = useState(null);

  // Reset local selection when round starts
  useEffect(() => {
    setLocalSelection(null);
  }, [roundNum]);

  // Set chatTab safely if private tab is selected but removed
  useEffect(() => {
    if (chatTab === 'private') {
      setChatTab('opponent');
    }
  }, [chatTab, setChatTab]);

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(`https://rpsroom.io/room/${activeRoom?.id || 'custom'}`);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 1500);
  };

  // Automatically scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatTab]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    sendChatMessage(inputVal);
    setInputVal('');
  };

  const copyWalletAddress = (addr, type) => {
    navigator.clipboard.writeText(addr);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 1500);
  };

  // Helper to render hands emojis based on selection and state
  const getHandEmoji = (selection) => {
    if (matchmakingState === 'cooldown_3s') {
      return 'READY';
    }
    if (matchmakingState === 'playing_10s') {
      return 'CHOOSING';
    }
    if (matchmakingState === 'round_resolved' && selection) {
      if (selection === 'R') return 'ROCK';
      if (selection === 'P') return 'PAPER';
      if (selection === 'S') return 'SCISSORS';
    }
    return 'WAITING';
  };

  const getMoveIcon = (move) => {
    if (move === 'R') return 'circle';
    if (move === 'P') return 'square';
    if (move === 'S') return 'triangle';
    return 'star';
  };

  const handleSkip = () => {
    triggerOpponentAFK();
  };

  const handleBlock = () => {
    if (!opponent) return;
    triggerConfirm(
      `Are you sure you want to block player ${opponent.name}? You will not be matched again.`,
      async () => {
        try {
          const res = await authFetch(`/api/players/${opponent.wallet}/block`, { method: 'POST' });
          if (res.ok) {
            triggerToast(`Blocked player ${opponent.name}.`, 'success');
            leaveRoom();
          } else {
            triggerToast('Failed to block player.', 'error');
          }
        } catch (e) {
          console.error('Block player failed:', e);
          triggerToast('Error blocking player.', 'error');
        }
      },
      () => {}
    );
  };

  const handleReport = () => {
    if (!opponent) return;
    triggerConfirm(
      `Report player ${opponent.name} for unsportsmanlike behavior?`,
      async () => {
        try {
          const res = await authFetch(`/api/players/${opponent.wallet}/report`, {
            method: 'POST',
            body: JSON.stringify({ reason: 'Reported during match' })
          });
          if (res.ok) {
            triggerToast(`Reported player ${opponent.name}. Our staff will review this match.`, 'success');
          } else {
            triggerToast('Failed to submit report.', 'error');
          }
        } catch (e) {
          console.error('Report player failed:', e);
          triggerToast('Error submitting report.', 'error');
        }
      },
      () => {}
    );
  };

  // Filter messages based on active tab
  const filteredMessages = chatMessages.filter(msg => {
    if (chatTab === 'general') return msg.tab === 'general' || msg.tab === 'opponent';
    return msg.tab === 'opponent'; // no private tab logic
  });

  return (
    <div className="gameroom-grid">
      {/* Main Game Screen Column */}
      <div className="gameroom-main-col">
        {/* Top green progress timer bar */}
        {timerType && (
          <div className="timer-bar-container">
            <div className="timer-bar-fill" style={{ width: `${timerPercent}%` }}></div>
          </div>
        )}

        {/* Controls Header */}
        <section className="game-controls-header" aria-label="Game Room Info">
          <div className="game-header-meta">
            <div className="game-meta-item">
              <span className="game-meta-label">Public Room</span>
              <span className="game-meta-val">{activeRoom?.title || 'Ranked Room'}</span>
            </div>
            <div className="game-meta-item">
              <span className="game-meta-label">Bet</span>
              <span className="game-meta-val">{parseFloat(activeRoom?.betSol || 0).toFixed(3)} SOL</span>
            </div>
            <div className="game-meta-item">
              <span className="game-meta-label">Fee</span>
              <span className="game-meta-val">{(parseFloat(activeRoom?.feeRate || 0) * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div className="game-actions-group">
            <button className="game-action-btn" onClick={leaveRoom}>Leave</button>
            {(activeRoom?.id === 'custom' || activeRoom?.type === 'custom' || activeRoom?.name?.includes('ROOM')) && (
              <button className="game-action-btn" onClick={handleCopyInvite} style={{ position: 'relative' }}>
                Copy Invite
                {copiedInvite && <span className="copy-tooltip">Copied!</span>}
              </button>
            )}
            <button className="game-action-btn" onClick={handleSkip} disabled={matchmakingState !== 'playing_10s' && matchmakingState !== 'opponent_joined'}>
              Skip Opponent
            </button>
            <button className="game-action-btn" onClick={handleBlock} disabled={!opponent}>Block</button>
            <button className="game-action-btn" onClick={handleReport} disabled={!opponent}>Report</button>
          </div>
        </section>

        {/* Players VS Cards Panel */}
        <section className="match-vs-panel" aria-label="Players Information">
          {/* Player (You) Card */}
          <div className="player-card you">
            <div className="player-card-header">
              <span className="player-card-role">You</span>
              <div className="player-name-row">
                <span className="player-card-name">{username}</span>
                <span className="player-rank-badge">{rpsRating} RPS</span>
              </div>
            </div>
            {/* User wallet and copy button */}
            <div className="player-wallet-row">
              <span className="player-wallet-addr">
                {walletAddress ? `${walletAddress.substring(0, 4)}...${walletAddress.substring(walletAddress.length - 3)}` : 'Haku...324'}
              </span>
              <button className="wallet-copy-btn" onClick={() => copyWalletAddress(walletAddress || '', 'player')} title="Copy wallet address">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                {copiedType === 'player' && <span className="copy-tooltip">Copied!</span>}
              </button>
            </div>
            <div className="player-card-stats">
              <div className="player-card-wld-row">
                <div className="wld-badge-item">
                  <span className="wld-badge win">W</span>
                  <span className="wld-badge-val">{playerWins}</span>
                </div>
                <div className="wld-badge-item">
                  <span className="wld-badge draw">D</span>
                  <span className="wld-badge-val">{playerDraws}</span>
                </div>
                <div className="wld-badge-item">
                  <span className="wld-badge loss">L</span>
                  <span className="wld-badge-val">{playerLosses}</span>
                </div>
              </div>
            </div>
            <div className="player-games-history">
              <span className="history-label">Last Games</span>
              {playerHistory.slice(0, 10).map((move, i) => (
                <span key={i} className={`history-badge ${move}`} title={move}>
                  {move}
                </span>
              ))}
            </div>
          </div>

          {/* Opponent Card */}
          <div className="player-card opponent">
            {matchmakingState === 'waiting_for_opponent' ? (
              <div className="player-card-header" style={{ justifyContent: 'center', height: '100%' }}>
                <span className="player-card-name" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  WAITING FOR OPPONENT...
                </span>
              </div>
            ) : opponent ? (
              <>
                <div className="player-card-header">
                  <span className="player-card-role">Opponent</span>
                  <div className="player-name-row">
                    <span className="player-card-name">{opponent.name}</span>
                    <span className="player-rank-badge">{opponent.rating} RPS</span>
                  </div>
                </div>
                {/* Opponent wallet and copy button */}
                <div className="player-wallet-row">
                  <span className="player-wallet-addr">
                    {opponent.wallet
                      ? `${opponent.wallet.substring(0, 4)}...${opponent.wallet.substring(opponent.wallet.length - 3)}`
                      : '???'}
                  </span>
                  <button className="wallet-copy-btn" onClick={() => copyWalletAddress(opponent.wallet || '', 'opponent')} title="Copy wallet address">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    {copiedType === 'opponent' && <span className="copy-tooltip">Copied!</span>}
                  </button>
                </div>
                <div className="player-card-stats">
                  <div className="player-card-wld-row">
                    <div className="wld-badge-item">
                      <span className="wld-badge win">W</span>
                      <span className="wld-badge-val">{opponent.wins}</span>
                    </div>
                    <div className="wld-badge-item">
                      <span className="wld-badge draw">D</span>
                      <span className="wld-badge-val">{opponent.draws}</span>
                    </div>
                    <div className="wld-badge-item">
                      <span className="wld-badge loss">L</span>
                      <span className="wld-badge-val">{opponent.losses}</span>
                    </div>
                  </div>
                </div>
                <div className="player-games-history">
                  <span className="history-label">Last Games</span>
                  {opponentHistory.slice(0, 10).map((move, i) => (
                    <span key={i} className={`history-badge ${move}`} title={move}>
                      {move}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="player-card-header" style={{ justifyContent: 'center', height: '100%' }}>
                <span className="player-card-name" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  SEARCHING FOR OPPONENT
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Battle Arena Visualization */}
        <section className="battle-arena" aria-label="Combat Arena">
          {/* User Warning AFK Popup */}
          {matchmakingState === 'afk_user' && (
            <div className="afk-warning-overlay">
              <div className="afk-warning-card">
                <h3 className="afk-card-title">AFK WARNING</h3>
                <p className="afk-card-text">You didn't select a symbol! You will be kicked in {timerRemaining} seconds.</p>
                <div className="afk-card-actions">
                  <button className="afk-btn return" onClick={getBackToGame}>Get Back to Game</button>
                  <button className="afk-btn leave" onClick={leaveRoom}>Leave Room</button>
                </div>
              </div>
            </div>
          )}

          {/* Opponent AFK Popup */}
          {matchmakingState === 'afk_opponent' && (
            <div className="afk-warning-overlay">
              <div className="afk-warning-card">
                <h3 className="afk-card-title">OPPONENT WENT AFK</h3>
                <p className="afk-card-text">The opponent was inactive and got kicked from the room.</p>
                <div className="afk-card-actions">
                  <button className="afk-btn return" onClick={waitNextOpponent}>Wait for Next Opponent</button>
                  <button className="afk-btn leave" onClick={searchAnotherRoom}>Search Another Room</button>
                </div>
              </div>
            </div>
          )}

          {matchmakingState === 'waiting_for_opponent' ? (
            <div className="matchmaking-loader">
              <div className="loader-pulse-ring"></div>
              <p className="loader-text">WAITING FOR AN OPPONENT</p>
              <p className="loader-subtext">Searching pools...</p>
            </div>
          ) : matchmakingState === 'opponent_joined' ? (
            <div className="ready-check-section">
              <h3 className="ready-check-title">MATCH FOUND!</h3>
              <p className="ready-check-subtitle">Please confirm you're ready</p>
              {!userReady ? (
                <button className="btn-ready-check" onClick={setPlayerReady}>READY</button>
              ) : (
                <p className="ready-status-text animate-pulse">WAITING FOR OPPONENT...</p>
              )}
            </div>
          ) : (
            <>
              {/* Game Viewport (cooldown_3s, playing_10s, round_resolved) */}
              <div className="arena-stage">
                {/* Left Hand (You) */}
                <div className="arena-player-side">
                  <div className={`hand-visual-container ${matchmakingState === 'cooldown_3s' ? 'shake-left' : ''}`}>
                    <div className="hand-emoji-fallback">
                      {getHandEmoji(playerSelection)}
                    </div>
                  </div>
                  <span className="arena-status-label">
                    {matchmakingState === 'cooldown_3s' ? 'WAITING' : 
                     matchmakingState === 'playing_10s' ? (userLockedSelection ? 'LOCKED' : 'CHOOSING...') : 
                     playerSelection ? 'READY' : 'WAITING'}
                  </span>
                </div>

                {/* Status HUD Block */}
                <div className="arena-center-block">
                  <span className="arena-round">Round {roundNum}</span>
                  <div className="arena-score">
                    <span className="score-you">{playerScore}</span>
                    <span className="score-divider">-</span>
                    <span className="score-opponent">{opponentScore}</span>
                  </div>
                  {matchmakingState === 'cooldown_3s' && (
                    <span className="arena-countdown">{timerRemaining}</span>
                  )}
                  {matchmakingState === 'playing_10s' && (
                    <span className="arena-countdown" style={{ fontSize: '32px', color: timerRemaining <= 3 ? 'var(--color-loss)' : 'var(--text-primary)' }}>
                      {timerRemaining}s
                    </span>
                  )}
                </div>

                {/* Right Hand (Opponent) */}
                <div className="arena-player-side">
                  <div className={`hand-visual-container ${matchmakingState === 'cooldown_3s' ? 'shake-right' : ''}`}>
                    <div className="hand-emoji-fallback" style={{ transform: 'scaleX(-1)' }}>
                      {getHandEmoji(opponentSelection)}
                    </div>
                  </div>
                  <span className="arena-status-label">
                    {matchmakingState === 'cooldown_3s' ? 'WAITING' : 
                     matchmakingState === 'playing_10s' ? 'CHOOSING...' : 
                     opponentSelection ? 'READY' : 'WAITING'}
                  </span>
                </div>
              </div>

              {/* Resolution Result Banner */}
              {matchmakingState === 'round_resolved' && battleResult && (
                <div className={`battle-result-banner ${battleResult}`}>
                  {battleResult === 'win' && 'YOU WIN ROUND'}
                  {battleResult === 'loss' && 'OPPONENT WINS ROUND'}
                  {battleResult === 'draw' && 'DRAW ROUND'}
                </div>
              )}
            </>
          )}
        </section>

        {/* Choice Selection Panel with Manual Confirmation */}
        <section className="choice-selection-bar-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', width: '100%', padding: '0 20px 20px' }}>
          <div className="choice-selection-bar" style={{ width: '100%', display: 'flex', gap: '10px' }} aria-label="Make your selection">
            {['R', 'P', 'S'].map((choice) => {
              const label = choice === 'R' ? 'ROCK' : choice === 'P' ? 'PAPER' : 'SCISSORS';
              const isSelected = localSelection === choice;

              return (
                <button
                  key={choice}
                  className={`choice-card-btn ${isSelected ? 'selected' : ''}`}
                  onClick={() => setLocalSelection(choice)}
                  disabled={matchmakingState !== 'playing_10s' || userLockedSelection}
                  aria-label={`Select ${label}`}
                  style={{ flex: 1, border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-color)' }}
                >
                  <div className={`choice-icon ${getMoveIcon(choice)}`}></div>
                  <span className="choice-label">{label}</span>
                </button>
              );
            })}
          </div>

          {localSelection && !userLockedSelection && matchmakingState === 'playing_10s' && (
            <button
              className="btn-modal-submit animate-slide-down"
              onClick={() => makeMove(localSelection)}
              style={{
                width: '100%',
                maxHeight: '44px',
                background: 'var(--accent-color)',
                color: '#000',
                fontWeight: 800,
                fontSize: '12px',
                letterSpacing: '1px',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              CONFIRM SELECTION
            </button>
          )}
        </section>
      </div>

      {/* Chat Column */}
      <div className="gameroom-chat-col">
        <div className="chat-tabs">
          <button 
            className={`chat-tab ${chatTab === 'opponent' ? 'active' : ''}`}
            onClick={() => setChatTab('opponent')}
          >
            Opponent
          </button>
          <button 
            className={`chat-tab ${chatTab === 'general' ? 'active' : ''}`}
            onClick={() => setChatTab('general')}
          >
            General
          </button>
        </div>

        <div className="chat-messages" aria-live="polite">
          {filteredMessages.map((msg) => (
            <div key={msg.id} className="chat-message">
              <div className="message-header">
                <div className="message-sender-group">
                  <span className="message-time">{msg.time}</span>
                  <span 
                    className="message-username"
                    style={{ 
                      color: msg.sender === 'SYSTEM' || msg.sender === 'ARENA BOT' ? 'var(--text-secondary)' : 
                             msg.sender === username ? 'var(--color-you)' : 'var(--color-opponent)'
                    }}
                  >
                    {msg.sender}:
                  </span>
                </div>
                {msg.sender !== 'SYSTEM' && msg.sender !== 'ARENA BOT' && (
                  <button 
                    className={`message-heart-btn ${msg.likes > 0 ? 'liked' : ''}`}
                    onClick={() => likeMessage(msg.id)}
                    aria-label="Like message"
                  >
                    ♥ <span style={{ marginLeft: '2px', fontSize: '9px' }}>{msg.likes}</span>
                  </button>
                )}
              </div>
              <p className="message-content">{msg.text}</p>
            </div>
          ))}
          <div ref={chatBottomRef} />
        </div>

        <form className="chat-input-bar" onSubmit={handleSend}>
          <input
            type="text"
            className="chat-input"
            placeholder="Sends your text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            aria-label="Chat input message"
          />
          <button type="submit" className="chat-send-btn">
            Sends
          </button>
        </form>
      </div>

      {/* Online Users Column */}
      <aside className="gameroom-users-col" aria-labelledby="users-list-title">
        <div className="users-col-header">
          <span className="users-col-subtitle">General</span>
          <h3 className="users-col-title" id="users-list-title">Users in Room</h3>
        </div>
        
        <div className="users-list">
          {usersInRoom.map((user, idx) => (
            <div key={idx} className="user-list-item">
              <div className="user-item-left">
                <div className="user-avatar-fist">{user.avatar}</div>
                <div className="user-item-info">
                  <span className="user-item-name">{user.name}</span>
                  <span className="user-item-rating">RPS: {user.rating}</span>
                </div>
              </div>
              
              <div className={`user-state-icon ${user.isPlaying ? 'active' : ''}`} title={user.isPlaying ? 'Active in match' : 'Spectating'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                </svg>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
