import React, { useState, useEffect } from 'react';
import SolanaIcon from './SolanaIcon';

export default function Profile({ wallet, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editUsername, setEditUsername] = useState('');
  const [editing, setEditing] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    if (!wallet) return;
    fetch(`/api/profile/${wallet}`)
      .then(r => r.json())
      .then(d => { setData(d); setEditUsername(d.username || ''); setLoading(false); })
      .catch(() => setLoading(false));
  }, [wallet]);

  const handleSaveUsername = async () => {
    setSaveMsg('');
    try {
      const res = await fetch('/api/profile/username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet, username: editUsername })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(p => ({ ...p, username: editUsername }));
      setSaveMsg('Username saved!');
      setEditing(false);
    } catch (err) {
      setSaveMsg(err.message);
    }
  };

  const totalGames = (data?.wins || 0) + (data?.losses || 0) + (data?.draws || 0);
  const winRate = totalGames > 0 ? ((data.wins / totalGames) * 100).toFixed(1) : '0.0';

  const moveEmoji = (m) => m === 'R' ? 'R' : m === 'P' ? 'P' : m === 'S' ? 'S' : '—';

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        <div className="profile-header">
          <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {loading ? 'Loading…' : data?.username || 'Player Profile'}
          </span>
          <button className="profile-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="profile-body">
          {loading && <div style={{ textAlign: 'center', color: '#555', padding: '40px' }}>Loading profile…</div>}
          {!loading && data && (
            <>
              {/* Username editor */}
              <div className="profile-section-title">Username</div>
              {editing ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                  <input className="profile-input" value={editUsername} onChange={e => setEditUsername(e.target.value)} maxLength={20} minLength={3} />
                  <button className="profile-save-btn" onClick={handleSaveUsername}>Save</button>
                  <button className="profile-edit-btn" onClick={() => { setEditing(false); setEditUsername(data.username); }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '18px' }}>{data.username}</span>
                  <button className="profile-edit-btn" onClick={() => setEditing(true)}>Edit</button>
                </div>
              )}
              {saveMsg && <div style={{ fontSize: '12px', color: saveMsg.includes('!') ? '#4ade80' : '#f87171', marginBottom: '8px' }}>{saveMsg}</div>}

              <div style={{ fontSize: '11px', color: '#555', marginBottom: '16px', fontFamily: 'monospace' }}>
                {data.wallet_address}
              </div>

              {/* Stats */}
              <div className="profile-stats-grid">
                <div className="profile-stat-box">
                  <div className="profile-stat-value">#{data.rank}</div>
                  <div className="profile-stat-label">Rank</div>
                </div>
                <div className="profile-stat-box">
                  <div className="profile-stat-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <SolanaIcon size={14} style={{ color: '#DFFE00' }} />
                    <span>{parseFloat(data.sol_balance || 0).toFixed(4)}</span>
                  </div>
                  <div className="profile-stat-label">SOL Balance</div>
                </div>
                <div className="profile-stat-box">
                  <div className="profile-stat-value">{data.rating}</div>
                  <div className="profile-stat-label">ELO Rating</div>
                </div>
                <div className="profile-stat-box">
                  <div className="profile-stat-value">{winRate}%</div>
                  <div className="profile-stat-label">Win Rate</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                <div className="profile-stat-box" style={{ borderColor: 'rgba(74,222,128,0.3)' }}>
                  <div className="profile-stat-value" style={{ color: '#4ade80' }}>{data.wins}</div>
                  <div className="profile-stat-label">Wins</div>
                </div>
                <div className="profile-stat-box" style={{ borderColor: 'rgba(251,191,36,0.3)' }}>
                  <div className="profile-stat-value" style={{ color: '#fbbf24' }}>{data.draws}</div>
                  <div className="profile-stat-label">Draws</div>
                </div>
                <div className="profile-stat-box" style={{ borderColor: 'rgba(248,113,113,0.3)' }}>
                  <div className="profile-stat-value" style={{ color: '#f87171' }}>{data.losses}</div>
                  <div className="profile-stat-label">Losses</div>
                </div>
              </div>

              {/* Match History */}
              <div className="profile-section-title">Recent Matches ({data.recent_matches?.length || 0})</div>
              {!data.recent_matches?.length ? (
                <div style={{ color: '#444', fontSize: '13px', padding: '20px', textAlign: 'center' }}>No matches played yet.</div>
              ) : (
                data.recent_matches.map((m, i) => {
                  const isP1 = m.player1_wallet === data.wallet_address;
                  const myMove = isP1 ? m.player1_move : m.player2_move;
                  const oppMove = isP1 ? m.player2_move : m.player1_move;
                  const oppName = isP1 ? m.p2_name : m.p1_name;
                  const isWin = m.winner_wallet === data.wallet_address;
                  const isDraw = !m.winner_wallet;
                  const result = isDraw ? 'DRAW' : isWin ? 'WIN' : 'LOSS';
                  const pillClass = isDraw ? 'draw' : isWin ? 'win' : 'loss';
                  return (
                    <div key={i} className="profile-match-row" style={{ background: i % 2 === 0 ? '#151515' : 'transparent' }}>
                      <span style={{ fontSize: '10px', color: '#444', width: '90px' }}>{m.played_at?.split(' ').slice(0,3).join(' ')}</span>
                      <span style={{ fontSize: '12px', color: '#888', flex: 1 }}>vs {oppName || 'Unknown'}</span>
                      <span style={{ fontSize: '14px', marginRight: '4px' }}>{moveEmoji(myMove)}</span>
                      <span style={{ fontSize: '11px', color: '#333', marginRight: '4px' }}>vs</span>
                      <span style={{ fontSize: '14px', marginRight: '12px' }}>{moveEmoji(oppMove)}</span>
                      <span className={`profile-pill ${pillClass}`}>{result}</span>
                      <span style={{ fontSize: '11px', color: '#DFFE00', marginLeft: '8px', fontFamily: 'Outfit, sans-serif', fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>
                        <SolanaIcon size={10} style={{ marginRight: '4px' }} />
                        <span>{parseFloat(m.bet_sol || 0).toFixed(3)} SOL</span>
                      </span>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
