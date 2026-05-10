# Self Memer

A self-hosted, multi-account automation script for the Dank Memer Discord bot. Manages multiple accounts from a single web interface, tracks balance history over time, and coordinates item transfers between accounts using a mothership system.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Getting your Discord token](#getting-your-discord-token)
- [Dashboard overview](#dashboard-overview)
- [How the bot works](#how-the-bot-works)
- [Security](#security)
- [License](#license)

---

## Features

**Multi-account management**
Run any number of accounts simultaneously. Each account gets its own bot process, balance tracker process, and dashboard tab. Accounts are fully isolated from one another.

**Live command control**
Toggle hunt, dig, search, beg, crime, higher/lower, post meme, and adventure on or off per account from the dashboard. Changes take effect immediately without restarting anything.

**Balance and net worth tracking**
A dedicated tracker process runs `pls bal` every 30 seconds and records wallet, bank, and net worth history. The dashboard displays live charts for each account.

**Mothership transfer system**
Designate one account as the mothership. Any other account can send its entire inventory and wallet to the mothership in one click. The transfer loop works through the inventory automatically, skipping non-tradeable and blacklisted items.

**Risk mode**
Search and crime commands support low, medium, and high risk settings, each mapped to a specific set of response choices. Configurable per account from the dashboard.

**Adventure automation**
Runs a chosen adventure type on a configurable cooldown. The bot plays through all interaction prompts automatically and adjusts the next cooldown based on how many interactions the run had. An additional 60-second buffer is added after each run.

**Activity log**
A live log of every bot action — commands sent, responses received, buttons clicked, warnings, and errors — with source tagging and filter controls.

**Hot reload**
Editing and saving connection settings in the dashboard restarts only the affected account's bot processes. Other accounts keep running.

---

## Architecture

```
start.sh
  |
  |-- manager.js          Spawns and supervises all bot processes.
  |     |                 Watches config.json for changes and hot-reloads
  |     |                 individual accounts without full restarts.
  |     |
  |     |-- main.js       One instance per account. Runs the command loops
  |     |                 (hunt, dig, search, etc.), handles Dank Memer
  |     |                 responses, and executes mothership transfers.
  |     |
  |     `-- bal_tracker.js  One instance per account. Sends pls bal every
  |                         30 seconds, clicks the Net Worth button, and
  |                         records history to balance_{id}.json.
  |
  `-- server.py           Flask server. Serves the dashboard frontend,
                          provides the REST API consumed by the UI, and
                          reads/writes config.json.

web/
  index.html              Single-page dashboard.
  styles.css              All styles, including dark mode and responsive
                          layouts for mobile and desktop.
  scripts.js              Dashboard logic: polling, chart rendering,
                          account switching, toggle handling.
```

Processes communicate via:
- **HTTP** — `main.js` and `bal_tracker.js` post log entries and account data to the Flask API
- **File-based interaction lock** — `main.js` writes a lock file while it holds the command mutex; `bal_tracker.js` polls this file before sending `pls bal` to avoid sending two commands to the same account at the same time
- **Transfer trigger files** — the dashboard writes a trigger file to request a transfer; `main.js` polls for this file and picks it up on the next cycle

---

## Requirements

- Node.js 18 or later
- Python 3.10 or later
- pip packages: `flask`
- A Discord account with a valid user token

---

## Installation

**Clone the repository**

```bash
git clone https://github.com/iamsoln/selfmemer.git
cd selfmemer
```

**Install Node dependencies**

```bash
npm install
npm install djs-selfbot-v13
```

**Install Python dependencies**

```bash
pip install flask
```

**Create your config file**

```bash
cp config.example.json config.json
```

Then open `config.json` and fill in your account details. See the [Configuration](#configuration) section for a full reference.

**Start the dashboard**

```bash
bash start.sh
```

Open `http://localhost:5000` in your browser. The dashboard will show your accounts and begin running the enabled commands immediately.

---

## Configuration

`config.json` is not tracked by version control because it contains your Discord token. Use `config.example.json` as the reference — it shows the full structure with placeholder values.

### Account fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier for this account. Used in file names and API paths. Example: `acc-1` |
| `name` | string | Display name shown in the dashboard tab |
| `token` | string | Discord user token |
| `channel_id` | string | ID of the channel where Dank Memer commands are sent |
| `bot_id` | string | Dank Memer's bot ID. Default: `270904126974590976` |
| `discord_uid` | string | Populated automatically on first run. Leave blank |
| `bal_tracker_enabled` | boolean | Whether to run the balance tracker for this account |
| `cooldown` | number | Seconds between hunt and dig commands |
| `search_cooldown` | number | Seconds between search commands |
| `beg_cooldown` | number | Seconds between beg commands |
| `crime_cooldown` | number | Seconds between crime commands |
| `hl_cooldown` | number | Seconds between higher/lower commands |
| `hl_wait_for` | number | Seconds to wait for a higher/lower response |
| `pm_cooldown` | number | Seconds between post meme commands |
| `wait_for_response` | number | Seconds to wait before timing out any command |
| `adv_cooldown` | number | Base adventure cooldown in seconds. Default: `1800` |
| `adv_type` | string | Which adventure to run. Must match the in-game name exactly |
| `search_risk` | string | Risk level for search choices: `low`, `medium`, or `high` |
| `crime_risk` | string | Risk level for crime choices: `low`, `medium`, or `high` |
| `commands_enabled` | object | Keys: `hunt`, `dig`, `search`, `beg`, `crime`, `hl`, `pm`, `adv`. Values: `true` or `false` |

### Root fields

| Field | Type | Description |
|---|---|---|
| `accounts` | array | List of account objects |
| `mothership_id` | string or null | The `id` of the account that receives transfers |

### Example

```json
{
    "accounts": [
        {
            "id": "acc-1",
            "name": "MyAccount",
            "token": "YOUR_TOKEN_HERE",
            "channel_id": "YOUR_CHANNEL_ID",
            "bot_id": "270904126974590976",
            "discord_uid": "",
            "bal_tracker_enabled": true,
            "cooldown": 20,
            "search_cooldown": 25,
            "beg_cooldown": 40,
            "crime_cooldown": 40,
            "hl_cooldown": 10,
            "hl_wait_for": 5,
            "pm_cooldown": 20,
            "wait_for_response": 10,
            "adv_cooldown": 1800,
            "adv_type": "Pepe Goes to Space",
            "search_risk": "low",
            "crime_risk": "low",
            "commands_enabled": {
                "hunt": true,
                "dig": true,
                "search": true,
                "beg": false,
                "crime": false,
                "hl": false,
                "pm": false,
                "adv": false
            }
        }
    ],
    "mothership_id": null
}
```

---

## Getting your Discord token

1. Open Discord in a web browser at `discord.com`. Do not use the desktop app.
2. Press `F12` to open the developer tools.
3. Go to the **Network** tab and set the filter to **Fetch/XHR**.
4. Send any message in any channel.
5. Click one of the requests that appears in the list. Open the **Headers** section and look for `Authorization` under **Request Headers**. That value is your token.

Your token gives complete access to your Discord account. Do not share it with anyone, do not paste it anywhere other than your local `config.json`, and do not commit `config.json` to version control.

---

## Dashboard overview

**Account tabs** — Switch between accounts. The active account's dot pulses green when its bot is online. The mothership account is highlighted in amber.

**Mothership card** — Shows whether the current account is the mothership or a support vessel. From here you can assign or transfer the mothership role.

**Transfer card** — Visible only on support vessel accounts. Sends the account's full inventory and wallet to the mothership. Progress is shown in a status bar below the buttons.

**Connection card** — Edit the account's token, channel, and bot ID. Saving restarts only that account's bot processes.

**Bot Status** — Shows whether the main bot and balance tracker are running. The balance tracker can be toggled on or off independently.

**Balance and Net Worth** — Live charts that update every 30 seconds. Shows wallet, bank, and total balance. A separate chart tracks net worth over time.

**Commands** — Toggle each command on or off. Changes apply on the next command cycle.

**Adventure** — Select the adventure type from a dropdown. The cooldown is calculated automatically based on run length and includes a 60-second safety buffer.

**Risk Mode** — Set search and crime to low, medium, or high risk. Each level maps to a different set of response choices.

**Activity Log** — Live feed of bot activity. Filter by source (main bot, balance tracker) or level (warnings only). Logs persist across tab switches for the current session.

**Cooldowns** — Edit all timing values directly. Changes are saved and applied immediately.

---

## How the bot works

Each account runs two Node.js processes: `main.js` and `bal_tracker.js`.

`main.js` runs the command loops. Each command (hunt, dig, search, etc.) has its own async loop that checks if the command is enabled, acquires an exclusive in-process mutex, sends the command, waits for Dank Memer's reply by matching the reply's message reference ID against the sent message ID, processes the response, and then sleeps for the configured cooldown before repeating.

The mutex ensures only one command is in-flight at a time within a single account. A file-based lock extends this guarantee across `bal_tracker.js`, which checks for the lock file before sending `pls bal`.

`bal_tracker.js` sends `pls bal` on a 30-second interval independently of the main command loops. It records each response to a local JSON file, which the Flask API reads to serve balance history to the dashboard.

Dank Memer responses are identified strictly by message reference ID — the reply must reference the exact message the bot sent. This prevents one account's bot from accidentally consuming a reply meant for another account or another process.

---

## Security

- `config.json` is in `.gitignore` and will not be committed.
- Balance history files (`balance_*.json`) are also excluded.
- Runtime state files (lock files, transfer triggers, transfer status) are excluded.
- No credentials are logged or transmitted anywhere other than to Discord directly.
- The Flask server binds to `0.0.0.0:5000` for local use. If you expose this port externally, add authentication.

---

## License

MIT License. See [LICENSE](LICENSE) for the full text.
