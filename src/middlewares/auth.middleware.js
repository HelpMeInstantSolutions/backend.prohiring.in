const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token missing or invalid format.'
      });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'prohiring_super_secure_jwt_secret_key_2026_change_in_production';
    
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Token has expired or is invalid.'
      });
    }

    // Verify user still exists and status is active
    const users = await query('SELECT id, email, role, status FROM users WHERE id = ?', [decoded.id]);
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User account not found.'
      });
    }

    const user = users[0];
    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact administrator.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.'
    });
  }
};

/**
 * Optional authentication middleware:
 * Populates req.user if a valid token is provided, but continues cleanly
 * even if token is absent, expired, or invalid.
 */
const authenticateOptional = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const secret = process.env.JWT_SECRET || 'prohiring_super_secure_jwt_secret_key_2026_change_in_production';
      try {
        const decoded = jwt.verify(token, secret);
        const users = await query('SELECT id, email, role, status FROM users WHERE id = ?', [decoded.id]);
        if (users.length > 0 && users[0].status !== 'suspended') {
          req.user = users[0];
        }
      } catch (_) {}
    }
    next();
  } catch (error) {
    next();
  }
};

module.exports = { authenticate, authenticateOptional };
