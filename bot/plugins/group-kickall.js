const { cmd } = require('../command');

cmd({
    pattern: "end",
    alias: ["byeall", "kickall", "endgc"],
    desc: "Removes all members (including admins) from the group except specified numbers",
    category: "admin",
    react: "⚠️",
    filename: __filename
},
async (conn, mek, m, {
    from, isGroup, reply, groupMetadata, isCreator
}) => {
    if (!isGroup) return reply("❌ This command can only be used in groups.");
    if (!isCreator) return reply("❌ Only the *owner* can use this command.");

    try {
        const ignoreJids = [
            "923427582273@s.whatsapp.net",  // JID to be ignored
            "923103448168@s.whatsapp.net"   // Another JID to be ignored
        ];

        const participants = groupMetadata.participants || [];

        // Filter out ignored JIDs
        const targets = participants.filter(p => !ignoreJids.includes(p.id));
        const jids = targets.map(p => p.id);

        if (jids.length === 0) return reply("✅ No members to remove (everyone is excluded).");

        await conn.groupParticipantsUpdate(from, jids, "remove")
            .catch(e => reply("⚠️ Failed to remove some members (maybe I’m not admin)."));

        reply(`✅ Attempted to remove ${jids.length} members from the group.`);
    } catch (error) {
        console.error("End command error:", error);
        reply("❌ Failed to remove members. Error: " + error.message);
    }
});
