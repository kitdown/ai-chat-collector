// --- Platform definitions ---

const PLATFORMS = {
  claude: {
    name: 'Claude',
    urlPattern: /^https:\/\/claude\.ai\/chat\/([a-f0-9-]+)/,
    genericTitles: ['claude', 'claude.ai'],
    icon: '🟠',
  },
  chatgpt: {
    name: 'ChatGPT',
    urlPattern: /^https:\/\/chatgpt\.com\/c\/([a-f0-9-]+)/,
    genericTitles: ['chatgpt', 'new conversation', 'chatgpt - new conversation'],
    icon: '🟢',
  },
  grok: {
    name: 'Grok',
    urlPattern: /^https:\/\/grok\.com\/c\/([a-zA-Z0-9_-]+)/,
    genericTitles: ['grok', 'grok — truth-seeking ai chatbot by xai | voice, image & video'],
    icon: '⚪',
  },
};

function detectPlatform(url) {
  if (!url) return null;
  for (const [key, platform] of Object.entries(PLATFORMS)) {
    if (platform.urlPattern.test(url)) return key;
  }
  return null;
}

function extractChatId(url) {
  if (!url) return null;
  for (const platform of Object.values(PLATFORMS)) {
    const match = url.match(platform.urlPattern);
    if (match) return match[1];
  }
  return null;
}

function isGenericTitle(title) {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  for (const platform of Object.values(PLATFORMS)) {
    for (const generic of platform.genericTitles) {
      if (t === generic || t.startsWith(generic + ' -') || t.startsWith(generic + '.')) return true;
    }
  }
  return false;
}

// --- Storage helpers ---

async function getChats() {
  const data = await chrome.storage.local.get('chats');
  return data.chats || {};
}

async function saveChats(chats) {
  await chrome.storage.local.set({ chats });
}

// --- Activity log: lightweight array of {ts, platform} for analytics ---

async function logOpen(platform) {
  const data = await chrome.storage.local.get('activityLog');
  const log = data.activityLog || [];
  log.push({ ts: Date.now(), p: platform });
  // Keep last 10000 entries max (~200KB) to avoid storage bloat
  if (log.length > 10000) log.splice(0, log.length - 10000);
  await chrome.storage.local.set({ activityLog: log });
}

async function saveChat(id, chatData) {
  const chats = await getChats();
  const existing = chats[id];
  chats[id] = {
    url: chatData.url,
    title: chatData.title || existing?.title || 'Untitled',
    platform: chatData.platform || existing?.platform || 'unknown',
    tags: existing?.tags || [],
    savedAt: existing?.savedAt || new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    openCount: (existing?.openCount || 0) + 1,
    pinned: existing?.pinned || false,
  };
  await saveChats(chats);
  logOpen(chats[id].platform);
}

async function togglePin(id) {
  const chats = await getChats();
  if (!chats[id]) return;
  chats[id].pinned = !chats[id].pinned;
  await saveChats(chats);
}

async function addTagToChat(id, tag) {
  const chats = await getChats();
  if (!chats[id]) return;
  if (!chats[id].tags) chats[id].tags = [];
  const normalizedTag = tag.trim().toLowerCase();
  if (!chats[id].tags.includes(normalizedTag)) {
    chats[id].tags.push(normalizedTag);
    await saveChats(chats);
  }
}

async function removeTagFromChat(id, tag) {
  const chats = await getChats();
  if (!chats[id] || !chats[id].tags) return;
  chats[id].tags = chats[id].tags.filter(t => t !== tag);
  await saveChats(chats);
}

async function removeChat(id) {
  const chats = await getChats();
  delete chats[id];
  await saveChats(chats);
}

// --- Tab tracking ---

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const chatId = extractChatId(tab.url);
  const platform = detectPlatform(tab.url);
  if (!chatId || !platform) return;

  chrome.tabs.sendMessage(tabId, { type: 'GET_TITLE' }).then((response) => {
    if (response?.title && !isGenericTitle(response.title)) {
      saveChat(chatId, { url: tab.url, title: response.title, platform });
    }
  }).catch(() => {
    if (!isGenericTitle(tab.title)) {
      saveChat(chatId, { url: tab.url, title: tab.title, platform });
    }
  });
});

