const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  try {
    const dbName = process.env.DB_NAME || 'prohiring_db';
    console.log(`Connecting to MySQL... creating database '${dbName}' if not exists.`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.query(`USE \`${dbName}\`;`);

    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing database schema migration...');
    try {
      await connection.query(schemaSql);
    } catch (sqlErr) {
      if (sqlErr.code === 'ER_DUP_KEYNAME') {
        console.warn('Notice: Indexes already exist, continuing with column checks...');
      } else {
        throw sqlErr;
      }
    }

    // Ensure all multi-step resume columns exist in teacher_profiles table
    const columnsToEnsure = [
      ['address', 'TEXT DEFAULT NULL'],
      ['pincode', 'VARCHAR(20) DEFAULT NULL'],
      ['languages', 'VARCHAR(255) DEFAULT NULL'],
      ['headline', 'VARCHAR(255) DEFAULT NULL'],
      ['family_details', 'LONGTEXT DEFAULT NULL'],
      ['qualifications_data', 'LONGTEXT DEFAULT NULL'],
      ['previous_jobs_data', 'LONGTEXT DEFAULT NULL'],
      ['current_job_data', 'LONGTEXT DEFAULT NULL'],
      ['tet_details', 'LONGTEXT DEFAULT NULL'],
      ['profile_step', 'INT DEFAULT 1']
    ];

    for (const [colName, colDef] of columnsToEnsure) {
      try {
        const [existing] = await connection.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teacher_profiles' AND COLUMN_NAME = ?`,
          [colName]
        );
        if (existing.length === 0) {
          console.log(`Adding column '${colName}' to teacher_profiles...`);
          await connection.query(`ALTER TABLE \`teacher_profiles\` ADD COLUMN \`${colName}\` ${colDef};`);
        }
      } catch (err) {
        console.warn(`Could not check or add column ${colName}:`, err.message);
      }
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
