// evil⁶⁶⁶MD — WEB × TELEGRAM × WHATSAPP pairing bot
// Deployable anywhere (Render, Railway, VPS). One WhatsApp session, controllable from web + Telegram.
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const QRCode = require('qrcode');
const cmd = require('./commands');
const portal = require('./portal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers,
} = require('@whiskeysockets/baileys');

const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 3000);
const AUTH_DIR = path.join(__dirname, 'auth');
const OWNER = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
const TG_TOKEN = process.env.TG_TOKEN || '';           // optional — leave empty to run web-only
const AI_KEY = process.env.ANTHROPIC_API_KEY || '';    // optional — enables the .ai / chatbot
const PANEL_URL = process.env.PANEL_URL || 'http://45.151.122.219:2232'; // shared session brain; set empty string to pair locally

const app = express();
app.use(express.json());

// ── state ──
const state = { connected: true, qr: null, qrDataUrl: null, pairingCode: null, pairedFor: null, user: null, lastError: null, busy: false };
let chatbotOn = true, histories = new Map();

// ── multi-pair WhatsApp engine (see portal.js) ──
// Each number that pairs gets its OWN bot instance (bot/index.js) with THEM as owner.
async function pairCode(number) {
  const out = await portal.createPairing(number);
  if (out.alreadyPaired) {
    state.pairingCode = null; state.pairedFor = number;
    throw new Error('Already paired — their bot is running. Send .menu to it on WhatsApp.');
  }
  state.pairingCode = out.code; state.pairedFor = number; state.pairingIssuedAt = Date.now();
  return out.code;
}

// ── web ──
app.get('/', (req, res) => { res.type('html'); res.set('Cache-Control', 'no-store, must-revalidate'); res.send(WEB_HTML); });
app.get('/status', (req, res) => {
  const st = { ...state, chatbot: chatbotOn };
  // pairing codes live ~2 minutes — after that a reload/returning visit gets the
  // number form again instead of a dead code
  if (st.pairingCode && state.pairingIssuedAt && Date.now() - state.pairingIssuedAt > 115000) {
    st.pairingCode = null; st.pairedFor = null;
  }
  res.json(st);
});
app.get('/resetpair', (req, res) => { state.pairingCode = null; state.pairedFor = null; state.pairingIssuedAt = null; res.json({ ok: true }); });
app.get('/pair', async (req, res) => {
  const n = String(req.query.number || '').replace(/[^0-9]/g, '');
  if (!n || n.length < 7) return res.status(400).json({ error: 'Number with country code, e.g. 22873272569' });
  // session sharing: forward pairing to the panel bot so all front-ends share one session
  if (PANEL_URL) {
    try {
      const r = await fetch(`${PANEL_URL}/pair?number=${n}`);
      const j = await r.json();
      if (j.code) return res.json({ code: j.code, shared: true });
      return res.status(r.status).json({ error: j.error || 'panel pairing failed' });
    } catch (e) { return res.status(502).json({ error: 'panel unreachable: ' + e.message }); }
  }
  try { res.json({ code: await pairCode(n) }); } catch (e) { res.status(409).json({ error: e.message }); }
});
app.get('/health', (req, res) => res.json({ ok: true, connected: state.connected, shared: !!PANEL_URL, panel: PANEL_URL || null }));

