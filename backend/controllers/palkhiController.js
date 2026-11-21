const PalkhiSchedule = require('../models/PalkhiSchedule');
const PalkhiSettings = require('../models/PalkhiSettings');
const { imageUpload, saveImage, deleteImageByUrl } = require('../utils/imageStore');

// ─── Multer Config (in memory → stored in MongoDB) ───────────────────────────
const upload = imageUpload(1);

exports.uploadMiddleware = (req, res, next) => {
  upload.single('palkhiImage')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 4 MB or smaller.' : err.message;
    return res.status(400).json({ success: false, message });
  });
};

// ─── SMS Helper ───────────────────────────────────────────────────────────────
async function sendSMS(mobile, message) {
  try {
    // fast2sms requires FAST2SMS_API_KEY in .env
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey || apiKey === 'YOUR_FAST2SMS_API_KEY') {
      console.log(`[SMS MOCK] To: ${mobile} | Message: ${message}`);
      return { success: true, mock: true };
    }

    const fast2sms = require('fast2sms');
    const res = await fast2sms.sendMessage({
      authorization: apiKey,
      message,
      numbers: [mobile],
    });
    return res;
  } catch (err) {
    console.error('SMS send error:', err.message);
    return { success: false, error: err.message };
  }
}

function buildSmsMessage(schedule) {
  const meal =
    schedule.visitType === 'lunch'  ? 'Lunch (Bhojan) will be at your home. ' :
    schedule.visitType === 'dinner' ? 'Dinner (Bhojan) will be at your home. ' : '';
  return (
    `🛕 Maroti Maharaj Palkhi Update!\n` +
    `Namaste ${schedule.familyName} ji,\n` +
    `Day ${schedule.dayNumber || 1}: Palkhi will reach ${schedule.city}` +
    `${schedule.address ? ' - ' + schedule.address : ''} at ${schedule.arrivalTime}.\n` +
    `${meal}Time from previous stop: ${schedule.timeTaken}.\n` +
    `Please be ready to welcome Maroti Maharaj! 🙏`
  );
}

// ─── Controllers ─────────────────────────────────────────────────────────────

// GET /api/palkhi/settings  — public
exports.getSettings = async (req, res) => {
  try {
    let settings = await PalkhiSettings.findOne();
    if (!settings) settings = new PalkhiSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/palkhi/settings  — admin only
exports.updateSettings = async (req, res) => {
  try {
    const { palkhiTitle, palkhiDate, totalDays, startLocation, endLocation, description } = req.body;
    let settings = await PalkhiSettings.findOne();
    if (!settings) settings = new PalkhiSettings();

    if (palkhiTitle)    settings.palkhiTitle    = palkhiTitle;
    if (palkhiDate)     settings.palkhiDate     = palkhiDate;
    if (totalDays)      settings.totalDays      = Number(totalDays);
    if (startLocation)  settings.startLocation  = startLocation;
    if (endLocation)    settings.endLocation    = endLocation;
    if (description)    settings.description    = description;

    // If an image was uploaded, save its URL
    if (req.file) {
      const oldUrl = settings.imageUrl;
      settings.imageUrl = await saveImage(req.file);
      await deleteImageByUrl(oldUrl).catch(() => {});
    }

    await settings.save();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/palkhi/schedules  — public
exports.getSchedules = async (req, res) => {
  try {
    const schedules = await PalkhiSchedule.find().sort({ dayNumber: 1, orderIndex: 1, createdAt: 1 });
    res.json({ success: true, data: schedules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/palkhi/schedules  — admin only: add one stop
exports.addSchedule = async (req, res) => {
  try {
    const {
      familyName, mobileNumber, city, address, arrivalTime, timeTaken,
      orderIndex, dayNumber, visitType,
    } = req.body;

    const day = Number(dayNumber) || 1;

    // If no order given, put the stop at the end of that day's list
    let order = Number(orderIndex) || 0;
    if (!order) {
      order = (await PalkhiSchedule.countDocuments({ dayNumber: day })) + 1;
    }

    const schedule = await PalkhiSchedule.create({
      familyName, mobileNumber, city, address, arrivalTime, timeTaken,
      dayNumber: day,
      visitType: visitType || 'visit',
      orderIndex: order,
    });

    res.status(201).json({ success: true, data: schedule });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/palkhi/schedules/:id  — admin only
exports.deleteSchedule = async (req, res) => {
  try {
    await PalkhiSchedule.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Schedule deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/palkhi/notify/:id  — admin: send SMS to one family
exports.notifyOne = async (req, res) => {
  try {
    const schedule = await PalkhiSchedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });

    const message = buildSmsMessage(schedule);

    const smsResult = await sendSMS(schedule.mobileNumber, message);
    schedule.smsSent = true;
    await schedule.save();

    res.json({ success: true, smsResult, message: 'SMS sent successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/palkhi/notify-all  — admin: send SMS to ALL families
exports.notifyAll = async (req, res) => {
  try {
    // Optional ?day=3 → only notify families of that day
    const filter = req.query.day ? { dayNumber: Number(req.query.day) } : {};
    const schedules = await PalkhiSchedule.find(filter).sort({ dayNumber: 1, orderIndex: 1 });
    const results = [];

    for (const schedule of schedules) {
      const message = buildSmsMessage(schedule);

      const smsResult = await sendSMS(schedule.mobileNumber, message);
      schedule.smsSent = true;
      await schedule.save();
      results.push({ family: schedule.familyName, mobile: schedule.mobileNumber, result: smsResult });
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/palkhi/schedules/:id/status  — admin: update live status
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const schedule = await PalkhiSchedule.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    res.json({ success: true, data: schedule });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
