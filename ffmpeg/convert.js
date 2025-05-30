const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

function convertMP4ToHLS(mp4Path, outputDir, baseName) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const command = `ffmpeg -y -i "${mp4Path}" -c copy -f hls -hls_time 10 -hls_list_size 0 -hls_segment_filename "${outputDir}/${baseName}_%03d.ts" "${outputDir}/${baseName}.m3u8"`;

    exec(command, (err, stdout, stderr) => {
      if (err) {
        console.error(stderr);
        return reject(err);
      }
      resolve(path.join(outputDir, `${baseName}.m3u8`));
    });
  });
}


module.exports = { convertMP4ToHLS };
