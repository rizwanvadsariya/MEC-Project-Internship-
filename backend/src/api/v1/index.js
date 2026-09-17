/**
 * Mounts every v1 router under /api/v1. Route prefixing is versioned from day
 * one (architecture.md §6). Add resource routers here as they are built
 * (phases.md order): auth, schemes, teams, approvals, siteVisits, ...
 */
'use strict';

const router = require('express').Router();

router.use('/health', require('./routes/health.routes'));
router.use('/auth', require('./routes/auth.routes'));
router.use('/schemes', require('./routes/schemes.routes'));
router.use('/teams', require('./routes/teams.routes'));
router.use('/approvals', require('./routes/approvals.routes'));
router.use('/site-visits', require('./routes/siteVisits.routes'));
router.use('/site-visits', require('./routes/visitForms.routes'));
router.use('/site-visits', require('./routes/photos.routes'));

module.exports = router;