// Handle dynamic title changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.title) return;
  const chatId = extractChatId(tab.url);
  const platform = detectPlatform(tab.url);
  if (!chatId || !platform) return;

  const title = changeInfo.title;
  if (title && !isGenericTitle(title)) {
    saveChat(chatId, { url: tab.url, title, platform });
  }
});

// --- Deleted chat detection ---
// Most platforms show an error page (detected by content script).
// ChatGPT redirects to the homepage — we detect that here by tracking
// which tabs had a chat URL and noticing when they navigate away.

const tabChatMap = new Map(); // tabId → chatId (tracks tabs that had a chat open)

// Track tabs that open chat URLs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const chatId = extractChatId(tab.url);
  if (chatId) {
    tabChatMap.set(tabId, chatId);
  } else if (tabChatMap.has(tabId)) {
    // Tab HAD a chat URL but now doesn't — possible redirect (ChatGPT deletes → homepage)
    const previousChatId = tabChatMap.get(tabId);
    tabChatMap.delete(tabId);
    // Only treat as deleted if we're still on the same domain's homepage
    const url = tab.url || '';
    if (url === 'https://chatgpt.com/' || url === 'https://chatgpt.com') {
      console.log(`[AIChatCollector] ChatGPT redirected to homepage — chat ${previousChatId} is deleted`);
      removeChat(previousChatId);
    }
  }
});

// Clean up map when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  tabChatMap.delete(tabId);
});

// --- Startup: clean up and migrate ---

async function startupMigration() {
  const chats = await getChats();
  let changed = false;

  for (const [id, chat] of Object.entries(chats)) {
    // Remove chats with generic titles
    if (isGenericTitle(chat.title)) {
      delete chats[id];
      changed = true;
      continue;
    }

    // Fix missing platform — detect from URL
    if (!chat.platform || chat.platform === 'unknown') {
      const detected = detectPlatform(chat.url);
      if (detected) {
        chat.platform = detected;
        changed = true;
      }
    }
  }

  if (changed) {
    await saveChats(chats);
  }
}

startupMigration();

// --- Onboarding: open welcome page on first install ---

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

// --- Message handlers ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_RANDOM_CHAT') {
    openRandomChat(message.platform, message.background).then(sendResponse);
    return true;
  }
  if (message.type === 'GET_CHATS') {
    getChats().then(sendResponse);
    return true;
  }
  if (message.type === 'GET_ACTIVITY_LOG') {
    chrome.storage.local.get('activityLog').then(data => {
      sendResponse(data.activityLog || []);
    });
    return true;
  }
  if (message.type === 'GET_PLATFORMS') {
    sendResponse(PLATFORMS);
    return true;
  }
  if (message.type === 'TOGGLE_PIN') {
    togglePin(message.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'REMOVE_CHAT') {
    removeChat(message.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'ADD_TAG') {
    addTagToChat(message.id, message.tag).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'REMOVE_TAG') {
    removeTagFromChat(message.id, message.tag).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'CHAT_TITLE') {
    const chatId = extractChatId(sender.tab?.url);
    const platform = detectPlatform(sender.tab?.url);
    if (chatId && platform && message.title && !isGenericTitle(message.title)) {
      saveChat(chatId, { url: sender.tab.url, title: message.title, platform });
    }
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'CHAT_DELETED') {
    const chatId = extractChatId(sender.tab?.url);
    if (chatId) {
      console.log(`[AIChatCollector] Chat ${chatId} is deleted — removing`);
      removeChat(chatId).then(() => sendResponse({ ok: true }));
    } else {
      sendResponse({ ok: false });
    }
    return true;
  }
});

async function openRandomChat(platformFilter, background = false) {
  const chats = await getChats();
  let ids = Object.keys(chats);
  if (platformFilter) {
    ids = ids.filter(id => chats[id].platform === platformFilter);
  }
  if (ids.length === 0) return { ok: false, reason: 'no_chats' };

  const randomId = ids[Math.floor(Math.random() * ids.length)];
  const chat = chats[randomId];
  await chrome.tabs.create({ url: chat.url, active: !background });
  return { ok: true, chat };
}
