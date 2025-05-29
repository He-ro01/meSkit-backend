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
      // Example: https://media.redgifs.com/AlarmingJuicyWoodstorks-mobile.m4s
      const m4sUrl = plainDoc.videoUrl;
      const proxyM3U8 = `https://test-video-backend.onrender.com/fake-playlist.m3u8?url=${encodeURIComponent(m4sUrl)}`;

      return {
        ...plainDoc,
        m3u8: proxyM3U8 // add generated playlist URL
      };
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
app.get('/fake-playlist.m3u8', (req, res) => {
  const originalM4SUrl = req.query.url;
  if (!originalM4SUrl || !originalM4SUrl.startsWith('https://media.redgifs.com')) {
    return res.status(400).send("Invalid .m4s URL");
  }

  const proxyUrl = `http://localhost:${PORT}/proxy?url=${encodeURIComponent(originalM4SUrl)}`;

  const initSegment = "1433@0";
  const segments = [
    "261489@1433",
    "303728@262922",
    "341823@566650",
    "370377@908473",
    "326299@1278850",
    "355767@1605149",
    "313570@1960916",
    "309220@2274486",
    "296417@2583706",
    "35237@2880123"
  ];
  const durations = [2, 2, 2, 2, 2, 2, 2, 2, 2, 0.166667];

  let playlist = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:${Math.ceil(Math.max(...durations))}
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-MAP:URI="${proxyUrl}",BYTERANGE="${initSegment}"
`;

  for (let i = 0; i < segments.length; i++) {
    playlist += `#EXTINF:${durations[i]},\n`;
    playlist += `#EXT-X-BYTERANGE:${segments[i]}\n`;
    playlist += `${proxyUrl}\n`;
  }

  playlist += "#EXT-X-ENDLIST\n";

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(playlist);
});

//
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
