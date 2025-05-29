const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('./db');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// Schema for processedredgifs (flexible)
const redGifSchema = new mongoose.Schema({}, { strict: false });
const RedGif = mongoose.model('ProcessedRedGifs', redGifSchema, 'processedredgifs');

// In-memory playlist cache (keyed by hash of videoUrl)
const playlistCache = new Map();

// Utility: generate a simple byte-range based HLS playlist
function generateHLSPlaylist(videoUrl) {
  const proxyBaseUrl = `https://meskit-backend.onrender.com/proxy?url=${encodeURIComponent(videoUrl)}`;
  const segments = [
    "1433@0",
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
#EXT-X-MAP:URI="${proxyBaseUrl}",BYTERANGE="1433@0"
`;

  for (let i = 1; i < segments.length; i++) {
    playlist += `#EXTINF:${durations[i - 1]},\n`;
    playlist += `#EXT-X-BYTERANGE:${segments[i]}\n`;
    playlist += `${proxyBaseUrl}\n`;
  }

  playlist += "#EXT-X-ENDLIST\n";
  return playlist;
}

// Generate a deterministic ID based on video URL
function getVideoId(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

// Modified utility to fetch and augment with hlsUrl
async function getRandomVideos(count) {
  const randomDocs = await RedGif.aggregate([{ $sample: { size: count } }]);

  return randomDocs.map(doc => {
    const plainDoc = doc.toObject ? doc.toObject() : doc;
    if (plainDoc.videoUrl && typeof plainDoc.videoUrl === 'string') {
      const originalUrl = plainDoc.videoUrl;
      const hlsId = getVideoId(originalUrl);
      plainDoc.hlsUrl = `https://meskit-backend.onrender.com/playlist/${hlsId}.m3u8`;
    }
    return plainDoc;
  });
}

// Dynamic HLS playlist route
app.get('/playlist/:id.m3u8', async (req, res) => {
  const hlsId = req.params.id;

  const doc = await RedGif.findOne({
    videoUrl: { $exists: true },
  });

  const allDocs = await RedGif.find({}); // or optimize this later

  const matched = allDocs.find(d => getVideoId(d.videoUrl) === hlsId);

  if (!matched) return res.status(404).send("Playlist not found");

  const rawVideoUrl = matched.videoUrl;
  const videoUrl = rawVideoUrl.replace(/\.mp4$/, '.m4s');

  //the video url ends with mp4, please change the prefix to m4s
  //
  const playlist = generateHLSPlaylist(videoUrl);
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(playlist);
});

// Proxy route (reuse your previous logic)
const https = require('https');
app.get('/proxy', (req, res) => {
  const url = req.query.url;
  if (!url || !url.startsWith("https://media.redgifs.com")) {
    return res.status(400).send("Invalid URL");
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  https.get(url, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  }).on('error', err => {
    res.status(500).send("Proxy error: " + err.message);
  });
});

// Fetch multiple random videos
app.get('/fetch-videos', async (req, res) => {
  const count = Math.min(parseInt(req.query.var) || 10, 50);
  try {
    const videos = await getRandomVideos(count);
    res.json(videos);
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Fetch a single random video
app.get('/fetch-video', async (req, res) => {
  try {
    const [video] = await getRandomVideos(1);
    res.json(video);
  } catch (err) {
    console.error('Error fetching video:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Connect to DB and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
