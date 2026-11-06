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

    const jobColumnsToEnsure = [
      ['poster_url', 'VARCHAR(255) DEFAULT NULL']
    ];

    for (const [colName, colDef] of jobColumnsToEnsure) {
      try {
        const [existing] = await connection.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = ?`,
          [colName]
        );
        if (existing.length === 0) {
          console.log(`Adding column '${colName}' to jobs...`);
          await connection.query(`ALTER TABLE \`jobs\` ADD COLUMN \`${colName}\` ${colDef};`);
        }
      } catch (err) {
        console.warn(`Could not check or add column ${colName} to jobs:`, err.message);
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

    // Ensure custom_pages table exists and seed default Privacy Policy and Terms of Service
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS \`custom_pages\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`slug\` VARCHAR(100) NOT NULL UNIQUE,
          \`title\` VARCHAR(255) NOT NULL,
          \`subtitle\` VARCHAR(255) DEFAULT NULL,
          \`content\` LONGTEXT NOT NULL,
          \`is_published\` BOOLEAN DEFAULT 1,
          \`meta_description\` TEXT DEFAULT NULL,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX \`idx_pages_slug\` (\`slug\`, \`is_published\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      const defaultPages = [
        {
          slug: 'privacy',
          title: 'Privacy Policy',
          subtitle: 'Commitment to Educator & Institution Data Protection, Privacy & Transparency',
          meta_description: 'Privacy Policy of ProHiring - Information regarding candidate profiles, resume protection, school verification, and DPDP Act 2023 compliance.',
          content: `### 1. Introduction & Overview
Welcome to **ProHiring** ("Platform", "we", "us", or "our"). We are dedicated to providing a secure, transparent, and compliant technology platform that connects certified teachers, educators, and academic professionals with accredited schools and educational institutions across India.

This Privacy Policy explains how we collect, process, store, disclose, and protect personal and professional data when you access or use our website (prohiring.in), mobile applications, and recruitment services.

We operate in compliance with the **Information Technology Act, 2000**, the **Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011**, and the **Digital Personal Data Protection (DPDP) Act, 2023**.

---

### 2. Information We Collect

We collect information directly from you when you register, build your profile, apply for vacancies, or post institutional hiring requirements:

#### A. For Teachers & Job Seekers:
- **Personal Identification & Contact Data**: Full legal name, email address, mobile number, gender, date of birth, current residential address, city, state, and pincode.
- **Academic & Professional Qualifications**: Degrees obtained (B.Ed, M.Ed, B.Sc, M.Sc, M.A, Ph.D, etc.), passing year, institutions attended, percentage/grades, Teacher Eligibility Test (CTET, State TET, NET/SET) scores and certificates.
- **Employment History & Teaching Portfolio**: Previous schools taught, designations held (PGT, TGT, PRT, Principal, Coordinator), subjects taught, total years of experience, current and expected salary benchmarks.
- **Documents & Media**: Uploaded resumes (PDF/DOCX), profile photographs, and certification proofs.
- **Location & Map Data**: Real-time GPS coordinates or chosen city location, used solely to compute proximity and display matching teaching vacancies near your area.

#### B. For Schools & Educational Institutions:
- **Institutional Profile**: Registered school name, affiliation board (CBSE, ICSE, IB, Cambridge, State Board), affiliation or registration number, year of establishment, institution type (K-12, Senior Secondary, Play School, College).
- **Authorized Representative**: Contact person name, official designation (Principal, Director, HR Manager), official phone number, email address, and school website URL.
- **Campus Media & Vacancies**: School logos, campus infrastructure photographs, and published teaching vacancy details.

#### C. Automated Technical & Log Data:
- Device information, browser type, IP address, login timestamps, and referral URLs to ensure portal security, session persistence, and fraud prevention.

---

### 3. Purpose of Data Processing

We use the collected information for specific, lawful purposes:
1. **Facilitating Job Discovery & Recruitment**: Matching qualified teachers with suitable school vacancies based on subject, designation, board, salary, and geographic proximity.
2. **Profile Presentation**: Displaying verified teacher resumes and teaching credentials to authorized school recruiters upon job application or direct candidate search.
3. **Verification & Authenticity**: Validating institutional accreditation and educator credentials to eliminate fraudulent hiring and protect candidates from spurious job postings.
4. **Communications & Alerts**: Dispatching job application status updates, interview schedules, login OTPs, and password reset notifications via SMS, WhatsApp, and Email.
5. **Platform Analytics & Improvement**: Monitoring platform health, enhancing mobile responsiveness, and refining job recommendation algorithms.

---

### 4. Data Sharing & Third-Party Disclosures

**We strictly uphold candidate privacy and never sell or rent personal candidate data to third-party marketing companies, advertisers, or lead generators.**

Data is disclosed only in the following contexts:
- **Applied Educational Institutions**: When you submit a job application to a school, your full candidate profile, resume, contact details, and qualifications are made accessible to that school's verified recruiting team.
- **Verified Recruiters on Talent Search**: If you opt in to make your profile searchable, verified school recruiters may review your teaching credentials to invite you for interviews.
- **Infrastructure & Delivery Partners**: We utilize secure cloud infrastructure (Nextcloud WebDAV storage with enterprise encryption), SMS/WhatsApp gateways (AutoMsgHub / Fast2SMS), and transactional email delivery (SMTP) strictly for processing and transmitting platform services.
- **Legal Compliance**: We may disclose information if required to do so by applicable Indian law, court order, or governmental authority.

---

### 5. Storage, Security & Nextcloud WebDAV Infrastructure

We implement stringent technical and organizational security controls:
- **Encryption**: All data transmitted between your browser and our servers is secured using SSL/TLS (HTTPS) encryption. Sensitive user passwords are encrypted using high-iteration **bcryptjs** hashing.
- **Dedicated Cloud Storage**: Candidate resumes and institutional media are securely stored and isolated in dedicated Nextcloud WebDAV cloud storage repositories with strict access permission policies.
- **Automated Old File Cleanup**: When a teacher or school uploads an updated resume, avatar, or logo, older replacement files are automatically wiped from our active disks and cloud storage to prevent orphaned personal data retention.
- **Access Restrictions**: Administrative access to databases and backend systems is restricted by multi-factor authentication, role-based authorization, and activity logging.

---

### 6. Candidate Rights & DPDP Act 2023 Compliance

As a registered educator or recruiter on ProHiring, you enjoy the following rights:
- **Right to Access & Rectify**: You can review and update your personal details, academic history, resume, and contact numbers at any time from your profile dashboard.
- **Right to Erasure / Account Deletion**: You may request the deletion of your account and associated personal data by contacting our support team or initiating account termination.
- **Right to Withdraw Consent**: You can withdraw consent for promotional notifications or make your profile non-searchable by recruiters.
- **Right to Grievance Redressal**: You may raise concerns or complaints regarding your personal data directly with our designated Grievance Officer.

---

### 7. Location Permissions & OpenStreetMap Services

To enable the interactive "Nearby Schools" and live distance calculation feature, the platform requests access to your device GPS location. This location data is processed locally to calculate distance (in kilometers) to schools and is never broadcast publicly without your authorization. You may disable GPS location access at any time via your browser settings.

---

### 8. Cookies & Local Storage

We use essential cookies and local storage tokens ('authToken', 'userRole') solely to maintain authenticated sessions and remember user interface preferences. We do not use intrusive third-party cross-site tracking cookies.

---

### 9. Grievance Officer & Contact Information

For any privacy inquiries, data rectification requests, or grievances under the Digital Personal Data Protection Act, please contact:

- **Data Protection & Grievance Officer**: ProHiring Legal & Compliance Desk
- **Email**: [support@prohiring.in](mailto:support@prohiring.in)
- **Phone / WhatsApp**: +91 98765 43210
- **Office Address**: ProHiring Connect, India
- **Response Timeline**: All privacy grievances are acknowledged within 48 hours and resolved within 30 statutory days.`
        },
        {
          slug: 'terms',
          title: 'Terms of Service',
          subtitle: 'Terms & Conditions Governing Use of the ProHiring Educational Recruitment Platform',
          meta_description: 'Terms of Service for ProHiring - Guidelines, teacher obligations, school recruiter rules, zero candidate fee policy, and platform intermediary terms.',
          content: `### 1. Acceptance of Terms
These Terms of Service ("Terms", "Agreement") constitute a legally binding agreement between you ("User", "Teacher", "Candidate", "School", "Institution", or "Recruiter") and **ProHiring** ("Platform", "we", "us", or "our"), governing your access to and use of the ProHiring website (prohiring.in), administrative portals, and associated services.

By creating an account, posting a vacancy, uploading a resume, or submitting an application, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree to these Terms, you must discontinue using the Platform immediately.

---

### 2. Nature of Platform & Section 79 Intermediary Status

1. **Technology Matchmaking Intermediary**: ProHiring is an online technology recruitment platform that facilitates connections between job-seeking educators and hiring educational institutions.
2. **Intermediary Protection**: Under **Section 79 of the Information Technology Act, 2000**, ProHiring functions strictly as an electronic intermediary. ProHiring is not an employment agency, headhunter, labor contractor, or employer of the candidates listed on the Platform.
3. **No Employment Guarantee**: While ProHiring strives to showcase high-quality teaching vacancies and qualified candidates, we do not guarantee job placement, interview calls, or specific employment outcomes for any teacher, nor do we guarantee the suitability or background clearance of any applicant for a school.

---

### 3. Teacher & Candidate Terms & Responsibilities

1. **Eligibility**: Candidates must be at least 18 years of age and possess legitimate educational credentials suitable for the positions they apply for.
2. **Accuracy of Credentials**: You affirm and warrant that all academic degrees, Teacher Eligibility Test (TET/CTET) qualifications, teaching certifications, years of experience, and previous school employment history provided in your profile and resume are 100% accurate, complete, and authentic.
3. **Prohibition of Fraudulent Information**: Submitting falsified documents, fabricated school experience letters, false designations, or forged mark sheets constitutes grounds for immediate, permanent account termination and potential reporting to authorized bodies.
4. **Professional Conduct**: Candidates agree to communicate professionally and courteously with school administrators during written correspondence, phone discussions, and in-person interviews.
5. **Zero Candidate Fees Policy**: ProHiring **never charges any fee from candidates for job applications or interview scheduling**. If any entity or individual pretending to represent ProHiring requests payment in exchange for a guaranteed teaching job, report them immediately to 'support@prohiring.in'.

---

### 4. School, College & Recruiter Terms & Responsibilities

1. **Accredited Institutions**: Only legitimate, duly recognized, or registered educational institutions (schools, colleges, pre-schools, institutes, coaching academies) or their authorized recruitment officials are permitted to create school accounts and post vacancies.
2. **Verification & Documentation**: Schools agree to provide legitimate board affiliation details (CBSE, ICSE, IB, State Board, etc.), authorized contact person credentials, and official phone numbers upon registration. ProHiring reserves the right to withhold vacancy publication until verification is completed.
3. **Lawful Job Postings**: Vacancy postings must describe genuine, open teaching or administrative positions with accurate designation classifications (e.g., PGT, TGT, PRT, Principal), required qualifications, subjects, and transparent salary indicators.
4. **Strict Prohibition on Candidate Exploitation**: Schools and recruiters are strictly prohibited from:
   - Charging any "registration fee", "interview fee", or "security deposit" from applying candidates.
   - Using candidate contact information, phone numbers, or resumes for any purpose other than recruitment for the specified vacancies.
   - Posting discriminatory, misleading, or non-educational promotional listings.
5. **Confidentiality of Resumes**: Schools agree to protect the privacy of applicants and handle all downloaded resumes and personal details in accordance with applicable Indian data protection laws.

---

### 6. Account Security & Verification

1. **Account Credentials**: Users are responsible for maintaining the confidentiality of their login credentials, passwords, and one-time verification passwords (OTPs). You agree to immediately notify us of any unauthorized account access.
2. **Account Suspension & Termination**: ProHiring reserves the right to suspend, disable, or permanently remove any teacher or school account that:
   - Breaches any provision of these Terms or the Privacy Policy.
   - Provides false, misleading, or abusive information.
   - Engages in fraudulent recruiting practices or spamming.
   - Solicits unauthorized payments from job seekers.

---

### 7. Community Feed & Content Guidelines

Users utilizing the ProHiring Community Feed to share pedagogical insights, achievements, or hiring updates agree that they will not post:
- Defamatory, obscene, hateful, or unlawful statements.
- Commercial advertisements, spam links, or irrelevant marketing solicitations.
- Content that infringes any copyright, trademark, or intellectual property rights.

ProHiring reserves the right to remove any post, comment, or media without prior notice if it is found to violate these guidelines.

---

### 8. Intellectual Property

All platform logos, trademarks, design elements, layouts, software code, and database schemas of ProHiring are the exclusive intellectual property of ProHiring. Users are granted a limited, non-exclusive, non-transferable license to access the Platform solely for recruitment and job-seeking purposes.

---

### 9. Limitation of Liability & Disclaimers

1. **Direct Contracts**: All employment offers, appointment letters, salary negotiations, service bonds, and background verifications are strictly bipartite contracts between the respective School and Teacher. ProHiring shall have no liability or responsibility arising out of any employment dispute, non-payment of salary, early termination, or breach of employment agreement.
2. **Platform Availability**: The Platform is provided on an "as-is" and "as-available" basis. While we strive for 99.9% uptime, we do not warrant that platform operations will be completely uninterrupted or error-free.
3. **Indirect Damages**: Under no circumstances shall ProHiring, its directors, or its affiliates be liable for any indirect, punitive, incidental, or consequential damages resulting from the use or inability to use the Platform.

---

### 10. Governing Law & Dispute Resolution

These Terms and any dispute arising out of or related to them shall be governed by and construed in accordance with the laws of **India**. Any legal action or proceeding arising under this Agreement shall be brought exclusively in the courts situated in **Haryana / New Delhi, India**, and both parties consent to the jurisdiction thereof.

---

### 11. Modifications to Terms

We reserve the right to revise and update these Terms at any time to reflect changing legal, regulatory, or technical requirements. Continued use of the Platform following any modifications indicates your acceptance of the updated Terms.

---

### 12. Contact Information

If you have questions, inquiries, or notices regarding these Terms of Service, please reach out to:

- **ProHiring Legal Desk**
- **Email**: [support@prohiring.in](mailto:support@prohiring.in)
- **Support Helpline**: +91 98765 43210
- **Official Domain**: [https://prohiring.in](https://prohiring.in)`
        }
      ];

      for (const p of defaultPages) {
        await connection.query(
          `INSERT INTO custom_pages (slug, title, subtitle, content, is_published, meta_description)
           VALUES (?, ?, ?, ?, 1, ?)
           ON DUPLICATE KEY UPDATE 
             title = IF(title IS NULL OR title = '', VALUES(title), title),
             subtitle = IF(subtitle IS NULL OR subtitle = '', VALUES(subtitle), subtitle),
             content = IF(content IS NULL OR content = '', VALUES(content), content),
             meta_description = IF(meta_description IS NULL OR meta_description = '', VALUES(meta_description), meta_description)`,
          [p.slug, p.title, p.subtitle, p.content, p.meta_description]
        );
      }
      console.log('custom_pages table verified and default pages seeded.');
    } catch (pageErr) {
      console.warn('Notice during custom_pages initialization:', pageErr.message);
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
