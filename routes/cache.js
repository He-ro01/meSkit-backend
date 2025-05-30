const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { convertMP4ToHLS } = require('../ffmpeg/convert');
const { uploadFolderToS3 } = require('../s3/upload');
const { deleteFolderRecursive } = require('../utils/cleanup');
const { downloadFile } = require('../utils/downloader');

const CLOUDFRONT_DOMAIN = 'https://d2f8yoxn7t93pq.cloudfront.net';

router.post('/cache', async (req, res) => {
  console.log("starting");
  const { videoUrl: url } = req.body;

  if (!url || !url.endsWith('.mp4')) {
    return res.status(400).json({ error: 'Invalid MP4 URL' });
  }

  // Extract name from URL (e.g., RoyalblueWeepyDoe from .../RoyalblueWeepyDoe-mobile.mp4)
  const match = url.match(/\/([^/]+?)(?:-mobile)?\.mp4$/);
  if (!match) return res.status(400).json({ error: 'Cannot extract name from URL' });
  const baseName = match[1];

  const tempFolder = path.join(__dirname, '..', 'temp', `temp_${uuidv4()}`);
  const downloadedFilePath = path.join(tempFolder, `${baseName}.mp4`);

  try {
    fs.mkdirSync(tempFolder, { recursive: true });

    console.log(`[1/5] Downloading ${url}...`);
    await downloadFile(url, downloadedFilePath);

    console.log(`[2/5] Converting to HLS...`);
    await convertMP4ToHLS(downloadedFilePath, tempFolder, baseName);

    console.log(`[3/5] Uploading to S3 root as ${baseName}.*`);
    await uploadFolderToS3(tempFolder, 'zidit', ''); // No prefix = root

    const streamUrl = `${CLOUDFRONT_DOMAIN}/${baseName}.m3u8`;
    console.log(`[4/5] Stream URL ready: ${streamUrl}`);

    // Immediately cleanup temp files
    deleteFolderRecursive(tempFolder);
    console.log(`[5/5] Temp files deleted.`);

    res.json({ streamUrl });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: 'Conversion failed', details: err.message });
  }
});

module.exports = router;
