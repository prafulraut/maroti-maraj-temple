const express    = require('express');
const router     = express.Router();
const {
  register,
  registerAdmin,
  login,
  getMe,
  updateProfile,
  changePassword,
  logout,
} = require('../controllers/authController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ─── Public Routes ────────────────────────────────────────────────────────────
router.post('/register',        register);         // Register new user
router.post('/login',           login);            // Login (user or admin)

// ─── Protected Routes (logged-in users) ──────────────────────────────────────
router.get('/me',               protect, getMe);
router.put('/update-profile',   protect, updateProfile);
router.put('/change-password',  protect, changePassword);
router.post('/logout',          protect, logout);

// ─── Admin-only Routes ────────────────────────────────────────────────────────
router.post('/register-admin',  protect, adminOnly, registerAdmin);  // Only admin can create another admin

module.exports = router;
