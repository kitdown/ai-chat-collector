// --- Analytics for AI Chat Collector ---

const PLATFORM_COLORS = {
  claude: '#c96442',
  chatgpt: '#10a37f',
  grok: '#888888',
};

const PLATFORM_NAMES = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  grok: 'Grok',
};

const PLATFORM_ICONS = {
  claude: '\uD83D\uDFE0',
  chatgpt: '\uD83D\uDFE2',
  grok: '\u26AA',
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// --- Init ---

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('backLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const chats = await chrome.runtime.sendMessage({ type: 'GET_CHATS' }) || {};
  const activityLog = await chrome.runtime.sendMessage({ type: 'GET_ACTIVITY_LOG' }) || [];
  const chatList = Object.values(chats);
  const chatEntries = Object.entries(chats);

  if (chatList.length === 0 && activityLog.length === 0) {
    document.getElementById('content').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
    return;
  }

  renderSummaryCards(chatList, activityLog);
  renderDailyChart(chatList, activityLog);
  renderMonthlyChart(chatList, activityLog);
  renderPlatformBars(chatList, activityLog);
  renderWeekdayChart(chatList, activityLog);
  renderTopChats(chatEntries);
});

// --- Summary Cards ---

function renderSummaryCards(chats, activityLog) {
  const container = document.getElementById('summaryCards');
  const totalChats = chats.length;
  // Use activityLog for total opens if available, otherwise fall back to openCount sum
  const totalOpens = activityLog.length > 0
    ? activityLog.length
    : chats.reduce((sum, c) => sum + (c.openCount || 1), 0);
  const avgOpens = totalChats > 0 ? (totalOpens / totalChats).toFixed(1) : 0;

  let topChat = null;
  let maxOpens = 0;
  for (const c of chats) {
    if ((c.openCount || 0) > maxOpens) {
      maxOpens = c.openCount;
      topChat = c;
    }
  }

  // First chat date
  let firstDate = null;
  for (const c of chats) {
    const d = new Date(c.savedAt);
    if (!firstDate || d < firstDate) firstDate = d;
  }
  if (activityLog.length > 0) {
    const logFirst = new Date(activityLog[0].ts);
    if (!firstDate || logFirst < firstDate) firstDate = logFirst;
  }
  const daysTracking = firstDate ? Math.max(1, Math.floor((new Date() - firstDate) / 86400000)) : 0;
  const chatsPerDay = daysTracking > 0 ? (totalChats / daysTracking).toFixed(1) : 0;

  container.innerHTML = `
    <div class="summary-card">
      <div class="card-value">${totalChats}</div>
      <div class="card-label">Total chats</div>
      <div class="card-sub">${chatsPerDay}/day avg</div>
    </div>
    <div class="summary-card">
      <div class="card-value">${totalOpens}</div>
      <div class="card-label">Total opens</div>
      <div class="card-sub">${daysTracking} days tracked</div>
    </div>
    <div class="summary-card">
      <div class="card-value">${avgOpens}</div>
      <div class="card-label">Avg opens/chat</div>
    </div>
    <div class="summary-card">
      <div class="card-value">${maxOpens}x</div>
      <div class="card-label">Most opened</div>
      <div class="card-sub">${topChat ? escapeHtml(topChat.title) : '—'}</div>
    </div>
  `;
}

// --- Daily Chart (last 30 days) ---

function renderDailyChart(chats, activityLog) {
  const canvas = document.getElementById('dailyChart');
  const days = 30;
  const now = new Date();
  const labels = [];
  const newChats = [];
  const opens = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    labels.push(i === 0 ? 'Today' : i === 1 ? 'Yday' : `${date.getDate()}/${date.getMonth() + 1}`);
    newChats.push(0);
    opens.push(0);
  }

  // New chats by savedAt
  for (const chat of chats) {
    const savedDate = new Date(chat.savedAt);
    const savedIdx = dayIndex(savedDate, now, days);
    if (savedIdx >= 0 && savedIdx < days) {
      newChats[savedIdx]++;
    }
  }

  // Opens from activity log (accurate, includes deleted chats)
  if (activityLog.length > 0) {
    for (const entry of activityLog) {
      const d = new Date(entry.ts);
      const idx = dayIndex(d, now, days);
      if (idx >= 0 && idx < days) {
        opens[idx]++;
      }
    }
  } else {
    // Fallback: use lastSeen from chats
    for (const chat of chats) {
      const seenDate = new Date(chat.lastSeen);
      const seenIdx = dayIndex(seenDate, now, days);
      if (seenIdx >= 0 && seenIdx < days) {
        opens[seenIdx]++;
      }
    }
  }

  drawBarChart(canvas, labels, [
    { data: newChats, color: '#c96442', label: 'New' },
    { data: opens, color: '#e8c4b4', label: 'Opens' },
  ]);
}

