import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';

export default function Lobby() {
  const { joinRoom, customRooms } = useGame();
  const [copiedId, setCopiedId] = useState(null);

  // Simulated live room statistics data
  const roomTiers = [
    { id: 'ranked', type: 'ranked', title: 'Ranked Room', price: 0.75, fee: 0.5, players: 324, games: 4214112 },
    { id: 'shrimp', type: 'shrimp', title: 'Shrimp Room', price: 0.05, fee: 0.1, players: 2422, games: 42141 },
    { id: 'tuna', type: 'tuna', title: 'Tuna Room', price: 0.10, fee: 0.1, players: 3213, games: 42141 },
    { id: 'dolphin', type: 'dolphin', title: 'Dolphin Room', price: 0.20, fee: 0.1, players: 312, games: 42141 },
    { id: 'shark', type: 'shark', title: 'Shark Room', price: 1.5, fee: 0.1, players: 634, games: 42141 },
    { id: 'whale', type: 'whale', title: 'Whale Room', price: 2.5, fee: 0.1, players: 423, games: 42141 },
  ];

  const topRanks = [
    { id: 1, name: 'ADIOS MIOS', rating: '3252 RPS', earnings: '49 SOL' },
    { id: 2, name: 'HAKUNA MATATA', rating: '3023 RPS', earnings: '47 SOL' },
    { id: 3, name: 'GUKA MAN', rating: '2913 RPS', earnings: '49 SOL' },
    { id: 4, name: 'BABARYN', rating: '3023 RPS', earnings: '49 SOL' },
    { id: 5, name: 'GUKA MAN', rating: '2913 RPS', earnings: '49 SOL' },
    { id: 6, name: 'BABARYN', rating: '3023 RPS', earnings: '49 SOL' },
    { id: 7, name: 'GUKA MAN', rating: '2913 RPS', earnings: '49 SOL' },
    { id: 8, name: 'BABARYN', rating: '3023 RPS', earnings: '49 SOL' },
  ];

  const giveaways = [
    { id: 42, title: 'Play Giveaway #42', endDate: '01:43:12' },
    { id: 41, title: 'Play Giveaway #41', endDate: '07.02.2026' },
    { id: 40, title: 'Play Giveaway #40', endDate: '01.02.2026' },
    { id: 39, title: 'Play Giveaway #39', endDate: '23.01.2026' },
  ];

  // Helper component to render dynamic charts inside cards
  const MiniChart = ({ isRanked }) => {
    const [heights, setHeights] = useState([40, 60, 35, 75, 45, 90, 50, 70, 40, 80]);

    useEffect(() => {
      const interval = setInterval(() => {
        setHeights(prev => prev.map(h => {
          const change = Math.floor(Math.random() * 21) - 10;
          return Math.max(10, Math.min(100, h + change));
        }));
      }, 1500);
      return () => clearInterval(interval);
    }, []);

    return (
      <div className="mini-chart-container" aria-label="Room Activity Chart">
        {heights.map((height, i) => (
          <div 
            key={i} 
            className="chart-bar" 
            style={{ 
              height: `${height}%`,
              backgroundColor: isRanked ? 'var(--accent-color)' : '#333333'
            }}
          />
        ))}
      </div>
    );
  };

  const handleCopyInvite = (id) => {
    navigator.clipboard.writeText(`https://rpsroom.io/room/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="lobby-container">
      {/* Top Banner Stats */}
      <section className="lobby-stats" aria-label="Global Stats">
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label">Wallets</span>
            <span className="stat-value">3,453</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Rooms</span>
            <span className="stat-value">232</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Matches</span>
            <span className="stat-value">515,322</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Giveaways Made</span>
            <span className="stat-value">6</span>
          </div>
        </div>
      </section>

      {/* Room Tiers Rows */}
      <section className="room-tiers-row" aria-label="Game Stake Tiers">
        {roomTiers.map((room) => (
          <div key={room.id} className={`room-card ${room.type}`}>
            <div className="room-card-header">
              <div>
                <span className="room-type">Public</span>
                <h3 className="room-title">{room.title}</h3>
              </div>
            </div>

            <MiniChart isRanked={room.type === 'ranked'} />

            <div className="room-card-stats">
              <div className="card-stat">
                <span className="card-stat-label">Players</span>
                <span className="card-stat-value">{room.players.toLocaleString()}</span>
              </div>
              <div className="card-stat">
                <span className="card-stat-label">Bet</span>
                <span className="card-stat-value">{room.price}</span>
              </div>
              <div className="card-stat">
                <span className="card-stat-label">Fee</span>
                <span className="card-stat-value">{room.fee}%</span>
              </div>
              <div className="card-stat">
                <span className="card-stat-label">Games</span>
                <span className="card-stat-value">{room.games.toLocaleString()}</span>
              </div>
            </div>

            {/* Play trigger button positioned at the bottom of the card */}
            <button 
              className="btn-play-card" 
              onClick={() => joinRoom(room)}
              aria-label={`Play in ${room.title}`}
            >
              {room.type === 'ranked' ? 'Play Ranked' : 'Play'}
            </button>
          </div>
        ))}
      </section>

      {/* Bottom Columns Grid */}
      <div className="lobby-bottom-grid">
        {/* Custom Rooms */}
        <section className="bottom-panel" aria-labelledby="custom-rooms-title">
          <div className="panel-header">
            <div className="panel-title-group">
              <span className="panel-subtitle">Rooms</span>
              <h3 className="panel-title" id="custom-rooms-title">Custom Rooms</h3>
            </div>
          </div>
          <div className="custom-rooms-list">
            {customRooms.map((cr) => (
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
                    <span className="metric-val">{cr.price}</span>
                  </div>
                  <div className="metric-col">
                    <span className="metric-lbl">Fee</span>
                    <span className="metric-val">{typeof cr.fee === 'number' ? cr.fee + '%' : cr.fee}</span>
                  </div>
                  
                  {/* Copy Invite Link Icon */}
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

                  <button className="btn-play-action" onClick={() => joinRoom({ id: cr.id, type: 'custom', title: cr.name, price: cr.price, fee: cr.fee })}>
                    Play
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Top Ranks */}
        <section className="bottom-panel" aria-labelledby="top-ranks-title">
          <div className="panel-header">
            <div className="panel-title-group">
              <span className="panel-subtitle">Ranked</span>
              <h3 className="panel-title" id="top-ranks-title">Top Ranks</h3>
            </div>
          </div>
          <div className="leaderboard-list">
            {topRanks.map((player, index) => (
              <div key={index} className="leaderboard-row">
                <span className="leaderboard-rank">#{index + 1}</span>
                <div className="leaderboard-user">
                  <span className="leaderboard-username">{player.name}</span>
                  <span className="leaderboard-rps-score">{player.rating}</span>
                </div>
                <span className="leaderboard-earnings">{player.earnings}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Giveaways */}
        <section className="bottom-panel" aria-labelledby="giveaways-title">
          <div className="panel-header">
            <div className="panel-title-group">
              <span className="panel-subtitle">Prize</span>
              <h3 className="panel-title" id="giveaways-title">Giveaways</h3>
            </div>
          </div>
          
          <div className="giveaway-list">
            {giveaways.map((gw) => (
              <div key={gw.id} className="giveaway-row">
                <div className="giveaway-info">
                  <span className="giveaway-title">{gw.title}</span>
                  <span className="giveaway-meta">End Date: {gw.endDate}</span>
                </div>
                <button className="giveaway-view-btn">View</button>
              </div>
            ))}
          </div>

          <div className="giveaway-stats-summary">
            <div className="giveaway-pool">
              <span className="pool-label">We Collected</span>
              <span className="pool-amount">24 SOL</span>
            </div>
            <div className="giveaway-winner-info">
              <span className="winner-amount-label">Winner Amount</span>
              <span className="winner-count">10</span>
            </div>
          </div>

          <p className="giveaway-description">
            <strong>HOW TO PLAY</strong>: Engage in additional ranked matches to enhance your chances of improvement. 
            The more you participate in ranked gameplay, the greater your opportunities to refine your skills and strategies, 
            ultimately increasing your likelihood of success.
          </p>
        </section>
      </div>
    </div>
  );
}
