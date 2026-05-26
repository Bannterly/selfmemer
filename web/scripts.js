/* ── Theme ─────────────────────────────────────────── */
const root        = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeIcon   = document.getElementById("theme-icon");
let balChart  = null;
let nwChart   = null;
let fishChart = null;
let ovBalPie  = null;
let ovNwPie   = null;

function applyTheme(t) {
  root.setAttribute("data-theme", t);
  themeIcon.innerHTML = t === "dark" ? `<use href="#icon-sun"/>` : `<use href="#icon-moon"/>`;
  localStorage.setItem("db-theme", t);
  if (balChart) updateChartTheme();
  updateFishChartTheme();
}
themeToggle.addEventListener("click", () =>
  applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark")
);
(function () {
  const saved = localStorage.getItem("db-theme");
  const sys   = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(saved || sys);
})();

/* ── Toast ─────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = "ok") {
  const el = document.getElementById("toast");
  document.getElementById("toast-msg").textContent = msg;
  document.getElementById("toast-icon").innerHTML = type === "err"
    ? `<use href="#icon-alert"/>` : `<use href="#icon-check"/>`;
  el.className = `toast show${type === "err" ? " err" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

/* ── Live badge ─────────────────────────────────────── */
const liveBadge = document.getElementById("live-badge");
const liveTxt   = liveBadge.querySelector("span:not(.live-dot)");
function setBadge(state) {
  liveBadge.className = "live-pill" + (state === "saving" ? " saving" : "");
  liveTxt.textContent  = state === "saving" ? "Saving…" : "Live";
}

/* ── Formatters ─────────────────────────────────────── */
function fmtCoins(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n >= 1e9) return "⏣ " + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "⏣ " + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "⏣ " + (n / 1e3).toFixed(1) + "K";
  return "⏣ " + n.toLocaleString();
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtTimeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60);
  return m < 60 ? m + "m ago" : Math.floor(m / 60) + "h ago";
}
function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* ── State ──────────────────────────────────────────── */
let accounts     = [];
let activeId     = null;
let mothershipId  = null;   // ID of the mothership account (or null)
let overviewActive = false;

// Per-account transient state
const acctState = {}; // id -> { logSince, logEntries, logFilter, logAutoScroll, logCleared, clearedBefore }
function getAcctState(id) {
  if (!acctState[id]) {
    acctState[id] = {
      logSince: 0, logEntries: [], logFilter: "all",
      logAutoScroll: true, logCleared: false, clearedBefore: 0,
      cmdEnabled: { hunt:true, dig:true, search:true, beg:true, crime:true, hl:true, pm:true, adv:false, daily:false, work:false, deposit:false, trivia:false, stream:false, pet:false },
      searchRisk: "medium", crimeRisk: "medium",
    };
  }
  return acctState[id];
}

/* ── Polling handles ────────────────────────────────── */
let _balInterval      = null;
let _logInterval      = null;
let _statusInterval   = null;
let _tabDotInterval   = null;
let _transferInterval = null;
let _fishStatsInterval = null;
let _ovInterval       = null;

function clearPolls() {
  clearInterval(_balInterval);
  clearInterval(_logInterval);
  clearInterval(_statusInterval);
  clearInterval(_transferInterval);
  clearInterval(_fishStatsInterval);
  clearInterval(_ovInterval);
  _transferInterval  = null;
  _fishStatsInterval = null;
  _ovInterval        = null;
  clearSniperPolls();
}

/* ── Balance chart ──────────────────────────────────── */
function getChartColors() {
  const dark = root.getAttribute("data-theme") === "dark";
  return {
    walletLine: dark ? "rgba(250,250,250,0.9)"  : "rgba(37,99,235,0.9)",
    walletFill: dark ? "rgba(250,250,250,0.06)" : "rgba(37,99,235,0.07)",
    bankLine:   dark ? "rgba(251,191,36,0.85)"  : "rgba(234,88,12,0.85)",
    bankFill:   dark ? "rgba(251,191,36,0.04)"  : "rgba(234,88,12,0.04)",
    grid: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    tick: dark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.30)",
  };
}
function buildChart(labels, walletData, bankData) {
  const ctx = document.getElementById("balance-chart").getContext("2d");
  const { walletLine, walletFill, bankLine, bankFill, grid, tick } = getChartColors();
  if (balChart) balChart.destroy();
  const dark = root.getAttribute("data-theme") === "dark";
  const pts = walletData.length <= 10 ? 3 : 0;
  balChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [
      {
        label: "Wallet", data: walletData,
        borderColor: walletLine, backgroundColor: walletFill,
        borderWidth: 2, tension: 0.4, fill: true,
        pointRadius: pts, pointHoverRadius: 4, pointBackgroundColor: walletLine,
      },
      {
        label: "Bank", data: bankData,
        borderColor: bankLine, backgroundColor: bankFill,
        borderWidth: 2, tension: 0.4, fill: false,
        borderDash: [5, 3],
        pointRadius: pts, pointHoverRadius: 4, pointBackgroundColor: bankLine,
      },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)",
            font: { size: 11 }, boxWidth: 14, padding: 14,
            usePointStyle: true, pointStyle: "line",
          },
        },
        tooltip: {
          backgroundColor: dark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)",
          borderColor:     dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
          borderWidth: 1,
          titleColor: dark ? "#fafafa" : "#09090b",
          bodyColor:  dark ? "#a1a1aa" : "#52525b",
          titleFont: { size: 11, weight: "700" }, bodyFont: { size: 11 }, padding: 12,
          callbacks: {
            label: item => {
              const val  = item.parsed.y;
              const idx  = item.dataIndex;
              const prev = idx > 0 ? item.dataset.data[idx - 1] : null;
              const name = item.dataset.label;
              let line = `${name}: ${fmtCoins(val)}`;
              if (prev !== null) {
                const diff = val - prev;
                const sign = diff >= 0 ? "+" : "−";
                const abs  = Math.abs(diff);
                line += `  (${sign}${fmtCoins(abs).replace("⏣ ", "⏣")})`;
              }
              return line;
            },
            afterBody: items => {
              if (items.length < 2) return [];
              const w = items[0].parsed.y;
              const b = items[1].parsed.y;
              return [`Total: ${fmtCoins(w + b)}`];
            },
          },
        },
      },
      scales: {
        x: { grid: { color: grid, drawBorder: false }, ticks: { color: tick, font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0 }, border: { display: false } },
        y: { grid: { color: grid, drawBorder: false }, ticks: { color: tick, font: { size: 10 }, maxTicksLimit: 5, callback: v => fmtCoins(v) }, border: { display: false } },
      },
    },
  });
}
function updateChartTheme() {
  const { walletLine, walletFill, bankLine, bankFill, grid, tick } = getChartColors();
  const dark = root.getAttribute("data-theme") === "dark";
  const tooltipStyle = {
    backgroundColor: dark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)",
    borderColor:     dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    titleColor:      dark ? "#fafafa" : "#09090b",
    bodyColor:       dark ? "#a1a1aa" : "#52525b",
  };
  if (balChart) {
    balChart.data.datasets[0].borderColor     = walletLine;
    balChart.data.datasets[0].backgroundColor = walletFill;
    balChart.data.datasets[1].borderColor     = bankLine;
    balChart.data.datasets[1].backgroundColor = bankFill;
    Object.assign(balChart.options.plugins.tooltip, tooltipStyle);
    balChart.options.plugins.legend.labels.color = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
    balChart.options.scales.x.grid.color  = balChart.options.scales.y.grid.color  = grid;
    balChart.options.scales.x.ticks.color = balChart.options.scales.y.ticks.color = tick;
    balChart.update("none");
  }
  if (nwChart) {
    nwChart.data.datasets[0].borderColor     = dark ? "rgba(167,139,250,0.9)"  : "rgba(124,58,237,0.9)";
    nwChart.data.datasets[0].backgroundColor = dark ? "rgba(167,139,250,0.07)" : "rgba(124,58,237,0.07)";
    Object.assign(nwChart.options.plugins.tooltip, tooltipStyle);
    nwChart.options.scales.x.grid.color  = nwChart.options.scales.y.grid.color  = grid;
    nwChart.options.scales.x.ticks.color = nwChart.options.scales.y.ticks.color = tick;
    nwChart.update("none");
  }
}

/* ── Net Worth chart ─────────────────────────────────── */
function buildNwChart(labels, nwData) {
  const ctx = document.getElementById("networth-chart").getContext("2d");
  const { grid, tick } = getChartColors();
  const dark = root.getAttribute("data-theme") === "dark";
  const nwLine = dark ? "rgba(167,139,250,0.9)"  : "rgba(124,58,237,0.9)";
  const nwFill = dark ? "rgba(167,139,250,0.07)" : "rgba(124,58,237,0.07)";
  if (nwChart) nwChart.destroy();
  nwChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{
      label: "Net Worth", data: nwData,
      borderColor: nwLine, backgroundColor: nwFill,
      borderWidth: 2, tension: 0.4, fill: true,
      pointRadius: nwData.length <= 10 ? 3 : 0,
      pointHoverRadius: 4, pointBackgroundColor: nwLine,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: dark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)",
          borderColor:     dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
          borderWidth: 1,
          titleColor: dark ? "#fafafa" : "#09090b",
          bodyColor:  dark ? "#a1a1aa" : "#52525b",
          titleFont: { size: 11, weight: "700" }, bodyFont: { size: 11 }, padding: 12,
          callbacks: {
            label: item => {
              const val  = item.parsed.y;
              const idx  = item.dataIndex;
              const prev = idx > 0 ? item.dataset.data[idx - 1] : null;
              let line = `Net Worth: ${fmtCoins(val)}`;
              if (prev !== null) {
                const diff = val - prev;
                const sign = diff >= 0 ? "+" : "−";
                line += `  (${sign}${fmtCoins(Math.abs(diff)).replace("⏣ ", "⏣")})`;
              }
              return line;
            },
          },
        },
      },
      scales: {
        x: { grid: { color: grid, drawBorder: false }, ticks: { color: tick, font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0 }, border: { display: false } },
        y: { grid: { color: grid, drawBorder: false }, ticks: { color: tick, font: { size: 10 }, maxTicksLimit: 5, callback: v => fmtCoins(v) }, border: { display: false } },
      },
    },
  });
}

/* ── Fetch balance for active account ───────────────── */
async function fetchBalance() {
  if (!activeId) return;
  try {
    const res  = await fetch(`/api/accounts/${activeId}/balance`);
    if (!res.ok) return;
    const data = await res.json();

    // ── Wallet / Bank chart ──
    if (!Array.isArray(data) || data.length === 0) {
      document.getElementById("chart-empty").classList.remove("hidden");
      document.getElementById("stat-wallet").textContent = "—";
      document.getElementById("stat-bank").textContent   = "—";
      document.getElementById("stat-total").textContent  = "—";
      document.getElementById("stat-time").textContent   = "—";
      if (balChart) { balChart.destroy(); balChart = null; }
    } else {
      document.getElementById("chart-empty").classList.add("hidden");
      const last = data[data.length - 1];
      document.getElementById("stat-wallet").textContent = fmtCoins(last.wallet ?? 0);
      document.getElementById("stat-bank").textContent   = fmtCoins(last.bank   ?? 0);
      document.getElementById("stat-total").textContent  = fmtCoins((last.wallet ?? 0) + (last.bank ?? 0));
      document.getElementById("stat-time").textContent   = fmtTimeAgo(last.ts);
      buildChart(data.map(e => fmtTime(e.ts)), data.map(e => e.wallet ?? 0), data.map(e => e.bank ?? 0));
    }

    // ── Net Worth chart ──
    const nwData = Array.isArray(data) ? data.filter(e => e.netWorth != null) : [];
    if (nwData.length === 0) {
      document.getElementById("chart-nw-empty").classList.remove("hidden");
      document.getElementById("stat-networth").textContent = "—";
      document.getElementById("stat-nw-time").textContent  = "—";
      if (nwChart) { nwChart.destroy(); nwChart = null; }
    } else {
      document.getElementById("chart-nw-empty").classList.add("hidden");
      const lastNw = nwData[nwData.length - 1];
      document.getElementById("stat-networth").textContent = fmtCoins(lastNw.netWorth);
      document.getElementById("stat-nw-time").textContent  = fmtTimeAgo(lastNw.ts);
      buildNwChart(nwData.map(e => fmtTime(e.ts)), nwData.map(e => e.netWorth));
    }
  } catch {}
}

