const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'prohiring_db',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  dateStrings: true
});

// Helper for single query execution
const query = async (sql, params = []) => {
  const [results] = await pool.execute(sql, params);
  return results;
};

// Helper for transactions
const getTransactionConnection = async () => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  return connection;
};

module.exports = {
  pool,
  query,
  getTransactionConnection
};
