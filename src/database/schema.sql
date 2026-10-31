-- ProHiring Database Schema
-- Compatible with MySQL 5.7+ / 8.0+ / MariaDB

-- 1. System Settings (Supports Dynamic App Name, Logo, Branding & Configs editable from Admin Panel)
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `setting_key` VARCHAR(100) NOT NULL UNIQUE,
  `setting_value` TEXT,
  `category` VARCHAR(50) DEFAULT 'general',
  `description` VARCHAR(255) DEFAULT NULL,
  `is_public` BOOLEAN DEFAULT 1,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Users (Admin, School, Teacher authentication table)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'school', 'teacher') NOT NULL,
  `status` ENUM('active', 'inactive', 'pending', 'suspended') DEFAULT 'active',
  `reset_token` VARCHAR(255) DEFAULT NULL,
  `reset_token_expiry` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Teacher Profiles
CREATE TABLE IF NOT EXISTS `teacher_profiles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL UNIQUE,
  `full_name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(25) DEFAULT NULL,
  `gender` ENUM('male', 'female', 'other') DEFAULT NULL,
  `dob` DATE DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `pincode` VARCHAR(20) DEFAULT NULL,
  `languages` VARCHAR(255) DEFAULT NULL,
  `headline` VARCHAR(255) DEFAULT NULL,
  `highest_qualification` VARCHAR(100) DEFAULT NULL,
  `specialization` VARCHAR(150) DEFAULT NULL,
  `experience_years` DECIMAL(4,1) DEFAULT 0.0,
  `primary_subject` VARCHAR(100) DEFAULT NULL,
  `secondary_subjects` VARCHAR(255) DEFAULT NULL,
  `current_city` VARCHAR(100) DEFAULT NULL,
  `current_state` VARCHAR(100) DEFAULT NULL,
  `expected_salary_min` INT DEFAULT 0,
  `expected_salary_max` INT DEFAULT 0,
  `family_details` LONGTEXT DEFAULT NULL,
  `qualifications_data` LONGTEXT DEFAULT NULL,
  `previous_jobs_data` LONGTEXT DEFAULT NULL,
  `current_job_data` LONGTEXT DEFAULT NULL,
  `tet_details` LONGTEXT DEFAULT NULL,
  `profile_step` INT DEFAULT 1,
  `resume_url` VARCHAR(255) DEFAULT NULL,
  `avatar_url` VARCHAR(255) DEFAULT NULL,
  `bio` TEXT DEFAULT NULL,
  `is_profile_completed` BOOLEAN DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. School Profiles
CREATE TABLE IF NOT EXISTS `school_profiles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL UNIQUE,
  `school_name` VARCHAR(200) NOT NULL,
  `board` VARCHAR(100) DEFAULT 'CBSE',
  `registration_number` VARCHAR(100) DEFAULT NULL,
  `contact_person` VARCHAR(150) DEFAULT NULL,
  `phone` VARCHAR(25) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `city` VARCHAR(100) DEFAULT NULL,
  `state` VARCHAR(100) DEFAULT NULL,
  `pincode` VARCHAR(20) DEFAULT NULL,
  `website` VARCHAR(255) DEFAULT NULL,
  `logo_url` VARCHAR(255) DEFAULT NULL,
  `banner_url` VARCHAR(255) DEFAULT NULL,
  `about` TEXT DEFAULT NULL,
  `verification_status` ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  `is_verified` BOOLEAN DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Jobs Table
CREATE TABLE IF NOT EXISTS `jobs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `school_id` INT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `designation` VARCHAR(100) NOT NULL,
  `subject` VARCHAR(100) NOT NULL,
  `qualification_required` VARCHAR(150) NOT NULL,
  `experience_required` VARCHAR(50) DEFAULT '1-3 Years',
  `salary_min` INT DEFAULT 0,
  `salary_max` INT DEFAULT 0,
  `salary_negotiable` BOOLEAN DEFAULT 0,
  `job_type` ENUM('full_time', 'part_time', 'contract', 'temporary') DEFAULT 'full_time',
  `openings` INT DEFAULT 1,
  `description` TEXT NOT NULL,
  `responsibilities` TEXT DEFAULT NULL,
  `benefits` TEXT DEFAULT NULL,
  `city` VARCHAR(100) NOT NULL,
  `state` VARCHAR(100) NOT NULL,
  `deadline` DATE DEFAULT NULL,
  `status` ENUM('active', 'closed', 'draft') DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`school_id`) REFERENCES `school_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Job Applications
CREATE TABLE IF NOT EXISTS `job_applications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `job_id` INT NOT NULL,
  `teacher_id` INT NOT NULL,
  `cover_note` TEXT DEFAULT NULL,
  `status` ENUM('applied', 'under_review', 'shortlisted', 'interview_scheduled', 'rejected', 'hired') DEFAULT 'applied',
  `interview_date` DATETIME DEFAULT NULL,
  `interview_notes` TEXT DEFAULT NULL,
  `applied_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_job_teacher` (`job_id`, `teacher_id`),
  FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`teacher_id`) REFERENCES `teacher_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Saved Jobs (Bookmarks)
CREATE TABLE IF NOT EXISTS `saved_jobs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `teacher_id` INT NOT NULL,
  `job_id` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_saved_job` (`teacher_id`, `job_id`),
  FOREIGN KEY (`teacher_id`) REFERENCES `teacher_profiles` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Notifications
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `message` TEXT NOT NULL,
  `type` VARCHAR(50) DEFAULT 'info',
  `link` VARCHAR(255) DEFAULT NULL,
  `is_read` BOOLEAN DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. OTP Verification Table
CREATE TABLE IF NOT EXISTS `otps` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(50) DEFAULT NULL,
  `email_otp` VARCHAR(10) DEFAULT NULL,
  `phone_otp` VARCHAR(10) DEFAULT NULL,
  `type` ENUM('registration', 'login', 'reset_password') DEFAULT 'registration',
  `is_verified` BOOLEAN DEFAULT 0,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (`email`),
  INDEX idx_phone (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Indexes for ultra-fast query performance
CREATE INDEX idx_jobs_subject_city ON `jobs` (`subject`, `city`, `status`);
CREATE INDEX idx_jobs_status ON `jobs` (`status`);
CREATE INDEX idx_users_role ON `users` (`role`, `status`);

