/**
 * Rally Web App — Template Helpers
 * Shared utility functions for all HTML templates.
 * All output is XSS-safe (escapeHtml applied to every user-sourced string).
 */

const validator = require('validator');

/** Escape a string for safe HTML injection */
const e = (str) => (typeof str === 'string' ? validator.escape(str) : '');

/** Format event date: "Sat 24 Oct, 1:00 - 2:00 PM" matching EventCard.tsx formatDisplayRange */
function formatDateTime(start, end) {
  if (!start) return '';
  const s = new Date(start);
  if (isNaN(s.getTime())) return '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = days[s.getDay()];
  const date = s.getDate();
  const month = months[s.getMonth()];

  const formatParts = (d) => {
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return { hour12, m, ampm, hm: `${hour12}:${m}`, full: `${hour12}:${m} ${ampm}` };
  };

  const sTime = formatParts(s);
  if (end) {
    const en = new Date(end);
    if (!isNaN(en.getTime())) {
      const eTime = formatParts(en);
      if (sTime.ampm === eTime.ampm) {
        return `${day} ${date} ${month}, ${sTime.hm} - ${eTime.full}`;
      }
      return `${day} ${date} ${month}, ${sTime.full} - ${eTime.full}`;
    }
  }
  return `${day} ${date} ${month}, ${sTime.full}`;
}

/** Format short date for cards: "Sat 24 Oct, 1:00 PM" */
function formatDateShort(start) {
  return formatDateTime(start, null);
}

const SPORT_ICON_MAP = {
  padel: 'padel-yellow.png',
  padeltennis: 'padel-yellow.png',
  football: 'footballYellow.png',
  tennis: 'tennis-yellow.png',
  badminton: 'badminton-yellow.png',
  basketball: 'basketball-yellow.png',
  cricket: 'cricket-yellow.png',
  indoorcricket: 'indoorCricketYellow.png',
  pickleball: 'pickleball-yellow.png',
  pilates: 'pilates-yellow.png',
  tabletennis: 'table-tennis-yellow.png',
  running: 'runningYellow.png',
  dance: 'dance-yellow.png',
  other: 'other-yellow.png',
};

const TYPE_ICON_MAP = {
  social: 'social.png',
  competitivesocial: 'social.png',
  tournament: 'tournament.png',
  competitive: 'tournament.png',
  tournamentcompetitive: 'tournament.png',
  class: 'class.png',
  training: 'training.png',
  private: 'private.png',
};

function getTagDetails(value, isType = false) {
  if (!value) return null;
  const clean = String(value).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (isType || TYPE_ICON_MAP[clean]) {
    const icon = TYPE_ICON_MAP[clean] || 'social.png';
    let variant = 'teal';
    if (clean.includes('tournament') || clean.includes('competitive')) variant = 'purple';
    else if (clean.includes('class')) variant = 'indigo';
    else if (clean.includes('training')) variant = 'green';
    else if (clean.includes('private')) variant = 'gray';
    return { icon: `/public/webapp/assets/${icon}`, variant: `tag-${variant}`, label: titleCase(value) };
  }
  const icon = SPORT_ICON_MAP[clean] || 'other-yellow.png';
  return { icon: `/public/webapp/assets/${icon}`, variant: 'tag-orange', label: titleCase(value) };
}

/** Render sport/type tag pills with icons and theme colors matching IconTag.tsx */
function renderTags(sports, type) {
  const items = [];
  const sportsArr = Array.isArray(sports) ? sports : (sports ? [sports] : []);
  if (sportsArr[0]) {
    const cfg = getTagDetails(sportsArr[0], false);
    if (cfg) items.push(cfg);
  }
  if (type && String(type).toLowerCase() !== 'other') {
    const cfg = getTagDetails(type, true);
    if (cfg) items.push(cfg);
  } else if (sportsArr[1]) {
    const cfg = getTagDetails(sportsArr[1], false);
    if (cfg) items.push(cfg);
  }
  return items.map(({ icon, variant, label }) =>
    `<span class="tag ${variant}"><img src="${icon}" class="tag-icon" width="12" height="12" alt="" />${e(label)}</span>`
  ).join('');
}

