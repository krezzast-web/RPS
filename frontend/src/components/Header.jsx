import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import SolanaIcon from './SolanaIcon';

export default function Header({ onOpenDeposit, onOpenProfile }) {
  const { walletConnected, walletAddress, solBalance, username, xUsername, linkXAccount, connectWallet, disconnectWallet } = useGame();
  const [showMenu, setShowMenu] = useState(false);
  const [xModalOpen, setXModalOpen] = useState(false);
  const [xModalVal, setXModalVal] = useState('');

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const close = () => setShowMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showMenu]);

  const handleLinkXSubmit = (e) => {
    e.preventDefault();
    if (xModalVal.trim()) {
      linkXAccount(xModalVal.trim())
        .then(() => {
          setXModalOpen(false);
          setXModalVal('');
        })
        .catch(() => {});
    }
  };

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
            {/* Twitter Link status / trigger */}
            {xUsername ? (
              <div className="chips-display" style={{ background: '#1D1D1D', border: '1px solid #333333', color: '#1DA1F2', display: 'flex', alignItems: 'center', gap: '5px' }} title="Linked Twitter (X)">
                <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24" style={{ marginRight: '2px' }}>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span className="chips-amount" style={{ textTransform: 'none', fontWeight: 600 }}>@{xUsername}</span>
              </div>
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setXModalOpen(true);
                  }}
                  className="btn-connect-wallet"
                  style={{ padding: '0 12px', height: '30px', fontSize: '9.5px', background: 'transparent', border: '1px solid #1DA1F2', color: '#1DA1F2', whiteSpace: 'nowrap' }}
                >
                  LINK X/TWITTER
                </button>

                {xModalOpen && (
                  <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => setXModalOpen(false)}>
                    <div className="modal-card" style={{ width: '320px', padding: '20px' }} onClick={e => e.stopPropagation()}>
                      <div className="modal-card-header" style={{ marginBottom: '15px' }}>
                        <h3 className="modal-card-title" style={{ fontSize: '13px' }}>Link Twitter (X)</h3>
                        <button className="modal-close-btn" style={{ fontSize: '16px' }} onClick={() => setXModalOpen(false)}>×</button>
                      </div>
                      <form onSubmit={handleLinkXSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '10px' }}>Twitter Username (without @)</label>
                          <input
                            type="text"
                            className="form-input"
                            style={{ height: '32px', fontSize: '12px' }}
                            placeholder="e.g. MyTwitterHandle"
                            value={xModalVal}
                            onChange={e => setXModalVal(e.target.value)}
                            required
                            autoFocus
                          />
                        </div>
                        <button type="submit" className="btn-modal-submit" style={{ height: '32px', fontSize: '11px', fontWeight: 700 }}>
                          LINK ACCOUNT
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* SOL Balance with + button */}
            <div className="chips-display">
              <SolanaIcon size={12} style={{ color: 'var(--accent-color)' }} />
              <span className="chips-amount">{parseFloat(solBalance || 0).toFixed(4)}</span>
              <span className="chips-label">SOL</span>
              <button
                className="btn-chips-add"
                id="deposit-btn"
                onClick={(e) => { e.stopPropagation(); onOpenDeposit?.(); }}
                title="Deposit SOL"
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
                    Deposit SOL
                  </button>
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); onOpenDeposit?.(); }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7 12 12 17 17 12"/><line x1="12" y1="17" x2="12" y2="3"/><line x1="3" y1="21" x2="21" y2="21"/></svg>
                    Withdraw SOL
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
