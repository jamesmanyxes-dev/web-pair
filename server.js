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
canvas#forest{position:fixed;inset:0;z-index:2;pointer-events:none}
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
<canvas id="forest"></canvas>
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
  var now=performance.now();
  FLASHL=Math.max(0,FLASHL-0.06);
  fx.clearRect(0,0,fc.width,fc.height);
  for(var t of TREES) drawTree(t, FLASHL, now);
  monkeyThink(now);
  drawMonkey(FLASHL, now);
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
    try{monkeyScare();}catch(e){}
    
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

/* ============================ FOREST (canvas trees, wind sway) ============================ */
var fc=document.getElementById("forest"), fx=fc.getContext("2d");
var TREES=[];
function buildForest(){
  fc.width=innerWidth; fc.height=innerHeight; TREES=[];
  var defs=[{x:innerWidth*0.05, w:0.09*innerWidth, lean:-0.05, branches:6},
            {x:innerWidth*0.94, w:0.075*innerWidth, lean:0.06, branches:5},
            {x:innerWidth*0.22, w:0.05*innerWidth, lean:0.03, branches:4, far:true},
            {x:innerWidth*0.8, w:0.055*innerWidth, lean:-0.04, branches:4, far:true}];
  for (var d of defs){
    var tr={x:d.x,w:d.w,lean:d.lean,far:!!d.far,branches:[]};
    var nb=d.branches;
    for (var i=0;i<nb;i++){
      var h=0.25+i*(0.6/nb)+Math.random()*0.05;
      tr.branches.push({h:h, side:i%2?1:-1, len:d.w*(0.9+Math.random()*0.8), ang:(0.25+Math.random()*0.35)});
    }
    TREES.push(tr);
  }
}
function drawTree(t, flashL, time){
  var H=fc.height, baseY=H;
  var sway=Math.sin(time/2300 + t.x)*( (t.far?3:6) ) + Math.sin(time/700+t.x)* (flashL>0?2:1);
  var topX=t.x + t.lean*H*0.3 + sway;
  var color = t.far ? "rgba(10,16,14,"+(0.75+flashL*0.25)+")" : "rgba(4,8,7,"+(0.95+flashL*0.05)+")";
  var litColor = t.far ? "rgba(40,52,46,1)" : "rgba(24,32,27,1)";
  fx.strokeStyle = flashL>0 ? blendCss(color, litColor, flashL) : color;
  fx.lineWidth=t.w; fx.lineCap="round";
  fx.beginPath(); fx.moveTo(t.x,baseY);
  fx.quadraticCurveTo(t.x + (topX-t.x)*0.4, H*0.55, topX, H*0.12);
  fx.stroke();
  /* branches */
  for (var b of t.branches){
    var y=H*(1-b.h*0.88);
    var fromX = t.x + (topX-t.x)*(1-b.h);
    var bl=b.len*(b.h<0.4?0.7:1);
    var bx=fromX + b.side*bl*Math.cos(b.ang), by=y - bl*Math.sin(b.ang)*0.6;
    var bs=Math.sin(time/1800+b.h*9)*(flashL>0?3:5);
    fx.lineWidth=t.w*0.28;
    fx.beginPath(); fx.moveTo(fromX,y);
    fx.quadraticCurveTo((fromX+bx)/2, y-bs, bx,by);
    fx.stroke();
  }
  /* canopy blobs */
  fx.fillStyle = flashL>0 ? blendCss("rgba(6,12,10,0.9)","rgba(52,70,60,1)",flashL) : "rgba(6,12,10,0.9)";
  for (var c of t.branches){
    if(c.h<0.3)continue;
    var y=H*(1-c.h*0.88);
    var fromX = t.x + (topX-t.x)*(1-c.h);
    fx.beginPath();
    fx.ellipse(fromX + c.side*c.len*0.9, y-14, c.len*0.85, c.len*0.4, c.side*0.3, 0, Math.PI*2);
    fx.fill();
  }
}
function blendCss(a,b,t){
  function p(s){var m=s.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);return [+m[1],+m[2],+m[3],+m[4]];}
  var A=p(a),B=p(b);
  var r=Math.round(A[0]+(B[0]-A[0])*t),g=Math.round(A[1]+(B[1]-A[1])*t),bl=Math.round(A[2]+(B[2]-A[2])*t);
  return "rgba("+r+","+g+","+bl+","+(A[3]+(B[3]-A[3])*t)+")";
}
buildForest();
addEventListener("resize",buildForest);

