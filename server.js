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
const WEB_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>evil\u2076\u2076\u2076MD \u2014 Storm Pair</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100dvh;font-family:system-ui,-apple-system,sans-serif;color:#eaf0ea;overflow-x:hidden;background:linear-gradient(180deg,#0b1410 0%,#0d1a14 55%,#050a08 100%);display:flex;align-items:center;justify-content:center;position:relative;cursor:default}
/* storm sky layers */
.sky{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.cloud{position:absolute;border-radius:50%;filter:blur(28px);background:radial-gradient(circle at 30% 60%,#2c3a34 0%,#141d19 60%,transparent 75%);opacity:.9}
.cloud.c1{width:60vw;height:26vh;top:-6vh;left:-8vw;animation:drift1 26s ease-in-out infinite alternate}
.cloud.c2{width:70vw;height:30vh;top:-9vh;right:-12vw;background:radial-gradient(circle at 65% 55%,#26332d 0%,#101814 60%,transparent 75%);animation:drift2 32s ease-in-out infinite alternate}
.cloud.c3{width:44vw;height:20vh;top:2vh;left:24vw;opacity:.75;animation:drift1 40s ease-in-out infinite alternate-reverse}
@keyframes drift1{to{transform:translateX(6vw) scaleY(1.08)}}
@keyframes drift2{to{transform:translateX(-7vw) scaleY(.94)}}
/* lightning bolt svg */
.bolt{position:fixed;top:16vh;z-index:2;pointer-events:none;opacity:0;filter:drop-shadow(0 0 18px #c8ff4d) drop-shadow(0 0 42px #7dff3a)}
.bolt.on{opacity:1;animation:boltflash .9s ease-out}
@keyframes boltflash{0%{opacity:0}6%{opacity:1}18%{opacity:.2}26%{opacity:.9}60%{opacity:.25}100%{opacity:0}}
/* flash overlays */
.flash{position:fixed;inset:0;z-index:3;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 12%,rgba(220,255,150,.55),rgba(120,255,80,.15) 45%,transparent 70%)}
.flash.on{animation:flashfade .75s ease-out}
@keyframes flashfade{0%{opacity:0}8%{opacity:1}22%{opacity:.25}34%{opacity:.85}100%{opacity:0}}
.greenwash{position:fixed;inset:0;z-index:3;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 30%,rgba(60,255,120,.35),rgba(30,200,90,.12) 50%,transparent 75%)}
.greenwash.on{animation:gw .95s ease-out}
@keyframes gw{0%{opacity:0}10%{opacity:1}100%{opacity:0}}
/* shake */
body.shake{animation:shake .55s cubic-bezier(.36,.07,.19,.97)}
@keyframes shake{10%,90%{transform:translate(-2px,1px)}20%,80%{transform:translate(3px,-2px)}30%,50%,70%{transform:translate(-5px,2px)}40%,60%{transform:translate(5px,-1px)}}
/* rain */
canvas.rain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:0;transition:opacity 1.6s}
canvas.rain.on{opacity:.85}
/* ui */
.card{position:relative;z-index:5;width:min(92vw,400px);background:rgba(10,20,15,.72);backdrop-filter:blur(22px);border:1px solid rgba(140,255,170,.14);border-radius:26px;padding:32px 26px 26px;text-align:center;box-shadow:0 30px 80px -20px rgba(40,220,110,.18),inset 0 1px 0 rgba(255,255,255,.05);animation:rise .9s cubic-bezier(.2,.9,.3,1) both}
@keyframes rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
.logo{width:72px;height:72px;margin:0 auto 14px;border-radius:22px;display:grid;place-items:center;font-size:34px;background:linear-gradient(135deg,#0f3d22,#134e2b 60%,#1c7a42);box-shadow:0 10px 30px -6px rgba(60,220,120,.45);animation:float 5s ease-in-out infinite}
@keyframes float{50%{transform:translateY(-7px)}}
h1{font-size:25px;letter-spacing:.5px}
h1 b{background:linear-gradient(90deg,#7dffa8,#4ade80,#a3e635);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:#8fa398;font-size:13px;margin:4px 0 18px}
.badge{display:inline-flex;gap:7px;align-items:center;padding:6px 14px;border-radius:999px;font-size:12.5px;font-weight:600;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);color:#8fa398;margin-bottom:16px}
.dot{width:7px;height:7px;border-radius:50%;background:#fbbf24;animation:blink 1.6s infinite}
@keyframes blink{50%{opacity:.3}}
.badge.ok{color:#4ade80;border-color:rgba(74,222,128,.35)}.badge.ok .dot{background:#4ade80;animation:none}
.badge.err{color:#f87171;border-color:rgba(248,113,113,.3)}.badge.err .dot{background:#f87171;animation:none}
input{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(140,255,170,.18);color:#eaf0ea;border-radius:14px;padding:12px 14px;font-size:15px;outline:none;text-align:center;letter-spacing:1px;transition:.25s}
input:focus{border-color:#4ade80;box-shadow:0 0 0 4px rgba(74,222,128,.15)}
button{width:100%;margin-top:12px;padding:13px;border:0;border-radius:14px;font-weight:700;font-size:15px;color:#04120a;background:linear-gradient(135deg,#34d399,#16a34a);cursor:pointer;box-shadow:0 8px 24px -8px rgba(34,197,94,.6);transition:transform .15s}
button:hover{transform:translateY(-2px)}
button:disabled{opacity:.55;cursor:wait}
.code{font-family:ui-monospace,monospace;font-size:33px;letter-spacing:9px;font-weight:700;color:#d9ffe6;background:linear-gradient(135deg,rgba(52,211,153,.22),rgba(74,222,128,.14));border:1px solid rgba(74,222,128,.45);border-radius:16px;padding:15px 6px;margin:14px 0 6px;text-shadow:0 0 22px rgba(74,222,128,.75);animation:glow 2.4s ease-in-out infinite}
@keyframes glow{50%{box-shadow:0 0 34px rgba(74,222,128,.45)}}
.code .ch{display:inline-block;animation:flip .5s cubic-bezier(.2,.9,.3,1) both}
@keyframes flip{from{opacity:0;transform:translateY(-14px) rotateX(80deg)}to{opacity:1;transform:none}}
.steps{margin-top:14px;text-align:left;color:#8fa398;font-size:12.6px;line-height:2}
.steps b{color:#cfe8d6}
.tg{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);font-size:12px;color:#8fa398}
.tg a{color:#4ade80;text-decoration:none;font-weight:600}
.spin{width:15px;height:15px;border:2px solid rgba(74,222,128,.25);border-top-color:#4ade80;border-radius:50%;display:inline-block;animation:sp .8s linear infinite;vertical-align:-3px;margin-right:8px}
@keyframes sp{to{transform:rotate(360deg)}}
.hint-audio{position:fixed;bottom:14px;left:0;right:0;text-align:center;font-size:11px;color:#4b5f54;z-index:6}
footer{position:fixed;bottom:30px;left:0;right:0;text-align:center;font-size:11px;color:#3d4f45;z-index:6}
</style></head><body>
<svg class="bolt" id="boltL" style="left:22vw" width="120" height="300" viewBox="0 0 120 300"><path d="M70 0 L30 130 L62 130 L18 300 L58 150 L34 150 Z" fill="#eaffb0"/></svg>
<svg class="bolt" id="boltR" style="right:18vw" width="100" height="260" viewBox="0 0 120 300"><path d="M64 0 L28 120 L58 122 L20 260 L54 140 L32 142 Z" fill="#eaffb0"/></svg>
<div class="sky"><div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div></div>
<canvas class="rain" id="rain"></canvas>
<div class="flash" id="flash"></div><div class="greenwash" id="gw"></div>

<div class="card">
<div class="logo">\u26c8\ufe0f</div>
<h1>evil<b>\u2076\u2076\u2076MD</b></h1>
<div class="sub">storm pairing portal \u2014 summon your code</div>
<div class="badge" id="badge"><span class="dot"></span><span id="btxt">summoning\u2026</span></div>
<div id="box"></div>
<div class="tg">Prefer Telegram? <a href="https://t.me/Gojo_saturo_evil_bot">@Gojo_saturo_evil_bot</a> \u2022 /pair</div>
</div>
<footer>evil\u2076\u2076\u2076MD \u00b7 storm edition</footer>
<div class="hint-audio" id="ahint">🔊 tap anywhere once to wake the storm audio</div>

<script>
var code=null, raining=false, audioReady=false, actx=null, rainNode=null, rainGain=null, rumbleTimer=null;
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

/* ---------- AUDIO (all synthesized, no files) ---------- */
function initAudio(){
  if(audioReady)return; audioReady=true;
  try{
    actx=new (window.AudioContext||window.webkitAudioContext)();
    // master
    var master=actx.createGain(); master.gain.value=.9; master.connect(actx.destination);
    window._master=master;
  }catch(e){audioReady=false}
  document.getElementById('ahint').style.display='none';
}
function thunderBoom(intensity){
  if(!actx)return;
  var dur=2.2+Math.random()*1.5;
  var buf=actx.createBuffer(1,actx.sampleRate*dur,actx.sampleRate);
  var d=buf.getChannelData(0);
  for(var i=0;i<d.length;i++){ d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,1.6); }
  var src=actx.createBufferSource(); src.buffer=buf;
  var lp=actx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=120+Math.random()*160; lp.Q.value=.7;
  var g=actx.createGain();
  var v=(intensity||1)*.85;
  g.gain.setValueAtTime(v,actx.currentTime);
  g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+dur);
  src.connect(lp); lp.connect(g); g.connect(window._master);
  src.start();
  // sub rumble
  var o=actx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(46,actx.currentTime);
  o.frequency.exponentialRampToValueAtTime(24,actx.currentTime+dur*.8);
  var og=actx.createGain(); og.gain.setValueAtTime(v*.5,actx.currentTime);
  og.gain.exponentialRampToValueAtTime(.001,actx.currentTime+dur);
  o.connect(og); og.connect(window._master); o.start(); o.stop(actx.currentTime+dur);
}
function startRain(){
  if(!actx||rainNode)return;
  var dur=2;
  var buf=actx.createBuffer(1,actx.sampleRate*dur,actx.sampleRate);
  var d=buf.getChannelData(0);
  for(var i=0;i<d.length;i++){ d[i]=(Math.random()*2-1); }
  var src=actx.createBufferSource(); src.buffer=buf; src.loop=true;
  var bp=actx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=5200; bp.Q.value=.4;
  var lp=actx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=7000;
  rainGain=actx.createGain(); rainGain.gain.setValueAtTime(0,actx.currentTime);
  rainGain.gain.linearRampToValueAtTime(.16,actx.currentTime+2.5); // fade in as thunder fades
  src.connect(bp); bp.connect(lp); lp.connect(rainGain); rainGain.connect(window._master);
  src.start(); rainNode=src;
}
function stopRain(){
  if(!rainNode)return;
  try{ rainGain.gain.linearRampToValueAtTime(0,actx.currentTime+1.5); var n=rainNode; setTimeout(function(){try{n.stop()}catch(e){}},1700);}catch(e){}
  rainNode=null;
}

/* ---------- LIGHTNING ---------- */
function strike(intense){
  var b=Math.random()<.5?document.getElementById('boltL'):document.getElementById('boltR');
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  var f=document.getElementById('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  if(intense){
    var g=document.getElementById('gw'); g.classList.remove('on'); void g.offsetWidth; g.classList.add('on');
    document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake');
  }
}
function stormLoop(){
  if(raining)return; // calm during code gen
  var intense=Math.random()<.4;
  strike(intense);
  setTimeout(function(){ thunderBoom(intense?1:.45); },140+Math.random()*260);
  rumbleTimer=setTimeout(stormLoop, 2600+Math.random()*4200);
}

/* ---------- RAIN CANVAS ---------- */
var drops=[];
function initRainCanvas(){
  var c=document.getElementById('rain'); c.width=innerWidth; c.height=innerHeight;
  var x=c.getContext('2d');
  for(var i=0;i<160;i++)drops.push({x:Math.random()*c.width,y:Math.random()*c.height,l:10+Math.random()*18,v:9+Math.random()*7});
  (function loop(){
    x.clearRect(0,0,c.width,c.height);
    x.strokeStyle='rgba(160,220,190,.35)'; x.lineWidth=1;
    x.beginPath();
    for(var i=0;i<drops.length;i++){var d=drops[i]; d.y+=d.v; d.x-=1.2; if(d.y>c.height){d.y=-20;d.x=Math.random()*c.width}
      x.moveTo(d.x,d.y); x.lineTo(d.x-3,d.y+d.l);}
    x.stroke(); requestAnimationFrame(loop);
  })();
}
initRainCanvas();

/* ---------- UI ---------- */
function form(){return '<input id="n" inputmode="numeric" maxlength="15" placeholder="number e.g. 228 73 272 569"><button id="go">\u26a1 Summon pairing code</button>'}
function render(){
  var x=document.getElementById('box');
  if(code){
    x.innerHTML='<div>\U0001f4f1 your code \u2014 type it fast</div><div class="code">'+code.split('').map(function(ch,i){return '<span class="ch" style="animation-delay:'+(i*60)+'ms">'+esc(ch)+'</span>'}).join('')+'</div><div class="steps"><b>1.</b> WhatsApp \u2192 Settings \u2192 Linked Devices \u2192 Link a Device<br><b>2.</b> Tap <b>\u201cLink with phone number instead\u201d</b><br><b>3.</b> Type the code \u2014 done \u26a1</div>';
  } else x.innerHTML=form();
  var g=document.getElementById('go'); if(g)g.onclick=pair;
  var n=document.getElementById('n'); if(n)n.addEventListener('keydown',function(e){if(e.key==='Enter')pair()});
}
async function pair(){
  var n=document.getElementById('n').value.replace(/[^0-9]/g,'');
  if(!n)return;
  var b=document.getElementById('go'); b.disabled=true; b.innerHTML='<span class="spin"></span>Summoning\u2026';
  // calm the storm, start the rain
  raining=true; clearTimeout(rumbleTimer);
  startRain(); document.getElementById('rain').classList.add('on');
  setBadge('','drawing lightning\u2026');
  var j=await (await fetch('/pair?number='+n)).json();
  if(j.error){ b.disabled=false; b.innerHTML='\u26a1 Summon pairing code'; setBadge('err',j.error); raining=false; stormLoop(); return }
  code=j.code; render(); setBadge('ok','code ready \u2014 ~2 min');
  setTimeout(function(){ raining=false; stopRain(); document.getElementById('rain').classList.remove('on'); stormLoop(); }, 12000);
}
function setBadge(t,txt){var b=document.getElementById('badge');b.className='badge '+(t||'');document.getElementById('btxt').textContent=txt}
async function refresh(){
  try{
    var s=await (await fetch('/status')).json();
    if(s.connected){setBadge('ok','connected as +'+s.user);document.getElementById('box').innerHTML='<div class="steps" style="text-align:center;font-size:14px">\u26a1 Bot is live \u2014 type <b>.menu</b> on WhatsApp</div>';clearTimeout(rumbleTimer);return}
    if(s.pairingCode&&!code){code=s.pairingCode;render();setBadge('ok','code ready \u2014 ~2 min');return}
    if(!code&&!document.getElementById('n'))render();
  }catch(e){setBadge('err','connection lost \u2014 retrying\u2026')}
}
// wake audio on any first interaction
['pointerdown','keydown','touchstart'].forEach(function(ev){window.addEventListener(ev,function(){initAudio();if(!raining&&!rumbleTimer)stormLoop();},{once:false,passive:true});
  window.removeEventListener(ev,arguments.callee)});
render();refresh();setInterval(refresh,4000);
</script></body></html>`;
