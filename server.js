const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('./db');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// MongoDB schema
const redGifSchema = new mongoose.Schema({}, { strict: false });
const RedGif = mongoose.model('ProcessedRedGifs', redGifSchema, 'processedredgifs');

// Simulated upload function – replace with actual S3 logic
function simulateUpload(localPath, outputFileName) {
  // Simulate an upload and return a public URL
  return `https://yourcdn.com/hls/${outputFileName}/master.m3u8`;
}

// HLS processing function
async function convertToHLS(originalUrl, outputDir, baseName) {
  return new Promise((resolve, reject) => {
    const cmd = `ffmpeg -i "${originalUrl}" -c:v libx264 -c:a aac -f hls -hls_time 5 -hls_playlist_type vod "${outputDir}/master.m3u8"`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error(`FFmpeg error:`, stderr);
        return reject(err);
      }
      resolve();
    });
  });
}

// Core logic to fetch and convert videoUrl to hlsUrl
async function getProcessedVideos(count) {
  const randomDocs = await RedGif.aggregate([{ $sample: { size: count } }]);
  const updatedDocs = [];

  for (const doc of randomDocs) {
    const data = doc.toObject ? doc.toObject() : doc;
    if (!data.videoUrl || typeof data.videoUrl !== 'string') continue;

    // Replace "m4s" with "mp4"
    const fixedVideoUrl = data.videoUrl.replace(/m4s/g, 'mp4');
    const baseName = `video_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const outputDir = path.join(__dirname, 'hls_output', baseName);

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    try {
      await convertToHLS(fixedVideoUrl, outputDir, baseName);
      const hlsUrl = simulateUpload(outputDir, baseName);

      // Save hlsUrl to DB if not already saved
      if (!data.hlsUrl) {
        await RedGif.updateOne({ _id: doc._id }, { $set: { hlsUrl } });
        data.hlsUrl = hlsUrl;
      } else {
        console.log(`✔ hlsUrl already exists for ID ${doc._id}`);
      }

      data.videoUrl = fixedVideoUrl; // Update replaced version
      updatedDocs.push(data);
    } catch (error) {
      console.warn(`⚠ Failed to process video for ID ${doc._id}`, error.message);
    }
  }

  return updatedDocs;
}

// Route: Fetch multiple videos
app.get('/fetch-videos', async (req, res) => {
  const count = Math.min(parseInt(req.query.var) || 10, 50);
  try {
    const videos = await getProcessedVideos(count);
    res.json(videos);
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Route: Fetch single video
app.get('/fetch-video', async (req, res) => {
  try {
    const [video] = await getProcessedVideos(1);
    res.json(video);
  } catch (err) {
    console.error('Error fetching video:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
