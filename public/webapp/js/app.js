/**
 * Rally Web App — Client-side JS
 */

/* ------------------------------------------------------------------ */
/* Platform detection & Download handler                                */
/* ------------------------------------------------------------------ */
window.handleDownload = function() {
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  var isAndroid = /android/i.test(ua);
  if (isIOS) {
    window.location.href = 'https://apps.apple.com/in/app/rally-sports/id6526470249';
  } else if (isAndroid) {
    window.location.href = 'https://play.google.com/store/apps/details?id=com.rallysports.app';
  } else {
    alert('Open this link on your mobile device to download the Rally app.');
  }
};

window.handleShareProfile = function(id, name, creatorName) {
  var url = window.location.origin + '/organiser/' + id;
  var title = 'Check out ' + name + ' on Rally!';
  var text = (creatorName ? 'Check out ' + name + ' by ' + creatorName + ' on Rally!' : title) + '\\n\\n🔗 View Profile: ' + url;
  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url }).catch(function(){});
  } else {
    copyToClipboard(url);
  }
};

/* Share helpers */
window.handleShareEvent = function(id, name, creator, dateOrStart, loc, priceStr, end) {
  var url = window.location.origin + '/event/' + id;
  var title = name || 'Event';
  var text = (creator ? 'Check this event out! ' + title + ' by ' + creator + '.' : 'Check this event out! ' + title);
  var date = dateOrStart;
  if (dateOrStart && (dateOrStart.indexOf('T') !== -1 || dateOrStart.indexOf('Z') !== -1 || !isNaN(Date.parse(dateOrStart)))) {
    date = formatDateTimeRange(dateOrStart, end);
  }
  if (date) text += '\n\n📅 ' + date;
  if (loc) text += '\n📍 ' + loc;
  if (priceStr) text += '\n💰 ' + priceStr;
  text += '\n\n🔗 Book Now: ' + url;
  
  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url }).catch(function(){});
  } else {
    copyToClipboard(url);
  }
};
window.handleSharePackage = function(id, name, creator, validity, loc, sports, priceStr) {
  var url = window.location.origin + '/package/' + id;
  var title = name || 'Package';
  var text = (creator ? 'Check out this package! ' + title + ' by ' + creator + '.' : 'Check out this package! ' + title);
  if (validity) text += '\n\n📅 Validity: ' + validity;
  if (loc) text += '\n📍 ' + loc;
  if (sports) text += '\n🥎 Sports: ' + sports;
  if (priceStr) text += '\n💰 AED ' + priceStr;
  text += '\n\n🔗 View Package: ' + url;

  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url }).catch(function(){});
  } else {
    copyToClipboard(url);
  }
};
window.handleShare = function() {
  if (navigator.share) {
    navigator.share({ title: document.title, url: window.location.href }).catch(function(){});
  } else {
    copyToClipboard(window.location.href);
  }
};
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('Link copied!');
    }).catch(function() { showToast('Link: ' + text); });
  } else {
    showToast('Link: ' + text);
  }
}
function showToast(msg) {
  var t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#334155;color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;z-index:9999;font-family:inherit;box-shadow:0 4px 12px rgba(0,0,0,.2);';
  document.body.appendChild(t);
  setTimeout(function() { t.remove(); }, 2500);
}

/* ------------------------------------------------------------------ */
/* Homepage — Filters & Date Strip                                      */
/* ------------------------------------------------------------------ */
var activeFilters = { sports: 'All', gender: 'All', location: 'All', price: 'All', eventtype: 'All Types' };
var activeDateISO = null; // null = show all dates

// Close filter panels when clicking outside
document.addEventListener('click', function(evt) {
  if (!evt.target.closest('.filter-chip-wrapper') && !evt.target.closest('.filter-panel')) {
    document.querySelectorAll('.filter-panel').forEach(function(p) { p.classList.remove('open'); });
  }
});

window.toggleFilter = function(type) {
  var panel = document.getElementById('filter-panel-' + type);
  var wrapper = document.getElementById('filter-wrap-' + type);
  if (!panel || !wrapper) return;
  var wasOpen = panel.classList.contains('open');
  document.querySelectorAll('.filter-panel').forEach(function(p) { p.classList.remove('open'); });
  if (!wasOpen) {
    if (panel.parentNode !== document.body) {
      document.body.appendChild(panel);
    }
    var rect = wrapper.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.zIndex = '99999';
    panel.style.top = (rect.bottom + 6) + 'px';
    var left = rect.left;
    var panelWidth = panel.offsetWidth || 180;
    if (left + panelWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - panelWidth - 12);
    }
    panel.style.left = left + 'px';
    panel.classList.add('open');
  }
};

