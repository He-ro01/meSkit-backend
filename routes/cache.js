const AWS = require('aws-sdk');
const s3 = new AWS.S3({ region: process.env.AWS_REGION });

// Add this helper
async function checkIfExistsInS3(bucket, key) {
  try {
    await s3.headObject({ Bucket: bucket, Key: key }).promise();
    return true;
  } catch (err) {
    if (err.code === 'NotFound') return false;
    throw err; // Other errors should not be ignored
  }
}

router.post('/cache', async (req, res) => {
  const { videoUrl: url } = req.body;

  if (!url || !url.endsWith('.mp4')) {
    return res.status(400).json({ error: 'Invalid MP4 URL' });
  }

  const match = url.match(/\/([^/]+?)(?:-mobile)?\.mp4$/);
  if (!match) return res.status(400).json({ error: 'Cannot extract name from URL' });
  const baseName = match[1];
  const m3u8Key = `${baseName}.m3u8`;
  const streamUrl = `${CLOUDFRONT_DOMAIN}/${m3u8Key}`;

  try {
    // ✅ [0] Check if HLS version already exists
    const exists = await checkIfExistsInS3('zidit', m3u8Key);
    if (exists) {
      console.log(`✅ HLS already exists: ${m3u8Key}`);
      return res.json({ streamUrl });
    }

    const tempFolder = path.join(__dirname, '..', 'temp', `temp_${uuidv4()}`);
    const downloadedFilePath = path.join(tempFolder, `${baseName}.mp4`);
    fs.mkdirSync(tempFolder, { recursive: true });

    console.log(`[1/5] Downloading ${url}...`);
    await downloadFile(url, downloadedFilePath);

    console.log(`[2/5] Converting to HLS...`);
    await convertMP4ToHLS(downloadedFilePath, tempFolder, baseName);

    console.log(`[3/5] Uploading to S3 as ${baseName}.*`);
    await uploadFolderToS3(tempFolder, 'zidit', '');

    deleteFolderRecursive(tempFolder);
    console.log(`[5/5] Temp files deleted.`);

    res.json({ streamUrl });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: 'Conversion failed', details: err.message });
  }
});
