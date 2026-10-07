/**
 * Rally Web App — Private Event Wall Template
 * Shown when event.IsPrivateEvent === true
 */
const { e } = require('./helpers');

module.exports = function privateEventWallTemplate({ eventId }) {
  return `
<!-- TOP BAR -->
<div class="top-bar">
  <div class="top-bar-left">
    <button class="back-btn" onclick="history.length>1?history.back():location.href='/'" aria-label="Go back">
      <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <span class="top-bar-title">Event Details</span>
  </div>
  <button class="download-pill-btn" onclick="handleDownload()" id="top-download-btn">
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="#fff" fill="none" stroke-width="2.5"><path d="M12 16l-4-4h2.5V4h3v8H16l-4 4z"/><path d="M4 18h16"/></svg>
    Download App
  </button>
</div>

<div class="page-content no-footer fade-in">
  <div class="private-wall">
    <div class="private-lock-icon">
      <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </div>
    <div class="private-title">Private Event</div>
    <div class="private-sub">
      This event is invite-only. Download the Rally app to request access and join the community.
    </div>
    <div class="store-badges">
      <button class="store-badge-btn" onclick="window.open('https://apps.apple.com/in/app/rally-sports/id6526470249','_blank')">
        <svg viewBox="0 0 24 24" fill="white"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
        App Store (iOS)
      </button>
      <button class="store-badge-btn" onclick="window.open('https://play.google.com/store/apps/details?id=com.rallysports.app','_blank')">
        <svg viewBox="0 0 24 24" fill="white"><path d="M3.18 23.88a2 2 0 0 1-1-.27C1.75 23.27 1.5 22.71 1.5 22V2c0-.71.25-1.27.68-1.61a2 2 0 0 1 2.09-.17l16.5 10a2 2 0 0 1 0 3.56l-16.5 10a2 2 0 0 1-1.09.1z"/></svg>
        Google Play (Android)
      </button>
    </div>
    <button onclick="location.href='/'" style="font-size:13px;color:var(--c-primary);font-weight:600;cursor:pointer;padding:8px 16px;border-radius:var(--r-pill);background:var(--c-primary-light);">
      ← Back to Events
    </button>
  </div>
</div>`;
};
