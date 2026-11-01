const express = require('express');
const router = express.Router();
const configController = require('../controllers/config.controller');

// Public route to get platform branding (app_name, tagline, theme colors, etc.)
router.get('/app-settings', configController.getPublicSettings);

// Public route to get Posts / Designations / Subjects taxonomy
router.get('/taxonomy', configController.getPublicTaxonomy);

// Public route to get custom published pages (privacy, terms, etc.)
router.get('/pages/:slug', configController.getPageBySlug);

module.exports = router;

