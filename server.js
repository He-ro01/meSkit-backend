const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = 3000;

app.use(cors());

// Validate .env variables early
const requiredEnv = [
    'REDDIT_CLIENT_ID',
    'REDDIT_CLIENT_SECRET',
    'REDDIT_USERNAME',
    'REDDIT_PASSWORD',
    'REDDIT_USER_AGENT'
];

for (const key of requiredEnv) {
    if (!process.env[key]) {
        console.error(`❌ Missing required .env variable: ${key}`);
        process.exit(1);
    }
}

// Token cache
let accessToken = null;
let tokenExpiry = 0;

// Utility: Is token expired?
function isTokenExpired() {
    return !accessToken || Date.now() >= tokenExpiry;
}

// Step 1: Get new access token
async function getRedditAccessToken() {
    console.log('🔑 Fetching new Reddit access token...');

    const auth = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64');

    try {
        const response = await axios.post(
            'https://www.reddit.com/api/v1/access_token',
            new URLSearchParams({
                grant_type: 'password',
                username: process.env.REDDIT_USERNAME,
                password: process.env.REDDIT_PASSWORD,
            }),
            {
                headers: {
                    Authorization: `Basic ${auth}`,
                    'User-Agent': process.env.REDDIT_USER_AGENT,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        accessToken = response.data.access_token;
        tokenExpiry = Date.now() + response.data.expires_in * 1000;

        console.log('✅ Access token received');
        return accessToken;
    } catch (error) {
        console.error('❌ Failed to get access token');
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data);
        throw error;
    }
}

// Step 2: API Endpoint
async function fetchAllPosts(subreddit, accessToken, maxPages = 10) {
    let allPosts = [];
    let after = null;
    let page = 0;

    while (page < maxPages) {
        const url = `https://oauth.reddit.com/r/${subreddit}/new.json?limit=100${after ? `&after=${after}` : ''}`;
        const res = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': process.env.REDDIT_USER_AGENT,
            },
        });

        const posts = res.data.data.children;
        allPosts.push(...posts);

        after = res.data.data.after;
        if (!after) break;
        page++;
    }

    return { posts: allPosts, after };
}

function getRandomItems(arr, count) {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

app.get('/api/reddit-videos', async (req, res) => {
    try {
        if (isTokenExpired()) {
            await getRedditAccessToken();
        }

        console.log('📡 Fetching all Reddit posts...');
        const { posts: allPosts, after: newAfter } = await fetchAllPosts('EbonyHotties', accessToken, 10);
        console.log(`📄 Retrieved ${allPosts.length} posts.`);

        //convert gifs to mp4, delete the ones that cant be converted
        const mediaPosts = allPosts.filter(post => {
            const isVideo = post.data.is_video;
            const isGif = post.data.url.endsWith('.gif');
            const isMp4 = post.data.url.endsWith('.mp4');

            if (isVideo) {
                return true;
            } else if (isGif) {
                // Convert GIF to MP4
                const mp4Url = post.data.url.replace('.gif', '.mp4');
                post.data.url = mp4Url;
                return true;
            } else if (isMp4) {
                return true;
            }
            return false;
        });
        //delete everything that is not mp4
        i = 0;
        const videos = [];

        console.log(`🎬 Found ${mediaPosts.length} valid media posts.`);

        const selected = getRandomItems(mediaPosts, mediaPosts.Length);
        // 👉 Return 5 random posts + total + new after token
        res.json({
            data: { children: selected },
            total: mediaPosts.length,
            after: newAfter, // Include the new after token so the frontend can request next page
        });

    } catch (error) {
        console.error('🔥 Reddit API error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to fetch Reddit videos' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
