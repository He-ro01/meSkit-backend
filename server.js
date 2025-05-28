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
// Endpoint to fetch multiple random videos and remove them from the full list
app.get('/fetch-videos', async (req, res) => {
  const count = Math.min(parseInt(req.query.var) || 10, 50); // max 50
  try {
    // Step 1: Fetch all videos from DB
    const allDocs = await RedGif.find({}).lean(); // lean() gives plain JS objects

    // Step 2: Fetch random subset
    const randomDocs = await RedGif.aggregate([{ $sample: { size: count } }]);

    // Step 3: Normalize and replace "m4s" with "mp4" in video URLs
    const processedRandomDocs = randomDocs.map(doc => {
      if (doc.videoUrl && typeof doc.videoUrl === 'string') {
        doc.videoUrl = doc.videoUrl.replace(/m4s/g, 'mp4');
      }
      return doc;
    });

    // Step 4: Filter out fetched ones from the full list
    const fetchedIds = new Set(processedRandomDocs.map(doc => doc._id.toString()));
    const remainingDocs = allDocs.filter(doc => !fetchedIds.has(doc._id.toString()));

    // Final result
    res.json({
      fetched: processedRandomDocs,
      remaining: remainingDocs
    });

  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to fetch a single random video
app.get('/fetch-video', async (req, res) => {
  try {
    // Step 1: Fetch all videos
    const allDocs = await RedGif.find({}).lean();

    // Step 2: Fetch one random video
    const [randomDoc] = await RedGif.aggregate([{ $sample: { size: 1 } }]);

    if (!randomDoc) {
      return res.status(404).json({ error: 'No video found' });
    }

    // Step 3: Replace "m4s" with "mp4" in video URL
    if (randomDoc.videoUrl && typeof randomDoc.videoUrl === 'string') {
      randomDoc.videoUrl = randomDoc.videoUrl.replace(/m4s/g, 'mp4');
    }

    // Step 4: Remove the fetched one from the allDocs array
    const remainingDocs = allDocs.filter(doc => doc._id.toString() !== randomDoc._id.toString());

    // Respond with both fetched and remaining videos
    res.json({
      fetched: randomDoc,
      remaining: remainingDocs
    });

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
