const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');

const { convertMP4ToHLS } = require('../ffmpeg/convert');
const { uploadFolderToS3 } = require('../s3/upload');
const { deleteFolderRecursive } = require('../utils/cleanup');
const { downloadFile } = require('../utils/downloader');

const CLOUDFRONT_DOMAIN = 'https://d2f8yoxn7t93pq.cloudfront.net';
const BUCKET_NAME = 'zidit';

const s3 = new AWS.S3({ region: process.env.AWS_REGION });

/**
 * Check if a file exists in S3.
 */
async function checkIfExistsInS3(bucket, key) {
  try {
    await s3.headObject({ Bucket: bucket, Key: key }).promise();
    return true;
  } catch (err) {
    if (err.code === 'NotFound') return false;
    throw err;
  }
}

router.post('/cache', async (req, res) => {
  const { videoUrl: url } = req.body;

  if (!url || !url.endsWith('.mp4')) {
    return res.status(400).json({ error: 'Invalid MP4 URL' });
  }

  // Extract base name from URL
  const match = url.match(/\/([^/]+?)(?:-mobile)?\.mp4$/);
  if (!match) return res.status(400).json({ error: 'Cannot extract name from URL' });

  const baseName = match[1];
  const m3u8Key = `${baseName}.m3u8`;
  const streamUrl = `${CLOUDFRONT_DOMAIN}/${m3u8Key}`;

  // ✅ Check if already processed
  try {
    const exists = await checkIfExistsInS3(BUCKET_NAME, m3u8Key);
    if (exists) {
      console.log(`✅ HLS already exists for ${baseName}`);
      return res.json({ streamUrl });
    }

    const tempFolder = path.join(__dirname, '..', 'temp', `temp_${uuidv4()}`);
    const downloadedFilePath = path.join(tempFolder, `${baseName}.mp4`);
    fs.mkdirSync(tempFolder, { recursive: true });

    console.log(`[1/5] Downloading MP4: ${url}`);
    await downloadFile(url, downloadedFilePath);

    console.log(`[2/5] Converting to HLS...`);
    await convertMP4ToHLS(downloadedFilePath, tempFolder, baseName);

    console.log(`[3/5] Uploading HLS files to S3...`);
    await uploadFolderToS3(tempFolder, BUCKET_NAME, '');

    console.log(`[4/5] Cleaning up temp files...`);
    deleteFolderRecursive(tempFolder);

    console.log(`[5/5] Stream ready at: ${streamUrl}`);
    res.json({ streamUrl });
  } catch (err) {
    console.error('❌ Error in /cache:', err);
    res.status(500).json({ error: 'Conversion failed', details: err.message });
  }
});

module.exports = router;
