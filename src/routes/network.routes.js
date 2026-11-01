const express = require('express');
const router = express.Router();
const networkController = require('../controllers/network.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// Public or optional auth status check
router.get('/status', (req, res, next) => {
  // Try optional authentication
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  next();
}, networkController.getFollowStatus);

// Authenticated network operations
router.post('/follow', authenticate, networkController.followTarget);
router.post('/unfollow', authenticate, networkController.unfollowTarget);
router.get('/following', authenticate, networkController.getMyFollowing);
router.get('/followers', authenticate, networkController.getMyFollowers);

module.exports = router;
