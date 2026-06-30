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
      wallet_address VARCHAR(50) PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      rating INT DEFAULT 1000,
      wins INT DEFAULT 0,
      losses INT DEFAULT 0,
      draws INT DEFAULT 0,
      sol_balance DECIMAL(12,4) DEFAULT 47.0000,
      last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      price DECIMAL(10,4) DEFAULT 0.05,
      fee DECIMAL(5,2) DEFAULT 0.1,
      status VARCHAR(20) DEFAULT 'OPEN',
      password VARCHAR(255),
      player1_wallet VARCHAR(50) REFERENCES players(wallet_address),
      player2_wallet VARCHAR(50) REFERENCES players(wallet_address),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_username VARCHAR(50) NOT NULL,
      sender_wallet VARCHAR(50) NOT NULL,
      room_id VARCHAR(50),
      text TEXT NOT NULL,
      likes INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(createTablesQuery);
    console.log('PostgreSQL database schema initialized successfully.');
  } catch (err) {
    console.error('Database connection / schema initialization failed:', err.message);
  }
}

// Check and verify tables schema on load
initDb();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
