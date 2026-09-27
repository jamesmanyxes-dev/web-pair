// evil⁶⁶⁶MD — WEB × TELEGRAM × WHATSAPP pairing bot
// Deployable anywhere (Render, Railway, VPS). One WhatsApp session, controllable from web + Telegram.
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers,
} = require('@whiskeysockets/baileys');

const PORT = Number(process.env.PORT || 3000);
const AUTH_DIR = path.join(__dirname, 'auth');
const OWNER = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
const TG_TOKEN = process.env.TG_TOKEN || '';           // optional — leave empty to run web-only
const AI_KEY = process.env.ANTHROPIC_API_KEY || '';    // optional — enables the .ai / chatbot

const app = express();
app.use(express.json());

// ── state ──
const state = { connected: false, qr: null, qrDataUrl: null, pairingCode: null, pairedFor: null, user: null, lastError: null, busy: false };
let sock = null, restarts = 0, chatbotOn = true, histories = new Map();

// ── WhatsApp ──
async function startWA() {
  if (state.busy) return;
  state.busy = true;
  const { state: auth, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({
    version,
    auth: { creds: auth.creds, keys: makeCacheableSignalKeyStore(auth.keys, silentLogger()) },
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      state.qr = qr;
      try { state.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 300 }); } catch {}
      console.log('[WA] QR ready');
    }
    if (connection === 'open') {
      state.connected = true; state.busy = false; restarts = 0;
      state.qr = null; state.qrDataUrl = null; state.pairingCode = null; state.lastError = null;
      state.user = sock.user?.id?.split(':')[0] || null;
      console.log('[WA] connected as', state.user);
      try { await sock.updateProfileName('evil⁶⁶⁶MD'); } catch {}
    }
    if (connection === 'close') {
      state.connected = false; state.busy = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      state.lastError = `${lastDisconnect?.error?.message || 'closed'} (${code})`;
      console.log('[WA] closed:', code);
      if (code === DisconnectReason.loggedOut) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      if (code !== DisconnectReason.loggedOut && restarts < 15) {
        restarts++;
        setTimeout(startWA, Math.min(restarts * 2000, 15000));
      }
    }
  });
  sock.ev.on('messages.upsert', onMsg);
}

function silentLogger() {
  const noop = () => undefined;
  const o = { level: 'silent', child: () => o, trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop };
  return o;
}

const PREFIXES = ['.', '!', '#', ''];
async function onMsg({ messages }) {
  const msg = messages[0];
  if (!msg.message || msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  const text = msg.message.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';
  if (!text) return;
  let body = text.trim(), name = '', args = [];
  for (const p of PREFIXES) {
    if (p && body.startsWith(p)) { body = body.slice(p.length); break; }
  }
  const sp = body.indexOf(' ');
  name = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
  args = sp === -1 ? [] : body.slice(sp + 1).trim().split(/\s+/);
  const send = (t, extra = {}) => sock.sendMessage(jid, { text: t, ...extra }, { quoted: msg });
  const sendImage = async (url, cap) => {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    await sock.sendMessage(jid, { image: buf, caption: cap || '' }, { quoted: msg });
  };
  try {
    if (name === 'menu' || name === 'help') {
      return send(
`*╭┈───〔 evil⁶⁶⁶MD 〕┈───⊷*
*├✦ Owner:* ${OWNER ? 'wa.me/' + OWNER : 'evil'}
*├✦ Runtime:* ${Math.floor(process.uptime() / 60)}m
*├✦ Chatbot:* ${chatbotOn ? 'ON' : 'OFF'}
*╰───────────────────⊷*
\`『ᴍᴀɪɴ』\`
╭───────────⊷
*┋ ⬡ ᴍᴇɴᴜ* · *┋ ⬡ ᴘɪɴɢ* · *┋ ⬡ ᴀɪ*
*┋ ⬡ ᴡᴀɪғᴜ* · *┋ ⬡ ɢɪʀʟᴅᴘ* · *┋ ⬡ ᴄʜᴀᴛʙᴏᴛ*
╰───────────⊷
> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴇᴠɪʟ⁶⁶⁶ᴍᴅ*`);
    }
    if (name === 'ping') return send(`🏓 pong — ${Math.floor(process.uptime())}s uptime`);
    if (name === 'chatbot') {
      const m = (args[0] || '').toLowerCase();
      if (m === 'on' || m === 'off') { chatbotOn = m === 'on'; return send(`🤖 Chatbot *${m.toUpperCase()}*`); }
      return send(`🤖 Chatbot: *${chatbotOn ? 'ON' : 'OFF'}*`);
    }
    if (name === 'ai' || name === 'claude' || name === 'gpt') {
      const q = args.join(' ');
      if (!q) return send('🤖 Usage: .ai <message>');
      return send(await chat(q, jid));
    }
    if (name === 'waifu' || name === 'animegirl') {
      const j = await (await fetch('https://nekos.best/api/v2/waifu')).json();
      return sendImage(j.results[0].url, `❦ Waifu — evil⁶⁶⁶MD`);
    }
    if (name === 'girldp') {
      const n = 1 + Math.floor(Math.random() * 99);
      return sendImage(`https://randomuser.me/api/portraits/women/${n}.jpg`, `❦ Girl DP — evil⁶⁶⁶MD`);
    }
    if (name === 'boydp') {
      const n = 1 + Math.floor(Math.random() * 99);
      return sendImage(`https://randomuser.me/api/portraits/men/${n}.jpg`, `❦ Boy DP — evil⁶⁶⁶MD`);
    }
    // chatbot auto-reply: DMs or tag/reply
    if (chatbotOn && AI_KEY) {
      const botJid = sock.user?.id || '';
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
      const hit = jid.endsWith('@s.whatsapp.net') || mentioned.some((m) => m.split(':')[0] === botJid.split(':')[0]) || (quoted && quoted.split(':')[0] === botJid.split(':')[0]);
      if (hit) return send(await chat(text.replace(/@\d+/g, '').trim(), jid));
    }
  } catch (e) { console.error('[cmd]', e.message); try { send('⚠️ ' + e.message); } catch {} }
}

const PERSONA = 'You are evil⁶⁶⁶MD, a WhatsApp bot: confident, playful, helpful. Reply short and casual like a WhatsApp friend.';
async function chat(text, jid) {
  if (!AI_KEY) return '🤖 AI key not set (ANTHROPIC_API_KEY).';
  const hist = histories.get(jid) || [];
  hist.push({ role: 'user', content: text });
  if (hist.length > 16) hist.splice(0, hist.length - 16);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1024, system: PERSONA, messages: hist }),
  });
  if (!r.ok) return '🤖 Claude error ' + r.status;
  const d = await r.json();
  const reply = (d.content || []).map((b) => b.text || '').join('').trim() || '…';
  hist.push({ role: 'assistant', content: reply });
  histories.set(jid, hist);
  return reply;
}

