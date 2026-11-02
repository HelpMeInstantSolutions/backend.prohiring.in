const express = require('express');
const router = express.Router();
const networkController = require('../controllers/network.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// Helper for optional auth
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  next();
};

// Public or optional auth status check
router.get('/status', optionalAuth, networkController.getFollowStatus);

// Search schools and teachers directory
router.get('/search', optionalAuth, networkController.searchNetwork);

// Authenticated network operations
router.post('/follow', authenticate, networkController.followTarget);
router.post('/unfollow', authenticate, networkController.unfollowTarget);
router.get('/following', authenticate, networkController.getMyFollowing);
router.get('/followers', authenticate, networkController.getMyFollowers);

module.exports = router;
