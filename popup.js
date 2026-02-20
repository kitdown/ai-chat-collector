// --- Same tag logic as options.js (lightweight copy for popup) ---

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'how', 'what', 'about',
  'into', 'are', 'was', 'were', 'will', 'been', 'have', 'has', 'had', 'not',
  'but', 'can', 'all', 'its', 'you', 'your', 'our', 'who', 'new', 'more',
  'also', 'than', 'then', 'when', 'just', 'only', 'very', 'most', 'some',
  'для', 'как', 'что', 'это', 'при', 'его', 'все', 'они', 'или', 'уже',
  'так', 'тоже', 'без', 'где', 'кто', 'чем', 'над', 'под', 'про', 'еще',
  'бы', 'же', 'ли', 'на', 'по', 'от', 'до', 'за', 'из', 'не', 'ни',
  'claude', 'chatgpt', 'grok',
]);
const MIN_PREFIX_LEN = 5;
const MIN_WORD_LEN = 3;
const MIN_CHATS_FOR_TAG = 2;
const MAX_POPUP_TAGS = 8;

function tokenize(title) {
  const cleaned = title
    .replace(/\s*-\s*Claude\s*$/i, '')
    .replace(/\s*-\s*ChatGPT\s*$/i, '')
    .replace(/\s*-\s*Grok\s*$/i, '');
  return cleaned.toLowerCase().split(/[^a-zа-яёA-ZА-ЯЁ0-9]+/).filter(Boolean);
}

function buildTopTags(chats) {
  const prefixToChatIds = new Map();
  const prefixToWords = new Map();

  for (const [id, chat] of Object.entries(chats)) {
    const words = tokenize(chat.title);
    const seen = new Set();
    for (const word of words) {
      if (word.length < MIN_WORD_LEN || STOP_WORDS.has(word) || /^\d+$/.test(word)) continue;
      const prefix = word.length <= MIN_PREFIX_LEN ? word : word.slice(0, MIN_PREFIX_LEN);
      if (seen.has(prefix)) continue;
      seen.add(prefix);
      if (!prefixToChatIds.has(prefix)) {
        prefixToChatIds.set(prefix, new Set());
        prefixToWords.set(prefix, new Set());
      }
      prefixToChatIds.get(prefix).add(id);
      prefixToWords.get(prefix).add(word);
    }
  }

  const tags = [];
  for (const [prefix, chatIds] of prefixToChatIds.entries()) {
    if (chatIds.size >= MIN_CHATS_FOR_TAG) {
      const words = [...prefixToWords.get(prefix)];
      const label = words.length === 1 && words[0].length <= MIN_PREFIX_LEN + 2
        ? words[0] : prefix + '*';
      tags.push({ key: 'auto:' + prefix, label, count: chatIds.size });
    }
  }

  // Also add manual tags
  const manualCounts = new Map();
  for (const [id, chat] of Object.entries(chats)) {
    for (const tag of (chat.tags || [])) {
      if (!manualCounts.has(tag)) manualCounts.set(tag, 0);
      manualCounts.set(tag, manualCounts.get(tag) + 1);
    }
  }
  for (const [tag, count] of manualCounts.entries()) {
    tags.push({ key: 'manual:' + tag, label: tag, count });
  }

  tags.sort((a, b) => b.count - a.count);
  return tags.slice(0, MAX_POPUP_TAGS);
}

// --- Platform icons ---

const PLATFORM_ICONS = {
  claude: '\uD83D\uDFE0',    // 🟠
  chatgpt: '\uD83D\uDFE2',   // 🟢
  grok: '\u26AA',             // ⚪
};

function getPlatformCounts(chats) {
  const counts = {};
  for (const chat of Object.values(chats)) {
    const p = chat.platform || 'unknown';
    counts[p] = (counts[p] || 0) + 1;
  }
  return counts;
}

// --- Init ---

document.addEventListener('DOMContentLoaded', async () => {
  const countEl = document.getElementById('count');
  const randomBtn = document.getElementById('randomBtn');
  const emptyState = document.getElementById('emptyState');
  const manageLink = document.getElementById('manageLink');
  const tagsSection = document.getElementById('tagsSection');
  const popupTags = document.getElementById('popupTags');
  const platformStats = document.getElementById('platformStats');

  const chats = await chrome.runtime.sendMessage({ type: 'GET_CHATS' }) || {};
  const chatCount = Object.keys(chats).length;
  countEl.textContent = chatCount;

  if (chatCount === 0) {
    randomBtn.disabled = true;
    emptyState.style.display = 'block';
  } else {
    // Show platform breakdown
    const pCounts = getPlatformCounts(chats);
    const platformHtml = Object.entries(pCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([platform, count]) => {
        const icon = PLATFORM_ICONS[platform] || '\u2753';
        const name = platform.charAt(0).toUpperCase() + platform.slice(1);
        return `<span class="popup-platform">${icon} ${name}: ${count}</span>`;
      }).join('');
    platformStats.innerHTML = platformHtml;

    // Build and show tags
    const topTags = buildTopTags(chats);
    if (topTags.length > 0) {
      tagsSection.style.display = 'block';
      popupTags.innerHTML = topTags.map(t =>
        `<a href="#" class="popup-tag" data-key="${t.key}">
          ${t.label} <span class="ptag-count">${t.count}</span>
        </a>`
      ).join('');

      // Click → open options page with tag filter
      popupTags.querySelectorAll('.popup-tag').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const key = el.dataset.key;
          const optionsUrl = chrome.runtime.getURL('options.html') + '?tag=' + encodeURIComponent(key);
          chrome.tabs.create({ url: optionsUrl });
          window.close();
        });
      });
    }
  }

  randomBtn.addEventListener('click', async () => {
    const result = await chrome.runtime.sendMessage({ type: 'OPEN_RANDOM_CHAT' });
    if (result?.ok) window.close();
  });

  manageLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });
});
