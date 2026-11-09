const bcrypt = require('bcryptjs');
const crypto = require('crypto');
let db = null;
try {
  db = require('../config/database');
} catch (e) {}

const SEEDED_DOMAINS = ['@seeded.prohiring.in'];
const SEEDED_EMAILS = [
  'apsumra@gmail.com',
  'dpa.delhi@seeded.prohiring.in',
  'stxaviers.hisar@seeded.prohiring.in',
  'insight.classes@seeded.prohiring.in',
  'rohit.sharma@seeded.prohiring.in',
  'priya.verma@seeded.prohiring.in',
  'sunil.kumar@seeded.prohiring.in',
  'anita.deshmukh@seeded.prohiring.in',
  'vikram.singh@seeded.prohiring.in',
  'pooja.yadav@seeded.prohiring.in'
];

/**
 * Returns current counts and status of database and seeded data
 */
async function getDeepSeedStatus() {
  try {
    const [totalUsers] = await db.query('SELECT COUNT(*) as count FROM users');
    const [totalSchools] = await db.query('SELECT COUNT(*) as count FROM school_profiles');
    const [totalTeachers] = await db.query('SELECT COUNT(*) as count FROM teacher_profiles');
    const [totalJobs] = await db.query('SELECT COUNT(*) as count FROM jobs');
    const [totalPosts] = await db.query('SELECT COUNT(*) as count FROM community_posts');

    // Count seeded users
    const [seededUsers] = await db.query(
      `SELECT COUNT(*) as count FROM users 
       WHERE email LIKE '%@seeded.prohiring.in' OR email = 'apsumra@gmail.com'`
    );

    // Count jobs associated with seeded users
    const [seededJobs] = await db.query(
      `SELECT COUNT(*) as count FROM jobs j
       JOIN school_profiles s ON j.school_id = s.id
       JOIN users u ON s.user_id = u.id
       WHERE u.email LIKE '%@seeded.prohiring.in' OR u.email = 'apsumra@gmail.com'`
    );

    const isSeeded = (seededUsers[0]?.count || 0) > 0 || (seededJobs[0]?.count || 0) > 0;

    return {
      success: true,
      isSeeded,
      counts: {
        users: totalUsers[0]?.count || 0,
        schools: totalSchools[0]?.count || 0,
        teachers: totalTeachers[0]?.count || 0,
        jobs: totalJobs[0]?.count || 0,
        posts: totalPosts[0]?.count || 0,
        seededUsers: seededUsers[0]?.count || 0,
        seededJobs: seededJobs[0]?.count || 0
      }
    };
  } catch (err) {
    console.error('[DeepSeed] getDeepSeedStatus error:', err.message);
    return {
      success: false,
      isSeeded: false,
      error: err.message,
      counts: { users: 0, schools: 0, teachers: 0, jobs: 0, posts: 0, seededUsers: 0, seededJobs: 0 }
    };
  }
}

/**
 * Runs deep seed: Creates comprehensive demo schools, jobs with flyers, teachers, and posts.
 */