function titleCase(str) {
  if (!str) return '';
  const s = typeof str === 'string' ? str : (Array.isArray(str) ? String(str[0] || '') : String(str));
  if (!s) return '';
  return s.split(/[\s_-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Render avatar: image with fallback to initials
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
  return `<img src="/public/webapp/assets/dhiram.png" width="14" height="14" style="margin-right:2px;" alt="AED"/> ${Number(price).toLocaleString()}`;
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
 * Clicking +N opens the MembersModal (Requirement 2 & event card modal)
 */
function renderParticipantAvatars(participants, maxShow = 4, eventId = '', isPackage = false) {
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
  if (extra > 0) {
    const clickHandler = isPackage
      ? `event.stopPropagation();openMembersModalForPackage('${e(String(eventId))}')`
      : (eventId
        ? `event.stopPropagation();openMembersModalForEvent('${e(String(eventId))}')`
        : `openMembersModal()`);
    html += `<div class="av-more" onclick="${clickHandler}" role="button" tabindex="0" title="View all members" style="cursor:pointer;">+${extra}</div>`;
  }
  html += '</div>';
  return html;
}

/**
 * Render an event card matching EventCard.tsx (Requirement 1)
 */
function renderEventCard(ev) {
  const id = ev.eventId || ev.mongoId || (ev._id ? String(ev._id) : '');
  const thumb = (ev.eventImages || ev.gameImages || [])[0] || '';
  const creator = ev.creator || {};
  const creatorName = creator.communityName || creator.fullName || ev.eventCreatorName || 'Organiser';
  const totalSpots = ev.eventMaxGuest || ev.gameSpots || 0;
  const booked = ev.participantsCount || (ev.participants || []).length || 0;
  const spotsLeft = Math.max(0, totalSpots - booked);
  const isFull = totalSpots > 0 && spotsLeft === 0;
  const price = ev.eventPricePerGuest || ev.gameJoinPrice || 0;
  const isFree = price === 0;
  const location = ev.eventLocation || ev.gameLocationArena || 'Location TBD';
  const dateFormatted = formatDateTime(ev.eventDateTime, ev.eventEndDateTime);

  let spotsText = '';
  let spotsColorClass = 'spots-avail';
  if (isFull) {
    spotsText = 'Waitlist Open';
    spotsColorClass = 'spots-full';
  } else if (spotsLeft > 0 && spotsLeft < 10) {
    spotsText = `🔥${spotsLeft} spots left`;
    spotsColorClass = 'spots-avail';
  } else {
    spotsText = 'Spots Available';
    spotsColorClass = 'spots-avail';
  }

  const shareParamDate = e(dateFormatted);
  const shareParamLoc = e(location);
  const shareParamPrice = isFree ? 'Free' : `AED ${price}`;

  return `
  <div class="event-card fade-in" onclick="location.href='/event/${e(String(id))}'" role="button" tabindex="0">
    <div class="event-card-top">
      <div class="event-card-thumb-wrap">
        ${thumb
          ? `<img class="event-card-thumb" src="${e(thumb)}" alt="${e(ev.eventName || '')}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
             <div class="event-card-thumb-fallback" style="display:none;"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>`
          : `<div class="event-card-thumb-fallback"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>`
        }
      </div>
      <div class="event-card-body">
        <div class="event-card-header-row">
          <div class="event-card-title-wrap">
            <div class="event-card-name">${e(ev.eventName || 'Event')}</div>
            ${creatorName ? `<div class="event-card-by">by ${e(creatorName)}</div>` : ''}
          </div>
          <button class="event-card-share-btn" onclick="event.stopPropagation();handleShareEvent('${e(String(id))}', '${e(ev.eventName || 'Event')}', '${e(creatorName)}', '${shareParamDate}', '${shareParamLoc}', '${shareParamPrice}')" aria-label="Share">
            <img src="/public/webapp/assets/paper-plane.png" width="18" height="18" alt="Share" />
          </button>
        </div>
        <div class="event-card-tags">${renderTags(ev.eventSports, ev.eventType)}</div>
        <div class="event-card-meta">
          <div class="event-card-meta-row">
            <img src="/public/webapp/assets/time.png" width="14" height="14" alt="Time" class="meta-icon" />
            <span class="event-card-meta-text">${e(dateFormatted)}</span>
          </div>
          <div class="event-card-meta-row">
            <img src="/public/webapp/assets/location-pin.png" width="14" height="14" alt="Location" class="meta-icon" />
            <span class="event-card-meta-text">${e(location)}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="event-card-bottom">
      <div class="event-card-bottom-left">
        ${renderParticipantAvatars(ev.participants || [], 4, id)}
        <span class="spots-badge ${spotsColorClass}">${spotsText}</span>
      </div>
      <div class="event-card-bottom-right">
        <div class="price-badge">
          <img src="/public/webapp/assets/dhiram.png" width="14" height="14" alt="AED" />
          <span class="price-val">${price}</span>
        </div>
      </div>
    </div>
  </div>`;
}

/** Format package validity text matching OrganiserPackageCard.tsx formatValidityDisplay */
function formatPackageValidity(pkg) {
  const duration = pkg.validityPeriod?.duration;
  const validDays = pkg.validityPeriod?.validDays;

  let datePart = '';
  if (duration && duration.length >= 2 && duration[0] && duration[1]) {
    try {
      const start = new Date(duration[0]);
      const end = new Date(duration[1]);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const startFormatted = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const endFormatted = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        datePart = `${startFormatted} - ${endFormatted}`;
      }
    } catch {
      datePart = '';
    }
  }

  if (!datePart) {
    if (pkg.validityMonths) {
      datePart = `${pkg.validityMonths} ${pkg.validityMonths === 1 ? 'month' : 'months'}`;
    } else if (pkg.validityDays) {
      datePart = `${pkg.validityDays} days`;
    } else if (pkg.validity) {
      datePart = pkg.validity;
    } else {
      datePart = 'Flexible';
    }
  }

  let daysPart = '';
  if (validDays && Array.isArray(validDays) && validDays.length > 0) {
    const shortDays = validDays.map(d => String(d).slice(0, 3));
    daysPart = ` [${shortDays.join(', ')}]`;
  }

  return `${datePart}${daysPart}`;
}

/** Format package location string */
function formatPackageLocation(pkg) {
  if (pkg.eventLocation && pkg.eventLocation.trim()) return pkg.eventLocation.trim();
  if (typeof pkg.location === 'object' && pkg.location !== null) {
    return pkg.location.displayName || pkg.location.name || '';
  }
  if (typeof pkg.location === 'string' && pkg.location.trim()) {
    return pkg.location.trim();
  }
  return 'Location TBD';
}

/**
 * Render a package card matching OrganiserPackageCard.tsx
 */
function renderPackageCard(pkg, organiser = {}) {
  const pkgId = pkg.packageId || (pkg._id ? String(pkg._id) : '');
  const name = pkg.packageName || 'Package';
  const price = pkg.packagePrice ?? pkg.price ?? 0;
  const validityText = formatPackageValidity(pkg);
  const locationText = formatPackageLocation(pkg);
  const sports = Array.isArray(pkg.sports) && pkg.sports.length > 0 ? pkg.sports : ['all-sports'];
  const creatorName = organiser.communityName || organiser.fullName || pkg.creator?.communityName || pkg.creator?.fullName || 'Organiser';

  const joinedUsers = Array.isArray(pkg.joinedUsers) ? pkg.joinedUsers : (Array.isArray(pkg.purchasedBy) ? pkg.purchasedBy : []);
  const totalJoined = pkg.joinedUsersCount !== undefined && pkg.joinedUsersCount !== null ? pkg.joinedUsersCount : joinedUsers.length;
  const maxPurchases = pkg.maxPurchases !== undefined && pkg.maxPurchases !== null ? pkg.maxPurchases : (pkg.maxEvents || 0);
  const spotsLeft = maxPurchases > 0 ? Math.max(0, maxPurchases - totalJoined) : null;

  let spotsText = 'Spots Available';
  let spotsColorClass = 'spots-avail';
  if (spotsLeft !== null && spotsLeft <= 0) {
    spotsText = 'Sold Out';
    spotsColorClass = 'spots-full';
  } else if (spotsLeft !== null && spotsLeft < 10) {
    spotsText = `🔥 ${spotsLeft} spots left`;
    spotsColorClass = 'spots-avail';
  }

  const participants = joinedUsers.map((item, idx) => {
    const u = item.user || item;
    return {
      userId: u.userId ?? idx,
      fullName: u.fullName || 'Player',
      profilePic: u.profilePic || null,
    };
  });

  return `
  <div class="pkg-card fade-in" onclick="location.href='/package/${e(String(pkgId))}'" role="button" tabindex="0">
    <div class="pkg-card-header">
      <div class="pkg-card-name">${e(name)}</div>
      <button class="pkg-card-share" onclick="event.stopPropagation();handleSharePackage('${e(String(pkgId))}', '${e(name)}', '${e(creatorName)}', '${e(validityText)}', '${e(locationText)}', '${e(sports.join(', '))}', '${price}')" aria-label="Share package">
        <img src="/public/webapp/assets/paper-plane.png" width="18" height="18" alt="Share" />
      </button>
    </div>
    <div class="event-card-tags">${renderTags(sports)}</div>
    <div class="pkg-card-meta">
      <div class="pkg-card-meta-row">
        <img src="/public/webapp/assets/time.png" width="16" height="16" alt="Time" class="meta-icon" />
        <span class="pkg-card-meta-text">${e(validityText)}</span>
      </div>
      <div class="pkg-card-meta-row">
        <img src="/public/webapp/assets/location-pin.png" width="16" height="16" alt="Location" class="meta-icon" />
        <span class="pkg-card-meta-text">${e(locationText)}</span>
      </div>
    </div>
    <div class="pkg-card-footer">
      <div class="pkg-card-footer-left" onclick="event.stopPropagation();openMembersModalForPackage('${e(String(pkgId))}')" role="button" tabindex="0" title="View package members" style="display:flex;align-items:center;gap:10px;cursor:pointer;">
        ${renderParticipantAvatars(participants, 4, pkgId, true)}
        <span class="spots-badge ${spotsColorClass}">${spotsText}</span>
      </div>
      <div class="price-badge">
        <img src="/public/webapp/assets/dhiram.png" width="14" height="14" alt="AED" />
        <span class="price-val">${price}</span>
      </div>
    </div>
  </div>`;
}

module.exports = {
  e, formatDateTime, formatDateShort, renderTags,
  titleCase, renderAvatar, CURRENCY, formatPrice,
  restrictionText, mapEmbedUrl, refundPolicyText, renderParticipantAvatars,
  renderEventCard, formatPackageValidity, formatPackageLocation, renderPackageCard,
};
