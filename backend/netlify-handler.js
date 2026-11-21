// Netlify Function entry: wraps the Express app with serverless-http.
// Environment variables (MONGO_URI, JWT_SECRET, …) come from the Netlify
// site settings, not from backend/.env.
const serverless = require('serverless-http');
const connectDB = require('./config/db');
const app = require('./app');

const handler = serverless(app, {
  // Send images/videos back as binary (base64) instead of corrupting them as text
  binary: ['image/*', 'video/*'],
});

module.exports.handler = async (event, context) => {
  // Don't wait for the open MongoDB socket before returning the response
  context.callbackWaitsForEmptyEventLoop = false;
  try {
    await connectDB();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, message: 'Database unavailable. Please try again.' }),
    };
  }
  return handler(event, context);
};
