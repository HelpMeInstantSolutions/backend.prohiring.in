const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const configRoutes = require('./routes/config.routes');
const authRoutes = require('./routes/auth.routes');
const jobRoutes = require('./routes/job.routes');
const teacherRoutes = require('./routes/teacher.routes');
const schoolRoutes = require('./routes/school.routes');
const adminRoutes = require('./routes/admin.routes');
const networkRoutes = require('./routes/network.routes');
const communityRoutes = require('./routes/community.routes');
const notificationRoutes = require('./routes/notification.routes');
const { pool } = require('./config/database');
const { expireOldJobs } = require('./services/jobExpiry.service');

const app = express();

const PORT = process.env.PORT || 5000;

// Security & Logger Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan('dev'));

// CORS configuration supporting ProHiring Web Portal, Admin Panel, and local dev
const allowedOrigins = [
  'https://prohiring.in',
  'https://www.prohiring.in',
  'https://admin.prohiring.in',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001'
];

if (process.env.CLIENT_URL) {
  process.env.CLIENT_URL.split(',').forEach(url => {
    if (url && !allowedOrigins.includes(url.trim())) allowedOrigins.push(url.trim());
  });
}

if (process.env.ADMIN_URL) {
  process.env.ADMIN_URL.split(',').forEach(url => {
    if (url && !allowedOrigins.includes(url.trim())) allowedOrigins.push(url.trim());
  });
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow mobile apps, curl, postman or same-origin (origin is undefined)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all during development/flexible deployment
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads directory with Nextcloud WebDAV cloud storage fallback
const storageRoutes = require('./routes/storage.routes');
const storageController = require('./controllers/storage.controller');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.get('/uploads/:subfolder/:filename', storageController.serveFile);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const [rows] = await pool.query('SELECT 1 as connected');
    if (rows && rows[0].connected === 1) dbStatus = 'connected';
  } catch (err) {
    dbStatus = 'error: ' + err.message;
  }

  res.status(200).json({
    status: 'ok',
    platform: 'ProHiring Backend API',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/v1/config', configRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/teacher', teacherRoutes);
app.use('/api/v1/school', schoolRoutes);
app.use('/api/v1/network', networkRoutes);
app.use('/api/v1/community', communityRoutes);
app.use('/api/v1/storage', storageRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint '${req.method} ${req.originalUrl}' not found.`
  });
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'An unexpected error occurred on the server.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Auto-migrate missing columns and tables on startup
async function autoMigrateColumns() {
  try {
    // 1. Teacher profile columns
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
      ['profile_step', 'INT DEFAULT 1'],
      ['latitude', 'DECIMAL(10, 8) DEFAULT NULL'],
      ['longitude', 'DECIMAL(11, 8) DEFAULT NULL'],
      ['preferred_location', 'TEXT DEFAULT NULL'],
      ['teaching_levels', 'VARCHAR(255) DEFAULT NULL'],
      ['is_open_to_work', 'TINYINT(1) DEFAULT 1'],
      ['slug', 'VARCHAR(150) DEFAULT NULL']
    ];

    for (const [colName, colDef] of columnsToEnsure) {
      const [existing] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teacher_profiles' AND COLUMN_NAME = ?`,
        [colName]
      );
      if (existing.length === 0) {
        console.log(`[Auto-Migrate] Adding column '${colName}' to teacher_profiles...`);
        await pool.query(`ALTER TABLE \`teacher_profiles\` ADD COLUMN \`${colName}\` ${colDef};`);
      }
    }

    // Auto-populate slug for existing teacher profiles if empty
    await pool.query(
      `UPDATE teacher_profiles 
       SET slug = CONCAT(LOWER(REGEXP_REPLACE(COALESCE(full_name, 'educator'), '[^a-zA-Z0-9]+', '-')), '-', id) 
       WHERE slug IS NULL OR slug = ''`
    ).catch((e) => console.warn('Teacher slug migration notice:', e.message));

    // 2. School profile rich fields & location
    const schoolColumnsToEnsure = [
      ['established_year', 'INT DEFAULT NULL'],
      ['institution_type', 'VARCHAR(100) DEFAULT \'K-12 School\''],
      ['facilities', 'TEXT DEFAULT NULL'],
      ['student_count', 'VARCHAR(50) DEFAULT NULL'],
      ['faculty_count', 'VARCHAR(50) DEFAULT NULL'],
      ['social_links', 'TEXT DEFAULT NULL'],
      ['campus_photos', 'TEXT DEFAULT NULL'],
      ['latitude', 'DECIMAL(10, 8) DEFAULT NULL'],
      ['longitude', 'DECIMAL(11, 8) DEFAULT NULL'],
      ['maps_url', 'TEXT DEFAULT NULL'],
      ['banner_url', 'TEXT DEFAULT NULL'],
      ['slug', 'VARCHAR(150) DEFAULT NULL']
    ];

    for (const [colName, colDef] of schoolColumnsToEnsure) {
      const [existing] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_profiles' AND COLUMN_NAME = ?`,
        [colName]
      );
      if (existing.length === 0) {
        console.log(`[Auto-Migrate] Adding column '${colName}' to school_profiles...`);
        await pool.query(`ALTER TABLE \`school_profiles\` ADD COLUMN \`${colName}\` ${colDef};`);
      }
    }

    // 3. School staff directory table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`school_staff\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`school_id\` INT NOT NULL,
        \`teacher_id\` INT NOT NULL,
        \`status\` ENUM('current', 'previous') NOT NULL DEFAULT 'current',
        \`category\` VARCHAR(100) DEFAULT 'Teaching Staff',
        \`designation\` VARCHAR(150) DEFAULT NULL,
        \`subject\` VARCHAR(150) DEFAULT NULL,
        \`from_year\` VARCHAR(20) DEFAULT NULL,
        \`to_year\` VARCHAR(20) DEFAULT NULL,
        \`is_verified_by_school\` BOOLEAN DEFAULT 0,
        \`is_disputed\` BOOLEAN DEFAULT 0,
        \`dispute_reason\` TEXT DEFAULT NULL,
        \`disputed_at\` TIMESTAMP NULL DEFAULT NULL,
        \`disputed_by_school_id\` INT DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`uniq_school_teacher_role\` (\`school_id\`, \`teacher_id\`, \`status\`, \`designation\`),
        INDEX \`idx_school_status\` (\`school_id\`, \`status\`),
        FOREIGN KEY (\`school_id\`) REFERENCES \`school_profiles\` (\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`teacher_id\`) REFERENCES \`teacher_profiles\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure dispute columns exist if table was already created
    const staffDisputeCols = [
      ['is_disputed', 'BOOLEAN DEFAULT 0'],
      ['dispute_reason', 'TEXT DEFAULT NULL'],
      ['disputed_at', 'TIMESTAMP NULL DEFAULT NULL'],
      ['disputed_by_school_id', 'INT DEFAULT NULL']
    ];
    for (const [colName, colDef] of staffDisputeCols) {
      const [existing] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_staff' AND COLUMN_NAME = ?`,
        [colName]
      );
      if (existing.length === 0) {
        console.log(`[Auto-Migrate] Adding column '${colName}' to school_staff...`);
        await pool.query(`ALTER TABLE \`school_staff\` ADD COLUMN \`${colName}\` ${colDef};`);
      }
    }

    // 4. Notifications table & column assurance
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`notifications\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`type\` VARCHAR(50) NOT NULL DEFAULT 'info',
        \`title\` VARCHAR(255) NOT NULL DEFAULT 'Notification',
        \`message\` TEXT NOT NULL,
        \`data\` LONGTEXT DEFAULT NULL,
        \`link\` VARCHAR(255) DEFAULT NULL,
        \`is_read\` BOOLEAN DEFAULT 0,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_user_read\` (\`user_id\`, \`is_read\`),
        INDEX \`idx_user_created\` (\`user_id\`, \`created_at\` DESC),
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const notifCols = [
      ['type', "VARCHAR(50) NOT NULL DEFAULT 'info'"],
      ['title', "VARCHAR(255) NOT NULL DEFAULT 'Notification'"],
      ['message', 'TEXT DEFAULT NULL'],
      ['data', 'LONGTEXT DEFAULT NULL'],
      ['link', 'VARCHAR(255) DEFAULT NULL'],
      ['is_read', 'BOOLEAN DEFAULT 0'],
      ['created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP']
    ];
    for (const [colName, colDef] of notifCols) {
      const [existing] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = ?`,
        [colName]
      );
      if (existing.length === 0) {
        console.log(`[Auto-Migrate] Adding column '${colName}' to notifications...`);
        await pool.query(`ALTER TABLE \`notifications\` ADD COLUMN \`${colName}\` ${colDef};`);
      }
    }

    // 5. Job applications table & column assurance
    const appCols = [
      ['cover_note', 'TEXT DEFAULT NULL'],
      ['status', "VARCHAR(50) DEFAULT 'applied'"],
      ['interview_date', 'DATETIME DEFAULT NULL'],
      ['interview_notes', 'TEXT DEFAULT NULL'],
      ['applied_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
      ['created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP']
    ];
    for (const [colName, colDef] of appCols) {
      const [existing] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_applications' AND COLUMN_NAME = ?`,
        [colName]
      );
      if (existing.length === 0) {
        console.log(`[Auto-Migrate] Adding column '${colName}' to job_applications...`);
        await pool.query(`ALTER TABLE \`job_applications\` ADD COLUMN \`${colName}\` ${colDef};`);
      }
    }

    // 6. User Devices table for Android FCM push notification tokens
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`user_devices\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`fcm_token\` VARCHAR(255) NOT NULL UNIQUE,
        \`device_type\` VARCHAR(50) DEFAULT 'android',
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_user_device\` (\`user_id\`),
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Social follows graph table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`follows\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`follower_user_id\` INT NOT NULL,
        \`follower_role\` ENUM('teacher', 'school') NOT NULL,
        \`target_type\` ENUM('teacher', 'school') NOT NULL,
        \`target_id\` INT NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY \`uniq_follow\` (\`follower_user_id\`, \`target_type\`, \`target_id\`),
        INDEX \`idx_follower\` (\`follower_user_id\`),
        INDEX \`idx_target\` (\`target_type\`, \`target_id\`),
        FOREIGN KEY (\`follower_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Community posts, likes, and comments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`community_posts\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`author_user_id\` INT NOT NULL,
        \`author_role\` ENUM('teacher', 'school') NOT NULL,
        \`content\` TEXT NOT NULL,
        \`post_type\` ENUM('general', 'hiring_alert', 'achievement', 'pedagogy_tip', 'event') DEFAULT 'general',
        \`media_url\` VARCHAR(255) DEFAULT NULL,
        \`likes_count\` INT DEFAULT 0,
        \`comments_count\` INT DEFAULT 0,
        \`status\` ENUM('published', 'archived', 'flagged') DEFAULT 'published',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_post_created\` (\`created_at\` DESC),
        INDEX \`idx_post_author\` (\`author_user_id\`),
        FOREIGN KEY (\`author_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`post_likes\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`post_id\` INT NOT NULL,
        \`user_id\` INT NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY \`uniq_post_user_like\` (\`post_id\`, \`user_id\`),
        FOREIGN KEY (\`post_id\`) REFERENCES \`community_posts\` (\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`post_comments\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`post_id\` INT NOT NULL,
        \`user_id\` INT NOT NULL,
        \`comment\` TEXT NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_post_comments\` (\`post_id\`, \`created_at\` ASC),
        FOREIGN KEY (\`post_id\`) REFERENCES \`community_posts\` (\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);


    // Ensure qualification_suggestions table exists for dynamic autocomplete
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`qualification_suggestions\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`type\` ENUM('university', 'institute', 'degree') NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`use_count\` INT DEFAULT 1,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY \`uniq_type_name\` (\`type\`, \`name\`),
        INDEX \`idx_type_name\` (\`type\`, \`name\`(50))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed standard Indian universities and degrees if table is empty
    const [cntRows] = await pool.query('SELECT COUNT(*) as cnt FROM `qualification_suggestions`');
    if (cntRows[0]?.cnt === 0) {
      console.log('[Auto-Migrate] Seeding initial universities and degrees for autocomplete...');
      const defaultUniversities = [
        'CBSE (Central Board of Secondary Education)',
        'ICSE / ISC (CISCE Board)',
        'State Board (RBSE Rajasthan)',
        'State Board (UP Board)',
        'State Board (BSEH Haryana)',
        'State Board (BSEB Bihar)',
        'State Board (Maharashtra State Board)',
        'State Board (MP Board)',
        'State Board (PSEB Punjab)',
        'State Board (UK Board Uttarakhand)',
        'NIOS (National Institute of Open Schooling)',
        'Cambridge International (CIE / IGCSE)',
        'International Baccalaureate (IB)',
        'University of Delhi (DU)',
        'Banaras Hindu University (BHU)',
        'Jamia Millia Islamia (JMI)',
        'Aligarh Muslim University (AMU)',
        'Indira Gandhi National Open University (IGNOU)',
        'Maharshi Dayanand University (MDU Rohtak)',
        'Kurukshetra University (KUK)',
        'Chaudhary Charan Singh University (CCSU Meerut)',
        'University of Rajasthan (Jaipur)',
        'Panjab University (PU Chandigarh)',
        'University of Mumbai',
        'Savitribai Phule Pune University (SPPU)',
        'University of Calcutta',
        'University of Lucknow',
        'Dr. A.P.J. Abdul Kalam Technical University (AKTU)',
        'Guru Gobind Singh Indraprastha University (GGSIPU Delhi)',
        'Bangalore University',
        'Osmania University (Hyderabad)',
        'University of Madras (Chennai)',
        'Patna University',
        'Jai Narain Vyas University (JNVU Jodhpur)',
        'Mohanlal Sukhadia University (MLSU Udaipur)',
        'Maharaja Ganga Singh University (MGSU Bikaner)',
        'University of Kota',
        'Pandit Deendayal Upadhyaya Shekhawati University (Sikar)',
        'Barkatullah University (Bhopal)',
        'Jiwaji University (Gwalior)',
        'Devi Ahilya Vishwavidyalaya (DAVV Indore)',
        'Chaudhary Devi Lal University (CDLU Sirsa)',
        'Deen Dayal Upadhyaya Gorakhpur University',
        'Chhatrapati Shahu Ji Maharaj University (CSJMU Kanpur)',
        'Bundelkhand University (Jhansi)',
        'Dr. Bhimrao Ambedkar University (DBRAU Agra)',
        'National Council for Teacher Education (NCTE Recognized)'
      ];

      const defaultDegrees = [
        'B.Ed (Bachelor of Education)',
        'D.El.Ed / BTC (Diploma in Elementary Education)',
        'B.El.Ed (Bachelor of Elementary Education)',
        'M.Ed (Master of Education)',
        'Graduation (B.Sc / B.A / B.Com / B.Tech)',
        'Post Graduation (M.Sc / M.A / M.Com / M.Tech)',
        'Class 12th (Senior Secondary)',
        'Class 10th (Secondary)',
        'Ph.D / Doctorate',
        'NTT (Nursery Teacher Training)',
        'Diploma / Certificate in Education'
      ];

      for (const u of defaultUniversities) {
        await pool.query('INSERT IGNORE INTO qualification_suggestions (type, name, use_count) VALUES (?, ?, ?)', ['university', u, 10]);
      }
      for (const d of defaultDegrees) {
        await pool.query('INSERT IGNORE INTO qualification_suggestions (type, name, use_count) VALUES (?, ?, ?)', ['degree', d, 10]);
      }
    }

    // Ensure Post / Categories, Designations, and Subjects tables exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`job_categories\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(100) NOT NULL,
        \`slug\` VARCHAR(100) NOT NULL UNIQUE,
        \`description\` VARCHAR(255) DEFAULT NULL,
        \`sort_order\` INT DEFAULT 0,
        \`is_active\` BOOLEAN DEFAULT 1,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`job_designations\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`category_id\` INT NOT NULL,
        \`name\` VARCHAR(150) NOT NULL,
        \`code\` VARCHAR(50) DEFAULT NULL,
        \`description\` VARCHAR(255) DEFAULT NULL,
        \`sort_order\` INT DEFAULT 0,
        \`is_active\` BOOLEAN DEFAULT 1,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_category_id\` (\`category_id\`),
        FOREIGN KEY (\`category_id\`) REFERENCES \`job_categories\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`job_subjects\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`designation_id\` INT NOT NULL,
        \`name\` VARCHAR(150) NOT NULL,
        \`code\` VARCHAR(50) DEFAULT NULL,
        \`sort_order\` INT DEFAULT 0,
        \`is_active\` BOOLEAN DEFAULT 1,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_designation_id\` (\`designation_id\`),
        FOREIGN KEY (\`designation_id\`) REFERENCES \`job_designations\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Add optional post_type column to jobs if not present
    const [jobsColExisting] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'post_type'`
    );
    if (jobsColExisting.length === 0) {
      await pool.query("ALTER TABLE `jobs` ADD COLUMN `post_type` VARCHAR(100) DEFAULT 'Teaching Staff'");
    }

    // Seed initial Post -> Designation -> Subject taxonomy if empty
    const [catCntRows] = await pool.query('SELECT COUNT(*) as cnt FROM `job_categories`');
    if (catCntRows[0]?.cnt === 0) {
      console.log('[Auto-Migrate] Seeding initial posts, designations, and subjects taxonomy...');

      const seedTaxonomy = [
        {
          name: 'Teaching Staff',
          slug: 'teaching-staff',
          description: 'Classroom educators, subject specialists, and academic faculty',
          sortOrder: 1,
          designations: [
            {
              name: 'TGT (Trained Graduate Teacher - Classes VI-X)',
              code: 'TGT',
              description: 'Middle and secondary school teaching faculty',
              subjects: ['Science (Physics/Chemistry/Bio)', 'Mathematics', 'English', 'Hindi', 'Social Science (SST)', 'Sanskrit', 'Computer Science / IT', 'Art & Craft']
            },
            {
              name: 'PGT (Post Graduate Teacher - Classes XI-XII)',
              code: 'PGT',
              description: 'Senior secondary specialized subject educators',
              subjects: ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English Core', 'Hindi Core', 'Computer Science / IP', 'Accountancy', 'Business Studies', 'Economics', 'History', 'Political Science', 'Geography', 'Physical Education', 'Psychology', 'Sociology']
            },
            {
              name: 'PRT (Primary Teacher - Classes I-V)',
              code: 'PRT',
              description: 'Foundational primary stage teachers',
              subjects: ['All Subjects (General PRT)', 'English', 'Mathematics', 'EVS / Environmental Science', 'Hindi', 'Social Studies']
            },
            {
              name: 'NTT (Nursery / Kindergarten / Pre-Primary)',
              code: 'NTT',
              description: 'Early childhood development and playgroup educators',
              subjects: ['Early Childhood Education (ECCE)', 'Phonics & Rhymes', 'Activity & Creative Play']
            },
            {
              name: 'Principal / Vice Principal',
              code: 'LEADERSHIP',
              description: 'Academic leaders and institutional directors',
              subjects: ['Academic Administration', 'School Leadership & Operations']
            },
            {
              name: 'Special Educator',
              code: 'SPECIAL_ED',
              description: 'Inclusive education and learning support specialists',
              subjects: ['Special Education', 'Learning Disability Support', 'Speech & Hearing Support']
            }
          ]
        },
        {
          name: 'Non-Teaching Staff',
          slug: 'non-teaching-staff',
          description: 'Administrative, clerical, laboratory, and operational school personnel',
          sortOrder: 2,
          designations: [
            {
              name: 'Clerk / Office Assistant',
              code: 'CLERK',
              description: 'General office management and student record keeping',
              subjects: ['General Administration', 'Student Admissions & Records', 'Front Office Operations', 'Data Entry & Documentation']
            },
            {
              name: 'Accountant / Cashier',
              code: 'ACCOUNTANT',
              description: 'School financial management and fee processing',
              subjects: ['School Accounts & Tally ERP', 'Student Fee Collection', 'Payroll & Staff Salaries', 'Taxation & Audits']
            },
            {
              name: 'Librarian / Assistant Librarian',
              code: 'LIBRARIAN',
              description: 'Library cataloging, book issuance, and resource curation',
              subjects: ['Library Science & Cataloging', 'Digital Library Operations', 'Resource & Book Management']
            },
            {
              name: 'Lab Assistant / Lab Technician',
              code: 'LAB_ASST',
              description: 'Hands-on laboratory setup and science equipment management',
              subjects: ['Physics Laboratory', 'Chemistry Laboratory', 'Biology Laboratory', 'Computer Hardware & Networking Lab']
            },
            {
              name: 'Receptionist / Front Desk Executive',
              code: 'RECEPTIONIST',
              description: 'School reception, visitor management, and telephone inquiries',
              subjects: ['Front Desk & Reception', 'Parent Communication & Inquiries', 'Tele-calling & Admission Helpdesk']
            },
            {
              name: 'Counselor / Student Wellness',
              code: 'COUNSELOR',
              description: 'Mental health, behavioral wellness, and career guidance',
              subjects: ['Student Career Guidance', 'Child Psychology & Behavioral Counseling', 'Parent-Student Mediation']
            },
            {
              name: 'Peon / Multitasking Staff (MTS)',
              code: 'PEON',
              description: 'Classroom assistance and campus support operations',
              subjects: ['Office Support & Dispatch', 'Campus Maintenance & Utility']
            },
            {
              name: 'Transport Staff / Bus Driver',
              code: 'TRANSPORT',
              description: 'Safe student commute and vehicle operations',
              subjects: ['Heavy Bus Driving (RTO Licensed)', 'School Van Operations', 'Transport Supervisor']
            }
          ]
        },
        {
          name: 'Sports, Arts & Activity Staff',
          slug: 'sports-arts',
          description: 'Physical trainers, performing arts coaches, and creative instructors',
          sortOrder: 3,
          designations: [
            {
              name: 'Physical Education Teacher (PET) / Sports Coach',
              code: 'PET',
              description: 'Sports coaching, athletics, and physical fitness',
              subjects: ['Cricket Coaching', 'Football Coaching', 'Basketball Coaching', 'Badminton & Tennis', 'Athletics & Track', 'Yoga & Meditation', 'Martial Arts / Taekwondo']
            },
            {
              name: 'Music & Dance Teacher',
              code: 'MUSIC_DANCE',
              description: 'Vocal, instrumental music, and choreographic arts',
              subjects: ['Classical Vocal Music', 'Western Music & Choir', 'Keyboard & Piano', 'Guitar & Instrumental', 'Classical Indian Dance (Kathak/Bharatnatyam)', 'Western Contemporary Dance']
            },
            {
              name: 'Art & Craft / Fine Arts Teacher',
              code: 'ART_CRAFT',
              description: 'Visual arts, painting, and creative crafts',
              subjects: ['Drawing & Painting', 'Clay Modeling & Pottery', 'Origami & Crafting', 'Commercial & Digital Art']
            }
          ]
        }
      ];

      for (const cat of seedTaxonomy) {
        const [catRes] = await pool.query(
          'INSERT INTO job_categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)',
          [cat.name, cat.slug, cat.description, cat.sortOrder]
        );
        const catId = catRes.insertId;

        for (let dIdx = 0; dIdx < cat.designations.length; dIdx++) {
          const desig = cat.designations[dIdx];
          const [desigRes] = await pool.query(
            'INSERT INTO job_designations (category_id, name, code, description, sort_order) VALUES (?, ?, ?, ?, ?)',
            [catId, desig.name, desig.code, desig.description, dIdx + 1]
          );
          const desigId = desigRes.insertId;

          for (let sIdx = 0; sIdx < desig.subjects.length; sIdx++) {
            const subjName = desig.subjects[sIdx];
            await pool.query(
              'INSERT INTO job_subjects (designation_id, name, sort_order) VALUES (?, ?, ?)',
              [desigId, subjName, sIdx + 1]
            );
          }
        }
      }
      console.log('[Auto-Migrate] Initial taxonomy seeded successfully.');
    }

    // Ensure system_settings supports larger payloads (MEDIUMTEXT) and logo/favicon are public
    try {
      await pool.query('ALTER TABLE `system_settings` MODIFY COLUMN `setting_value` MEDIUMTEXT');
    } catch (e) {
      console.warn('[Auto-Migrate] setting_value alter warning:', e.message);
    }

    try {
      const [colRows] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'is_public'`
      );
      if (colRows.length === 0) {
        console.log('[Auto-Migrate] Adding column is_public to system_settings...');
        await pool.query('ALTER TABLE `system_settings` ADD COLUMN `is_public` BOOLEAN DEFAULT 1');
      }
      await pool.query(`
        UPDATE \`system_settings\` 
        SET \`is_public\` = 1 
        WHERE \`setting_key\` IN ('logo_url', 'favicon_url', 'app_name', 'app_tagline', 'brand_domain', 'primary_color', 'secondary_color', 'support_email', 'support_phone', 'whatsapp_enabled', 'whatsapp_number', 'whatsapp_message', 'whatsapp_position')
      `);

      await pool.query(`
        INSERT INTO \`system_settings\` (\`setting_key\`, \`setting_value\`, \`category\`, \`description\`, \`is_public\`)
        VALUES ('job_auto_expire_days', '15', 'recruitment', 'Number of days after which an active job posting automatically closes', 0)
        ON DUPLICATE KEY UPDATE \`setting_key\` = \`setting_key\`
      `);
    } catch (sErr) {
      console.warn('[Auto-Migrate] System settings alter warning:', sErr.message);
    }

    // Ensure jobs table has share_code column and backfill null codes
    try {
      const [jobCols] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'share_code'`
      );
      if (jobCols.length === 0) {
        console.log('[Auto-Migrate] Adding share_code column to jobs table...');
        await pool.query('ALTER TABLE `jobs` ADD COLUMN `share_code` VARCHAR(32) UNIQUE DEFAULT NULL');
      }

      // Ensure all jobs have a unique 16-character share_code slug
      const [shortOrNullJobs] = await pool.query(
        "SELECT id FROM `jobs` WHERE `share_code` IS NULL OR `share_code` = '' OR LENGTH(`share_code`) != 16 OR `share_code` REGEXP '^[0-9]+$'"
      );
      if (shortOrNullJobs && shortOrNullJobs.length > 0) {
        console.log(`[Auto-Migrate] Generating unique 16-character slugs for ${shortOrNullJobs.length} jobs...`);
        const crypto = require('crypto');
        for (const j of shortOrNullJobs) {
          const code = crypto.randomBytes(8).toString('hex');
          await pool.query('UPDATE `jobs` SET `share_code` = ? WHERE `id` = ?', [code, j.id]);
        }
      }
    } catch (jErr) {
      console.warn('[Auto-Migrate] Jobs share_code alter warning:', jErr.message);
    }

    // Ensure poster_url in jobs table
    try {
      const [posterColExisting] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'poster_url'`
      );
      if (posterColExisting.length === 0) {
        await pool.query("ALTER TABLE `jobs` ADD COLUMN `poster_url` VARCHAR(255) DEFAULT NULL");
        console.log('[Auto-Migrate] Added poster_url column to jobs.');
      }
    } catch (pColErr) {
      console.warn('[Auto-Migrate] Jobs poster_url column warning:', pColErr.message);
    }

    // Ensure interview_time and venue columns in jobs table
    try {
      const [itColExisting] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'interview_time'`
      );
      if (itColExisting.length === 0) {
        await pool.query("ALTER TABLE `jobs` ADD COLUMN `interview_time` VARCHAR(150) DEFAULT NULL");
        console.log('[Auto-Migrate] Added interview_time column to jobs.');
      }
    } catch (itErr) {
      console.warn('[Auto-Migrate] Jobs interview_time column warning:', itErr.message);
    }

    try {
      const [venueColExisting] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'venue'`
      );
      if (venueColExisting.length === 0) {
        await pool.query("ALTER TABLE `jobs` ADD COLUMN `venue` TEXT DEFAULT NULL");
        console.log('[Auto-Migrate] Added venue column to jobs.');
      }
    } catch (vErr) {
      console.warn('[Auto-Migrate] Jobs venue column warning:', vErr.message);
    }

    // Auto-seed Insight Classes Bhiwani & PGT Chemistry job with flyer
    try {
      const bcrypt = require('bcryptjs');
      const targetEmail = 'insightclassesbwn@gmail.com';
      const [existingUser] = await pool.query('SELECT id FROM users WHERE email = ?', [targetEmail]);
      let userId;
      if (existingUser.length === 0) {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('Insight@Bhiwani2026', salt);
        const [userRes] = await pool.query(
          'INSERT INTO users (email, password, role, status) VALUES (?, ?, ?, ?)',
          [targetEmail, hash, 'school', 'active']
        );
        userId = userRes.insertId;
        console.log(`[Auto-Seed] Created school user for Insight Classes (ID: ${userId})`);
      } else {
        userId = existingUser[0].id;
      }

      // Check school profile
      const [existingSchool] = await pool.query('SELECT id FROM school_profiles WHERE user_id = ?', [userId]);
      let schoolId;
      const schoolName = 'Insight Classes Bhiwani';
      const schoolCity = 'Bhiwani';
      const schoolState = 'Haryana';
      const schoolPhone = '7015785599';
      const schoolContact = 'Gaurav Sahu';
      const schoolAddress = 'Opp. Ambedkar Park, Sec 13 Market, Bhiwani';
      const schoolAbout = 'Insight Classes Bhiwani (Inspire - Educate - Innovate) is a premier educational coaching institute in Bhiwani specializing in NEET, JEE, NDA, UPSC & CA Foundation, 6th to 12th Board examinations, and entrance preparation for Sainik School, JNVST, RIMC, and RMS.';
      const schoolFacilities = JSON.stringify(['Digital Classrooms', 'Chemistry & Science Labs', 'Library & Self-Study Cabins', 'Doubt Resolution Desks', 'Periodic Test Series', 'Student Performance Mentorship']);

      if (existingSchool.length === 0) {
        const [schoolRes] = await pool.query(
          `INSERT INTO school_profiles 
           (user_id, school_name, contact_person, phone, board, institution_type, address, city, state, pincode, about, facilities, is_verified, verification_status, slug)
           VALUES (?, ?, ?, ?, 'CBSE', 'Coaching & Foundation Institute', ?, ?, ?, '127021', ?, ?, 1, 'approved', 'insight-classes-bhiwani')`,
          [userId, schoolName, schoolContact, schoolPhone, schoolAddress, schoolCity, schoolState, schoolAbout, schoolFacilities]
        );
        schoolId = schoolRes.insertId;
        console.log(`[Auto-Seed] Created school profile for Insight Classes (ID: ${schoolId})`);
      } else {
        schoolId = existingSchool[0].id;
        await pool.query(
          `UPDATE school_profiles SET 
            school_name = ?, contact_person = ?, phone = ?, address = ?, city = ?, state = ?, pincode = '127021',
            about = ?, facilities = ?, is_verified = 1, verification_status = 'approved', slug = 'insight-classes-bhiwani'
           WHERE id = ?`,
          [schoolName, schoolContact, schoolPhone, schoolAddress, schoolCity, schoolState, schoolAbout, schoolFacilities, schoolId]
        );
      }

      // Check if PGT Chemistry job exists
      const [existingJobs] = await pool.query(
        'SELECT id FROM jobs WHERE school_id = ? AND subject = ? AND designation LIKE ?',
        [schoolId, 'Chemistry', '%PGT%']
      );

      const flyerPosterPath = '/uploads/jobs/insight-classes-pgt-chemistry.jpg';
      const jobTitle = 'PGT Chemistry Teacher (Classes 9th - 12th | NEET & JEE Foundation)';
      const jobDesc = `Insight Classes Bhiwani is looking for a passionate, subject-matter expert PGT Chemistry Teacher for Classes 9th to 12th and NEET / JEE Foundation batches. Candidates must demonstrate in-depth mastery in Organic Chemistry, Inorganic Chemistry, and Physical Chemistry, paired with exceptional communication and classroom engagement skills.

Key Highlights:
• Institution: Insight Classes Bhiwani (Inspire - Educate - Innovate)
• Programs: NEET, JEE, NDA, UPSC & CA Foundation, 6th to 12th, Sainik School, JNVST
• Location: Opp. Ambedkar Park, Sec 13 Market, Bhiwani (Haryana)
• Remuneration: Attractive remuneration for deserving candidates
• Environment: Good working environment with high opportunities for professional growth`;

      const jobResp = `• Deliver conceptual, curriculum-aligned Chemistry lectures for Classes 9th to 12th (CBSE Board & Competitive Foundation).
• Coach students in Organic, Inorganic, and Physical Chemistry for NEET and JEE Mains foundations.
• Design periodic test series, evaluate assignments, and conduct regular one-on-one doubt clearing sessions.
• Track and enhance student academic progress, collaborating proactively with parents and academic coordinators.`;

      const jobBenefits = 'Good Working Environment, Opportunity for Growth, Attractive Remuneration for Deserving Candidates, Modern Classroom Infrastructure, Academic Autonomy';

      if (existingJobs.length === 0) {
        await pool.query(
          `INSERT INTO jobs 
           (school_id, title, designation, subject, qualification_required, experience_required, salary_min, salary_max, salary_negotiable, job_type, openings, description, responsibilities, benefits, city, state, deadline, status, share_code, poster_url)
           VALUES (?, ?, 'PGT (Post Graduate Teacher - Classes XI-XII)', 'Chemistry', 'M.Sc. Chemistry with B.Ed. (as per CBSE norms)', '2-5 Years', 45000, 75000, 1, 'full_time', 2, ?, ?, ?, 'Bhiwani', 'Haryana', DATE_ADD(CURRENT_DATE, INTERVAL 60 DAY), 'active', 'icb-chem', ?)`,
          [schoolId, jobTitle, jobDesc, jobResp, jobBenefits, flyerPosterPath]
        );
        console.log('[Auto-Seed] Successfully posted PGT Chemistry vacancy with flyer for Insight Classes Bhiwani!');
      } else {
        await pool.query(
          `UPDATE jobs SET 
            title = ?, description = ?, responsibilities = ?, benefits = ?, poster_url = ?, city = 'Bhiwani', state = 'Haryana', status = 'active'
           WHERE id = ?`,
          [jobTitle, jobDesc, jobResp, jobBenefits, flyerPosterPath, existingJobs[0].id]
        );
        console.log('[Auto-Seed] Updated PGT Chemistry vacancy with flyer for Insight Classes Bhiwani!');
      }
    } catch (seedErr) {
      console.warn('[Auto-Seed] Insight Classes seed notice:', seedErr.message);
    }

    // Ensure school_inquiries table exists for public queries and messages
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`school_inquiries\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`school_id\` INT NOT NULL,
          \`sender_name\` VARCHAR(150) NOT NULL,
          \`sender_email\` VARCHAR(150) DEFAULT NULL,
          \`sender_phone\` VARCHAR(25) DEFAULT NULL,
          \`subject\` VARCHAR(255) DEFAULT NULL,
          \`message\` TEXT NOT NULL,
          \`sender_role\` VARCHAR(50) DEFAULT 'visitor',
          \`sender_user_id\` INT DEFAULT NULL,
          \`status\` ENUM('unread', 'read', 'replied', 'archived') DEFAULT 'unread',
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX \`idx_inquiries_school\` (\`school_id\`, \`created_at\` DESC),
          FOREIGN KEY (\`school_id\`) REFERENCES \`school_profiles\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      // Ensure sender_email allows null on existing tables
      try {
        await pool.query('ALTER TABLE `school_inquiries` MODIFY COLUMN `sender_email` VARCHAR(150) DEFAULT NULL');
      } catch (_) {}
      console.log('[Auto-Migrate] school_inquiries table verified.');
    } catch (inqErr) {
      console.warn('[Auto-Migrate] school_inquiries table warning:', inqErr.message);
    }

    console.log('[Auto-Migrate] Teacher profile columns, suggestions, system_settings, and posts/designations taxonomy verified.');
  } catch (err) {
    console.warn('[Auto-Migrate] Column check warning:', err.message);
  }
}

// Start Server
app.listen(PORT, async () => {
  console.log(`===============================================`);
  console.log(` ProHiring Backend API running on port ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Health check: http://localhost:${PORT}/api/health`);
  console.log(`===============================================`);
  await autoMigrateColumns();
  await expireOldJobs();

  // Automatically check and expire overdue vacancies every 30 minutes
  setInterval(() => {
    expireOldJobs().catch((err) => console.warn('[Auto-Expire Cron Error]:', err.message));
  }, 30 * 60 * 1000);
});

module.exports = app;
