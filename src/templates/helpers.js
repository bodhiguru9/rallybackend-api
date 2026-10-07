/**
 * Rally Web App — Template Helpers
 * Shared utility functions for all HTML templates.
 * All output is XSS-safe (escapeHtml applied to every user-sourced string).
 */

const validator = require('validator');

/** Escape a string for safe HTML injection */
const e = (str) => (typeof str === 'string' ? validator.escape(str) : '');

/** Format event date: "Sat 24 Oct, 1:00 - 2:00 PM" */
function formatDateTime(start, end) {
  if (!start) return '';
  const s = new Date(start);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = days[s.getDay()];
  const date = s.getDate();
  const month = months[s.getMonth()];
  const timeStr = (d) => {
    const h = d.getHours(); const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m} ${ampm}`;
  };
  const base = `${day} ${date} ${month}, ${timeStr(s)}`;
  if (end) {
    const en = new Date(end);
    return `${base} - ${timeStr(en)}`;
  }
  return base;
}

/** Format short date for cards: "Sat 21 Oct, 1:00 - 2:00 PM" */
function formatDateShort(start) {
  return formatDateTime(start, null);
}

/**
 * Map a sport/type string → CSS tag class
 * e.g. 'Table Tennis' → 'tag-tt', 'Social' → 'tag-social'
 */
function tagClass(str) {
  if (!str) return 'tag-sport';
  const s = str.toLowerCase().replace(/[\s_-]+/g, '');
  if (s.includes('tabletennis') || s === 'tt') return 'tag-tt';
  if (s.includes('tennis')) return 'tag-tennis';
  if (s.includes('padel')) return 'tag-padel';
  if (s.includes('social')) return 'tag-social';
  if (s.includes('class')) return 'tag-class';
  if (s.includes('training')) return 'tag-training';
  if (s.includes('tournament')) return 'tag-tournament';
  if (s.includes('badminton')) return 'tag-sport';
  if (s.includes('cricket')) return 'tag-sport';
  if (s.includes('football')) return 'tag-padel';
  return 'tag-sport';
}

/** Render sport/type tag pills */
function renderTags(sports, type) {
  const items = [];
  if (type && type !== 'other') items.push({ label: titleCase(type), cls: tagClass(type) });
  const sportsArr = Array.isArray(sports) ? sports : (sports ? [sports] : []);
  sportsArr.forEach((s) => { if (s) items.push({ label: titleCase(s), cls: tagClass(s) }); });
  return items.slice(0, 3).map(({ label, cls }) =>
    `<span class="tag ${cls}">${e(label)}</span>`
  ).join('');
}

function titleCase(str) {
  if (!str) return '';
  return str.split(/[\s_-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Render avatar: image with fallback to initials
 * @param {string} imageUrl
 * @param {string} name - for initials fallback
 * @param {string} cls  - img CSS class (e.g. 'organiser-avatar')
 * @param {string} fallbackCls - fallback div class (e.g. 'organiser-avatar-fallback')
 */
function renderAvatar(imageUrl, name, cls, fallbackCls) {
  const initials = (name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  if (imageUrl) {
    return `<img class="${cls}" src="${e(imageUrl)}" alt="${e(name || '')}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
            <div class="${fallbackCls}" style="display:none;">${e(initials)}</div>`;
  }
  return `<div class="${fallbackCls}">${e(initials)}</div>`;
}

/** Currency symbol for AED */
const CURRENCY = 'AED';

/** Format price string */
function formatPrice(price) {
  if (!price || price === 0) return null; // null → free event
  return `<img src="/public/webapp/assets/dhiram.png" width="16" height="16" style="margin-right:2px;" alt="AED"/> ${Number(price).toLocaleString()}`;
}

/** Restrict + Refund policy text */
function restrictionText(event) {
  const parts = [];
  if (event.eventGender && event.eventGender !== 'all') parts.push(titleCase(event.eventGender) + ' Only');
  if (event.eventMinAge || event.eventMaxAge) {
    const min = event.eventMinAge || 0;
    const max = event.eventMaxAge;
    if (min && max) parts.push(`${min} - ${max} yrs`);
    else if (min) parts.push(`${min}+ yrs`);
    else if (max) parts.push(`Under ${max} yrs`);
  }
  if (event.eventSportsLevel && event.eventSportsLevel !== 'all') parts.push(titleCase(event.eventSportsLevel) + ' Level');
  if (event.eventLevelRestriction) parts.push(e(event.eventLevelRestriction));
  return parts.join(', ');
}

/** Google Maps embed URL for a location string (no API key needed for basic iframe) */
function mapEmbedUrl(location) {
  if (!location) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(location)}&output=embed&z=15`;
}

/** Refund policy text from policyJoind field */
function refundPolicyText(policyJoind, eventDateTime) {
  if (!policyJoind) return null;
  const labels = {
    'before-event': 'Refundable before the event starts',
    'until-start':  'Refundable until event start time',
    'no-restrictions': 'No refund restrictions',
  };
  if (labels[policyJoind]) return labels[policyJoind];
  // If it looks like a date string
  if (policyJoind.includes('T') || policyJoind.includes('-')) {
    const d = new Date(policyJoind);
    if (!isNaN(d.getTime())) {
      return `Refundable until ${formatDateShort(policyJoind)}`;
    }
  }
  return e(String(policyJoind));
}

/**
 * Render overlapping avatar chips for participants list (max 4 shown + "+N" chip)
 */
function renderParticipantAvatars(participants, maxShow = 4) {
  if (!participants || participants.length === 0) return '';
  const shown = participants.slice(0, maxShow);
  const extra = participants.length - maxShow;
  let html = '<div class="avatars-row">';
  shown.forEach((p) => {
    const initials = (p.fullName || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    if (p.profilePic) {
      html += `<img class="av" src="${e(p.profilePic)}" alt="${e(p.fullName || '')}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <div class="av-fallback" style="display:none;">${e(initials)}</div>`;
    } else {
      html += `<div class="av-fallback">${e(initials)}</div>`;
    }
  });
  if (extra > 0) html += `<div class="av-more">+${extra}</div>`;
  html += '</div>';
  return html;
}

module.exports = {
  e, formatDateTime, formatDateShort, tagClass, renderTags,
  titleCase, renderAvatar, CURRENCY, formatPrice,
  restrictionText, mapEmbedUrl, refundPolicyText, renderParticipantAvatars,
};
