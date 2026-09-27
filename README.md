# evil⁶⁶⁶MD — Web Pair (Tele × WA × Web)

One WhatsApp session, pairable and controllable from **Web + Telegram**.

## Deploy on Render
1. New → Web Service → connect this repo
2. Build: `npm install` · Start: `npm start` · Env: Node
3. Environment variables:
   - `OWNER_NUMBER` — your WhatsApp number, digits only (e.g. `22873272569`)
   - `TG_TOKEN` — *(optional)* a Telegram **bot token for THIS deployment only**
   - `ANTHROPIC_API_KEY` — *(optional)* enables the `.ai` command + auto chatbot

## ⚠️ One token, one bot
Telegram allows only ONE running instance per bot token. If your panel bot already uses
@Gojo_saturo_evil_bot, create a **second bot via @BotFather** for this deployment — otherwise
they'll fight over updates (409 conflicts).

## Pair
- Web: open the Render URL, enter the number, type the code on the phone.
- Telegram: `/pair <number>` in the bot chat.
- Commands on WhatsApp: `.menu` `.ping` `.ai <msg>` `.chatbot on/off` `.waifu` `.girldp` `.boydp`
