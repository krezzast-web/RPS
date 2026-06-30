-- ================================================================
-- Migration: CHIPS → Native SOL Custodial Wallet System
-- ================================================================

-- 1. Add new columns to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS sol_balance DECIMAL(18,9) DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS custodial_wallet_address VARCHAR(100);
ALTER TABLE players ADD COLUMN IF NOT EXISTS custodial_wallet_secret TEXT;

-- 2. Migrate chips_balance to sol_balance (1000 CHIPS = 1 SOL)
UPDATE players SET sol_balance = chips_balance / 1000 WHERE chips_balance > 0 AND sol_balance = 0;

-- 3. Update room_tiers: rename bet_chips to bet_sol and convert values
ALTER TABLE room_tiers ADD COLUMN IF NOT EXISTS bet_sol DECIMAL(18,9) DEFAULT 0.01;
UPDATE room_tiers SET bet_sol = bet_chips / 1000 WHERE bet_chips IS NOT NULL AND bet_sol = 0;

-- 4. Set correct SOL bet sizes for each tier
UPDATE room_tiers SET bet_sol = 0.10 WHERE id = 'ranked';
UPDATE room_tiers SET bet_sol = 0.01 WHERE id = 'shrimp';
UPDATE room_tiers SET bet_sol = 0.05 WHERE id = 'tuna';
UPDATE room_tiers SET bet_sol = 0.10 WHERE id = 'dolphin';
UPDATE room_tiers SET bet_sol = 0.50 WHERE id = 'shark';
UPDATE room_tiers SET bet_sol = 1.00 WHERE id = 'whale';

-- 5. Update rooms table: add bet_sol column
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bet_sol DECIMAL(18,9) DEFAULT 0.01;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS fee_rate DECIMAL(5,4) DEFAULT 0.02;
UPDATE rooms SET bet_sol = price / 1000 WHERE price > 0 AND bet_sol = 0;

-- 6. Update matches table: add bet_sol and fee_sol columns
ALTER TABLE matches ADD COLUMN IF NOT EXISTS bet_sol DECIMAL(18,9) DEFAULT 0;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS fee_sol DECIMAL(18,9) DEFAULT 0;
UPDATE matches SET bet_sol = bet_chips / 1000, fee_sol = fee_chips / 1000
  WHERE bet_chips IS NOT NULL AND bet_sol = 0;

-- 7. Update transactions table: add sol_amount and fee_sol columns
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sol_amount DECIMAL(18,9) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee_sol DECIMAL(18,9) DEFAULT 0;
UPDATE transactions SET sol_amount = COALESCE(sol_amount, chips_amount / 1000)
  WHERE chips_amount IS NOT NULL AND sol_amount = 0;

-- 8. Update giveaways table: add prize_sol column
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS prize_sol DECIMAL(18,9) DEFAULT 0;
UPDATE giveaways SET prize_sol = prize_chips / 1000
  WHERE prize_chips IS NOT NULL AND prize_sol = 0;

-- 9. Update giveaway_winners table: add sol_won column
ALTER TABLE giveaway_winners ADD COLUMN IF NOT EXISTS sol_won DECIMAL(18,9) DEFAULT 0;
UPDATE giveaway_winners SET sol_won = chips_won / 1000
  WHERE chips_won IS NOT NULL AND sol_won = 0;

-- 10. Update platform_config keys for SOL system
INSERT INTO platform_config (key, value) VALUES
  ('game_fee_rate', '0.02'),
  ('withdraw_fee_rate', '0.01'),
  ('giveaway_pool_rate', '0.30'),
  ('giveaway_pool_sol', '0'),
  ('platform_fees_collected_sol', '0'),
  ('sol_rpc_url', 'https://api.mainnet-beta.solana.com')
ON CONFLICT (key) DO NOTHING;

-- Update platform wallet address
UPDATE platform_config SET value = '7o7YrgFHTbxWGezYeue36Lfv6vzXzEsZQVePY4ic66s6'
  WHERE key = 'platform_wallet_address';

-- Remove obsolete config keys (keep them to avoid issues, just zero them out)
UPDATE platform_config SET value = '0' WHERE key IN ('chips_per_sol', 'giveaway_pool_chips', 'deposit_fee_rate');

SELECT 'Migration complete.' AS status;
