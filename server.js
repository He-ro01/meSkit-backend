const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('./db');
const cors = require('cors');
require('dotenv').config();
const fetch = require('node-fetch'); // Ensure you have node-fetch installed

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// MongoDB Schema
const redGifSchema = new mongoose.Schema({}, { strict: false });
const RedGif = mongoose.model('ProcessedRedGifs', redGifSchema, 'processedredgifs');

// Whitelisted Hosts
const ALLOWED_HOSTS = [
  'https://api.redgifs.com',
  'https://media.redgifs.com',
];

// Utility to return random videos with proxy URL
async function getRandomVideos(count) {
  const randomDocs = await RedGif.aggregate([{ $sample: { size: count } }]);
  return randomDocs.map(doc => {
    const plainDoc = doc.toObject ? doc.toObject() : doc;

    if (!plainDoc.videoUrl) {
      console.warn('Missing videoUrl for doc:', doc._id);
      return null; // Skip this doc
    }

    // If videoUrl ends with .m4s, try to convert it to .mp4
    if (plainDoc.videoUrl.endsWith('.m4s')) {
      plainDoc.videoUrl = plainDoc.videoUrl.replace(/\.m4s$/, '.mp4');
    }

    return {
      ...plainDoc
    };
  }).filter(Boolean); // remove nulls
}


// Fetch multiple videos
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

// Fetch single video
app.get('/fetch-video', async (req, res) => {
  try {
    let video = null;

    while (true) {
      const [candidate] = await getRandomVideos(1);
      if (candidate?.videoUrl) {
        video = candidate;
        break;
      }
      // Optional: log the skip for debug
      console.warn('Skipping null videoUrl...');
    }

    res.json(video);
  } catch (err) {
    console.error('Error fetching video:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



// Proxy endpoint
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !ALLOWED_HOSTS.some(host => targetUrl.startsWith(host))) {
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

    if (targetUrl.endsWith('.m3u8')) {
      const text = await response.text();
      const proxyBase = `https://meskit-backend.onrender.com/proxy`;
      const rewritten = text.replace(
        /https:\/\/media\.redgifs\.com\/[^\s"]+/g,
        (match) => `${proxyBase}?url=${encodeURIComponent(match)}`
      );
      return res.send(rewritten);
    }

    // Proxy stream
    if (response.body) {
      response.body.pipe(res);
    } else {
      const buffer = await response.buffer();
      res.send(buffer);
    }
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy error');
  }
});

// Fake HLS Playlist
app.get('/fake-playlist.m3u8', (req, res) => {
  const m4sUrl = req.query.url;
  if (!m4sUrl || !m4sUrl.startsWith('https://media.redgifs.com')) {
    return res.status(400).send('Invalid .m4s URL');
  }

  const proxyUrl = `https://meskit-backend.onrender.com/proxy?url=${encodeURIComponent(m4sUrl)}`;

  // Basic mock values — you should eventually auto-detect these
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

// Connect and start
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
