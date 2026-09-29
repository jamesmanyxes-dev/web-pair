const config = require('../config')
const {cmd , commands} = require('../command')
const os = require("os")
const {runtime} = require('../lib/functions')
const axios = require('axios')
const {sleep} = require('../lib/functions')
const fs = require('fs')
const path = require('path')

cmd({
    pattern: "repo",
    alias: ["sc", "script", "repository"],
    desc: "Fetch information about a GitHub repository.",
    react: "📂",
    category: "info",
    filename: __filename,
},
async (conn, mek, m, { from, reply }) => {
    const githubRepoURL = 'https://github.com/evil666MD/evil⁶⁶⁶MD';

    try {
        // Extract username and repo name from the URL
        const [, username, repoName] = githubRepoURL.match(/github\.com\/([^/]+)\/([^/]+)/);

        // Fetch repository details using GitHub API with axios
        const response = await axios.get(`https://api.github.com/repos/${username}/${repoName}`);
        
        const repoData = response.data;

        // Format the repository information in new stylish format
        const formattedInfo = `
╭─〔 *evil⁶⁶⁶MD REPOSITORY* 〕
│
├─ *📌 Repository Name:* ${repoData.name}
├─ *👑 Owner:* evil666MD
├─ *⭐ Stars:* ${repoData.stargazers_count}
├─ *⑂ Forks:* ${repoData.forks_count}
├─ *📝 Description:* ${repoData.description || 'World Best WhatsApp Bot powered by evil666MD'}
│
├─ *🔗 GitHub Link:*
│   ${repoData.html_url}
│
├─ *🌐 Join Channel:*
│   https://whatsapp.com/channel/0029VatOy2EAzNc2WcShQw1j
│
╰─ *⚡ Powered by evil⁶⁶⁶MD*
`.trim();

        // Send an image with the formatted info as a caption
        await conn.sendMessage(from, {
            image: { url: `https://files.catbox.moe/7zfdcq.jpg` }, // Replace with your image URL
            caption: formattedInfo,
            contextInfo: { 
                mentionedJid: [m.sender],
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363354023106228@newsletter',
                    newsletterName: 'evil⁶⁶⁶MD',
                    serverMessageId: 143
                }
            }
        }, { quoted: mek });

        // Send audio voice message after sending repo info
        const audioPath = path.join(__dirname, '../assets/menux.m4a');
        
        if (fs.existsSync(audioPath)) {
            await conn.sendMessage(from, {
                audio: { url: audioPath },
                mimetype: 'audio/mp4',
                ptt: false
            }, { quoted: mek });
        } else {
            console.error("Audio file not found at path:", audioPath);
        }

    } catch (error) {
        console.error("Error in repo command:", error);
        reply("❌ Sorry, something went wrong while fetching the repository information. Please try again later.");
    }
});
