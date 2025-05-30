require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const fetch = require('node-fetch');
const cacheRoutes = require('./routes/cache'); // Make sure this file exists and exports an Express router
const sharp = require('sharp');
const { uploadBufferToS3 } = require('./s3/upload'); // Create this helper
const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
//

const CLOUDFRONT_DOMAIN = 'https://d2f8yoxn7t93pq.cloudfront.net';
const BUCKET_NAME = 'zidit';
// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ✅ MongoDB Schema
const redGifSchema = new mongoose.Schema({}, { strict: false });
const RedGif = mongoose.model('ProcessedRedGifs', redGifSchema, 'processedredgifs');

// ✅ Utility: Get random documents
async function getRandomVideos(count) {
  const randomDocs = await RedGif.aggregate([{ $sample: { size: count } }]);

  const processedDocs = await Promise.all(
    randomDocs.map(async (doc) => {
      const plainDoc = doc.toObject ? doc.toObject() : doc;

      // ❌ If videoUrl is missing, delete and skip
      if (!plainDoc.videoUrl) {
        console.warn('⚠️ Missing videoUrl for doc:', doc._id);
        try {
          await RedGif.deleteOne({ _id: doc._id });
          console.log(`🗑️ Deleted doc with missing videoUrl: ${doc._id}`);
        } catch (delErr) {
          console.error(`❌ Error deleting doc ${doc._id}:`, delErr);
        }
        return null;
      }

      // ✅ Convert imageUrl to JPG and upload
      if (plainDoc.imageUrl && !plainDoc.imageUrl.includes(CLOUDFRONT_DOMAIN)) {
        try {
          const imageRes = await fetch(plainDoc.imageUrl);
          if (!imageRes.ok) throw new Error(`Failed to fetch image: ${imageRes.statusText}`);
          const buffer = await imageRes.buffer();

          const jpgBuffer = await sharp(buffer).jpeg().toBuffer();
          const imageKey = `images/${plainDoc._id}.jpg`;
          const imageUrl = `${CLOUDFRONT_DOMAIN}/${imageKey}`;

          await uploadBufferToS3(BUCKET_NAME, imageKey, jpgBuffer, 'image/jpeg');
          plainDoc.imageUrl = imageUrl;
        } catch (err) {
          console.warn(`❌ Failed to process image for doc ${plainDoc._id}:`, err.message);
          plainDoc.imageUrl = null;
        }
      }

      // ✅ HLS convert .m4s to .m3u8 via /api/cache
      if (plainDoc.videoUrl.endsWith('.m4s')) {
        plainDoc.videoUrl = plainDoc.videoUrl.replace(/\.m4s$/, '.mp4');
        try {
          const processRes = await fetch(`http://localhost:${PORT}/api/cache`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl: plainDoc.videoUrl }),
          });

          const json = await processRes.json();
          console.log(json.streamUrl);
          plainDoc.videoUrl = json.streamUrl;
        } catch (err) {
          console.warn("❌ Error processing HLS for doc", doc._id, err);
          return null;
        }
      }

      return plainDoc;
    })
  );

  return processedDocs.filter(Boolean); // Remove null entries
}



// ✅ API: Fetch multiple videos
app.get('/fetch-videos', async (req, res) => {
  const count = Math.min(parseInt(req.query.var) || 10, 50);
  try {
    const videos = await getRandomVideos(count);
    res.json(videos);
  } catch (err) {
    console.error('❌ Error fetching videos:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ API: Fetch one video
app.get('/fetch-video', async (req, res) => {
  try {
    let video = null;
    while (true) {
      const [candidate] = await getRandomVideos(1);
      console.log(candidate);
      if (candidate?.videoUrl) {
        video = candidate;
        break;
      }
      console.warn('⚠️ Skipping null videoUrl...');
    }

    res.json(video);
  } catch (err) {
    console.error('❌ Error fetching single video:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ Cache routes (from conv-server)
app.use('/api', cacheRoutes);

// ✅ Wake-up/status route
app.get('/', (req, res) => {
  res.send('✅ Combined server is alive at ' + new Date().toISOString());
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`✅ Combined server running at http://localhost:${PORT}`);
});
