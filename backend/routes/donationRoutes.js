const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Donation = require('../models/Donation');
const User = require('../models/User');
const PalkhiSettings = require('../models/PalkhiSettings');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// All day / month / year grouping is done in Indian time.
const TZ = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Older records were created before `donationDate` existed → back-fill once.
let backfillDone = null;
const ensureBackfill = () => {
  if (!backfillDone) {
    backfillDone = Donation.updateMany(
      { donationDate: { $exists: false } },
      [{ $set: { donationDate: '$createdAt' } }]
    ).catch((e) => { backfillDone = null; console.error('Donation backfill failed:', e.message); });
  }
  return backfillDone;
};

// "YYYY-MM-DD" (IST) for a JS date
const istDateKey = (d) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

// Which Palkhi day (1 … totalDays) a date falls on, or null.
const palkhiDayFor = async (date) => {
  const s = await PalkhiSettings.findOne();
  if (!s || !s.palkhiDate) return null;
  const start = Date.parse(`${s.palkhiDate}T00:00:00Z`);
  const target = Date.parse(`${istDateKey(new Date(date))}T00:00:00Z`);
  if (isNaN(start) || isNaN(target)) return null;
  const day = Math.floor((target - start) / 86400000) + 1;
  return day >= 1 && day <= (s.totalDays || 1) ? day : null;
};

// Build a Mongo filter from query params shared by list + summary.
//   from, to       ISO dates (inclusive from, exclusive to)
//   status, purpose, paymentMode, source
//   palkhiDay      number | 'any' (only Palkhi donations) | 'none'
//   search         name / email / phone / receipt / txn id
const buildFilter = (q) => {
  const f = {};
  if (q.from || q.to) {
    f.donationDate = {};
    if (q.from && !isNaN(Date.parse(q.from))) f.donationDate.$gte = new Date(q.from);
    if (q.to && !isNaN(Date.parse(q.to))) f.donationDate.$lt = new Date(q.to);
  }
  if (q.status && Donation.STATUSES.includes(q.status)) f.paymentStatus = q.status;
  if (q.purpose && Donation.PURPOSES.includes(q.purpose)) f.purpose = q.purpose;
  if (q.paymentMode && Donation.PAYMENT_MODES.includes(q.paymentMode)) f.paymentMode = q.paymentMode;
  if (q.source === 'online' || q.source === 'offline') f.source = q.source;

  if (q.palkhiDay === 'any') f.palkhiDay = { $ne: null };
  else if (q.palkhiDay === 'none') f.palkhiDay = null;
  else if (q.palkhiDay && Number(q.palkhiDay) > 0) f.palkhiDay = Number(q.palkhiDay);

  if (q.search && String(q.search).trim()) {
    const rx = new RegExp(escapeRegex(String(q.search).trim()), 'i');
    f.$or = [{ name: rx }, { email: rx }, { phone: rx }, { receiptNo: rx }, { transactionId: rx }];
  }
  return f;
};

// Pick only allowed fields from a request body.
const pick = (body, fields) => {
  const out = {};
  fields.forEach((k) => { if (body[k] !== undefined) out[k] = body[k]; });
  return out;
};

const ADMIN_FIELDS = [
  'name', 'email', 'phone', 'address', 'amount', 'purpose', 'message', 'paymentMode',
  'transactionId', 'paymentStatus', 'donationDate', 'palkhiDay', 'palkhiStop', 'isAnonymous',
];

const normalisePalkhi = (data) => {
  if ('palkhiDay' in data) data.palkhiDay = Number(data.palkhiDay) > 0 ? Number(data.palkhiDay) : null;
  if ('palkhiStop' in data && !mongoose.isValidObjectId(data.palkhiStop)) data.palkhiStop = null;
  if (data.palkhiDay === null) data.palkhiStop = null;
  return data;
};

const sumExpr = (status) => ({
  $sum: { $cond: [{ $eq: ['$paymentStatus', status] }, '$amount', 0] },
});

// ═════════════════════════════════════════════════════════════════════════════
//  PUBLIC
// ═════════════════════════════════════════════════════════════════════════════

// @route   GET /api/donations/config
// @desc    Payment details shown on the Donate page
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      upiId: process.env.DONATION_UPI_ID || '',
      payeeName: process.env.DONATION_PAYEE_NAME || 'Maroti Maharaj Temple',
      bankDetails: process.env.DONATION_BANK_DETAILS || '',
      purposes: Donation.PURPOSES,
      paymentModes: Donation.PAYMENT_MODES,
    },
  });
});

