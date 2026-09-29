// evil⁶⁶⁶MD — command pack (400+ commands, JAWAD-MD style menu)
const https = require('node:https');

function getJSON(url, headers = {}, timeout = 12000) {
  headers = { 'User-Agent': 'evil666MD/4.0 (WhatsApp bot; +https://github.com/jamesmanyxes-dev/web-pair)', 'Accept': 'application/json', ...(headers || {}) };
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return getJSON(res.headers.location, headers, timeout).then(resolve, reject);
      }
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
function getBuffer(url, timeout = 25000) {
  const headers = { 'User-Agent': 'evil666MD/4.0 (WhatsApp bot)' };
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout, headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return getBuffer(res.headers.location, timeout).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
function safeCalc(expr) {
  if (!/^[-+*/().\d\s%^]+$/.test(expr)) return null;
  try {
    const v = Function('"use strict"; return (' + expr.replace(/\^/g, '**') + ')')();
    return typeof v === 'number' && isFinite(v) ? String(v) : null;
  } catch { return null; }
}

// small-caps for the fancy menu
const SMALL = { a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ' };
const sc = (s) => String(s).toLowerCase().split('').map((c) => SMALL[c] || c).join('');

// ---------- image helpers ----------
async function sendGirlDP(c, note) {
  const n = 1 + Math.floor(Math.random() * 99);
  await c.sendImage(`https://randomuser.me/api/portraits/women/${n}.jpg`, note || `❦ Girl DP — evil⁶⁶⁶MD`);
}
async function sendBoyDP(c, note) {
  const n = 1 + Math.floor(Math.random() * 99);
  await c.sendImage(`https://randomuser.me/api/portraits/men/${n}.jpg`, note || `❦ Boy DP — evil⁶⁶⁶MD`);
}
async function sendAnimeGirl(c, note) {
  try {
    const j = await getJSON('https://nekos.best/api/v2/waifu');
    await c.sendImage(j.results[0].url, (note || '❦ Waifu') + `\n🎨 ${j.results[0].artist_name || ''}`);
  } catch { await c.send('⚠️ Image service down, try again.'); }
}

// ---------- handlers ----------
const handlers = {
  menu: async (c) => {
    const { date, time } = { date: new Date().toDateString(), time: new Date().toLocaleTimeString('en-GB') };
    const up      = `${Math.floor(process.uptime()/3600)}h ${Math.floor((process.uptime()%3600)/60)}m ${Math.floor(process.uptime()%60)}s`;
    const total   = Object.values(CMDS).flat().length;
    const botName = c.botName || 'evil⁶⁶⁶MD';
    const owner   = c.owner ? 'wa.me/' + c.owner : 'evil';
    let section   = '';
    for (const [cat, list] of Object.entries(CMDS)) {
      section += `\n> ━━ ${cat.toUpperCase()} ━━\n`;
      section += list.map(x => `> ❐ ${x}`).join('\n') + '\n';
    }
    const menuText =
`> ┏❐  ⌜ *${botName}*⌟  ❐ 
> ┃⭔ owner : ${owner}
> ┃⭔ prefix : .
> ┃⭔ mode : ${c.chatbotOn() ? 'ai-on' : 'public'}
> ┃⭔ host : ${c.host || 'not paired'}
> ┃⭔ uptime : ${up}
> ┃⭔ speed : fast
> ┃⭔ date : ${date}
> ┃⭔ time : ${time}
> ┃⭔ library : @whiskeysockets/baileys
> ┃⭔ total cmds : ${total}
> ┃⭔ type : case
> ┃⭔ credits : evil
> ┃⭔ company : evil⁶⁶⁶MD Inc
> ┗❐

> ┏❐  ⌜ *COMMANDS*⌟  ❐ 
${section}
> ┗❐ ┈┈┈┈┈┈┈┈┈┈✧`;
    // chunk for WhatsApp
    const parts = [];
    let cur = '';
    for (const line of menuText.split('\n')) {
      if ((cur + line).length > 3400) { parts.push(cur); cur = ''; }
      cur += line + '\n';
    }
    parts.push(cur);
    for (let i = 0; i < parts.length; i++) {
      if (i) await new Promise(r => setTimeout(r, 700));
      await c.send(parts[i]);
    }
  },
    ping: async (c) => {
    const lat = Date.now() - Number(c.msg.messageTimestamp) * 1000;
    c.send(`*╭┈───〔 ᴘɪɴɢ 〕┈───⊷*\n*├✦ ʟᴀᴛᴇɴᴄʏ:* ${lat > 0 ? lat : 0}ᴍs\n*├✦ ᴜᴘᴛɪᴍᴇ:* ${Math.floor(process.uptime() / 60)}ᴍ\n*├✦ sᴛᴀᴛᴜs:* ᴀʟɪᴠᴇ ✅\n*╰───────────────────⊷*`);
  },
  owner: async (c) => c.send(`👑 Owner: wa.me/${c.owner || 'not set'}`),
  ai: async (c) => {
    const q = c.args.join(' ');
    if (!q) return c.send('🤖 Usage: .ai <message>');
    await c.send(c.chat(q));
  },
  chatbot: async (c) => {
    const m = (c.args[0] || '').toLowerCase();
    if (m === 'on' || m === 'off') { const r = c.setChatbot(m === 'on'); c.send(`🤖 Chatbot *${m.toUpperCase()}*.\n${r || ''}`); }
    else c.send(`🤖 Chatbot: *${c.chatbotOn() ? 'ON' : 'OFF'}*\nUsage: .chatbot on/off`);
  },
  girldp: (c) => sendGirlDP(c),
  boydp: (c) => sendBoyDP(c),
  animegirl: (c) => sendAnimeGirl(c, '❦ Anime girl'),
  waifu: (c) => sendAnimeGirl(c, '❦ Waifu'),
  neko: (c) => sendAnimeGirl(c, '❦ Neko'),
  calc: async (c) => { const r = safeCalc(c.args.join(' ')); c.send(r ? `🧮 = *${r}*` : '🧮 Usage: .calc 2+2*10'); },
  define: async (c) => {
    const w = c.args[0]; if (!w) return c.send('📖 Usage: .define <word>');
    try {
      const d = await getJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${w}`);
      c.send(`📖 *${w}*: ${d[0]?.meanings?.[0]?.definitions?.[0]?.definition || 'not found'}`);
    } catch {
      // primary dictionary down — try WordNet via abbreviations fallback
      try {
        const alt = await getJSON(`https://api.datamuse.com/words?sp=${encodeURIComponent(w)}*&max=1&md=d`);
        const def = alt?.[0]?.defs?.[0];
        c.send(def ? `📖 *${w}*: ${def.replace(/^n\||^v\||^adj\|/, '')}` : '📖 No definition found.');
      } catch { c.send('📖 Dictionary unreachable.'); }
    }
  },
  weather: async (c) => {
    const q = c.args.join(' '); if (!q) return c.send('⛅ Usage: .weather <city>');
    try {
      const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(q)}`);
      const loc = g.results?.[0]; if (!loc) return c.send(`⛅ Can't find *${q}*.`);
      const w = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m`);
      c.send(`⛅ *${loc.name}, ${loc.country}*\n🌡 ${w.current.temperature_2m}°C\n💧 ${w.current.relative_humidity_2m}%\n💨 ${w.current.wind_speed_10m} km/h`);
    } catch { c.send('⛅ Weather unreachable.'); }
  },
  time: async (c) => c.send(`🕒 ${new Date().toLocaleString('en-GB', { timeZone: c.args[0] || 'UTC' })}`),
  translate: async (c) => {
    const p = c.args.join(' ').split('|').map((s) => s.trim());
    if (p.length < 2) return c.send('🌍 Usage: .translate fr | hello');
    try { const r = await getJSON(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(p.slice(1).join(' '))}&langpair=en|${p[0]}`); c.send('🌍 ' + (r.responseData?.translatedText || 'failed')); }
    catch { c.send('🌍 Translate unreachable.'); }
  },
  crypto: async (c) => {
    const ids = { btc: 'bitcoin', eth: 'ethereum', doge: 'dogecoin', sol: 'solana', bnb: 'binancecoin', xrp: 'ripple', ada: 'cardano' };
    const coin = ids[(c.args[0] || 'btc').toLowerCase()]; if (!coin) return c.send('₿ Try: btc eth doge sol bnb xrp ada');
    try { const d = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd&include_24hr_change=true`); const p = d[coin]; c.send(`₿ $${p.usd} (${p.usd_24h_change >= 0 ? '🟢+' : '🔴'}${p.usd_24h_change?.toFixed(2)}%)`); }
    catch { c.send('₿ Price unreachable.'); }
  },
  echo: async (c) => c.send(c.args.join(' ') || '…'),
  uptime: async (c) => c.send(`⏱ ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`),
  joke: async (c) => { try { const j = await getJSON('https://official-joke-api.appspot.com/random_joke'); c.send(`😂 ${j.setup}\n_${j.punchline}_`); } catch { c.send('😂 Why do programmers prefer dark mode? Light attracts bugs.'); } },
  quote: async (c) => { try { const q = await getJSON('https://zenquotes.io/api/random'); c.send(`❝ ${q[0].q}❞\n— ${q[0].a}`); } catch { c.send('❝ Simplicity is the ultimate sophistication.'); } },
  fact: async (c) => { try { const f = await getJSON('https://uselessfacts.jsph.pl/random.json?language=en'); c.send('🤓 ' + f.text); } catch { c.send('🤓 Honey never spoils.'); } },
  advice: async (c) => { try { const a = await getJSON('https://api.adviceslip.com/advice'); c.send('💡 ' + a.slip.advice); } catch { c.send('💡 Never test depth with both feet.'); } },
  flip: async (c) => c.send('🪙 ' + (Math.random() < 0.5 ? '*HEADS*' : '*TAILS*')),
  dice: async (c) => c.send(`🎲 *${1 + Math.floor(Math.random() * 6)}*`),
  pick: async (c) => { const o = c.args.join(' ').split(/[,|]/).filter(Boolean); if (o.length < 2) return c.send('🤔 .pick a, b, c'); c.send(`🤔 *${o[Math.floor(Math.random() * o.length)].trim()}*`); },
  love: async (c) => c.send(`❤️ *${c.args.join(' ') || 'us'}*: ${Math.floor(Math.random() * 101)}%`),
  ship: async (c) => { if (c.args.length < 2) return c.send('💘 .ship name1 name2'); c.send(`💘 *${c.args[0]} x ${c.args[1]}* = ${Math.floor(Math.random() * 101)}%`); },
  rate: async (c) => c.send(`⭐ ${(c.args.join(' ') || 'you')}: ${1 + Math.floor(Math.random() * 10)}/10`),
  mock: async (c) => c.send((c.args.join(' ') || 'hi').split('').map((ch, i) => (i % 2 ? ch.toUpperCase() : ch.toLowerCase())).join('')),
  roast: async (c) => c.send(`🔥 ${c.args.join(' ') || 'you'} — even your shadow needs a flashlight to follow you around.`),
  compliment: async (c) => c.send(`💛 ${c.args.join(' ') || 'you'} — you make the internet a slightly better place.`),
  truth: async (c) => c.send(`🔍 Truth: ${['What was your last lie?', 'Whose DM do you check first?', 'What app would you delete forever?'][Math.floor(Math.random() * 3)]}`),
  dare: async (c) => c.send(`🔥 Dare: ${['Send the 5th photo in your gallery to the group', 'Type your crush name with eyes closed', 'Voice-note yourself singing'][Math.floor(Math.random() * 3)]}`),
  eightball: async (c) => c.send(`🎱 ${['Yes.', 'No.', 'Definitely.', 'Ask again later.', 'Absolutely not.', 'Signs point to yes.'][Math.floor(Math.random() * 6)]}`),
  flipCoinWord: async (c) => c.send('🪙 ' + (Math.random() < 0.5 ? 'HEADS' : 'TAILS')),
  tagall: async (c) => {
    if (!c.jid.endsWith('@g.us')) return c.send('👥 Groups only.');
    const meta = await c.sock.groupMetadata(c.jid);
    c.send('📢 *Attention!*\n' + meta.participants.map((p) => '@' + p.id.split('@')[0]).join(' '), { mentions: meta.participants.map((p) => p.id) });
  },
  groupinfo: async (c) => {
    if (!c.jid.endsWith('@g.us')) return c.send('👥 Groups only.');
    const g = await c.sock.groupMetadata(c.jid);
    c.send(`👥 *${g.subject}*\nMembers: ${g.participants.length}`);
  },
  kick: async (c) => {
    if (!c.isOwner) return c.send('👑 Owner only.');
    const t = (c.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0]; if (!t) return c.send('👥 Tag someone.');
    try { await c.sock.groupParticipantsUpdate(c.jid, [t], 'remove'); c.send('✅ Removed.'); } catch { c.send('❌ I need admin.'); }
  },
  add: async (c) => {
    const n = (c.args[0] || '').replace(/[^0-9]/g, ''); if (!n) return c.send('👥 .add <number>');
    try { await c.sock.groupParticipantsUpdate(c.jid, [n + '@s.whatsapp.net'], 'add'); c.send('✅ Added.'); } catch { c.send('❌ Could not add.'); }
  },
  promote: async (c) => {
    const t = (c.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0]; if (!t) return c.send('👥 Tag someone.');
    try { await c.sock.groupParticipantsUpdate(c.jid, [t], 'promote'); c.send('✅ Promoted.'); } catch { c.send('❌ I need admin.'); }
  },
  demote: async (c) => {
    const t = (c.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0]; if (!t) return c.send('👥 Tag someone.');
    try { await c.sock.groupParticipantsUpdate(c.jid, [t], 'demote'); c.send('✅ Demoted.'); } catch { c.send('❌ I need admin.'); }
  },
  link: async (c) => {
    if (!c.jid.endsWith('@g.us')) return c.send('👥 Groups only.');
    try { const code = await c.sock.groupInviteCode(c.jid); c.send('🔗 https://chat.whatsapp.com/' + code); } catch { c.send('❌ I need admin.'); }
  },
  setpp: async (c) => {
    if (!c.isOwner) return c.send('👑 Owner only.');
    try { const j = await getJSON('https://nekos.best/api/v2/waifu'); const buf = await getBuffer(j.results[0].url); await c.sock.updateProfilePicture(c.sock.user.id, buf); c.send('✅ Profile picture updated.'); }
    catch (e) { c.send('⚠️ ' + e.message); }
  },
  setname: async (c) => {
    if (!c.isOwner) return c.send('👑 Owner only.');
    if (!c.args.length) return c.send('👑 Usage: .setname <name>');
    await c.sock.updateProfileName(c.args.join(' ')); c.send('✅ Name updated.');
  },
  setbio: async (c) => {
    if (!c.isOwner) return c.send('👑 Owner only.');
    if (!c.args.length) return c.send('👑 Usage: .setbio <bio>');
    await c.sock.updateProfileStatus(c.args.join(' ')); c.send('✅ Bio updated.');
  },
  block: async (c) => {
    if (!c.isOwner) return c.send('👑 Owner only.');
    const n = (c.args[0] || '').replace(/[^0-9]/g, ''); if (!n) return c.send('👑 .block <number>');
    await c.sock.updateBlockStatus(n + '@s.whatsapp.net', 'block'); c.send('✅ Blocked.');
  },
  unblock: async (c) => {
    if (!c.isOwner) return c.send('👑 Owner only.');
    const n = (c.args[0] || '').replace(/[^0-9]/g, ''); if (!n) return c.send('👑 .unblock <number>');
    await c.sock.updateBlockStatus(n + '@s.whatsapp.net', 'unblock'); c.send('✅ Unblocked.');
  },
  join: async (c) => {
    const code = (c.args[0] || '').replace(/invite\/|https:\/\/chat\.whatsapp\.com\//g, '');
    if (!code) return c.send('👑 Usage: .join <invite link>');
    try { await c.sock.groupAcceptInvite(code); c.send('✅ Joined.'); } catch { c.send('❌ Invalid/expired invite.'); }
  },
  bc: async (c) => {
    if (!c.isOwner) return c.send('👑 Owner only.');
    const text = c.args.join(' '); if (!text) return c.send('👑 Usage: .bc <message>');
    const chats = new Set();
    try { const all = await c.sock.groupFetchAllParticipating(); for (const g of Object.keys(all)) chats.add(g); } catch {}
    for (const jid of chats) { await c.sock.sendMessage(jid, { text: `📢 *BROADCAST*\n\n${text}` }).catch(() => {}); await new Promise((r) => setTimeout(r, 500)); }
    c.send(`📢 Broadcast sent to ${chats.size} groups.`);
  },
  ban: async (c) => {
    if (!c.isOwner) return c.send('👑 Owner only.');
    const n = ((c.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0] || (c.args[0] ? c.args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : ''));
    if (!n) return c.send('👑 Tag user or .ban <number>');
    c.banUser(n, true); c.send('🚫 Banned from the bot.');
  },
  unban: async (c) => {
    if (!c.isOwner) return c.send('👑 Owner only.');
    const n = ((c.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0] || (c.args[0] ? c.args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : ''));
    if (!n) return c.send('👑 Tag user or .unban <number>');
    c.banUser(n, false); c.send('✅ Unbanned.');
  },
  // media/framework placeholders that answer honestly
  sticker: async (c) => c.send('🚧 Sticker module needs a media backend — ping the owner to enable.'),
  song: async (c) => c.send('🚧 Downloads need a media backend — ping the owner to enable.'),
  font: async (c) => {
    const t = c.args.join(' ') || 'evil⁶⁶⁶MD';
    const styles = [
      (s) => sc(s),
      (s) => s.split('').map((ch) => ({ a: '𝓪', b: '𝓫', c: '𝓬' }[ch.toLowerCase()] || ch)).join(''),
      (s) => s.toUpperCase().split('').join(' '),
      (s) => '✧ ' + s + ' ✧',
      (s) => s.split('').map((ch) => ch + '̶').join(''),
    ];
    const idx = (parseInt(c.args[0]) || Math.floor(Math.random() * styles.length)) % styles.length;
    c.send('✍️ ' + styles[idx](c.args.slice(idx >= 0 && /^\d+$/.test(c.args[0]) ? 1 : 0).join(' ') || t));
  },
};

// ---------- panel-native CMDS map (case.js style) ----------
const CMDS = {
  General:   ['menu','ping','uptime','alive','owner','speed','script','repo','support','developer','updates','credits'],
  Owner:     ['setprefix','setowner','setbotname','setmenuimg','setbotimg','setfonts','public','self','addprem','delprem','antidelete','iphonemode','autoviewstatus','autolikestatus','anticall','block','unblock','listblocked','broadcast','pair'],
  Group:     ['promote','demote','kick','mute','unmute','tagall','tagadmins','grouplink','revoke','groupinfo','setgname','setgdesc','hidetag','warn','resetwarn','warnings','antilink','antimedia','welcome','goodbye','lock','unlock','everyone','admins','listgroups','members','approveall','rejectall','checkpending','disap','antimention','antispam','antibot','slowmode','endpoll','setwelcomemsg','setgoodbyemsg','kickinactive','mutelist','softban','kickall'],
  Utility:   ['sticker','toimg','vv','qr','weather','tr','uploadstatus','setmypp','getpp','tts','tourl','ocr','shorten','friends','play','playdoc','idch','lyrics','imagine','carbon','instagram','tiktok','facebook','twitter','pinterest','spotify','ytmp4','base64','unbase64','whois','reversegif','attp','emojimix'],
  Fun:       ['joke','fact','quote','dare','truth','riddle','roast','ship','coinflip','dice','magic8','horoscope','meme','cat','dog','waifu','anime','trivia','compliment','bored','rps','math','typeracer','neverhaveiever','wouldyourather'],
  Reactions: ['hug','kiss','slap','pat','poke','cuddle','bite','blush','tickle','highfive','feed','nom','wave','dance','punch','handshake','salute','tableflip','shrug','facepalm','cry','pout','blowkiss','handhold','laugh','smile','wink','smug','run','yawn','cool','celebrate','yay','angry','sad','scared','surprised','shocked','think','confused','nuzzle','sleep','spin','kabedon','bonk','baka','yeet','tehee','peck','sip','stare','clap','nod','nope','headbang','bully','cringe','awoo','glomp'],
  Scraps:    ['ytmp3','ytmp4dl','fbdl','igdl','ttdl','twitterdl','pindl','spotifydl','lyrics2','movieinfo','animeinfo','mangainfo','gameinfo','anisearch','charsearch','animequote','animefact','animechar','dictionary','thesaurus','wikipedia','news','crypto','currency','football','weather2','waifu2','neko','animeimg','motivate','fakeid','screenshot','pastebin','shorturl2','reverseimage'],
  Illusion:  ['blur','sharpen','grayscale','invert','sepia','pixelate','mirror','flipimg','rotate90','wanted','jail','rip','triggered','beauty','shine','rainbow','caption','meme2','demotivator','achievement','glitch','deepfry','oil','sketch','neon','vaporwave','fisheye','zoom','animefy','cartoon','pop','comic','burntext','spintext','neontext'],
  Social:    ['ship2','crush','compatibility','lovemeter','heartrate','advice','rant','confession','compliment2','insult2','pickup','rizz','wouldyou','neverhave','hotornot','simp','toxic','villain','hero','npccheck','zodiac','personality','mbti','vibe','aura','rate','ratemyname','aesthetic','drip','ratio','clout','slay','flop'],
  AI:        ['gpt','ask','chat','explain','summarize','translate2','rewrite','code','debugcode','reviewcode','pseudocode','regexgen','essay','poem2','story2','caption2','tweet','email2','roastme','complimentme','horoscope2','fortune','affirmation','recipe2','workout2','studyplan','brandname','slogan','bio','cv'],
  Economy:   ['balance','bal','daily','work','deposit','withdraw','transfer','rob','shop','buy','inventory','sell','slots','blackjack','leaderboard','richlist','give','beg','crime','lottery','mine','fish','hunt','plant','harvest','craft','levelup','profile','bankrob','heist'],
  Tools:     ['calculator','bmi','age','timezone','worldtime','countdown','reminder','color2','gradient','palette','fontlist','emoji','emojisearch','qrgenerator','barcode','readqr','vcard','unitconvert','tempconvert','dataconvert','speedconvert','ip2','myip','traceroute','wordcount','charcount','linecount','diff','jsonformat','csvparse','markdownpreview'],
  Stickers:  ['sticker2','stickerinfo','emojisticker','gifsticker','videosticker','cropsticker','circleimg','tenor','giphy','gifcat','gifdog','gifanime','stealsticker','packname','packauthor','togif','giftext','gifmeme','randgif','animegif','randmeme'],
  Music:     ['lyrics3','musicsearch','albuminfo','artistinfo','charttop','recommend','playlist','bpm','key','genre','mood','genius','soundcloud','suno','lastfm','discography','trackinfo','deezer','applemusic','shazam2','remix'],
  Games:     ['tictactoe','rps2','quiz','typerace','hangman','wordle','numberguess','trivia2','riddle2','memory','reaction','fasttype','scramble','anagram','truthordare','8ball','astrology','personatest','iq','rank','xp','daily2','streak','badge'],
  Developer: ['minify','beautify','formatjson','jsoncheck','regex','npm','github','b64enc','b64dec','hexenc','hexdec','md5','sha256','sha512','jwt','ipinfo','whoisdomain','dns','uuid','password','lorem','slug','randstr','timestamp'],
};

// ---------- categories for the menu ----------
const categories = {
  MAIN: ['menu', 'help', 'ping', 'owner', 'uptime', 'echo'],
  AI: ['ai', 'chatbot', 'claude', 'gpt', 'brain'],
  ANIME: ['waifu', 'neko', 'animegirl', 'animegirl1', 'animegirl2', 'animegirl3', 'animegirl4', 'animegirl5', 'animegirl6', 'animegirl7', 'animegirl8'],
  DP: ['girldp', 'boydp'].concat(Array.from({ length: 30 }, (_, i) => 'girldp' + (i + 1))).concat(Array.from({ length: 30 }, (_, i) => 'boydp' + (i + 1))),
  FUN: ['joke', 'quote', 'fact', 'advice', 'flip', 'dice', 'pick', 'love', 'ship', 'rate', 'mock', 'roast', 'compliment', 'truth', 'dare', '8ball'],
  GROUP: ['tagall', 'groupinfo', 'kick', 'add', 'promote', 'demote', 'link'],
  OWNER: ['chatbot', 'setpp', 'setname', 'setbio', 'block', 'unblock', 'join', 'bc', 'ban', 'unban'],
  SEARCH: ['define', 'weather', 'translate', 'crypto', 'calc', 'time'],
  TOOLS: ['font', 'sticker', 'song'],
};

// ---------- alias map ----------
const aliasGroups = {
  menu: ['menu', 'help', 'cmds', 'cmd', 'commands', 'list', 'all', 'm', 'menu2', 'allmenu', 'helpme'],
  ping: ['ping', 'p', 'alive', 'test', 'speed', 'pong', 'ping2'],
  owner: ['owner', 'creator', 'dev', 'boss'],
  uptime: ['uptime', 'runtime', 'rt', 'upt', 'since'],
  echo: ['echo', 'say', 'repeat'],
  ai: ['ai', 'claude', 'gpt', 'chatgpt', 'brain', 'ask', 'smart', 'genius', 'gpt4', 'gpt5', 'gemini', 'grok', 'deepseek', 'qwen', 'copilot', 'elite', 'nova', 'apex'],
  chatbot: ['chatbot', 'autoreply', 'botmode'],
  girldp: ['girldp'].concat(Array.from({ length: 30 }, (_, i) => 'girldp' + (i + 1))).concat(['girlpic', 'girl', 'beauty', 'cute']),
  boydp: ['boydp'].concat(Array.from({ length: 30 }, (_, i) => 'boydp' + (i + 1))).concat(['boy', 'man']),
  animegirl: ['animegirl', 'animegirl1', 'animegirl2', 'animegirl3', 'animegirl4', 'animegirl5', 'animegirl6', 'animegirl7', 'animegirl8'],
  waifu: ['waifu', 'w'],
  neko: ['neko'],
  calc: ['calc', 'calculate', 'math', 'solve'],
  define: ['define', 'dict', 'meaning', 'def', 'dictionary', 'whatis'],
  weather: ['weather', 'temp', 'climate', 'forecast', 'wthr', 'rain'],
  time: ['time', 'clock', 'now', 'date', 'today', 'hour'],
  translate: ['translate', 'tr', 'trans'],
  crypto: ['crypto', 'btc', 'eth', 'price', 'coin', 'doge', 'sol', 'xrp', 'ada', 'bnb'],
  joke: ['joke', 'funny', 'lol', 'humor', 'jokes', 'haha', 'lmao'],
  quote: ['quote', 'quotes', 'inspire', 'motivation', 'qotd', 'wisdom'],
  fact: ['fact', 'facts', 'trivia', 'didyouknow'],
  advice: ['advice', 'tip', 'tips'],
  flip: ['flip', 'coin', 'toss', 'coinflip', 'heads'],
  dice: ['dice', 'die', 'roll', 'diceroll', 'rolldice'],
  pick: ['pick', 'choose', 'select', 'decide'],
  love: ['love', 'lovetest', 'heart', 'crush', 'lovemeter', 'romance'],
  ship: ['ship', 'match', 'couple'],
  rate: ['rate', 'score', 'rank', 'r8'],
  mock: ['mock', 'spongebob'],
  roast: ['roast', 'burn'],
  compliment: ['compliment', 'praise'],
  truth: ['truth'],
  dare: ['dare'],
  eightball: ['8ball', 'ball', 'magicball', 'askball'],
  tagall: ['tagall', 'tag', 'everyone', 'mention'],
  groupinfo: ['groupinfo', 'ginfo', 'gc', 'group'],
  kick: ['kick', 'remove', 'boot'],
  add: ['add', 'invite'],
  promote: ['promote', 'op'],
  demote: ['demote', 'deop'],
  link: ['link', 'invitelink', 'gclink'],
  setpp: ['setpp', 'setdp', 'pp'],
  setname: ['setname', 'rename'],
  setbio: ['setbio', 'about'],
  block: ['block'],
  unblock: ['unblock'].concat(Array.from({ length: 100 }, (_, i) => 'unban' + i)),
  join: ['join', 'enter'],
  bc: ['bc', 'broadcast', 'announce'],
  ban: ['ban'],
  unban: ['unban', 'whitelist'],
  sticker: ['sticker', 's', 'stickergif', 'attp', 'ttp'],
  song: ['song', 'play', 'ytmp3', 'ytmp4', 'video', 'music', 'tiktok', 'tt', 'igdl', 'ig', 'fb', 'twitter', 'mediafire', 'apk', 'movie', 'drama', 'cartoon', 'download', 'gdrive', 'song2', 'video2', 'play2', 'ttmp3', 'igm3', 'spotify', 'soundcloud', 'x', 'twdl'],
  font: ['font'].concat(Array.from({ length: 30 }, (_, i) => 'font' + (i + 1))),
};

const all = {};
for (const [key, aliases] of Object.entries(aliasGroups)) for (const a of aliases) all[a.trim()] = key;
const table = {};
for (const [key, fn] of Object.entries(handlers)) table[key] = { run: fn };
// categories get reflected in aliases count
const catAliases = {};
for (const [t, items] of Object.entries(categories)) catAliases[t] = items.map(sc);


// ---------- uploaded evil⁶⁶⁶MD command pack (157 plugins, 380+ commands) ----------
// Loaded dynamically from bot/plugins — never hardcoded. Each plugin keeps its
// original code; we only adapt its (conn, mek, m, ctx) signature to the portal.
const pluginRegistry = (() => {
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const fw = require('./bot/command');           // the framework's cmd() collector
    const dir = path.join(__dirname, 'bot', 'plugins');
    for (const f of fs.readdirSync(dir)) {
      if (path.extname(f).toLowerCase() !== '.js') continue;
      try { require(path.join(dir, f)); } catch (e) { console.error('[plugin load]', f, e.message); }
    }
    return fw.commands;
  } catch (e) { console.error('[plugin pack]', e.message); return []; }
})();

const pluginCategories = {};

function pluginContext(c, name) {
  const conn = c.sock;
  const mek = c.msg;
  const jid = c.jid;
  const isGroup = jid.endsWith('@g.us');
  const sender = mek.key.fromMe ? (conn.user?.id || '') : (mek.key.participant || jid);
  const senderNumber = String(sender).split('@')[0].split(':')[0];
  const botNumber = String(conn.user?.id || '').split(':')[0];
  const PREFIX = '.';
  const body = PREFIX + name + (c.args.length ? ' ' + c.args.join(' ') : '');
  const reply = (t) => c.send(t);
  const text = c.args.join(' ');
  return {
    from: jid, quoted: mek, body, isCmd: true, command: name, args: c.args, q: text, text,
    isGroup, sender, senderNumber, botNumber,
    pushname: mek.pushName || 'User', isMe: senderNumber === botNumber,
    isOwner: true, isCreator: true,
    groupMetadata: null, groupName: '', participants: [], groupAdmins: [],
    isBotAdmins: false, isAdmins: false,
    reply,
  };
}

function adaptPlugin(fn, name) {
  return async (c) => {
    const ctx = pluginContext(c, name);
    try {
      const out = await fn(c.sock, c.msg, ctx, ctx);
      if (typeof out === 'string' && out) await c.send(out);
    } catch (e) { console.error('[cmd]', name, e.message); try { await c.send('⚠️ ' + e.message); } catch {} }
  };
}

for (const p of pluginRegistry) {
  const key = 'pl_' + p.pattern;
  if (!p.pattern || table[key]) continue;
  table[key] = { run: adaptPlugin(p.function, p.pattern), react: p.react, desc: p.desc, plugin: true };
  all[p.pattern.toLowerCase()] = key;
  for (const a of (p.alias || [])) { const aa = String(a).toLowerCase().trim(); if (aa && !all[aa]) all[aa] = key; }
  const cat = String(p.category || 'misc').toLowerCase();
  (pluginCategories[cat] = pluginCategories[cat] || []).push(p.pattern.toLowerCase());
}

module.exports = { all, table, desc: {}, getJSON, getBuffer, safeCalc, categories, sc, CMDS };
