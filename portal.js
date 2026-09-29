// evil⁶⁶⁶MD — multi-pair engine.
// Anyone pairs their number -> their own full bot instance (bot/index.js),
// with THEM as the owner of that session. All 157 commands included.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const P = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
} = require('@whiskeysockets/baileys');

const BOT_DIR = path.join(__dirname, 'bot');
const SESSIONS = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS)) fs.mkdirSync(SESSIONS, { recursive: true });

const running = new Map();   // id -> child process
const pending = new Map();   // id -> { sock, code, open, error }

function idFor(number) { return 'evil' + String(number).replace(/[^0-9]/g, ''); }
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

function ownerEnv(id, number) {
  return {
    ...process.env,
    OWNER_NUMBER: String(number),
    DEV: String(number),
    OWNER_NAME: 'owner-' + id,
    INSTANCE_ID: id,
    TELEGRAM_TOKEN: '',   // instances skip Telegram; the portal owns the single TG bot
    PORT: String(4000 + (Math.abs(hash(id)) % 20000)), // unique keep-alive port per instance
  };
}

function startInstance(id, number) {
  if (running.has(id)) return;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: BOT_DIR,
    env: ownerEnv(id, number),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logPath = path.join(SESSIONS, id + '.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  child.on('exit', (code) => {
    running.delete(id);
    try { fs.appendFileSync(logPath, `[portal] ${id} exited code=${code} ${new Date().toISOString()}\n`); } catch {}
    // auto-restart paired sessions (unless logged out — creds.json removed)
    setTimeout(() => { if (fs.existsSync(path.join(SESSIONS, id, 'creds.json'))) startInstance(id, number); }, 10000);
  });
  running.set(id, child);
  console.log('[portal] started instance', id);
}

function isPaired(id) {
  const f = path.join(SESSIONS, id, 'creds.json');
  return fs.existsSync(f) && fs.statSync(f).size > 100;
}

async function createPairing(numberRaw) {
  const number = String(numberRaw || '').replace(/[^0-9]/g, '');
  if (!/^\d{7,15}$/.test(number)) throw new Error('Number with country code, e.g. 22873272569');
  const id = idFor(number);
  if (isPaired(id)) { startInstance(id, number); return { alreadyPaired: true, id }; }
  if (pending.has(id) && pending.get(id).code) return { code: pending.get(id).code, id };
  if (pending.has(id)) return { error: 'Pairing already in progress for this number — wait ~30s and try again' };

  const dir = path.join(SESSIONS, id);
  const { state: auth, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    auth: { creds: auth.creds, keys: auth.keys },
    version,
    getMessage: async () => ({}),
  });
  const entry = { sock, code: null, open: false, error: null };
  pending.set(id, entry);

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr && !entry.code) {
      try { entry.code = await sock.requestPairingCode(number); console.log('[portal] code for +' + number + ': ' + entry.code); }
      catch (e) { entry.error = e.message; }
    }
    if (connection === 'open') {
      entry.open = true;
      try { fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({ number, owner: true, pairedAt: new Date().toISOString() })); } catch {}
      pending.delete(id);
      startInstance(id, number); // their own bot — THEM as owner
    }
    if (connection === 'close') {
      const dc = lastDisconnect?.error?.output?.statusCode;
      pending.delete(id);
      if (!entry.open) console.log('[portal] pair session closed for +' + number, dc);
      try { sock.end(); } catch {}
    }
  });

  // wait up to 30s for the pairing code
  for (let i = 0; i < 60; i++) {
    if (entry.code || entry.error) break;
    await new Promise(r => setTimeout(r, 500));
  }
  if (entry.error) { try { sock.end(); } catch {} pending.delete(id); throw new Error('Pairing failed: ' + entry.error); }
  if (!entry.code) { try { sock.end(); } catch {} pending.delete(id); throw new Error('Timed out requesting code — try again'); }
  return { code: entry.code, id };
}

function status(id) {
  return { id, paired: isPaired(id), running: running.has(id) };
}

function instanceCount() { return running.size; }

module.exports = { createPairing, startInstance, status, idFor, instanceCount, isPaired };