async function runDeepSeed() {
  const logs = [];
  const log = (msg) => {
    logs.push(`[${new Date().toLocaleTimeString('en-IN')}] ${msg}`);
    console.log(`[DeepSeed] ${msg}`);
  };

  log('Starting Deep Seed execution...');
  const salt = await bcrypt.genSalt(10);
  const defaultPasswordHash = await bcrypt.hash('ProHiring@Demo2026', salt);

  let seededSchoolsCount = 0;
  let seededJobsCount = 0;
  let seededTeachersCount = 0;
  let seededPostsCount = 0;

  try {
    // =========================================================================
    // 1. SEED SCHOOLS
    // =========================================================================
    const schoolsToSeed = [
      {
        email: 'apsumra@gmail.com',
        name: 'Asian Public School',
        city: 'Hansi',
        state: 'Haryana',
        board: 'CBSE',
        phone: '+91 9671955655',
        contact: 'Principal / Recruitment Head',
        address: 'Umra-Hansi Road, VPO-Umra (Hansi)',
        website: 'https://asianpublicschool.in',
        logo: '/uploads/logos/asian-public-school-logo.png',
        banner: '/uploads/jobs/asian-public-school-hiring.jpg',
        about: 'Asian Public School, Umra (Hansi) is a premier CBSE-affiliated English-medium senior secondary school dedicated to excellence in education, character building, and academic success under the guiding motto "कर्म शिक्षा संस्कृति".'
      },
      {
        email: 'dpa.delhi@seeded.prohiring.in',
        name: 'Delhi Public Academy',
        city: 'Dwarka',
        state: 'Delhi',
        board: 'CBSE',
        phone: '+91 98101 23456',
        contact: 'Vice Principal (Academics)',
        address: 'Sector 14, Dwarka, New Delhi',
        website: 'https://dpa-delhi.edu.in',
        logo: '/uploads/logos/logo-1793548203584-408826875.png',
        banner: '/uploads/schools/banner-6-1793593695589.jpg',
        about: 'Delhi Public Academy is a distinguished K-12 institution offering world-class holistic education, state-of-the-art STEM labs, and athletic coaching with a focus on competitive examination foundations.'
      },
      {
        email: 'stxaviers.hisar@seeded.prohiring.in',
        name: "St. Xavier's International School",
        city: 'Hisar',
        state: 'Haryana',
        board: 'ICSE',
        phone: '+91 94160 88776',
        contact: 'Director of Human Resources',
        address: 'Delhi Road, Near Jindal Chowk, Hisar',
        website: 'https://stxaviershisar.org',
        logo: '/uploads/logos/logo-1793545906793-974775715.jpg',
        banner: '/uploads/schools/photo-1793604584326-199282967.jpg',
        about: "St. Xavier's International School is an esteemed ICSE-affiliated institution emphasizing intellectual curiosity, bilingual excellence, and values-driven leadership."
      },
      {
        email: 'insight.classes@seeded.prohiring.in',
        name: 'Insight Classes & Academy',
        city: 'Rohtak',
        state: 'Haryana',
        board: 'CBSE',
        phone: '+91 89505 25183',
        contact: 'Academic Director',
        address: 'Model Town, Near Rajiv Gandhi Sports Complex, Rohtak',
        website: 'https://insightclasses.in',
        logo: '/uploads/logos/asian-public-school-logo.png',
        banner: '/uploads/jobs/insight-classes-pgt-chemistry.jpg',
        about: 'Insight Classes is a leading senior secondary coaching & integrated schooling institute specializing in JEE Advanced, NEET-UG, and CBSE Board preparation.'
      }
    ];

    const schoolUserMap = {}; // email -> school_id

    for (const sc of schoolsToSeed) {
      let [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [sc.email]);
      let userId;
      if (existingUser.length === 0) {
        const [uRes] = await db.query(
          'INSERT INTO users (email, password, role, status) VALUES (?, ?, ?, ?)',
          [sc.email, defaultPasswordHash, 'school', 'active']
        );
        userId = uRes.insertId;
      } else {
        userId = existingUser[0].id;
      }

      let [existingProfile] = await db.query('SELECT id FROM school_profiles WHERE user_id = ?', [userId]);
      let schoolId;
      if (existingProfile.length === 0) {
        const [pRes] = await db.query(
          `INSERT INTO school_profiles 
           (user_id, school_name, city, state, board, phone, contact_person, address, website, logo_url, banner_url, about, verification_status, is_verified)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 1)`,
          [userId, sc.name, sc.city, sc.state, sc.board, sc.phone, sc.contact, sc.address, sc.website, sc.logo, sc.banner, sc.about]
        );
        schoolId = pRes.insertId;
      } else {
        schoolId = existingProfile[0].id;
        await db.query(
          `UPDATE school_profiles SET 
           school_name = ?, city = ?, state = ?, board = ?, phone = ?, contact_person = ?, address = ?, logo_url = ?, banner_url = ?, about = ?, is_verified = 1, verification_status = 'approved'
           WHERE id = ?`,
          [sc.name, sc.city, sc.state, sc.board, sc.phone, sc.contact, sc.address, sc.logo, sc.banner, sc.about, schoolId]
        );
      }
      schoolUserMap[sc.email] = schoolId;
      seededSchoolsCount++;
      log(`School seeded: "${sc.name}" (ID: ${schoolId}, City: ${sc.city})`);
    }

    // =========================================================================
    // 2. SEED REALISTIC VACANCIES
    // =========================================================================
    const jobsToSeed = [
      // Asian Public School Vacancies
      {
        schoolEmail: 'apsumra@gmail.com',
        slug: 'aps-ntt',
        title: 'NTT (Nursery Teacher Training) Teacher',
        post_type: 'Teaching Staff',
        designation: 'NTT (Nursery / Kindergarten / Pre-Primary)',
        subject: 'Early Childhood Education (ECCE)',
        qualification: 'NTT / ECCE Diploma / D.El.Ed with strong phonics & activity communication skills',
        experience: '0-2 Years',
        salary_min: 15000,
        salary_max: 22000,
        job_type: 'full_time',
        openings: 2,
        poster_url: '/uploads/jobs/asian-public-school-hiring.jpg',
        description: 'Asian Public School, Umra (Hansi) invites dynamic, creative, and affectionate NTT / Early Childhood Educators for Pre-Primary classes (Nursery, LKG, UKG).',
        deadline: '2026-12-15'
      },
      {
        schoolEmail: 'apsumra@gmail.com',
        slug: 'aps-prt-all',
        title: 'PRT (Primary Teacher - Classes I to V)',
        post_type: 'Teaching Staff',
        designation: 'PRT (Primary Teacher - Classes I-V)',
        subject: 'All Subjects (General PRT)',
        qualification: 'Graduate with D.El.Ed / B.Ed. Candidate should have sound pedagogy in English, Mathematics, and EVS.',
        experience: '1-3 Years',
        salary_min: 18000,
        salary_max: 28000,
        job_type: 'full_time',
        openings: 3,
        poster_url: '/uploads/jobs/asian-public-school-hiring.jpg',
        description: 'Urgent requirement for passionate Primary Teachers (PRT) to teach Classes I to V at Asian Public School campus.',
        deadline: '2026-12-15'
      },
      {
        schoolEmail: 'apsumra@gmail.com',
        slug: 'aps-tgt-english',
        title: 'TGT English Teacher (Classes VI to X)',
        post_type: 'Teaching Staff',
        designation: 'TGT (Trained Graduate Teacher - Classes VI-X)',
        subject: 'English',
        qualification: 'B.A. / M.A. in English Literature with B.Ed. CTET/HTET qualified candidates preferred.',
        experience: '2-5 Years',
        salary_min: 25000,
        salary_max: 35000,
        job_type: 'full_time',
        openings: 1,
        poster_url: '/uploads/jobs/asian-public-school-hiring.jpg',
        description: 'Asian Public School requires an articulate TGT English Teacher for middle and secondary sections with strong command over grammar and creative writing.',
        deadline: '2026-12-15'
      },
      {
        schoolEmail: 'apsumra@gmail.com',
        slug: 'aps-tgt-cs-it',
        title: 'TGT IT & Computer Science Teacher',
        post_type: 'Teaching Staff',
        designation: 'TGT (Trained Graduate Teacher - Classes VI-X)',
        subject: 'Computer Science / IT',
        qualification: 'BCA / B.Sc (Computer Science) / B.Tech (CS/IT) / MCA with B.Ed preferred.',
        experience: '1-4 Years',
        salary_min: 24000,
        salary_max: 32000,
        job_type: 'full_time',
        openings: 1,
        poster_url: '/uploads/jobs/asian-public-school-hiring.jpg',
        description: 'Seeking a knowledgeable Computer Science / IT Instructor for modern computer lab sessions, scratch programming, Python basics, and ICT curriculum.',
        deadline: '2026-12-15'
      },
      {
        schoolEmail: 'apsumra@gmail.com',
        slug: 'aps-clerk-admin',
        title: 'School Office Clerk / Front Desk Executive',
        post_type: 'Non-Teaching Staff',
        designation: 'Clerk / Office Assistant',
        subject: 'General Administration',
        qualification: 'Graduate with computer proficiency (MS Word, Excel, Email communication), basic accounting and student record documentation.',
        experience: '1-3 Years',
        salary_min: 15000,
        salary_max: 22000,
        job_type: 'full_time',
        openings: 1,
        poster_url: '/uploads/jobs/asian-public-school-hiring.jpg',
        description: 'Asian Public School requires a responsible and presentable Office Assistant / Front Desk Clerk for day-to-day administrative operations and admissions desk.',
        deadline: '2026-12-15'
      },
      {
        schoolEmail: 'apsumra@gmail.com',
        slug: 'aps-gardener-mali',
        title: 'School Campus Gardener (Mali)',
        post_type: 'Non-Teaching Staff',
        designation: 'Peon / Multitasking Staff (MTS)',
        subject: 'Campus Maintenance & Utility',
        qualification: 'Practical experience in gardening, lawn care, tree pruning, and green landscaping',
        experience: '1-3 Years',
        salary_min: 12000,
        salary_max: 18000,
        job_type: 'full_time',
        openings: 1,
        poster_url: '/uploads/jobs/asian-public-school-hiring.jpg',
        description: 'Asian Public School, Umra (Hansi) requires an experienced and hardworking Gardener (Mali) to maintain the school green campus, lawns, and floral beds.',
        deadline: '2026-12-15'
      },

      // Delhi Public Academy Vacancies
      {
        schoolEmail: 'dpa.delhi@seeded.prohiring.in',
        slug: 'dpa-pgt-maths',
        title: 'PGT Mathematics Teacher (Classes XI-XII)',
        post_type: 'Teaching Staff',
        designation: 'PGT (Post Graduate Teacher - Classes XI-XII)',
        subject: 'Mathematics',
        qualification: 'M.Sc (Mathematics) + B.Ed with proven board track record',
        experience: '3-6 Years',
        salary_min: 45000,
        salary_max: 60000,
        job_type: 'full_time',
        openings: 1,
        poster_url: '/uploads/jobs/poster-1793944958311-313544547.jpeg',
        description: 'Delhi Public Academy invites applications from experienced PGT Mathematics mentors for senior secondary board preparation and Olympiad training.',
        deadline: '2026-12-20'
      },
      {
        schoolEmail: 'dpa.delhi@seeded.prohiring.in',
        slug: 'dpa-pgt-physics',
        title: 'PGT Physics Teacher (Classes XI-XII)',
        post_type: 'Teaching Staff',
        designation: 'PGT (Post Graduate Teacher - Classes XI-XII)',
        subject: 'Physics',
        qualification: 'M.Sc (Physics) + B.Ed. Hands-on laboratory experiment skills essential.',
        experience: '3-7 Years',
        salary_min: 48000,
        salary_max: 65000,
        job_type: 'full_time',
        openings: 1,
        poster_url: '/uploads/jobs/poster-1793944958311-313544547.jpeg',
        description: 'Seeking an enthusiastic senior Physics educator with strong theoretical and experimental background to lead CBSE Classes XI and XII.',
        deadline: '2026-12-20'
      },
      {
        schoolEmail: 'dpa.delhi@seeded.prohiring.in',
        slug: 'dpa-counselor',
        title: 'Student Wellness & Career Counselor',
        post_type: 'Non-Teaching Staff',
        designation: 'Counselor / Student Wellness',
        subject: 'Child Psychology & Behavioral Counseling',
        qualification: 'M.A. in Psychology / Guidance & Counseling with experience in adolescent career mapping',
        experience: '2-5 Years',
        salary_min: 30000,
        salary_max: 42000,
        job_type: 'full_time',
        openings: 1,
        poster_url: '/uploads/jobs/poster-1793944958311-313544547.jpeg',
        description: 'Provide personalized psychological guidance, behavioral mentorship, and higher education career counseling for senior school students.',
        deadline: '2026-12-20'
      },

      // Insight Classes Vacancies
      {
        schoolEmail: 'insight.classes@seeded.prohiring.in',
        slug: 'insight-pgt-chemistry',
        title: 'PGT Senior Chemistry Faculty (IIT-JEE / NEET)',
        post_type: 'Teaching Staff',
        designation: 'PGT (Post Graduate Teacher - Classes XI-XII)',
        subject: 'Chemistry',
        qualification: 'M.Sc (Chemistry) / M.Tech / Ph.D with strong command over Organic and Physical Chemistry',
        experience: '3-8 Years',
        salary_min: 55000,
        salary_max: 85000,
        job_type: 'full_time',
        openings: 2,
        poster_url: '/uploads/jobs/insight-classes-pgt-chemistry.jpg',
        description: 'Top-tier Chemistry faculty required for competitive exam batches (NEET-UG & JEE Main/Advanced) with attractive performance incentives and accommodation assistance.',
        deadline: '2026-12-30'
      },
      {
        schoolEmail: 'insight.classes@seeded.prohiring.in',
        slug: 'insight-pgt-biology',
        title: 'Senior Biology Faculty (Botany & Zoology for NEET)',
        post_type: 'Teaching Staff',
        designation: 'PGT (Post Graduate Teacher - Classes XI-XII)',
        subject: 'Biology',
        qualification: 'M.Sc (Botany / Zoology / Biotechnology) with proven NEET coaching experience',
        experience: '2-6 Years',
        salary_min: 50000,
        salary_max: 75000,
        job_type: 'full_time',
        openings: 1,
        poster_url: '/uploads/jobs/insight-classes-pgt-chemistry.jpg',
        description: 'Lead medical entrance foundation and advanced batches with rigorous diagrammatic notes, test series analysis, and NCERT deep drills.',
        deadline: '2026-12-30'
      },

      // St. Xavier's International School Vacancies
      {
        schoolEmail: 'stxaviers.hisar@seeded.prohiring.in',
        slug: 'stxaviers-librarian',
        title: 'Head Librarian & Resource Center Manager',
        post_type: 'Non-Teaching Staff',
        designation: 'Librarian / Assistant Librarian',
        subject: 'Library Science & Cataloging',
        qualification: 'M.Lib.Sc / B.Lib.Sc with digital cataloging (Koha / ERP) skills',
        experience: '2-5 Years',
        salary_min: 24000,
        salary_max: 32000,
        job_type: 'full_time',
        openings: 1,
        poster_url: '/uploads/jobs/asian-public-school-hiring.jpg',
        description: "St. Xavier's seeks an organized, avid reader and certified Librarian to curate digital & print resources and promote student reading clubs.",
        deadline: '2026-12-25'
      },
      {
        schoolEmail: 'stxaviers.hisar@seeded.prohiring.in',
        slug: 'stxaviers-lab-assistant',
        title: 'Composite Science Laboratory Assistant',
        post_type: 'Non-Teaching Staff',
        designation: 'Lab Assistant / Lab Technician',
        subject: 'Physics Laboratory',
        qualification: 'B.Sc with practical lab apparatus maintenance & safety certification',
        experience: '1-3 Years',
        salary_min: 18000,
        salary_max: 25000,
        job_type: 'full_time',
        openings: 1,
        poster_url: '/uploads/jobs/asian-public-school-hiring.jpg',
        description: 'Manage Physics, Chemistry, and Biology experimental setups, equipment calibrations, and student lab safety protocols.',
        deadline: '2026-12-25'
      }
    ];

    for (const j of jobsToSeed) {
      const schoolId = schoolUserMap[j.schoolEmail];
      if (!schoolId) continue;

      const [existingJob] = await db.query(
        'SELECT id FROM jobs WHERE school_id = ? AND (slug = ? OR title = ?)',
        [schoolId, j.slug, j.title]
      );

      const shareCode = crypto.randomBytes(8).toString('hex');
      const interviewTime = '10:00 AM to 01:00 PM';
      const venue = 'School Main Campus Administrative Block';

      if (existingJob.length === 0) {
        await db.query(
          `INSERT INTO jobs 
           (school_id, slug, share_code, title, post_type, designation, subject, qualification_required, experience_required, salary_min, salary_max, salary_negotiable, job_type, openings, description, deadline, status, poster_url, interview_time, venue, city, state)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'active', ?, ?, ?, (SELECT city FROM school_profiles WHERE id = ?), (SELECT state FROM school_profiles WHERE id = ?))`,
          [
            schoolId, j.slug, shareCode, j.title, j.post_type, j.designation, j.subject,
            j.qualification, j.experience, j.salary_min, j.salary_max, j.job_type,
            j.openings, j.description, j.deadline, j.poster_url, interviewTime, venue, schoolId, schoolId
          ]
        );
      } else {
        await db.query(
          `UPDATE jobs SET 
           slug = ?, title = ?, post_type = ?, designation = ?, subject = ?, qualification_required = ?, experience_required = ?, salary_min = ?, salary_max = ?, job_type = ?, openings = ?, description = ?, deadline = ?, status = 'active', poster_url = ?, interview_time = ?, venue = ?
           WHERE id = ?`,
          [
            j.slug, j.title, j.post_type, j.designation, j.subject,
            j.qualification, j.experience, j.salary_min, j.salary_max, j.job_type,
            j.openings, j.description, j.deadline, j.poster_url, interviewTime, venue, existingJob[0].id
          ]
        );
      }
      seededJobsCount++;
      log(`Vacancy seeded: "${j.title}" (${j.post_type} - ${j.subject})`);
    }

    // =========================================================================
    // 3. SEED CANDIDATE TEACHER PROFILES
    // =========================================================================
    const teachersToSeed = [
      {
        email: 'rohit.sharma@seeded.prohiring.in',
        name: 'Rohit Sharma',
        gender: 'male',
        city: 'Hisar',
        state: 'Haryana',
        phone: '+91 98960 11223',
        designation: 'PGT (Post Graduate Teacher - Classes XI-XII)',
        subject: 'Mathematics',
        highest_qualification: 'M.Sc (Mathematics), B.Ed',
        experience_years: 5.5,
        expected_min: 45000,
        expected_max: 60000,
        avatar_url: '/uploads/avatars/avatar-demo-rohit.png',
        headline: 'Experienced PGT Mathematics Educator | CBSE & Olympiad Specialist',
        bio: 'Over 5.5 years of distinguished experience mentoring senior secondary students in Calculus, Algebra, and Coordinate Geometry. Former faculty at senior secondary institution with 98% distinction rate.'
      },
      {
        email: 'priya.verma@seeded.prohiring.in',
        name: 'Priya Verma',
        gender: 'female',
        city: 'Hansi',
        state: 'Haryana',
        phone: '+91 97280 44556',
        designation: 'TGT (Trained Graduate Teacher - Classes VI-X)',
        subject: 'English',
        highest_qualification: 'M.A. English Literature, B.Ed (CTET Qualified)',
        experience_years: 3.0,
        expected_min: 28000,
        expected_max: 38000,
        avatar_url: '/uploads/avatars/avatar-demo-priya.png',
        headline: 'Dedicated TGT English Faculty | Drama Club & Public Speaking Mentor',
        bio: 'Passionate language and literature teacher skilled in modern communicative pedagogy, theatre-in-education, and grammar fundamentals for middle school students.'
      },
      {
        email: 'sunil.kumar@seeded.prohiring.in',
        name: 'Sunil Kumar',
        gender: 'male',
        city: 'Delhi',
        state: 'Delhi',
        phone: '+91 99110 77889',
        designation: 'PRT (Primary Teacher - Classes I-V)',
        subject: 'All Subjects (General PRT)',
        highest_qualification: 'B.El.Ed, CTET Paper-I Qualified',
        experience_years: 2.0,
        expected_min: 22000,
        expected_max: 30000,
        avatar_url: '/uploads/avatars/avatar-demo-sunil.png',
        headline: 'Creative Primary Educator | Activity-Based Learning Specialist',
        bio: 'Trained in child psychology, phonics, and hands-on environmental sciences. Known for engaging classroom management and fostering curious young minds.'
      },
      {
        email: 'anita.deshmukh@seeded.prohiring.in',
        name: 'Dr. Anita Deshmukh',
        gender: 'female',
        city: 'Rohtak',
        state: 'Haryana',
        phone: '+91 94165 33221',
        designation: 'PGT (Post Graduate Teacher - Classes XI-XII)',
        subject: 'Chemistry',
        highest_qualification: 'Ph.D in Chemistry, M.Sc, B.Ed',
        experience_years: 6.0,
        expected_min: 55000,
        expected_max: 75000,
        avatar_url: '/uploads/avatars/avatar-demo-anita.png',
        headline: 'Senior Chemistry Faculty | JEE Main & NEET Prep Specialist',
        bio: 'Author of student guidance articles on reaction mechanisms and NCERT inorganic tricks. Passionate about inspiring girls into STEM and scientific research careers.'
      },
      {
        email: 'vikram.singh@seeded.prohiring.in',
        name: 'Vikram Singh',
        gender: 'male',
        city: 'Hansi',
        state: 'Haryana',
        phone: '+91 98120 66554',
        designation: 'Clerk / Office Assistant',
        subject: 'General Administration',
        highest_qualification: 'B.Com (Computers), Tally ERP Certified',
        experience_years: 3.5,
        expected_min: 18000,
        expected_max: 25000,
        avatar_url: '/uploads/avatars/avatar-demo-vikram.png',
        headline: 'School Administration & Fee ERP Executive',
        bio: 'Handled CBSE registration portals, student admission registers, fee collection receipts, and transport route schedules for senior secondary school.'
      }
    ];

    for (const t of teachersToSeed) {
      let [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [t.email]);
      let userId;
      if (existingUser.length === 0) {
        const [uRes] = await db.query(
          'INSERT INTO users (email, password, role, status) VALUES (?, ?, ?, ?)',
          [t.email, defaultPasswordHash, 'teacher', 'active']
        );
        userId = uRes.insertId;
      } else {
        userId = existingUser[0].id;
      }

      let [existingProfile] = await db.query('SELECT id FROM teacher_profiles WHERE user_id = ?', [userId]);
      if (existingProfile.length === 0) {
        await db.query(
          `INSERT INTO teacher_profiles 
           (user_id, full_name, phone, gender, current_city, current_state, designation, primary_subject, highest_qualification, experience_years, expected_salary_min, expected_salary_max, headline, bio, is_profile_completed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            userId, t.name, t.phone, t.gender, t.city, t.state, t.designation, t.subject,
            t.highest_qualification, t.experience_years, t.expected_min, t.expected_max,
            t.headline, t.bio
          ]
        );
      } else {
        await db.query(
          `UPDATE teacher_profiles SET 
           full_name = ?, phone = ?, gender = ?, current_city = ?, current_state = ?, designation = ?, primary_subject = ?, highest_qualification = ?, experience_years = ?, expected_salary_min = ?, expected_salary_max = ?, headline = ?, bio = ?, is_profile_completed = 1
           WHERE id = ?`,
          [
            t.name, t.phone, t.gender, t.city, t.state, t.designation, t.subject,
            t.highest_qualification, t.experience_years, t.expected_min, t.expected_max,
            t.headline, t.bio, existingProfile[0].id
          ]
        );
      }
      seededTeachersCount++;
      log(`Teacher seeded: "${t.name}" (${t.designation} - ${t.subject})`);
    }

    // =========================================================================
    // 4. SEED COMMUNITY ENGAGEMENT POSTS
    // =========================================================================
    const postsToSeed = [
      {
        authorEmail: 'apsumra@gmail.com',
        role: 'school',
        content: '🎉 Asian Public School Umra is thrilled to announce walk-in interviews for our upcoming academic session. We are recruiting passionate NTT, PRT, TGT, and administrative staff! View our open vacancies and apply directly on ProHiring.',
        post_type: 'hiring_alert',
        media_url: '/uploads/jobs/asian-public-school-hiring.jpg'
      },
      {
        authorEmail: 'rohit.sharma@seeded.prohiring.in',
        role: 'teacher',
        content: '📚 Quick teaching tip for mathematics educators: When introducing Calculus limits to Class XI students, start with graphical tangents before algebraic formulas. Visual intuition reduces math anxiety by 50%!',
        post_type: 'pedagogy_tip',
        media_url: null
      },
      {
        authorEmail: 'insight.classes@seeded.prohiring.in',
        role: 'school',
        content: '🔬 Congratulations to our NEET 2026 foundation batch for scoring 95%+ in mock test series! Hiring Chemistry & Biology senior mentors to expand our weekend batches.',
        post_type: 'achievement',
        media_url: '/uploads/jobs/insight-classes-pgt-chemistry.jpg'
      }
    ];

    for (const p of postsToSeed) {
      const [u] = await db.query('SELECT id FROM users WHERE email = ?', [p.authorEmail]);
      if (u.length > 0) {
        const authorId = u[0].id;
        const [existingPost] = await db.query(
          'SELECT id FROM community_posts WHERE author_user_id = ? AND content LIKE ?',
          [authorId, `%${p.content.slice(0, 30)}%`]
        );
        if (existingPost.length === 0) {
          await db.query(
            `INSERT INTO community_posts (author_user_id, author_role, content, post_type, media_url, likes_count, comments_count, status)
             VALUES (?, ?, ?, ?, ?, 5, 2, 'published')`,
            [authorId, p.role, p.content, p.post_type, p.media_url]
          );
          seededPostsCount++;
        }
      }
    }

    log(`Deep Seed completed successfully!`);
    log(`Summary: ${seededSchoolsCount} Schools, ${seededJobsCount} Vacancies, ${seededTeachersCount} Teachers, ${seededPostsCount} Posts.`);

    return {
      success: true,
      message: 'Deep Seed completed successfully.',
      seeded: {
        schools: seededSchoolsCount,
        jobs: seededJobsCount,
        teachers: seededTeachersCount,
        posts: seededPostsCount
      },
      logs
    };
  } catch (err) {
    log(`ERROR during Deep Seed: ${err.message}`);
    console.error('[DeepSeed] Execution failed:', err);
    return {
      success: false,
      message: `Deep Seed failed: ${err.message}`,
      logs
    };
  }
}

/**
 * Clears ONLY deep-seeded data without touching admin accounts, system settings, or real users.
 */
async function clearDeepSeed() {
  const logs = [];
  const log = (msg) => {
    logs.push(`[${new Date().toLocaleTimeString('en-IN')}] ${msg}`);
    console.log(`[DeepSeed] ${msg}`);
  };

  log('Starting Safe Clear of Deep Seed data...');

  try {
    // 1. Find all seeded user IDs
    const seededUsers = await db.query(
      `SELECT id, email, role FROM users 
       WHERE email LIKE '%@seeded.prohiring.in' OR email = 'apsumra@gmail.com'`
    );

    const userIds = seededUsers.map((u) => u.id);
    log(`Found ${userIds.length} seeded user accounts to clean.`);

    if (userIds.length === 0) {
      log('No seeded accounts found. Database is already clean.');
      return {
        success: true,
        message: 'No seeded accounts found. Database is already clean.',
        cleared: { users: 0, jobs: 0, schools: 0, teachers: 0, posts: 0 },
        logs
      };
    }

    // 2. Count related records for logging
    const [jobsCount] = await db.query(
      `SELECT COUNT(*) as count FROM jobs WHERE school_id IN (SELECT id FROM school_profiles WHERE user_id IN (?))`,
      [userIds]
    );
    const [schoolsCount] = await db.query(
      `SELECT COUNT(*) as count FROM school_profiles WHERE user_id IN (?)`,
      [userIds]
    );
    const [teachersCount] = await db.query(
      `SELECT COUNT(*) as count FROM teacher_profiles WHERE user_id IN (?)`,
      [userIds]
    );
    const [postsCount] = await db.query(
      `SELECT COUNT(*) as count FROM community_posts WHERE author_user_id IN (?)`,
      [userIds]
    );

    // 3. Delete seeded users (foreign key constraints cascade to school_profiles, teacher_profiles, jobs, posts, applications)
    // To ensure clean deletion even if foreign key cascade is disabled:
    const schoolIds = (await db.query(`SELECT id FROM school_profiles WHERE user_id IN (?)`, [userIds])).map(s => s.id);
    if (schoolIds.length > 0) {
      await db.query(`DELETE FROM applications WHERE job_id IN (SELECT id FROM jobs WHERE school_id IN (?))`, [schoolIds]);
      await db.query(`DELETE FROM saved_jobs WHERE job_id IN (SELECT id FROM jobs WHERE school_id IN (?))`, [schoolIds]);
      await db.query(`DELETE FROM jobs WHERE school_id IN (?)`, [schoolIds]);
      await db.query(`DELETE FROM school_profiles WHERE id IN (?)`, [schoolIds]);
    }

    await db.query(`DELETE FROM community_posts WHERE author_user_id IN (?)`, [userIds]);
    await db.query(`DELETE FROM teacher_profiles WHERE user_id IN (?)`, [userIds]);
    await db.query(`DELETE FROM users WHERE id IN (?)`, [userIds]);

    log(`Successfully removed ${userIds.length} seeded users.`);
    log(`Successfully removed ${jobsCount[0]?.count || 0} seeded vacancies.`);
    log(`Successfully removed ${schoolsCount[0]?.count || 0} seeded schools.`);
    log(`Successfully removed ${teachersCount[0]?.count || 0} seeded teachers.`);
    log(`Successfully removed ${postsCount[0]?.count || 0} seeded community posts.`);
    log('Database clear completed cleanly. System settings and real accounts preserved.');

    return {
      success: true,
      message: 'Deep Seed data cleared successfully.',
      cleared: {
        users: userIds.length,
        jobs: jobsCount[0]?.count || 0,
        schools: schoolsCount[0]?.count || 0,
        teachers: teachersCount[0]?.count || 0,
        posts: postsCount[0]?.count || 0
      },
      logs
    };
  } catch (err) {
    log(`ERROR during clearDeepSeed: ${err.message}`);
    console.error('[DeepSeed] Clear failed:', err);
    return {
      success: false,
      message: `Clear Deep Seed failed: ${err.message}`,
      logs
    };
  }
}

module.exports = {
  getDeepSeedStatus,
  runDeepSeed,
  clearDeepSeed
};
