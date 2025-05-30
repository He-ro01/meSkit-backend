require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const fetch = require('node-fetch');
const cacheRoutes = require('./routes/cache'); // Make sure this file exists and exports an Express router

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

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

      if (!plainDoc.videoUrl) {
        console.warn('⚠️ Missing videoUrl for doc:', doc._id);
        return null;
      }

      if (plainDoc.videoUrl.endsWith('.m4s')) {
        plainDoc.videoUrl = plainDoc.videoUrl.replace(/\.m4s$/, '.mp4');

        try {
          // No need to use localhost now — it's part of the same app
          const processRes = await fetch("http://localhost:" + PORT + "/api/cache", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ videoUrl: plainDoc.videoUrl }),
          });

          const json = await processRes.json();
          console.log(json.streamUrl);
          plainDoc.videoUrl = json.streamUrl;

        } catch (err) {
          console.warn("Error processing HLS", err);
          return null; // Skip this doc on failure
        }
      }
      return plainDoc;
    })
  );

  return processedDocs.filter(Boolean); // remove nulls
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