/* ── Interaction Lock toggle ────────────────────────── */
function updateLockToggleUI(locked) {
  const toggle = document.getElementById("lock-toggle");
  if (toggle) toggle.checked = locked;
}

document.getElementById("lock-toggle").addEventListener("change", function () {
  const locked = this.checked;
  updateLockToggleUI(locked);
  pushAccountConfig({ disable_interaction_lock: !locked });
  showToast(locked ? "Interaction Lock enabled" : "Interaction Lock disabled (parallel mode)");
});

/* ── Limit Flags toggle ─────────────────────────────── */
function updateLimitFlagsUI(enabled) {
  const toggle  = document.getElementById("limit-flags-toggle");
  const card    = document.getElementById("status-stealth");
  const section = document.getElementById("stealth-section");
  if (toggle)  toggle.checked = enabled;
  if (card)    card.classList.toggle("stealth-on", enabled);
  if (section) section.style.display = enabled ? "" : "none";
}

document.getElementById("limit-flags-toggle").addEventListener("change", function () {
  const enabled = this.checked;
  updateLimitFlagsUI(enabled);
  pushAccountConfig({ limit_flags: enabled });
  showToast(enabled ? "Limit Flags ON — stealth mode active" : "Limit Flags disabled");
});

/* ── Cycle uptime / downtime (debounced) ──────────────── */
let _cycleTimer;
function _saveCycle() {
  clearTimeout(_cycleTimer);
  _cycleTimer = setTimeout(() => {
    const up   = Math.max(0, parseInt(document.getElementById("stealth-uptime")?.value, 10) || 0);
    const down = Math.max(0, parseInt(document.getElementById("stealth-downtime")?.value, 10) || 0);
    pushAccountConfig({ cycle_uptime_mins: up, cycle_downtime_mins: down });
    if (up && down) {
      showToast(`Cycle set — active ${up}min / rest ${down}min`);
      const badge = document.getElementById("stealth-cycle-status");
      if (badge) badge.style.display = "";
    } else {
      showToast("Cycle disabled");
      const badge = document.getElementById("stealth-cycle-status");
      if (badge) badge.style.display = "none";
    }
  }, 700);
}
document.getElementById("stealth-uptime")?.addEventListener("input", _saveCycle);
document.getElementById("stealth-downtime")?.addEventListener("input", _saveCycle);

/* ── Stealth mode selector ───────────────────────────── */
const SMODE_DETAILS = {
  strict:   { typing: "Always — 700–1400ms",  variance: "35% (uniform spread)", speed: "Slowest" },
  moderate: { typing: "80% — 300–600ms",      variance: "20% (biased low)",     speed: "Moderate" },
  casual:   { typing: "40% — 100–300ms",      variance: "10% (heavily biased)", speed: "Fast" },
  fast:     { typing: "Off",                  variance: "None",                 speed: "Maximum" },
};

function applySteathMode(mode) {
  document.querySelectorAll(".smode-btn").forEach(b => {
    b.classList.toggle("smode-active", b.dataset.mode === mode);
  });
  const d = SMODE_DETAILS[mode];
  const el = document.getElementById("smode-detail");
  if (el && d) {
    el.innerHTML =
      `<span class="smode-pill">Typing ${d.typing}</span>` +
      `<span class="smode-pill">CD variance ${d.variance}</span>` +
      `<span class="smode-pill smode-speed">Speed ${d.speed}</span>`;
  }
}

document.querySelectorAll(".smode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    applySteathMode(mode);
    pushAccountConfig({ stealth_mode: mode });
    showToast(`Stealth mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
  });
});

/* ── Balance Tracker toggle ─────────────────────────── */
async function setBalTracker(enabled) {
  if (!activeId) return;
  try {
    await fetch(`/api/accounts/${activeId}/bal-tracker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const acc = accounts.find(a => a.id === activeId);
    if (acc) acc.bal_tracker_enabled = enabled;
    updateBalToggleUI(enabled);
    showToast(enabled ? "Balance Tracker enabled" : "Balance Tracker disabled");
  } catch (e) {
    showToast("Failed: " + e.message, "err");
  }
}

function updateBalToggleUI(enabled) {
  const toggle = document.getElementById("bal-tracker-toggle");
  const card   = document.getElementById("status-bal");
  if (toggle) toggle.checked = enabled;
  if (card) card.classList.toggle("disabled", !enabled);
}

document.getElementById("bal-tracker-toggle").addEventListener("change", function () {
  setBalTracker(this.checked);
});

/* ── Status ─────────────────────────────────────────── */
async function fetchStatus() {
  try {
    const res  = await fetch("/api/status");
    if (!res.ok) return;
    const data = await res.json();

    const acc = accounts.find(a => a.id === activeId);
    const balEnabled = !acc || acc.bal_tracker_enabled !== false;

    function applyStatus(cardId, badgeId, online) {
      const card  = document.getElementById(cardId);
      const badge = document.getElementById(badgeId);
      if (!card || !badge) return;
      card.className    = "status-card" + (online ? " online" : " offline");
      badge.textContent = online ? "Online" : "Offline";
    }
    applyStatus("status-main", "status-main-badge", data[`main:${activeId}`] === "online");
    if (balEnabled) {
      applyStatus("status-bal", "status-bal-badge", data[`bal:${activeId}`] === "online");
    } else {
      const card  = document.getElementById("status-bal");
      const badge = document.getElementById("status-bal-badge");
      if (card)  card.className    = "status-card disabled";
      if (badge) badge.textContent = "Disabled";
    }

    // Update tab dots
    for (const acc of accounts) {
      const dot = document.querySelector(`.acct-tab[data-id="${acc.id}"] .acct-dot`);
      if (!dot) continue;
      const online = data[`main:${acc.id}`] === "online";
      dot.className = "acct-dot" + (online ? " online" : "");
    }
  } catch {}
}

/* ── Activity Log ───────────────────────────────────── */
const logFeed  = document.getElementById("log-feed");
const logEmpty = document.getElementById("log-empty");

function renderLogs() {
  if (!activeId) return;
  const st      = getAcctState(activeId);
  const visible = st.logEntries.filter(e => matchesFilter(e, st.logFilter, activeId));
  const atBottom = logFeed.scrollHeight - logFeed.scrollTop - logFeed.clientHeight < 60;

  logFeed.querySelectorAll(".log-row").forEach(el => el.remove());
  logEmpty.style.display = visible.length === 0 ? "flex" : "none";

  const frag = document.createDocumentFragment();
  for (const entry of visible.slice(-100)) {
    const row = document.createElement("div");
    row.className = "log-row log-" + (entry.level || "info");
    row.innerHTML =
      `<span class="log-time">${fmtLogTime(entry.ts)}</span>` +
      `<span class="log-src log-src-${entry.source.split(":")[0]}">${srcLabel(entry.source)}</span>` +
      `<span class="log-msg">${escHtml(entry.msg)}</span>`;
    frag.appendChild(row);
  }
  logFeed.appendChild(frag);
  if (atBottom || st.logAutoScroll) logFeed.scrollTop = logFeed.scrollHeight;
}

function matchesFilter(entry, filter, id) {
  const src = entry.source || "";
  if (filter === "all")  return src.endsWith(`:${id}`);
  if (filter === "main") return src === `main:${id}`;
  if (filter === "bal")  return src === `bal:${id}`;
  if (filter === "warn") return src.endsWith(`:${id}`) && (entry.level === "warn" || entry.level === "error");
  return true;
}

function fmtLogTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function srcLabel(source) {
  const type = source.split(":")[0];
  if (type === "main") return "BOT";
  if (type === "bal")  return "BAL";
  return type.toUpperCase().slice(0, 4);
}

