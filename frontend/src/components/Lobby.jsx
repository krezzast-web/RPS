import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

export default function Lobby() {
  const {
    joinRoom,
    customRooms,
    topRanks,
    giveaways,
    lobbyStats,
    walletConnected,
    connectWallet
  } = useGame();

  const [copiedId, setCopiedId] = useState(null);

  // Pre-defined public room tiers — bet sizes are fixed game rules, not fake data
  const roomTiers = [
    { id: 'ranked', type: 'ranked', title: 'Ranked Room', price: 0.75, fee: 0.5 },
    { id: 'shrimp',  type: 'shrimp',  title: 'Shrimp Room',  price: 0.05, fee: 0.1 },
    { id: 'tuna',    type: 'tuna',    title: 'Tuna Room',    price: 0.10, fee: 0.1 },
    { id: 'dolphin', type: 'dolphin', title: 'Dolphin Room', price: 0.20, fee: 0.1 },
    { id: 'shark',   type: 'shark',   title: 'Shark Room',   price: 1.50, fee: 0.1 },
    { id: 'whale',   type: 'whale',   title: 'Whale Room',   price: 2.50, fee: 0.1 },
  ];

  // Count real active players and games per tier from live custom rooms
  const getTierStats = (price) => {
    const tierRooms = customRooms.filter(r => Math.abs(parseFloat(r.price) - price) < 0.001);
    const players = tierRooms.reduce((acc, r) => acc + (r.players || 1), 0);
    return { players, rooms: tierRooms.length };
  };

  const handleCopyInvite = (id) => {
    navigator.clipboard.writeText(`${window.location.origin}/room/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleJoin = (room) => {
    if (!walletConnected) connectWallet();
    joinRoom(room);
  };

  const formatNumber = (n) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  // Determine if a giveaway is ending soon (within 24 hours)
  const isEndingSoon = (endDate) => {
    if (!endDate) return false;
    const diff = new Date(endDate) - new Date();
    return diff > 0 && diff < 24 * 60 * 60 * 1000;
  };

  return (
    <div className="lobby-container">
      {/* Top Banner — Real Stats from Server */}
      <section className="lobby-stats" aria-label="Global Stats">
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
            <span className="stat-label">Matches Played</span>
            <span className="stat-value">{formatNumber(lobbyStats.matches)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Active Giveaways</span>
            <span className="stat-value">{lobbyStats.giveaways}</span>
          </div>
        </div>
      </section>

      {/* Room Tier Cards — fixed rules, live player counts from DB */}
      <section className="room-tiers-row" aria-label="Game Stake Tiers">
        {roomTiers.map((room) => {
          const { players, rooms } = getTierStats(room.price);
          return (
            <div key={room.id} className={`room-card ${room.type}`}>
              <div className="room-card-header">
                <div>
                  <span className="room-type">Public</span>
                  <h3 className="room-title">{room.title}</h3>
                </div>
              </div>

              {/* Live activity bar — based on real active player count per tier */}
              <div className="mini-chart-container" aria-label="Room Activity">
                <div
                  className="activity-bar-fill"
                  style={{
                    width: `${Math.min(100, (players / 20) * 100)}%`,
                    height: '100%',
                    backgroundColor: room.type === 'ranked' ? 'var(--accent-color)' : '#333',
                    borderRadius: '4px',
                    transition: 'width 0.8s ease'
                  }}
                />
              </div>

              <div className="room-card-stats">
                <div className="card-stat">
                  <span className="card-stat-label">Active Players</span>
                  <span className="card-stat-value">
                    {players > 0 ? players : '—'}
                  </span>
                </div>
                <div className="card-stat">
                  <span className="card-stat-label">Bet</span>
                  <span className="card-stat-value">{room.price} SOL</span>
                </div>
                <div className="card-stat">
                  <span className="card-stat-label">Fee</span>
                  <span className="card-stat-value">{room.fee}%</span>
                </div>
                <div className="card-stat">
                  <span className="card-stat-label">Open Rooms</span>
                  <span className="card-stat-value">{rooms > 0 ? rooms : '—'}</span>
                </div>
              </div>

              <button
                className="btn-play-card"
                onClick={() => handleJoin(room)}
                aria-label={`Play in ${room.title}`}
              >
                {room.type === 'ranked' ? 'Play Ranked' : 'Play'}
              </button>
            </div>
          );
        })}
      </section>

      {/* Bottom Columns Grid */}
      <div className="lobby-bottom-grid">
        {/* Custom Rooms — from real DB */}
        <section className="bottom-panel" aria-labelledby="custom-rooms-title">
          <div className="panel-header">
            <div className="panel-title-group">
              <span className="panel-subtitle">Rooms</span>
              <h3 className="panel-title" id="custom-rooms-title">Custom Rooms</h3>
            </div>
          </div>
          <div className="custom-rooms-list">
            {customRooms.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No custom rooms yet. Create one with the + button.
              </div>
            ) : (
              customRooms.map((cr) => (
                <div key={cr.id} className="custom-room-row">
                  <div className="custom-room-left">
                    <span className={`custom-room-status ${cr.status.toLowerCase()}`}>
                      {cr.status}
                    </span>
                    <span className="custom-room-name">{cr.name}</span>
                  </div>
                  <div className="custom-room-metrics">
                    <div className="metric-col">
                      <span className="metric-lbl">Bet</span>
                      <span className="metric-val">{cr.price} SOL</span>
                    </div>
                    <div className="metric-col">
                      <span className="metric-lbl">Fee</span>
                      <span className="metric-val">{typeof cr.fee === 'number' ? cr.fee + '%' : cr.fee}</span>
                    </div>
                    <div className="metric-col">
                      <span className="metric-lbl">Players</span>
                      <span className="metric-val">{cr.players}/2</span>
                    </div>
                    <button
                      className="btn-invite-copy"
                      onClick={() => handleCopyInvite(cr.id)}
                      title="Copy invite link"
                      aria-label={`Copy invite link for ${cr.name}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                      </svg>
                      {copiedId === cr.id && <span className="copy-tooltip">Copied!</span>}
                    </button>
                    <button
                      className="btn-play-action"
                      onClick={() => handleJoin({ id: cr.id, type: 'custom', title: cr.name, price: cr.price, fee: cr.fee })}
                    >
                      {cr.status === 'PLAYING' ? 'Full' : 'Join'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Top Ranks — from real DB via lobby_update socket */}
        <section className="bottom-panel" aria-labelledby="top-ranks-title">
          <div className="panel-header">
            <div className="panel-title-group">
              <span className="panel-subtitle">Ranked</span>
              <h3 className="panel-title" id="top-ranks-title">Top Ranks</h3>
            </div>
          </div>
          <div className="leaderboard-list">
            {topRanks.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No players ranked yet.
              </div>
            ) : (
              topRanks.map((player, index) => (
                <div key={player.id} className="leaderboard-row">
                  <span className="leaderboard-rank">#{index + 1}</span>
                  <div className="leaderboard-user">
                    <span className="leaderboard-username">{player.name}</span>
                    <span className="leaderboard-rps-score">{player.rating} RPS</span>
                  </div>
                  <span className="leaderboard-earnings">{player.earnings}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Giveaways — from real DB managed by Admin */}
        <section className="bottom-panel" aria-labelledby="giveaways-title">
          <div className="panel-header">
            <div className="panel-title-group">
              <span className="panel-subtitle">Prize</span>
              <h3 className="panel-title" id="giveaways-title">Giveaways</h3>
            </div>
          </div>

          <div className="giveaway-list">
            {giveaways.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No active giveaways right now. Check back soon!
              </div>
            ) : (
              giveaways.map((gw) => (
                <div key={gw.id} className="giveaway-row">
                  <div className="giveaway-info">
                    <span className="giveaway-title">
                      {gw.title}
                      {isEndingSoon(gw.end_date) && (
                        <span style={{ marginLeft: '8px', color: 'var(--color-loss)', fontSize: '10px', fontWeight: 700 }}>
                          ENDING SOON
                        </span>
                      )}
                    </span>
                    <span className="giveaway-meta">
                      {gw.prize_sol > 0 ? `Prize: ${gw.prize_sol} SOL` : ''}
                      {gw.end_date_str ? ` · Ends: ${gw.end_date_str}` : ''}
                    </span>
                  </div>
                  <button className="giveaway-view-btn">View</button>
                </div>
              ))
            )}
          </div>

          <div className="giveaway-stats-summary">
            <div className="giveaway-pool">
              <span className="pool-label">Total Prize Pool</span>
              <span className="pool-amount">
                {giveaways.reduce((acc, g) => acc + parseFloat(g.prize_sol || 0), 0).toFixed(2)} SOL
              </span>
            </div>
            <div className="giveaway-winner-info">
              <span className="winner-amount-label">Winners</span>
              <span className="winner-count">
                {giveaways.reduce((acc, g) => acc + parseInt(g.winner_count || 0), 0)}
              </span>
            </div>
          </div>

          <p className="giveaway-description">
            <strong>HOW TO PLAY</strong>: Participate in ranked matches to increase your chances.
            The more you play, the better your odds of winning.
          </p>
        </section>
      </div>
    </div>
  );
}
