# ProHiring Backend API (backend.prohiring.in)

Modular, production-ready Node.js + Express + MySQL REST API for the **ProHiring** School-Teacher Recruitment Platform.

---

## 🛠 Tech Stack
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: MySQL 5.7+ / 8.0+
- **Authentication**: JWT (JSON Web Tokens) & bcryptjs
- **File Uploads**: Multer
- **Security**: Helmet, CORS

---

## 🚀 aaPanel & Server Deployment Guide

### 1. Requirements on aaPanel
- **Node.js Version Manager** (Install Node.js 18 or 20 from aaPanel App Store)
- **PM2 Manager** (Install from aaPanel App Store)
- **MySQL Database** (Create database `prohiring_db` via aaPanel Database tab)

### 2. Environment Variables (.env)
Copy `.env.example` to `.env` and fill in your database credentials:
```bash
cp .env.example .env
```
Key configuration:
```env
PORT=5000
NODE_ENV=production

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=prohiring_user
DB_PASSWORD=your_secure_password
DB_NAME=prohiring_db

JWT_SECRET=your_jwt_secret_key
CLIENT_URL=https://prohiring.in
ADMIN_URL=https://admin.prohiring.in
```

### 3. Database Migration & Seed
Run the automated schema creation and initial data seed:
```bash
npm install
npm run db:migrate
npm run db:seed
```

This creates:
- Dynamic `system_settings` (Platform name: `ProHiring`, customizable from Admin Panel)
- Super Admin account: `admin@prohiring.in` / `Admin@123456`
- Demo School: `dps.delhi@prohiring.in` / `School@123456`
- Demo Teacher: `priya.sharma@prohiring.in` / `Teacher@123456`
- Sample active teaching vacancies

### 4. Running with PM2 on aaPanel
```bash
pm2 start src/server.js --name "prohiring-backend"
pm2 save
```

---

## 📡 API Endpoints Overview

### Public & Config
- `GET /api/health` - Server health & MySQL connection status
- `GET /api/v1/config/app-settings` - Dynamic branding (`appName`, `tagline`, `colors`, etc.)

### Authentication
- `POST /api/v1/auth/register-teacher` - Teacher registration
- `POST /api/v1/auth/register-school` - School registration
- `POST /api/v1/auth/login` - User login (Teacher, School, Admin)
- `GET /api/v1/auth/me` - Authenticated user profile

### Jobs (Public)
- `GET /api/v1/jobs` - Search vacancies (filters: `search`, `subject`, `city`, `designation`, `jobType`, `minSalary`, `page`, `limit`)
- `GET /api/v1/jobs/featured` - Top featured vacancies
- `GET /api/v1/jobs/:id` - Detailed vacancy view with school profile & similar jobs

### Teacher (Protected - Role: Teacher)
- `GET /api/v1/teacher/dashboard` - Metrics (applied count, shortlisted, saved, recommended jobs)
- `GET /api/v1/teacher/profile` - Teacher profile data
- `PUT /api/v1/teacher/profile` - Update teacher profile
- `POST /api/v1/teacher/upload-resume` - Upload resume (PDF, DOCX)
- `POST /api/v1/teacher/apply` - Apply to a vacancy
- `GET /api/v1/teacher/applications` - My submitted applications & status
- `POST /api/v1/teacher/save-job/:jobId` - Bookmark/unbookmark a job
- `GET /api/v1/teacher/saved-jobs` - List saved jobs

### School (Protected - Role: School)
- `GET /api/v1/school/dashboard` - Recruiter statistics & recent candidates
- `GET /api/v1/school/profile` - School profile
- `PUT /api/v1/school/profile` - Update school profile
- `POST /api/v1/school/upload-logo` - Upload school logo
- `POST /api/v1/school/jobs` - Post a new vacancy
- `GET /api/v1/school/jobs` - List all vacancies posted by school
- `PUT /api/v1/school/jobs/:id` - Update vacancy details / close vacancy
- `GET /api/v1/school/jobs/:id/applicants` - View applicants with full teacher profile & resume
- `PUT /api/v1/school/applications/:applicationId/status` - Update status (shortlist, interview, hire, reject)

### Admin (Protected - Role: Admin)
- `GET /api/v1/admin/dashboard-stats` - Platform wide overview & stats
- `GET /api/v1/admin/schools` - Manage schools & verification
- `PUT /api/v1/admin/schools/:id/verification` - Approve or reject school verification
- `GET /api/v1/admin/teachers` - Manage registered teachers
- `PUT /api/v1/admin/users/:id/status` - Suspend or activate any user
- `GET /api/v1/admin/jobs` - Oversee all posted vacancies
- `DELETE /api/v1/admin/jobs/:id` - Remove inappropriate job postings
- `GET /api/v1/admin/settings` - View all dynamic platform settings
- `PUT /api/v1/admin/settings` - Change app name (`appName`), tagline, branding, contact info