// ── pairing ──
async function pairCode(number) {
  if (!sock) throw new Error('Bot still starting — try again in a few seconds');
  if (state.connected) throw new Error('Already paired!');
  const code = await sock.requestPairingCode(number);
  state.pairingCode = code; state.pairedFor = number;
  return code;
}

// ── web ──
app.get('/', (req, res) => res.type('html').send(WEB_HTML));
app.get('/status', (req, res) => res.json({ ...state, chatbot: chatbotOn }));
app.get('/pair', async (req, res) => {
  const n = String(req.query.number || '').replace(/[^0-9]/g, '');
  if (!n || n.length < 7) return res.status(400).json({ error: 'Number with country code, e.g. 22873272569' });
  try { res.json({ code: await pairCode(n) }); } catch (e) { res.status(409).json({ error: e.message }); }
});
app.get('/health', (req, res) => res.json({ ok: true, connected: state.connected }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[web] evil⁶⁶⁶MD pair UI on :${PORT}`);
  startWA();
  if (TG_TOKEN) startTG(); else console.log('[TG] TG_TOKEN not set — web-only mode');
});

// ── telegram ──
let tgOffset = 0;
async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}
async function startTG() {
  const me = await tg('getMe');
  if (!me.ok) return console.error('[TG] bad token:', me.description);
  console.log('[TG] live as @' + me.result.username);
  for (;;) {
    try {
      const r = await tg('getUpdates', { offset: tgOffset + 1, timeout: 25 });
      for (const u of r.result || []) {
        tgOffset = u.update_id;
        const m = u.message; if (!m?.text) continue;
        const reply = (t) => tg('sendMessage', { chat_id: m.chat.id, text: t, parse_mode: 'Markdown' });
        const [c, ...rest] = m.text.trim().split(/\s+/);
        const name = c.replace(/^\//, '').toLowerCase();
        if (name === 'start' || name === 'menu') {
          const st = state.connected ? `✅ ONLINE as +${state.user}` : '⛔ not paired';
          await reply(
`╔═══❖•ೋ° °ೋ•❖═══╗
   ⚡ 𝗘𝗩𝗜𝗟⁶𝟲𝟲𝗠𝗗 ⚡
╚═══❖•ೋ° °ೋ•❖═══╝

┏━━━━━━━━━━━━━━┓
┃ 🖥 𝗪𝗲𝗯 ┇ ${st}
┃ ⏱ 𝗨𝗽𝘁𝗶𝗺𝗲 ┇ ${Math.floor(process.uptime() / 60)}m
┃ 🤖 𝗔𝗜 ┇ ${AI_KEY ? 'ready' : 'no key'}
┗━━━━━━━━━━━━━━┛

/pair <number> — link WhatsApp`);
        } else if (name === 'pair') {
          const n = rest.join('').replace(/[^0-9]/g, '');
          if (!n) await reply('Send: `/pair 22873272569`');
          else {
            await reply('📲 Requesting code for +' + n + '…');
            try { const code = await pairCode(n); await reply(`✅ Code: \`${code}\`\n\nWhatsApp → Linked Devices → Link with phone number`); }
            catch (e) { await reply('⚠️ ' + e.message); }
          }
        } else if (name === 'status') {
          await reply(state.connected ? `✅ +${state.user}` : `⛔ not paired${state.lastError ? '\n⚠️ ' + state.lastError : ''}`);
        }
      }
    } catch (e) { console.error('[TG]', e.message); await new Promise((r) => setTimeout(r, 3000)); }
  }
}

