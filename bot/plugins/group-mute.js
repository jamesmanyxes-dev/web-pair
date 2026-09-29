const config = require('../config')
const { cmd } = require('../command')

async function getGroupAdmins(participants = []) {
    const admins = []
    for (let p of participants) {
        if (p.admin === "admin" || p.admin === "superadmin") {
            admins.push(p.id) // p.id can be LID or PN
        }
    }
    return admins
}

cmd({
    pattern: "mute",
    alias: ["groupmute"],
    react: "🔇",
    desc: "Mute the group (Only admins can send messages).",
    category: "group",
    filename: __filename
},           
async (conn, mek, m, { from, isGroup, isBotAdmins, reply }) => {
    try {
        if (!isGroup) return reply("❌ This command can only be used in groups.");

        // ✅ Fix for LID update
        const senderId = mek.key.participant || mek.key.participantAlt
        const groupMetadata = await conn.groupMetadata(from)
        const groupAdmins = await getGroupAdmins(groupMetadata.participants)
        const isAdmins = groupAdmins.includes(senderId)

        if (!isAdmins) return reply("❌ Only group admins can use this command.");
        if (!isBotAdmins) return reply("❌ I need to be an admin to mute the group.");

        await conn.groupSettingUpdate(from, "announcement")
        reply("✅ Group has been muted. Only admins can send messages.")
    } catch (e) {
        console.error("Error muting group:", e)
        reply("❌ Failed to mute the group. Please try again.")
    }
})
