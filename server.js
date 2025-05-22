const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors()); // Allow requests from your frontend

app.get('/api/reddit-videos', async (req, res) => {
    try {
        const redditRes = await fetch('https://www.reddit.com/r/PublicFreakout/top.json?limit=20');
        const data = await redditRes.json();

        // Filter only Reddit-hosted videos
        const videos = data.data.children.filter(post =>
            post.data.is_video &&
            post.data.media?.reddit_video?.fallback_url
        );

        res.json(videos);
    } catch (error) {
        console.error('Server error fetching Reddit:', error);
        res.status(500).json({ error: 'Failed to fetch Reddit videos' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
