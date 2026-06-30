-- Drop all legacy CHIPS columns from the live database
ALTER TABLE room_tiers DROP COLUMN IF EXISTS bet_chips;
ALTER TABLE players DROP COLUMN IF EXISTS chips_balance;
ALTER TABLE matches DROP COLUMN IF EXISTS bet_chips;
ALTER TABLE matches DROP COLUMN IF EXISTS fee_chips;
ALTER TABLE transactions DROP COLUMN IF EXISTS chips_amount;
ALTER TABLE transactions DROP COLUMN IF EXISTS fee_chips;
ALTER TABLE giveaways DROP COLUMN IF EXISTS prize_chips;
ALTER TABLE giveaway_winners DROP COLUMN IF EXISTS chips_won;
ALTER TABLE giveaway_winners DROP COLUMN IF EXISTS sol_equivalent;
SELECT 'All CHIPS columns removed. Database is clean.' AS status;
