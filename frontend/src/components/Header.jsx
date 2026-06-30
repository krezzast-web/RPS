import React from 'react';
import { useGame } from '../context/GameContext';

export default function Header() {
  const { walletConnected, walletAddress, solBalance, username, connectWallet, disconnectWallet } = useGame();

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
          <span className="logo-subtitle">You lose nothing</span>
        </div>
      </div>

      <div className="header-right">
        {walletConnected ? (
          <div className="wallet-profile" onClick={disconnectWallet} title={`Connected: ${walletAddress}. Click to disconnect.`}>
            <div className="wallet-avatar-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
                <line x1="12" y1="12" x2="20" y2="12"></line>
                <circle cx="16" cy="12" r="1"></circle>
              </svg>
            </div>
            <div className="wallet-info">
              <span className="wallet-name">{username}</span>
              <span className="wallet-sol">{solBalance.toFixed(2)} SOL</span>
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
