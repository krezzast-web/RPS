const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'rps_user',
  password: process.env.DB_PASSWORD || 'rps_password',
  database: process.env.DB_NAME || 'rps_db',
});

async function migrate() {
  console.log('--- RUNNING LOCAL DATABASE MIGRATION ---');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Players table — new columns
    await client.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS x_username VARCHAR(100)');
    await client.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS custodial_synced_sol DECIMAL(18,9) DEFAULT 0');

    // Rooms table
    await client.query('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP');

    // New tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_likes (
        message_id INT REFERENCES messages(id) ON DELETE CASCADE,
        wallet_address VARCHAR(100) REFERENCES players(wallet_address) ON DELETE CASCADE,
        PRIMARY KEY (message_id, wallet_address)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS player_reports (
        id SERIAL PRIMARY KEY,
        reporter_wallet VARCHAR(100) REFERENCES players(wallet_address) ON DELETE CASCADE,
        reported_wallet VARCHAR(100) REFERENCES players(wallet_address) ON DELETE CASCADE,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS block_list (
        wallet_address VARCHAR(100) REFERENCES players(wallet_address) ON DELETE CASCADE,
        blocked_wallet VARCHAR(100) REFERENCES players(wallet_address) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (wallet_address, blocked_wallet)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS giveaway_entries (
        id SERIAL PRIMARY KEY,
        giveaway_id INT REFERENCES giveaways(id) ON DELETE CASCADE,
        wallet_address VARCHAR(100) REFERENCES players(wallet_address) ON DELETE CASCADE,
        tweet_url VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_entry UNIQUE(giveaway_id, wallet_address)
      )
    `);

    // Unique index on x_username (only where not null — allows multiple null values)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_x_username
      ON players(x_username)
      WHERE x_username IS NOT NULL
    `);

    await client.query('COMMIT');
    console.log('Migration successful!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