function dayIndex(date, now, totalDays) {
  const diff = Math.floor((now - date) / 86400000);
  return totalDays - 1 - diff;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// --- Monthly Chart ---

function renderMonthlyChart(chats, activityLog) {
  const canvas = document.getElementById('monthlyChart');

  // Get range of months
  const monthCounts = new Map();
  for (const chat of chats) {
    const d = new Date(chat.savedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
  }

  if (monthCounts.size === 0) return;

  // Sort by month key
  const sorted = [...monthCounts.entries()].sort(([a], [b]) => a.localeCompare(b));

  // Fill gaps
  const labels = [];
  const data = [];
  const first = sorted[0][0];
  const last = sorted[sorted.length - 1][0];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);

  while (y < ly || (y === ly && m <= lm)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    labels.push(`${monthNames[m - 1]} ${y % 100}`);
    data.push(monthCounts.get(key) || 0);
    m++;
    if (m > 12) { m = 1; y++; }
  }

  drawBarChart(canvas, labels, [
    { data, color: '#c96442', label: 'New chats' },
  ]);
}

// --- Platform Bars ---

function renderPlatformBars(chats, activityLog) {
  const container = document.getElementById('platformBars');
  const counts = {};
  for (const c of chats) {
    const p = c.platform || 'unknown';
    counts[p] = (counts[p] || 0) + 1;
  }

  const total = chats.length;
  const platforms = Object.entries(counts).sort(([, a], [, b]) => b - a);

  container.innerHTML = platforms.map(([platform, count]) => {
    const pct = total > 0 ? (count / total * 100) : 0;
    const color = PLATFORM_COLORS[platform] || '#ccc';
    const icon = PLATFORM_ICONS[platform] || '';
    const name = PLATFORM_NAMES[platform] || platform;
    return `
      <div class="platform-row">
        <span class="platform-label">${icon} ${name}</span>
        <div class="platform-bar-bg">
          <div class="platform-bar-fill" style="width:${pct}%; background:${color}"></div>
        </div>
        <span class="platform-bar-text">${count} (${Math.round(pct)}%)</span>
      </div>
    `;
  }).join('');
}

// --- Weekday Chart ---

function renderWeekdayChart(chats, activityLog) {
  const canvas = document.getElementById('weekdayChart');
  const counts = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun

  if (activityLog.length > 0) {
    // Use activity log for accurate day-of-week stats
    for (const entry of activityLog) {
      const d = new Date(entry.ts);
      let dow = d.getDay();
      dow = dow === 0 ? 6 : dow - 1;
      counts[dow]++;
    }
  } else {
    // Fallback: use savedAt + lastSeen
    for (const chat of chats) {
      const d = new Date(chat.savedAt);
      let dow = d.getDay();
      dow = dow === 0 ? 6 : dow - 1;
      counts[dow]++;

      const ls = new Date(chat.lastSeen);
      let lsDow = ls.getDay();
      lsDow = lsDow === 0 ? 6 : lsDow - 1;
      counts[lsDow]++;
    }
  }

  drawBarChart(canvas, DAY_NAMES, [
    { data: counts, color: '#c96442', label: 'Activity' },
  ]);
}

// --- Top 10 Chats ---

function renderTopChats(chatEntries) {
  const table = document.getElementById('topChats');
  const sorted = chatEntries
    .sort(([, a], [, b]) => (b.openCount || 0) - (a.openCount || 0))
    .slice(0, 10);

  if (sorted.length === 0) {
    table.innerHTML = '<tr><td>No data</td></tr>';
    return;
  }

  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Chat</th>
        <th></th>
        <th style="text-align:right">Opens</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.map(([id, chat], i) => {
        const icon = PLATFORM_ICONS[chat.platform] || '';
        return `
          <tr>
            <td class="rank">${i + 1}</td>
            <td><a href="${escapeHtml(chat.url)}" target="_blank" class="chat-link">${escapeHtml(chat.title)}</a></td>
            <td>${icon}</td>
            <td class="opens">${chat.openCount || 1}x</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;
}

// --- Canvas Bar Chart ---

function drawBarChart(canvas, labels, datasets) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padding = { top: 10, right: 10, bottom: 30, left: 35 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  // Find max value across all datasets
  let maxVal = 0;
  for (const ds of datasets) {
    for (const v of ds.data) {
      if (v > maxVal) maxVal = v;
    }
  }
  if (maxVal === 0) maxVal = 1;

  // Round up to nice number
  const niceMax = getNiceMax(maxVal);
  const barCount = labels.length;
  const groupWidth = chartW / barCount;
  const barWidth = Math.max(2, (groupWidth * 0.7) / datasets.length);
  const barGap = datasets.length > 1 ? 2 : 0;

  // Draw grid lines
  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 1;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + chartH - (i / gridLines * chartH);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    // Y-axis labels
    const val = Math.round(niceMax * i / gridLines);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val, padding.left - 6, y + 3);
  }

  // Draw bars
  for (let i = 0; i < barCount; i++) {
    const groupX = padding.left + i * groupWidth + groupWidth * 0.15;

    for (let d = 0; d < datasets.length; d++) {
      const val = datasets[d].data[i];
      const barH = (val / niceMax) * chartH;
      const x = groupX + d * (barWidth + barGap);
      const y = padding.top + chartH - barH;

      ctx.fillStyle = datasets[d].color;
      ctx.beginPath();
      // Rounded top corners
      const radius = Math.min(3, barWidth / 2);
      roundedRect(ctx, x, y, barWidth, barH, radius);
      ctx.fill();
    }

    // X-axis label
    ctx.fillStyle = '#999';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';

    // Show every Nth label to avoid overlap
    const maxLabels = Math.floor(chartW / 35);
    const step = Math.max(1, Math.ceil(barCount / maxLabels));
    if (i % step === 0 || i === barCount - 1) {
      ctx.fillText(labels[i], padding.left + i * groupWidth + groupWidth / 2, h - 8);
    }
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  if (h < 1) { h = 1; y = y + h - 1; }
  r = Math.min(r, h / 2, w / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function getNiceMax(max) {
  if (max <= 5) return 5;
  if (max <= 10) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  if (normalized <= 1.5) return 1.5 * magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 3) return 3 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
