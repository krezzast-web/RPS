-- Create giveaway_entries table
CREATE TABLE IF NOT EXISTS giveaway_entries (
  id SERIAL PRIMARY KEY,
  giveaway_id INT REFERENCES giveaways(id) ON DELETE CASCADE,
  wallet_address VARCHAR(100) REFERENCES players(wallet_address) ON DELETE CASCADE,
  tweet_url VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_entry UNIQUE(giveaway_id, wallet_address)
);
