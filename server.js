const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('./db');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { uploadFolderToS3 } = require('./upload_module');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Schema for processedredgifs
const redGifSchema = new mongoose.Schema({}, { strict: false }); // flexible schema
const RedGif = mongoose.model('Videos', redGifSchema, 'videos');

app.get('/fetch-videos', async (req, res) => {
  const count = parseInt(req.query.var) || 10;

  try {
    const randomDocs = await RedGif.aggregate([{ $sample: { size: count } }]);

    // Replace "m4s" with "mp4" in each doc's videoUrl field if exists
    const updatedDocs = randomDocs.map(doc => {
      if (doc.videoUrl && typeof doc.videoUrl === 'string') {
        doc.videoUrl = doc.videoUrl.replace(/m4s/g, 'mp4');
      }
      return doc;
    });

    res.json(updatedDocs);
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/convert', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing "url" in request body' });

  const id = uuidv4();
  const workingDir = path.join(__dirname, 'videos', id);
  const inputPath = path.join(workingDir, 'input.mp4');
  const outputPath = path.join(workingDir, 'output.m3u8');

  try {
    fs.mkdirSync(workingDir, { recursive: true });

    // Download video
    const writer = fs.createWriteStream(inputPath);
    const response = await axios.get(url, { responseType: 'stream' });
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Convert to HLS using ffmpeg (fixed syntax: -codec copy)
    const cmd = `ffmpeg -i "${inputPath}" -codec copy -start_number 0 -hls_time 10 -hls_list_size 0 -f hls "${outputPath}"`;
    console.log(`Executing: ${cmd}`);

    await new Promise((resolve, reject) => {
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          console.error(stderr);
          return reject(err);
        }
        console.log(stdout);
        resolve();
      });
    });

    // Upload all files in workingDir (which contains .m3u8 + .ts files)
    await uploadFolderToS3(workingDir, 'zidit', `hls/${id}`);

    res.json({
      message: 'Conversion successful',
      hlsFolder: `/videos/${id}/`,
      masterPlaylist: `/videos/${id}/output.m3u8`,
      s3Path: `hls/${id}/output.m3u8`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Conversion failed', details: error.message });
  }
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
