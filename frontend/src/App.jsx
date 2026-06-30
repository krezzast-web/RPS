import React, { useState } from 'react';
import Header from './components/Header';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';
import Admin from './components/Admin';
import Deposit from './components/Deposit';
import Profile from './components/Profile';
import { useGame } from './context/GameContext';
import './App.css';

// GameApp holds all hooks — rendered only on non-admin routes
function GameApp() {
  const {
    activeView,
    leaveRoom,
    createRoomModalOpen,
    setCreateRoomModalOpen,
    createCustomRoom,
    walletAddress,
    walletConnected
  } = useGame();

  const [depositOpen, setDepositOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Local Form States for Room Creation Modal
  const [roomName, setRoomName] = useState('');
  const [betAmount, setBetAmount] = useState('50');
  const [hasPassword, setHasPassword] = useState(false);
  const [roomPassword, setRoomPassword] = useState('');

  const handleLobbyNav = () => {
    if (activeView === 'game') {
      const confirmLeave = window.confirm("Are you sure you want to leave the room? Your match progress will be lost.");
      if (confirmLeave) leaveRoom();
    }
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!roomName.trim()) { alert("Please enter a room name."); return; }
    createCustomRoom(roomName, betAmount, hasPassword ? roomPassword : '');
    setRoomName(''); setBetAmount('50'); setHasPassword(false); setRoomPassword('');
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <nav className="sidebar" aria-label="Main Navigation">
        <button
          className={`sidebar-btn ${activeView === 'lobby' ? 'active' : ''}`}
          onClick={handleLobbyNav}
          aria-label="Game Lobby Dashboard"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
          </svg>
        </button>
        <button
          className="sidebar-btn sidebar-create-btn"
          onClick={() => setCreateRoomModalOpen(true)}
          aria-label="Create Custom Room"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        {walletConnected && (
          <button
            className="sidebar-btn"
            onClick={() => setDepositOpen(true)}
            aria-label="Buy CHIPS"
            title="Buy CHIPS"
            style={{ color: 'var(--accent-color)' }}
          >
            ⬡
          </button>
        )}
      </nav>

      {/* Main Content */}
      <main className="main-wrapper">
        <Header
          onOpenDeposit={() => setDepositOpen(true)}
          onOpenWithdraw={() => setDepositOpen(true)}
          onOpenProfile={() => setProfileOpen(true)}
        />

        {activeView === 'lobby' ? <Lobby /> : <GameRoom />}
      </main>

      {/* Room Creation Modal */}
      {createRoomModalOpen && (
        <div className="modal-overlay" onClick={() => setCreateRoomModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card-header">
              <h3 className="modal-card-title">Create Custom Room</h3>
              <button className="modal-close-btn" onClick={() => setCreateRoomModalOpen(false)} aria-label="Close modal">×</button>
            </div>
            <form onSubmit={handleCreateSubmit} className="modal-form">
              <div className="form-group">
                <label htmlFor="modal-room-name" className="form-label">Room Name</label>
                <input type="text" id="modal-room-name" className="form-input" placeholder="e.g. My Game" value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={18} required />
              </div>
              <div className="form-group">
                <label htmlFor="modal-bet-amount" className="form-label">Bet Amount (CHIPS)</label>
                <input type="number" id="modal-bet-amount" className="form-input" step="1" min="10" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} required />
              </div>
              <div className="form-group-switch">
                <span className="switch-label">Require Password</span>
                <label className="switch-toggle" htmlFor="password-toggle">
                  <input type="checkbox" id="password-toggle" checked={hasPassword} onChange={(e) => setHasPassword(e.target.checked)} />
                  <span className="switch-slider"></span>
                </label>
              </div>
              {hasPassword && (
                <div className="form-group animate-slide-down">
                  <label htmlFor="modal-password" className="form-label">Password</label>
                  <input type="password" id="modal-password" className="form-input" placeholder="Enter room password" value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} required={hasPassword} />
                </div>
              )}
              <button type="submit" className="btn-modal-submit">CREATE</button>
            </form>
          </div>
        </div>
      )}

      {/* Deposit / Withdraw Modal */}
      {depositOpen && <Deposit onClose={() => setDepositOpen(false)} />}

      {/* Profile Modal */}
      {profileOpen && walletAddress && <Profile wallet={walletAddress} onClose={() => setProfileOpen(false)} />}
    </div>
  );
}

// Root — routes to Admin or GameApp, no hooks here
function App() {
  if (window.location.pathname === '/admin') {
    return <Admin />;
  }
  return <GameApp />;
}

export default App;
