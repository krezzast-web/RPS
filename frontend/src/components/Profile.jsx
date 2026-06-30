import React, { useState, useEffect } from 'react';

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

  const s = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' },
    modal: { background: '#111116', border: '1px solid #262626', borderRadius: '12px', width: '560px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    header: { padding: '20px 24px 16px', borderBottom: '1px solid #1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    closeBtn: { background: 'none', border: 'none', color: '#666', fontSize: '20px', cursor: 'pointer' },
    body: { padding: '20px 24px', overflowY: 'auto' },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' },
    statBox: { background: '#1a1a1a', border: '1px solid #262626', borderRadius: '8px', padding: '12px', textAlign: 'center' },
    statValue: { fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '20px', color: '#d4ff00' },
    statLabel: { fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' },
    matchRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '6px', marginBottom: '4px' },
    moveIcon: { fontSize: '18px' },
    pill: (type) => ({ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: type === 'WIN' ? 'rgba(74,222,128,0.15)' : type === 'LOSS' ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.15)', color: type === 'WIN' ? '#4ade80' : type === 'LOSS' ? '#f87171' : '#fbbf24' }),
    input: { background: '#1a1a1a', border: '1px solid #d4ff00', borderRadius: '6px', padding: '8px 12px', color: '#fff', fontSize: '14px', outline: 'none', width: '200px' },
    saveBtn: { background: '#d4ff00', border: 'none', color: '#000', borderRadius: '6px', padding: '8px 16px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' },
    editBtn: { background: 'none', border: '1px solid #333', color: '#888', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer' },
    sectionTitle: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', marginTop: '16px' }
  };

  const moveEmoji = (m) => m === 'R' ? '🪨' : m === 'P' ? '📄' : m === 'S' ? '✂️' : '—';

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {loading ? 'Loading…' : data?.username || 'Player Profile'}
          </span>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={s.body}>
          {loading && <div style={{ textAlign: 'center', color: '#555', padding: '40px' }}>Loading profile…</div>}
          {!loading && data && (
            <>
              {/* Username editor */}
              <div style={s.sectionTitle}>Username</div>
              {editing ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                  <input style={s.input} value={editUsername} onChange={e => setEditUsername(e.target.value)} maxLength={20} minLength={3} />
                  <button style={s.saveBtn} onClick={handleSaveUsername}>Save</button>
                  <button style={s.editBtn} onClick={() => { setEditing(false); setEditUsername(data.username); }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '18px' }}>{data.username}</span>
                  <button style={s.editBtn} onClick={() => setEditing(true)}>Edit</button>
                </div>
              )}
              {saveMsg && <div style={{ fontSize: '12px', color: saveMsg.includes('!') ? '#4ade80' : '#f87171', marginBottom: '8px' }}>{saveMsg}</div>}

              <div style={{ fontSize: '11px', color: '#555', marginBottom: '16px', fontFamily: 'monospace' }}>
                {data.wallet_address}
              </div>

              {/* Stats */}
              <div style={s.statsGrid}>
                <div style={s.statBox}>
                  <div style={s.statValue}>#{data.rank}</div>
                  <div style={s.statLabel}>Rank</div>
                </div>
                <div style={s.statBox}>
                  <div style={s.statValue}>◎ {parseFloat(data.sol_balance || 0).toFixed(4)}</div>
                  <div style={s.statLabel}>SOL Balance</div>
                </div>
                <div style={s.statBox}>
                  <div style={s.statValue}>{data.rating}</div>
                  <div style={s.statLabel}>ELO Rating</div>
                </div>
                <div style={s.statBox}>
                  <div style={s.statValue}>{winRate}%</div>
                  <div style={s.statLabel}>Win Rate</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                <div style={{ ...s.statBox, borderColor: 'rgba(74,222,128,0.3)' }}>
                  <div style={{ ...s.statValue, color: '#4ade80' }}>{data.wins}</div>
                  <div style={s.statLabel}>Wins</div>
                </div>
                <div style={{ ...s.statBox, borderColor: 'rgba(251,191,36,0.3)' }}>
                  <div style={{ ...s.statValue, color: '#fbbf24' }}>{data.draws}</div>
                  <div style={s.statLabel}>Draws</div>
                </div>
                <div style={{ ...s.statBox, borderColor: 'rgba(248,113,113,0.3)' }}>
                  <div style={{ ...s.statValue, color: '#f87171' }}>{data.losses}</div>
                  <div style={s.statLabel}>Losses</div>
                </div>
              </div>

              {/* Match History */}
              <div style={s.sectionTitle}>Recent Matches ({data.recent_matches?.length || 0})</div>
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
                  return (
                    <div key={i} style={{ ...s.matchRow, background: i % 2 === 0 ? '#151515' : 'transparent' }}>
                      <span style={{ fontSize: '10px', color: '#444', width: '90px' }}>{m.played_at?.split(' ').slice(0,3).join(' ')}</span>
                      <span style={{ fontSize: '12px', color: '#888', flex: 1 }}>vs {oppName || 'Unknown'}</span>
                      <span style={{ fontSize: '14px', marginRight: '4px' }}>{moveEmoji(myMove)}</span>
                      <span style={{ fontSize: '11px', color: '#333', marginRight: '4px' }}>vs</span>
                      <span style={{ fontSize: '14px', marginRight: '12px' }}>{moveEmoji(oppMove)}</span>
                      <span style={s.pill(result)}>{result}</span>
                      <span style={{ fontSize: '11px', color: '#14f195', marginLeft: '8px', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>
                        ◎ {parseFloat(m.bet_sol || 0).toFixed(3)} SOL
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
