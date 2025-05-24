const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Cache settings
const CACHE_PATH = path.join(__dirname, 'reddit_cache.json');
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

app.use(cors());

// Check required .env variables
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

// Token handling
let accessToken = null;
let tokenExpiry = 0;

function isTokenExpired() {
    return !accessToken || Date.now() >= tokenExpiry;
}

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

// Fetch Reddit posts from a subreddit
async function fetchAllPosts(subreddit, accessToken, maxPages = 20) {
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

// Filter for video/gif posts
function extractMediaPosts(posts) {
    return posts.filter(post => {
        const { is_video, url } = post.data;
        const isGif = url.endsWith('.gif');
        const isMp4 = url.endsWith('.mp4');

        if (is_video) return true;
        if (isGif) {
            post.data.url = url.replace('.gif', '.mp4');
            return true;
        }
        if (isMp4) return true;
        return false;
    });
}

// Shuffle and select posts
function getRandomItems(arr, count) {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

// Check if cache is fresh
function isCacheFresh(filePath, ttl) {
    try {
        const stats = fs.statSync(filePath);
        const age = Date.now() - stats.mtimeMs;
        return age < ttl;
    } catch (err) {
        return false;
    }
}

// Reddit API endpoint
app.get('/api/reddit-videos', async (req, res) => {
    try {
        // Cache hit
        if (isCacheFresh(CACHE_PATH, CACHE_TTL)) {
            console.log('📦 Using cached Reddit data');
            const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
            const selectedPosts = getRandomItems(cached.data.children, cached.data.children.length);

            const responseData = {
                data: {
                    children: selectedPosts,
                    total: selectedPosts.length,
                    after: cached.data.after,
                    cachedAt: cached.data.cachedAt,
                }
            };

            return res.json(responseData);
        }

        // Cache miss
        if (isTokenExpired()) {
            await getRedditAccessToken();
        }

        console.log('📡 Fetching Reddit posts...');
        const { posts: allPosts, after: newAfter } = await fetchAllPosts('Funny', accessToken, 10);
        console.log(`📄 Retrieved ${allPosts.length} posts.`);

        const mediaPosts = extractMediaPosts(allPosts);
        console.log(`🎬 Filtered down to ${mediaPosts.length} media posts.`);

        // Cache full list
        const cachedData = {
            data: {
                children: mediaPosts,
                total: mediaPosts.length,
                after: newAfter,
                cachedAt: new Date().toISOString(),
            }
        };

        fs.writeFileSync(CACHE_PATH, JSON.stringify(cachedData, null, 2), 'utf-8');
        console.log('✅ Cached new data.');

        const selectedPosts = getRandomItems(mediaPosts, mediaPosts.length);
        const responseData = {
            data: {
                children: selectedPosts,
                total: selectedPosts.length,
                after: newAfter,
                cachedAt: cachedData.data.cachedAt,
            }
        };

        res.json(responseData);
    } catch (error) {
        console.error('🔥 Reddit API error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to fetch Reddit videos' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
