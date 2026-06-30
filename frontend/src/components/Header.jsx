import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';

export default function Header({ onOpenDeposit, onOpenWithdraw, onOpenProfile }) {
  const { walletConnected, walletAddress, chipsBalance, username, connectWallet, disconnectWallet } = useGame();
  const [showMenu, setShowMenu] = useState(false);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const close = () => setShowMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showMenu]);

  return (
    <header className="header">
      <div className="header-logo-group">
        <div className="logo-shapes">
          <div className="logo-shape half" title="Paper"></div>
          <div className="logo-shape circle" title="Rock"></div>
          <div className="logo-shape triangle" title="Scissors"></div>
        </div>
        <div className="logo-text">
          <span className="logo-title">Rpsroom</span>
          <span className="logo-subtitle">Play. Win. Withdraw.</span>
        </div>
      </div>

      <div className="header-right">
        {walletConnected ? (
          <div className="header-wallet-group">
            {/* CHIPS Balance with + button */}
            <div className="chips-display">
              <span className="chips-icon">⬡</span>
              <span className="chips-amount">{parseFloat(chipsBalance || 0).toLocaleString()}</span>
              <span className="chips-label">CHIPS</span>
              <button
                className="btn-chips-add"
                id="deposit-btn"
                onClick={(e) => { e.stopPropagation(); onOpenDeposit?.(); }}
                title="Buy CHIPS"
              >
                +
              </button>
            </div>

            {/* Wallet Profile with dropdown */}
            <div
              className="wallet-profile"
              onClick={(e) => { e.stopPropagation(); setShowMenu(p => !p); }}
              title={`Connected: ${walletAddress}`}
            >
              <div className="wallet-avatar-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
                  <line x1="12" y1="12" x2="20" y2="12"></line>
                  <circle cx="16" cy="12" r="1"></circle>
                </svg>
              </div>
              <div className="wallet-info">
                <span className="wallet-name">{username}</span>
                <span className="wallet-sol">{walletAddress.slice(0, 4)}…{walletAddress.slice(-4)}</span>
              </div>
              <svg className="chevron-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>

              {showMenu && (
                <div className="wallet-dropdown" onClick={e => e.stopPropagation()}>
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); onOpenProfile?.(); }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                    My Profile
                  </button>
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); onOpenDeposit?.(); }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 12 12 7 7 12"/><line x1="12" y1="7" x2="12" y2="20"/><line x1="3" y1="3" x2="21" y2="3"/></svg>
                    Deposit CHIPS
                  </button>
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); onOpenWithdraw?.(); }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7 12 12 17 17 12"/><line x1="12" y1="17" x2="12" y2="3"/><line x1="3" y1="21" x2="21" y2="21"/></svg>
                    Withdraw
                  </button>
                  <div className="dropdown-divider" />
                  <button className="dropdown-item danger" onClick={() => { setShowMenu(false); disconnectWallet(); }}>
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <button className="btn-connect-wallet" id="connect-wallet-btn" onClick={connectWallet}>
            CONNECT WALLET
          </button>
        )}
      </div>
    </header>
  );
}
