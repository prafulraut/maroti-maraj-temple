const mongoose = require('mongoose');

// Re-use one connection across calls (important for Netlify Functions,
// where the same container handles many requests).
let connectionPromise = null;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connectionPromise) {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
    connectionPromise = mongoose
      .connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 8000,
      })
      .then((conn) => {
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        return conn.connection;
      })
      .catch((err) => {
        connectionPromise = null; // allow retry on next request
        throw err;
      });
  }
  return connectionPromise;
};

module.exports = connectDB;
