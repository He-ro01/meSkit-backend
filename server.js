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
const RedGif = mongoose.model('Videos', redGifSchema, 'videos');

app.get('/fetch-videos', async (req, res) => {
  const count = parseInt(req.query.var) || 10;

  try {
    const randomDocs = await RedGif.aggregate([{ $sample: { size: count } }]);

    // Replace "m4s" with "mp4" in each document's URL field
    const updatedDocs = randomDocs.map(doc => {
      // If the URL field is directly at doc.url
      if (doc.videoUrl && typeof doc.videoUrl === 'string') {
        doc.videoUrl = doc.videoUrl.replace(/m4s/g, 'mp4');
      }
      
      // If the URL is nested or in other fields, you can adjust this part accordingly

      return doc;
    });

    res.json(updatedDocs);
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