// ── web UI (fancy) ──
const WEB_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>evil⁶⁶⁶MD — Pair</title>
<style>
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#050507;color:#f2f3f7;font-family:system-ui,sans-serif;overflow:hidden}
.aurora{position:fixed;inset:-40%;filter:blur(90px);opacity:.5;background:radial-gradient(40% 40% at 20% 30%,#7c3aed55,transparent 60%),radial-gradient(35% 35% at 80% 20%,#2563eb44,transparent 60%),radial-gradient(45% 45% at 70% 80%,#db277733,transparent 60%);animation:d 22s ease-in-out infinite alternate}
@keyframes d{to{transform:rotate(10deg) scale(1.15)}}
.card{position:relative;width:min(92vw,400px);background:rgba(16,16,22,.72);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.08);border-radius:26px;padding:32px 26px;text-align:center;box-shadow:0 30px 80px -20px rgba(124,58,237,.25);animation:r .8s cubic-bezier(.2,.9,.3,1) both}
@keyframes r{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
.logo{width:70px;height:70px;margin:0 auto 14px;border-radius:20px;display:grid;place-items:center;font-size:32px;background:linear-gradient(135deg,#7c3aed,#2563eb 60%,#db2777);animation:f 5s ease-in-out infinite}
@keyframes f{50%{transform:translateY(-7px)}}
h1{font-size:24px;margin:0}h1 span{background:linear-gradient(90deg,#a78bfa,#60a5fa,#f472b6);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:#9aa0ae;font-size:13px;margin:4px 0 18px}
.badge{display:inline-flex;gap:7px;align-items:center;padding:6px 14px;border-radius:999px;font-size:12.5px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#9aa0ae;margin-bottom:16px}
.dot{width:7px;height:7px;border-radius:50%;background:#fbbf24;animation:b 1.6s infinite}
@keyframes b{50%{opacity:.3}}
input{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#fff;border-radius:14px;padding:12px;font-size:15px;outline:none;text-align:center}
input:focus{border-color:#a78bfa;box-shadow:0 0 0 4px rgba(124,58,237,.18)}
button{width:100%;margin-top:12px;padding:13px;border:0;border-radius:14px;font-weight:600;font-size:15px;color:#fff;background:linear-gradient(135deg,#7c3aed,#4f46e5);cursor:pointer;transition:transform .15s}
button:hover{transform:translateY(-2px)}
.code{font-family:monospace;font-size:32px;letter-spacing:9px;color:#fff;background:linear-gradient(135deg,rgba(124,58,237,.25),rgba(59,130,246,.2));border:1px solid rgba(167,139,250,.4);border-radius:16px;padding:15px 6px;margin:14px 0;animation:g 2.2s infinite}
@keyframes g{50%{box-shadow:0 0 34px rgba(124,58,237,.55)}}
img{border-radius:14px;background:#fff;padding:6px;margin:10px 0}
.steps{text-align:left;color:#9aa0ae;font-size:12.5px;line-height:1.9;margin-top:12px}
</style></head><body>
<div class="aurora"></div><div class="card">
<div class="logo">🌘</div><h1>evil<span>⁶⁶⁶MD</span></h1><div class="sub">WhatsApp pairing portal</div>
<div class="badge" id="b"><span class="dot"></span><span id="bt">connecting…</span></div>
<div id="box"></div>
</div>
<script>
var code=null;
function form(){return '<input id="n" inputmode="numeric" placeholder="number, e.g. 228 73 272 569"><button onclick="pair()">Get pairing code</button>'}
async function pair(){
  var n=document.getElementById('n').value.replace(/[^0-9]/g,'');
  if(!n)return;
  var b=document.querySelector('button');b.disabled=true;b.textContent='Requesting…';
  var j=await (await fetch('/pair?number='+n)).json();
  if(j.error){b.disabled=false;b.textContent='Get pairing code';document.getElementById('bt').textContent=j.error;return}
  code=j.code;render();
}
function render(){
  var x=document.getElementById('box');
  if(code)x.innerHTML='<div>📱 Your pairing code:</div><div class="code">'+code+'</div><div class="steps"><b>1.</b> WhatsApp → Settings → Linked Devices → Link a Device<br><b>2.</b> Tap "Link with phone number instead"<br><b>3.</b> Type the code — done ✨</div>';
  else x.innerHTML=form();
}
async function refresh(){
  try{
    var s=await (await fetch('/status')).json();
    if(s.connected){document.getElementById('bt').textContent='connected as +'+s.user;document.getElementById('box').innerHTML='<div style="margin-top:8px">✅ Bot is live — type .menu on WhatsApp</div>';return}
    if(s.pairingCode){code=s.pairingCode;render();document.getElementById('bt').textContent='code ready — ~2 min';return}
    document.getElementById('bt').textContent='waiting…';
    if(!code)render();
  }catch(e){document.getElementById('bt').textContent='connection lost — retrying'}
}
render();refresh();setInterval(refresh,4000);
</script></body></html>`;
