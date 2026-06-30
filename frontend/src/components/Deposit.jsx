import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';

export default function Deposit({ onClose }) {
  const { walletAddress, solBalance, custodialWallet } = useGame();
  const [tab, setTab] = useState('deposit'); // 'deposit' | 'withdraw'
  const [copied, setCopied] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [currentBalance, setCurrentBalance] = useState(parseFloat(solBalance || 0));

  // Keep balance in sync with context
  useEffect(() => {
    setCurrentBalance(parseFloat(solBalance || 0));
  }, [solBalance]);

  const handleCopy = () => {
    if (!custodialWallet) return;
    navigator.clipboard.writeText(custodialWallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Pull on-chain balance
  const handleSyncBalance = async () => {
    if (!walletAddress || syncLoading) return;
    setSyncLoading(true);
    try {
      const res = await fetch('/api/wallet/sync-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress })
      });
      const data = await res.json();
      if (res.ok) setCurrentBalance(parseFloat(data.solBalance || 0));
    } catch (err) {
      console.error('Sync failed', err);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount < 0.001) return;
    setWithdrawLoading(true);
    setWithdrawResult(null);
    try {
      const res = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, solAmount: amount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWithdrawResult({ success: true, ...data });
      setCurrentBalance(prev => Math.max(0, prev - amount));
    } catch (err) {
      setWithdrawResult({ success: false, error: err.message });
    } finally {
      setWithdrawLoading(false);
    }
  };

  const withdrawFeeRate = 0.01;
  const netWithdraw = parseFloat(withdrawAmount || 0) * (1 - withdrawFeeRate);

  return (
    <div className="deposit-overlay" onClick={onClose}>
      <div className="deposit-modal sol-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="deposit-header">
          <div className="deposit-title-group">
            <span className="deposit-title-icon">◎</span>
            <span className="deposit-title">SOL Game Wallet</span>
          </div>
          <button className="deposit-close-btn" onClick={onClose}>×</button>
        </div>

        {/* Balance Bar */}
        <div className="sol-balance-bar">
          <div className="sol-balance-info">
            <span className="sol-balance-label">Game Balance</span>
            <span className="sol-balance-value">◎ {currentBalance.toFixed(4)} SOL</span>
          </div>
          <button
            className={`btn-sync-balance ${syncLoading ? 'loading' : ''}`}
            onClick={handleSyncBalance}
            disabled={syncLoading}
            title="Refresh balance from blockchain"
          >
            {syncLoading ? '⟳' : '⟳ Sync'}
          </button>
        </div>

        {/* Tabs */}
        <div className="deposit-tabs">
          <button
            className={`deposit-tab ${tab === 'deposit' ? 'active' : ''}`}
            onClick={() => setTab('deposit')}
          >
            Deposit SOL
          </button>
          <button
            className={`deposit-tab ${tab === 'withdraw' ? 'active' : ''}`}
            onClick={() => setTab('withdraw')}
          >
            Withdraw SOL
          </button>
        </div>

        {/* Body */}
        <div className="deposit-body">

          {/* DEPOSIT TAB */}
          {tab === 'deposit' && (
            <div className="sol-deposit-section animate-slide-down">
              <div className="sol-explainer">
                <p>Send SOL from your Phantom or Solflare wallet to your personal game wallet address below. Your balance updates automatically once the transaction confirms on-chain (~5 seconds).</p>
              </div>

              {custodialWallet ? (
                <>
                  <div className="sol-wallet-card">
                    <div className="sol-wallet-card-header">
                      <span>YOUR GAME WALLET ADDRESS</span>
                      <span className="network-pill">SOLANA MAINNET</span>
                    </div>
                    <div className="sol-wallet-address">{custodialWallet}</div>
                    <button
                      className={`btn-copy-sol ${copied ? 'copied' : ''}`}
                      onClick={handleCopy}
                    >
                      {copied ? '✓ Copied!' : 'Copy Address'}
                    </button>
                  </div>

                  <div className="sol-steps">
                    <div className="sol-step">
                      <span className="sol-step-num">1</span>
                      <span>Open Phantom or Solflare wallet</span>
                    </div>
                    <div className="sol-step">
                      <span className="sol-step-num">2</span>
                      <span>Send SOL to the address above</span>
                    </div>
                    <div className="sol-step">
                      <span className="sol-step-num">3</span>
                      <span>Click <strong>Sync</strong> to refresh your balance after ~5 seconds</span>
                    </div>
                  </div>

                  <div className="sol-warning-box">
                    <span>⚠</span>
                    <span>Send <strong>SOL only</strong> on the <strong>Solana mainnet</strong>. Sending from the wrong network will result in permanent loss of funds.</span>
                  </div>
                </>
              ) : (
                <div className="sol-wallet-loading">
                  <div className="deposit-loading">Generating your game wallet…</div>
                </div>
              )}
            </div>
          )}

          {/* WITHDRAW TAB */}
          {tab === 'withdraw' && (
            <div className="withdraw-section animate-slide-down">
              <div className="withdraw-info-card">
                <div className="withdraw-info-row">
                  <span>Network</span>
                  <strong>Solana Mainnet</strong>
                </div>
                <div className="withdraw-info-row">
                  <span>Processing Fee</span>
                  <strong style={{ color: '#f87171' }}>1%</strong>
                </div>
                <div className="withdraw-info-row">
                  <span>Minimum Withdrawal</span>
                  <strong>0.001 SOL</strong>
                </div>
                <div className="withdraw-info-row">
                  <span>Destination</span>
                  <strong style={{ fontSize: '0.78rem' }}>{walletAddress ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-8)}` : '—'}</strong>
                </div>
                <div className="withdraw-info-row">
                  <span>Game Balance</span>
                  <strong style={{ color: 'var(--accent-color)' }}>◎ {currentBalance.toFixed(4)} SOL</strong>
                </div>
              </div>

              <form onSubmit={handleWithdraw} className="withdraw-form">
                <div className="withdraw-input-group">
                  <label className="withdraw-input-label">Amount to Withdraw (SOL)</label>
                  <div className="withdraw-input-wrapper">
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      placeholder="e.g. 0.5"
                      className="withdraw-input"
                      value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-withdraw-max"
                      onClick={() => setWithdrawAmount(currentBalance.toFixed(4))}
                    >
                      MAX
                    </button>
                  </div>
                </div>

                {parseFloat(withdrawAmount) >= 0.001 && (
                  <div className="withdraw-preview-card animate-slide-down">
                    <div className="preview-row">
                      <span>You send:</span>
                      <span>◎ {parseFloat(withdrawAmount).toFixed(4)} SOL</span>
                    </div>
                    <div className="preview-row">
                      <span>Fee (1%):</span>
                      <span style={{ color: '#f87171' }}>-◎ {(parseFloat(withdrawAmount) * withdrawFeeRate).toFixed(6)} SOL</span>
                    </div>
                    <div className="preview-row total">
                      <span>You receive:</span>
                      <span style={{ color: 'var(--accent-color)' }}>◎ {netWithdraw.toFixed(6)} SOL</span>
                    </div>
                    <div className="preview-row" style={{ fontSize: '0.75rem', color: 'var(--muted-color)' }}>
                      <span>Destination:</span>
                      <span>{walletAddress ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-8)}` : '—'}</span>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className={`btn-withdraw-submit ${withdrawLoading ? 'loading' : ''}`}
                  disabled={
                    withdrawLoading ||
                    !withdrawAmount ||
                    parseFloat(withdrawAmount) < 0.001 ||
                    parseFloat(withdrawAmount) > currentBalance
                  }
                >
                  {withdrawLoading ? 'Processing…' : 'Withdraw to My Wallet'}
                </button>
              </form>

              {withdrawResult && (
                <div className={`withdraw-result-alert ${withdrawResult.success ? 'success' : 'error'}`}>
                  {withdrawResult.success ? (
                    <div className="alert-content">
                      <span className="alert-icon">✓</span>
                      <div>
                        <p>Withdrawal successful! <strong>◎ {withdrawResult.solAmount} SOL</strong> sent to your wallet.</p>
                        {withdrawResult.signature && (
                          <a
                            href={`https://solscan.io/tx/${withdrawResult.signature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--accent-color)', fontSize: '0.8rem' }}
                          >
                            View on Solscan ↗
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="alert-content">
                      <span className="alert-icon">✗</span>
                      <p>{withdrawResult.error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
