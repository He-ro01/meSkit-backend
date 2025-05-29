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
const RedGif = mongoose.model('ProcessedRedGifs', redGifSchema, 'processedredgifs');

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
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !targetUrl.startsWith(ALLOWED_HOST)) {
    return res.status(400).send('Blocked: Invalid URL');
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.redgifs.com/',
      },
    });

    const contentType = response.headers.get('content-type');
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Content-Type': contentType,
    });

    // If it's a playlist (.m3u8), rewrite it
    if (targetUrl.endsWith('.m3u8')) {
      const text = await response.text();
      const rewritten = text.replace(
        /https:\/\/media\.redgifs\.com\/[^\s]+/g,
        match => `http://localhost:3000/proxy?url=${encodeURIComponent(match)}`
      );
      return res.send(rewritten);
    }

    // For .m4s segments or other media
    response.body.pipe(res);

  } catch (err) {
    console.error(err);
    res.status(500).send('Proxy error');
  }
});

//
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
