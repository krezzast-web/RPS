import React, { useState, useEffect, useCallback } from 'react';

const API = '/api/admin';

function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      localStorage.setItem('rps_admin_token', data.token);
      onLogin(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.loginWrap}>
      <div style={styles.loginCard}>
        <div style={styles.loginLogo}>
          <span style={styles.loginLogoText}>RPS</span>
          <span style={styles.loginLogoSub}>Admin Panel</span>
        </div>
        <form onSubmit={handleSubmit} style={styles.loginForm}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Username</label>
            <input
              type="text"
              style={styles.formInput}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus
              required
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Password</label>
            <input
              type="password"
              style={styles.formInput}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <div style={styles.errorMsg}>{error}</div>}
          <button type="submit" style={styles.loginBtn} disabled={loading}>
            {loading ? 'Logging in...' : 'LOGIN'}
          </button>
        </form>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ ...styles.statCard, borderTop: `3px solid ${color || '#6366f1'}` }}>
      <span style={styles.statLabel}>{label}</span>
      <span style={styles.statValue}>{value ?? '—'}</span>
    </div>
  );
}

function DataTable({ columns, rows, emptyMsg }) {
  if (!rows || rows.length === 0) {
    return <div style={styles.emptyTable}>{emptyMsg || 'No data.'}</div>;
  }
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={styles.th}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
              {columns.map(col => (
                <td key={col.key} style={styles.td}>{row[col.key] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GiveawayManager({ token }) {
  const [giveaways, setGiveaways] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', prize_sol: '', winner_count: 1, end_date: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    const res = await fetch(`${API}/giveaways`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    setGiveaways(Array.isArray(data) ? data : []);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const url = editId ? `${API}/giveaways/${editId}` : `${API}/giveaways`;
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers, body: JSON.stringify({ ...form, status: 'ACTIVE' }) });
      if (!res.ok) throw new Error('Save failed');
      setForm({ title: '', description: '', prize_sol: '', winner_count: 1, end_date: '' });
      setEditId(null);
      setMsg(editId ? 'Updated!' : 'Created!');
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (gw) => {
    setEditId(gw.id);
    setForm({
      title: gw.title,
      description: gw.description || '',
      prize_sol: gw.prize_sol,
      winner_count: gw.winner_count,
      end_date: gw.end_date_str || ''
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this giveaway?')) return;
    await fetch(`${API}/giveaways/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    await load();
  };

  return (
    <div>
      <h3 style={styles.sectionTitle}>Giveaways Manager</h3>
      <form onSubmit={handleSave} style={styles.giveawayForm}>
        <div style={styles.giveawayFormRow}>
          <input style={styles.formInput} placeholder="Title *" value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
          <input style={styles.formInput} placeholder="Prize SOL (e.g. 5.0)" type="number" step="0.01"
            value={form.prize_sol} onChange={e => setForm(p => ({ ...p, prize_sol: e.target.value }))} />
          <input style={styles.formInput} placeholder="Winners" type="number" min="1"
            value={form.winner_count} onChange={e => setForm(p => ({ ...p, winner_count: e.target.value }))} />
          <input style={styles.formInput} placeholder="End date (YYYY-MM-DD)" type="date"
            value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
        </div>
        <textarea style={{ ...styles.formInput, height: '60px', resize: 'vertical' }}
          placeholder="Description (optional)" value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'center' }}>
          <button type="submit" style={styles.saveBtn} disabled={saving}>
            {saving ? 'Saving...' : editId ? 'Update' : 'Create Giveaway'}
          </button>
          {editId && (
            <button type="button" style={styles.cancelBtn}
              onClick={() => { setEditId(null); setForm({ title: '', description: '', prize_sol: '', winner_count: 1, end_date: '' }); }}>
              Cancel
            </button>
          )}
          {msg && <span style={{ color: '#10b981', fontSize: '13px' }}>{msg}</span>}
        </div>
      </form>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Title</th>
              <th style={styles.th}>Prize</th>
              <th style={styles.th}>Winners</th>
              <th style={styles.th}>End Date</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Created</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {giveaways.map((gw, i) => (
              <tr key={gw.id} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                <td style={styles.td}>{gw.title}</td>
                <td style={styles.td}>{gw.prize_sol} SOL</td>
                <td style={styles.td}>{gw.winner_count}</td>
                <td style={styles.td}>{gw.end_date_str || '—'}</td>
                <td style={styles.td}>
                  <span style={{ color: gw.status === 'ACTIVE' ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                    {gw.status}
                  </span>
                </td>
                <td style={styles.td}>{gw.created_at}</td>
                <td style={styles.td}>
                  <button style={styles.editBtn} onClick={() => handleEdit(gw)}>Edit</button>
                  <button style={styles.deleteBtn} onClick={() => handleDelete(gw.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SweepFees({ token }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const handle = async () => {
    if (!window.confirm('Sweep all collected fees to the business wallet?')) return;
    setLoading(true); setResult('');
    try {
      const res = await fetch('/api/admin/sweep-fees', { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setResult(`✓ Swept ${d.sweptSol} SOL → ${d.to.slice(0,8)}...`);
    } catch(e) { setResult('✗ ' + e.message); }
    finally { setLoading(false); }
  };
  return (
    <div style={{ marginTop: '24px', background: '#0a0a10', border: '1px solid rgba(20,241,149,0.2)', borderRadius: '12px', padding: '20px' }}>
      <div style={{ fontWeight: 700, color: '#14f195', marginBottom: '8px', fontSize: '14px' }}>Fee Sweep to Business Wallet</div>
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '14px' }}>Sends all accumulated platform fees to: <code style={{ color: '#14f195', fontSize: '11px' }}>7o7YrgFHTbxWGezYeue36Lfv6vzXzEsZQVePY4ic66s6</code></div>
      <button onClick={handle} disabled={loading} style={{ background: 'rgba(20,241,149,0.15)', border: '1px solid rgba(20,241,149,0.4)', color: '#14f195', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>
        {loading ? 'Sweeping...' : '◎ Sweep Fees Now'}
      </button>
      {result && <div style={{ marginTop: '10px', fontSize: '13px', color: result.startsWith('✓') ? '#14f195' : '#f87171' }}>{result}</div>}
    </div>
  );
}

function CreditSol({ token }) {
  const [wallet, setWallet] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const handle = async (e) => {
    e.preventDefault(); setLoading(true); setResult('');
    try {
      const res = await fetch('/api/admin/credit-sol', { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet, solAmount: parseFloat(amount), notes: 'Admin manual credit' }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setResult(`✓ Credited ${amount} SOL to ${wallet.slice(0,8)}...`);
      setWallet(''); setAmount('');
    } catch(e) { setResult('✗ ' + e.message); }
    finally { setLoading(false); }
  };
  return (
    <div style={{ marginTop: '16px', background: '#0a0a10', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '12px', padding: '20px' }}>
      <div style={{ fontWeight: 700, color: '#6366f1', marginBottom: '12px', fontSize: '14px' }}>Manual SOL Credit (Admin Only)</div>
      <form onSubmit={handle} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input value={wallet} onChange={e => setWallet(e.target.value)} placeholder="Player wallet address" required style={{ flex: 2, background: '#111118', border: '1px solid #2a2a3e', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '13px', minWidth: '200px' }} />
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="SOL amount" type="number" step="0.001" min="0.001" required style={{ flex: 1, background: '#111118', border: '1px solid #2a2a3e', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '13px', minWidth: '100px' }} />
        <button type="submit" disabled={loading} style={{ background: '#6366f1', border: 'none', color: '#fff', borderRadius: '8px', padding: '9px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>{loading ? '...' : 'Credit SOL'}</button>
      </form>
      {result && <div style={{ marginTop: '8px', fontSize: '12px', color: result.startsWith('✓') ? '#14f195' : '#f87171' }}>{result}</div>}
    </div>
  );
}

export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem('rps_admin_token') || null);
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [players, setPlayers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [messages, setMessages] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);

  const authHeaders = useCallback(() => ({
    'Authorization': `Bearer ${token}`
  }), [token]);

  const logout = () => {
    localStorage.removeItem('rps_admin_token');
    setToken(null);
  };

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [sRes, pRes, rRes, mRes, matchRes] = await Promise.all([
        fetch(`${API}/stats`, { headers: authHeaders() }),
        fetch(`${API}/players?limit=100`, { headers: authHeaders() }),
        fetch(`${API}/rooms`, { headers: authHeaders() }),
        fetch(`${API}/messages?limit=100`, { headers: authHeaders() }),
        fetch(`${API}/matches?limit=100`, { headers: authHeaders() })
      ]);

      if (sRes.status === 401) { logout(); return; }

      const [s, p, r, m, ma] = await Promise.all([
        sRes.json(), pRes.json(), rRes.json(), mRes.json(), matchRes.json()
      ]);

      setStats(s);
      setPlayers(Array.isArray(p.players) ? p.players : []);
      setRooms(Array.isArray(r) ? r : []);
      setMessages(Array.isArray(m) ? m : []);
      setMatches(Array.isArray(ma) ? ma : []);
    } catch (err) {
      console.error('Admin fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [token, authHeaders]);

  useEffect(() => {
    if (token) fetchData();
  }, [token, fetchData]);

  if (!token) return <AdminLogin onLogin={setToken} />;

  const tabs = ['overview', 'players', 'rooms', 'matches', 'messages', 'giveaways'];

  return (
    <div style={styles.adminWrap}>
      {/* Sidebar */}
      <nav style={styles.sidebar}>
        <div style={styles.sidebarLogo}>
          <span style={{ color: '#6366f1', fontWeight: 800, fontSize: '18px' }}>RPS</span>
          <span style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>Admin Panel</span>
        </div>
        {tabs.map(tab => (
          <button
            key={tab}
            style={activeTab === tab ? styles.navBtnActive : styles.navBtn}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        <button style={{ ...styles.navBtn, marginTop: 'auto', color: '#ef4444' }} onClick={logout}>
          Logout
        </button>
      </nav>

      {/* Main Content */}
      <main style={styles.main}>
        <div style={styles.topBar}>
          <h1 style={styles.pageTitle}>
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
          </h1>
          <button style={styles.refreshBtn} onClick={fetchData} disabled={loading}>
            {loading ? 'Loading...' : '↻ Refresh'}
          </button>
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div>
            <div style={styles.statsGrid}>
              <StatCard label="Total Wallets" value={stats?.total_wallets} color="#6366f1" />
              <StatCard label="Total Matches" value={stats?.total_matches} color="#10b981" />
              <StatCard label="Active Rooms" value={stats?.active_rooms} color="#f59e0b" />
              <StatCard label="Total Rooms" value={stats?.total_rooms} color="#3b82f6" />
              <StatCard label="Active Giveaways" value={stats?.active_giveaways} color="#ec4899" />
              <StatCard
                label="Fees Collected"
                value={stats?.fees_collected_sol ? parseFloat(stats.fees_collected_sol).toFixed(6) + ' SOL' : '0 SOL'}
                color="#14b8a6"
              />
            </div>
          <SweepFees token={token} />
          <CreditSol token={token} />
        </div>
        )}

        {/* Players */}
        {activeTab === 'players' && (
          <DataTable
            columns={[
              { key: 'username', label: 'Username' },
              { key: 'wallet_address', label: 'Wallet' },
              { key: 'rating', label: 'Rating' },
              { key: 'wins', label: 'W' },
              { key: 'losses', label: 'L' },
              { key: 'draws', label: 'D' },
              { key: 'sol_balance', label: 'SOL Balance' },
              { key: 'last_active', label: 'Last Active' }
            ]}
            rows={players}
            emptyMsg="No players registered yet."
          />
        )}

        {/* Rooms */}
        {activeTab === 'rooms' && (
          <DataTable
            columns={[
              { key: 'id', label: 'Room ID' },
              { key: 'name', label: 'Name' },
              { key: 'status', label: 'Status' },
              { key: 'bet_sol', label: 'Bet (SOL)' },
              { key: 'fee_rate', label: 'Fee Rate' },
              { key: 'player1', label: 'Player 1' },
              { key: 'player2', label: 'Player 2' },
              { key: 'created_at', label: 'Created' }
            ]}
            rows={rooms}
            emptyMsg="No rooms created yet."
          />
        )}

        {/* Matches */}
        {activeTab === 'matches' && (
          <DataTable
            columns={[
              { key: 'id', label: '#' },
              { key: 'player1', label: 'Player 1' },
              { key: 'player2', label: 'Player 2' },
              { key: 'player1_move', label: 'P1 Move' },
              { key: 'player2_move', label: 'P2 Move' },
              { key: 'winner', label: 'Winner' },
              { key: 'bet_sol', label: 'Bet (SOL)' },
              { key: 'fee_sol', label: 'Fee (SOL)' },
              { key: 'played_at', label: 'Played At' }
            ]}
            rows={matches}
            emptyMsg="No matches played yet."
          />
        )}

        {/* Messages */}
        {activeTab === 'messages' && (
          <DataTable
            columns={[
              { key: 'sender_username', label: 'Sender' },
              { key: 'room_id', label: 'Room' },
              { key: 'text', label: 'Message' },
              { key: 'likes', label: 'Likes' },
              { key: 'created_at', label: 'Time' }
            ]}
            rows={messages}
            emptyMsg="No messages yet."
          />
        )}

        {/* Giveaways */}
        {activeTab === 'giveaways' && <GiveawayManager token={token} />}
      </main>
    </div>
  );
}

// ─── Inline Styles ───────────────────────────────────────────────────────────

const styles = {
  loginWrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0a0a0f', fontFamily: 'Inter, sans-serif'
  },
  loginCard: {
    background: '#111118', border: '1px solid #1e1e2e', borderRadius: '16px',
    padding: '40px', width: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)'
  },
  loginLogo: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' },
  loginLogoText: { fontSize: '32px', fontWeight: 900, color: '#6366f1', letterSpacing: '2px' },
  loginLogoSub: { fontSize: '12px', color: '#555', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '3px' },
  loginForm: { display: 'flex', flexDirection: 'column', gap: '16px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  formLabel: { fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' },
  formInput: {
    background: '#0a0a0f', border: '1px solid #2a2a3e', borderRadius: '8px',
    padding: '10px 14px', color: '#fff', fontSize: '14px', outline: 'none', width: '100%',
    boxSizing: 'border-box'
  },
  errorMsg: { background: '#2d0a0a', border: '1px solid #ef4444', borderRadius: '6px', padding: '8px 12px', color: '#ef4444', fontSize: '13px' },
  loginBtn: {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: '8px',
    padding: '12px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
    letterSpacing: '1px', marginTop: '8px'
  },
  adminWrap: { display: 'flex', minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter, sans-serif', color: '#e4e4f0' },
  sidebar: {
    width: '200px', background: '#0e0e1a', borderRight: '1px solid #1e1e2e',
    display: 'flex', flexDirection: 'column', padding: '24px 0', gap: '4px', flexShrink: 0
  },
  sidebarLogo: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 16px 24px', borderBottom: '1px solid #1e1e2e', marginBottom: '8px' },
  navBtn: {
    background: 'none', border: 'none', color: '#888', fontSize: '13px', fontWeight: 500,
    padding: '10px 20px', textAlign: 'left', cursor: 'pointer', textTransform: 'capitalize',
    borderRadius: '0', transition: 'all 0.15s'
  },
  navBtnActive: {
    background: '#1a1a2e', border: 'none', color: '#6366f1', fontSize: '13px', fontWeight: 700,
    padding: '10px 20px', textAlign: 'left', cursor: 'pointer', textTransform: 'capitalize',
    borderLeft: '3px solid #6366f1', borderRadius: '0'
  },
  main: { flex: 1, padding: '32px', overflow: 'auto' },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' },
  pageTitle: { fontSize: '22px', fontWeight: 700, color: '#fff', margin: 0, textTransform: 'capitalize' },
  refreshBtn: {
    background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#888', borderRadius: '8px',
    padding: '8px 16px', cursor: 'pointer', fontSize: '13px'
  },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' },
  statCard: {
    background: '#111118', border: '1px solid #1e1e2e', borderRadius: '12px',
    padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '8px'
  },
  statLabel: { fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '1px' },
  statValue: { fontSize: '28px', fontWeight: 800, color: '#fff' },
  tableWrap: { overflowX: 'auto', borderRadius: '12px', border: '1px solid #1e1e2e' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { background: '#111118', color: '#666', padding: '10px 14px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #1e1e2e' },
  td: { padding: '10px 14px', color: '#ccc', borderBottom: '1px solid #1a1a2a', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  trEven: { background: '#0e0e1a' },
  trOdd: { background: '#111118' },
  emptyTable: { padding: '40px', textAlign: 'center', color: '#555', fontSize: '14px' },
  sectionTitle: { color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '20px' },
  giveawayForm: { background: '#111118', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '20px', marginBottom: '24px' },
  giveawayFormRow: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' },
  saveBtn: { background: '#6366f1', border: 'none', color: '#fff', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' },
  cancelBtn: { background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#888', borderRadius: '8px', padding: '10px 16px', cursor: 'pointer', fontSize: '13px' },
  editBtn: { background: '#1d4ed8', border: 'none', color: '#fff', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px', marginRight: '6px' },
  deleteBtn: { background: '#991b1b', border: 'none', color: '#fff', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px' }
};