/* ============================ MONKEY (procedural, articulated) ============================ */
var mc=document.createElement("canvas"); mc.id="monkeyCanvas";
mc.style.cssText="position:fixed;inset:0;z-index:9;pointer-events:none";
document.body.appendChild(mc);
var mx=mc.getContext("2d");

/* anatomy: 2-segment limbs with hands/feet that GRIP */
var MK={
  hostTree:0, side:1, y:0.3, climbing:0, pause:0,
  headTurn:0, headTurnV:0, alert:0, alertTimer:0,
  tailWag:0, breath:0,
  gait:0, gaitSpeed:0,
  flashLit:0
};
function limbPose(ph, isArm){
  /* alternate diagonal pairs: left arm+right leg / right arm+left leg */
  var a=Math.sin(ph)* (isArm?0.55:0.7);
  return a;
}
function gripPoint(tr, side, h, reach){
  /* point on a branch or trunk the hand/foot is gripping */
  var H=fc.height;
  var y=H*(1-h*0.88);
  var fromX = tr.x + (tr.x + tr.lean*H*0.3 - tr.x)*(1-h);
  return {x:fromX + side*(tr.w*0.55), y:y};
}
function drawMonkey(flashL, time){
  var W=mc.width=innerWidth, H=mc.height=innerHeight;
  mx.clearRect(0,0,W,H);
  var tr=TREES[MK.hostTree]||TREES[0];
  var sway=Math.sin(time/2300 + tr.x)*6;
  var trunkX = tr.x + tr.lean*H*0.3*(1-MK.y) + sway*(1-MK.y);
  var trunkTopX = tr.x + tr.lean*H*0.3 + sway;
  var bx = trunkX + (trunkTopX-trunkX)*MK.y;         /* monkey x follows trunk */
  var by = H*(1-MK.y*0.86) - H*0.06;                  /* monkey y */
  var s = Math.max(0.55, tr.w/60) * (innerWidth<720?0.7:1);  /* scale */
  var fur = flashL>0 ? [92,64,44] : [44,30,22];      /* fur colors lit vs dark */
  var furHi = flashL>0 ? [140,100,70] : [70,50,36];
  var skin = flashL>0 ? [230,190,160] : [110,80,60];

  function F(c,a){return "rgba("+(c[0]|0)+","+(c[1]|0)+","+(c[2]|0)+","+(a||1)+")";}

  var phase=MK.gait;
  var bob = Math.sin(phase*2)*2.5*s * (MK.climbing?1:0.2);
  var bodyY = by + bob;
  var bodyLean = tr.side * (MK.climbing?0.14:0.05) + Math.sin(phase)*0.05;
  var bodyX = bx;

  /* TAIL (curly, wagging) */
  var tailEnd = MK.tailWag*0.5;
  mx.strokeStyle=F(fur,0.95); mx.lineWidth=4.5*s; mx.lineCap="round";
  mx.beginPath();
  mx.moveTo(bodyX - tr.side*6*s, bodyY-2*s);
  mx.quadraticCurveTo(bodyX - tr.side*26*s, bodyY+2*s+tailEnd*8, bodyX - tr.side*18*s, bodyY-24*s+Math.sin(MK.tailWag)*6*s);
  mx.quadraticCurveTo(bodyX - tr.side*10*s, bodyY-40*s, bodyX - tr.side*20*s, bodyY-34*s);
  mx.stroke();

  /* LEGS (far pair drawn first, darker) */
  function drawLimb(hipX, hipY, footX, footY, width, dark){
    var c = dark ? [fur[0]*0.7, fur[1]*0.7, fur[2]*0.7] : fur;
    var midX=(hipX+footX)/2 + (footY<hipY?6:-2)*s, midY=(hipY+footY)/2;
    mx.strokeStyle=F(c); mx.lineWidth=width*s; mx.lineCap="round";
    mx.beginPath(); mx.moveTo(hipX,hipY); mx.quadraticCurveTo(midX,midY,footX,footY); mx.stroke();
    /* hand/foot */
    mx.fillStyle=F(skin);
    mx.beginPath(); mx.ellipse(footX,footY, 4.5*s, 3*s, 0.4, 0, Math.PI*2); mx.fill();
  }
  var gripL = Math.sin(phase), gripR = Math.sin(phase+Math.PI);
  /* leg grips slide along trunk as the body moves */
  var legReach = 14*s;
  var rLegY = bodyY+16*s + gripR*legReach*0.5;
  var lLegY = bodyY+16*s + gripL*legReach*0.5;
  drawLimb(bodyX+tr.side*2*s, bodyY+12*s, bodyX - tr.side*4*s + (trunkX-bx)*0.4, rLegY, 5.5, true);
  drawLimb(bodyX+tr.side*3*s, bodyY+12*s, bodyX - tr.side*2*s + (trunkX-bx)*0.4, lLegY, 5.5, false);

  /* TORSO (rounded, furred) */
  var grad=mx.createRadialGradient(bodyX-tr.side*4*s, bodyY-6*s, 2, bodyX, bodyY, 16*s);
  grad.addColorStop(0, F(furHi));
  grad.addColorStop(1, F(fur));
  mx.fillStyle=grad;
  mx.beginPath();
  mx.ellipse(bodyX, bodyY, 11*s, 14*s, bodyLean, 0, Math.PI*2);
  mx.fill();
  /* fur strokes along back */
  mx.strokeStyle=F([furHi[0],furHi[1],furHi[2]],0.5); mx.lineWidth=1*s;
  for(var f=0;f<7;f++){
    var fa=-0.9+f*0.28;
    mx.beginPath();
    mx.moveTo(bodyX+Math.cos(fa)*9*s, bodyY+Math.sin(fa)*11*s);
    mx.lineTo(bodyX+Math.cos(fa)*13*s, bodyY+Math.sin(fa)*15*s);
    mx.stroke();
  }
  /* light belly */
  mx.fillStyle=F(flashL>0?[210,180,150]:[120,92,70],0.8);
  mx.beginPath(); mx.ellipse(bodyX - tr.side*6*s, bodyY+2*s, 5.5*s, 8*s, bodyLean, 0, Math.PI*2); mx.fill();

  /* ARMS (near pair on top) */
  var armReach=16*s;
  var rArmY = bodyY-10*s - gripR*armReach*0.6;
  var lArmY = bodyY-10*s - gripL*armReach*0.6;
  var armX = bodyX + tr.side*6*s;
  drawLimb(bodyX+tr.side*8*s, bodyY-6*s, armX + tr.side*4*s, rArmY, 5, false);
  drawLimb(bodyX+tr.side*8*s, bodyY-6*s, armX + tr.side*5*s, lArmY, 5, false);

  /* HEAD (with natural movement) */
  var headTurn = MK.headTurn*0.6;
  var headX = bodyX + tr.side*7*s;
  var headY = bodyY-20*s + Math.sin(MK.breath)*1.2*s + (MK.alert?-2*s:0);
  var hgrad=mx.createRadialGradient(headX-tr.side*2*s, headY-2*s, 1, headX, headY, 9*s);
  hgrad.addColorStop(0,F(furHi));
  hgrad.addColorStop(1,F(fur));
  mx.fillStyle=hgrad;
  mx.beginPath(); mx.ellipse(headX, headY, 8*s, 7.4*s, tr.side*0.08, 0, Math.PI*2); mx.fill();
  /* face (muzzle) */
  mx.fillStyle=F(skin, flashL>0?1:0.85);
  mx.beginPath(); mx.ellipse(headX + tr.side*4*s - headTurn*4*s, headY+2.5*s, 5*s, 4.4*s, 0, 0, Math.PI*2); mx.fill();
  /* brow/forehead fur ridge */
  mx.fillStyle=F(fur,0.9);
  mx.beginPath(); mx.ellipse(headX+tr.side*2*s, headY-3.5*s, 6*s, 3.4*s, 0, 0, Math.PI*2); mx.fill();
  /* eyes (visible on flash/alert) */
  var eyeA = flashL>0.15 || MK.alert>0 ? 0.95 : 0.55;
  mx.fillStyle="rgba(20,14,10,"+eyeA+")";
  mx.beginPath(); mx.arc(headX+tr.side*5.4*s - headTurn*4*s, headY+0.5*s, 1.15*s, 0, Math.PI*2); mx.fill();
  mx.beginPath(); mx.arc(headX+tr.side*2.2*s - headTurn*3*s, headY+0.8*s, 1.05*s, 0, Math.PI*2); mx.fill();
  /* ear */
  mx.fillStyle=F(fur,0.9);
  mx.beginPath(); mx.arc(headX - tr.side*2*s, headY-1*s, 2.6*s, 0, Math.PI*2); mx.fill();
  mx.fillStyle=F(skin,0.8);
  mx.beginPath(); mx.arc(headX - tr.side*2*s, headY-1*s, 1.4*s, 0, Math.PI*2); mx.fill();
  /* alert "!" over head */
  if(MK.alert>0){
    mx.fillStyle="rgba(255,255,255,"+(MK.alert)+")";
    mx.font="bold "+Math.round(15*s)+"px system-ui";
    mx.fillText("!", headX+tr.side*8*s, headY-14*s);
  }
  /* rim light when flash */
  if(flashL>0.05){
    mx.strokeStyle="rgba(255,255,255,"+(flashL*0.55)+")"; mx.lineWidth=1.4*s;
    mx.beginPath(); mx.ellipse(bodyX, bodyY, 11*s, 14*s, bodyLean, Math.PI*1.15, Math.PI*1.9); mx.stroke();
    mx.beginPath(); mx.ellipse(headX, headY, 8*s, 7.4*s, 0, Math.PI*1.2, Math.PI*2.0); mx.stroke();
  }
}
/* ============================ MONKEY BRAIN ============================ */
var mkOnTree=0, mkBranchTarget=null;
function monkeyThink(time){
  if(MK.pause>0){ MK.pause-=1; MK.climbing=0; MK.alert=Math.max(0,MK.alert-0.01); }
  else {
    MK.climbing=1;
    MK.gait += 0.085;                       /* gait drives limb alternation */
    MK.y += (MK.climbDir||1) * 0.0016 * (0.7+Math.random()*0.4);
    if(MK.y>0.82 || MK.y<0.12){
      MK.climbDir=-(MK.climbDir||1);
      MK.pause=60+Math.random()*80;         /* pause at branch */
      MK.headTurnV=(Math.random()-0.5)*0.3;
      /* sometimes hop trees */
      if(Math.random()<0.4){ MK.hostTree=Math.random()<.5?0:1; MK.tailWag=0; }
    }
  }
  /* head natural movement */
  MK.headTurn += MK.headTurnV;
  MK.headTurnV += (Math.random()-0.5)*0.04 - MK.headTurn*0.03;
  MK.headTurnV=Math.max(-0.25,Math.min(0.25,MK.headTurnV));
  MK.tailWag += MK.climbing?0.12:0.05;
  MK.breath += 0.045;
  MK.alert = Math.max(0, MK.alert-0.008);
}
function monkeyScare(){
  MK.alert=1; MK.pause=20;
  MK.headTurnV=(Math.random()<.5?-1:1)*0.25;
  if(Math.random()<.5) monkeyCall();
}
/* ============================ MONKEY VOCALS (organic synth) ============================ */
function monkeyCall(){
  if(!actx)return;
  var t=actx.currentTime, n=2+Math.floor(Math.random()*3);
  for(var i=0;i<n;i++){
    var st=t+i*0.24;
    var o=actx.createOscillator(), g=actx.createGain(), f=actx.createBiquadFilter();
    o.type="sawtooth";
    var base=520+Math.random()*240;
    o.frequency.setValueAtTime(base*0.7,st);
    o.frequency.exponentialRampToValueAtTime(base,st+0.05);
    o.frequency.exponentialRampToValueAtTime(base*0.75,st+0.16);
    f.type="bandpass"; f.frequency.value=1100; f.Q.value=1.4;   /* formant — hoo-like */
    g.gain.setValueAtTime(0.001,st);
    g.gain.exponentialRampToValueAtTime(0.24,st+0.03);
    g.gain.exponentialRampToValueAtTime(0.001,st+0.19);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(st); o.stop(st+0.2);
  }
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
