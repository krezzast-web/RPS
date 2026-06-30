-- Alter tables schema to support Twitter handle connection and Custom Room expiration
ALTER TABLE players ADD COLUMN IF NOT EXISTS x_username VARCHAR(100);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
