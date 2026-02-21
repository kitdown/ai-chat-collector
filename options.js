let allChats = {};
let allPlatforms = {};
let activeTagFilters = new Set(); // currently selected tags for filtering
let activePlatformFilter = null;  // null = all, or 'claude' / 'chatgpt' / 'grok'
let activeSort = 'lastSeen';      // 'lastSeen' | 'savedAt' | 'openCount'
let autoTagMap = {};              // { prefix: Set<chatId> }

// --- Stop words (RU + EN + platform-specific) ---
const STOP_WORDS = new Set([
  // EN
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'how', 'what', 'about',
  'into', 'are', 'was', 'were', 'will', 'been', 'have', 'has', 'had', 'not',
  'but', 'can', 'all', 'its', 'you', 'your', 'our', 'who', 'new', 'more',
  'also', 'than', 'then', 'when', 'just', 'only', 'very', 'most', 'some',
  // RU
  'для', 'как', 'что', 'это', 'при', 'его', 'все', 'они', 'или', 'уже',
  'так', 'тоже', 'без', 'где', 'кто', 'чем', 'над', 'под', 'про', 'еще',
  'бы', 'же', 'ли', 'на', 'по', 'от', 'до', 'за', 'из', 'не', 'ни',
  // Platform-specific
  'claude', 'chatgpt', 'grok',
]);

const MIN_PREFIX_LEN = 5;
const MIN_WORD_LEN = 3;
const MIN_CHATS_FOR_TAG = 2;

// --- Platform icons ---
const PLATFORM_ICONS = {
  claude: '\uD83D\uDFE0',    // 🟠
  chatgpt: '\uD83D\uDFE2',   // 🟢
  grok: '\u26AA',             // ⚪
};

const PLATFORM_NAMES = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  grok: 'Grok',
};

// --- Init ---

document.addEventListener('DOMContentLoaded', async () => {
  // Check URL params for pre-selected tag (from popup link)
  const urlParams = new URLSearchParams(window.location.search);
  const tagParam = urlParams.get('tag');
  if (tagParam) {
    activeTagFilters.add(tagParam);
  }

  // Get platform config from background
  allPlatforms = await chrome.runtime.sendMessage({ type: 'GET_PLATFORMS' }) || {};

  await loadChats();

  document.getElementById('search').addEventListener('input', () => {
    renderTagBar();
    renderChats();
  });

  document.getElementById('sortSelect').addEventListener('change', (e) => {
    activeSort = e.target.value;
    renderChats();
  });

  document.getElementById('randomBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'OPEN_RANDOM_CHAT', platform: activePlatformFilter });
  });

  document.getElementById('analyticsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('analytics.html') });
  });
});

async function loadChats() {
  allChats = await chrome.runtime.sendMessage({ type: 'GET_CHATS' }) || {};
  document.getElementById('count').textContent = Object.keys(allChats).length;
  updateStats();
  renderPlatformFilter();
  buildAutoTags();
  renderTagBar();
  renderChats();
}

function updateStats() {
  const statsEl = document.getElementById('stats');
  const count = Object.keys(allChats).length;
  statsEl.textContent = `${count} chat${count !== 1 ? 's' : ''} saved`;
}

// --- Platform filter ---

function getPlatformCounts() {
  const counts = {};
  for (const chat of Object.values(allChats)) {
    const p = chat.platform || 'unknown';
    counts[p] = (counts[p] || 0) + 1;
  }
  return counts;
}

