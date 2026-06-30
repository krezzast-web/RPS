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
  try {
    await pool.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS x_username VARCHAR(100)');
    await pool.query('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP');
    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