window.addEventListener('scroll', function(e) {
  if (e.target && ((e.target.classList && e.target.classList.contains('filter-panel')) || (e.target.closest && e.target.closest('.filter-panel')))) {
    return;
  }
  document.querySelectorAll('.filter-panel.open').forEach(function(p) { p.classList.remove('open'); });
}, true);

window.selectFilter = function(type, value, el) {
  activeFilters[type] = value;

  // Update chip label + active state
  var wrapper = document.getElementById('filter-wrap-' + type);
  var chip    = wrapper ? wrapper.querySelector('.filter-chip') : null;
  var panel   = document.getElementById('filter-panel-' + type);

  if (wrapper) {
    wrapper.querySelectorAll('.filter-option').forEach(function(o) { o.classList.remove('selected'); });
  }
  if (panel) {
    panel.querySelectorAll('.filter-option').forEach(function(o) { o.classList.remove('selected'); });
  }
  if (el) el.classList.add('selected');

  if (chip) {
    var label = value === 'All' ? (type.charAt(0).toUpperCase() + type.slice(1)) : value;
    chip.innerHTML = label + ' <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
    if (value === 'All') {
      chip.classList.remove('active');
    } else {
      chip.classList.add('active');
    }
  }

  if (panel) panel.classList.remove('open');
  renderPickedEvents();
};

function getLocalDateKey(d) {
  if (!d) return '';
  var dt = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '';
  var y = dt.getFullYear();
  var m = (dt.getMonth() + 1).toString().padStart(2, '0');
  var day = dt.getDate().toString().padStart(2, '0');
  return y + '-' + m + '-' + day;
}

window.filterByDate = function(el, isoDate) {
  var isActive = el.classList.contains('active');
  document.querySelectorAll('.date-chip').forEach(function(c) { c.classList.remove('active'); });
  
  var d;
  if (isActive) {
    activeDateISO = null;
    d = new Date();
  } else {
    el.classList.add('active');
    activeDateISO = isoDate;
    if (typeof isoDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      var parts = isoDate.split('-').map(Number);
      d = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      d = new Date(isoDate);
    }
  }
  
  var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var fullDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  
  var mDisp = document.getElementById('current-month-display');
  var dDisp = document.getElementById('current-day-display');
  if (mDisp) mDisp.textContent = monthNames[d.getMonth()];
  if (dDisp) dDisp.textContent = fullDays[d.getDay()];
  
  renderPickedEvents();
};

function isSameDay(dateA, dateOrKeyB) {
  if (!dateA || !dateOrKeyB) return false;
  if (typeof dateOrKeyB === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOrKeyB)) {
    return getLocalDateKey(dateA) === dateOrKeyB;
  }
  return getLocalDateKey(dateA) === getLocalDateKey(dateOrKeyB);
}