function renderPlatformFilter() {
  const container = document.getElementById('platformFilter');
  const counts = getPlatformCounts();
  const platforms = Object.keys(counts).filter(p => p !== 'unknown').sort();

  // Only show filter if >1 platform
  if (platforms.length <= 1) {
    container.innerHTML = '';
    return;
  }

  const allActive = activePlatformFilter === null;
  let html = `<button class="platform-btn ${allActive ? 'active' : ''}" data-platform="all">All</button>`;
  for (const p of platforms) {
    const isActive = activePlatformFilter === p;
    const icon = PLATFORM_ICONS[p] || '';
    const name = PLATFORM_NAMES[p] || p;
    html += `<button class="platform-btn ${isActive ? 'active' : ''}" data-platform="${p}">${icon} ${name} <span class="platform-count">${counts[p]}</span></button>`;
  }
  container.innerHTML = html;

  container.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.platform;
      activePlatformFilter = p === 'all' ? null : p;
      renderPlatformFilter();
      buildAutoTags();
      renderTagBar();
      renderChats();
    });
  });
}

// --- Auto-tag algorithm ---

function tokenize(title) {
  // Remove " - Claude" / " - ChatGPT" / " - Grok" suffix, then split into words
  const cleaned = title
    .replace(/\s*-\s*Claude\s*$/i, '')
    .replace(/\s*-\s*ChatGPT\s*$/i, '')
    .replace(/\s*-\s*Grok\s*$/i, '');
  // Split on non-word chars (supports unicode/cyrillic)
  return cleaned.toLowerCase().split(/[^a-zа-яёA-ZА-ЯЁ0-9]+/).filter(Boolean);
}

function getPrefix(word) {
  if (word.length <= MIN_PREFIX_LEN) return word;
  return word.slice(0, MIN_PREFIX_LEN);
}

function getFilteredChats() {
  // Returns entries filtered by platform (if active)
  let entries = Object.entries(allChats);
  if (activePlatformFilter) {
    entries = entries.filter(([, chat]) => chat.platform === activePlatformFilter);
  }
  return entries;
}

function buildAutoTags() {
  const filteredEntries = getFilteredChats();

  // Map<prefix, Set<chatId>>
  const prefixToChatIds = new Map();
  // Map<prefix, Set<fullWord>> — for display purposes
  const prefixToWords = new Map();

  for (const [id, chat] of filteredEntries) {
    const words = tokenize(chat.title);
    const seenPrefixes = new Set(); // avoid counting same prefix twice per chat

    for (const word of words) {
      if (word.length < MIN_WORD_LEN) continue;
      if (STOP_WORDS.has(word)) continue;
      // Skip pure numbers
      if (/^\d+$/.test(word)) continue;

      const prefix = getPrefix(word);
      if (seenPrefixes.has(prefix)) continue;
      seenPrefixes.add(prefix);

      if (!prefixToChatIds.has(prefix)) {
        prefixToChatIds.set(prefix, new Set());
        prefixToWords.set(prefix, new Set());
      }
      prefixToChatIds.get(prefix).add(id);
      prefixToWords.get(prefix).add(word);
    }
  }

  // Filter: only prefixes with >= MIN_CHATS_FOR_TAG chats
  autoTagMap = {};
  for (const [prefix, chatIds] of prefixToChatIds.entries()) {
    if (chatIds.size >= MIN_CHATS_FOR_TAG) {
      const words = prefixToWords.get(prefix);
      // Use prefix* as label, unless all words are the same — then use the word itself
      const uniqueWords = [...words];
      const label = uniqueWords.length === 1 && uniqueWords[0].length <= MIN_PREFIX_LEN + 2
        ? uniqueWords[0]
        : prefix + '*';
      autoTagMap[prefix] = {
        label,
        chatIds: [...chatIds],
        count: chatIds.size,
      };
    }
  }
}

function getAutoTagsForChat(chatId) {
  const tags = [];
  for (const [prefix, data] of Object.entries(autoTagMap)) {
    if (data.chatIds.includes(chatId)) {
      tags.push({ prefix, label: data.label, type: 'auto' });
    }
  }
  return tags;
}

function getManualTagsForChat(chat) {
  return (chat.tags || []).map(t => ({ label: t, type: 'manual' }));
}

