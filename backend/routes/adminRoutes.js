const express    = require('express');
const router     = express.Router();
const {
  getAllUsers,
  getUserById,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  getDashboardStats,
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// All admin routes require: valid JWT token + admin role
router.use(protect, adminOnly);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard',                getDashboardStats);

// ─── User Management ──────────────────────────────────────────────────────────
router.get('/users',                    getAllUsers);          // GET /api/admin/users?role=user
router.get('/users/:id',                getUserById);
router.put('/users/:id/role',           updateUserRole);       // { role: 'admin' | 'user' }
router.put('/users/:id/toggle-status',  toggleUserStatus);
router.delete('/users/:id',             deleteUser);

module.exports = router;
