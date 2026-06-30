const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'rps_user',
  password: process.env.DB_PASSWORD || 'rps_password',
  database: process.env.DB_NAME || 'rps_db',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function initDb() {
  const createTablesQuery = `
    CREATE TABLE IF NOT EXISTS players (
      wallet_address VARCHAR(100) PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      rating INT DEFAULT 1000,
      wins INT DEFAULT 0,
      losses INT DEFAULT 0,
      draws INT DEFAULT 0,
      sol_balance DECIMAL(18,9) DEFAULT 0,
      custodial_wallet_address VARCHAR(100),
      custodial_wallet_secret TEXT,
      last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      bet_sol DECIMAL(18,9) DEFAULT 0.01,
      fee_rate DECIMAL(5,4) DEFAULT 0.02,
      status VARCHAR(20) DEFAULT 'OPEN',
      password VARCHAR(255),
      player1_wallet VARCHAR(100) REFERENCES players(wallet_address),
      player2_wallet VARCHAR(100) REFERENCES players(wallet_address),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS room_tiers (
      id VARCHAR(30) PRIMARY KEY,
      title VARCHAR(100) NOT NULL,
      tier_type VARCHAR(30) NOT NULL,
      bet_sol DECIMAL(18,9) NOT NULL,
      fee_rate DECIMAL(5,4) DEFAULT 0.02,
      is_ranked BOOLEAN DEFAULT FALSE,
      display_order INT DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      room_id VARCHAR(50),
      player1_wallet VARCHAR(100),
      player2_wallet VARCHAR(100),
      winner_wallet VARCHAR(100),
      player1_move VARCHAR(1),
      player2_move VARCHAR(1),
      bet_sol DECIMAL(18,9),
      fee_sol DECIMAL(18,9),
      played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(100),
      type VARCHAR(20) NOT NULL,
      sol_amount DECIMAL(18,9) NOT NULL,
      fee_sol DECIMAL(18,9) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'PENDING',
      tx_signature VARCHAR(200),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_username VARCHAR(50) NOT NULL,
      sender_wallet VARCHAR(100) NOT NULL,
      room_id VARCHAR(50),
      text TEXT NOT NULL,
      likes INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS giveaways (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      prize_sol DECIMAL(18,9) DEFAULT 0,
      winner_count INT DEFAULT 1,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      end_date TIMESTAMP,
      is_auto BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS giveaway_winners (
      id SERIAL PRIMARY KEY,
      giveaway_id INT REFERENCES giveaways(id),
      wallet_address VARCHAR(100),
      username VARCHAR(50),
      sol_won DECIMAL(18,9),
      won_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS room_joins (
      id SERIAL PRIMARY KEY,
      room_tier VARCHAR(50) NOT NULL,
      wallet_address VARCHAR(100) NOT NULL,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_config (
      key VARCHAR(50) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(createTablesQuery);

    // Seed default room tiers if table is empty
    const tierCount = await pool.query('SELECT COUNT(*) FROM room_tiers');
    if (parseInt(tierCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO room_tiers (id, title, tier_type, bet_sol, fee_rate, is_ranked, display_order) VALUES
          ('ranked',  'Ranked Room',  'ranked',  0.10, 0.02, TRUE,  0),
          ('shrimp',  'Shrimp Room',  'shrimp',  0.01, 0.02, FALSE, 1),
          ('tuna',    'Tuna Room',    'tuna',    0.05, 0.02, FALSE, 2),
          ('dolphin', 'Dolphin Room', 'dolphin', 0.10, 0.02, FALSE, 3),
          ('shark',   'Shark Room',   'shark',   0.50, 0.02, FALSE, 4),
          ('whale',   'Whale Room',   'whale',   1.00, 0.02, FALSE, 5)
        ON CONFLICT (id) DO NOTHING
      `);
      console.log('Default room tiers seeded.');
    }

    // Seed platform config defaults
    await pool.query(`
      INSERT INTO platform_config (key, value) VALUES
        ('game_fee_rate', '0.02'),
        ('withdraw_fee_rate', '0.01'),
        ('giveaway_pool_rate', '0.30'),
        ('giveaway_pool_sol', '0'),
        ('platform_fees_collected_sol', '0'),
        ('sol_rpc_url', 'https://api.mainnet-beta.solana.com'),
        ('platform_wallet_address', '7o7YrgFHTbxWGezYeue36Lfv6vzXzEsZQVePY4ic66s6')
      ON CONFLICT (key) DO NOTHING
    `);

    console.log('PostgreSQL database schema initialized successfully.');
  } catch (err) {
    console.error('Database connection / schema initialization failed:', err.message);
  }
}

initDb();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