function getAllManualTags() {
  const tagCounts = new Map();
  const filteredEntries = getFilteredChats();
  for (const [id, chat] of filteredEntries) {
    for (const tag of (chat.tags || [])) {
      if (!tagCounts.has(tag)) tagCounts.set(tag, new Set());
      tagCounts.get(tag).add(id);
    }
  }
  return tagCounts;
}

// --- Tag bar ---

function renderTagBar() {
  const tagBar = document.getElementById('tagBar');
  const query = document.getElementById('search').value.toLowerCase().trim();

  // Combine auto-tags and manual tags
  const allTags = [];

  // Auto tags
  for (const [prefix, data] of Object.entries(autoTagMap)) {
    allTags.push({
      key: 'auto:' + prefix,
      label: data.label,
      count: data.count,
      type: 'auto',
    });
  }

  // Manual tags (that appear on >=1 chat)
  const manualTags = getAllManualTags();
  for (const [tag, chatIds] of manualTags.entries()) {
    allTags.push({
      key: 'manual:' + tag,
      label: tag,
      count: chatIds.size,
      type: 'manual',
    });
  }

  // Sort by count descending
  allTags.sort((a, b) => b.count - a.count);

  if (allTags.length === 0) {
    tagBar.innerHTML = '';
    return;
  }

  tagBar.innerHTML = allTags.map(tag => {
    const isActive = activeTagFilters.has(tag.key);
    return `<button class="tag-pill ${isActive ? 'tag-active' : ''} tag-${tag.type}" data-key="${escapeHtml(tag.key)}">
      ${escapeHtml(tag.label)} <span class="tag-count">${tag.count}</span>
    </button>`;
  }).join('');

  // Click handlers
  tagBar.querySelectorAll('.tag-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const key = pill.dataset.key;
      if (activeTagFilters.has(key)) {
        activeTagFilters.delete(key);
      } else {
        activeTagFilters.add(key);
      }
      renderTagBar();
      renderChats();
    });
  });
}

// --- Get chat IDs matching active tag filters ---

function getChatIdsMatchingTags() {
  if (activeTagFilters.size === 0) return null; // no filter

  const matchingIds = new Set();
  const manualTags = getAllManualTags();

  for (const key of activeTagFilters) {
    if (key.startsWith('auto:')) {
      const prefix = key.slice(5);
      if (autoTagMap[prefix]) {
        for (const id of autoTagMap[prefix].chatIds) matchingIds.add(id);
      }
    } else if (key.startsWith('manual:')) {
      const tag = key.slice(7);
      if (manualTags.has(tag)) {
        for (const id of manualTags.get(tag)) matchingIds.add(id);
      }
    }
  }

  return matchingIds;
}

// --- Render chats ---

