-- Reset player balances to 0 for a clean launch
UPDATE players SET sol_balance = 0;
SELECT 'Player balances reset to 0' as status;