var SPORT_ICONS = {
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

var TYPE_ICONS = {
  social: 'social.png',
  competitivesocial: 'social.png',
  tournament: 'tournament.png',
  competitive: 'tournament.png',
  tournamentcompetitive: 'tournament.png',
  class: 'class.png',
  training: 'training.png',
  private: 'private.png',
};

function getClientTag(value, isType) {
  if (!value) return null;
  var clean = String(value).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (isType || TYPE_ICONS[clean]) {
    var icon = TYPE_ICONS[clean] || 'social.png';
    var variant = 'teal';
    if (clean.indexOf('tournament') !== -1 || clean.indexOf('competitive') !== -1) variant = 'purple';
    else if (clean.indexOf('class') !== -1) variant = 'indigo';
    else if (clean.indexOf('training') !== -1) variant = 'green';
    else if (clean.indexOf('private') !== -1) variant = 'gray';
    return { icon: '/public/webapp/assets/' + icon, variant: 'tag-' + variant, label: capitalize(value) };
  }
  var icon = SPORT_ICONS[clean] || 'other-yellow.png';
  return { icon: '/public/webapp/assets/' + icon, variant: 'tag-orange', label: capitalize(value) };
}

function renderClientTags(sports, type) {
  var items = [];
  var sportsArr = Array.isArray(sports) ? sports : (sports ? [sports] : []);
  if (sportsArr[0]) {
    var c = getClientTag(sportsArr[0], false);
    if (c) items.push(c);
  }
  if (type && String(type).toLowerCase() !== 'other') {
    var c = getClientTag(type, true);
    if (c) items.push(c);
  } else if (sportsArr[1]) {
    var c = getClientTag(sportsArr[1], false);
    if (c) items.push(c);
  }
  return items.map(function(t) {
    return '<span class="tag ' + t.variant + '"><img src="' + t.icon + '" class="tag-icon" width="12" height="12" alt="" />' + escHtml(t.label) + '</span>';
  }).join('');
}

function formatDateTimeRange(start, end) {
  if (!start) return '';
  var s = new Date(start);
  if (isNaN(s.getTime())) return '';
  var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var day = days[s.getDay()];
  var date = s.getDate();
  var month = months[s.getMonth()];

  var parseTime = function(d) {
    var h = d.getHours();
    var m = d.getMinutes().toString().padStart(2, '0');
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    return { h12: h12, m: m, ampm: ampm, hm: h12 + ':' + m, full: h12 + ':' + m + ' ' + ampm };
  };

  var sTime = parseTime(s);
  if (end) {
    var en = new Date(end);
    if (!isNaN(en.getTime())) {
      var eTime = parseTime(en);
      if (sTime.ampm === eTime.ampm) {
        return day + ' ' + date + ' ' + month + ', ' + sTime.hm + ' - ' + eTime.full;
      }
      return day + ' ' + date + ' ' + month + ', ' + sTime.full + ' - ' + eTime.full;
    }
  }
  return day + ' ' + date + ' ' + month + ', ' + sTime.full;
}

function renderClientAvatars(participants, maxShow, eventId) {
  if (!participants || participants.length === 0) return '';
  maxShow = maxShow || 4;
  var shown = participants.slice(0, maxShow);
  var extra = participants.length - maxShow;
  var html = '<div class="avatars-row">';
  shown.forEach(function(p) {
    var initials = (p.fullName || '?').split(/\s+/).slice(0, 2).map(function(w){return w[0];}).join('').toUpperCase();
    if (p.profilePic) {
      html += '<img class="av" src="' + escHtml(p.profilePic) + '" alt="' + escHtml(p.fullName || '') + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
              '<div class="av-fallback" style="display:none;">' + escHtml(initials) + '</div>';
    } else {
      html += '<div class="av-fallback">' + escHtml(initials) + '</div>';
    }
  });
  if (extra > 0) {
    var clickAttr = eventId
      ? 'event.stopPropagation();openMembersModalForEvent(\'' + escHtml(eventId) + '\')'
      : 'openMembersModal()';
    html += '<div class="av-more" onclick="' + clickAttr + '" role="button" tabindex="0" title="View all members" style="cursor:pointer;">+' + extra + '</div>';
  }
  html += '</div>';
  return html;
}

function renderPickedEvents() {
  var container = document.getElementById('picked-events-container');
  if (!container) return;

  var events = window.__RALLY_PICKED_EVENTS__ || [];

  var filtered = events.filter(function(ev) {
    // Date filter
    if (activeDateISO) {
      var dt = ev.eventDateTime || ev.gameStartDate;
      if (!dt || !isSameDay(dt, activeDateISO)) return false;
    }
    // Price filter
    if (activeFilters.price !== 'All') {
      var price = ev.eventPricePerGuest || ev.gameJoinPrice || 0;
      var selectedPrice = parseInt(activeFilters.price);
      if (price > selectedPrice) return false;
    }
    // Gender filter
    if (activeFilters.gender !== 'All') {
      var g = (ev.eventGender || 'open').toLowerCase();
      if (activeFilters.gender === 'Male') {
        if (!g.includes('male') || g.includes('female')) return false;
      } else if (activeFilters.gender === 'Female') {
        if (!g.includes('female')) return false;
      } else if (activeFilters.gender === 'Open') {
        if (g !== 'open') return false;
      }
    }
    // Location filter
    if (activeFilters.location !== 'All') {
      var loc = (ev.eventLocation || ev.gameLocationArena || '').toLowerCase();
      if (!loc.includes(activeFilters.location.toLowerCase())) return false;
    }
    // Sport filter
    if (activeFilters.sports !== 'All') {
      var sp = (ev.eventSports || []).map(function(s) { return s.toLowerCase(); });
      if (!sp.includes(activeFilters.sports.toLowerCase())) return false;
    }
    // Event Type filter
    if (activeFilters.eventtype !== 'All Types') {
      var et = (ev.eventType || '').toLowerCase();
      if (!et.includes(activeFilters.eventtype.toLowerCase())) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state fade-in">' +
      '<div class="empty-state-icon">🎾</div>' +
      '<div class="empty-state-text">No events found</div>' +
      '<div class="empty-state-sub">Try adjusting your filters</div>' +
      '</div>';
    return;
  }

  var html = '';
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var lastDate = '';

  filtered.forEach(function(ev) {
    var dt = ev.eventDateTime || ev.gameStartDate;
    var d  = dt ? new Date(dt) : null;
    var dateStr = d ? (d.getDate() + ' ' + MONTHS[d.getMonth()]) : '';
    if (dateStr && dateStr !== lastDate) {
      html += '<div class="day-divider fade-in">' + escHtml(dateStr) + '</div>';
      lastDate = dateStr;
    }

    var price  = ev.eventPricePerGuest || ev.gameJoinPrice || 0;
    var isFree = price === 0;
    var thumb  = (ev.eventImages || ev.gameImages || [])[0] || '';
    var creator = ev.creator || {};
    var creatorName = creator.communityName || creator.fullName || ev.eventCreatorName || 'Organiser';
    var totalSpots  = ev.eventMaxGuest || ev.gameSpots || 0;
    var booked      = ev.participantsCount || (ev.participants || []).length || 0;
    var spotsLeft   = Math.max(0, totalSpots - booked);
    var isFull      = totalSpots > 0 && spotsLeft === 0;

    var spotsText = '';
    var spotsColorClass = 'spots-avail';
    if (isFull) {
      spotsText = 'Waitlist Open';
      spotsColorClass = 'spots-full';
    } else if (spotsLeft > 0 && spotsLeft < 10) {
      spotsText = '🔥' + spotsLeft + ' spots left';
      spotsColorClass = 'spots-avail';
    } else {
      spotsText = 'Spots Available';
      spotsColorClass = 'spots-avail';
    }

    var tagsHtml = renderClientTags(ev.eventSports, ev.eventType);
    var id = ev.eventId || ev.mongoId || (ev._id ? String(ev._id) : '');
    var dateFormatted = formatDateTimeRange(ev.eventDateTime || ev.gameStartDate, ev.eventEndDateTime);
    var location = ev.eventLocation || ev.gameLocationArena || 'Location TBD';
    var startIso = dt ? new Date(dt).toISOString() : '';
    var endIso = ev.eventEndDateTime ? new Date(ev.eventEndDateTime).toISOString() : '';

    html += '<div class="event-card fade-in" onclick="location.href=\'/event/' + escHtml(id) + '\'" role="button" tabindex="0">' +
      '<div class="event-card-top">' +
        '<div class="event-card-thumb-wrap">' +
          (thumb
            ? '<img class="event-card-thumb" src="' + escHtml(thumb) + '" alt="' + escHtml(ev.eventName || '') + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
              '<div class="event-card-thumb-fallback" style="display:none"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>'
            : '<div class="event-card-thumb-fallback"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>') +
        '</div>' +
        '<div class="event-card-body">' +
          '<div class="event-card-header-row">' +
            '<div class="event-card-title-wrap">' +
              '<div class="event-card-name">' + escHtml(ev.eventName || 'Event') + '</div>' +
              (creatorName ? '<div class="event-card-by">by ' + escHtml(creatorName) + '</div>' : '') +
            '</div>' +
            '<button class="event-card-share-btn" onclick="event.stopPropagation();handleShareEvent(\'' + escHtml(id) + '\', \'' + escHtml(ev.eventName) + '\', \'' + escHtml(creatorName) + '\', \'' + escHtml(startIso) + '\', \'' + escHtml(location) + '\', \'' + (isFree ? 'Free' : 'AED ' + price) + '\', \'' + escHtml(endIso) + '\')" aria-label="Share">' +
              '<img src="/public/webapp/assets/paper-plane.png" width="18" height="18" alt="Share" />' +
            '</button>' +
          '</div>' +
          '<div class="event-card-tags">' + tagsHtml + '</div>' +
          '<div class="event-card-meta">' +
            '<div class="event-card-meta-row">' +
              '<img src="/public/webapp/assets/time.png" width="14" height="14" alt="Time" class="meta-icon" />' +
              '<span class="event-card-meta-text js-event-datetime" data-event-start="' + escHtml(startIso) + '" data-event-end="' + escHtml(endIso) + '">' + escHtml(dateFormatted) + '</span>' +
            '</div>' +
            '<div class="event-card-meta-row">' +
              '<img src="/public/webapp/assets/location-pin.png" width="14" height="14" alt="Location" class="meta-icon" />' +
              '<span class="event-card-meta-text">' + escHtml(location) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="event-card-bottom">' +
        '<div class="event-card-bottom-left">' +
          renderClientAvatars(ev.participants || [], 4, id) +
          '<span class="spots-badge ' + spotsColorClass + '">' + spotsText + '</span>' +
        '</div>' +
        '<div class="event-card-bottom-right">' +
          '<div class="price-badge">' +
            '<img src="/public/webapp/assets/dhiram.png" width="14" height="14" alt="AED" />' +
            '<span class="price-val">' + price + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  });

  container.innerHTML = html;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function capitalize(str) {
  if (!str) return '';
  return str.split(/[\s_-]+/).map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(' ');
}
function formatTime(d) {
  var h = d.getHours(), m = d.getMinutes().toString().padStart(2,'0');
  var ampm = h >= 12 ? 'PM' : 'AM';
  return (h % 12 || 12) + ':' + m + ' ' + ampm;
}

function formatRefundPolicyNote(policyJoind) {
  if (!policyJoind) return '';
  var labels = {
    'before-event': 'Before the event starts',
    'until-start':  'Until event start time',
    'no-restrictions': 'No refund restrictions',
  };
  if (labels[policyJoind]) return labels[policyJoind];
  if (typeof policyJoind === 'string' && (policyJoind.indexOf('T') !== -1 || policyJoind.indexOf('-') !== -1)) {
    var d = new Date(policyJoind);
    if (!isNaN(d.getTime())) {
      return formatDateTimeRange(policyJoind, null);
    }
  }
  return policyJoind;
}

function formatRefundPolicyFull(policyJoind) {
  if (!policyJoind) return '';
  var labels = {
    'before-event': 'Refundable before the event starts',
    'until-start':  'Refundable until event start time',
    'no-restrictions': 'No refund restrictions',
  };
  if (labels[policyJoind]) return labels[policyJoind];
  if (typeof policyJoind === 'string' && (policyJoind.indexOf('T') !== -1 || policyJoind.indexOf('-') !== -1)) {
    var d = new Date(policyJoind);
    if (!isNaN(d.getTime())) {
      return 'Refundable until ' + formatDateTimeRange(policyJoind, null);
    }
  }
  return policyJoind;
}

window.hydrateAllLocalTimes = function() {
  // 1. All event date-time elements
  document.querySelectorAll('.js-event-datetime').forEach(function(el) {
    var start = el.getAttribute('data-event-start');
    var end = el.getAttribute('data-event-end');
    if (start) {
      var formatted = formatDateTimeRange(start, end);
      if (formatted) {
        var textEl = el.querySelector('.featured-card-date-text') || el.querySelector('.event-card-meta-text') || el;
        textEl.textContent = formatted;
      }
    }
  });

  // 2. Refund policy notes
  document.querySelectorAll('.js-refund-note').forEach(function(el) {
    var policy = el.getAttribute('data-policy');
    if (policy) {
      var note = formatRefundPolicyNote(policy);
      if (note) el.textContent = note;
    }
  });
  document.querySelectorAll('.js-refund-text').forEach(function(el) {
    var policy = el.getAttribute('data-policy');
    if (policy) {
      var full = formatRefundPolicyFull(policy);
      if (full) el.textContent = full;
    }
  });

  // 3. Registration start banners
  document.querySelectorAll('.js-reg-start').forEach(function(el) {
    var start = el.getAttribute('data-reg-start');
    if (start) {
      var d = new Date(start);
      if (!isNaN(d.getTime())) {
        var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        el.textContent = 'Registration starts on ' + days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
      }
    }
  });

  // 4. Package validity date ranges
  document.querySelectorAll('.js-validity-text').forEach(function(el) {
    var start = el.getAttribute('data-duration-start');
    var end = el.getAttribute('data-duration-end');
    if (start && end) {
      var s = new Date(start);
      var en = new Date(end);
      if (!isNaN(s.getTime()) && !isNaN(en.getTime())) {
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var cur = el.textContent || '';
        var mDays = cur.match(/(\s*\[[^\]]+\])/);
        var extra = mDays ? mDays[1] : '';
        el.textContent = s.getDate() + ' ' + months[s.getMonth()] + ' - ' + en.getDate() + ' ' + months[en.getMonth()] + extra;
      }
    }
  });
};

// Run initial render and hydration logic on DOM ready
document.addEventListener('DOMContentLoaded', function() {
  if (window.hydrateAllLocalTimes) {
    window.hydrateAllLocalTimes();
  }
  if (document.getElementById('picked-events-container')) {
    renderPickedEvents();
  }
});

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  if (window.hydrateAllLocalTimes) {
    window.hydrateAllLocalTimes();
  }
}

/* ------------------------------------------------------------------ */
/* Calendar Modal Logic                                                 */
/* ------------------------------------------------------------------ */
var currentCalMonth = new Date().getMonth();
var currentCalYear = new Date().getFullYear();

window.openCalendarModal = function() {
  var modal = document.getElementById('calendar-modal');
  if (modal && modal.parentNode !== document.body) {
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  renderCalendar();
};

window.closeCalendarModal = function(evt) {
  if (evt && evt.target !== evt.currentTarget) return; // ignore clicks on children
  document.getElementById('calendar-modal').style.display = 'none';
};

window.prevCalendarMonth = function() {
  currentCalMonth--;
  if (currentCalMonth < 0) { currentCalMonth = 11; currentCalYear--; }
  renderCalendar();
};

window.nextCalendarMonth = function() {
  currentCalMonth++;
  if (currentCalMonth > 11) { currentCalMonth = 0; currentCalYear++; }
  renderCalendar();
};

function renderCalendar() {
  var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var h = document.getElementById('calendar-month-year');
  if (h) h.textContent = monthNames[currentCalMonth] + ' ' + currentCalYear;
  
  var firstDay = new Date(currentCalYear, currentCalMonth, 1).getDay();
  var daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
  var today = new Date();
  today.setHours(0,0,0,0);
  
  var grid = document.getElementById('calendar-grid-dates');
  if (!grid) return;
  var html = '';
  
  for (var i = 0; i < firstDay; i++) {
    html += '<div></div>';
  }
  
  for (var d = 1; d <= daysInMonth; d++) {
    var dateObj = new Date(currentCalYear, currentCalMonth, d);
    var isPast = dateObj < today;
    var isActive = activeDateISO && isSameDay(dateObj, activeDateISO);
    var dateKey = getLocalDateKey(dateObj);
    
    if (isPast) {
      html += '<div class="cal-date disabled">' + d + '</div>';
    } else {
      var actClass = isActive ? ' active' : '';
      html += '<div class="cal-date' + actClass + '" onclick="selectCalendarDate(\'' + dateKey + '\')">' + d + '</div>';
    }
  }
  
  grid.innerHTML = html;
}

window.selectCalendarDate = function(iso) {
  var d;
  if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    var parts = iso.split('-').map(Number);
    d = new Date(parts[0], parts[1] - 1, parts[2]);
  } else {
    d = new Date(iso);
  }
  var key = getLocalDateKey(d);
  activeDateISO = key;
  var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var fullDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  
  var mDisp = document.getElementById('current-month-display');
  var dDisp = document.getElementById('current-day-display');
  if (mDisp) mDisp.textContent = monthNames[d.getMonth()];
  if (dDisp) dDisp.textContent = fullDays[d.getDay()];
  
  document.querySelectorAll('.date-chip').forEach(function(c) { c.classList.remove('active'); });
  document.querySelectorAll('.date-chip').forEach(function(c) {
    if (c.getAttribute('data-date-key') === key || (c.getAttribute('onclick') && c.getAttribute('onclick').includes(key))) {
      c.classList.add('active');
    }
  });
  
  document.getElementById('calendar-modal').style.display = 'none';
  renderPickedEvents();
};

// ============================================================
// MEMBERS MODAL CONTROLLER (Shared across all pages & cards)
// ============================================================
window.openMembersModal = function(eventData) {
  var modal = document.getElementById('members-modal');
  if (!modal) return;

  var ev = eventData;
  if (!ev && window.__RALLY__) {
    ev = window.__RALLY__.event || window.__RALLY__;
  }
  if (!ev) return;

  var titleEl = document.getElementById('modal-title');
  var subEl = document.getElementById('modal-subtitle');
  var spotsTextEl = document.getElementById('modal-spots-text');
  var spotsLabelEl = document.getElementById('modal-spots-label');
  var progressEl = document.getElementById('modal-progress');
  var gridEl = document.getElementById('modal-grid');

  var eventName = ev.eventName || 'Members';
  var creatorName = (ev.creator && (ev.creator.communityName || ev.creator.fullName)) || ev.eventCreatorName || '';

  if (titleEl) titleEl.textContent = eventName;
  if (subEl) subEl.textContent = creatorName ? 'by ' + creatorName : '';

  var spotsBooked = (ev.spotsInfo && ev.spotsInfo.spotsBooked) || ev.participantsCount || (ev.participants && ev.participants.length) || 0;
  var totalSpots = (ev.spotsInfo && ev.spotsInfo.totalSpots) || ev.eventMaxGuest || Math.max(spotsBooked, 1);
  var isFull = totalSpots > 0 && spotsBooked >= totalSpots;

  if (spotsTextEl) spotsTextEl.textContent = spotsBooked + '/' + totalSpots;
  if (spotsLabelEl) spotsLabelEl.textContent = isFull ? 'Full' : 'Spots Available';
  if (progressEl) {
    var pct = totalSpots > 0 ? Math.min(100, (spotsBooked / totalSpots) * 100).toFixed(1) : 0;
    progressEl.style.width = pct + '%';
  }

  // Populate participants
  var participants = ev.participants || [];
  if (gridEl) {
    if (participants.length === 0) {
      gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--c-text-3);">No participants yet</div>';
    } else {
      gridEl.innerHTML = participants.map(function(p) {
        var initials = (p.fullName || '?').split(/\s+/).slice(0, 2).map(function(w){return w[0];}).join('').toUpperCase();
        var av = p.profilePic
          ? '<img class="modal-participant-av" src="' + escHtml(p.profilePic) + '" alt="' + escHtml(p.fullName || '') + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">'
            + '<div class="modal-participant-av-fallback" style="display:none;">' + escHtml(initials) + '</div>'
          : '<div class="modal-participant-av-fallback">' + escHtml(initials) + '</div>';
        var extra = (p.guestsCount || p.guestCount || 1) - 1;
        var name = (p.fullName || 'Guest') + (extra > 0 ? ' (+' + extra + ')' : '');
        return '<div class="modal-participant">' + av + '<div class="modal-participant-name">' + escHtml(name) + '</div></div>';
      }).join('');
    }
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeMembersModal = function(e) {
  var modal = document.getElementById('members-modal');
  if (!modal) return;
  if (!e || e.target === modal || (e.target && e.target.closest && e.target.closest('.modal-close'))) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
};

window.openMembersModalForEvent = function(eventId) {
  var idStr = String(eventId || '');
  var ev = null;

  // 1. Check window.__RALLY_EVENTS_MAP__
  if (window.__RALLY_EVENTS_MAP__ && window.__RALLY_EVENTS_MAP__[idStr]) {
    ev = window.__RALLY_EVENTS_MAP__[idStr];
  }

  // 2. Check window.__RALLY_PICKED_EVENTS__
  if (!ev && window.__RALLY_PICKED_EVENTS__) {
    ev = window.__RALLY_PICKED_EVENTS__.find(function(item) {
      return String(item._id || item.eventId || item.id) === idStr;
    });
  }

  // 3. Check window.__RALLY_FEATURED_EVENTS__
  if (!ev && window.__RALLY_FEATURED_EVENTS__) {
    ev = window.__RALLY_FEATURED_EVENTS__.find(function(item) {
      return String(item._id || item.eventId || item.id) === idStr;
    });
  }

  // 4. Check window.__RALLY_EVENTS__ (Organiser profile page)
  if (!ev && window.__RALLY_EVENTS__) {
    ev = window.__RALLY_EVENTS__.find(function(item) {
      return String(item._id || item.eventId || item.id) === idStr;
    });
  }

  // 5. Check window.__RALLY__ (Shell data)
  if (!ev && window.__RALLY__) {
    var rally = window.__RALLY__;
    var allList = [].concat(rally.pickedEvents || [], rally.featuredEvents || [], rally.events || []);
    ev = allList.find(function(item) {
      return String(item._id || item.eventId || item.id) === idStr;
    });
    if (!ev && rally.event && String(rally.event._id || rally.event.eventId || rally.event.id) === idStr) {
      ev = rally.event;
    }
  }

  if (ev) {
    window.openMembersModal(ev);
    var pCount = ev.participantsCount || (ev.spotsInfo && ev.spotsInfo.spotsBooked) || 0;
    if ((!ev.participants || ev.participants.length === 0) && pCount > 0) {
      fetchEventParticipants(idStr, ev);
    }
    return;
  }

  // Fallback: fetch from API
  fetchEventParticipants(idStr);
};

function fetchEventParticipants(idStr, existingEv) {
  fetch('/api/events/' + encodeURIComponent(idStr) + '/participants')
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data && data.success && data.data) {
        var participants = data.data.participants || data.data || [];
        var count = data.data.count || participants.length;
        var updated = existingEv || { eventName: 'Event', eventId: idStr };
        updated.participants = participants;
        updated.participantsCount = count;
        window.openMembersModal(updated);
      }
    })
    .catch(function(err) {
      console.warn('[MembersModal] Failed to fetch participants:', err);
    });
}

