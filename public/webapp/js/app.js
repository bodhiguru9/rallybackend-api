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
window.handleShareEvent = function(id, name, creator, date, loc, priceStr) {
  var url = window.location.origin + '/event/' + id;
  var title = name || 'Event';
  var text = (creator ? 'Check this event out! ' + title + ' by ' + creator + '.' : 'Check this event out! ' + title);
  if (date) text += '\\n\\n📅 ' + date;
  if (loc) text += '\\n📍 ' + loc;
  if (priceStr) text += '\\n💰 ' + priceStr;
  text += '\\n\\n🔗 Book Now: ' + url;
  
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
  if (!evt.target.closest('.filter-chip-wrapper')) {
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
    var rect = wrapper.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = (rect.bottom + 4) + 'px';
    panel.style.left = rect.left + 'px';
    panel.classList.add('open');
  }
};

document.addEventListener('scroll', function() {
  document.querySelectorAll('.filter-panel').forEach(function(p) { p.classList.remove('open'); });
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
    d = new Date(isoDate);
  }
  
  var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var fullDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  
  var mDisp = document.getElementById('current-month-display');
  var dDisp = document.getElementById('current-day-display');
  if (mDisp) mDisp.textContent = monthNames[d.getMonth()];
  if (dDisp) dDisp.textContent = fullDays[d.getDay()];
  
  renderPickedEvents();
};

function isSameDay(dateA, isoB) {
  var a = new Date(dateA);
  var b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
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
    var booked      = ev.participantsCount || 0;
    var spotsLeft   = Math.max(0, totalSpots - booked);
    var tagsArr = [];
    if (ev.eventType && ev.eventType.toLowerCase() !== 'other') {
      var tc = 'tag-sport';
      var ls = ev.eventType.toLowerCase().replace(/[\s_-]+/g, '');
      if (ls.includes('social')) tc = 'tag-social';
      else if (ls.includes('class')) tc = 'tag-class';
      else if (ls.includes('training')) tc = 'tag-training';
      else if (ls.includes('tournament')) tc = 'tag-tournament';
      tagsArr.push('<span class="tag ' + tc + '">' + escHtml(capitalize(ev.eventType)) + '</span>');
    }
    (ev.eventSports || []).forEach(function(s) {
      if (!s) return;
      var tc = 'tag-sport';
      var ls = s.toLowerCase().replace(/[\s_-]+/g, '');
      if (ls.includes('tabletennis') || ls === 'tt') tc = 'tag-tt';
      else if (ls.includes('tennis')) tc = 'tag-tennis';
      else if (ls.includes('padel') || ls.includes('football')) tc = 'tag-padel';
      tagsArr.push('<span class="tag ' + tc + '">' + escHtml(capitalize(s)) + '</span>');
    });
    var tagsHtml = tagsArr.slice(0, 3).join('');
    var id = ev.eventId || ev.mongoId || (ev._id ? String(ev._id) : '');
    var timeStr = d ? formatTime(d) : '';
    var location = ev.eventLocation || ev.gameLocationArena || 'Dubai';

    html += '<div class="event-card fade-in" onclick="location.href=\'/event/' + escHtml(id) + '\'" role="button" tabindex="0">' +
      (thumb
        ? '<img class="event-card-thumb" src="' + escHtml(thumb) + '" alt="' + escHtml(ev.eventName || '') + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
          '<div class="event-card-thumb-fallback" style="display:none"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>'
        : '<div class="event-card-thumb-fallback"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>') +
      '<div class="event-card-body">' +
        '<div class="event-card-name">' + escHtml(ev.eventName || 'Event') + '</div>' +
        '<div class="event-card-by">by ' + escHtml(creatorName) + '</div>' +
        '<div class="event-card-tags" style="margin-bottom:5px;">' + tagsHtml + '</div>' +
        '<div class="event-card-meta">' +
          '<div class="event-card-meta-row">' +
            '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
            escHtml(timeStr) +
          '</div>' +
          '<div class="event-card-meta-row" style="margin-top:2px;">' +
            '<svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
            '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">' + escHtml(location) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="event-card-right">' +
        '<button class="share-btn" onclick="event.stopPropagation();handleShareEvent(\'' + escHtml(id) + '\', \'' + escHtml(ev.eventName) + '\', \'' + escHtml(creatorName) + '\', \'' + escHtml(dateStr + ' ' + timeStr) + '\', \'' + escHtml(location) + '\', \'' + (isFree ? 'Free' : 'AED ' + price) + '\')" aria-label="Share">' +
          '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
        '</button>' +
        '<div style="text-align:right;">' +
          '<div class="spots-badge" style="margin-bottom:3px;">' +
            (totalSpots > 0 ? (spotsLeft > 0 ? spotsLeft + ' spots left' : 'Full') : 'Open') +
          '</div>' +
          (isFree
            ? '<div class="free-badge">Free</div>'
            : '<div class="price-badge"><img src="/public/webapp/assets/dhiram.png" width="14" height="14" style="margin-right:2px;opacity:0.8;" alt="AED"/>' + price + '</div>') +
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

// Run initial render and scroll logic on DOM ready
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('picked-events-container')) {
    renderPickedEvents();
  }
});

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
    
    if (isPast) {
      html += '<div class="cal-date disabled">' + d + '</div>';
    } else {
      var actClass = isActive ? ' active' : '';
      html += '<div class="cal-date' + actClass + '" onclick="selectCalendarDate(\'' + dateObj.toISOString() + '\')">' + d + '</div>';
    }
  }
  
  grid.innerHTML = html;
}

window.selectCalendarDate = function(iso) {
  activeDateISO = iso;
  var d = new Date(iso);
  var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var fullDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  
  var mDisp = document.getElementById('current-month-display');
  var dDisp = document.getElementById('current-day-display');
  if (mDisp) mDisp.textContent = monthNames[d.getMonth()];
  if (dDisp) dDisp.textContent = fullDays[d.getDay()];
  
  document.querySelectorAll('.date-chip').forEach(function(c) { c.classList.remove('active'); });
  document.querySelectorAll('.date-chip').forEach(function(c) {
    if (c.getAttribute('onclick') && c.getAttribute('onclick').includes(iso.substring(0, 10))) {
      c.classList.add('active');
    }
  });
  
  document.getElementById('calendar-modal').style.display = 'none';
  renderPickedEvents();
};

