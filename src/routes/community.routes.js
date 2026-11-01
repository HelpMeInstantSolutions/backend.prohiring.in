const express = require('express');
const router = express.Router();
const communityController = require('../controllers/community.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// Optional auth helper: if bearer token present, authenticate, else continue
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  next();
};

// Feed & comments reading (public or personalized if logged in)
router.get('/posts', optionalAuth, communityController.getPosts);
router.get('/posts/:id/comments', communityController.getComments);

// Authenticated interactions
router.post('/posts', authenticate, communityController.createPost);
router.post('/posts/:id/like', authenticate, communityController.toggleLike);
router.post('/posts/:id/comments', authenticate, communityController.addComment);
router.delete('/posts/:id', authenticate, communityController.deletePost);

module.exports = router;