app.get('/code', async (req, res) => {
  // compat endpoint for the bot's .pair command: /code?number=234... -> {code}
  const n = String(req.query.number || '').replace(/[^0-9]/g, '');
  if (!n || n.length < 7) return res.status(400).json({ error: 'Number with country code, e.g. 22873272569' });
  if (PANEL_URL) {
    try {
      const r = await fetch(`${PANEL_URL}/pair?number=${n}`);
      const j = await r.json();
      if (j.code) return res.json({ code: j.code, shared: true });
      return res.status(r.status).json({ error: j.error || 'panel pairing failed' });
    } catch (e) { return res.status(502).json({ error: 'panel unreachable: ' + e.message }); }
  }
  try { res.json({ code: await pairCode(n) }); } catch (e) { res.status(409).json({ error: e.message }); }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[web] evil⁶⁶⁶MD multi-pair portal on :${PORT}`);
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
          const up = process.uptime();
          const d = Math.floor(up / 86400), h = Math.floor(up % 86400 / 3600), mn = Math.floor(up % 3600 / 60), s = Math.floor(up % 60);
          const uptime = `${d}d ${h}h ${mn}m ${s}s`;
          const st = state.connected ? '✅ ONLINE' : '⛔ not paired';
          const userName = (m.from?.first_name || m.from?.username || 'User');
          const cap =
`╔═══❖•ೋ° °ೋ•❖═══╗\n   ⚡ 𝗘𝗩𝗜𝗟⁶𝟲𝟲𝗠𝗗 ⚡\n╚═══❖•ೋ° °ೋ•❖═══╝\n\n┏━━━━━━━━━━━━━━━━━━┓\n┃ 👑 𝗢𝘄𝗻𝗲𝗿 ┇ evil\n┃ 👤 𝗨𝘀𝗲𝗿 ┇ ${userName}\n┃ ⏱ 𝗨𝗽𝘁𝗶𝗺𝗲 ┇ ${uptime}\n┃ 🚀 𝗦𝘁𝗮𝘁𝘂𝘀 ┇ 🌐 Public\n┃ 📶 𝗦𝗽𝗲𝗲𝗱 ┇ fast ⚡\n┃ 🔗 𝗦𝗲𝘀𝘀𝗶𝗼𝗻𝘀 ┇ ${state.connected ? 1 : 0}/0 active\n┃ 🌍 𝗨𝘀𝗲𝗿𝘀 ┇ 1\n┗━━━━━━━━━━━━━━━━━━┛\n\n┏━━『 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦 』━━┓\n┃ ❐ /pair — link a number\n┃ ❐ /listpaired — my sessions\n┃ ❐ /delpair — unlink\n┃ ❐ /reportissue — report\n┃ ❐ /broadcast\n┃ ❐ /listsession\n┃ ❐ /addprem <id>\n┃ ❐ /delprem <id>\n┃ ❐ /listprem\n┃ ❐ /addowner <id>\n┗━━━━━━━━━━━━━━━━━━┛\n\n> © 𝗣𝗼𝘄𝗲𝗿𝗲𝗱 𝗯𝘆 𝗲𝘃𝗶𝗹⁶𝟲𝟲𝗠𝗱`;
          const photo = await tg('sendPhoto', { chat_id: m.chat.id, photo: 'https://cdn.phototourl.com/member/2026-09-30-fb75d9a9-a375-4172-ac29-d00c71e23815.jpg', caption: cap });
          if (!photo || !photo.ok) await tg('sendMessage', { chat_id: m.chat.id, text: cap });
        } else if (name === 'listpaired' || name === 'listsession') {
          await reply(state.connected ? `🔗 Paired session: +${state.user}\n✅ connected` : 'No paired sessions. Send /pair <number>');
        } else if (name === 'delpair') {
          try { require('node:fs').rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
          await reply('🗑 Session data cleared. Re-pair with /pair <number>');
        } else if (name === 'reportissue') {
          await reply('📝 Describe your issue in a reply to this message (send it as a message starting with your problem description).\nOr open the portal: the portal status shows the last error.');
        } else if (name === 'addprem' || name === 'addowner') {
          const id = (rest[0] || '').replace(/[^0-9]/g, '');
          if (!id) return reply('Usage: ' + c + ' <telegram id>');
          try { PREM = PREM || require('node:fs').existsSync('./prem.json') ? JSON.parse(require('node:fs').readFileSync('./prem.json', 'utf8')) : {}; } catch { PREM = {}; }
          PREM[id] = name === 'addowner' ? 'owner' : 'premium';
          require('node:fs').writeFileSync('./prem.json', JSON.stringify(PREM, null, 2));
          await reply('✅ ' + id + ' added as ' + PREM[id]);
        } else if (name === 'delprem') {
          const id = (rest[0] || '').replace(/[^0-9]/g, '');
          try { PREM = require('node:fs').existsSync('./prem.json') ? JSON.parse(require('node:fs').readFileSync('./prem.json', 'utf8')) : {}; } catch { PREM = {}; }
          delete PREM[id];
          require('node:fs').writeFileSync('./prem.json', JSON.stringify(PREM, null, 2));
          await reply('🗑 ' + id + ' removed');
        } else if (name === 'listprem') {
          let P = {}; try { P = JSON.parse(require('node:fs').readFileSync('./prem.json', 'utf8')); } catch {}
          const L = Object.entries(P).map(([k, v]) => '• ' + k + ' — ' + v).join('\n');
          await reply(L ? '👑 Premium/owners:\n' + L : 'No premium users yet. /addprem <id>');
        } else if (name === 'broadcast') {
          const txt = rest.join(' ');
          if (!txt) return reply('Usage: /broadcast <message>');
          await reply('📢 Broadcast sent to paired session chats.');
          if (state.connected && sock?.sendMessage) {
            try { const chats = await sock.groupFetchAllParticipating(); for (const jid of Object.keys(chats)) { try { await sock.sendMessage(jid, { text: '📢 ' + txt }); } catch {} } } catch (e) { await reply('⚠️ ' + e.message); }
          }
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
const WEB_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>evil\u2076\u2076\u2076MD | ZISKY \u2014 WhatsApp Pairing Portal</title>
<meta name="theme-color" content="#04070c">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#04070c;color:#e8f5ee;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;position:relative;-webkit-font-smoothing:antialiased}

/* ===== LAYERED STORM SKY (multi-layer, parallax, blur/opacity depth) ===== */
.cloudlayer{position:fixed;left:0;right:0;pointer-events:none;z-index:1}
.cloudlayer.l1{top:-8vh;height:34vh;filter:blur(46px);opacity:.95;animation:drift1 44s linear infinite}
.cloudlayer.l2{top:-4vh;height:28vh;filter:blur(30px);opacity:.8;animation:drift2 31s linear infinite}
.cloudlayer.l3{top:2vh;height:20vh;filter:blur(18px);opacity:.55;animation:drift3 22s linear infinite}
.cloudlayer::before,.cloudlayer::after{content:"";position:absolute;border-radius:100px;background:radial-gradient(ellipse 40% 70% at 30% 50%,var(--c1),transparent 70%),radial-gradient(ellipse 35% 60% at 70% 40%,var(--c2),transparent 70%)}
.cloudlayer::before{width:120vw;height:100%;left:-10vw}
.cloudlayer::after{width:120vw;height:120%;left:-30vw;top:30%}
.l1{--c1:#0f1720;--c2:#0c1219}
.l2{--c1:#111b26;--c2:#0d141d}
.l3{--c1:#16222f;--c2:#111a24}
body.storm-dark .cloudlayer{filter:brightness(.55)}
@keyframes drift1{from{transform:translateX(0)}to{transform:translateX(50vw)}}
@keyframes drift2{from{transform:translateX(0)}to{transform:translateX(-40vw)}}
@keyframes drift3{from{transform:translateX(0)}to{transform:translateX(28vw)}}

/* canvas layers */
canvas#bolt{position:fixed;inset:0;z-index:2;pointer-events:none}
canvas#rain{position:fixed;inset:0;z-index:3;pointer-events:none;opacity:0;transition:opacity 2s}
canvas#rain.on{opacity:1}
/* full-screen flash overlay: green-white, 100-200ms */
#flash{position:fixed;inset:0;z-index:4;pointer-events:none;opacity:0;background:linear-gradient(180deg,rgba(255,255,255,.85),rgba(220,255,235,.45) 45%,rgba(180,255,210,.15) 70%,transparent)}
#flash.hit{animation:flash .16s ease-out}
#flash.hit2{animation:flash2 .13s ease-out .1s}
@keyframes flash{0%{opacity:0}15%{opacity:1}100%{opacity:0}}
@keyframes flash2{0%{opacity:.7}100%{opacity:0}}

/* ===== BRANDING ===== */
.brand{position:relative;z-index:10;text-align:center;margin-bottom:22px;animation:rise 1s .1s both}
.brand h1{font-size:clamp(24px,6vw,34px);letter-spacing:2px;font-weight:800;color:#fff;text-shadow:0 0 24px rgba(0,255,102,.35),0 2px 12px rgba(0,0,0,.8)}
.brand h1 .g{color:#00ff66;text-shadow:0 0 28px rgba(0,255,102,.6)}
.brand .brandname{font-weight:900;letter-spacing:4px}
.brand sup{font-size:.45em;color:#00ff66;letter-spacing:1px;vertical-align:super}
.brand .sub{color:#9fb8ab;font-size:13px;letter-spacing:5px;text-transform:uppercase;margin-top:8px}
.brand .net{display:inline-flex;align-items:center;gap:8px;margin-top:10px;color:#6d8a7b;font-size:11px;letter-spacing:3px;text-transform:uppercase}
.brand .net i{width:6px;height:6px;border-radius:50%;background:#00ff66;box-shadow:0 0 10px #00ff66;animation:pulse 2s infinite}
@keyframes pulse{50%{opacity:.35}}

/* ===== GLASS PANEL ===== */
.card{position:relative;z-index:10;width:min(92vw,420px);background:rgba(255,255,255,0.08);backdrop-filter:blur(24px) saturate(140%);-webkit-backdrop-filter:blur(24px) saturate(140%);border:1px solid rgba(0,255,102,.22);border-radius:24px;padding:34px 30px 28px;text-align:center;box-shadow:0 30px 90px -20px rgba(0,255,102,.14),0 10px 40px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.12);animation:rise 1s .25s both,float 7s ease-in-out 1.2s infinite;transition:border-color .4s,box-shadow .4s}
.card.pulse{animation:rise 1s .25s both,float 7s ease-in-out 1.2s infinite,cardpulse 1.1s ease-out}
@keyframes cardpulse{0%{box-shadow:0 0 0 0 rgba(0,255,102,.5),0 30px 90px -20px rgba(0,255,102,.14)}100%{box-shadow:0 0 0 34px rgba(0,255,102,0),0 30px 90px -20px rgba(0,255,102,.14)}}
@keyframes rise{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes quake{0%{transform:translate(0) rotate(0deg)}20%{transform:translate(-7px,4px) rotate(-.4deg)}40%{transform:translate(8px,-4px) rotate(.4deg)}60%{transform:translate(-6px,-5px) rotate(-.3deg)}80%{transform:translate(6px,4px) rotate(.3deg)}100%{transform:translate(0) rotate(0)}}
body.quake{animation:quake .55s cubic-bezier(.36,.07,.19,.97)}
body.quake .card{animation:quake .55s cubic-bezier(.36,.07,.19,.97)}

.status{display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border-radius:999px;font-size:11.5px;font-weight:600;letter-spacing:2px;text-transform:uppercase;background:rgba(0,255,102,.06);border:1px solid rgba(0,255,102,.18);color:#9fd8b4;margin-bottom:22px;transition:.3s}
.status i{width:7px;height:7px;border-radius:50%;background:#fbbf24;animation:pulse 1.6s infinite}
.status.ok{color:#00ff66;border-color:rgba(0,255,102,.4)}.status.ok i{background:#00ff66;box-shadow:0 0 12px #00ff66;animation:none}
.status.err{color:#ff6b6b;border-color:rgba(255,107,107,.35)}.status.err i{background:#ff6b6b;animation:none}
.status.busy{color:#8fd4ff;border-color:rgba(143,212,255,.3)}.status.busy i{background:#8fd4ff}

label{display:block;text-align:left;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7da291;margin:0 0 8px 4px}
.field{position:relative}
input{width:100%;background:rgba(4,7,12,.55);border:1px solid rgba(0,255,102,.2);color:#eafff3;border-radius:14px;padding:15px 16px;font-size:16px;letter-spacing:1px;outline:none;text-align:center;transition:.3s;font-variant-numeric:tabular-nums}
input::placeholder{color:#517061;letter-spacing:0}
input:focus{border-color:#00ff66;box-shadow:0 0 0 4px rgba(0,255,102,.12),0 0 24px rgba(0,255,102,.15)}
button{width:100%;margin-top:14px;padding:15px;border:0;border-radius:14px;font-size:14px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#04140a;background:linear-gradient(135deg,#00ff66,#00cc55);cursor:pointer;box-shadow:0 10px 30px -8px rgba(0,255,102,.55);transition:transform .18s,box-shadow .18s,opacity .3s;position:relative;overflow:hidden}
button:hover{transform:translateY(-2px);box-shadow:0 14px 36px -8px rgba(0,255,102,.75)}
button:active{transform:translateY(0)}
button:disabled{opacity:.75;cursor:wait;transform:none}
button.ghost{background:transparent;border:1px solid rgba(0,255,102,.35);color:#00ff66;box-shadow:none;font-size:12px;padding:11px}
button.ghost:hover{background:rgba(0,255,102,.08);box-shadow:none}
button .spin{width:15px;height:15px;border:2px solid rgba(4,20,10,.3);border-top-color:#04140a;border-radius:50%;display:inline-block;animation:spin .7s linear infinite;vertical-align:-3px;margin-right:9px}
@keyframes spin{to{transform:rotate(360deg)}}

/* pair code reveal */
.code{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:clamp(30px,8vw,40px);letter-spacing:10px;font-weight:700;color:#eafff3;margin:18px 0 8px;padding:18px 8px;border-radius:16px;background:rgba(0,255,102,.07);border:1px solid rgba(0,255,102,.35);text-shadow:0 0 26px rgba(0,255,102,.8);animation:codeglow 2.4s ease-in-out infinite}
@keyframes codeglow{50%{box-shadow:0 0 40px rgba(0,255,102,.4)}}
.code .ch{display:inline-block;animation:drop .5s cubic-bezier(.2,.9,.3,1) both}
@keyframes drop{from{opacity:0;transform:translateY(-18px) scale(1.4)}to{opacity:1;transform:none}}
.reveal-steps{margin-top:14px;text-align:left;color:#8fae9e;font-size:12.5px;line-height:2.1;border-top:1px solid rgba(0,255,102,.12);padding-top:14px}
.reveal-steps b{color:#00ff66}

.foot{position:relative;z-index:10;margin-top:20px;font-size:10.5px;letter-spacing:3px;text-transform:uppercase;color:#3f5a4c;animation:rise 1s .4s both}
@media (max-width:420px){.card{padding:28px 20px 22px}.brand{margin-bottom:16px}}
/* squirrel */

</style></head><body>

<div class="cloudlayer l1"></div>
<div class="cloudlayer l2"></div>
<div class="cloudlayer l3"></div>
<canvas id="bolt"></canvas>
<canvas id="rain"></canvas>
<div id="flash"></div>

<div class="brand">
<h1><span class="brandname">EVIL<sup>666</sup></span> <span class="g">|</span> <span class="brandname">ZISKY</span></h1>
<div class="sub">WhatsApp Pairing Portal</div>
<div class="net"><i></i>Storm Network Active</div>
</div>

<div class="card" id="card">
<div class="status" id="status"><i></i><span id="stxt">establishing link</span></div>
<div id="box"></div>
</div>
<div class="foot">evil\u2076\u2076\u2076MD \u00b7 zisky node \u00b7 storm edition</div>

<script>
"use strict";
/* ============================ STATE ============================ */
var code=null, state_code_cleared=false, phase="idle", actx=null, master=null, rainSrc=null, rainGain=null, thunderTimer=null;
var BOLTS=[], DROPS=[], boltC=document.getElementById("bolt"), rainC=document.getElementById("rain");
var bx=boltC.getContext("2d"), rx=rainC.getContext("2d");

function sizeCanvases(){[boltC,rainC].forEach(function(c){c.width=innerWidth;c.height=innerHeight});BOLTS=[];DROPS=[];seedRain();}
addEventListener("resize",sizeCanvases);

/* ============================ AUDIO ============================ */
function initAudio(){
  if(actx)return;
  try{actx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return}
  master=actx.createGain();master.gain.value=1.6;master.connect(actx.destination);
  if(actx.state==="suspended")actx.resume();
}
/* layered synthesized thunder: crack (broadband burst) + roll (filtered noise tail) + sub */
function thunder(big){
  if(!actx)return;
  var t=actx.currentTime, dur=2.6+Math.random()*2.2, v=big?1:.45;
  var buf=actx.createBuffer(1,actx.sampleRate*dur,actx.sampleRate),d=buf.getChannelData(0);
  for(var i=0;i<d.length;i++){var p=i/d.length;d[i]=(Math.random()*2-1)*Math.pow(1-p,1.5)*(p<.06?3:1);}
  var src=actx.createBufferSource();src.buffer=buf;
  var lp=actx.createBiquadFilter();lp.type="lowpass";lp.frequency.setValueAtTime(big?2600:900,t);lp.frequency.exponentialRampToValueAtTime(90,t+dur);lp.Q.value=.6;
  var g=actx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(1.6*v,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+dur);
  src.connect(lp);lp.connect(g);g.connect(master);src.start(t);
  var o=actx.createOscillator();o.type="sine";o.frequency.setValueAtTime(52,t);o.frequency.exponentialRampToValueAtTime(22,t+dur*.85);
  var og=actx.createGain();og.gain.setValueAtTime(1.1*v,t);og.gain.exponentialRampToValueAtTime(.001,t+dur);
  o.connect(og);og.connect(master);o.start(t);o.stop(t+dur);
  var c=actx.createOscillator();c.type="sawtooth";c.frequency.setValueAtTime(320,t);c.frequency.exponentialRampToValueAtTime(60,t+.28);
  var cg=actx.createGain();cg.gain.setValueAtTime(big?1.0:.4,t);cg.gain.exponentialRampToValueAtTime(.001,t+.3);
  c.connect(cg);cg.connect(master);c.start(t);c.stop(t+.32);
}
function thunderVolume(v){if(thunderTimer)clearTimeout(thunderTimer);thunderTimer=null;if(v<=0){phase=(phase==="idle")?"idle":phase;return}}
function startRainSound(){
  if(!actx||rainSrc)return;
  var dur=1.6,buf=actx.createBuffer(1,actx.sampleRate*dur,actx.sampleRate),d=buf.getChannelData(0);
  for(var i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  rainSrc=actx.createBufferSource();rainSrc.buffer=buf;rainSrc.loop=true;
  var bp=actx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=4800;bp.Q.value=.35;
  var hs=actx.createBiquadFilter();hs.type="highshelf";hs.frequency.value=6000;hs.gain.value=-6;
  rainGain=actx.createGain();rainGain.gain.setValueAtTime(0,actx.currentTime);
  rainGain.gain.linearRampToValueAtTime(.14,actx.currentTime+3.5);
  rainSrc.connect(bp);bp.connect(hs);hs.connect(rainGain);rainGain.connect(master);
  rainSrc.start();
}
function fadeRainSound(){
  if(!rainSrc)return;
  try{rainGain.gain.linearRampToValueAtTime(.0001,actx.currentTime+4);var n=rainSrc;setTimeout(function(){try{n.stop()}catch(e){}},4200);}catch(e){}
  rainSrc=null;
}

/* ============================ LIGHTNING (canvas, branching) ============================ */
function makeBolt(){
  var x0=innerWidth*(0.12+Math.random()*0.76), y0=innerHeight*(0.02+Math.random()*0.14);
  var y1=innerHeight*(0.35+Math.random()*0.3);
  var segs=[],x=x0,y=y0;
  while(y<y1){var ny=y+8+Math.random()*22,nx=x+(Math.random()-0.5)*34;segs.push([x,y,nx,ny]);x=nx;y=ny;}
  var branches=[];
  var nb=1+Math.floor(Math.random()*3);
  for(var b=0;b<nb;b++){
    var i0=6+Math.floor(Math.random()*(segs.length-14));
    var s=segs[i0];if(!s)continue;
    var bx0=s[2],by0=s[3],dx=(Math.random()<.5?-1:1)*(14+Math.random()*30),byy=by0;
    var arr=[];
    for(var k=0;k<4+Math.random()*6;k++){var ny2=byy+10+Math.random()*18,nx2=bx0+dx*(k/6)+(Math.random()-.5)*10;arr.push([bx0,byy,nx2,ny2]);bx0=nx2;byy=ny2;}
    branches.push(arr);
  }
  return {segs:segs,branches:branches,life:1};
}
function drawBolts(){
  try{
  var now=performance.now();
  FLASHL=Math.max(0,FLASHL-0.06);
  }catch(e){ /* one bad frame must not kill the loop */ }
  bx.clearRect(0,0,boltC.width,boltC.height);
  for(var i=BOLTS.length-1;i>=0;i--){
    var b=BOLTS[i];b.life-=.055;
    if(b.life<=0){BOLTS.splice(i,1);continue}
    bx.strokeStyle="rgba(220,255,225,"+(b.life*.95)+")";
    bx.lineWidth=2.4;bx.shadowColor="rgba(0,255,102,"+(b.life*.9)+")";bx.shadowBlur=18;
    bx.beginPath();b.segs.forEach(function(s,j){j?bx.lineTo(s[2],s[3]):bx.moveTo(s[0],s[1])});bx.stroke();
    bx.lineWidth=1.2;bx.shadowBlur=10;
    b.branches.forEach(function(arr){bx.beginPath();arr.forEach(function(s,j){j?bx.lineTo(s[2],s[3]):bx.moveTo(s[0],s[1])});bx.stroke()});
  }
  requestAnimationFrame(drawBolts);
}
var FLASHL=0;
function strike(big){
  BOLTS.push(makeBolt());
  FLASHL=1;
  if(Math.random()<.75)setTimeout(function(){BOLTS.push(makeBolt())},60+Math.random()*120);
  var f=document.getElementById("flash");
  f.classList.remove("hit","hit2");void f.offsetWidth;f.classList.add("hit");
  if(big){f.classList.add("hit2");
    document.body.classList.remove("quake");void document.body.offsetWidth;document.body.classList.add("quake");
    
    setTimeout(function(){document.body.classList.remove("quake")},450);
  }
  thunder(big);
}

/* ============================ RAIN (particles) ============================ */
function seedRain(){for(var i=0;i<220;i++)DROPS.push({x:Math.random()*rainC.width,y:Math.random()*rainC.height,l:12+Math.random()*20,v:10+Math.random()*8,o:.25+Math.random()*.5});}
var rainIntensity=0;
function drawRain(){
  rx.clearRect(0,0,rainC.width,rainC.height);
  if(rainIntensity>0){
    var n=Math.floor(DROPS.length*Math.min(rainIntensity,1));
    rx.lineWidth=1.8;rx.strokeStyle="rgba(140,255,190,.85)";rx.shadowColor="rgba(0,255,102,.9)";rx.shadowBlur=8;
    rx.beginPath();
    for(var i=0;i<n;i++){var d=DROPS[i];d.y+=d.v*(0.6+rainIntensity*.7);d.x-=1.4;
      if(d.y>rainC.height){d.y=-16;d.x=Math.random()*rainC.width}
      rx.globalAlpha=Math.min(1, d.o*1.4)*Math.min(rainIntensity,1);
      rx.moveTo(d.x,d.y);rx.lineTo(d.x-2.6,d.y+d.l);}
    rx.stroke();rx.globalAlpha=1;
  }
  requestAnimationFrame(drawRain);
}

/* ============================ AMBIENT LOOP ============================ */
function ambient(){
  if(phase==="idle"){
    if(Math.random()<.85)strike(Math.random()<.7);
    thunderTimer=setTimeout(ambient,6000+Math.random()*14000);
  } else if(phase==="generating"){
    if(Math.random()<.5)strike(Math.random()<.3);
    thunderTimer=setTimeout(ambient,6000+Math.random()*9000);
  }
}

/* ============================ UI ============================ */
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}
function setBox(html){document.getElementById("box").innerHTML=html}
function setStatus(cls,txt){var s=document.getElementById("status");s.className="status "+cls;document.getElementById("stxt").textContent=txt}
function form(){setBox('<label>Enter WhatsApp Number</label><div class="field"><input id="n" inputmode="tel" maxlength="15" placeholder="+234  xxx  xxx  xxxx"></div><button id="go">Generate Pair Code</button>');
  var g=document.getElementById("go");g.onclick=pair;
  var n=document.getElementById("n");n.addEventListener("keydown",function(e){if(e.key==="Enter")pair()});
}
function render(){
  if(code){
    setBox('<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7da291;margin-top:6px">Pair Code Ready</div><div class="code">'+code.split("").map(function(ch,i){return '<span class="ch" style="animation-delay:'+(i*55)+'ms">'+esc(ch)+"</span>"}).join("")+"</div>"+
      '<div class="reveal-steps"><b>01</b> \u2014 WhatsApp \u203a Settings \u203a Linked Devices \u203a Link a Device<br><b>02</b> \u2014 Choose \u201cLink with phone number instead\u201d<br><b>03</b> \u2014 Enter the code before it expires</div>');
    var c=document.getElementById("card");c.classList.remove("pulse");void c.offsetWidth;c.classList.add("pulse");
    /* code-ready: bright flash */
    strike(true);
    setTimeout(function(){
      var f=document.getElementById("box");
      if(f && !f.querySelector("#again")) f.insertAdjacentHTML("beforeend",
        '<button id="again" class="ghost">Pair Another Number</button>');
      var a=document.getElementById("again"); if(a)a.onclick=resetPair;
    },300);
  } else form();
}
function resetPair(){
  code=null;
  try{fetch("/resetpair");}catch(e){}
  state_code_cleared=true;
  phase="idle";
  rainIntensity=0;rainC.classList.remove("on");fadeRainSound();
  document.body.classList.remove("storm-dark");
  if(thunderTimer)clearTimeout(thunderTimer);thunderTimer=null;
  ambient();
  render();setStatus("","enter a number to pair");
  refresh();
}
async function pair(){
  var n=document.getElementById("n").value.replace(/[^0-9]/g,"");
  if(!n){setStatus("err","enter a number first");return}
  phase="generating";
  var b=document.getElementById("go");b.disabled=true;b.innerHTML='<span class="spin"></span>Summoning';
  setStatus("busy","contacting storm network");
  document.body.classList.add("storm-dark");
  rainIntensity=0; (function ramp(){ if(phase!=="generating")return; rainIntensity=Math.min(rainIntensity+.012,.9); requestAnimationFrame(ramp); })();
  rainC.classList.add("on"); startRainSound();
  ambient();
  try{
    var j=await (await fetch("/pair?number="+n)).json();
    if(j.error){b.disabled=false;b.textContent="Generate Pair Code";setStatus("err",j.error);phase="idle";document.body.classList.remove("storm-dark");rainC.classList.remove("on");fadeRainSound();return}
    code=j.code;phase="ready";render();setStatus("ok","code ready \u2014 expires soon");
    setTimeout(function(){rainIntensity=.35;},3000);
  }catch(e){setStatus("err","network unreachable");b.disabled=false;b.textContent="Generate Pair Code";phase="idle";}
}
async function refresh(){
  try{
    var s=await (await fetch("/status")).json();
    if(s.connected){setStatus("ok","connected \u2014 +"+s.user);
      if(!document.getElementById("again")) setBox('<div style="font-size:13px;color:#8fae9e;line-height:2">Session live. Type <b style="color:#00ff66">.menu</b> on WhatsApp.</div><button id="again" class="ghost">Pair Another Number</button>');
      var a=document.getElementById("again"); if(a)a.onclick=resetPair; return}
    // A fresh page load (or returning after leaving) starts at the number form.
    // The server-side 2-min expiry already drops dead codes; we only re-show a
    // code if THIS page session requested it (code var set in this tab).
    if(s.pairingCode&&code===s.pairingCode){/* keep showing current code */}
    else if(code&&s.pairingCode&&code!==s.pairingCode){/* server replaced our code — ignore */ }
    if(!code&&phase!=="generating"&&!document.getElementById("n"))form();
  }catch(e){setStatus("err","connection lost \u2014 retrying")}
}

/* storm visuals start IMMEDIATELY on load; audio joins on first interaction */
function wake(){initAudio();}   // just unlocks the audio engine; ambient loop already running
["pointerdown","keydown","touchstart"].forEach(function(ev){addEventListener(ev,wake,{passive:true})});

sizeCanvases();form();refresh();setInterval(refresh,4000);requestAnimationFrame(drawBolts);requestAnimationFrame(drawRain);
ambient();  // thunder+lightning from the first second */

</script></body></html>`;
