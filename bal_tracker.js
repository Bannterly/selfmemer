const { Client } = require('djs-selfbot-v13');
const fs   = require('fs');
const path = require('path');
const { postLog } = require('./logger');

// ── Account selection ──────────────────────────────────────
const accountArg = process.argv.find(a => a.startsWith('--account='));
const ACCOUNT_ID = accountArg ? accountArg.split('=')[1] : 'default';

const CONFIG_PATH  = path.join(__dirname, 'config.json');
const HISTORY_PATH = path.join(__dirname, `balance_${ACCOUNT_ID}.json`);

function loadAccountConfig() {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const account = (raw.accounts || []).find(a => a.id === ACCOUNT_ID);
    if (!account) throw new Error(`Account ${ACCOUNT_ID} not found`);
    return account;
}

const config     = loadAccountConfig();
const TOKEN      = config.token;
const CHANNEL_ID = String(config.channel_id);
const BOT_ID     = String(config.bot_id);

function log(level, msg) {
    console.log(`[BAL:${ACCOUNT_ID}] ${msg}`);
    postLog(`bal:${ACCOUNT_ID}`, level, msg);
}

// ── History ────────────────────────────────────────────────
let history = [];
try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); } catch { history = []; }

function saveHistory() {
    if (history.length > 2000) history = history.slice(-2000);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history));
}

// ── Text extractor ─────────────────────────────────────────
function extractText(components) {
    if (!Array.isArray(components)) return '';
    let out = '';
    for (const c of components) {
        for (const key of ['content', 'description', 'label', 'value', 'placeholder']) {
            if (typeof c[key] === 'string') out += c[key] + '\n';
        }
        if (Array.isArray(c.components)) out += extractText(c.components);
        if (c.accessory)                  out += extractText([c.accessory]);
        if (Array.isArray(c.fields))
            for (const f of c.fields) out += (f.name || '') + '\n' + (f.value || '') + '\n';
    }
    return out;
}

// ── Balance parser ─────────────────────────────────────────
function extractAllContent(components) {
    const texts = [];
    if (!Array.isArray(components)) return texts;
    for (const c of components) {
        if (typeof c.content === 'string') texts.push(c.content);
        if (Array.isArray(c.components)) texts.push(...extractAllContent(c.components));
        if (c.accessory) texts.push(...extractAllContent([c.accessory]));
    }
    return texts;
}

function parseBalance(rawMsg) {
    // Collect all text chunks from components (type-10 text blocks)
    const chunks = extractAllContent(rawMsg.components || []);

    // Also include embed descriptions/fields as fallback
    for (const embed of (rawMsg.embeds || [])) {
        chunks.push(embed.description || '');
        for (const f of (embed.fields || [])) chunks.push(f.value || '');
    }
    if (rawMsg.content) chunks.push(rawMsg.content);

    let wallet = null, bank = null, bankMax = null;

    for (const chunk of chunks) {
        for (const line of chunk.split('\n').map(l => l.trim()).filter(Boolean)) {
            // Wallet: line contains <:Coin:...> or ⏣ followed by a number
            if (wallet === null) {
                const wm = line.match(/(?:<:\w+:\d+>|⏣|:coin:)\s*([\d,]+)/) ;
                // Make sure this is the Coin line, not a Bank/other emoji line
                // by checking the line does NOT contain a slash (bank pattern)
                if (wm && !line.includes('/') && /coin/i.test(line)) {
                    wallet = parseInt(wm[1].replace(/,/g, ''), 10);
                }
            }
            // Bank: <:Bank:...> X / Y  or plain  X / Y
            if (bank === null) {
                const bm = line.match(/([\d,]+)\s*\/\s*([\d,]+)/);
                if (bm && /bank/i.test(line)) {
                    bank    = parseInt(bm[1].replace(/,/g, ''), 10);
                    bankMax = parseInt(bm[2].replace(/,/g, ''), 10);
                }
            }
        }
    }

    // Fallback: if bank line didn't have "bank" keyword, grab first X/Y
    if (bank === null) {
        for (const chunk of chunks) {
            for (const line of chunk.split('\n').map(l => l.trim()).filter(Boolean)) {
                const bm = line.match(/([\d,]+)\s*\/\s*([\d,]+)/);
                if (bm) {
                    bank    = parseInt(bm[1].replace(/,/g, ''), 10);
                    bankMax = parseInt(bm[2].replace(/,/g, ''), 10);
                    break;
                }
            }
            if (bank !== null) break;
        }
    }

    return { wallet, bank, bankMax };
}

