// evil⁶⁶⁶MD — Telegram companion (pair/status only; one token = one instance)
const { execSync } = require('child_process');
const TELEGRAM_TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
if (TELEGRAM_TOKEN) start();
function start() {
  const api = (m, b) => fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
  let offset = 0;
  (async () => {
    const me = await api('getMe');
    if (!me.ok) return console.log('[TG] bad token:', me.description);
    console.log('[TG] live as @' + me.result.username);
    await api('setMyCommands', { commands: [
      { command: 'start', description: 'Open the console' },
      { command: 'status', description: 'Bot status' },
      { command: 'ping', description: 'Speed check' },
    ]});
    for (;;) {
      try {
        const r = await api('getUpdates', { offset: offset + 1, timeout: 25 });
        for (const u of (r.result || [])) {
          offset = u.update_id;
          if (u.callback_query) { api('answerCallbackQuery', { callback_query_id: u.callback_query.id }).catch(()=>{}); continue; }
          const m = u.message; if (!m?.text) continue;
          const cmd = m.text.trim().replace(/^\//, '').toLowerCase().split(/\s+/)[0];
          const reply = (t) => api('sendMessage', { chat_id: m.chat.id, text: t, parse_mode: 'Markdown' });
          try {
            if (cmd === 'start' || cmd === 'menu') {
              const wa = global.conn && global.conn.user ? '✅ ONLINE as +' + (global.conn.user.id || '').split(':')[0] : '⛔ not paired';
              await reply(`╔═══❖•ೋ° °ೋ•❖═══╗\n   ⚡ 𝗘𝗩𝗜𝗟⁶𝟲𝟲𝗠𝗗 ⚡\n╚═══❖•ೋ° °ೋ•❖═══╝\n\n┏━━━━━━━━━━━━━━┓\n┃ 🖥 𝗪𝗲𝗯 ┇ ${wa}\n┃ ⏱ 𝗨𝗽𝘁𝗶𝗺𝗲 ┇ ${Math.floor(process.uptime() / 60)}m\n┃ 👑 𝗢𝘄𝗻𝗲𝗿 ┇ evil\n┗━━━━━━━━━━━━━━┛\n\nSend \`.menu\` on WhatsApp for the full command list.`);
            } else if (cmd === 'status') {
              await reply(global.conn && global.conn.user ? `✅ Connected as +${(global.conn.user.id || '').split(':')[0]}` : '⛔ Not paired yet — scan the QR from the web page or set SESSION_ID');
            } else if (cmd === 'ping') {
              await reply('🏓 pong — ' + Math.floor(process.uptime()) + 's uptime');
            }
          } catch (e) { console.log('[TG] cmd error:', e.message); }
        }
      } catch (e) { console.log('[TG] poll error:', e.message); await new Promise(r => setTimeout(r, 3000)); }
    }
  })();
}
