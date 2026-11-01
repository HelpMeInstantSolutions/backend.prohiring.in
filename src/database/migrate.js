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
      ['post_type', 'VARCHAR(100) DEFAULT \'Teaching Staff\''],
      ['designation', 'VARCHAR(150) DEFAULT \'TGT (Trained Graduate Teacher - Classes VI-X)\''],
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

    const schoolColumnsToEnsure = [
      ['established_year', 'INT DEFAULT NULL'],
      ['institution_type', 'VARCHAR(100) DEFAULT \'K-12 School\''],
      ['facilities', 'TEXT DEFAULT NULL'],
      ['student_count', 'VARCHAR(50) DEFAULT NULL'],
      ['faculty_count', 'VARCHAR(50) DEFAULT NULL'],
      ['social_links', 'TEXT DEFAULT NULL'],
      ['campus_photos', 'TEXT DEFAULT NULL'],
      ['slug', 'VARCHAR(255) DEFAULT NULL']
    ];

    for (const [colName, colDef] of schoolColumnsToEnsure) {
      try {
        const [existing] = await connection.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_profiles' AND COLUMN_NAME = ?`,
          [colName]
        );
        if (existing.length === 0) {
          console.log(`Adding column '${colName}' to school_profiles...`);
          await connection.query(`ALTER TABLE \`school_profiles\` ADD COLUMN \`${colName}\` ${colDef};`);
        }
      } catch (err) {
        console.warn(`Could not check or add column ${colName} to school_profiles:`, err.message);
      }
    }

    // Backfill school slugs if empty
    try {
      const [schoolsWithoutSlug] = await connection.query(
        "SELECT id, school_name FROM school_profiles WHERE slug IS NULL OR slug = ''"
      );
      for (const s of schoolsWithoutSlug) {
        const baseSlug = (s.school_name || 'school')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || `school-${s.id}`;
        let finalSlug = baseSlug;
        const [duplicate] = await connection.query(
          "SELECT id FROM school_profiles WHERE slug = ? AND id != ?",
          [finalSlug, s.id]
        );
        if (duplicate.length > 0) {
          finalSlug = `${baseSlug}-${s.id}`;
        }
        await connection.query("UPDATE school_profiles SET slug = ? WHERE id = ?", [finalSlug, s.id]);
        console.log(`Backfilled slug '${finalSlug}' for school ID ${s.id} (${s.school_name})`);
      }
    } catch (slugErr) {
      console.warn('Notice during school slug backfill:', slugErr.message);
    }

    // Ensure WhatsApp platform settings exist
    try {
      const whatsappDefaults = [
        ['whatsapp_enabled', 'true', 'General', 1],
        ['whatsapp_number', '+919876543210', 'General', 1],
        ['whatsapp_message', 'Hello ProHiring Team, I need assistance regarding teaching jobs / school recruitment.', 'General', 1],
        ['whatsapp_position', 'bottom-right', 'General', 1]
      ];
      for (const [key, val, cat, isPub] of whatsappDefaults) {
        await connection.query(
          `INSERT INTO system_settings (setting_key, setting_value, category, is_public) 
           VALUES (?, ?, ?, ?) 
           ON DUPLICATE KEY UPDATE category = VALUES(category), is_public = VALUES(is_public)`,
          [key, val, cat, isPub]
        );
      }
    } catch (wsErr) {
      console.warn('Notice during whatsapp settings initialization:', wsErr.message);
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
