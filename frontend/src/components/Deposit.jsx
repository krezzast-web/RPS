import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';

export default function Deposit({ onClose }) {
  const { walletAddress, chipsBalance } = useGame();
  const [tiers, setTiers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('select'); // 'select' | 'instructions' | 'withdraw'
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawResult, setWithdrawResult] = useState(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [platformWallet, setPlatformWallet] = useState('');

  useEffect(() => {
    fetch('/api/config/deposit-tiers')
      .then(r => r.json())
      .then(d => {
        setTiers(d.tiers || []);
        setPlatformWallet(d.platformWallet || '7o7YrgFHTbxWGezYeue36Lfv6vzXzEsZQVePY4ic66s6');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleWithdraw = async (e) => {
    e.preventDefault();
    const chips = parseFloat(withdrawAmount);
    if (!chips || chips < 100) return;
    setWithdrawLoading(true);
    setWithdrawResult(null);
    try {
      const res = await fetch('/api/withdraw/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, chipsAmount: chips })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWithdrawResult({ success: true, ...data });
    } catch (err) {
      setWithdrawResult({ success: false, error: err.message });
    } finally {
      setWithdrawLoading(false);
    }
  };

  return (
    <div className="deposit-overlay" onClick={onClose}>
      <div className="deposit-modal" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="deposit-header">
          <div className="deposit-title-group">
            <span className="deposit-title-icon">⬡</span>
            <span className="deposit-title">CHIPS Exchange</span>
          </div>
          <button className="deposit-close-btn" onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div className="deposit-tabs">
          <button 
            className={`deposit-tab ${step !== 'withdraw' ? 'active' : ''}`} 
            onClick={() => setStep('select')}
          >
            Buy CHIPS (Deposit)
          </button>
          <button 
            className={`deposit-tab ${step === 'withdraw' ? 'active' : ''}`} 
            onClick={() => setStep('withdraw')}
          >
            Cash Out (Withdraw)
          </button>
        </div>

        {/* Body */}
        <div className="deposit-body">
          {step !== 'withdraw' && (
            <>
              {step === 'select' && (
                <>
                  <div className="deposit-intro">
                    <p>Select a CHIPS bundle to purchase.</p>
                    <span className="exchange-rate-tag">Rate: 1 SOL = 1,000 CHIPS</span>
                  </div>

                  {loading ? (
                    <div className="deposit-loading">Loading bundles…</div>
                  ) : (
                    <div className="riot-grid">
                      {tiers.map((tier, i) => (
                        <div 
                          key={i} 
                          className={`riot-card ${selected?.sol === tier.sol ? 'selected' : ''}`}
                          onClick={() => setSelected(tier)}
                        >
                          <div className="riot-card-chips">
                            <span className="riot-chips-icon">⬡</span>
                            <span className="riot-chips-amount">{tier.totalChips.toLocaleString()}</span>
                          </div>
                          <div className="riot-card-label">CHIPS</div>
                          <div className="riot-card-price">{tier.sol} SOL</div>
                          <div className="riot-card-fee">Includes {tier.feeChips} CHIPS fee</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selected && (
                    <button className="btn-deposit-proceed" onClick={() => setStep('instructions')}>
                      Purchase Bundle for {selected.sol} SOL
                    </button>
                  )}
                </>
              )}

              {step === 'instructions' && selected && (
                <div className="deposit-instructions animate-slide-down">
                  <div className="instruction-step-header">
                    <span className="step-number">1</span>
                    <p>Send exactly <strong style={{ color: 'var(--accent-color)' }}>{selected.sol} SOL</strong> to the platform wallet address below:</p>
                  </div>

                  <div className="platform-wallet-box">
                    <div className="wallet-box-header">
                      <span>SOLANA RECEIVING ADDRESS</span>
                      <span className="network-pill">SOLANA MAINNET</span>
                    </div>
                    <div className="wallet-address-display">{platformWallet}</div>
                    <button 
                      className="btn-copy-address"
                      onClick={() => {
                        navigator.clipboard.writeText(platformWallet);
                        alert("Address copied to clipboard!");
                      }}
                    >
                      Copy Address
                    </button>
                  </div>

                  <div className="instruction-notes">
                    <div className="note-item">
                      <span className="note-bullet">⚠</span>
                      <span>Send from your connected wallet only: <strong>{walletAddress.slice(0, 8)}…{walletAddress.slice(-8)}</strong></span>
                    </div>
                    <div className="note-item">
                      <span className="note-bullet">⚠</span>
                      <span>Transactions take approximately 20 seconds to confirm on the Solana network.</span>
                    </div>
                    <div className="note-item">
                      <span className="note-bullet">✓</span>
                      <span>Your account will be credited with <strong>{selected.totalChips.toLocaleString()} CHIPS</strong> automatically once confirmed.</span>
                    </div>
                  </div>

                  <div className="instruction-actions">
                    <button className="btn-instruction-back" onClick={() => setStep('select')}>
                      ← Back to Bundles
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Withdraw Tab */}
          {step === 'withdraw' && (
            <div className="withdraw-section">
              <div className="withdraw-info-card">
                <div className="withdraw-info-row">
                  <span>Exchange Rate</span>
                  <strong>1,000 CHIPS = 1 SOL</strong>
                </div>
                <div className="withdraw-info-row">
                  <span>Processing Fee</span>
                  <strong style={{ color: '#f87171' }}>5%</strong>
                </div>
                <div className="withdraw-info-row">
                  <span>Your Balance</span>
                  <strong style={{ color: 'var(--accent-color)' }}>⬡ {parseFloat(chipsBalance || 0).toLocaleString()} CHIPS</strong>
                </div>
              </div>

              <form onSubmit={handleWithdraw} className="withdraw-form">
                <div className="withdraw-input-group">
                  <label className="withdraw-input-label">Amount to Cash Out (CHIPS)</label>
                  <div className="withdraw-input-wrapper">
                    <input 
                      type="number"
                      min="100"
                      step="1"
                      placeholder="Minimum 100 CHIPS"
                      className="withdraw-input"
                      value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value)}
                    />
                    <button 
                      type="button" 
                      className="btn-withdraw-max"
                      onClick={() => setWithdrawAmount(Math.floor(parseFloat(chipsBalance || 0)).toString())}
                    >
                      MAX
                    </button>
                  </div>
                </div>

                {withdrawAmount >= 100 && (
                  <div className="withdraw-preview-card animate-slide-down">
                    <div className="preview-row">
                      <span>Subtotal:</span>
                      <span>{parseFloat(withdrawAmount).toLocaleString()} CHIPS</span>
                    </div>
                    <div className="preview-row">
                      <span>Fee (5%):</span>
                      <span style={{ color: '#f87171' }}>-{Math.round(withdrawAmount * 0.05).toLocaleString()} CHIPS</span>
                    </div>
                    <div className="preview-row total">
                      <span>You Receive:</span>
                      <span style={{ color: 'var(--accent-color)' }}>{((withdrawAmount * 0.95) / 1000).toFixed(4)} SOL</span>
                    </div>
                  </div>
                )}

                <button 
                  type="submit" 
                  className={`btn-withdraw-submit ${withdrawLoading ? 'loading' : ''}`}
                  disabled={withdrawLoading || !withdrawAmount || withdrawAmount < 100 || withdrawAmount > parseFloat(chipsBalance || 0)}
                >
                  {withdrawLoading ? 'Processing Request…' : 'Submit Cash Out Request'}
                </button>
              </form>

              {withdrawResult && (
                <div className={`withdraw-result-alert ${withdrawResult.success ? 'success' : 'error'}`}>
                  {withdrawResult.success ? (
                    <div className="alert-content">
                      <span className="alert-icon">✓</span>
                      <p>Request submitted! You will receive <strong>{withdrawResult.solAmount} SOL</strong> within 24 hours.</p>
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
