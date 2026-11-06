const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function seedInsightClasses() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'prohiring_db'
  });

  try {
    console.log('--- Seeding Insight Classes Bhiwani & PGT Chemistry Vacancy ---');

    // Ensure poster_url column exists
    const [posterCol] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'poster_url'`
    );
    if (posterCol.length === 0) {
      console.log('Adding poster_url column to jobs table...');
      await connection.query("ALTER TABLE `jobs` ADD COLUMN `poster_url` VARCHAR(255) DEFAULT NULL");
    }

    const targetEmail = 'insightclassesbwn@gmail.com';
    const [existingUser] = await connection.query('SELECT id FROM users WHERE email = ?', [targetEmail]);
    let userId;

    if (existingUser.length === 0) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('Insight@Bhiwani2026', salt);
      const [userRes] = await connection.query(
        'INSERT INTO users (email, password_hash, role, is_verified, is_active) VALUES (?, ?, ?, 1, 1)',
        [targetEmail, hash, 'school']
      );
      userId = userRes.insertId;
      console.log(`Created school user: ${targetEmail} (ID: ${userId})`);
    } else {
      userId = existingUser[0].id;
      console.log(`Found existing user: ${targetEmail} (ID: ${userId})`);
    }

    const schoolName = 'Insight Classes Bhiwani';
    const schoolCity = 'Bhiwani';
    const schoolState = 'Haryana';
    const schoolPhone = '7015785599';
    const schoolContact = 'Gaurav Sahu';
    const schoolAddress = 'Opp. Ambedkar Park, Sec 13 Market, Bhiwani';
    const schoolAbout = 'Insight Classes Bhiwani (Inspire - Educate - Innovate) is a premier educational coaching institute in Bhiwani specializing in NEET, JEE, NDA, UPSC & CA Foundation, 6th to 12th Board examinations, and entrance preparation for Sainik School, JNVST, RIMC, and RMS.';
    const schoolFacilities = JSON.stringify(['Digital Classrooms', 'Chemistry & Science Labs', 'Library & Self-Study Cabins', 'Doubt Resolution Desks', 'Periodic Test Series', 'Student Performance Mentorship']);

    const [existingSchool] = await connection.query('SELECT id FROM school_profiles WHERE user_id = ?', [userId]);
    let schoolId;

    if (existingSchool.length === 0) {
      const [schoolRes] = await connection.query(
        `INSERT INTO school_profiles 
         (user_id, school_name, contact_person, phone, board, institution_type, address, city, state, pincode, about, facilities, is_verified, verification_status, slug)
         VALUES (?, ?, ?, ?, 'CBSE', 'Coaching & Foundation Institute', ?, ?, ?, '127021', ?, ?, 1, 'approved', 'insight-classes-bhiwani')`,
        [userId, schoolName, schoolContact, schoolPhone, schoolAddress, schoolCity, schoolState, schoolAbout, schoolFacilities]
      );
      schoolId = schoolRes.insertId;
      console.log(`Created school profile: ${schoolName} (ID: ${schoolId})`);
    } else {
      schoolId = existingSchool[0].id;
      await connection.query(
        `UPDATE school_profiles SET 
          school_name = ?, contact_person = ?, phone = ?, address = ?, city = ?, state = ?, pincode = '127021',
          about = ?, facilities = ?, is_verified = 1, verification_status = 'approved', slug = 'insight-classes-bhiwani'
         WHERE id = ?`,
        [schoolName, schoolContact, schoolPhone, schoolAddress, schoolCity, schoolState, schoolAbout, schoolFacilities, schoolId]
      );
      console.log(`Updated school profile: ${schoolName} (ID: ${schoolId})`);
    }

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

    const [existingJobs] = await connection.query(
      'SELECT id FROM jobs WHERE school_id = ? AND subject = ? AND designation LIKE ?',
      [schoolId, 'Chemistry', '%PGT%']
    );

    if (existingJobs.length === 0) {
      const [jobRes] = await connection.query(
        `INSERT INTO jobs 
         (school_id, title, designation, subject, qualification_required, experience_required, salary_min, salary_max, salary_negotiable, job_type, openings, description, responsibilities, benefits, city, state, deadline, status, share_code, poster_url)
         VALUES (?, ?, 'PGT (Post Graduate Teacher - Classes XI-XII)', 'Chemistry', 'M.Sc. Chemistry with B.Ed. (as per CBSE norms)', '2-5 Years', 45000, 75000, 1, 'full_time', 2, ?, ?, ?, 'Bhiwani', 'Haryana', DATE_ADD(CURRENT_DATE, INTERVAL 60 DAY), 'active', 'icb-chem', ?)`,
        [schoolId, jobTitle, jobDesc, jobResp, jobBenefits, flyerPosterPath]
      );
      console.log(`Created PGT Chemistry job vacancy (ID: ${jobRes.insertId}) with share_code: 'icb-chem'`);
    } else {
      await connection.query(
        `UPDATE jobs SET 
          title = ?, description = ?, responsibilities = ?, benefits = ?, poster_url = ?, city = 'Bhiwani', state = 'Haryana', status = 'active'
         WHERE id = ?`,
        [jobTitle, jobDesc, jobResp, jobBenefits, flyerPosterPath, existingJobs[0].id]
      );
      console.log(`Updated existing PGT Chemistry job vacancy (ID: ${existingJobs[0].id})`);
    }

    console.log('Seeding completed successfully!');
  } catch (err) {
    console.error('Error during seeding:', err);
  } finally {
    await connection.end();
  }
}

seedInsightClasses();
