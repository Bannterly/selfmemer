const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

// accountId -> { main, bal, token, channelId, botId, balEnabled }
const procs = new Map();

function loadAccounts() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).accounts || [];
    } catch { return []; }
}

function spawnBal(account) {
    const { id } = account;
    const existing = procs.get(id);
    if (!existing) return;
    if (existing.bal) {
        try { existing.bal.kill('SIGTERM'); } catch {}
        existing.bal = null;
    }
    const balProc = spawn('node', ['bal_tracker.js', `--account=${id}`], { stdio: 'inherit' });
    balProc.on('exit', code => {
        const p = procs.get(id);
        if (!p) return;
        if (code !== null && code !== 0 && p.balEnabled) {
            console.log(`[MANAGER] bal_tracker.js[${id}] exited with code ${code} — restarting in 5s`);
            setTimeout(() => {
                const p2 = procs.get(id);
                if (p2 && p2.balEnabled) spawnBal(account);
            }, 5000);
        }
    });
    existing.bal = balProc;
    existing.balEnabled = true;
    console.log(`[MANAGER] Started bal_tracker for account: ${id}`);
}

function killBal(id) {
    const existing = procs.get(id);
    if (!existing) return;
    if (existing.bal) {
        try { existing.bal.kill('SIGTERM'); } catch {}
        existing.bal = null;
    }
    existing.balEnabled = false;
    console.log(`[MANAGER] Stopped bal_tracker for account: ${id}`);
}

function spawnAccount(account) {
    const { id } = account;
    killAccount(id);
    console.log(`[MANAGER] Starting bots for account: ${id} (${account.name})`);

    const balEnabled = account.bal_tracker_enabled !== false;

    const mainProc = spawn('node', ['main.js', `--account=${id}`], { stdio: 'inherit' });
    mainProc.on('exit', code => {
        if (code !== null && code !== 0) {
            console.log(`[MANAGER] main.js[${id}] exited with code ${code} — restarting in 5s`);
            setTimeout(() => { if (procs.has(id)) spawnAccount(account); }, 5000);
        }
    });

    procs.set(id, {
        main: mainProc, bal: null,
        token: account.token,
        channelId: String(account.channel_id),
        botId:     String(account.bot_id),
        balEnabled: false,
    });

    if (balEnabled) spawnBal(account);
}

function killAccount(id) {
    if (!procs.has(id)) return;
    const { main, bal } = procs.get(id);
    try { main.kill('SIGTERM'); } catch {}
    try { if (bal) bal.kill('SIGTERM'); } catch {}
    procs.delete(id);
    console.log(`[MANAGER] Stopped bots for account: ${id}`);
}

function sync() {
    const accounts  = loadAccounts();
    const activeIds = new Set(accounts.map(a => a.id));

    for (const id of procs.keys()) {
        if (!activeIds.has(id)) killAccount(id);
    }

    for (const account of accounts) {
        const existing = procs.get(account.id);
        if (!existing) {
            spawnAccount(account);
        } else {
            const connectionChanged =
                existing.token     !== account.token ||
                existing.channelId !== String(account.channel_id) ||
                existing.botId     !== String(account.bot_id);
            if (connectionChanged) {
                console.log(`[MANAGER] Connection changed for ${account.id} — restarting`);
                spawnAccount(account);
            } else {
                const balEnabled = account.bal_tracker_enabled !== false;
                if (balEnabled && !existing.balEnabled) {
                    console.log(`[MANAGER] bal_tracker enabled for ${account.id} — starting`);
                    spawnBal(account);
                } else if (!balEnabled && existing.balEnabled) {
                    console.log(`[MANAGER] bal_tracker disabled for ${account.id} — stopping`);
                    killBal(account.id);
                }
            }
        }
    }
}

sync();

let lastRaw = '';
setInterval(() => {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        if (raw !== lastRaw) { lastRaw = raw; sync(); }
    } catch {}
}, 2000);

function shutdown() {
    for (const id of [...procs.keys()]) killAccount(id);
    process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