// ── Net Worth helpers ───────────────────────────────────────
function findNetWorthCustomId(components) {
    if (!Array.isArray(components)) return null;
    for (const c of components) {
        if (c.label === 'Net Worth' && c.custom_id) return c.custom_id;
        if (c.accessory) {
            const r = findNetWorthCustomId([c.accessory]);
            if (r) return r;
        }
        if (Array.isArray(c.components)) {
            const r = findNetWorthCustomId(c.components);
            if (r) return r;
        }
    }
    return null;
}

function parseNetWorth(rawMsg) {
    const chunks = extractAllContent(rawMsg.components || []);
    for (const embed of (rawMsg.embeds || [])) {
        chunks.push(embed.description || '');
        for (const f of (embed.fields || [])) chunks.push(f.value || '');
    }
    if (rawMsg.content) chunks.push(rawMsg.content);

    for (const chunk of chunks) {
        for (const line of chunk.split('\n').map(l => l.trim()).filter(Boolean)) {
            if (/bankrob/i.test(line)) {
                const m = line.match(/<:\w+:\d+>\s*([\d,]+)/);
                if (m) return parseInt(m[1].replace(/,/g, ''), 10);
            }
        }
    }
    return null;
}

// ── Client ─────────────────────────────────────────────────
const client = new Client({ checkUpdate: false });
let waitingForBal    = false;
let sentBalMsgId     = null; // ID of the 'pls bal' message we sent
let netWorthPending  = null; // { msgId, resolve, timer }

async function resolveChannel(client, channelId) {
    log('info', 'Waiting for guild sync...');
    await new Promise(r => setTimeout(r, 5000));

    const cached = client.channels.cache.get(channelId);
    if (cached) return cached;

    for (const guild of client.guilds.cache.values()) {
        const ch = guild.channels.cache.get(channelId);
        if (ch) return ch;
    }

    // Fetch full channel list for each guild via REST
    const guilds = [...client.guilds.cache.values()];
    log('info', `Searching ${guilds.length} guild(s) for channel ${channelId}...`);
    for (const guild of guilds) {
        try {
            const channels = await guild.channels.fetch();
            const ch = channels.get(channelId);
            if (ch) { log('info', `Found "${ch.name}" in guild "${guild.name}"`); return ch; }
        } catch (e) {
            log('warn', `guild.channels.fetch() failed for "${guild.name}": ${e.message}`);
        }
    }

    // Last resort: direct REST fetch
    try {
        return await client.channels.fetch(channelId, { force: true });
    } catch (e) {
        throw new Error(`Channel ${channelId} not found in any of ${guilds.length} guild(s). Original error: ${e.message}`);
    }
}

client.on('ready', async () => {
    log('info', `Logged in as ${client.user.tag}`);
    let channel;
    try {
        channel = await resolveChannel(client, CHANNEL_ID);
    } catch (err) {
        log('error', `Channel fetch failed: ${err.message} — verify channel_id in Connection settings`);
        return;
    }

    const LOCK_FILE = path.join(__dirname, `interaction_lock_${ACCOUNT_ID}.lock`);

    async function waitForMainLock() {
        let warned = false;
        while (fs.existsSync(LOCK_FILE)) {
            if (!warned) { log('info', '[LOCK] main.js busy — delaying pls bal'); warned = true; }
            await new Promise(r => setTimeout(r, 500));
        }
    }

    async function checkBalance() {
        if (waitingForBal) return;
        waitingForBal = true;
        await waitForMainLock();
        try {
            const sent = await channel.send('pls bal');
            sentBalMsgId = sent.id;
            log('info', 'Sent: pls bal');
        } catch (err) {
            log('error', `Send failed: ${err.message}`);
            waitingForBal = false;
            return;
        }
        setTimeout(() => {
            if (waitingForBal) {
                log('warn', 'Timeout — no response to pls bal');
                waitingForBal = false;
                sentBalMsgId  = null;
            }
        }, 15000);
    }

    setTimeout(checkBalance, 8000);
    setInterval(checkBalance, 30000);
});

