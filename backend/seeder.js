/**
 * Seed Script - creates starter data for the temple app.
 * Run from backend folder: npm run seed
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Event = require('./models/Event');
const Donation = require('./models/Donation');
const Contact = require('./models/Contact');
const PalkhiSchedule = require('./models/PalkhiSchedule');
const PalkhiSettings = require('./models/PalkhiSettings');

dotenv.config();

const adminEmail = process.env.ADMIN_EMAIL || 'admin@maroti-temple.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@1234';

const events = [
  {
    title: 'Hanuman Jayanti Mahapuja',
    description: 'Special abhishek, aarti, bhajan, and prasad distribution at the temple.',
    date: new Date('2026-04-02T08:00:00.000Z'),
    time: '8:00 AM',
    location: 'Maroti Maharaj Temple',
  },
  {
    title: 'Monthly Sundarkand Path',
    description: 'Community Sundarkand recitation followed by evening maha aarti.',
    date: new Date('2026-07-05T17:30:00.000Z'),
    time: '5:30 PM',
    location: 'Main Prayer Hall',
  },
  {
    title: 'Annadan Seva',
    description: 'Food distribution seva for devotees and nearby families.',
    date: new Date('2026-07-12T11:00:00.000Z'),
    time: '11:00 AM',
    location: 'Temple Premises',
  },
];

const donations = [
  {
    name: 'Ramesh Patil',
    email: 'ramesh@example.com',
    phone: '9876543210',
    amount: 2100,
    purpose: 'Temple Maintenance',
    message: 'For temple daily seva.',
  },
  {
    name: 'Sunita Deshmukh',
    email: 'sunita@example.com',
    phone: '9876501234',
    amount: 5100,
    purpose: 'Festival',
    message: 'For Hanuman Jayanti arrangements.',
  },
  {
    name: 'Amit Kulkarni',
    email: 'amit@example.com',
    phone: '9822001122',
    amount: 1100,
    purpose: 'Food Distribution',
    message: 'Annadan seva contribution.',
  },
];

const contacts = [
  {
    name: 'Prakash Jadhav',
    email: 'prakash@example.com',
    phone: '9000000001',
    subject: 'Puja booking',
    message: 'I want to book a family puja for next Sunday.',
  },
  {
    name: 'Meena Shinde',
    email: 'meena@example.com',
    phone: '9000000002',
    subject: 'Volunteer seva',
    message: 'Please share how I can volunteer during upcoming events.',
    isRead: true,
  },
];

const palkhiSchedules = [
  {
    familyName: 'Patil Family',
    mobileNumber: '9876543210',
    city: 'Village Center',
    address: 'Near Gram Panchayat',
    arrivalTime: '8:00 AM',
    timeTaken: 'Start point',
    orderIndex: 1,
    status: 'completed',
  },
  {
    familyName: 'Deshmukh Family',
    mobileNumber: '9876501234',
    city: 'Main Road',
    address: 'Hanuman Chowk',
    arrivalTime: '9:00 AM',
    timeTaken: '60 minutes',
    orderIndex: 2,
    status: 'in-transit',
  },
  {
    familyName: 'Kulkarni Family',
    mobileNumber: '9822001122',
    city: 'Market Area',
    address: 'Near Old Well',
    arrivalTime: '10:15 AM',
    timeTaken: '75 minutes',
    orderIndex: 3,
    status: 'pending',
  },
  {
    familyName: 'Shinde Family',
    mobileNumber: '9766003344',
    city: 'Temple Lane',
    address: 'Opposite School',
    arrivalTime: '11:30 AM',
    timeTaken: '75 minutes',
    orderIndex: 4,
    status: 'pending',
  },
];

const settings = {
  palkhiTitle: 'Maroti Maharaj Palkhi Sohala 2026',
  palkhiDate: '2026-07-12',
  startLocation: 'Maroti Maharaj Temple',
  endLocation: 'Maroti Maharaj Temple',
  description: 'Live route and family schedule for the annual Palkhi procession.',
  imageUrl: '',
};

const seedDatabase = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is missing in backend/.env');
    }

    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('MongoDB connected');

    await Promise.all([
      Event.deleteMany({}),
      Donation.deleteMany({}),
      Contact.deleteMany({}),
      PalkhiSchedule.deleteMany({}),
      PalkhiSettings.deleteMany({}),
    ]);

    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      admin = await User.create({
        name: 'Maroti Maharaj Admin',
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
        phone: '9999999999',
      });
    } else if (admin.role !== 'admin') {
      admin.role = 'admin';
      admin.isActive = true;
      await admin.save({ validateBeforeSave: false });
    }

    await Promise.all([
      Event.insertMany(events),
      Donation.insertMany(donations),
      Contact.insertMany(contacts),
      PalkhiSchedule.insertMany(palkhiSchedules),
      PalkhiSettings.create(settings),
    ]);

    console.log('Seed data created successfully');
    console.log(`Admin email: ${admin.email}`);
    console.log('Admin password: use ADMIN_PASSWORD from backend/.env, or Admin@1234 if not set');
    process.exit(0);
  } catch (error) {
    console.error('Seeder error:', error.message);
    process.exit(1);
  }
};

seedDatabase();
