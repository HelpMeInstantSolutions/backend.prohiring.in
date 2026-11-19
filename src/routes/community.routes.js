const express = require('express');
const router = express.Router();
const communityController = require('../controllers/community.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// Feed & comments reading strictly requires authentication (logged-in teachers and schools)
router.get('/posts', authenticate, communityController.getPosts);
router.get('/posts/:id/comments', authenticate, communityController.getComments);

// Authenticated interactions
router.post('/posts', authenticate, communityController.createPost);
router.post('/posts/:id/like', authenticate, communityController.toggleLike);
router.post('/posts/:id/comments', authenticate, communityController.addComment);
router.delete('/posts/:id', authenticate, communityController.deletePost);

module.exports = router;
