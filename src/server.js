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

// Enable CORS at top of middleware stack with full preflight support
const corsOptions = {
  origin: (origin, callback) => {
    // Allow mobile apps, curl, postman or same-origin (origin is undefined)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all during development/flexible deployment
    }
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cache-Control', 'Pragma']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Security & Logger Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan('dev'));

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
  if (req.headers.origin) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.status(404).json({
    success: false,
    message: `Endpoint '${req.method} ${req.originalUrl}' not found.`
  });
});

// Centralized Error Handler (guarantees CORS headers on all errors)
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  if (req.headers.origin) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  const statusCode = err.status || (err.message?.includes('File too large') ? 413 : 500);
  res.status(statusCode).json({
    success: false,
    message: err.message || 'An unexpected error occurred on the server.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start Server
app.listen(PORT, async () => {
  console.log(`===============================================`);
  console.log(` ProHiring Backend API running on port ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Health check: http://localhost:${PORT}/api/health`);
  console.log(`===============================================`);

  try {
    await expireOldJobs();
  } catch (err) {
    console.warn('[Auto-Expire Initial Warning]:', err.message);
  }

  // Automatically check and expire overdue vacancies every 30 minutes
  setInterval(() => {
    expireOldJobs().catch((err) => console.warn('[Auto-Expire Cron Error]:', err.message));
  }, 30 * 60 * 1000);
});

module.exports = app;