async function fetchLogs() {
  if (!activeId) return;
  const st = getAcctState(activeId);
  try {
    const res  = await fetch(`/api/logs?account=${activeId}&since=${st.logSince}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return;

    const newEntries = st.logCleared ? data.filter(e => e.ts > st.clearedBefore) : data;
    if (newEntries.length === 0) return;

    st.logSince = Math.max(...newEntries.map(e => e.ts));
    st.logEntries.push(...newEntries);
    if (st.logEntries.length > 300) st.logEntries = st.logEntries.slice(-300);
    renderLogs();
  } catch {}
}

/* ── Mothership API ─────────────────────────────────── */
async function loadMothership() {
  try {
    const res  = await fetch("/api/mothership");
    if (!res.ok) return;
    const data = await res.json();
    mothershipId = data.mothership_id || null;
    renderTabs();
    updateMothershipUI();
  } catch {}
}

async function setMothership(accountId) {
  try {
    const res  = await fetch("/api/mothership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Server error");
    mothershipId = accountId;
    renderTabs();
    updateMothershipUI();
    showToast("Mothership assigned!");
  } catch (e) {
    showToast("Failed: " + e.message, "err");
  }
}

function updateMothershipUI() {
  const loadingView = document.getElementById("ms-loading-view");
  const noneView    = document.getElementById("ms-none-view");
  const selfView    = document.getElementById("ms-self-view");
  const otherView   = document.getElementById("ms-other-view");
  const transferSec = document.getElementById("transfer-section");

  if (loadingView) loadingView.style.display = "none";

  const isMothership = activeId && mothershipId === activeId;
  const hasOtherMothership = mothershipId && !isMothership;

  if (noneView)    noneView.style.display    = (!mothershipId)         ? ""     : "none";
  if (selfView)    selfView.style.display    = isMothership            ? ""     : "none";
  if (otherView)   otherView.style.display   = hasOtherMothership      ? ""     : "none";
  if (transferSec) transferSec.style.display = hasOtherMothership      ? ""     : "none";

  if (hasOtherMothership) {
    const msAcc = accounts.find(a => a.id === mothershipId);
    const nameEl = document.getElementById("ms-other-name");
    if (nameEl) nameEl.textContent = msAcc ? msAcc.name : "Unknown";
  }

  // Update section subtitle
  const sub = document.getElementById("mothership-section-sub");
  if (sub) {
    if (isMothership)        sub.textContent = "this account is the mothership";
    else if (mothershipId)   sub.textContent = "support vessel";
    else                     sub.textContent = "fleet management";
  }

  // Stop transfer polling if not on a support vessel
  if (!hasOtherMothership) {
    clearInterval(_transferInterval);
    _transferInterval = null;
    const statusBar = document.getElementById("transfer-status-bar");
    if (statusBar) statusBar.style.display = "none";
  }
}

async function triggerTransfer(type) {
  if (!activeId) return;
  const btn = type === "items"         ? document.getElementById("transfer-items-btn")
            : type === "market_items"  ? document.getElementById("transfer-market-btn")
            : type === "market_coins"  ? document.getElementById("transfer-market-coins-btn")
            :                            document.getElementById("transfer-coins-btn");

  try {
    if (btn) { btn.disabled = true; btn.textContent = "Starting…"; }
    const res  = await fetch(`/api/accounts/${activeId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Server error");
    showToast(`Transfer started — check status below`);
    setTransferStatusDisplay("Starting…", false);
    startTransferPolling();
  } catch (e) {
    showToast(e.message, "err");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = type === "items"
        ? `<svg class="icon" aria-hidden="true"><use href="#icon-list"/></svg> Send Items (Friends Share)`
        : type === "market_items"
        ? `<svg class="icon" aria-hidden="true"><use href="#icon-crosshair"/></svg> Send Items (Market Post)`
        : type === "market_coins"
        ? `<svg class="icon" aria-hidden="true"><use href="#icon-coins"/></svg> Send Coins (Market Post)`
        : `<svg class="icon" aria-hidden="true"><use href="#icon-coins"/></svg> Send Coins to Mothership`;
    }
  }
}

function setTransferStatusDisplay(status, done) {
  const bar  = document.getElementById("transfer-status-bar");
  const txt  = document.getElementById("transfer-status-text");
  const dot  = document.getElementById("transfer-status-dot");
  if (!bar || !txt || !dot) return;
  bar.style.display  = status ? "" : "none";
  txt.textContent    = status || "";
  dot.className      = "transfer-status-dot" + (done ? " done" : " active");

  // Re-enable buttons when done
  if (done) {
    const ib  = document.getElementById("transfer-items-btn");
    const mb  = document.getElementById("transfer-market-btn");
    const cb  = document.getElementById("transfer-coins-btn");
    const mcb = document.getElementById("transfer-market-coins-btn");
    if (ib) {
      ib.disabled = false;
      ib.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-list"/></svg> Send Items (Friends Share)`;
    }
    if (mb) {
      mb.disabled = false;
      mb.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-crosshair"/></svg> Send Items (Market Post)`;
    }
    if (cb) {
      cb.disabled = false;
      cb.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-coins"/></svg> Send Coins to Mothership`;
    }
    if (mcb) {
      mcb.disabled = false;
      mcb.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-coins"/></svg> Send Coins (Market Post)`;
    }
  }
}

function startTransferPolling() {
  if (_transferInterval) return;
  _transferInterval = setInterval(async () => {
    if (!activeId) return;
    try {
      const res  = await fetch(`/api/accounts/${activeId}/transfer-status`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status) setTransferStatusDisplay(data.status, data.done === true);
      if (data.done === true) {
        clearInterval(_transferInterval);
        _transferInterval = null;
      }
    } catch {}
  }, 1500);
}

/* ── Account switching ──────────────────────────────── */
function switchAccount(id) {
  overviewActive = false;
  const ovEl = document.getElementById("overview-panel");
  if (ovEl) ovEl.style.display = "none";
  document.getElementById("main-content").style.display = "block";
  activeId = id;
  clearPolls();

  // Update tab active state
  document.querySelectorAll(".acct-tab").forEach(t => t.classList.toggle("active", t.dataset.id === id));

  // Find account data
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;

  // Fill connection fields
  document.getElementById("conn-name").value    = acc.name    || "";
  document.getElementById("conn-token").value   = acc.token   || "";
  document.getElementById("conn-channel").value = String(acc.channel_id || "");
  document.getElementById("conn-botid").value   = String(acc.bot_id    || "");

  // Reset balance chart
  document.getElementById("chart-empty").classList.remove("hidden");
  document.getElementById("stat-wallet").textContent = "—";
  document.getElementById("stat-bank").textContent   = "—";
  document.getElementById("stat-total").textContent  = "—";
  document.getElementById("stat-time").textContent   = "—";
  if (balChart) { balChart.destroy(); balChart = null; }

  // Reset net worth chart
  document.getElementById("chart-nw-empty").classList.remove("hidden");
  document.getElementById("stat-networth").textContent = "—";
  document.getElementById("stat-nw-time").textContent  = "—";
  if (nwChart) { nwChart.destroy(); nwChart = null; }

  // Reset log feed
  logFeed.querySelectorAll(".log-row").forEach(el => el.remove());
  logEmpty.style.display = "flex";

  // Apply config fields
  const st = getAcctState(id);
  const DEFAULTS = {
    cooldown: 20, search_cooldown: 25, beg_cooldown: 40,
    crime_cooldown: 40, hl_cooldown: 10, hl_wait_for: 5,
    pm_cooldown: 20, wait_for_response: 10,
    daily_cooldown: 86400, work_cooldown: 3600,
    deposit_cooldown: 60, trivia_cooldown: 10,
    stream_cooldown: 660, pet_cooldown: 1800,
  };
  const merged = { ...DEFAULTS, ...acc };
  document.querySelectorAll("[data-config]").forEach(el => {
    const v = merged[el.dataset.config];
    if (v !== undefined) el.value = v;
  });

  applyRisk("search", acc.search_risk || "medium", false);
  applyRisk("crime",  acc.crime_risk  || "medium", false);
  populateCustomRanking("search", acc.search_custom_ranking || []);
  populateCustomRanking("crime",  acc.crime_custom_ranking  || []);

  const cmds = acc.commands_enabled || {};
  ["hunt","dig","search","beg","crime","hl","pm","adv","fish",
   "daily","work","deposit","trivia","stream","pet"].forEach(cmd => {
    applyToggle(cmd, cmds[cmd] === true);
  });

  // Sync fishing exclusive UI
  const fishOn = cmds.fish === true;
  applyFishUI(fishOn);

  // Sync fish sell currency
  applyFishCurrency(acc.fish_sell_currency || 'coins');

  // Adventure type and response mode
  setAdvValue(acc.adv_type || "Pepe Goes to Space");
  applyAdvMode(acc.adv_response_mode || "recommended");

  // Restore log filter button
  document.querySelectorAll(".log-filter-btn").forEach(b => b.classList.remove("active"));
  const activeBtn = document.querySelector(`.log-filter-btn[data-filter="${st.logFilter}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  // Update mothership UI and bal-tracker + lock toggles for this account
  updateMothershipUI();
  const _acc = accounts.find(a => a.id === id);
  updateBalToggleUI(!_acc || _acc.bal_tracker_enabled !== false);
  updateLockToggleUI(!_acc || _acc.disable_interaction_lock !== true);
  updateLimitFlagsUI(!!(_acc && _acc.limit_flags));

  const uptimeInput   = document.getElementById("stealth-uptime");
  const downtimeInput = document.getElementById("stealth-downtime");
  if (uptimeInput   && _acc) uptimeInput.value   = _acc.cycle_uptime_mins   ?? 0;
  if (downtimeInput && _acc) downtimeInput.value = _acc.cycle_downtime_mins ?? 0;
  // Restore stealth mode
  applySteathMode(_acc?.stealth_mode ?? 'moderate');
  // Restore cycle badge visibility
  const cycleBadge = document.getElementById("stealth-cycle-status");
  if (cycleBadge) {
    const hasCycle = (_acc?.cycle_uptime_mins > 0) && (_acc?.cycle_downtime_mins > 0);
    cycleBadge.style.display = hasCycle ? "" : "none";
  }

  // Start polling
  fetchBalance();
  fetchStatus();
  fetchLogs();
  _balInterval    = setInterval(fetchBalance, 30000);
  _statusInterval = setInterval(fetchStatus,  5000);
  _logInterval    = setInterval(fetchLogs,    3000);

  // Market Sniper
  loadSniperConfig();
  startSniperPolling();
}

/* ── Render tab bar ─────────────────────────────────── */
function renderTabs() {
  const container  = document.getElementById("acct-tabs");
  const mainEl     = document.getElementById("main-content");
  const ovEl       = document.getElementById("overview-panel");
  container.innerHTML = "";

  if (accounts.length > 0) {
    const ovTab = document.createElement("button");
    ovTab.className  = "acct-tab ov-tab" + (overviewActive ? " active" : "");
    ovTab.dataset.id = "__overview__";
    ovTab.innerHTML  =
      `<svg class="acct-ov-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>` +
      `</svg>` +
      `<span class="acct-tab-name">Overview</span>`;
    ovTab.addEventListener("click", () => switchToOverview());
    container.appendChild(ovTab);
  }

  for (const acc of accounts) {
    const isMothership = acc.id === mothershipId;
    const tab = document.createElement("button");
    tab.className   = "acct-tab" + (acc.id === activeId && !overviewActive ? " active" : "") + (isMothership ? " mothership-tab" : "");
    tab.dataset.id  = acc.id;
    tab.innerHTML   =
      `<span class="acct-dot"></span>` +
      (isMothership ? `<svg class="acct-ms-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>` : "") +
      `<span class="acct-tab-name">${escHtml(acc.name || "Account")}</span>` +
      `<span class="acct-close" data-id="${acc.id}" title="Remove account">` +
        `<svg class="icon"><use href="#icon-x"/></svg>` +
      `</span>`;
    tab.addEventListener("click", e => {
      if (e.target.closest(".acct-close")) return;
      switchAccount(acc.id);
    });
    tab.querySelector(".acct-close").addEventListener("click", e => {
      e.stopPropagation();
      deleteAccount(acc.id, acc.name);
    });
    container.appendChild(tab);
  }
  document.getElementById("no-accts").style.display = accounts.length === 0 ? "flex" : "none";
  if (accounts.length === 0) {
    mainEl.style.display = "none";
    if (ovEl) ovEl.style.display = "none";
  } else if (overviewActive) {
    mainEl.style.display = "none";
    if (ovEl) ovEl.style.display = "block";
  } else {
    mainEl.style.display = activeId ? "block" : "none";
    if (ovEl) ovEl.style.display = "none";
  }
}

/* ── Load accounts ──────────────────────────────────── */
async function loadAccounts() {
  try {
    const res = await fetch("/api/accounts");
    if (!res.ok) return;
    accounts = await res.json();
    renderTabs();
    if (overviewActive && accounts.length > 0) {
      // stay in overview
    } else if (accounts.length > 0 && !accounts.find(a => a.id === activeId)) {
      switchAccount(accounts[0].id);
    }
  } catch {}
}

/* ── Delete account ─────────────────────────────────── */
async function deleteAccount(id, name) {
  if (!confirm(`Remove "${name}"? This will stop its bots and delete its balance history.`)) return;
  try {
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    delete acctState[id];
    accounts = accounts.filter(a => a.id !== id);
    if (activeId === id) {
      activeId = null;
      clearPolls();
    }
    renderTabs();
    if (accounts.length > 0 && !activeId) switchAccount(accounts[0].id);
  } catch (e) {
    showToast("Delete failed: " + e.message, "err");
  }
}

/* ── Push account config ────────────────────────────── */
async function pushAccountConfig(payload) {
  if (!activeId) { showToast("No account selected — select an account first", "err"); return; }
  setBadge("saving");
  try {
    const res  = await fetch(`/api/accounts/${activeId}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Server error");
    setBadge("live");
    // Update local cache
    const idx = accounts.findIndex(a => a.id === activeId);
    if (idx !== -1) accounts[idx] = { ...accounts[idx], ...payload };
  } catch (err) {
    setBadge("live");
    showToast("Save failed: " + err.message, "err");
  }
}

/* ── Reset graph ────────────────────────────────────── */
document.getElementById("reset-graph-btn").addEventListener("click", async () => {
  if (!activeId) return;
  if (!confirm("Reset balance graph history for this account?")) return;
  try {
    const res = await fetch(`/api/accounts/${activeId}/balance`, { method: "DELETE" });
    if (!res.ok) throw new Error("Server error");
    // Clear charts immediately
    if (balChart) { balChart.destroy(); balChart = null; }
    if (nwChart)  { nwChart.destroy();  nwChart  = null; }
    document.getElementById("chart-empty").classList.remove("hidden");
    document.getElementById("chart-nw-empty").classList.remove("hidden");
    document.getElementById("stat-wallet").textContent   = "—";
    document.getElementById("stat-bank").textContent     = "—";
    document.getElementById("stat-total").textContent    = "—";
    document.getElementById("stat-time").textContent     = "—";
    document.getElementById("stat-networth").textContent = "—";
    document.getElementById("stat-nw-time").textContent  = "—";
    showToast("Graph reset — will repopulate on next pls bal");
  } catch (e) {
    showToast("Reset failed: " + e.message, "err");
  }
});

/* ── Connection save ────────────────────────────────── */
document.getElementById("conn-save").addEventListener("click", async () => {
  if (!activeId) return;
  const payload = {
    name:       document.getElementById("conn-name").value.trim(),
    token:      document.getElementById("conn-token").value.trim(),
    channel_id: document.getElementById("conn-channel").value.trim(),
    bot_id:     document.getElementById("conn-botid").value.trim(),
  };
  if (!payload.token)      { showToast("Token is required", "err"); return; }
  if (!payload.channel_id) { showToast("Channel / Thread ID is required", "err"); return; }

  await pushAccountConfig(payload);
  showToast("Saved — bot restarting…");

  // Update tab name
  renderTabs();
  // Re-mark active
  document.querySelectorAll(".acct-tab").forEach(t => t.classList.toggle("active", t.dataset.id === activeId));
});

/* ── Token reveal ───────────────────────────────────── */
function setupReveal(inputId, btnId, iconId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener("click", () => {
    const input = document.getElementById(inputId);
    const icon  = document.getElementById(iconId);
    const show  = input.type === "password";
    input.type  = show ? "text" : "password";
    if (icon) icon.innerHTML = show ? `<use href="#icon-eye-off"/>` : `<use href="#icon-eye"/>`;
  });
}
setupReveal("conn-token", "conn-reveal", "conn-eye-icon");
setupReveal("m-token",    "m-reveal",    "m-eye-icon");

/* ── Toggle helpers ─────────────────────────────────── */
const cmdState = {
  hunt:true, dig:true, search:true, beg:true, crime:true, hl:true, pm:true, adv:false, fish:false,
  daily:false, work:false, deposit:false, trivia:false, stream:false, pet:false,
};

function applyToggle(cmd, enabled) {
  cmdState[cmd] = enabled;
  document.querySelector(`.toggle[data-cmd="${cmd}"]`)?.classList.toggle("on", enabled);
  document.querySelector(`.cmd-card[data-cmd="${cmd}"]`)?.classList.toggle("disabled", !enabled);
}

function applyFishCurrency(currency) {
  document.querySelectorAll("#fish-currency-seg .seg-btn").forEach(btn => {
    const active = btn.dataset.currency === currency;
    btn.className = "seg-btn" + (active ? " active-low" : "");
  });
}

function applyFishUI(fishOn) {
  const panel = document.getElementById("fish-status-card");
  if (panel) panel.style.display = fishOn ? "" : "none";

  if (fishOn) startFishStatsPolling();
  else        stopFishStatsPolling();

  // Dim all other cmd-cards visually when fish is exclusive
  document.querySelectorAll(".cmd-card:not([data-cmd='fish'])").forEach(c => {
    c.classList.toggle("fish-exclusive-dim", fishOn);
  });
}

/* ── Fish stats chart (timeline) ─────────────────────── */
const FISH_COLOR_PALETTE = [
  "rgba(96,165,250,0.9)",   // blue
  "rgba(251,146,60,0.9)",   // orange
  "rgba(192,132,252,0.9)",  // purple
  "rgba(251,113,133,0.9)",  // pink
  "rgba(250,204,21,0.9)",   // yellow
  "rgba(20,184,166,0.9)",   // teal
  "rgba(239,68,68,0.9)",    // red
  "rgba(34,197,94,0.9)",    // green
  "rgba(245,158,11,0.9)",   // amber
  "rgba(99,102,241,0.9)",   // indigo
  "rgba(236,72,153,0.9)",   // fuchsia
  "rgba(14,165,233,0.9)",   // sky
];

function fishColorFill(line) {
  return line.replace(/[\d.]+\)$/, "0.07)");
}

function getFishChartColors() {
  const dark = root.getAttribute("data-theme") === "dark";
  return {
    sellLine:  dark ? "rgba(52,211,153,0.85)"  : "rgba(5,150,105,0.85)",
    sellFill:  dark ? "rgba(52,211,153,0.05)"  : "rgba(5,150,105,0.05)",
    grid: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    tick: dark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.30)",
  };
}

function _getFishNames(timeline) {
  const seen = new Set();
  const names = [];
  for (const e of timeline) {
    if (e.fish) {
      for (const n of Object.keys(e.fish)) {
        if (!seen.has(n)) { seen.add(n); names.push(n); }
      }
    }
  }
  return names;
}

function buildFishChart(timeline) {
  const canvas = document.getElementById("fish-chart");
  if (!canvas) return;

  const labels    = timeline.map(e => fmtTime(e.ts));
  const fishNames = _getFishNames(timeline);
  const pts       = timeline.length <= 10 ? 3 : 0;
  const { sellLine, sellFill, grid, tick } = getFishChartColors();
  const dark = root.getAttribute("data-theme") === "dark";

  if (fishChart) {
    const existingFish = fishChart.data.datasets
      .filter(d => d._isFish).map(d => d.label);
    const same = existingFish.length === fishNames.length &&
      existingFish.every((n, i) => n === fishNames[i]);

    if (same) {
      fishChart.data.labels = labels;
      fishNames.forEach((name, i) => {
        fishChart.data.datasets[i].data        = timeline.map(e => (e.fish && e.fish[name]) || 0);
        fishChart.data.datasets[i].pointRadius = pts;
      });
      const sellDs = fishChart.data.datasets[fishNames.length];
      if (sellDs) {
        sellDs.data        = timeline.map(e => e.sells);
        sellDs.borderColor = sellLine;
        sellDs.backgroundColor = sellFill;
        sellDs.pointRadius = pts;
      }
      fishChart.options.scales.x.grid.color  = grid;
      fishChart.options.scales.y.grid.color  = grid;
      fishChart.options.scales.x.ticks.color = tick;
      fishChart.options.scales.y.ticks.color = tick;
      fishChart.update("none");
      return;
    }
    fishChart.destroy();
    fishChart = null;
  }

  const datasets = fishNames.map((name, i) => {
    const line = FISH_COLOR_PALETTE[i % FISH_COLOR_PALETTE.length];
    return {
      label: name,
      _isFish: true,
      data: timeline.map(e => (e.fish && e.fish[name]) || 0),
      borderColor: line, backgroundColor: fishColorFill(line),
      borderWidth: 2, tension: 0.4, fill: false,
      pointRadius: pts, pointHoverRadius: 4, pointBackgroundColor: line,
    };
  });

  datasets.push({
    label: "Bucket Sells",
    _isFish: false,
    data: timeline.map(e => e.sells),
    borderColor: sellLine, backgroundColor: sellFill,
    borderWidth: 2, tension: 0.4, fill: false,
    borderDash: [5, 3],
    pointRadius: pts, pointHoverRadius: 4, pointBackgroundColor: sellLine,
  });

  const ctx = canvas.getContext("2d");
  fishChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)",
            font: { size: 11 }, boxWidth: 14, padding: 14,
            usePointStyle: true, pointStyle: "line",
          },
        },
        tooltip: {
          backgroundColor: dark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)",
          borderColor:     dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
          borderWidth: 1,
          titleColor: dark ? "#fafafa" : "#09090b",
          bodyColor:  dark ? "#a1a1aa" : "#52525b",
          titleFont: { size: 11, weight: "700" }, bodyFont: { size: 11 }, padding: 12,
          callbacks: {
            label: item => {
              const val  = item.parsed.y;
              const idx  = item.dataIndex;
              const prev = idx > 0 ? item.dataset.data[idx - 1] : null;
              const name = item.dataset.label;
              let ln = `${name}: ${val}`;
              if (prev !== null && val !== prev) ln += `  (+${val - prev})`;
              return ln;
            },
          },
        },
      },
      scales: {
        x: { grid: { color: grid, drawBorder: false }, ticks: { color: tick, font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0 }, border: { display: false } },
        y: { grid: { color: grid, drawBorder: false }, ticks: { color: tick, font: { size: 10 }, maxTicksLimit: 5, precision: 0, stepSize: 1 }, border: { display: false }, beginAtZero: true },
      },
    },
  });
}

function updateFishChartTheme() {
  if (!fishChart) return;
  const { sellLine, sellFill, grid, tick } = getFishChartColors();
  const dark = root.getAttribute("data-theme") === "dark";
  fishChart.data.datasets.forEach((ds, i) => {
    if (ds._isFish) {
      const line = FISH_COLOR_PALETTE[i % FISH_COLOR_PALETTE.length];
      ds.borderColor      = line;
      ds.backgroundColor  = fishColorFill(line);
      ds.pointBackgroundColor = line;
    } else {
      ds.borderColor      = sellLine;
      ds.backgroundColor  = sellFill;
      ds.pointBackgroundColor = sellLine;
    }
  });
  fishChart.options.plugins.legend.labels.color = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
  fishChart.options.scales.x.grid.color  = grid;
  fishChart.options.scales.y.grid.color  = grid;
  fishChart.options.scales.x.ticks.color = tick;
  fishChart.options.scales.y.ticks.color = tick;
  fishChart.update("none");
}

function fmtSessionTime(startTs) {
  const secs = Math.floor((Date.now() / 1000) - startTs);
  if (secs < 60)   return secs + "s";
  const mins = Math.floor(secs / 60);
  if (mins < 60)   return mins + "m";
  const hrs  = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function applyFishStats(stats) {
  const cc = document.getElementById("fish-catch-count");
  const sc = document.getElementById("fish-sell-count");
  const st = document.getElementById("fish-session-time");
  if (cc) cc.textContent = stats.total_catches ?? 0;
  if (sc) sc.textContent = stats.sells         ?? 0;
  if (st) st.textContent = fmtSessionTime(stats.session_start ?? (Date.now() / 1000));
  const timeline = Array.isArray(stats.timeline) ? stats.timeline : [];
  const wrap = document.getElementById("fish-chart-wrap");
  if (wrap) wrap.style.display = timeline.length > 0 ? "" : "none";
  if (timeline.length > 0) buildFishChart(timeline);
}

async function fetchFishStats() {
  if (!activeId) return;
  try {
    const r = await fetch(`/api/fish-stats/${activeId}`);
    if (!r.ok) return;
    applyFishStats(await r.json());
  } catch {}
}

function startFishStatsPolling() {
  fetchFishStats();
  clearInterval(_fishStatsInterval);
  _fishStatsInterval = setInterval(fetchFishStats, 3000);
}

function stopFishStatsPolling() {
  clearInterval(_fishStatsInterval);
  _fishStatsInterval = null;
  if (fishChart) { fishChart.destroy(); fishChart = null; }
  const cc = document.getElementById("fish-catch-count");
  const sc = document.getElementById("fish-sell-count");
  const st = document.getElementById("fish-session-time");
  if (cc) cc.textContent = "0";
  if (sc) sc.textContent = "0";
  if (st) st.textContent = "0m";
  const wrap = document.getElementById("fish-chart-wrap");
  if (wrap) wrap.style.display = "none";
}

function setFishStatus(text, active = true) {
  const dot = document.getElementById("fish-status-dot");
  const txt = document.getElementById("fish-status-text");
  if (dot) dot.className = "fish-status-dot" + (active ? " fish-dot-active" : "");
  if (txt) txt.textContent = text;
}

/* ── Custom ranking defaults (used for "Reset to Medium") ─── */
const SEARCH_DEFAULT_RANKING = [
  "Soul's chamber","The Gambler's Kingdom","Heist Circle Lounge","Heist Circle",
  "Ultimate Dankers","Greg's Farm","Whole Foods","FightHub","ZomB's Grave",
  "McDonald's","NOT a casino","Shadow's Realm","Aeradella's home","Dank Museum",
  "Hospital","Kitchen","Dark room","Ocean","Bank","Bathroom","God's Own Place",
  "Stock Market","Vegas Sphere","Twitch","Movie Theater","Briefcase","Beehive",
  "Bushes","Attic","Crawlspace","Sewer","Tree","Lego bin","Uber","Van","Glovebox",
  "Book","Coffee shop","Dog","Dumpster","Purse","Soup kitchen","#dank-chat","Garage",
  "Fridge","Dresser","Mailbox","Car","Computer","Vacuum","Basement","Sink","Pantry",
  "Grass","Shoe","Bus","Coat","Twitter","Pocket","Washer","Bed","Couch","Air",
  "Toilet","Who asked","ZomB's Server","Toxic waste plant","Lovish's Gym",
  "Phoenix pits","Police officer","Street","Tesla",
];
const CRIME_DEFAULT_RANKING = [
  "Poaching","Child labor","Kicking dank memer","Gaslighting","Stab grandma",
  "New player theft","Public urination","Idle hands","Poisoning","Piracy",
  "Eating A Hot Dog Sideways","Grand Theft Auto","Paying for twitter blue",
  "Identity theft","Driving under the influence","Drug distribution","Jay Walking",
  "Murder","Bank robbing","Prostitution","Shoplifting","Cyber bullying","Boredom",
  "Pineapple on pizza","Stealing from drug lords","Highway Robbery","Hacking",
  "Littering","Vandalism","Tax evasion","Treason",
  "Breaking and entering","Trespassing","Arson","Fraud",
];

/* ── Drag-sort rank list ─────────────────────────── */
const DRAG_HANDLE_SVG = `<svg width="10" height="14" viewBox="0 0 10 14" fill="none" aria-hidden="true">
  <circle cx="3" cy="2"  r="1.5" fill="currentColor"/>
  <circle cx="7" cy="2"  r="1.5" fill="currentColor"/>
  <circle cx="3" cy="7"  r="1.5" fill="currentColor"/>
  <circle cx="7" cy="7"  r="1.5" fill="currentColor"/>
  <circle cx="3" cy="12" r="1.5" fill="currentColor"/>
  <circle cx="7" cy="12" r="1.5" fill="currentColor"/>
</svg>`;

function updateRankPositions(list) {
  list.querySelectorAll(".rank-pos").forEach((el, i) => { el.textContent = i + 1; });
}

function refreshCustomCount(type) {
  const list = document.getElementById(`${type}-rank-list`);
  const cnt  = document.getElementById(`${type}-custom-count`);
  if (!list || !cnt) return;
  const n = list.querySelectorAll(".rank-item").length;
  cnt.textContent = n > 0 ? `${n} items` : "";
}

function getRankListOrder(type) {
  const list = document.getElementById(`${type}-rank-list`);
  if (!list) return [];
  return [...list.querySelectorAll(".rank-item")].map(el => el.dataset.value);
}

function buildRankList(type, items) {
  const list = document.getElementById(`${type}-rank-list`);
  if (!list) return;
  const defaults = type === "search" ? SEARCH_DEFAULT_RANKING : CRIME_DEFAULT_RANKING;
  const rows = items.length > 0 ? items : defaults;

  list.innerHTML = "";
  rows.forEach((name, i) => {
    const row = document.createElement("div");
    row.className = "rank-item";
    row.draggable = true;
    row.dataset.value = name;
    row.innerHTML = `<span class="rank-handle">${DRAG_HANDLE_SVG}</span>
      <span class="rank-pos">${i + 1}</span>
      <span class="rank-name">${name}</span>`;
    list.appendChild(row);
  });

  let dragging = null;
  let dropRef  = null;  // { el, above }

  list.addEventListener("dragstart", e => {
    dragging = e.target.closest(".rank-item");
    if (!dragging) return;
    dragging.classList.add("rank-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
  });

  list.addEventListener("dragover", e => {
    e.preventDefault();
    const target = e.target.closest(".rank-item");
    list.querySelectorAll(".rank-item").forEach(el => {
      el.classList.remove("rank-drop-above", "rank-drop-below");
    });
    if (!target || target === dragging) return;
    const rect  = target.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    target.classList.add(above ? "rank-drop-above" : "rank-drop-below");
    dropRef = { el: target, above };
  });

  list.addEventListener("dragleave", e => {
    if (!list.contains(e.relatedTarget)) {
      list.querySelectorAll(".rank-item").forEach(el => {
        el.classList.remove("rank-drop-above", "rank-drop-below");
      });
      dropRef = null;
    }
  });

  list.addEventListener("drop", e => {
    e.preventDefault();
    list.querySelectorAll(".rank-item").forEach(el => {
      el.classList.remove("rank-drop-above", "rank-drop-below");
    });
    if (!dragging || !dropRef) return;
    const { el, above } = dropRef;
    list.insertBefore(dragging, above ? el : el.nextSibling);
    updateRankPositions(list);
    dropRef = null;
  });

  list.addEventListener("dragend", () => {
    if (dragging) dragging.classList.remove("rank-dragging");
    list.querySelectorAll(".rank-item").forEach(el => {
      el.classList.remove("rank-drop-above", "rank-drop-below");
    });
    dragging = null;
    dropRef  = null;
  });

  refreshCustomCount(type);
}

function populateCustomRanking(type, ranking) {
  buildRankList(type, ranking);
}

/* ── Liquid-glass sliding pill for seg controls ─────── */
function updateSegPill(seg, level, animate) {
  const activeBtn = seg.querySelector(`[data-level="${level}"]`);
  if (!activeBtn) return;

  const colorMap = {
    low:    ["rgba(48,209,88,0.20)",  "rgba(48,209,88,0.28)"],
    medium: ["rgba(255,196,10,0.22)", "rgba(255,196,10,0.26)"],
    high:   ["rgba(255,69,58,0.20)",  "rgba(255,69,58,0.26)"],
    custom: ["rgba(10,132,255,0.18)", "rgba(10,132,255,0.24)"]
  };
  const [color, glow] = colorMap[level] || colorMap.low;

  if (!animate) {
    seg.classList.add("pill-no-transition");
  }

  // offsetLeft/offsetWidth are always relative to the positioned .seg ancestor
  // — unlike getBoundingClientRect() they don't return 0 before first paint
  const left  = activeBtn.offsetLeft;
  const width = activeBtn.offsetWidth;
  // Retry once if layout hasn't happened yet
  if (width === 0) {
    setTimeout(() => updateSegPill(seg, level, false), 60);
    return;
  }
  seg.style.setProperty("--pill-left",  `${left}px`);
  seg.style.setProperty("--pill-width", `${width}px`);
  seg.style.setProperty("--pill-color", color);
  seg.style.setProperty("--pill-glow",  glow);
  seg.classList.add("has-pill");

  if (animate) {
    seg.classList.remove("pill-sheen");
    void seg.offsetWidth; // force reflow to restart animation
    seg.classList.add("pill-sheen");
    const onEnd = () => { seg.classList.remove("pill-sheen"); seg.removeEventListener("animationend", onEnd); };
    seg.addEventListener("animationend", onEnd);
  }

  if (!animate) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => seg.classList.remove("pill-no-transition"))
    );
  }
}

function applyRisk(type, level, animate = true) {
  const group = document.getElementById(`risk-${type}`);
  if (!group) return;
  group.querySelectorAll(".seg-btn").forEach(btn => {
    btn.className = "seg-btn";
    if (btn.dataset.level === level) btn.classList.add(`active-${level}`);
  });
  const panel = document.getElementById(`${type}-custom-panel`);
  if (panel) panel.classList.toggle("open", level === "custom");

  requestAnimationFrame(() => updateSegPill(group, level, animate));
}

/* ── Command toggle clicks ──────────────────────────── */
document.querySelectorAll(".cmd-card, .fish-toggle-row").forEach(card => {
  card.addEventListener("click", async () => {
    const cmd    = card.dataset.cmd;
    const newVal = !cmdState[cmd];

    if (cmd === "fish") {
      if (newVal) {
        // Exclusive ON: disable all other commands + bal tracker
        const OTHER_CMDS = ["hunt","dig","search","beg","crime","hl","pm","adv","daily","work","deposit","trivia","stream","pet"];
        OTHER_CMDS.forEach(c => applyToggle(c, false));
        applyToggle("fish", true);
        applyFishUI(true);
        const newCmds = { ...cmdState };
        await pushAccountConfig({ commands_enabled: newCmds, bal_tracker_enabled: false });
        const acc = accounts.find(a => a.id === activeId);
        if (acc) acc.bal_tracker_enabled = false;
        updateBalToggleUI(false);
        showToast("Fishing exclusive mode ON — all other commands paused");
      } else {
        // Exclusive OFF: just disable fish
        applyToggle("fish", false);
        applyFishUI(false);
        await pushAccountConfig({ commands_enabled: { ...cmdState } });
        showToast("Fishing disabled");
      }
    } else {
      // Normal command toggle — if fish is active, fish takes precedence (do nothing)
      if (cmdState.fish) return;
      applyToggle(cmd, newVal);
      pushAccountConfig({ commands_enabled: { ...cmdState } });
    }
  });
});

/* ── Fish reset button ──────────────────────────────── */
document.getElementById("fish-reset-btn")?.addEventListener("click", async () => {
  if (!activeId) return;
  await fetch(`/api/fish-stats/${activeId}`, { method: "DELETE" });
  fetchFishStats();
  showToast("Session stats reset");
});

/* ── Risk buttons ───────────────────────────────────── */
document.querySelectorAll(".seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    // Currency picker inside fish card
    if (btn.closest("#fish-currency-seg")) {
      const currency = btn.dataset.currency;
      applyFishCurrency(currency);
      pushAccountConfig({ fish_sell_currency: currency });
      return;
    }
    // Risk segment buttons
    const { type, level } = btn.dataset;
    if (type && level) {
      applyRisk(type, level);
      pushAccountConfig({ [`${type}_risk`]: level });
    }
  });
});

/* ── Custom ranking save / reset ────────────────── */
["search", "crime"].forEach(type => {
  const label    = type === "search" ? "Search" : "Crime";
  const defaults = type === "search" ? SEARCH_DEFAULT_RANKING : CRIME_DEFAULT_RANKING;

  document.getElementById(`${type}-custom-reset`)?.addEventListener("click", () => {
    buildRankList(type, defaults);
  });

  document.getElementById(`${type}-custom-save`)?.addEventListener("click", async () => {
    const ranking = getRankListOrder(type);
    if (ranking.length === 0) { showToast("Nothing to save", "err"); return; }
    await pushAccountConfig({ [`${type}_custom_ranking`]: ranking });
    const acc = accounts.find(a => a.id === activeId);
    if (acc) acc[`${type}_custom_ranking`] = ranking;
    showToast(`${label} ranking saved — ${ranking.length} items`);
  });
});

/* ── Adventure prompts data ──────────────────────── */
const ADV_PROMPTS = {
  'Pepe Goes to Space': [
    { id: 'karaoke bar',              prompt: 'You find yourself floating next to an intergalactic karaoke bar. What do you do?',                     choices: ['Sing', 'Decline'] },
    { id: 'ran out of fuel',          prompt: 'You ran out of fuel! What\'s next?',                                                                   choices: ['Give Up', 'Urinate', 'Search a planet'] },
    { id: 'shooting star',            prompt: 'You see a shooting star!',                                                                             choices: ['Shoot at it', 'Wish', 'Take a picture'] },
    { id: 'abducted by a group of aliens', prompt: 'You got abducted by a group of aliens, who are trying to probe you. What do you do?',            choices: ['Flee', 'Sit Back and Enjoy'] },
    { id: 'transmission from deep space', prompt: 'You\'re picking up a transmission from deep space!',                                              choices: ['#;:$/}~@/,@~', '*<)#%\':]|##', 'Ignore'] },
    { id: 'space kitchen',            prompt: 'Whaaaat!? You found a space kitchen! It looks like it is full of shady stuff. What do you do?',        choices: ['Inspect', 'Ignore'] },
    { id: 'never gonna give you up',  prompt: 'Oh my god even in space you cannot escape it',                                                         choices: ['Never gonna give you up'] },
    { id: 'dying star',               prompt: 'You flew past a dying star',                                                                           choices: ['Reach for it', 'Flee'] },
    { id: 'dank sidious',             prompt: 'You encountered someone named Dank Sidious, what do you do?',                                          choices: ['Do it', 'Flee'] },
    { id: 'radioactive chemicals',    prompt: 'This planet seems to be giving off radioactive chemicals. What do you do?',                            choices: ['Leave', 'Distant Scan', 'Land And Explore'] },
    { id: 'webb telescope',           prompt: 'You accidentally bumped into the Webb Telescope. Oh god.',                                             choices: ['Try and Fix it', 'Flee'] },
    { id: 'strange looking object',   prompt: 'You found a strange looking object. What do you do?',                                                  choices: ['Ignore', 'Inspect'] },
    { id: 'dark pyramid',             prompt: 'You come upon a dark pyramid shaped ship fighting a spherical white ball. What do you do?',            choices: ['Take Back Light', 'Embrace Dark'] },
    { id: 'friendly alien approached', prompt: 'A friendly alien approached you slowly. What do you do?',                                            choices: ['Attack', 'Talk', 'Probe'] },
    { id: 'small but wise green alien', prompt: 'A small but wise green alien approaches you.',                                                       choices: ['Do', 'Do Not', 'Try'] },
    { id: 'odd eyes floating',        prompt: 'You uh, just came across a pair of Odd Eyes floating around',                                          choices: ['Collect', 'Flee'] },
    { id: 'space puppy',              prompt: 'You discover an adorable space puppy stuck on an asteroid. What do you do?',                           choices: ['Rescue', 'Leave'] },
    { id: 'vending machine',          prompt: 'You find a vending machine selling \'Moon Pies\'. What do you do?',                                   choices: ['Buy', 'Ignore'] },
    { id: 'cosmic bakery',            prompt: 'You encounter a cosmic bakery selling "Galaxy Donuts." What do you do?',                               choices: ['Buy', 'Ignore'] },
  ],
  'Pepe Goes out West': [
    { id: 'broken down wagon',        prompt: 'A lady next to a broken down wagon is yelling for help.',                                              choices: ['Help Her', 'Ignore Her'] },
    { id: 'dope ass cowboy hat',      prompt: 'You encounter someone with a dope ass cowboy hat who seems to enjoy radio equipment and lockpicking.', choices: ['Huff a muffin', 'Compare ass sizes', 'Pick a lock together'] },
    { id: 'entered the saloon to rest', prompt: 'You entered the saloon to rest from the journey. What do you want to do?',                          choices: ['Throw a drink', 'Take a drink', 'Play the piano', 'Gamble'] },
    { id: 'bandits about to rob the local towns bank', prompt: 'You see some bandits about to rob the local towns bank. What do you do?',            choices: ['Stop them', 'Run away', 'Report them', 'Join them'] },
    { id: 'bitten by a rattlesnake',  prompt: 'You stumble upon someone claiming to have been bitten by a rattlesnake. They say they need your help.', choices: ['Walk away', 'Suck it', 'Give them medicine', 'Rob them'] },
    { id: 'old abandoned mine',       prompt: 'You wander towards an old abandoned mine.',                                                            choices: ['Walk away', 'Go in'] },
    { id: 'dying of thirst',          prompt: 'You\'re dying of thirst. Where do you want to get water?',                                            choices: ['Water Fountain', 'Old Creek', 'Cactus'] },
    { id: 'riding on your horse and you get ambushed', prompt: 'You\'re riding on your horse and you get ambushed. What do you do?',                 choices: ['Fight back', 'Run away'] },
    { id: 'horse sees a snake',       prompt: 'Your horse sees a snake and throws you off. What do you do?',                                          choices: ['Report to sheriff', 'Find a new horse', 'Kill the snake'] },
    { id: 'catch one of em',          prompt: 'Catch one of em!',                                                                                     choices: ['🐄', '🐄', '🐄'] },
    { id: 'lost and asks you for directions', prompt: 'Someone on the trail is lost and asks you for directions.',                                    choices: ['Ignore them', 'Help them'] },
    { id: 'train',                    prompt: 'You get on a train and some bandits decide to rob the train. What do you do?',                         choices: ['Fight back', 'Don\'t hurt me!'] },
    { id: 'stray horse',              prompt: 'You found a stray horse. What do you want to do?',                                                     choices: ['Feed', 'Ignore', 'Tame'] },
    { id: 'horse stables',            prompt: 'You bump into someone near the horse stables. They challenge you to a duel!',                          choices: ['Run away', 'Lets duel!'] },
    { id: 'dank cellar',              prompt: 'You find a dank cellar with an old wooden box',                                                        choices: ['Grab it', 'Ignore it'] },
    { id: 'wanted:',                  prompt: 'WANTED: Who will you take down?',                                                                      choices: ['Jesse James', 'Billy Bob Jr.', 'Davy Jones'] },
    { id: 'getting ambushed by bandits', prompt: 'Someone is getting ambushed by bandits!',                                                          choices: ['Save them', 'Ignore them'] },
    { id: 'saloon with a poker game', prompt: 'You come across a saloon with a poker game going on inside. What do you want to do?',                  choices: ['Join', 'Ignore'] },
    { id: 'mechanical bull',          prompt: 'You go to a saloon where there\'s a sick looking mechanical bull ready for riding.',                   choices: ['Ride it', 'Kill it'] },
    { id: 'find an abandoned mine',   prompt: 'You find an abandoned mine. What do you want to do?',                                                  choices: ['Explore', 'Ignore'] },
    { id: 'quick draw',               prompt: 'A stranger challenges you to a quick draw. What do you want to do?',                                   choices: ['Accept', 'Decline'] },
  ],
  'Pepe Goes Down Under': [
    { id: 'animal sanctuary',         prompt: 'You visit an animal sanctuary and learn a lot. What do you get from the gift shop?',                   choices: ['Koala Sign', 'War Emu Statue', 'Toy Spider Nest', 'Australia Map', 'Nothing'] },
    { id: "can't decide where to go next", prompt: 'There\'s so much to do, you can\'t decide where to go next.',                                    choices: ['Go hunting', 'Explore the Outback', 'Hit the beach'] },
    { id: 'scuba diving group',       prompt: 'A scuba diving group invites you on an outing to explore the Great Barrier Reef.',                     choices: ['Explore alone', 'Stay together'] },
    { id: 'kangaroo fight club',      prompt: 'You stumble upon an underground kangaroo fight club.',                                                 choices: ['Fight', 'Place a bet', 'Report it'] },
    { id: 'throaty growl',            prompt: 'While hiking through the woods north of Victoria, you hear a deep, throaty growl.',                    choices: ['Find the source', 'Run Away'] },
    { id: 'nice gal at macca',        prompt: 'You meet a nice gal at Macca\'s who tells you she can take you to see some animals – for a price.',   choices: ['Pay up', 'Ask for a discount'] },
    { id: 'god of thunder',           prompt: 'You meet someone who looks like the God of Thunder at the beach, and he offers to teach you to surf.', choices: ['Hit the waves', 'Sit and watch'] },
    { id: 'aussie aussie aussie',     prompt: 'You stumble into a crowd yelling, "Aussie Aussie Aussie," and there is only one thing to do.',         choices: ['Oi! Oi! Oi!', 'Ignore it'] },
    { id: 'wallaby',                  prompt: 'While you\'re driving along, a wallaby, a kangaroo, and a crocodile cross the road.',                  choices: ['Why?', 'Sweet!'] },
    { id: 'sock wiggles',             prompt: 'While searching your suitcase for your favorite thongs, one of your socks wiggles on its own.',        choices: ['Deal with it another day', 'Lift the sock'] },
    { id: 'snake in your bed',        prompt: 'Is that a snake in your bed, or are you just happy to... wait, no that\'s definitely a snake!',        choices: ['Scream', 'Run', 'Freeze'] },
    { id: 'kangaroo island',          prompt: 'While walking around Kangaroo Island you stumble across an egg on the ground. What do you do with it?', choices: ['Eat it raw', 'Cook it', 'Take it home'] },
    { id: 'exploring the outback',    prompt: 'While exploring the Outback, you get a little lost but find some footprints near a creek.',            choices: ['Follow the footprints', 'Follow the creek'] },
    { id: 'great barrier reef has inspired you', prompt: 'The beautiful Great Barrier Reef has inspired you. What do you do with this newly found source of inspiration?', choices: ['Admire the view', 'Go snorkeling', 'Go fishing'] },
    { id: 'gathering on the beach',   prompt: 'One night you\'re invited to a gathering on the beach, and it turns out to be a barbecue.',            choices: ['Eat up', 'Wander alone'] },
    { id: 'vegemite',                 prompt: 'While out drinking with some new mates, they find out you\'ve never had Vegemite and declare it\'s your time.', choices: ['Little bite', 'Big bite', 'Pass'] },
    { id: 'chuck a sickie',           prompt: 'One of your new friends asks you to, "Chuck a sickie and grab a stubby," and you aren\'t sure how to respond.', choices: ['Say yes', 'Say no'] },
    { id: 'spider has taken up residence', prompt: 'When you return to your hotel, you find a spider has taken up residence in your room.',           choices: ['Burn the place down', 'Kill it', 'Leave it be'] },
    { id: 'website designer',         prompt: 'You meet a website designer in a coffee shop and he gives you his business card.',                      choices: ['Hire him', 'Throw it away'] },
  ],
  'Pepe Goes on Vacation': [
    { id: 'family road trip',         prompt: 'A family road trip is a perfect getaway until you end up lost and without cell service. What do you do?', choices: ['Keep Driving', 'Stop for Directions'] },
    { id: 'amusement park',           prompt: 'A family vacation can\'t be complete without a trip to an amusement park. What ride are you dying to try?', choices: ['Rollercoaster', 'Waterslide'] },
    { id: 'mountain resort',          prompt: 'A friend tells you about a quaint mountain resort. What do you do after you arrive?',                   choices: ['Go Skiing', 'Visit the Hotel Bar'] },
    { id: 'camping',                  prompt: 'Camping has always relaxed you, so you decide to vacation in the wilderness. What sort of camping do you prefer?', choices: ['Rent an RV', 'Use a Tent'] },
    { id: 'lisbon',                   prompt: 'During your vacation in Lisbon, the hotel offers you a small pastry for breakfast. What do you do?',    choices: ['Eat it', 'Pass'] },
    { id: 'paris',                    prompt: 'Nothing can beat a romantic vacation in Paris. What do you want to do first?',                          choices: ['The Eiffel Tower', 'The Louvre'] },
    { id: 'rome',                     prompt: 'While vacationing in Rome, you visit the Colosseum and run into a group handing out friendship bracelets.', choices: ['Take a Bracelet', 'Say No'] },
    { id: 'sightseeing',              prompt: 'You can\'t go on vacation without doing a little sightseeing. What do you want to see?',               choices: ['Museum', 'Concert'] },
    { id: 'famous landmarks',         prompt: 'You decide it\'s time to visit some famous landmarks in the United States. Which do you visit first?', choices: ['The Grand Canyon', 'Mt. Rushmore'] },
    { id: 'beach',                    prompt: 'You decide the beach sounds like a perfect choice for a weekend away. Which beach do you want to visit?', choices: ['Daytona Beach, Florida', 'Santa Monica, California'] },
    { id: 'legoland',                 prompt: 'You decide to pick up Badosz and spend the weekend at Legoland. What do you look at first?',            choices: ['Mini Lego City', 'Gift Shop'] },
    { id: 'whale watching',           prompt: 'You find a discounted whale watching tour and decide to give it a go, but the deal is for two. Who do you take with you?', choices: ['Melmsie', 'Kable', 'Your mom'] },
    { id: 'cruise ship',              prompt: 'Your cruise ship docks at a small island for a day of sun and swimming. What do you do?',               choices: ['Swim', 'Sunbathe', 'Stay on the Boat'] },
    { id: 'discount cruises',         prompt: 'You get a flyer for some discount cruises that sound wonderful. Which destination do you choose?',      choices: ['Mediterranean', 'Caribbean'] },
    { id: 'stargazing',               prompt: 'You decide to go stargazing in the Chilean desert, but there are only two flights left. Which do you take?', choices: ['Morning', 'Night'] },
  ],
  'Pepe Goes Fishing with Friends': [],
  'Pepe Goes to the Museum': [
    { id: 'fossils',                  prompt: 'While examining fossils in the Aquatic World exhibit, you are drowning in information. What do you do?', choices: ['Power through', 'Find a bench'] },
    { id: 'pepe history collection',  prompt: 'The Pepe History collection is filled with works of art. Which area do you want to explore?',           choices: ['Paintings', 'Sculptures', 'Neither'] },
    { id: 'hall of human history',    prompt: 'While exploring the Hall of Human History, a wall of tools catches your eye. You always wanted bolt cutters...', choices: ['Steal them', 'Walk On'] },
    { id: 't-rex skeleton',           prompt: 'You finally found the T-Rex skeleton. How do you make the most of this moment?',                       choices: ['Climb it, duh', 'Take a picture'] },
    { id: 'gift shop',                prompt: 'You stop by the gift shop to snag a souvenir, but there is so much to choose from. How do you decide?', choices: ['Ask someone', 'Flip a coin'] },
    { id: 'dark hallway with two doors', prompt: 'You take a wrong turn and end up in a long, dark hallway with two doors. Which do you choose?',    choices: ['Left', 'Right'] },
    { id: 'legendary beasts',         prompt: 'When you enter the Legendary Beasts exhibit, the lights go out and the doors close. Which exhibit do you brave?', choices: ['Kraken', 'Dragon'] },
    { id: 'pharaoh exhibit',          prompt: 'The pharaoh exhibit is closed, so you decide to learn about modern medicine instead. Which part do you see first?', choices: ['Pharmacology', 'Virology'] },
    { id: 'bathroom',                 prompt: 'It\'s time to fight against a busload of kids for the bathroom. When you get to the front, two stalls are available.', choices: ['Broken Lock', 'Disgusting Floor'] },
    { id: 'age of the internet',      prompt: 'You\'ve found the Age of the Internet displays. Where do you want to begin?',                          choices: ['Computers', 'Social Media'] },
    { id: 'pepe history display',     prompt: 'You finally found your favorite exhibit! The Pepe History display has memes, pepes, and a place to play Dank Memer. What do you check out first?', choices: ['Pepe Crown', 'Pepe Trophy', 'Pepe Medal', 'Pepe Coin'] },
    { id: 'artifact cafe',            prompt: 'You stop for lunch at the Artifact Cafe, but it\'s Taco Tuesday and the lines are endless. What do you do?', choices: ['Wait for tacos', 'Hit the vending machine'] },
    { id: 'history of domestic pets', prompt: 'While exploring the History of Domestic Pets, the path splits and you must make a choice that has plagued humanity for centuries.', choices: ['Cats', 'Dogs'] },
    { id: 'education through the ages', prompt: 'You see your ex approaching and duck into the Education through the Ages exhibit. Which hall do you choose?', choices: ['Science', 'Economics'] },
    { id: 'licking one of the paintings', prompt: 'A security guard catches you trying to lick one of the paintings for a TikTok prank. What do you do?', choices: ['It\'s just a prank bro', 'Apologise', 'Run'] },
    { id: 'decades of distilleries',  prompt: 'You spend a few hours in the Decades of Distilleries exhibit. Which do you visit before you go?',      choices: ['Whiskey', 'Vodka'] },
    { id: 'weird and unexplained',    prompt: 'In the Weird and Unexplained showcase, you begin to feel like something is watching you. What do you do?', choices: ['Join a group', 'Ignore it'] },
    { id: 'hunter-gatherer exhibit',  prompt: 'The life-sized figures in the hunter-gatherer exhibit are creeping you out. Which path do you choose?', choices: ['Hunting', 'Fishing'] },
    { id: 'bird has gotten into the museum', prompt: 'A bird has gotten into the museum. Staff are offering a reward to anyone who helps catch it. Which exhibit do you check first?', choices: ['U.S. Presidents', 'Voyages on the High Seas'] },
    { id: 'virtual reality',          prompt: 'The museum is hosting a virtual reality trip through a biome of your choice. Which do you choose?',    choices: ['Ocean Biome', 'Tropical Rainforest'] },
  ],
  'Pepe goes to Brazil': [
    { id: 'christ the redeemer',      prompt: 'You can\'t visit Rio de Janeiro without touring the Christ the Redeemer statue. How do you get there?',  choices: ['Bus', 'Uber'] },
    { id: 'brazilian cheese bread',   prompt: 'You stop at a local bakery for some of the Brazilian cheese bread. What else do you try?',               choices: ['Brigaderio', 'Nothing'] },
    { id: 'brazilian steakhouse',     prompt: 'While visiting Rio Grande do Sul, you stop at one of the famous Brazilian steakhouses. What do you want?', choices: ['Give me the meat!', 'The buffet'] },
    { id: 'capybaras',                prompt: 'While visiting São Paulo, you find a place to see capybaras. What do you do?',                           choices: ['Pull up', 'Hop out'] },
    { id: 'amazon river',             prompt: 'You take a boat tour down the Amazon River. At a fork, the guide says right are piranhas and left anacondas. Which?', choices: ['Anacondas', 'Piranhas'] },
    { id: 'carnival',                 prompt: 'You decide to hit the streets and check out the bands playing music during Carnival. What do you do first?', choices: ['Get a Drink', 'Dance', 'Join a Band'] },
  ],
};

/* ── Adventure custom dropdown ───────────────────── */
const advDropdown = document.getElementById("adv-dropdown");
const advTrigger  = document.getElementById("adv-trigger");
const advPanel    = document.getElementById("adv-panel");
const advTriggerName = document.getElementById("adv-trigger-name");

let _advValue   = "Pepe Goes to Space";
let _advMode    = "recommended";
let _advCustom  = {};

const advCustomPanel = document.getElementById("adv-custom-panel");
const advCustomList  = document.getElementById("adv-custom-list");

function renderAdvPrompts(advType, customResponses) {
  const prompts = ADV_PROMPTS[advType] || [];
  advCustomList.innerHTML = "";
  if (prompts.length === 0) {
    advCustomList.innerHTML = '<div style="padding:14px 18px;font-size:12px;color:var(--text-3)">No prompts available for this adventure.</div>';
    return;
  }
  prompts.forEach(({ id, prompt, choices }) => {
    const current = customResponses[id];
    const item = document.createElement("div");
    item.className = "adv-prompt-item";
    const pt = document.createElement("div");
    pt.className = "adv-prompt-text";
    pt.textContent = prompt;
    item.appendChild(pt);
    const choicesEl = document.createElement("div");
    choicesEl.className = "adv-choices";
    choices.forEach(choice => {
      const btn = document.createElement("div");
      btn.className = "adv-choice" + (current === choice ? " selected" : "");
      btn.innerHTML = `<span class="adv-choice-dot"></span>${escHtml(choice)}`;
      btn.addEventListener("click", () => {
        choicesEl.querySelectorAll(".adv-choice").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        _advCustom[id] = choice;
        const acc = accounts.find(a => a.id === activeId);
        const allCustom = acc?.adv_custom_responses || {};
        if (!allCustom[advType]) allCustom[advType] = {};
        allCustom[advType][id] = choice;
        pushAccountConfig({ adv_custom_responses: allCustom });
        const idx = accounts.findIndex(a => a.id === activeId);
        if (idx !== -1) {
          if (!accounts[idx].adv_custom_responses) accounts[idx].adv_custom_responses = {};
          if (!accounts[idx].adv_custom_responses[advType]) accounts[idx].adv_custom_responses[advType] = {};
          accounts[idx].adv_custom_responses[advType][id] = choice;
        }
      });
      choicesEl.appendChild(btn);
    });
    item.appendChild(choicesEl);
    advCustomList.appendChild(item);
  });
}

function applyAdvMode(mode) {
  _advMode = mode;
  document.querySelectorAll(".adv-mode-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  if (mode === "custom") {
    advCustomPanel.classList.add("open");
    const acc = accounts.find(a => a.id === activeId);
    const customResponses = (acc?.adv_custom_responses || {})[_advValue] || {};
    renderAdvPrompts(_advValue, customResponses);
  } else {
    advCustomPanel.classList.remove("open");
  }
}

document.querySelectorAll(".adv-mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    if (mode === _advMode) return;
    applyAdvMode(mode);
    pushAccountConfig({ adv_response_mode: mode });
    const idx = accounts.findIndex(a => a.id === activeId);
    if (idx !== -1) accounts[idx].adv_response_mode = mode;
  });
});

function setAdvValue(val) {
  _advValue = val;
  advTriggerName.textContent = val;
  advPanel.querySelectorAll(".adv-option").forEach(o => {
    o.classList.toggle("selected", o.dataset.value === val);
  });
  if (_advMode === "custom") {
    const acc = accounts.find(a => a.id === activeId);
    const customResponses = (acc?.adv_custom_responses || {})[val] || {};
    renderAdvPrompts(val, customResponses);
  }
}

function openAdv() {
  advDropdown.classList.add("open");
  advTrigger.setAttribute("aria-expanded", "true");
}
function closeAdv() {
  advDropdown.classList.remove("open");
  advTrigger.setAttribute("aria-expanded", "false");
}

advTrigger.addEventListener("click", e => {
  e.stopPropagation();
  advDropdown.classList.contains("open") ? closeAdv() : openAdv();
});

advPanel.querySelectorAll(".adv-option").forEach(opt => {
  opt.addEventListener("click", () => {
    const val = opt.dataset.value;
    setAdvValue(val);
    closeAdv();
    pushAccountConfig({ adv_type: val }).then(() => showToast("Adventure type saved"));
  });
});

document.addEventListener("click", e => {
  if (!advDropdown.contains(e.target)) closeAdv();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeAdv();
});

/* ── Cooldown inputs ────────────────────────────────── */
let saveTimer;
function collectNumeric() {
  const out = {};
  document.querySelectorAll("[data-config]").forEach(el => {
    const v = parseFloat(el.value);
    if (!isNaN(v) && v > 0) out[el.dataset.config] = v;
  });
  return out;
}
document.querySelectorAll("[data-config]").forEach(el => {
  el.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => pushAccountConfig(collectNumeric()).then(() => showToast("Saved")), 700);
  });
});

/* ── Log filters ────────────────────────────────────── */
document.querySelectorAll(".log-filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".log-filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    if (activeId) getAcctState(activeId).logFilter = btn.dataset.filter;
    renderLogs();
  });
});

document.getElementById("log-clear").addEventListener("click", () => {
  if (!activeId) return;
  const st = getAcctState(activeId);
  st.logCleared    = true;
  st.clearedBefore = Date.now();
  st.logEntries    = [];
  renderLogs();
});

logFeed.addEventListener("scroll", () => {
  if (!activeId) return;
  const st = getAcctState(activeId);
  st.logAutoScroll = logFeed.scrollHeight - logFeed.scrollTop - logFeed.clientHeight < 60;
});

/* ── Add Account Modal ──────────────────────────────── */
function openModal() {
  document.getElementById("m-name").value    = "";
  document.getElementById("m-token").value   = "";
  document.getElementById("m-channel").value = "";
  document.getElementById("m-botid").value   = "270904126974590976";
  document.getElementById("modal-overlay").style.display = "flex";
}
function closeModal() {
  document.getElementById("modal-overlay").style.display = "none";
}

document.getElementById("acct-add-btn").addEventListener("click", openModal);
document.getElementById("no-accts-btn").addEventListener("click", openModal);
document.getElementById("modal-close").addEventListener("click",  closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("modal-overlay")) closeModal();
});

document.getElementById("modal-confirm").addEventListener("click", async () => {
  const name    = document.getElementById("m-name").value.trim() || "New Account";
  const token   = document.getElementById("m-token").value.trim();
  const channel = document.getElementById("m-channel").value.trim();
  const botid   = document.getElementById("m-botid").value.trim();

  if (!token)   { showToast("Token is required", "err");     return; }
  if (!channel) { showToast("Channel ID is required", "err"); return; }

  try {
    const res  = await fetch("/api/accounts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name, token, channel_id: channel, bot_id: botid || "270904126974590976" }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Server error");
    accounts.push(data.account);
    closeModal();
    renderTabs();
    switchAccount(data.account.id);
    showToast("Account added — bot starting…");
  } catch (e) {
    showToast("Failed: " + e.message, "err");
  }
});

/* ── Mothership button handlers ─────────────────────── */
document.getElementById("make-mothership-btn").addEventListener("click", () => {
  if (activeId) setMothership(activeId);
});

document.getElementById("transfer-mothership-btn").addEventListener("click", () => {
  const others = accounts.filter(a => a.id !== activeId);
  if (others.length === 0) {
    showToast("No other accounts to transfer to", "err");
    return;
  }
  const names = others.map(a => a.name).join(", ");
  const choice = prompt(`Transfer mothership role to which account?\n\nAvailable: ${names}\n\nEnter the exact account name:`);
  if (!choice) return;
  const target = others.find(a => a.name.toLowerCase() === choice.trim().toLowerCase());
  if (!target) { showToast(`Account "${choice}" not found`, "err"); return; }
  setMothership(target.id);
});

document.getElementById("transfer-items-btn").addEventListener("click", () => {
  triggerTransfer("items");
});

document.getElementById("transfer-market-btn").addEventListener("click", () => {
  triggerTransfer("market_items");
});

document.getElementById("transfer-coins-btn").addEventListener("click", () => {
  triggerTransfer("coins");
});

document.getElementById("transfer-market-coins-btn").addEventListener("click", () => {
  triggerTransfer("market_coins");
});

/* ── Market Sniper ──────────────────────────────────── */
let _sniperItems    = [];   // current watch list
let _sniperInterval = null;

function clearSniperPolls() {
  clearInterval(_sniperInterval);
  _sniperInterval = null;
}

async function loadSniperConfig() {
  if (!activeId) return;
  try {
    const r = await fetch(`/api/accounts/${activeId}/market-sniper`);
    if (!r.ok) return;
    const d = await r.json();
    _sniperItems = Array.isArray(d.items) ? d.items : [];
    const toggle   = document.getElementById("sniper-toggle");
    const cooldown = document.getElementById("sniper-cooldown");
    if (toggle)   toggle.checked  = !!d.enabled;
    if (cooldown) cooldown.value  = d.cooldown ?? 60;
    renderSniperItems();
  } catch {}
}

async function saveSniperConfig(patch) {
  if (!activeId) return;
  try {
    await fetch(`/api/accounts/${activeId}/market-sniper`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {}
}

function renderSniperItems() {
  const empty = document.getElementById("sniper-items-empty");
  const table = document.getElementById("sniper-table");
  const tbody = document.getElementById("sniper-tbody");
  if (!tbody) return;

  if (_sniperItems.length === 0) {
    if (empty) empty.style.display = "";
    if (table) table.style.display = "none";
    return;
  }
  if (empty) empty.style.display = "none";
  if (table) table.style.display = "";

  tbody.innerHTML = "";
  _sniperItems.forEach((item, idx) => {
    const qty = Math.max(1, item.buy_qty || 1);
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td class="sniper-td-name">${escHtml(item.name)}</td>` +
      `<td class="sniper-td-price"><span class="sniper-price-badge">⏣ ${Number(item.max_price).toLocaleString()}</span></td>` +
      `<td class="sniper-td-qty"><span class="sniper-qty-badge">× ${qty}</span></td>` +
      `<td class="sniper-td-del"><button class="sniper-del-btn" data-idx="${idx}" title="Remove">` +
        `<svg class="icon" aria-hidden="true"><use href="#icon-x"/></svg></button></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".sniper-del-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.dataset.idx, 10);
      _sniperItems.splice(idx, 1);
      renderSniperItems();
      await saveSniperConfig({ items: _sniperItems });
      showToast("Item removed");
    });
  });
}

async function fetchSniperStats() {
  if (!activeId) return;
  try {
    const r = await fetch(`/api/market-sniper-stats/${activeId}`);
    if (!r.ok) return;
    const d = await r.json();

    const buysEl  = document.getElementById("sniper-stat-buys");
    const coinsEl = document.getElementById("sniper-stat-coins");
    const lastEl  = document.getElementById("sniper-stat-last");
    const feedEl  = document.getElementById("sniper-feed");
    const emptyEl = document.getElementById("sniper-feed-empty");

    if (buysEl)  buysEl.textContent  = d.total_buys ?? 0;
    if (coinsEl) coinsEl.textContent = fmtCoins(d.total_coins_spent ?? 0);

    const recent = Array.isArray(d.recent_buys) ? d.recent_buys : [];
    if (recent.length > 0) {
      const last = recent[recent.length - 1];
      if (lastEl) lastEl.textContent = `${last.item} @ ${fmtCoins(last.price)} — ${fmtTimeAgo(last.ts)}`;
    } else {
      if (lastEl) lastEl.textContent = "—";
    }

    if (feedEl && emptyEl) {
      feedEl.querySelectorAll(".sniper-buy-row").forEach(el => el.remove());
      if (recent.length === 0) {
        emptyEl.style.display = "";
      } else {
        emptyEl.style.display = "none";
        const frag = document.createDocumentFragment();
        for (const buy of [...recent].reverse()) {
          const row = document.createElement("div");
          row.className = "sniper-buy-row";
          const total = (buy.price || 0) * (buy.qty || 1);
          row.innerHTML =
            `<span class="sniper-buy-item">${escHtml(buy.item)}</span>` +
            `<span class="sniper-buy-price">${fmtCoins(buy.price)}<span class="sniper-buy-unit">/unit</span></span>` +
            `<span class="sniper-buy-qty">× ${Number(buy.qty).toLocaleString()}</span>` +
            `<span class="sniper-buy-total">= ${fmtCoins(total)}</span>` +
            `<span class="sniper-buy-time">${fmtTimeAgo(buy.ts)}</span>`;
          frag.appendChild(row);
        }
        feedEl.appendChild(frag);
      }
    }
  } catch {}
}

function startSniperPolling() {
  fetchSniperStats();
  clearSniperPolls();
  _sniperInterval = setInterval(fetchSniperStats, 4000);
}

function stopSniperPolling() {
  clearSniperPolls();
}

// ── Sniper toggle ──
document.getElementById("sniper-toggle").addEventListener("change", async function () {
  const enabled = this.checked;
  await saveSniperConfig({ enabled });
  showToast(enabled ? "Market Sniper enabled" : "Market Sniper disabled");
});

// ── Sniper cooldown (debounced save) ──
let _sniperCooldownTimer;
document.getElementById("sniper-cooldown").addEventListener("input", function () {
  clearTimeout(_sniperCooldownTimer);
  _sniperCooldownTimer = setTimeout(async () => {
    const v = parseInt(this.value, 10);
    if (v >= 5) {
      await saveSniperConfig({ cooldown: v });
      showToast("Sniper interval saved");
    }
  }, 700);
});

// ── Add item ──
document.getElementById("sniper-add-btn").addEventListener("click", async () => {
  const nameEl  = document.getElementById("sniper-add-name");
  const priceEl = document.getElementById("sniper-add-price");
  const qtyEl   = document.getElementById("sniper-add-qty");
  const name    = nameEl.value.trim().toLowerCase();
  const price   = parseInt(priceEl.value, 10);
  const qty     = Math.max(1, Math.min(50, parseInt(qtyEl.value, 10) || 1));

  if (!name)        { showToast("Item name is required", "err"); return; }
  if (!(price > 0)) { showToast("Max price must be > 0", "err"); return; }

  if (_sniperItems.find(i => i.name === name)) {
    showToast(`"${name}" is already in the watch list`, "err"); return;
  }

  _sniperItems.push({ name, max_price: price, buy_qty: qty });
  nameEl.value  = "";
  priceEl.value = "";
  qtyEl.value   = "1";
  renderSniperItems();
  await saveSniperConfig({ items: _sniperItems });
  showToast(`Added "${name}" — max ⏣${price.toLocaleString()} × ${qty}`);
});

// ── Enter key on add inputs ──
["sniper-add-name", "sniper-add-price", "sniper-add-qty"].forEach(id => {
  document.getElementById(id).addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("sniper-add-btn").click();
  });
});

// ── Reset stats ──
document.getElementById("sniper-reset-btn").addEventListener("click", async () => {
  if (!activeId) return;
  await fetch(`/api/market-sniper-stats/${activeId}`, { method: "DELETE" });
  fetchSniperStats();
  showToast("Sniper stats reset");
});

/* ── Overview Tab ───────────────────────────────────── */
const OV_PALETTE = [
  '#3b82f6','#f59e0b','#10b981','#8b5cf6','#ef4444',
  '#06b6d4','#f97316','#84cc16','#ec4899','#6366f1',
];

function switchToOverview() {
  overviewActive = true;
  clearPolls();
  activeId = null;
  document.getElementById("main-content").style.display = "none";
  document.getElementById("overview-panel").style.display = "block";
  document.querySelectorAll(".acct-tab").forEach(t =>
    t.classList.toggle("active", t.dataset.id === "__overview__"));
  fetchOverview();
  _ovInterval = setInterval(fetchOverview, 30000);
}

function getPieCfg(labels, values, colors, total) {
  const dark = root.getAttribute("data-theme") === "dark";
  const tooltipBg = dark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)";
  const tooltipBd = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const titleClr  = dark ? "#fafafa" : "#09090b";
  const bodyClr   = dark ? "#a1a1aa" : "#52525b";
  const legendClr = dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)";
  return {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c + "cc"),
        borderColor:     colors,
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 350 },
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: legendClr,
            font: { size: 11 },
            boxWidth: 10, boxHeight: 10,
            padding: 10,
            usePointStyle: true, pointStyle: "circle",
          },
        },
        tooltip: {
          backgroundColor: tooltipBg,
          borderColor: tooltipBd, borderWidth: 1,
          titleColor: titleClr, bodyColor: bodyClr,
          titleFont: { size: 11, weight: "700" }, bodyFont: { size: 11 }, padding: 10,
          callbacks: {
            label: item => {
              const val = item.parsed;
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
              return ` ${fmtCoins(val)}  (${pct}%)`;
            },
          },
        },
      },
    },
  };
}

function buildBalPie(data) {
  const wrap  = document.getElementById("ov-bal-pie-wrap");
  const empty = document.getElementById("ov-bal-empty");
  const rows  = data.filter(d => (d.wallet ?? 0) + (d.bank ?? 0) > 0);
  if (rows.length === 0) {
    if (wrap)  wrap.style.display  = "none";
    if (empty) empty.classList.remove("hidden");
    if (ovBalPie) { ovBalPie.destroy(); ovBalPie = null; }
    return;
  }
  if (wrap)  wrap.style.display  = "";
  if (empty) empty.classList.add("hidden");
  const labels = rows.map(d => d.name);
  const values = rows.map(d => (d.wallet ?? 0) + (d.bank ?? 0));
  const colors = rows.map((_, i) => OV_PALETTE[i % OV_PALETTE.length]);
  const total  = values.reduce((a, b) => a + b, 0);
  const ctx    = document.getElementById("ov-balance-pie").getContext("2d");
  if (ovBalPie) ovBalPie.destroy();
  ovBalPie = new Chart(ctx, getPieCfg(labels, values, colors, total));
}

function buildNwPie(data) {
  const wrap  = document.getElementById("ov-nw-pie-wrap");
  const empty = document.getElementById("ov-nw-empty");
  const rows  = data.filter(d => d.net_worth != null && d.net_worth > 0);
  if (rows.length === 0) {
    if (wrap)  wrap.style.display  = "none";
    if (empty) empty.classList.remove("hidden");
    if (ovNwPie) { ovNwPie.destroy(); ovNwPie = null; }
    return;
  }
  if (wrap)  wrap.style.display  = "";
  if (empty) empty.classList.add("hidden");
  const labels = rows.map(d => d.name);
  const values = rows.map(d => d.net_worth);
  const colors = rows.map((_, i) => OV_PALETTE[i % OV_PALETTE.length]);
  const total  = values.reduce((a, b) => a + b, 0);
  const ctx    = document.getElementById("ov-nw-pie").getContext("2d");
  if (ovNwPie) ovNwPie.destroy();
  ovNwPie = new Chart(ctx, getPieCfg(labels, values, colors, total));
}

function renderLeaderboard(data) {
  const container = document.getElementById("ov-leaderboard");
  const emptyEl   = document.getElementById("ov-lb-empty");
  const sorted    = [...data].sort((a, b) => {
    const scoreA = a.net_worth ?? ((a.wallet ?? 0) + (a.bank ?? 0));
    const scoreB = b.net_worth ?? ((b.wallet ?? 0) + (b.bank ?? 0));
    return scoreB - scoreA;
  });
  const hasData = sorted.some(d => d.wallet != null || d.bank != null || d.net_worth != null);
  if (!hasData) {
    if (emptyEl) emptyEl.style.display = "";
    container.querySelectorAll(".ov-lb-row").forEach(r => r.remove());
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";
  container.querySelectorAll(".ov-lb-row").forEach(r => r.remove());
  const frag = document.createDocumentFragment();
  sorted.forEach((d, i) => {
    const row = document.createElement("div");
    row.className = "ov-lb-row" + (d.id === mothershipId ? " ov-lb-mothership" : "");
    const online = document.querySelector(`.acct-tab[data-id="${d.id}"] .acct-dot.online`);
    const dotHtml = `<span class="ov-lb-dot${online ? " online" : ""}"></span>`;
    const crownHtml = d.id === mothershipId
      ? `<svg class="ov-lb-crown" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 20h20M5 20 3 8l7 4 2-7 2 7 7-4-2 12"/></svg>`
      : "";
    const rankColor = i === 0 ? "ov-rank-gold" : i === 1 ? "ov-rank-silver" : i === 2 ? "ov-rank-bronze" : "";
    row.innerHTML =
      `<span class="ov-lb-rank ${rankColor}">${i + 1}</span>` +
      `<span class="ov-lb-name">${dotHtml}${crownHtml}${escHtml(d.name)}</span>` +
      `<span class="ov-lb-val">${d.wallet != null ? fmtCoins(d.wallet) : "—"}</span>` +
      `<span class="ov-lb-val">${d.bank   != null ? fmtCoins(d.bank)   : "—"}</span>` +
      `<span class="ov-lb-val ov-lb-nw">${d.net_worth != null ? fmtCoins(d.net_worth) : "—"}</span>` +
      `<span class="ov-lb-time">${d.ts ? fmtTimeAgo(d.ts) : "—"}</span>`;
    frag.appendChild(row);
  });
  container.appendChild(frag);
}

async function fetchOverview() {
  if (!overviewActive) return;
  try {
    const res  = await fetch("/api/overview");
    if (!res.ok) return;
    const data = await res.json();

    let totalWallet = 0, totalBank = 0, totalNw = 0, hasNw = false;
    for (const d of data) {
      totalWallet += d.wallet    ?? 0;
      totalBank   += d.bank      ?? 0;
      if (d.net_worth != null) { totalNw += d.net_worth; hasNw = true; }
    }

    const wEl  = document.getElementById("ov-total-wallet");
    const bEl  = document.getElementById("ov-total-bank");
    const nwEl = document.getElementById("ov-total-nw");
    if (wEl)  wEl.textContent  = fmtCoins(totalWallet);
    if (bEl)  bEl.textContent  = fmtCoins(totalBank);
    if (nwEl) nwEl.textContent = hasNw ? fmtCoins(totalNw) : "—";

    buildBalPie(data);
    buildNwPie(data);
    renderLeaderboard(data);
  } catch {}
}

document.getElementById("ov-refresh-btn").addEventListener("click", fetchOverview);

/* ── Boot ───────────────────────────────────────────── */
async function boot() {
  await loadAccounts();
  await loadMothership();
}
boot();
