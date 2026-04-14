require('dotenv').config();
const mysql = require('mysql2/promise');

// Connection pool — shared across requests
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'webperf_experiment',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

/**
 * Run a database query based on the B2 factor level.
 *
 * @param {'none'|'simple'|'complex'} level
 * @returns {Promise<Array>}
 */
async function runQuery(level) {
  if (level === 'none') return [];

  let sql;

  if (level === 'simple') {
    // Simple SELECT — fast, single table scan with LIMIT
    sql = `
      SELECT id, name, price, stock, rating
      FROM products
      ORDER BY id
      LIMIT 10
    `;
  } else if (level === 'complex') {
    // Complex JOIN with aggregation across all 10,000 rows — intentionally expensive
    sql = `
      SELECT
        c.name            AS category_name,
        COUNT(p.id)       AS product_count,
        AVG(p.price)      AS avg_price,
        SUM(p.stock)      AS total_stock,
        AVG(p.rating)     AS avg_rating,
        MAX(p.price)      AS max_price,
        MIN(p.price)      AS min_price
      FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE p.price > 10
      GROUP BY c.id, c.name
      ORDER BY product_count DESC
    `;
  }

  const [rows] = await pool.execute(sql);
  return rows;
}

module.exports = { runQuery };
