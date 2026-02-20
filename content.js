// Content script runs on claude.ai/chat/*, chatgpt.com/c/*, grok.com/c/* pages
// Extracts and reports chat title to the background service worker

// --- Platform detection ---

const PLATFORM_CONFIG = {
  'claude.ai': {
    key: 'claude',
    titlePrefix: /^Claude\s*[-–—]\s*/i,
    genericTitles: ['claude', 'claude.ai'],
    deletedIndicators: ["Can't open this chat", 'It may have been deleted'],
  },
  'chatgpt.com': {
    key: 'chatgpt',
    titlePrefix: /^ChatGPT\s*[-–—]\s*/i,
    genericTitles: ['chatgpt', 'new conversation', 'chatgpt - new conversation'],
    deletedIndicators: ['Conversation not found', "This conversation doesn't exist", 'Unable to load conversation'],
  },
  'grok.com': {
    key: 'grok',
    titlePrefix: /^Grok\s*[-–—]\s*/i,
    genericTitles: ['grok', 'grok — truth-seeking ai chatbot by xai | voice, image & video'],
    deletedIndicators: ['Conversation not found'],
  },
};

function getCurrentPlatform() {
  const host = window.location.hostname;
  return PLATFORM_CONFIG[host] || null;
}

// --- Title extraction ---

function getCleanTitle() {
  const platform = getCurrentPlatform();
  if (!platform) return null;

  let title = document.title;

  // Strip platform prefix (e.g. "Claude - My Chat" → "My Chat")
  if (platform.titlePrefix) {
    title = title.replace(platform.titlePrefix, '');
  }

  // Trim whitespace
  title = title.trim();

  // Ignore generic/empty titles
  if (!title) return null;
  const t = title.toLowerCase();
  for (const generic of platform.genericTitles) {
    if (t === generic || t.startsWith(generic + ' -') || t.startsWith(generic + '.')) {
      return null;
    }
  }

  return title;
}

// --- Respond to GET_TITLE requests from background ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TITLE') {
    sendResponse({ title: getCleanTitle() });
  }
});

// --- Watch for title changes (all 3 platforms update title dynamically) ---

let lastReportedTitle = null;

const observer = new MutationObserver(() => {
  const title = getCleanTitle();
  if (title && title !== lastReportedTitle) {
    lastReportedTitle = title;
    chrome.runtime.sendMessage({ type: 'CHAT_TITLE', title });
  }
});

// Observe <title> element changes
const titleEl = document.querySelector('head > title');
if (titleEl) {
  observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
}

// Also report title on initial load
const initialTitle = getCleanTitle();
if (initialTitle) {
  lastReportedTitle = initialTitle;
  chrome.runtime.sendMessage({ type: 'CHAT_TITLE', title: initialTitle });
}

// --- Detect deleted chats ---
// All 3 platforms are SPAs — when a deleted chat is opened,
// the title becomes generic (just the platform name)
// and the page may show an error message.

function checkIfChatDeleted() {
  const platform = getCurrentPlatform();
  if (!platform) return;

  const pageText = document.body?.innerText || '';
  for (const indicator of platform.deletedIndicators) {
    if (pageText.includes(indicator)) {
      chrome.runtime.sendMessage({ type: 'CHAT_DELETED' });
      return;
    }
  }

  // Also check: if title is still generic after page loaded, likely deleted
  const title = document.title.trim().toLowerCase();
  for (const generic of platform.genericTitles) {
    if (title === generic) {
      // Give a bit more time — SPA might still be loading
      // We check this at 5s, so if title is still generic, likely deleted
      chrome.runtime.sendMessage({ type: 'CHAT_DELETED' });
      return;
    }
  }
}

// Check after page fully loads (SPAs render content client-side)
// Grok needs more time to load, so we use longer timeouts
const platform = getCurrentPlatform();
const isGrok = platform?.key === 'grok';
setTimeout(checkIfChatDeleted, isGrok ? 4000 : 2000);
setTimeout(checkIfChatDeleted, isGrok ? 8000 : 5000);