window.openMembersModalForPackage = function(packageId) {
  var idStr = String(packageId || '');
  var pkg = null;

  // 1. Check window.__RALLY_PACKAGES__ (Organiser profile page)
  if (window.__RALLY_PACKAGES__ && Array.isArray(window.__RALLY_PACKAGES__)) {
    pkg = window.__RALLY_PACKAGES__.find(function(item) {
      return String(item.packageId || item._id || item.id) === idStr;
    });
  }

  // 2. Check window.__RALLY_PACKAGE__ (Package detail page)
  if (!pkg && window.__RALLY_PACKAGE__) {
    if (String(window.__RALLY_PACKAGE__.packageId || window.__RALLY_PACKAGE__._id || window.__RALLY_PACKAGE__.id) === idStr) {
      pkg = window.__RALLY_PACKAGE__;
    }
  }

  // 3. Check window.__RALLY__ (Shell data)
  if (!pkg && window.__RALLY__) {
    var rally = window.__RALLY__;
    if (rally.package && String(rally.package.packageId || rally.package._id || rally.package.id) === idStr) {
      pkg = rally.package;
    } else if (rally.packages && Array.isArray(rally.packages)) {
      pkg = rally.packages.find(function(item) {
        return String(item.packageId || item._id || item.id) === idStr;
      });
    }
  }

  if (pkg) {
    var rawParticipants = pkg.joinedUsers || pkg.purchasedBy || (window.__RALLY_PARTICIPANTS__) || [];
    var mappedParticipants = rawParticipants.map(function(item) {
      var u = item.user || item;
      return {
        fullName: u.fullName || 'Player',
        profilePic: u.profilePic || null,
        userId: u.userId,
      };
    });

    var creatorName = (pkg.creator && (pkg.creator.communityName || pkg.creator.fullName)) || '';
    var totalSpots = pkg.maxPurchases || pkg.maxEvents || (pkg.joinedUsersCount || rawParticipants.length || 20);

    var pkgEventFormat = {
      eventName: pkg.packageName || 'Package Members',
      creator: { communityName: creatorName },
      participants: mappedParticipants,
      participantsCount: pkg.joinedUsersCount !== undefined ? pkg.joinedUsersCount : mappedParticipants.length,
      eventMaxGuest: totalSpots,
      spotsInfo: {
        spotsBooked: pkg.joinedUsersCount !== undefined ? pkg.joinedUsersCount : mappedParticipants.length,
        totalSpots: totalSpots,
      }
    };
    window.openMembersModal(pkgEventFormat);
    return;
  }

  // Fallback: fetch from API
  fetch('/api/packages/' + encodeURIComponent(idStr) + '/details')
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data && data.success && data.data && data.data.package) {
        var p = data.data.package;
        var rawP = p.joinedUsers || p.purchasedBy || [];
        var mappedP = rawP.map(function(item) {
          var u = item.user || item;
          return {
            fullName: u.fullName || 'Player',
            profilePic: u.profilePic || null,
            userId: u.userId,
          };
        });
        var cName = (p.creator && (p.creator.communityName || p.creator.fullName)) || '';
        var tSpots = p.maxPurchases || p.maxEvents || (p.joinedUsersCount || rawP.length || 20);

        window.openMembersModal({
          eventName: p.packageName || 'Package Members',
          creator: { communityName: cName },
          participants: mappedP,
          participantsCount: p.joinedUsersCount || mappedP.length,
          eventMaxGuest: tSpots,
          spotsInfo: {
            spotsBooked: p.joinedUsersCount || mappedP.length,
            totalSpots: tSpots,
          }
        });
      }
    })
    .catch(function(err) {
      console.warn('[MembersModal] Failed to fetch package details:', err);
    });
};


