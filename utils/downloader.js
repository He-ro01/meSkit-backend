const fs = require('fs');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream');
const { promisify } = require('util');
const path = require('path');

const streamPipeline = promisify(pipeline);

/**
 * Downloads a file from the given URL to the specified destination path.
 * Supports both HTTP and HTTPS URLs.
 * 
 * @param {string} url - The URL to download.
 * @param {string} dest - The file path to save to (e.g. /tmp/video.mp4).
 */
async function downloadFile(url, dest) {
  const client = url.startsWith('https') ? https : http;

  return new Promise((resolve, reject) => {
    client.get(url, response => {
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
      }

      const fileStream = fs.createWriteStream(dest);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(resolve);
      });

      fileStream.on('error', err => {
        fs.unlink(dest, () => reject(err));
      });
    }).on('error', reject);
  });
}

module.exports = {
  downloadFile
};
