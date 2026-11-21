const User = require('../models/User');
const Event = require('../models/Event');
const Donation = require('../models/Donation');
const Gallery = require('../models/Gallery');

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/admin/users
// @desc    Get all users (with optional role filter)
// @access  Admin only
// ─────────────────────────────────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role; // ?role=user or ?role=admin

    const users = await User.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count:   users.length,
      data:    users,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/admin/users/:id
// @desc    Get a single user by ID
// @access  Admin only
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/admin/users/:id/role
// @desc    Promote user to admin or demote admin to user
// @access  Admin only
// ─────────────────────────────────────────────────────────────────────────────
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be 'user' or 'admin'.",
      });
    }

    // Prevent admin from changing their own role
    if (req.params.id === req.user.id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot change your own role.',
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.status(200).json({
      success: true,
      message: `User role updated to '${role}' successfully.`,
      data:    user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/admin/users/:id/toggle-status
// @desc    Activate or deactivate a user account
// @access  Admin only
// ─────────────────────────────────────────────────────────────────────────────
exports.toggleUserStatus = async (req, res) => {
  try {
    if (req.params.id === req.user.id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account.',
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: `User account ${user.isActive ? 'activated' : 'deactivated'} successfully.`,
      data:    user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   DELETE /api/admin/users/:id
// @desc    Delete a user permanently
// @access  Admin only
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    if (req.params.id === req.user.id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account.',
      });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.status(200).json({
      success: true,
      message: `User '${user.name}' deleted successfully.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/admin/dashboard
// @desc    Get dashboard stats
// @access  Admin only
// ─────────────────────────────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Start of today in Indian time (server may run in UTC) for donation totals
    const IST_OFFSET_MS = 330 * 60 * 1000;
    const istNow = new Date(Date.now() + IST_OFFSET_MS);
    const startOfTodayIST = new Date(
      Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_OFFSET_MS
    );

    const [totalUsers, totalAdmins, activeUsers, upcomingEvents, galleryImages, todaysDonationAgg] =
      await Promise.all([
        User.countDocuments({ role: 'user' }),
        User.countDocuments({ role: 'admin' }),
        User.countDocuments({ isActive: true }),
        Event.countDocuments({ isActive: true, date: { $gte: startOfToday } }),
        Gallery.countDocuments(),
        Donation.aggregate([
          {
            $match: {
              paymentStatus: 'Completed',
              $or: [
                { donationDate: { $gte: startOfTodayIST } },
                { donationDate: { $exists: false }, createdAt: { $gte: startOfTodayIST } },
              ],
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
      ]);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalAdmins,
        activeUsers,
        totalAccounts: totalUsers + totalAdmins,
        upcomingEvents,
        galleryImages,
        todaysDonations: todaysDonationAgg[0] ? todaysDonationAgg[0].total : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
