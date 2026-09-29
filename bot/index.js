/**
 * evil⁶⁶⁶MD — fresh boot, built around the uploaded commands (untouched).
 * Pair-code auth (no QR), dynamic plugin loader, per-command error isolation,
 * auto reconnect, express keep-alive server, Telegram companion.
 */
const config = require('./config');
const fs = require('fs');
const path = require('path');
const os = require('os');
const P = require('pino');
const express = require('express');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  isJidBroadcast,
  getContentType,
  proto,
  generateWAMessageContent,
  generateWAMessage,
  prepareWAMessageMedia,
  areJidsSameUser,
  downloadContentFromMessage,
  generateForwardMessageContent,
  generateWAMessageFromContent,
  generateMessageID,
  jidDecode,
  fetchLatestBaileysVersion,
  Browsers,
} = require(config.BAILEYS);

const l = console.log;
const PREFIX = config.PREFIX;
const OWNER = String(config.OWNER_NUMBER || '22873272569').replace(/[^0-9]/g, '');
const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson } = require('./lib/functions');
const { sms } = require('./lib');
const FileType = require('file-type');
const util = require('util');

const sessionDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

const app = express();
const port = process.env.PORT || process.env.SERVER_PORT || 9090;
app.get('/', (req, res) => res.send('✅ evil⁶⁶⁶MD is alive'));
app.listen(port, () => l('[🌐] evil⁶⁶⁶MD web server listening on port ' + port));

/* ---------- robust per-command error wrapper ---------- */
function safeRun(cmd, conn, mek, m, ctx) {
  try {
    const r = cmd.function(conn, mek, m, ctx);
    if (r && typeof r.catch === 'function') r.catch(e => {
      const loc = (cmd.filename || 'plugin') + (e.stack ? ':' + (e.stack.split('\n')[1] || '').trim() : '');
      console.error('[PLUGIN ERROR] ' + cmd.pattern + ' @ ' + loc + ' :: ' + (e.message || e));
    });
  } catch (e) {
    const loc = (cmd.filename || 'plugin') + (e.stack ? ':' + (e.stack.split('\n')[1] || '').trim() : '');
    console.error('[PLUGIN ERROR] ' + cmd.pattern + ' @ ' + loc + ' :: ' + (e.message || e));
  }
}

/* ---------- dynamic command loader (scans plugins/, never hardcoded) ---------- */
let commands = [];
function loadCommands() {
  const dir = path.join(__dirname, 'plugins');
  const fresh = [];
  const errors = [];
  for (const f of fs.readdirSync(dir)) {
    if (path.extname(f).toLowerCase() !== '.js') continue;
    const file = path.join(dir, f);
    try {
      const before = require('./command').commands.length;
      delete require.cache[require.resolve(file)];
      require(file);
      const added = require('./command').commands.slice(before);
      for (const c of added) c.filename = c.filename === 'Not Provided' ? './plugins/' + f : c.filename;
      fresh.push(...added);
    } catch (e) {
      errors.push('[LOADER ERROR] ' + f + ' :: ' + (e.message || e));
    }
  }
  commands = fresh;
  return { count: fresh.length, errors };
}

