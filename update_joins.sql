-- Add room_joins table for dynamic player graphs
CREATE TABLE IF NOT EXISTS room_joins (
  id SERIAL PRIMARY KEY,
  room_tier VARCHAR(50) NOT NULL,
  wallet_address VARCHAR(100) NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