function renderChats() {
  const query = document.getElementById('search').value.toLowerCase().trim();
  const chatList = document.getElementById('chatList');
  const emptyState = document.getElementById('emptyState');
  const noResults = document.getElementById('noResults');

  const entries = getFilteredChats();

  if (entries.length === 0 && !activePlatformFilter) {
    chatList.innerHTML = '';
    emptyState.style.display = 'block';
    noResults.style.display = 'none';
    document.getElementById('randomBtn').disabled = true;
    return;
  }

  emptyState.style.display = 'none';
  document.getElementById('randomBtn').disabled = false;

  // Filter by tag selection
  const tagMatchIds = getChatIdsMatchingTags();

  // Filter by search query (title + manual tags)
  let filtered = entries;
  if (query) {
    filtered = filtered.filter(([id, chat]) => {
      const titleMatch = chat.title.toLowerCase().includes(query);
      const tagMatch = (chat.tags || []).some(t => t.includes(query));
      // Also match auto-tag labels
      const autoTags = getAutoTagsForChat(id);
      const autoMatch = autoTags.some(t => t.label.includes(query));
      return titleMatch || tagMatch || autoMatch;
    });
  }

  // Filter by active tags
  if (tagMatchIds) {
    filtered = filtered.filter(([id]) => tagMatchIds.has(id));
  }

  if (filtered.length === 0) {
    chatList.innerHTML = '';
    noResults.style.display = 'block';
    return;
  }

  noResults.style.display = 'none';

  // Sort
  if (activeSort === 'openCount') {
    filtered.sort(([, a], [, b]) => (b.openCount || 0) - (a.openCount || 0));
  } else if (activeSort === 'savedAt') {
    filtered.sort(([, a], [, b]) => new Date(b.savedAt) - new Date(a.savedAt));
  } else {
    filtered.sort(([, a], [, b]) => new Date(b.lastSeen) - new Date(a.lastSeen));
  }

  chatList.innerHTML = filtered.map(([id, chat]) => {
    const autoTags = getAutoTagsForChat(id);
    const manualTags = getManualTagsForChat(chat);
    const allChatTags = [...autoTags, ...manualTags];
    const platformIcon = PLATFORM_ICONS[chat.platform] || '';
    const platformName = PLATFORM_NAMES[chat.platform] || chat.platform || '';

    const tagsHtml = allChatTags.length > 0
      ? `<div class="chat-tags">
          ${allChatTags.map(t => {
            if (t.type === 'manual') {
              return `<span class="tag-mini tag-manual">${escapeHtml(t.label)}<button class="tag-remove" data-chat="${id}" data-tag="${escapeHtml(t.label)}">&times;</button></span>`;
            }
            return `<span class="tag-mini tag-auto">${escapeHtml(t.label)}</span>`;
          }).join('')}
          <button class="tag-add-btn" data-chat="${id}" title="Add tag">+</button>
        </div>`
      : `<div class="chat-tags"><button class="tag-add-btn" data-chat="${id}" title="Add tag">+</button></div>`;

    return `
    <div class="chat-item" data-id="${id}">
      <div class="chat-info">
        <div class="chat-title-row">
          <span class="platform-icon" title="${platformName}">${platformIcon}</span>
          <a href="${escapeHtml(chat.url)}" target="_blank" class="chat-title">${escapeHtml(chat.title)}</a>
        </div>
        <span class="chat-meta">Saved ${timeAgo(new Date(chat.savedAt))} · Last seen ${timeAgo(new Date(chat.lastSeen))}${chat.openCount > 1 ? ` · Opened ${chat.openCount}x` : ''}</span>
        ${tagsHtml}
      </div>
      <button class="btn btn-danger btn-small remove-btn" data-id="${id}" title="Remove from collection">&times;</button>
    </div>`;
  }).join('');

  // Attach remove chat handlers
  chatList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const chatId = e.target.dataset.id;
      await chrome.runtime.sendMessage({ type: 'REMOVE_CHAT', id: chatId });
      await loadChats();
    });
  });

  // Attach remove tag handlers
  chatList.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const chatId = e.target.dataset.chat;
      const tag = e.target.dataset.tag;
      await chrome.runtime.sendMessage({ type: 'REMOVE_TAG', id: chatId, tag });
      await loadChats();
    });
  });

  // Attach add tag handlers
  chatList.querySelectorAll('.tag-add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chatId = e.target.dataset.chat;
      showAddTagInput(e.target, chatId);
    });
  });
}

// --- Add tag inline input ---

function showAddTagInput(btnElement, chatId) {
  // Don't create if already exists
  if (btnElement.parentElement.querySelector('.tag-input-inline')) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-input-inline';
  input.placeholder = 'tag name...';
  input.maxLength = 30;

  btnElement.parentElement.insertBefore(input, btnElement);
  input.focus();

  async function submitTag() {
    const tag = input.value.trim();
    if (tag) {
      await chrome.runtime.sendMessage({ type: 'ADD_TAG', id: chatId, tag });
      await loadChats();
    } else {
      input.remove();
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitTag();
    if (e.key === 'Escape') input.remove();
  });

  input.addEventListener('blur', submitTag);
}

// --- Helpers ---

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