/* ---------- boot WhatsApp with pair-code auth ---------- */
async function connectToWA() {
  l('[🔰] evil⁶⁶⁶MD Connecting to WhatsApp ⏳️...');
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const hasSession = fs.existsSync(path.join(sessionDir, 'creds.json')) && fs.statSync(path.join(sessionDir, 'creds.json')).size > 100;
  const { version } = await fetchLatestBaileysVersion();

  const conn = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: false, // pair code only, never QR
    browser: Browsers.macOS('Firefox'),
    syncFullHistory: false, // 428 fix: full history sync kills the socket
    auth: state,
    version,
    getMessage: async () => ({}),
  });

  conn.ev.on('creds.update', saveCreds);

  conn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr && !hasSession && !global.__pairRequested) {
      global.__pairRequested = true;
      const pairNum = (config.PAIR_NUMBER || config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
      if (pairNum) {
        setTimeout(async () => {
          try {
            const code = await conn.requestPairingCode(pairNum);
            l('╔══════════════════════════╗');
            l('  ⚡ evil⁶⁶⁶MD PAIRING CODE ⚡');
            l('     ' + code);
            l('╚══════════════════════════╝');
            l('Enter this code on WhatsApp > Linked devices > Link with phone number');
          } catch (e) { l('[PAIRING] failed: ' + e.message); }
        }, 3000);
      } else { l('[PAIRING] No PAIR_NUMBER/OWNER_NUMBER configured — cannot pair'); }
    }

    if (connection === 'close') {
      const dc = lastDisconnect?.error?.output?.statusCode;
      l('[🔰] Connection closed. Reason: ' + (DisconnectReason[dc] ?? dc) + ' (' + dc + ')');
      if (dc !== DisconnectReason.loggedOut && dc !== DisconnectReason.forbidden) {
        l('[🔰] evil⁶⁶⁶MD Reconnecting in 5s ⏳️...');
        setTimeout(connectToWA, 5000);
      } else {
        l('[🔰] Logged out — delete the sessions folder to pair again');
      }
    }

    if (connection === 'open') {
      l('[🔰] evil⁶⁶⁶MD connected to WhatsApp ✅');
      global.conn = conn;
      const { count, errors } = loadCommands();
      l('[🔌] Commands Loaded: ' + count + ' ✅');
      errors.forEach(e => console.error(e));
      l('[💾] Database Loaded ✅');
      l('[🧩] Plugins Loaded ✅');

      try {
        const upMessage = '╭─〔 *🤖 evil⁶⁶⁶MD* 〕\n├─▸ *Ultra Super Fast Powerfull ⚠️*\n│     *Your Smart WhatsApp Bot*\n╰─➤ *Ready To use 🍁!*\n\n╭──〔 🔗 *Information* 〕\n├─ 🧩 *Prefix:* = ' + PREFIX + '\n├─ 👑 *Owner:* evil\n╰─🚀 *Powered by evil⁶⁶⁶MD*';
        await conn.sendMessage(conn.user.id, {
          image: fs.existsSync(__dirname + '/banner.png') ? { url: __dirname + '/banner.png' } : { url: 'https://files.catbox.moe/7zfdcq.jpg' },
          caption: upMessage,
        });
      } catch (e) { console.error('[🔰] send on connect:', e.message); }
    }
  });

  /* ---------- per-message handler with per-command isolation ---------- */
  conn.ev.on('messages.upsert', async (upsert) => {
    try {
      const mek = upsert.messages[0];
      if (!mek || !mek.message) return;
      if (mek.key.remoteJid === 'status@broadcast') return; // status handled separately
      if (isJidBroadcast(mek.key.remoteJid) && !mek.key.fromMe) return;

      const m = sms(conn, mek);
      const type = getContentType(mek.message);
      const from = mek.key.remoteJid;
      const body = (type === 'conversation') ? mek.message.conversation
        : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text
        : (type === 'imageMessage') && mek.message.imageMessage.caption ? mek.message.imageMessage.caption
        : (type === 'videoMessage') && mek.message.videoMessage.caption ? mek.message.videoMessage.caption : '';
      const isCmd = body && body.startsWith(PREFIX);
      const cmdName = isCmd ? body.slice(PREFIX.length).trim().split(/\s+/)[0].toLowerCase() : false;
      const args = isCmd ? body.trim().split(/\s+/).slice(1) : [];
      const q = args.join(' ');
      const isGroup = from.endsWith('@g.us');
      const sender = mek.key.fromMe ? conn.decodeJid(conn.user.id) : mek.key.participant || from;
      const senderNumber = String(sender).split('@')[0];
      const botNumber = String(conn.user?.id || '').split(':')[0];
      const isMe = senderNumber === botNumber;
      const isOwner = senderNumber === OWNER || isMe;
      const pushname = mek.pushName || 'User';
      let groupMetadata = null, participants = [], groupAdmins = [], isBotAdmins = false, isAdmins = false;
      if (isGroup) {
        groupMetadata = await conn.groupMetadata(from).catch(() => null);
        if (groupMetadata) {
          participants = groupMetadata.participants || [];
          groupAdmins = getGroupAdmins(participants) || [];
          isBotAdmins = groupAdmins.includes(jidNormalizedUser(conn.user.id));
          isAdmins = groupAdmins.includes(sender);
        }
      }
      const reply = (teks) => conn.sendMessage(from, { text: teks }, { quoted: mek });
      const ctx = { from, quoted: mek, body, isCmd, command: cmdName, args, q, text: q, isGroup, sender, senderNumber, botNumber, pushname, isMe, isOwner, groupMetadata, groupName: groupMetadata ? groupMetadata.subject : '', participants, groupAdmins, isBotAdmins, isAdmins, reply };

      // privacy gate
      if (config.MODE === 'private' && !isOwner) return;

      const cmd = commands.find(c => c.pattern === cmdName) || commands.find(c => c.alias && c.alias.includes(cmdName));
      if (isCmd && cmd) {
        if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } }).catch(() => {});
        safeRun(cmd, conn, mek, m, ctx);
        return;
      }

      // "on: body/text/image/sticker" listeners
      for (const c of commands) {
        try {
          if (c.on === 'body' && body) safeRun(c, conn, mek, m, ctx);
        } catch (_) {}
      }
    } catch (e) {
      console.error('[HANDLER ERROR]', e.message || e);
    }
  });

  /* ---------- auto status view/react (config-gated) ---------- */
  conn.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const mek = messages[0];
      if (!mek?.key || mek.key.remoteJid !== 'status@broadcast') return;
      if (config.AUTO_STATUS_SEEN === 'true') await conn.readMessages([mek.key]).catch(() => {});
    } catch (_) {}
  });

  /* ---------- anti-call (config-gated) ---------- */
  conn.ev.on('call', async (calls) => {
    try {
      if (config.ANTI_CALL !== 'true') return;
      for (const call of calls) {
        if (call.status !== 'offer') continue;
        await conn.rejectCall(call.id, call.from);
        await conn.sendMessage(call.from, { text: config.REJECT_MSG || '*📞 calls not allowed*' });
      }
    } catch (e) { console.error('[ANTI-CALL]', e.message); }
  });

  /* ---------- keepalive utils every command may need ---------- */
  conn.decodeJid = jid => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      const d = jidDecode(jid) || {};
      return (d.user && d.server && d.user + '@' + d.server) || jid;
    }
    return jid;
  };
  conn.downloadAndSaveMediaMessage = async (message, filename = Date.now().toString(), attachExtension = true) => {
    const quoted = message.msg ? message.msg : message;
    const mime = (message.msg || message).mimetype || '';
    const mtype = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
    const stream = await downloadContentFromMessage(quoted, mtype);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    const ft = await FileType.fromBuffer(buffer);
    const trueFileName = attachExtension ? filename + '.' + ft.ext : filename;
    fs.writeFileSync(trueFileName, buffer);
    return trueFileName;
  };
  return conn;
}

/* ---------- telegram companion (unchanged style, config token) ---------- */
require('./lib/telegram');

/* ---------- start ---------- */
l('╔════════════════════════════╗');
l('║  ⚡ evil⁶⁶⁶MD BOOTING ⚡    ║');
l('╚════════════════════════════╝');
l('[🧩] bot: evil⁶⁶⁶MD | owner: +' + OWNER + ' | prefix: ' + PREFIX);
connectToWA();
setInterval(() => {}, 1 << 30); // hold the event loop open
