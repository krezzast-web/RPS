import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

export default function Lobby() {
  const {
    joinRoom,
    customRooms,
    topRanks,
    giveaways,
    lobbyStats,
    roomTiers,
    walletConnected,
    connectWallet
  } = useGame();

  const [copiedId, setCopiedId] = useState(null);
  const [giveawayHistoryOpen, setGiveawayHistoryOpen] = useState(false);
  const [giveawayHistory, setGiveawayHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleCopyInvite = (id) => {
    navigator.clipboard.writeText(`${window.location.origin}/room/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleJoin = (room) => {
    if (!walletConnected) connectWallet();
    joinRoom(room);
  };

  const handleJoinTier = (tier) => {
    if (!walletConnected) { connectWallet(); return; }
    // Join a public tier room — uses tier ID as room type
    joinRoom({ id: `tier_${tier.id}_${Date.now()}`, name: tier.title, price: parseFloat(tier.bet_chips), fee: parseFloat(tier.fee_rate), player1Wallet: '' });
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

      {/* ── Lobby Stats Banner ── */}
      <div className="lobby-stats" id="lobby-stats">
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label">Wallets</span>
            <span className="stat-value">{formatNumber(lobbyStats.wallets)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Active Rooms</span>
            <span className="stat-value">{formatNumber(lobbyStats.rooms)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Matches</span>
            <span className="stat-value">{formatNumber(lobbyStats.matches)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Giveaways</span>
            <span className="stat-value">{formatNumber(lobbyStats.giveaways)}</span>
          </div>
        </div>

        {/* Giveaway Pool Pill */}
        {parseFloat(lobbyStats.poolSol || 0) > 0 && (
          <div className="pool-live-badge">
            <span className="pool-live-dot"></span>
            <span className="pool-live-label">Prize Pool</span>
            <span className="pool-live-amount">
              {parseFloat(lobbyStats.poolSol).toFixed(3)} SOL
            </span>
          </div>
        )}
      </div>

      {/* ── Room Tiers (Full Width) ── */}
      <div className="room-tiers-section" id="room-tiers-row">
        {displayTiers.length === 0 ? (
          <div className="room-tiers-loading">Loading rooms…</div>
        ) : (
          <div className="room-tiers-row">
            {displayTiers.map((tier) => (
              <div
                key={tier.id}
                className={`room-card ${tier.is_ranked ? 'ranked' : ''}`}
                id={`room-card-${tier.id}`}
              >
                <div className="room-card-header">
                  <div>
                    <div className="room-type">{tier.is_ranked ? '⭐ Ranked' : 'Casual'}</div>
                    <div className="room-title">{tier.title}</div>
                  </div>
                  {tier.is_ranked && (
                    <div className="ranked-badge">RANK</div>
                  )}
                </div>

                <div className="mini-chart-container">
                  {[40, 60, 35, 80, 55, 70, 45, 90, 50, 65].map((h, i) => (
                    <div key={i} className="chart-bar" style={{ height: `${h}%` }} />
                  ))}
                </div>

                <div className="room-card-stats">
                  <div className="card-stat">
                    <span className="card-stat-label">Bet</span>
                    <span className="card-stat-value" style={{ color: 'var(--accent-color)', fontWeight: 700 }}>
                      ⬡ {parseFloat(tier.bet_chips).toLocaleString()}
                    </span>
                  </div>
                  <div className="card-stat">
                    <span className="card-stat-label">Fee</span>
                    <span className="card-stat-value">{(parseFloat(tier.fee_rate) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="card-stat">
                    <span className="card-stat-label">Win</span>
                    <span className="card-stat-value" style={{ color: '#4ade80' }}>
                      ⬡ {Math.round(parseFloat(tier.bet_chips) * 2 * (1 - parseFloat(tier.fee_rate))).toLocaleString()}
                    </span>
                  </div>
                  <div className="card-stat">
                    <span className="card-stat-label">Type</span>
                    <span className="card-stat-value">{tier.is_ranked ? 'Ranked' : 'Casual'}</span>
                  </div>
                </div>

                <button
                  className="btn-play-card"
                  onClick={() => handleJoinTier(tier)}
                >
                  PLAY NOW
                </button>
              </div>
            ))}
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
                      <span className="metric-val" style={{ color: 'var(--accent-color)' }}>⬡ {room.price}</span>
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
                  <span className="leaderboard-earnings">⬡ {parseFloat(player.chips).toLocaleString()}</span>
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
              <span className="pool-label">Prize Pool</span>
              <span className="pool-amount">
                {parseFloat(lobbyStats.poolSol || 0).toFixed(4)} SOL
              </span>
            </div>
            <div className="giveaway-winner-info">
              <span className="winner-amount-label">Active</span>
              <span className="winner-count">{lobbyStats.giveaways || 0}</span>
            </div>
          </div>

          {/* Active Giveaways */}
          <div className="giveaway-list">
            {giveaways.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No active giveaways. Check back soon!
              </div>
            ) : (
              giveaways.map((gw) => (
                <div key={gw.id} className="giveaway-row">
                  <div className="giveaway-info">
                    <span className="giveaway-title">
                      {isEndingSoon(gw.end_date) && <span style={{ color: '#f87171', marginRight: '4px' }}>⚡</span>}
                      {gw.title}
                    </span>
                    <span className="giveaway-meta">
                      ◎ {parseFloat(gw.prize_sol || 0).toFixed(4)} SOL · {gw.winner_count} winner{gw.winner_count > 1 ? 's' : ''}
                      {gw.end_date_formatted && ` · Ends ${gw.end_date_formatted}`}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Giveaway History Modal */}
          {giveawayHistoryOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setGiveawayHistoryOpen(false)}>
              <div style={{ background: '#111116', border: '1px solid #262626', borderRadius: '12px', width: '420px', maxWidth: '95vw', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                          <div style={{ color: 'var(--accent-color)', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>⬡ {parseFloat(w.chips_won).toLocaleString()}</div>
                          <div style={{ fontSize: '10px', color: '#555' }}>{parseFloat(w.sol_equivalent).toFixed(4)} SOL</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
