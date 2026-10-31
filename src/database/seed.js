const bcrypt = require('bcryptjs');
const { query } = require('../config/database');

async function seedDatabase() {
  try {
    console.log('Seeding initial data for ProHiring platform...');

    // 1. Seed Dynamic System Settings
    const defaultSettings = [
      ['app_name', 'ProHiring', 'general', 'Platform Name displayed across web & Android apps', 1],
      ['app_tagline', 'Premier School & Teacher Recruitment Network', 'general', 'Short platform slogan', 1],
      ['brand_domain', 'prohiring.in', 'general', 'Primary domain name', 1],
      ['support_email', 'support@prohiring.in', 'contact', 'Public support contact email', 1],
      ['support_phone', '+91 98765 43210', 'contact', 'Public support helpline number', 1],
      ['primary_color', '#4F46E5', 'branding', 'Primary theme color', 1],
      ['primary_dark', '#3730A3', 'branding', 'Dark variant of primary theme', 1],
      ['secondary_color', '#0EA5A4', 'branding', 'Secondary accent color', 1],
      ['allow_teacher_registration', 'true', 'system', 'Allow new teachers to register', 0],
      ['allow_school_registration', 'true', 'system', 'Allow new schools to register', 0],
      ['require_school_verification', 'true', 'system', 'Require admin review before school posts jobs', 0],
      ['require_otp_verification', 'true', 'system', 'Require OTP verification for registration', 0],
      ['android_min_version', '1.0.0', 'app', 'Minimum required Android app version', 1],
      ['smtp_host', 'smtp.gmail.com', 'smtp', 'SMTP server host', 0],
      ['smtp_port', '587', 'smtp', 'SMTP port (587 for TLS, 465 for SSL)', 0],
      ['smtp_secure', 'false', 'smtp', 'Use SSL (true for 465, false for 587)', 0],
      ['smtp_user', '', 'smtp', 'SMTP username or email address', 0],
      ['smtp_pass', '', 'smtp', 'SMTP password or app password', 0],
      ['smtp_from_email', 'noreply@prohiring.in', 'smtp', 'From email address', 0],
      ['smtp_from_name', 'ProHiring Recruitment', 'smtp', 'From display name', 0],
      ['autosmshub_api_key', '5062b348cd2829cbe17999155eb1a560e52b346c29e0ca1aaf55e88f19d08f1c', 'sms', 'AutoMsgHub API Key for WhatsApp OTP', 0],
      ['autosmshub_template_name', 'general_otp_verification', 'sms', 'WhatsApp OTP template name', 0],
      ['autosmshub_template_language', 'en', 'sms', 'WhatsApp OTP template language', 0],
      ['fast2sms_api_key', '', 'sms', 'Fast2SMS API Key fallback', 0],
      ['two_factor_api_key', '', 'sms', '2Factor.in API Key fallback', 0]
    ];

    for (const [key, val, cat, desc, isPub] of defaultSettings) {
      await query(
        `INSERT INTO system_settings (setting_key, setting_value, category, description, is_public)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), description = VALUES(description)`,
        [key, val, cat, desc, isPub]
      );
    }
    console.log('System settings seeded.');

    // 2. Seed Default Super Admin
    const adminPasswordHash = await bcrypt.hash('Admin@123456', 10);
    const existingAdmin = await query('SELECT id FROM users WHERE email = ?', ['admin@prohiring.in']);
    
    if (existingAdmin.length === 0) {
      await query(
        'INSERT INTO users (email, password, role, status) VALUES (?, ?, ?, ?)',
        ['admin@prohiring.in', adminPasswordHash, 'admin', 'active']
      );
      console.log('Admin account created (admin@prohiring.in / Admin@123456)');
    }

    // 3. Seed Demo School
    const schoolPasswordHash = await bcrypt.hash('School@123456', 10);
    const existingSchoolUser = await query('SELECT id FROM users WHERE email = ?', ['dps.delhi@prohiring.in']);
    
    let schoolProfileId;
    if (existingSchoolUser.length === 0) {
      const schoolUserResult = await query(
        'INSERT INTO users (email, password, role, status) VALUES (?, ?, ?, ?)',
        ['dps.delhi@prohiring.in', schoolPasswordHash, 'school', 'active']
      );
      
      const schoolProfileResult = await query(
        `INSERT INTO school_profiles 
         (user_id, school_name, board, registration_number, contact_person, phone, address, city, state, pincode, website, about, is_verified, verification_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          schoolUserResult.insertId,
          'Delhi Public Academy',
          'CBSE',
          'CBSE/AFF/2024/98124',
          'Dr. Rajesh Mehra (Principal)',
          '+91 9811223344',
          'Sector 12, RK Puram',
          'New Delhi',
          'Delhi',
          '110022',
          'https://dpsacademy.example.edu',
          'Delhi Public Academy is a premier CBSE affiliated institution dedicated to academic excellence, sports, and holistic student growth.',
          1,
          'approved'
        ]
      );
      schoolProfileId = schoolProfileResult.insertId;
      console.log('Demo school created: Delhi Public Academy');
    } else {
      const profile = await query('SELECT id FROM school_profiles WHERE user_id = ?', [existingSchoolUser[0].id]);
      if (profile.length > 0) schoolProfileId = profile[0].id;
    }

    // 4. Seed Demo Teacher
    const teacherPasswordHash = await bcrypt.hash('Teacher@123456', 10);
    const existingTeacher = await query('SELECT id FROM users WHERE email = ?', ['priya.sharma@prohiring.in']);
    
    if (existingTeacher.length === 0) {
      const teacherUserResult = await query(
        'INSERT INTO users (email, password, role, status) VALUES (?, ?, ?, ?)',
        ['priya.sharma@prohiring.in', teacherPasswordHash, 'teacher', 'active']
      );
      
      await query(
        `INSERT INTO teacher_profiles 
         (user_id, full_name, phone, gender, dob, highest_qualification, specialization, experience_years, primary_subject, secondary_subjects, current_city, current_state, expected_salary_min, expected_salary_max, bio, is_profile_completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          teacherUserResult.insertId,
          'Priya Sharma',
          '+91 9876501234',
          'female',
          '1994-05-18',
          'M.Sc, B.Ed',
          'Pure Mathematics & Statistics',
          5.5,
          'Mathematics',
          'Physics, Computer Science',
          'New Delhi',
          'Delhi',
          45000,
          65000,
          'Experienced and passionate PGT Mathematics teacher with over 5 years of proven track record preparing students for CBSE board exams and competitive olympiads.',
          1
        ]
      );
      console.log('Demo teacher created: Priya Sharma');
    }

    // 5. Seed Demo Jobs (if schoolProfileId exists)
    if (schoolProfileId) {
      const existingJobs = await query('SELECT id FROM jobs WHERE school_id = ?', [schoolProfileId]);
      if (existingJobs.length === 0) {
        await query(
          `INSERT INTO jobs 
           (school_id, title, designation, subject, qualification_required, experience_required, salary_min, salary_max, salary_negotiable, job_type, openings, description, responsibilities, benefits, city, state, deadline, status)
           VALUES 
           (?, 'PGT Mathematics Senior Teacher', 'PGT', 'Mathematics', 'M.Sc + B.Ed in Mathematics', '3-6 Years', 50000, 70000, 1, 'full_time', 2, 
            'We are seeking an energetic and experienced PGT Mathematics teacher for Classes XI and XII.',
            'Deliver engaging lessons, prepare board exam mock tests, guide students in science and math exhibitions.',
            'Health insurance, PF, Transport facility, Annual performance bonus',
            'New Delhi', 'Delhi', DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY), 'active'),

           (?, 'TGT English Language & Literature', 'TGT', 'English', 'M.A / B.A + B.Ed in English', '2-4 Years', 35000, 48000, 0, 'full_time', 1, 
            'Looking for a passionate TGT English teacher with excellent communication and creative writing coaching skills.',
            'Teach grades VI to X, organize literary events, debates, and drama club activities.',
            'Free transport, subsidized child education, Provident Fund',
            'New Delhi', 'Delhi', DATE_ADD(CURRENT_DATE, INTERVAL 25 DAY), 'active')`,
          [schoolProfileId, schoolProfileId]
        );
        console.log('Sample teaching jobs seeded.');
      }
    }

    console.log('Database seeding finished successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();
