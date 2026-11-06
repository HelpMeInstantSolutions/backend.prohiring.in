const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function seedAsianPublicSchool() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'prohiring_db'
  });

  try {
    console.log('--- Seeding Asian Public School Umra (Hansi) & Vacancies ---');

    // 1. School User
    const targetEmail = 'apsumra@gmail.com';
    const [existingUser] = await connection.query('SELECT id FROM users WHERE email = ?', [targetEmail]);
    let userId;

    if (existingUser.length === 0) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('AsianSchool@Umra2026', salt);
      const [userRes] = await connection.query(
        'INSERT INTO users (email, password, role, status) VALUES (?, ?, ?, ?)',
        [targetEmail, hash, 'school', 'active']
      );
      userId = userRes.insertId;
      console.log(`Created school user: ${targetEmail} (ID: ${userId})`);
    } else {
      userId = existingUser[0].id;
      console.log(`Found existing user: ${targetEmail} (ID: ${userId})`);
    }

    // 2. School Profile
    const schoolName = 'Asian Public School';
    const schoolCity = 'Hansi';
    const schoolState = 'Haryana';
    const schoolPhone = '+91 9671955655';
    const schoolContact = 'Principal / Recruitment Head';
    const schoolAddress = 'Umra-Hansi Road, VPO-Umra (Hansi)';
    const schoolAbout = 'Asian Public School, Umra (Hansi), Haryana is a premier CBSE-affiliated co-educational English-medium school dedicated to excellence in education, character building, and academic success under the guiding motto "कर्म शिक्षा संस्कृति". The school offers well-equipped modern laboratories, digital classrooms, comprehensive sports facilities, and an encouraging learning atmosphere.';
    const schoolFacilities = JSON.stringify([
      'CBSE Affiliated Curriculum',
      'Smart Digital Classrooms',
      'Modern Science & IT Laboratories',
      'Spacious Sports & Athletics Grounds',
      'Library & Reading Resource Center',
      'Dedicated Campus Transport Fleet',
      'Cultural & Activity Centers'
    ]);
    const schoolLogo = '/uploads/logos/asian-public-school-logo.png';
    const schoolBanner = '/uploads/jobs/asian-public-school-hiring.jpg';

    const [existingSchool] = await connection.query('SELECT id FROM school_profiles WHERE user_id = ?', [userId]);
    let schoolId;

    if (existingSchool.length === 0) {
      const [schoolRes] = await connection.query(
        `INSERT INTO school_profiles 
         (user_id, school_name, contact_person, phone, board, institution_type, address, city, state, pincode, about, facilities, logo_url, banner_url, is_verified, verification_status, slug)
         VALUES (?, ?, ?, ?, 'CBSE', 'Co-Educational Senior Secondary School', ?, ?, ?, '125033', ?, ?, ?, ?, 1, 'approved', 'asian-public-school-umra')`,
        [userId, schoolName, schoolContact, schoolPhone, schoolAddress, schoolCity, schoolState, schoolAbout, schoolFacilities, schoolLogo, schoolBanner]
      );
      schoolId = schoolRes.insertId;
      console.log(`Created school profile: ${schoolName} (ID: ${schoolId})`);
    } else {
      schoolId = existingSchool[0].id;
      await connection.query(
        `UPDATE school_profiles SET 
          school_name = ?, contact_person = ?, phone = ?, address = ?, city = ?, state = ?, pincode = '125033',
          about = ?, facilities = ?, logo_url = ?, banner_url = ?, is_verified = 1, verification_status = 'approved', slug = 'asian-public-school-umra'
         WHERE id = ?`,
        [schoolName, schoolContact, schoolPhone, schoolAddress, schoolCity, schoolState, schoolAbout, schoolFacilities, schoolLogo, schoolBanner, schoolId]
      );
      console.log(`Updated school profile: ${schoolName} (ID: ${schoolId})`);
    }

    // 3. Vacancies Data
    const flyerPosterPath = '/uploads/jobs/asian-public-school-hiring.jpg';
    const interviewTiming = '10:00 AM to 01:00 PM';
    const interviewVenue = 'School Campus, Umra-Hansi Road, VPO-Umra (Hansi)';

    const vacancies = [
      {
        slug: 'aps-ntt',
        postType: 'Teaching Staff',
        designation: 'NTT (Nursery Teacher Training - Pre-Primary)',
        subject: 'Pre-Primary / Nursery',
        title: 'NTT (Nursery Teacher Training) Teacher',
        openings: 1,
        qual: 'NTT / D.El.Ed / Early Childhood Education (as per CBSE norms)',
        exp: '1-3 Years',
        salMin: 18000,
        salMax: 30000,
        desc: `Asian Public School, Umra (Hansi) is looking for a passionate and caring NTT (Nursery Teacher Training) Educator for pre-primary classes. Candidates must have proficiency in spoken and written English with a good academic record.

Walk-in interview: 10:00 AM to 01:00 PM at School Campus, or send resume to apsumra@gmail.com. Contact: +91 9671955655.`,
        resp: `• Deliver interactive pre-primary lessons using playful, activity-based learning techniques.
• Cultivate foundational language, phonetics, numeracy, and motor skills in young children.
• Maintain a cheerful, supportive, safe, and disciplined classroom atmosphere.
• Keep parents regularly informed about their child's holistic growth and developmental milestones.`,
        benefits: 'Attractive Remuneration (No salary bar for deserving candidates), Supportive Work Environment, Excellent Campus Infrastructure, Professional Growth Opportunities'
      },
      {
        slug: 'aps-prt',
        postType: 'Teaching Staff',
        designation: 'PRT (Primary Teacher - Classes I-V)',
        subject: 'All Subjects (Primary Wing)',
        title: 'PRT (Primary Teacher - Classes I to V)',
        openings: 3,
        qual: 'Graduation with B.Ed. / D.El.Ed. (as per CBSE norms)',
        exp: '1-3 Years',
        salMin: 22000,
        salMax: 35000,
        desc: `Asian Public School, Umra (Hansi) invites applications for 3 Primary Teacher (PRT) positions for Classes I to V across foundational subjects. Candidates must have proficiency in spoken and written English and a sound academic record.

Walk-in interview: 10:00 AM to 01:00 PM at School Campus, or send resume to apsumra@gmail.com. Contact: +91 9671955655.`,
        resp: `• Teach primary school subjects aligned with the updated CBSE curriculum.
• Incorporate digital boards, charts, interactive worksheets, and group discussions.
• Monitor pupil academic progress, conduct regular assessments, and provide remedial support.
• Engage proactively with parents during periodic review meetings.`,
        benefits: 'Attractive Remuneration (No salary bar for deserving candidates), Excellent Working Culture, Modern School Infrastructure, Continuous Professional Development'
      },
      {
        slug: 'aps-tgt-english',
        postType: 'Teaching Staff',
        designation: 'TGT (Trained Graduate Teacher - Classes VI-X)',
        subject: 'English',
        title: 'TGT English Teacher (Classes VI to X)',
        openings: 1,
        qual: 'B.A. / M.A. in English with B.Ed. (as per CBSE norms)',
        exp: '2-5 Years',
        salMin: 28000,
        salMax: 45000,
        desc: `Asian Public School, Umra (Hansi) requires a dedicated TGT English Teacher for Classes VI-X. Candidates must possess outstanding command over English grammar, literature, creative writing, and spoken English.

Walk-in interview: 10:00 AM to 01:00 PM at School Campus, or send resume to apsumra@gmail.com. Contact: +91 9671955655.`,
        resp: `• Teach CBSE English Literature and Grammar for Middle & Secondary School students.
• Organize elocution, debates, creative writing, and drama workshops.
• Evaluate assignments, mentor board exam batches, and enhance student linguistic confidence.`,
        benefits: 'Competitive Pay (No salary bar for deserving candidates), Dynamic Academic Environment, Career Advancement'
      },
      {
        slug: 'aps-tgt-it',
        postType: 'Teaching Staff',
        designation: 'TGT (Trained Graduate Teacher - Classes VI-X)',
        subject: 'Computer Science / IT',
        title: 'TGT IT & Computer Science Teacher (Classes VI to X)',
        openings: 1,
        qual: 'BCA / MCA / B.Tech (CS/IT) / B.Sc. Comp. Sc. with B.Ed. (as per CBSE norms)',
        exp: '1-3 Years',
        salMin: 28000,
        salMax: 42000,
        desc: `Asian Public School, Umra (Hansi) is looking for an innovative TGT IT / Computer Teacher to manage the computer lab and teach IT and Coding curriculum for Classes VI to X.

Walk-in interview: 10:00 AM to 01:00 PM at School Campus, or send resume to apsumra@gmail.com. Contact: +91 9671955655.`,
        resp: `• Teach CBSE computer science, information technology, and programming fundamentals.
• Oversee and maintain school computer laboratory hardware, networks, and educational software.
• Guide students in digital safety, web technologies, and computational thinking.`,
        benefits: 'Competitive Salary (No salary bar for deserving candidates), Well-equipped Computer Lab, Growth Opportunities'
      },
      {
        slug: 'aps-tgt-hindi',
        postType: 'Teaching Staff',
        designation: 'TGT (Trained Graduate Teacher - Classes VI-X)',
        subject: 'Hindi / Sanskrit',
        title: 'TGT Hindi / Sanskrit Teacher (Classes VI to X)',
        openings: 1,
        qual: 'B.A. / M.A. in Hindi or Sanskrit with B.Ed. (as per CBSE norms)',
        exp: '2-5 Years',
        salMin: 28000,
        salMax: 42000,
        desc: `Asian Public School, Umra (Hansi) is hiring a qualified TGT Hindi / Sanskrit Teacher for Classes VI-X. Candidates with sound grammatical knowledge and engaging teaching skills are welcome.

Walk-in interview: 10:00 AM to 01:00 PM at School Campus, or send resume to apsumra@gmail.com. Contact: +91 9671955655.`,
        resp: `• Deliver CBSE curriculum-aligned lectures in Hindi and Sanskrit for Classes VI-X.
• Impart strong foundational grammar, composition, and correct pronunciation.
• Organize cultural festivals, recitation competitions, and Sanskrit shloka recitals.`,
        benefits: 'Competitive Compensation (No salary bar for deserving candidates), Respectful Environment, Long-term Stability'
      },
      {
        slug: 'aps-tgt-sst',
        postType: 'Teaching Staff',
        designation: 'TGT (Trained Graduate Teacher - Classes VI-X)',
        subject: 'Social Science',
        title: 'TGT Social Science (SST) Teacher (Classes VI to X)',
        openings: 1,
        qual: 'B.A. / M.A. in History / Geography / Pol. Science / Economics with B.Ed. (as per CBSE norms)',
        exp: '2-5 Years',
        salMin: 28000,
        salMax: 42000,
        desc: `Asian Public School, Umra (Hansi) requires an experienced and passionate TGT Social Science (History, Civics, Geography, Economics) Teacher for Classes VI-X.

Walk-in interview: 10:00 AM to 01:00 PM at School Campus, or send resume to apsumra@gmail.com. Contact: +91 9671955655.`,
        resp: `• Teach CBSE Social Science curriculum with engaging visual charts and historical narratives.
• Coach students on map pointing, analytical answers, and board exam preparation.
• Conduct school social science quizzes, exhibitions, and model parliament sessions.`,
        benefits: 'Attractive Remuneration (No salary bar for deserving candidates), Friendly Work Atmosphere'
      },
      {
        slug: 'aps-clerk',
        postType: 'Non-Teaching Staff',
        designation: 'Clerk / Office Assistant',
        subject: 'School Administration & Front Office',
        title: 'School Office Clerk / Front Desk Executive',
        openings: 1,
        qual: 'Graduation with proficiency in MS Office, basic accounting, and English communication',
        exp: '1-3 Years',
        salMin: 18000,
        salMax: 28000,
        desc: `Asian Public School, Umra (Hansi) is seeking a competent Clerk for school administrative records, parent inquiries, admissions documentation, and fee management.

Walk-in interview: 10:00 AM to 01:00 PM at School Campus, or send resume to apsumra@gmail.com. Contact: +91 9671955655.`,
        resp: `• Manage front office reception, visitor records, and incoming phone queries.
• Maintain student admission records, transfer certificates, and CBSE school paperwork.
• Support fee reconciliation, digital spreadsheets, and routine office documentation.`,
        benefits: 'Decent Salary (No salary bar for deserving candidates), Pleasant Office Environment'
      },
      {
        slug: 'aps-gardener',
        postType: 'Non-Teaching Staff',
        designation: 'Gardener / Ground Staff',
        subject: 'Campus Maintenance & Landscaping',
        title: 'School Campus Gardener (Mali)',
        openings: 1,
        qual: 'Practical experience in gardening, lawn care, tree pruning, and landscaping',
        exp: '1-3 Years',
        salMin: 12000,
        salMax: 18000,
        desc: `Asian Public School, Umra (Hansi) requires an experienced and hardworking Gardener (Mali) to maintain the school green campus, lawns, floral beds, and potted plants.

Walk-in interview at school campus or contact +91 9671955655.`,
        resp: `• Maintain school lawns, flower beds, and ornamental greenery with regular watering and pruning.
• Nurture seasonal flowering plants, trees, and upkeep green campus cleanliness.
• Safeguard gardening equipment and coordinate organic fertilizing.`,
        benefits: 'Regular Salary (No bar for deserving candidates), Respectful Campus Atmosphere'
      }
    ];

    for (const v of vacancies) {
      const [existingJob] = await connection.query(
        'SELECT id, share_code FROM jobs WHERE school_id = ? AND (slug = ? OR title = ?)',
        [schoolId, v.slug, v.title]
      );

      let shareCode = existingJob[0]?.share_code;
      if (!shareCode || shareCode.length !== 16) {
        shareCode = crypto.randomBytes(8).toString('hex');
      }

      if (existingJob.length === 0) {
        const [jobRes] = await connection.query(
          `INSERT INTO jobs 
           (school_id, title, designation, subject, qualification_required, experience_required, salary_min, salary_max, salary_negotiable, job_type, openings, description, responsibilities, benefits, city, state, deadline, status, share_code, slug, poster_url, post_type, interview_time, venue)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'full_time', ?, ?, ?, ?, ?, ?, DATE_ADD(CURRENT_DATE, INTERVAL 45 DAY), 'active', ?, ?, ?, ?, ?, ?)`,
          [
            schoolId,
            v.title,
            v.designation,
            v.subject,
            v.qual,
            v.exp,
            v.salMin,
            v.salMax,
            v.openings,
            v.desc,
            v.resp,
            v.benefits,
            schoolCity,
            schoolState,
            shareCode,
            v.slug,
            flyerPosterPath,
            v.postType,
            interviewTiming,
            interviewVenue
          ]
        );
        console.log(`[Auto-Seed] Created vacancy "${v.title}" (ID: ${jobRes.insertId}) with slug: ${v.slug}`);
      } else {
        await connection.query(
          `UPDATE jobs SET 
            title = ?, designation = ?, subject = ?, qualification_required = ?, experience_required = ?,
            salary_min = ?, salary_max = ?, openings = ?, description = ?, responsibilities = ?, benefits = ?,
            poster_url = ?, post_type = ?, interview_time = ?, venue = ?, status = 'active', slug = ?, share_code = ?
           WHERE id = ?`,
          [
            v.title,
            v.designation,
            v.subject,
            v.qual,
            v.exp,
            v.salMin,
            v.salMax,
            v.openings,
            v.desc,
            v.resp,
            v.benefits,
            flyerPosterPath,
            v.postType,
            interviewTiming,
            interviewVenue,
            v.slug,
            shareCode,
            existingJob[0].id
          ]
        );
        console.log(`[Auto-Seed] Updated vacancy "${v.title}" (ID: ${existingJob[0].id}) with slug: ${v.slug}`);
      }
    }

    console.log('--- All 8 Vacancies Seeded Successfully for Asian Public School! ---');
  } catch (err) {
    console.error('Error during Asian Public School seeding:', err);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  seedAsianPublicSchool();
}

module.exports = seedAsianPublicSchool;
