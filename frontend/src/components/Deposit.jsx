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

  useEffect(() => {
    fetch('/api/config/deposit-tiers')
      .then(r => r.json())
      .then(d => { setTiers(d.tiers || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Platform Solana wallet (placeholder — you'll set your real wallet here)
  const PLATFORM_WALLET = 'CONFIGURE_YOUR_PLATFORM_WALLET_ADDRESS_HERE';

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

  const styles = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' },
    modal: { background: '#111116', border: '1px solid #262626', borderRadius: '12px', width: '520px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    header: { padding: '20px 24px 16px', borderBottom: '1px solid #1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '18px', color: '#d4ff00', textTransform: 'uppercase', letterSpacing: '1px' },
    closeBtn: { background: 'none', border: 'none', color: '#666', fontSize: '20px', cursor: 'pointer', lineHeight: 1 },
    tabs: { display: 'flex', borderBottom: '1px solid #1e1e1e' },
    tab: (active) => ({ flex: 1, padding: '12px', background: 'none', border: 'none', color: active ? '#d4ff00' : '#555', fontWeight: active ? 700 : 400, fontSize: '12px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: active ? '2px solid #d4ff00' : '2px solid transparent' }),
    body: { padding: '20px 24px', overflowY: 'auto' },
    tierGrid: { display: 'flex', flexDirection: 'column', gap: '8px' },
    tierRow: (sel) => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: sel ? 'rgba(212,255,0,0.06)' : '#1a1a1a', border: `1px solid ${sel ? '#d4ff00' : '#262626'}`, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s' }),
    tierSol: { fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '16px', color: '#fff' },
    tierChips: { fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '15px', color: '#d4ff00' },
    tierBonus: (pct) => ({ fontSize: '11px', color: pct > 0 ? '#4ade80' : '#555', fontWeight: 600 }),
    tierFee: { fontSize: '10px', color: '#555' },
    proceedBtn: { width: '100%', background: '#d4ff00', color: '#000', border: 'none', borderRadius: '8px', padding: '14px', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '14px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '16px' },
    walletBox: { background: '#1a1a1a', border: '1px solid #262626', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' },
    walletAddr: { fontFamily: 'monospace', fontSize: '12px', color: '#d4ff00', wordBreak: 'break-all' },
    infoNote: { fontSize: '11px', color: '#888', lineHeight: 1.5 },
    infoGreen: { fontSize: '11px', color: '#4ade80', lineHeight: 1.5 },
    inputRow: { display: 'flex', gap: '8px', alignItems: 'flex-end' },
    input: { flex: 1, background: '#1a1a1a', border: '1px solid #262626', borderRadius: '6px', padding: '10px 14px', color: '#fff', fontSize: '14px', outline: 'none', fontFamily: 'Inter, sans-serif' },
    balanceTag: { fontSize: '11px', color: '#555', textAlign: 'right', marginBottom: '4px' },
    section: { marginBottom: '16px' },
    label: { fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', display: 'block' },
    resultBox: (ok) => ({ padding: '12px 16px', borderRadius: '8px', background: ok ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${ok ? '#4ade80' : '#ef4444'}`, fontSize: '13px', color: ok ? '#4ade80' : '#ef4444', marginTop: '12px' })
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>⬡ CHIPS Exchange</span>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={styles.tabs}>
          <button style={styles.tab(step !== 'withdraw')} onClick={() => setStep('select')}>Deposit CHIPS</button>
          <button style={styles.tab(step === 'withdraw')} onClick={() => setStep('withdraw')}>Withdraw</button>
        </div>

        <div style={styles.body}>
          {/* ── DEPOSIT TAB ── */}
          {step !== 'withdraw' && (
            <>
              {step === 'select' && (
                <>
                  <p style={{ ...styles.infoNote, marginBottom: '16px' }}>
                    Select how much SOL you want to exchange. Larger amounts get bonus CHIPS.
                    Rate: <strong style={{ color: '#d4ff00' }}>1 SOL = 1,000 CHIPS</strong>
                  </p>
                  {loading ? (
                    <div style={{ textAlign: 'center', color: '#555', padding: '20px' }}>Loading rates…</div>
                  ) : (
                    <div style={styles.tierGrid}>
                      {tiers.map((tier, i) => (
                        <div key={i} style={styles.tierRow(selected?.sol === tier.sol)} onClick={() => setSelected(tier)}>
                          <div>
                            <div style={styles.tierSol}>{tier.sol} SOL</div>
                            <div style={styles.tierFee}>Fee: {tier.feeChips} CHIPS ({3}%)</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={styles.tierChips}>{tier.totalChips.toLocaleString()} CHIPS</div>
                            <div style={styles.tierBonus(tier.bonusPct)}>
                              {tier.bonusPct > 0 ? `+${tier.bonusPct}% bonus` : 'No bonus'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selected && (
                    <button style={styles.proceedBtn} onClick={() => setStep('instructions')}>
                      Continue with {selected.sol} SOL → {selected.totalChips.toLocaleString()} CHIPS
                    </button>
                  )}
                </>
              )}

              {step === 'instructions' && selected && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <p style={styles.infoGreen}>✓ Send exactly <strong>{selected.sol} SOL</strong> to this address:</p>
                  </div>
                  <div style={styles.walletBox}>
                    <span style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>Platform Wallet Address (Solana)</span>
                    <span style={styles.walletAddr}>{PLATFORM_WALLET}</span>
                    <button
                      style={{ background: '#262626', border: 'none', color: '#d4ff00', padding: '6px 12px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 700, alignSelf: 'flex-start' }}
                      onClick={() => navigator.clipboard.writeText(PLATFORM_WALLET)}
                    >
                      Copy Address
                    </button>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <p style={styles.infoNote}>⚠ Send from your connected wallet only: <strong style={{ color: '#fff' }}>{walletAddress.slice(0,6)}…{walletAddress.slice(-4)}</strong></p>
                    <p style={styles.infoNote}>⚠ Minimum network confirmation time: ~20 seconds on Solana.</p>
                    <p style={styles.infoNote}>✓ Your <strong style={{ color: '#d4ff00' }}>{selected.totalChips.toLocaleString()} CHIPS</strong> will be credited automatically after confirmation.</p>
                  </div>
                  <button style={{ ...styles.proceedBtn, background: '#1a1a1a', color: '#666', border: '1px solid #262626', marginTop: '12px' }} onClick={() => setStep('select')}>
                    ← Back
                  </button>
                </>
              )}
            </>
          )}

          {/* ── WITHDRAW TAB ── */}
          {step === 'withdraw' && (
            <>
              <div style={styles.section}>
                <p style={{ ...styles.infoNote, marginBottom: '12px' }}>
                  Withdraw your CHIPS to SOL. Rate: <strong style={{ color: '#d4ff00' }}>1,000 CHIPS = 1 SOL</strong><br/>
                  Withdrawal fee: <strong style={{ color: '#f87171' }}>5%</strong> of amount. Processing within 24 hours.
                </p>
              </div>
              <div style={styles.section}>
                <label style={styles.label}>CHIPS to Withdraw</label>
                <div style={styles.balanceTag}>Your balance: <strong>{parseFloat(chipsBalance || 0).toLocaleString()}</strong> CHIPS</div>
                <form onSubmit={handleWithdraw}>
                  <div style={styles.inputRow}>
                    <input
                      type="number"
                      min="100"
                      step="1"
                      style={styles.input}
                      placeholder="Minimum 100 CHIPS"
                      value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value)}
                    />
                    <button
                      type="button"
                      style={{ ...styles.proceedBtn, width: 'auto', margin: 0, padding: '10px 14px', fontSize: '11px' }}
                      onClick={() => setWithdrawAmount(Math.floor(parseFloat(chipsBalance || 0)).toString())}
                    >
                      MAX
                    </button>
                  </div>
                  {withdrawAmount >= 100 && (
                    <div style={{ marginTop: '12px', padding: '10px 14px', background: '#1a1a1a', borderRadius: '6px', fontSize: '12px', color: '#888' }}>
                      Fee: <span style={{ color: '#f87171' }}>{Math.round(withdrawAmount * 0.05)} CHIPS</span>
                      &nbsp;→&nbsp;
                      You receive: <span style={{ color: '#d4ff00' }}>{((withdrawAmount * 0.95) / 1000).toFixed(4)} SOL</span>
                    </div>
                  )}
                  <button
                    type="submit"
                    style={{ ...styles.proceedBtn, background: withdrawLoading ? '#333' : '#d4ff00', cursor: withdrawLoading ? 'wait' : 'pointer' }}
                    disabled={withdrawLoading || !withdrawAmount || withdrawAmount < 100}
                  >
                    {withdrawLoading ? 'Submitting…' : 'Request Withdrawal'}
                  </button>
                </form>
                {withdrawResult && (
                  <div style={styles.resultBox(withdrawResult.success)}>
                    {withdrawResult.success
                      ? `✓ Request submitted! You will receive ${withdrawResult.solAmount} SOL within 24 hours.`
                      : `✗ ${withdrawResult.error}`
                    }
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
