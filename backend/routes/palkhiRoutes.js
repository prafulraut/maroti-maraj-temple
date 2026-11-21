const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/palkhiController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get('/settings',   ctrl.getSettings);
router.get('/schedules',  ctrl.getSchedules);

// ─── Admin-Only Routes ────────────────────────────────────────────────────────
router.post('/settings',
  protect, adminOnly,
  ctrl.uploadMiddleware,
  ctrl.updateSettings
);

router.post('/schedules',       protect, adminOnly, ctrl.addSchedule);
router.delete('/schedules/:id', protect, adminOnly, ctrl.deleteSchedule);
router.patch('/schedules/:id/status', protect, adminOnly, ctrl.updateStatus);

router.post('/notify/:id',  protect, adminOnly, ctrl.notifyOne);
router.post('/notify-all',  protect, adminOnly, ctrl.notifyAll);

module.exports = router;