// @route   GET /api/donations/total
// @desc    Total of completed donations
router.get('/total', async (req, res) => {
  try {
    const result = await Donation.aggregate([
      { $match: { paymentStatus: 'Completed' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    res.json({
      success: true,
      data: { total: result[0] ? result[0].total : 0, count: result[0] ? result[0].count : 0 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/donations
// @desc    Submit a donation (stays "Pending" until the temple confirms payment)
// @access  Admin only — visitors can no longer submit donations from the website.
//          Admins normally use POST /api/donations/admin ("Record Donation").
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const data = pick(req.body, ['name', 'email', 'phone', 'address', 'amount', 'purpose', 'message', 'paymentMode', 'transactionId', 'isAnonymous']);
    if (!['UPI', 'Online', 'Bank Transfer', 'Cheque', 'Cash'].includes(data.paymentMode)) data.paymentMode = 'UPI';

    if (req.user) {
      data.user = req.user._id;
      data.name = data.name || req.user.name;
      data.email = data.email || req.user.email;
      data.phone = data.phone || req.user.phone || '';
    }
    data.paymentStatus = 'Pending';
    data.source = 'online';
    data.donationDate = new Date();
    if (data.purpose === 'Palkhi') data.palkhiDay = await palkhiDayFor(data.donationDate);

    const donation = await Donation.create(data);
    res.status(201).json({
      success: true,
      message: 'Thank you! Your donation has been recorded and will be confirmed by the temple once payment is verified.',
      data: donation,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  LOGGED-IN USER
// ═════════════════════════════════════════════════════════════════════════════

// @route   GET /api/donations/my
// @desc    Donations made by the logged-in user (linked account or same email)
router.get('/my', protect, async (req, res) => {
  try {
    await ensureBackfill();
    const or = [{ user: req.user._id }];
    if (req.user.email) or.push({ email: new RegExp(`^${escapeRegex(req.user.email)}$`, 'i') });

    const donations = await Donation.find({ $or: or }).sort({ donationDate: -1 });
    const total = donations
      .filter((d) => d.paymentStatus === 'Completed')
      .reduce((sum, d) => sum + d.amount, 0);
    res.json({ success: true, count: donations.length, total, data: donations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  ADMIN
// ═════════════════════════════════════════════════════════════════════════════

// @route   GET /api/donations/summary?groupBy=day|month|year|palkhiDay&from=&to=&…
// @desc    Totals grouped by period or Palkhi day + overall breakdowns
router.get('/summary', protect, adminOnly, async (req, res) => {
  try {
    await ensureBackfill();
    const groupBy = req.query.groupBy || 'day';
    const match = buildFilter(req.query);

    let key;
    if (groupBy === 'palkhiDay') {
      if (!('palkhiDay' in match)) match.palkhiDay = { $ne: null };
      key = '$palkhiDay';
    } else {
      const fmt = groupBy === 'year' ? '%Y' : groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
      key = { $dateToString: { format: fmt, date: '$donationDate', timezone: TZ } };
    }

    const [result] = await Donation.aggregate([
      { $match: match },
      {
        $facet: {
          groups: [
            {
              $group: {
                _id: key,
                completed: sumExpr('Completed'),
                pending: sumExpr('Pending'),
                count: { $sum: 1 },
                completedCount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Completed'] }, 1, 0] } },
              },
            },
            { $sort: { _id: 1 } },
          ],
          totals: [
            {
              $group: {
                _id: null,
                completed: sumExpr('Completed'),
                pending: sumExpr('Pending'),
                failed: sumExpr('Failed'),
                count: { $sum: 1 },
                donors: {
                  $addToSet: {
                    $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$phone', ''] } }, 0] }, '$phone', '$name'],
                  },
                },
              },
            },
            {
              $project: {
                _id: 0, completed: 1, pending: 1, failed: 1, count: 1,
                uniqueDonors: { $size: '$donors' },
              },
            },
          ],
          byPurpose: [
            { $match: { paymentStatus: 'Completed' } },
            { $group: { _id: '$purpose', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { total: -1 } },
          ],
          byMode: [
            { $match: { paymentStatus: 'Completed' } },
            { $group: { _id: '$paymentMode', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { total: -1 } },
          ],
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        groupBy,
        groups: result.groups.map((g) => ({ key: g._id, ...g, _id: undefined })),
        totals: result.totals[0] || { completed: 0, pending: 0, failed: 0, count: 0, uniqueDonors: 0 },
        byPurpose: result.byPurpose.map((g) => ({ key: g._id, total: g.total, count: g.count })),
        byMode: result.byMode.map((g) => ({ key: g._id, total: g.total, count: g.count })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/donations?from=&to=&status=&purpose=&paymentMode=&palkhiDay=&search=&limit=
// @desc    List donations with filters
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    await ensureBackfill();
    const limit = Math.min(Number(req.query.limit) || 1000, 5000);
    const donations = await Donation.find(buildFilter(req.query))
      .sort({ donationDate: -1, createdAt: -1 })
      .limit(limit)
      .populate('palkhiStop', 'familyName city dayNumber')
      .populate('recordedBy', 'name');
    res.json({ success: true, count: donations.length, data: donations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/donations/admin
// @desc    Admin records an offline donation (cash at temple, during Palkhi, etc.)
router.post('/admin', protect, adminOnly, async (req, res) => {
  try {
    const data = normalisePalkhi(pick(req.body, ADMIN_FIELDS));
    data.source = 'offline';
    data.recordedBy = req.user._id;
    if (!data.donationDate) data.donationDate = new Date();
    if (data.palkhiDay === undefined && data.purpose === 'Palkhi') {
      data.palkhiDay = await palkhiDayFor(data.donationDate);
    }
    // Link to a registered user if the email matches
    if (data.email) {
      const u = await User.findOne({ email: String(data.email).toLowerCase() });
      if (u) data.user = u._id;
    }
    const donation = await Donation.create(data);
    res.status(201).json({ success: true, message: `Donation recorded. Receipt ${donation.receiptNo}.`, data: donation });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/donations/:id
// @desc    Admin edits a donation
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const data = normalisePalkhi(pick(req.body, ADMIN_FIELDS));
    const donation = await Donation.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found' });
    res.json({ success: true, message: 'Donation updated.', data: donation });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// @route   PATCH /api/donations/:id/status
// @desc    Admin confirms / rejects a donation
router.patch('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    if (!Donation.STATUSES.includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    const donation = await Donation.findByIdAndUpdate(req.params.id, { paymentStatus }, { new: true });
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found' });
    res.json({ success: true, message: `Marked as ${paymentStatus}.`, data: donation });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/donations/:id
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const donation = await Donation.findByIdAndDelete(req.params.id);
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found' });
    res.json({ success: true, message: 'Donation deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
