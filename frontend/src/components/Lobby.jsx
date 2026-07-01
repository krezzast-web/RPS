import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import SolanaIcon from './SolanaIcon';

export default function Lobby() {
  const {
    joinRoom,
    customRooms,
    topRanks,
    giveaways,
    lobbyStats,
    roomTiers,
    walletConnected,
    walletAddress,
    connectWallet,
    authFetch,
    triggerToast
  } = useGame();

  const [copiedId, setCopiedId] = useState(null);
  const [giveawayHistoryOpen, setGiveawayHistoryOpen] = useState(false);
  const [giveawayHistory, setGiveawayHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [tweetUrls, setTweetUrls] = useState({});
  const [verifying, setVerifying] = useState({});

  // Password protected room join states
  const [passwordPromptRoom, setPasswordPromptRoom] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');

  const handleVerifyShare = async (giveawayId) => {
    if (!walletAddress) { triggerToast('Please connect your wallet first!', 'error'); return; }
    const url = tweetUrls[giveawayId];
    if (!url || !url.trim()) { triggerToast('Please enter a valid tweet URL.', 'error'); return; }
    setVerifying(prev => ({ ...prev, [giveawayId]: true }));
    try {
      const res = await authFetch(`/api/giveaways/${giveawayId}/verify-share`, {
        method: 'POST',
        body: JSON.stringify({ wallet: walletAddress, tweetUrl: url.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      triggerToast('Verification successful! You have entered the giveaway.', 'success');
      setTweetUrls(prev => ({ ...prev, [giveawayId]: '' }));
    } catch (err) {
      triggerToast('Verification failed: ' + err.message, 'error');
    } finally {
      setVerifying(prev => ({ ...prev, [giveawayId]: false }));
    }
  };

  const handleCopyInvite = (id) => {
    navigator.clipboard.writeText(`${window.location.origin}/room/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleJoin = (room) => {
    if (!walletConnected) { connectWallet(); return; }
    if (room.hasPassword) {
      setPasswordPromptRoom(room);
      setPasswordInput('');
    } else {
      joinRoom(room);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordPromptRoom) {
      joinRoom(passwordPromptRoom, passwordInput);
      setPasswordPromptRoom(null);
      setPasswordInput('');
    }
  };

  const handleJoinTier = (tier) => {
    if (!walletConnected) { connectWallet(); return; }
    joinRoom({ id: `tier_${tier.id}_${Date.now()}`, name: tier.title, betSol: parseFloat(tier.bet_sol), feeRate: parseFloat(tier.fee_rate), player1Wallet: '' });
  };

  const formatNumber = (n) => {
    if (!n && n !== 0) return '—';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  const isEndingSoon = (endDate) => {
    if (!endDate) return false;
    const diff = new Date(endDate) - new Date();
    return diff > 0 && diff < 24 * 60 * 60 * 1000;
  };

  const loadGiveawayHistory = async () => {
    if (loadingHistory) return;
    setGiveawayHistoryOpen(true);
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/giveaway-history');
      const data = await res.json();
      setGiveawayHistory(Array.isArray(data) ? data : []);
    } catch {
      setGiveawayHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Use server-driven tiers from DB; fallback to empty during load
  const displayTiers = roomTiers.length > 0 ? roomTiers : [];

  return (
    <div className="lobby-container">

      {/* Lobby Hero Banner */}
      <section className="lobby-hero-banner" aria-label="Welcome Banner">
        <div className="hero-content">
          <div className="hero-badge animate-pulse">
            <span className="badge-dot"></span> Web3 Arena Live
          </div>
          <h1 className="hero-title">
            Challenge players, <br />
            win <span className="text-gradient">solana</span>
          </h1>
          <p className="hero-desc">
            Rpsroom is the ultimate decentralized Rock-Paper-Scissors arena. Connect your wallet, select your stakes, and duel in high-fidelity 3D.
          </p>
          <div className="hero-actions">
            <button className="btn-hero-primary" onClick={() => {
              const rankedTier = displayTiers.find(t => t.is_ranked);
              if (rankedTier) handleJoinTier(rankedTier);
            }}>
              Play Ranked
            </button>
            <button className="btn-hero-secondary" onClick={() => {
              const createBtn = document.querySelector('.sidebar-create-btn');
              if (createBtn) createBtn.click();
            }}>
              Create Custom Room
            </button>
          </div>
        </div>
        
        {/* Floating cards / Stats visual inside Hero */}
        <div className="hero-visual">
          <div className="hero-stat-card">
            <span className="hero-stat-label">Total Volume</span>
            <span className="hero-stat-value" style={{ display: 'inline-flex', alignItems: 'center' }}>
              <SolanaIcon size={14} style={{ marginRight: '6px' }} />
              {parseFloat(lobbyStats.poolSol || 0).toFixed(2)} SOL
            </span>
          </div>
          <div className="hero-stat-card featured">
            <span className="hero-stat-label">Weekly Winner</span>
            <span className="hero-stat-value text-gradient">{topRanks[0]?.name || 'ADIOS MIOS'}</span>
          </div>
          <div className="hero-stat-card">
            <span className="hero-stat-label">Active Rooms</span>
            <span className="hero-stat-value">{formatNumber(lobbyStats.rooms || 0)} Live</span>
          </div>
          {/* Subtle background glow graphics */}
          <div className="hero-glow-shape circle"></div>
          <div className="hero-glow-shape triangle"></div>
        </div>
      </section>

      {/* Global Live Stats Bar Ticker */}
      <section className="lobby-stats-ticker" aria-label="Live Statistics">
        <div className="ticker-item">
          <span className="ticker-dot"></span>
          <span className="ticker-label">Connected Wallets:</span>
          <span className="ticker-val">{formatNumber(lobbyStats.wallets)}</span>
        </div>
        <div className="ticker-item">
          <span className="ticker-dot"></span>
          <span className="ticker-label">Total Matches Played:</span>
          <span className="ticker-val">{formatNumber(lobbyStats.matches)}</span>
        </div>
        <div className="ticker-item">
          <span className="ticker-dot"></span>
          <span className="ticker-label">Active Giveaways:</span>
          <span className="ticker-val">{formatNumber(lobbyStats.giveaways)} Live</span>
        </div>
      </section>

      {/* Room Tiers Section */}
      <div className="room-tiers-section" id="room-tiers-row">
        {displayTiers.length === 0 ? (
          <div className="room-tiers-loading">Loading rooms…</div>
        ) : (
          <div className="room-tiers-row">
            {displayTiers.map((tier) => {
              const chartData = tier.chart_data || [0,0,0,0,0,0,0,0,0,0];
              const maxVal = Math.max(...chartData, 1);
              return (
                <div
                  key={tier.id}
                  className={`room-card ${tier.is_ranked ? 'ranked' : ''}`}
                  id={`room-card-${tier.id}`}
                >
                  <div className="room-card-header">
                    <div>
                      <div className="room-type">{tier.is_ranked ? 'Ranked' : 'Casual'}</div>
                      <h3 className="room-title">{tier.title}</h3>
                    </div>
                  </div>

                  <div className="mini-chart-container" aria-label="Room Activity Chart">
                    {chartData.map((h, i) => (
                      <div 
                        key={i} 
                        className="chart-bar" 
                        style={{ height: `${h > 0 ? Math.max((h / maxVal) * 100, 15) : 0}%` }} 
                        title={`${h} games`} 
                      />
                    ))}
                  </div>

                  <div className="room-card-stats">
                    <div className="card-stat">
                      <span className="card-stat-label">Players</span>
                      <strong className="card-stat-value">{tier.active_players || 0}</strong>
                    </div>
                    <div className="card-stat">
                      <span className="card-stat-label">Bet</span>
                      <strong className="card-stat-value" style={{ display: 'flex', alignItems: 'center', color: 'var(--accent-color)' }}>
                        <SolanaIcon size={10} style={{ marginRight: '2px' }} />
                        {parseFloat(tier.bet_sol).toFixed(2)}
                      </strong>
                    </div>
                    <div className="card-stat">
                      <span className="card-stat-label">Fee</span>
                      <strong className="card-stat-value">{(parseFloat(tier.fee_rate) * 100).toFixed(0)}%</strong>
                    </div>
                    <div className="card-stat">
                      <span className="card-stat-label">Games</span>
                      <strong className="card-stat-value">{tier.games_played || 0}</strong>
                    </div>
                  </div>

                  <button
                    className="btn-play-card"
                    onClick={() => handleJoinTier(tier)}
                  >
                    {tier.is_ranked ? 'PLAY RANKED' : 'PLAY NOW'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom Panel: Custom Rooms | Leaderboard | Giveaways ── */}
      <div className="lobby-bottom-grid" id="bottom-panel">

        {/* Custom Rooms */}
        <div className="bottom-panel" id="custom-rooms">
          <div className="panel-header">
            <div className="panel-title-group">
              <span className="panel-subtitle">Friends &amp; Streamers</span>
              <span className="panel-title">Custom Rooms</span>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              {customRooms.length} open
            </span>
          </div>

          <div className="custom-rooms-list">
            {customRooms.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No custom rooms. Be the first to create one!
              </div>
            ) : (
              customRooms.map((room) => (
                <div key={room.id} className="custom-room-row">
                  <div className="custom-room-left">
                    <span className={`custom-room-status ${room.status === 'OPEN' ? 'open' : 'close'}`}>
                      {room.status === 'OPEN' ? '● OPEN' : '● IN GAME'}
                    </span>
                    <span className="custom-room-name">{room.name}</span>
                  </div>
                  <div className="custom-room-metrics">
                    <div className="metric-col">
                      <span className="metric-lbl">Bet</span>
                      <span className="metric-val" style={{ color: 'var(--accent-color)', display: 'inline-flex', alignItems: 'center' }}><SolanaIcon size={10} style={{ marginRight: '4px' }} /> {parseFloat(room.betSol || 0).toFixed(3)} SOL</span>
                    </div>
                    <div className="metric-col">
                      <span className="metric-lbl">Players</span>
                      <span className="metric-val">{room.players || 1}/2</span>
                    </div>
                    {room.status === 'OPEN' && (
                      <button
                        className="btn-play-action"
                        onClick={() => handleJoin(room)}
                        id={`join-btn-${room.id}`}
                      >
                        JOIN
                      </button>
                    )}
                    <button
                      className="btn-invite-copy"
                      onClick={() => handleCopyInvite(room.id)}
                      title="Copy invite link"
                    >
                      {copiedId === room.id ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="bottom-panel" id="top-ranks">
          <div className="panel-header">
            <div className="panel-title-group">
              <span className="panel-subtitle">By ELO Rating</span>
              <span className="panel-title" id="top-ranks-title">Top Players</span>
            </div>
          </div>

          <div className="leaderboard-list">
            {topRanks.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No ranked players yet. Play to get on the board!
              </div>
            ) : (
              topRanks.map((player) => (
                <div key={player.id} className="leaderboard-row">
                  <span className="leaderboard-rank">#{player.id}</span>
                  <div className="leaderboard-user">
                    <span className="leaderboard-username">{player.name}</span>
                    <span className="leaderboard-rps-score">{player.wins}W · {player.draws}D · {player.losses}L · ELO {player.rating}</span>
                  </div>
                  <span className="leaderboard-earnings" style={{ display: 'inline-flex', alignItems: 'center' }}><SolanaIcon size={10} style={{ marginRight: '4px' }} /> {parseFloat(player.solBalance || 0).toFixed(3)} SOL</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Giveaways */}
        <div className="bottom-panel" id="giveaways">
          <div className="panel-header">
            <div className="panel-title-group">
              <span className="panel-subtitle">From Platform Fees</span>
              <span className="panel-title">Giveaways</span>
            </div>
            <button className="giveaway-view-btn" onClick={loadGiveawayHistory}>
              History
            </button>
          </div>

          {/* Pool Summary */}
          <div className="giveaway-stats-summary">
            <div className="giveaway-pool">
              <span className="pool-amount" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <SolanaIcon size={12} style={{ marginRight: '4px' }} /> {parseFloat(lobbyStats.poolSol || 0).toFixed(4)} SOL
              </span>
            </div>
            <div className="giveaway-winner-info">
              <span className="winner-amount-label">Active</span>
              <span className="winner-count">{lobbyStats.giveaways || 0}</span>
            </div>
          </div>

          {/* Active Giveaways */}
          <div style={{ padding: '12px', background: '#1D1D1D', border: '1px solid #333333', fontSize: '10.5px', color: 'var(--text-secondary)', lineHeight: '1.4', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
            <strong style={{ color: 'var(--accent-color)', textTransform: 'uppercase', fontSize: '9.5px', letterSpacing: '0.5px' }}>Giveaway Info & Rules</strong>
            <div>• <strong>Funding:</strong> 30% of all match fees are fed into the pool.</div>
            <div>• <strong>Eligibility:</strong> Connect Twitter (X) and submit your verified platform share tweet link below to qualify!</div>
            <div>• <strong>Bot Verification:</strong> Our bot checks your tweet text to ensure it contains our platform link and matches your linked username.</div>
          </div>

          <div className="giveaway-list">
            {giveaways.length === 0 ? (
               <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                 No active giveaways. Check back soon!
               </div>
            ) : (
              giveaways.map((gw) => (
                <div key={gw.id} className="giveaway-row" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', border: '1px solid #333333', background: '#1D1D1D', marginBottom: '8px' }}>
                  <div className="giveaway-info" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="giveaway-title" style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text-primary)' }}>
                      {isEndingSoon(gw.end_date) && <span style={{ color: '#f87171', marginRight: '4px' }}>[ENDING SOON] </span>}
                      {gw.title}
                    </span>
                    <span className="giveaway-meta" style={{ display: 'inline-flex', alignItems: 'center', fontSize: '9.5px', color: 'var(--text-muted)' }}>
                      <SolanaIcon size={8} style={{ marginRight: '4px' }} /> {parseFloat(gw.prize_sol || 0).toFixed(4)} SOL · {gw.winner_count} winner{gw.winner_count > 1 ? 's' : ''}
                      {gw.end_date_formatted && ` · Ends ${gw.end_date_formatted}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just entered the ${gw.title} giveaway on rps.flappycat.fun! Join the ultimate RPS room, link your wallet, and play to win SOL! #Rpsroom #Solana`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-connect-wallet"
                      style={{ padding: '0 8px', height: '24px', fontSize: '8.5px', background: '#1DA1F2', color: '#FFF', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
                    >
                      SHARE ON X
                    </a>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Paste post URL here"
                      value={tweetUrls[gw.id] || ''}
                      onChange={(e) => setTweetUrls(prev => ({ ...prev, [gw.id]: e.target.value }))}
                      style={{ flex: 1, height: '24px', fontSize: '9px', padding: '0 6px', background: '#1D1D1D', border: '1px solid #333333', color: '#FFF' }}
                    />
                    <button
                      onClick={() => handleVerifyShare(gw.id)}
                      disabled={verifying[gw.id]}
                      className="btn-connect-wallet"
                      style={{ padding: '0 8px', height: '24px', fontSize: '8.5px', background: 'var(--accent-color)', color: '#000', border: 'none', whiteSpace: 'nowrap' }}
                    >
                      {verifying[gw.id] ? 'VERIFYING...' : 'VERIFY & ENTER'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Giveaway History Modal */}
          {giveawayHistoryOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setGiveawayHistoryOpen(false)}>
              <div style={{ background: '#1D1D1D', border: '1px solid #333333', borderRadius: '12px', width: '420px', maxWidth: '95vw', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #333333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '14px', textTransform: 'uppercase' }}>Giveaway Winners History</span>
                  <button style={{ background: 'none', border: 'none', color: '#666', fontSize: '18px', cursor: 'pointer' }} onClick={() => setGiveawayHistoryOpen(false)}>×</button>
                </div>
                <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
                  {loadingHistory ? (
                    <div style={{ textAlign: 'center', color: '#555', padding: '20px' }}>Loading…</div>
                  ) : !giveawayHistory?.length ? (
                    <div style={{ textAlign: 'center', color: '#555', padding: '20px', fontSize: '13px' }}>No winners yet.</div>
                  ) : (
                    giveawayHistory.map((w, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1e1e1e' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>{w.username}</div>
                          <div style={{ fontSize: '10px', color: '#555' }}>{w.title} · {w.date}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: 'var(--accent-color)', fontWeight: 700, fontFamily: 'Outfit, sans-serif', display: 'inline-flex', alignItems: 'center' }}><SolanaIcon size={11} style={{ marginRight: '4px' }} /> {parseFloat(w.sol_won || 0).toFixed(4)} SOL</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Password Prompt Modal for Custom Rooms */}
          {passwordPromptRoom && (
            <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => setPasswordPromptRoom(null)}>
              <div className="modal-card" style={{ width: '320px', padding: '20px' }} onClick={e => e.stopPropagation()}>
                <div className="modal-card-header" style={{ marginBottom: '15px' }}>
                  <h3 className="modal-card-title" style={{ fontSize: '13px' }}>Password Required</h3>
                  <button className="modal-close-btn" style={{ fontSize: '16px' }} onClick={() => setPasswordPromptRoom(null)}>×</button>
                </div>
                <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>Enter Room Password</label>
                    <input
                      type="password"
                      className="form-input"
                      style={{ height: '32px', fontSize: '12px' }}
                      placeholder="Room Password"
                      value={passwordInput}
                      onChange={e => setPasswordInput(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <button type="submit" className="btn-modal-submit" style={{ height: '32px', fontSize: '11px', fontWeight: 700 }}>
                    JOIN GAME
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