client.on('raw', packet => {
    // ── Net Worth: listen for the edited message ────────────
    if (packet.t === 'MESSAGE_UPDATE') {
        if (!netWorthPending) return;
        const msg = packet.d;
        if (msg.id !== netWorthPending.msgId) return;
        const allText = extractAllContent(msg.components || []).join('\n');
        if (!/bankrob/i.test(allText)) return;  // not the net-worth view yet
        clearTimeout(netWorthPending.timer);
        const resolve = netWorthPending.resolve;
        netWorthPending = null;
        resolve(msg);
        return;
    }

    // ── Balance: listen for the bot reply ───────────────────
    if (packet.t !== 'MESSAGE_CREATE') return;
    if (!waitingForBal) return;
    const msg = packet.d;
    if (msg.channel_id !== CHANNEL_ID) return;
    if (msg.author?.id !== BOT_ID) return;
    // Only accept replies that reference the exact 'pls bal' we sent.
    // If sentBalMsgId is still null (send hasn't returned yet), reject everything.
    if (!sentBalMsgId || msg.message_reference?.message_id !== sentBalMsgId) return;
    waitingForBal = false;
    sentBalMsgId  = null;

    const { wallet, bank, bankMax } = parseBalance(msg);
    if (wallet === null) {
        log('warn', 'Balance parse failed — no numbers found in response');
        return;
    }

    // ── Net Worth: click button then await MESSAGE_UPDATE ───
    (async () => {
        let netWorth = null;
        const customId = findNetWorthCustomId(msg.components || []);
        if (customId) {
            try {
                const channel = client.channels.cache.get(CHANNEL_ID);
                const message = await channel.messages.fetch(msg.id);

                const nwPromise = new Promise(resolve => {
                    const timer = setTimeout(() => {
                        if (netWorthPending?.msgId === msg.id) netWorthPending = null;
                        resolve(null);
                    }, 8000);
                    netWorthPending = { msgId: msg.id, resolve, timer };
                });

                await message.clickButton(customId);
                log('info', 'Clicked Net Worth button');

                const updatedMsg = await nwPromise;
                if (updatedMsg) {
                    netWorth = parseNetWorth(updatedMsg);
                    if (netWorth !== null) log('info', `Net Worth: ⏣${netWorth.toLocaleString()}`);
                    else log('warn', 'Net worth parse failed — BankrobIcon not found');
                } else {
                    log('warn', 'Net worth timeout — no MESSAGE_UPDATE received');
                }
            } catch (e) {
                log('warn', `Net Worth skipped: ${e.message}`);
                if (netWorthPending?.msgId === msg.id) netWorthPending = null;
            }
        } else {
            log('warn', 'Net Worth button not found in balance message');
        }

        // If the file was externally cleared (reset button), wipe in-memory history
        // before pushing the new entry so it becomes entry #1 rather than being lost
        try {
            const onDisk = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
            if (!Array.isArray(onDisk) || onDisk.length === 0) history = [];
        } catch {}
        const entry = { ts: Date.now(), wallet, bank: bank ?? 0, bankMax: bankMax ?? 0, netWorth };
        history.push(entry);
        saveHistory();
        log('info', `Balance — wallet=⏣${wallet.toLocaleString()}  bank=⏣${(bank ?? 0).toLocaleString()}/${(bankMax ?? 0).toLocaleString()}${netWorth !== null ? `  netWorth=⏣${netWorth.toLocaleString()}` : ''}`);
    })().catch(e => log('warn', `Balance handler error: ${e.message}`));
});

client.login(TOKEN);
