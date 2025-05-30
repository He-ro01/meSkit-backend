const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const s3 = new AWS.S3({ region: process.env.AWS_REGION });

/**
 * Upload all files from a folder to S3 under an optional prefix (empty for root).
 */
async function uploadFolderToS3(folderPath, bucketName, prefix = '') {
  const files = fs.readdirSync(folderPath);

  for (const file of files) {
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
