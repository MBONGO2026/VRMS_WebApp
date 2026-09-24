// Single shared PostgreSQL connection pool for the whole app.
// Every route module requires this file and calls db.query(...) or db.getClient()
// for multi-statement operations that must run in one transaction.
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'swiftdrive_vrms',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};
