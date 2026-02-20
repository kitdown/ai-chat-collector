# Chrome Web Store Listing

## Name
AI Chat Collector

## Short Description (132 chars max)
Auto-saves your AI chats from Claude, ChatGPT & Grok. Smart tags, search, random chat, deleted chat cleanup. All data stays local.

## Detailed Description

Stop losing your AI conversations.

If you use Claude, ChatGPT, or Grok daily, you know the pain: hundreds of chats buried in sidebars, no way to search across platforms, and deleted chats leaving stale bookmarks.

AI Chat Collector fixes this. It silently saves every chat you open — URL, title, platform, timestamp — and gives you tools to actually manage your conversation library.

FEATURES:

Auto-collect
Every chat you open on Claude, ChatGPT, or Grok is saved automatically. No buttons, no workflow changes.

Smart auto-tags
The extension groups similar chats by analyzing titles. "marketing", "marketplace" → marke*. Works with any language including Russian, English, mixed.

Manual tags
Add your own tags to any chat for custom organization.

Platform filter
See all chats together or filter by Claude, ChatGPT, or Grok.

Sorting
Sort by last opened, date saved, or most frequently opened.

Random Chat
One click opens a random saved chat. Great for reviewing old conversations or cleaning up your collection.

Deleted chat detection
When you open a chat that was deleted, the extension detects it and removes the stale link automatically.

Search
Full-text search across titles and tags.

PRIVACY:

All data is stored locally using chrome.storage.local. The extension makes ZERO network requests. No analytics, no tracking, no server. Your conversations stay on your device.

The extension only accesses claude.ai, chatgpt.com, and grok.com — to read chat page titles. It does not read your conversation content.

## Category
Productivity

## Language
English

## Screenshots needed
1. Options page showing chat list with platform icons and tags
2. Popup showing chat count by platform
3. Tag filtering in action
4. Platform filter buttons
5. Welcome/onboarding page

(Take real screenshots at 1280x800 or 640x400)

## Files to upload
- ai-chat-collector.zip (the extension)
- store-assets/icon-128.png (store icon)
- store-assets/promo-small-440x280.png (small tile)
- store-assets/promo-large-1280x800.png (marquee promo)
- Screenshots (take manually from your browser)

## Privacy policy URL
Host privacy-policy.html somewhere public (GitHub Pages, etc.)
Or paste the text directly in the Chrome Web Store privacy practices section.

## Permissions justification (for Chrome review)
- "storage" — stores chat URLs, titles, tags, and timestamps locally
- "tabs" — detects when user navigates to AI chat pages, reads page titles to save chat metadata
- Host permissions (claude.ai, chatgpt.com, grok.com) — runs content script to extract chat titles from page DOM on these specific sites only
