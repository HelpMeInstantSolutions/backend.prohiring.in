const express = require('express');
const router = express.Router();
const jobController = require('../controllers/job.controller');

router.get('/', jobController.getPublicJobs);
router.get('/featured', jobController.getFeaturedJobs);
router.get('/:id', jobController.getJobById);

module.exports = router;
