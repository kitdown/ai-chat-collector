# AI Chat Collector

Chrome extension for people who use Claude, ChatGPT, and Grok daily and accumulate hundreds of chats across platforms.

## Problems it solves

**I can't find that chat from last week.**
You had a great conversation about marketing strategy, but the sidebar only shows recent chats. You scroll and scroll. Was it on Claude or ChatGPT? With auto-tags, similar chats are grouped — click `marke*` and see all marketing-related chats instantly, across all platforms.

**I have 200+ chats and no idea which ones are still useful.**
Open a random chat, skim it, decide: keep or delete. Like a flashcard review for your AI conversations. Over time your collection stays clean and relevant.

**I deleted a chat but it still shows up in my bookmarks.**
The extension detects deleted chats automatically when you open them and removes them from the collection. No stale links.

**I keep having the same conversations because I forgot I already had them.**
Auto-tags show you patterns. You'll notice "oh, I already had 4 chats about this topic" — and can revisit them instead of starting from scratch.

**I use multiple AI platforms and can't remember where I had which conversation.**
AI Chat Collector tracks all three — Claude, ChatGPT, and Grok — in one place. Filter by platform or see everything together.

## Features

### Multi-platform support
Works with Claude (claude.ai), ChatGPT (chatgpt.com), and Grok (grok.com). Each chat shows a platform indicator. Filter by platform or view all chats together.

### Auto-collect
Every AI chat you open is automatically saved — URL, title, timestamp, platform. No manual work.

### Auto-tags (prefix matching)
Tags are generated automatically from chat titles. Words with a common prefix across multiple chats get grouped:
- "facilitation", "facilitating", "facilitator" → `facil*`
- "marketing", "marketplace" → `marke*`

Works with any language — Russian, English, mixed. Tag appears only when 2+ chats share the pattern.

### Manual tags
Add your own tags to any chat. Useful for project names, contexts, priorities.

### Tag filtering
Click tag pills to filter chats. Select multiple tags (OR filter). Combined with text search and platform filter.

### Random chat
One click opens a random saved chat in a new tab. Respects active platform filter. Great for:
- Reviewing old conversations
- Cleaning up your collection
- Rediscovering forgotten insights

### Deleted chat detection
When you open a chat that was deleted, the extension detects the error page and automatically removes it from the collection.

### Search
Full-text search across titles and tags.

## How it works

- **Content script** runs on `claude.ai/chat/*`, `chatgpt.com/c/*`, `grok.com/chat/*` pages, extracts titles via MutationObserver
- **Service worker** manages storage, handles messages between components, detects platforms
- **Popup** (click extension icon) — quick access: chat count by platform, top tags, random chat
- **Options page** — full management: platform filter, list, search, tags, manual cleanup

## Tech

- Chrome Extension Manifest V3
- `chrome.storage.local` for persistence
- `chrome.tabs` API for tracking navigation
- Zero external dependencies
- No network requests (except natural page loads)
