// evil⁶⁶⁶MD — WEB × TELEGRAM × WHATSAPP pairing bot
// Deployable anywhere (Render, Railway, VPS). One WhatsApp session, controllable from web + Telegram.
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const QRCode = require('qrcode');
const cmd = require('./commands');
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
  let body = text.trim();
  for (const p of PREFIXES) { if (p && body.startsWith(p)) { body = body.slice(p.length); break; } }
  const sp = body.indexOf(' ');
  const name = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
  const args = sp === -1 ? [] : body.slice(sp + 1).trim().split(/\s+/);

  const key = cmd.all[name];
  if (!key) {
    // chatbot auto-reply: DMs or when tagged/replied
    if (chatbotOn && AI_KEY) {
      const botJid = sock.user?.id || '';
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
      const hit = jid.endsWith('@s.whatsapp.net') || mentioned.some((m) => m.split(':')[0] === botJid.split(':')[0]) || (quoted && quoted.split(':')[0] === botJid.split(':')[0]);
      if (hit) {
        const clean = text.replace(/@\d+/g, '').trim();
        if (clean.length > 1) return sock.sendMessage(jid, { text: await chat(clean, jid) }, { quoted: msg });
      }
    }
    return;
  }

  const c = {
    jid, msg, sock, args, all: cmd.all, desc: cmd.desc, categories: cmd.categories,
    cmd: name, owner: OWNER, ownerName: 'evil', isOwner: true, host: state.user || 'not paired', botName: 'evil⁶⁶⁶MD',
    chatbotOn: () => chatbotOn,
    setChatbot: (v) => { chatbotOn = v; return AI_KEY ? '' : '⚠️ Set ANTHROPIC_API_KEY on Render to enable AI replies.'; },
    banUser: () => '',
    chat: (q) => chat(q, jid),
    send: (t, extra = {}) => sock.sendMessage(jid, { text: t, ...extra }, { quoted: msg }),
    sendImage: async (url, cap) => {
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      await sock.sendMessage(jid, { image: buf, caption: cap || '' }, { quoted: msg });
    },
  };
  try { await cmd.table[key].run(c); }
  catch (e) { console.error('[cmd]', name, e.message); try { c.send('⚠️ ' + e.message); } catch {} }
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
app.get('/', (req, res) => { res.type('html'); res.set('Cache-Control', 'no-store, must-revalidate'); res.send(WEB_HTML); });
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
#flash{position:fixed;inset:0;z-index:4;pointer-events:none;opacity:0;background:linear-gradient(180deg,rgba(200,255,220,.5),rgba(0,255,102,.18) 55%,transparent)}
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
#sq{position:fixed;z-index:9;width:64px;height:64px;pointer-events:none;transition:transform .7s cubic-bezier(.34,1.3,.5,1),left .9s ease-in-out,bottom .9s ease-in-out;transform-origin:bottom center;filter:drop-shadow(0 6px 10px rgba(0,0,0,.5))}
#sq.run{transition:left 1.6s cubic-bezier(.2,.8,.3,1),bottom 1.2s ease-in,transform .5s}
#sq.scared{animation:scare .5s ease-out}
@keyframes scare{0%{transform:scale(1) rotate(0)}30%{transform:scale(1.25) rotate(-8deg) translateY(-18px)}60%{transform:scale(1.12) rotate(6deg)}100%{transform:scale(1) rotate(0)}}
#sq .excl{position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-weight:900;font-size:20px;color:#00ff66;text-shadow:0 0 12px #00ff66;opacity:0;transition:opacity .2s}
#sq.scared .excl{opacity:1}
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
<img id="sq" src="data:image/png;base64,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" alt=""><div class="foot">evil\u2076\u2076\u2076MD \u00b7 zisky node \u00b7 storm edition</div>

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
function strike(big){
  BOLTS.push(makeBolt());
  if(Math.random()<.75)setTimeout(function(){BOLTS.push(makeBolt())},60+Math.random()*120);
  var f=document.getElementById("flash");
  f.classList.remove("hit","hit2");void f.offsetWidth;f.classList.add("hit");
  if(big){f.classList.add("hit2");
    document.body.classList.remove("quake");void document.body.offsetWidth;document.body.classList.add("quake");
    try{sqScare();}catch(e){}
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

/* ============================ SQUIRREL ============================ */
var sq=document.getElementById("sq"), sqEx=null;
(function(){var e=document.createElement("span");e.className="excl";e.textContent="!";sq.appendChild(e);})();
var sqBase={left:null,bottom:null}, sqGone=false, sqTimer=null;
function cardRect(){var r=document.getElementById("card").getBoundingClientRect();return r;}
function sqWander(){
  if(sqGone)return;
  var r=cardRect(), pad=10;
  var edge=Math.random(); var l,b;
  if(edge<.45){ l=r.left-58+Math.random()*30; b=r.bottom-innerHeight+innerHeight; b=r.top+Math.random()*(r.height-60); /* left side climb */ }
  else if(edge<.9){ l=r.right-8+Math.random()*24; b=r.top+Math.random()*(r.height-60); }
  else { l=r.left+Math.random()*(r.width-70); b=r.bottom-innerHeight-innerHeight+innerHeight+10; b=r.bottom+8; }
  b=innerHeight-b-64;
  var flip = Math.random()<.5;
  sq.style.left=Math.max(4,Math.min(innerWidth-70,l))+"px";
  sq.style.bottom=Math.max(4,Math.min(innerHeight-80,b))+"px";
  sq.style.transform=flip?"scaleX(-1)":"scaleX(1)";
  sqTimer=setTimeout(sqWander, 1600+Math.random()*2600);
}
function sqScare(){
  if(sqGone)return;
  sqGone=true; clearTimeout(sqTimer);
  sq.classList.add("scared");
  sq.style.transform="scale(1.15) rotate(-14deg)"; /* look up */
  setTimeout(function(){
    sq.classList.remove("scared"); sq.classList.add("run");
    var away=Math.random()<.5?-90:innerWidth+20;
    sq.style.left=away+"px";
    sq.style.bottom="6px";
    sq.style.transform="scaleX(-1) scale(1.05)"; /* fleeing */
    setTimeout(function(){
      sq.classList.remove("run");
      sqGone=false;
      sq.style.left="-80px"; sq.style.bottom="8px";
      setTimeout(sqWander,1200);
    },1900);
  },550);
}
setTimeout(sqWander,1400);
addEventListener("resize",function(){clearTimeout(sqTimer);sqWander();});

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
    if(s.pairingCode&&state_code_cleared){} // user explicitly reset — don't resurrect the old code
    else if(s.pairingCode&&!code){code=s.pairingCode;phase="ready";render();setStatus("ok","code ready \u2014 expires soon");return}
    if(!code&&phase!=="generating"&&!document.getElementById("n"))form();
  }catch(e){setStatus("err","connection lost \u2014 retrying")}
}

/* storm visuals start IMMEDIATELY on load; audio joins on first interaction */
function wake(){initAudio();}   // just unlocks the audio engine; ambient loop already running
["pointerdown","keydown","touchstart"].forEach(function(ev){addEventListener(ev,wake,{passive:true})});

sizeCanvases();form();refresh();setInterval(refresh,4000);requestAnimationFrame(drawBolts);requestAnimationFrame(drawRain);
ambient();  // thunder+lightning from the first second */

</script></body></html>`;
