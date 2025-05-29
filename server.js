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
    plainDoc = convertm4sToM3u8(plainDoc);
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
// Allowed hosts whitelist for proxy URLs
const ALLOWED_HOSTS = [
  'https://api.redgifs.com',
  'https://media.redgifs.com',
];

// Proxy endpoint
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  // Validate URL presence and host
  if (
    !targetUrl ||
    !ALLOWED_HOSTS.some((host) => targetUrl.startsWith(host))
  ) {
    return res.status(400).send('Blocked: Invalid URL');
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://www.redgifs.com/',
      },
    });

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Content-Type': contentType,
    });

    // Rewrite .m3u8 playlist URLs to route through this proxy
    if (targetUrl.endsWith('.m3u8')) {
      const text = await response.text();
      const proxyBase = `http://localhost:${PORT}/proxy`;
      const rewritten = text.replace(
        /https:\/\/media\.redgifs\.com\/[^\s]+/g,
        (match) => `${proxyBase}?url=${encodeURIComponent(match)}`
      );
      return res.send(rewritten);
    }
    //
    function convertm4sToM3u8(url) {
      // Extract the file name without extension
      match = url.match(/\/([^\/]+?)-mobile\.m4s$/i);
      if (!match) return null;

      const gifName = match[1].toLowerCase();
      return `https://api.redgifs.com/v2/gifs/${gifName}/sd.m3u8`;
    }
    // Stream other content types (e.g., .m4s segments)
    if (response.body) {
      response.body.pipe(res);
    } else {
      // Fallback for older Node versions or non-streaming responses
      const buffer = await response.buffer();
      res.send(buffer);
    }
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy error');
  }
});
//
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
