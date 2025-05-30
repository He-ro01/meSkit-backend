const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const s3 = new AWS.S3({ region: process.env.AWS_REGION });

async function uploadFolderToS3(folderPath, bucketName, prefix = '') {
  const files = fs.readdirSync(folderPath);

  for (const file of files) {
    if (file.endsWith('.mp4')) {
      console.log(`🚫 Skipping .mp4 file: ${file}`);
      continue;
    }

    const filePath = path.join(folderPath, file);
    const fileKey = path.posix.join(prefix, file);

    const contentType = file.endsWith('.m3u8')
      ? 'application/vnd.apple.mpegurl'
      : 'video/MP2T';

    await s3.upload({
      Bucket: bucketName,
      Key: fileKey,
      Body: fs.readFileSync(filePath),
      ContentType: contentType,
    }).promise();

    console.log(`✅ Uploaded: ${fileKey}`);
  }
}

module.exports = { uploadFolderToS3 };
