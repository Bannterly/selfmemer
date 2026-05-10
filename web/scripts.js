/* ── Theme ─────────────────────────────────────────── */
const root        = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeIcon   = document.getElementById("theme-icon");
let balChart = null;
let nwChart  = null;

function applyTheme(t) {
  root.setAttribute("data-theme", t);
  themeIcon.innerHTML = t === "dark" ? `<use href="#icon-sun"/>` : `<use href="#icon-moon"/>`;
  localStorage.setItem("db-theme", t);
  if (balChart) updateChartTheme();
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
let accounts    = [];
let activeId    = null;
let mothershipId = null;   // ID of the mothership account (or null)

// Per-account transient state
const acctState = {}; // id -> { logSince, logEntries, logFilter, logAutoScroll, logCleared, clearedBefore }
function getAcctState(id) {
  if (!acctState[id]) {
    acctState[id] = {
      logSince: 0, logEntries: [], logFilter: "all",
      logAutoScroll: true, logCleared: false, clearedBefore: 0,
      cmdEnabled: { hunt:true, dig:true, search:true, beg:true, crime:true, hl:true, pm:true, adv:false },
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

function clearPolls() {
  clearInterval(_balInterval);
  clearInterval(_logInterval);
  clearInterval(_statusInterval);
  clearInterval(_transferInterval);
  _transferInterval = null;
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
  const btn = type === "items"
    ? document.getElementById("transfer-items-btn")
    : document.getElementById("transfer-coins-btn");

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
        ? `<svg class="icon" aria-hidden="true"><use href="#icon-list"/></svg> Send Items to Mothership`
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
    const ib = document.getElementById("transfer-items-btn");
    const cb = document.getElementById("transfer-coins-btn");
    if (ib) {
      ib.disabled = false;
      ib.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-list"/></svg> Send Items to Mothership`;
    }
    if (cb) {
      cb.disabled = false;
      cb.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-coins"/></svg> Send Coins to Mothership`;
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
  };
  const merged = { ...DEFAULTS, ...acc };
  document.querySelectorAll("[data-config]").forEach(el => {
    const v = merged[el.dataset.config];
    if (v !== undefined) el.value = v;
  });

  applyRisk("search", acc.search_risk || "medium");
  applyRisk("crime",  acc.crime_risk  || "medium");

  const cmds = acc.commands_enabled || {};
  ["hunt","dig","search","beg","crime","hl","pm","adv"].forEach(cmd => {
    applyToggle(cmd, cmds[cmd] === true);
  });

  // Adventure type
  setAdvValue(acc.adv_type || "Pepe Goes to Space");

  // Restore log filter button
  document.querySelectorAll(".log-filter-btn").forEach(b => b.classList.remove("active"));
  const activeBtn = document.querySelector(`.log-filter-btn[data-filter="${st.logFilter}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  // Update mothership UI and bal-tracker toggle for this account
  updateMothershipUI();
  const _acc = accounts.find(a => a.id === id);
  updateBalToggleUI(!_acc || _acc.bal_tracker_enabled !== false);

  // Start polling
  fetchBalance();
  fetchStatus();
  fetchLogs();
  _balInterval    = setInterval(fetchBalance, 30000);
  _statusInterval = setInterval(fetchStatus,  5000);
  _logInterval    = setInterval(fetchLogs,    3000);
}

/* ── Render tab bar ─────────────────────────────────── */
function renderTabs() {
  const container = document.getElementById("acct-tabs");
  container.innerHTML = "";
  for (const acc of accounts) {
    const isMothership = acc.id === mothershipId;
    const tab = document.createElement("button");
    tab.className   = "acct-tab" + (acc.id === activeId ? " active" : "") + (isMothership ? " mothership-tab" : "");
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
  document.getElementById("no-accts").style.display   = accounts.length === 0 ? "flex" : "none";
  document.getElementById("main-content").style.display = accounts.length === 0 ? "none" : "block";
}

/* ── Load accounts ──────────────────────────────────── */
async function loadAccounts() {
  try {
    const res = await fetch("/api/accounts");
    if (!res.ok) return;
    accounts = await res.json();
    renderTabs();
    if (accounts.length > 0 && !accounts.find(a => a.id === activeId)) {
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
  if (!activeId) return;
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
  if (!payload.channel_id) { showToast("Channel ID is required", "err"); return; }

  await pushAccountConfig(payload);
  showToast("Saved — bot restarting…");

  // Update tab name
  renderTabs();
  // Re-mark active
  document.querySelectorAll(".acct-tab").forEach(t => t.classList.toggle("active", t.dataset.id === activeId));
});

/* ── Token reveal ───────────────────────────────────── */
function setupReveal(inputId, btnId, iconId) {
  document.getElementById(btnId).addEventListener("click", () => {
    const input = document.getElementById(inputId);
    const icon  = document.getElementById(iconId);
    const show  = input.type === "password";
    input.type  = show ? "text" : "password";
    icon.innerHTML = show ? `<use href="#icon-eye-off"/>` : `<use href="#icon-eye"/>`;
  });
}
setupReveal("conn-token", "conn-reveal", "conn-eye-icon");
setupReveal("m-token",    "m-reveal",    "m-eye-icon");

/* ── Toggle helpers ─────────────────────────────────── */
const cmdState = {
  hunt:true, dig:true, search:true, beg:true, crime:true, hl:true, pm:true, adv:false,
};

function applyToggle(cmd, enabled) {
  cmdState[cmd] = enabled;
  document.querySelector(`.toggle[data-cmd="${cmd}"]`)?.classList.toggle("on", enabled);
  document.querySelector(`.cmd-card[data-cmd="${cmd}"]`)?.classList.toggle("disabled", !enabled);
}

function applyRisk(type, level) {
  const group = document.getElementById(`risk-${type}`);
  if (!group) return;
  group.querySelectorAll(".seg-btn").forEach(btn => {
    btn.className = "seg-btn";
    if (btn.dataset.level === level) btn.classList.add(`active-${level}`);
  });
}

/* ── Command toggle clicks ──────────────────────────── */
document.querySelectorAll(".cmd-card").forEach(card => {
  card.addEventListener("click", () => {
    const cmd = card.dataset.cmd;
    applyToggle(cmd, !cmdState[cmd]);
    pushAccountConfig({ commands_enabled: { ...cmdState } });
  });
});

/* ── Risk buttons ───────────────────────────────────── */
document.querySelectorAll(".seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const { type, level } = btn.dataset;
    applyRisk(type, level);
    pushAccountConfig({ [`${type}_risk`]: level });
  });
});

/* ── Adventure custom dropdown ───────────────────── */
const advDropdown = document.getElementById("adv-dropdown");
const advTrigger  = document.getElementById("adv-trigger");
const advPanel    = document.getElementById("adv-panel");
const advTriggerName = document.getElementById("adv-trigger-name");

let _advValue = "Pepe Goes to Space";

function setAdvValue(val) {
  _advValue = val;
  advTriggerName.textContent = val;
  advPanel.querySelectorAll(".adv-option").forEach(o => {
    o.classList.toggle("selected", o.dataset.value === val);
  });
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

document.getElementById("transfer-coins-btn").addEventListener("click", () => {
  triggerTransfer("coins");
});

/* ── Boot ───────────────────────────────────────────── */
async function boot() {
  await loadAccounts();
  await loadMothership();
}
boot();
