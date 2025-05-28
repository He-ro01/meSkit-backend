const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('./db');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all origins (consider restricting this in production)
app.use(cors());

// Schema for processedredgifs (flexible)
const redGifSchema = new mongoose.Schema({}, { strict: false });
const RedGif = mongoose.model('Videos', redGifSchema, 'videos');

// Utility function to fetch random videos and replace "m4s" with "mp4"
async function getRandomVideos(count) {
  const randomDocs = await RedGif.aggregate([{ $sample: { size: count } }]);

  return randomDocs.map(doc => {
    const plainDoc = doc.toObject ? doc.toObject() : doc;
    if (plainDoc.videoUrl && typeof plainDoc.videoUrl === 'string') {
      plainDoc.videoUrl = plainDoc.videoUrl.replace(/m4s/g, 'mp4');
    }
    return plainDoc;
  });
}

// Endpoint to fetch multiple random videos
app.get('/fetch-videos', async (req, res) => {
  const count = Math.min(parseInt(req.query.var) || 10, 50); // max 50
  try {
    const videos = await getRandomVideos(count);
    res.json(videos);
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to fetch a single random video
app.get('/fetch-video', async (req, res) => {
  try {
    const [video] = await getRandomVideos(1);
    res.json(video);
  } catch (err) {
    console.error('Error fetching video:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Connect to database and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
