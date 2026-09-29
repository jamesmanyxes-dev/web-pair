const config = require('../config');
const { cmd } = require('../command');
const yts = require('yt-search');
const axios = require('axios');

// Play command - using first API endpoint
cmd({
    pattern: "play",
    alias: ["ytmp3", "yta"],
    desc: "Download YouTube songs",
    category: "downloader",
    react: "🎵",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) return await reply("🎶 Please provide song name!\n\nExample: .play Moye Moye");

        // Search on YouTube
        const { videos } = await yts(q);
        if (!videos || videos.length === 0) return await reply("❌ No results found!");

        const vid = videos[0];
        const api = `https://apis-keith.vercel.app/download/audio?url=${encodeURIComponent(vid.url)}`;
        const res = await axios.get(api);
        const json = res.data;

        if (!json?.status || !json?.result) {
            return await reply("❌ Download failed! Try again later.");
        }

        const audioUrl = json.result;
        const title = vid.title || "song";

        // Send audio
        await conn.sendMessage(from, {
            audio: { url: audioUrl },
            mimetype: "audio/mpeg",
            fileName: `${title}.mp3`
        }, { quoted: mek });

        // Success reaction ✅
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error("Error in .play:", e);
        await reply("❌ Error occurred, try again later!");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// Play2 command - using second API endpoint
cmd({
    pattern: "play2",
    desc: "Download YouTube songs (alternative)",
    category: "downloader",
    react: "🎵",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) return await reply("🎶 Please provide song name!\n\nExample: .play2 Moye Moye");

        // Search on YouTube
        const { videos } = await yts(q);
        if (!videos || videos.length === 0) return await reply("❌ No results found!");

        const vid = videos[0];
        const api = `https://apis-keith.vercel.app/download/yta?url=${encodeURIComponent(vid.url)}`;
        const res = await axios.get(api);
        const json = res.data;

        if (!json?.success || !json?.result) {
            return await reply("❌ Download failed! Try again later.");
        }

        const audioUrl = json.result;
        const title = vid.title || "song";

        // Send audio
        await conn.sendMessage(from, {
            audio: { url: audioUrl },
            mimetype: "audio/mpeg",
            fileName: `${title}.mp3`
        }, { quoted: mek });

        // Success reaction ✅
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error("Error in .play2:", e);
        await reply("❌ Error occurred, try again later!");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// Play3 command - using third API endpoint
cmd({
    pattern: "play3",
    desc: "Download YouTube songs (alternative 2)",
    category: "downloader",
    react: "🎵",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) return await reply("🎶 Please provide song name!\n\nExample: .play3 Moye Moye");

        // Search on YouTube
        const { videos } = await yts(q);
        if (!videos || videos.length === 0) return await reply("❌ No results found!");

        const vid = videos[0];
        const api = `https://apis-keith.vercel.app/download/ytmp3?url=${encodeURIComponent(vid.url)}`;
        const res = await axios.get(api);
        const json = res.data;

        if (!json?.status || !json?.result?.url) {
            return await reply("❌ Download failed! Try again later.");
        }

        const audioUrl = json.result.url;
        const title = json.result.filename || vid.title || "song";

        // Send audio
        await conn.sendMessage(from, {
            audio: { url: audioUrl },
            mimetype: "audio/mpeg",
            fileName: `${title}.mp3`
        }, { quoted: mek });

        // Success reaction ✅
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error("Error in .play3:", e);
        await reply("❌ Error occurred, try again later!");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// Play4 command - using fourth API endpoint
cmd({
    pattern: "play4",
    desc: "Download YouTube songs (alternative 3)",
    category: "downloader",
    react: "🎵",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) return await reply("🎶 Please provide song name!\n\nExample: .play4 Moye Moye");

        // Search on YouTube
        const { videos } = await yts(q);
        if (!videos || videos.length === 0) return await reply("❌ No results found!");

        const vid = videos[0];
        const api = `https://apis-keith.vercel.app/download/mp3?url=${encodeURIComponent(vid.url)}`;
        const res = await axios.get(api);
        const json = res.data;

        if (!json?.status || !json?.result) {
            return await reply("❌ Download failed! Try again later.");
        }

        const audioUrl = json.result;
        const title = vid.title || "song";

        // Send audio
        await conn.sendMessage(from, {
            audio: { url: audioUrl },
            mimetype: "audio/mpeg",
            fileName: `${title}.mp3`
        }, { quoted: mek });

        // Success reaction ✅
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error("Error in .play4:", e);
        await reply("❌ Error occurred, try again later!");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});
