const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('./db');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all routes
app.use(cors());

// Schema for processedredgifs
const redGifSchema = new mongoose.Schema({}, { strict: false }); // flexible schema
const RedGif = mongoose.model('ProcessedRedGifs', redGifSchema, 'processedredgifs');

app.get('/fetch-videos', async (req, res) => {
  console.log(RedGif);
  const count = parseInt(req.query.var) || 10;

  try {
    const randomDocs = await RedGif.aggregate([
      { $sample: { size: count } }
    ]);

    res.json(randomDocs);
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
