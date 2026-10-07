/**
 * Rally Web App — Homepage Template
 * Matches Figma: Homepage (node 3333-30673)
 */
const { e, renderTags, formatDateTime, formatPrice, renderAvatar } = require('./helpers');

module.exports = function homepageTemplate({ topOrganisers = [], featuredEvents = [], pickedEvents = [] }) {
  
  // Inject data for client-side interactivity (filters & date strip)
  const safePickedEvents = JSON.stringify(pickedEvents).replace(/<\/script>/gi, '<\\/script>');

  return `
<!-- TOP BAR -->
<div class="top-bar">
  <div class="top-bar-left">
    <div class="location-pill">
      <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      Dubai
      <svg viewBox="0 0 24 24" width="12" height="12" style="margin-left:2px;"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
  </div>
  <button class="download-pill-btn" onclick="handleDownload()">
    Download App
  </button>
</div>

<div class="page-content fade-in">
  
  <!-- TOP ORGANISERS -->
  ${topOrganisers.length > 0 ? `
  <div class="section-header">
    <div class="section-title">Top Organisers</div>
    <div class="section-arrow"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
  </div>
  <div class="organisers-scroll">
    ${topOrganisers.map(org => {
      const name = org.communityName || org.fullName || 'Organiser';
      return `
      <div class="organiser-chip" onclick="location.href='/organiser/${e(String(org.userId))}'">
        <div class="organiser-avatar-wrap">
          ${renderAvatar(org.profilePic, name, 'organiser-avatar', 'organiser-avatar-fallback')}
          ${org.isVerified ? `
          <div class="verified-dot">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>` : ''}
        </div>
        <div class="organiser-name">${e(name)}</div>
      </div>
      `;
    }).join('')}
  </div>` : ''}

  <!-- FEATURED EVENTS -->
  ${featuredEvents.length > 0 ? `
  <div class="section-header" style="padding-top:12px;">
    <div class="section-title">Featured Events</div>
  </div>
  <div class="featured-scroll">
    ${featuredEvents.map(ev => {
      const thumb = (ev.eventImages || ev.gameImages || [])[0] || '';
      const creatorName = ev.creator?.communityName || ev.creator?.fullName || ev.eventCreatorName || 'Organiser';
      const id = ev.eventId || ev._id;
      return `
      <div class="featured-card" onclick="location.href='/event/${e(String(id))}'">
        ${thumb
          ? `<img class="featured-card-img" src="${e(thumb)}" alt="${e(ev.eventName || '')}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
             <div class="featured-card-img-fallback" style="display:none;"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>`
          : `<div class="featured-card-img-fallback"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>`
        }
        <div class="featured-card-overlay"></div>
        <div class="featured-card-tags">
          ${renderTags(ev.eventSports, ev.eventType)}
        </div>
        <div class="featured-card-body">
          <div class="featured-card-name">${e(ev.eventName || 'Event')}</div>
          <div class="featured-card-by">by ${e(creatorName)}</div>
          <div class="featured-card-date">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${e(formatDateTime(ev.eventDateTime))}
          </div>
        </div>
      </div>
      `;
    }).join('')}
  </div>` : ''}

  <!-- PICKED FOR YOU -->
  <div class="section-header" style="padding-top:12px;">
    <div class="section-title">Picked for you</div>
  </div>
  
  <!-- Filters Row -->
  <div class="filters-row-container">
    <div class="filters-row" id="home-filters">
      <div class="filter-chip-wrapper" id="filter-wrap-sports">
        <div class="filter-chip" onclick="toggleFilter('sports')">Sports <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></div>
        <div class="filter-panel" id="filter-panel-sports">
          <div class="filter-option" onclick="selectFilter('sports', 'All', this)">All Sports</div>
          ${Array.from(new Set(pickedEvents.flatMap(e => e.eventSports || []))).filter(Boolean).map(s => `
            <div class="filter-option" onclick="selectFilter('sports', '${s.replace(/'/g, "\\'")}', this)">${s}</div>
          `).join('')}
        </div>
      </div>
      <div class="filter-chip-wrapper" id="filter-wrap-eventtype">
        <div class="filter-chip" onclick="toggleFilter('eventtype')">Event Type <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></div>
        <div class="filter-panel" id="filter-panel-eventtype">
          <div class="filter-option" onclick="selectFilter('eventtype', 'All', this)">All Types</div>
          ${Array.from(new Set(pickedEvents.map(e => e.eventType))).filter(Boolean).map(et => `
            <div class="filter-option" onclick="selectFilter('eventtype', '${et.replace(/'/g, "\\'")}', this)">${et}</div>
          `).join('')}
        </div>
      </div>
    <div class="filter-chip-wrapper" id="filter-wrap-gender">
      <div class="filter-chip" onclick="toggleFilter('gender')">Gender <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></div>
      <div class="filter-panel" id="filter-panel-gender">
        <div class="filter-option" onclick="selectFilter('gender', 'All', this)">All Genders</div>
        <div class="filter-option" onclick="selectFilter('gender', 'Open', this)">Open</div>
        <div class="filter-option" onclick="selectFilter('gender', 'Male', this)">Male only</div>
        <div class="filter-option" onclick="selectFilter('gender', 'Female', this)">Female only</div>
      </div>
    </div>
    <div class="filter-chip-wrapper" id="filter-wrap-location">
      <div class="filter-chip" onclick="toggleFilter('location')">Location <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></div>
      <div class="filter-panel" id="filter-panel-location">
        <div class="filter-option" onclick="selectFilter('location', 'All', this)">Everywhere</div>
        <div class="filter-option" onclick="selectFilter('location', 'Dubai', this)">Dubai</div>
        <div class="filter-option" onclick="selectFilter('location', 'Abu Dhabi', this)">Abu Dhabi</div>
      </div>
    </div>
    <div class="filter-chip-wrapper" id="filter-wrap-price">
      <div class="filter-chip" onclick="toggleFilter('price')">Price <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></div>
      <div class="filter-panel" id="filter-panel-price">
        <div class="filter-option" onclick="selectFilter('price', 'All', this)">Any Price</div>
        <div class="filter-option" onclick="selectFilter('price', '0', this)">Free</div>
        <div class="filter-option" onclick="selectFilter('price', '30', this)">30 AED</div>
        <div class="filter-option" onclick="selectFilter('price', '50', this)">50 AED</div>
        <div class="filter-option" onclick="selectFilter('price', '100', this)">100 AED</div>
        <div class="filter-option" onclick="selectFilter('price', '150', this)">150 AED</div>
        <div class="filter-option" onclick="selectFilter('price', '300', this)">300 AED</div>
      </div>
    </div>
  </div>

  <!-- Date Header & Strip -->
  <div class="date-header">
    <div class="date-header-left">
      <span style="font-weight:700;color:var(--c-text-1);">Date</span>
      <span style="margin:0 8px;color:var(--c-text-2);">•</span>
      <span style="color:var(--c-text-2);" id="current-month-display">Month</span>
    </div>
    <button class="calendar-pill-btn" onclick="openCalendarModal()">Calendar</button>
  </div>
  <div class="date-strip" id="home-date-strip">
    <!-- Populated dynamically via JS -->
  </div>
  
  <div class="date-header" style="margin-top:12px;margin-bottom:8px;">
    <div class="date-header-left">
      <span style="font-weight:700;color:var(--c-text-1);">Today</span>
      <span style="margin:0 8px;color:var(--c-text-2);">•</span>
      <span style="color:var(--c-text-2);" id="current-day-display">Day</span>
    </div>
  </div>

  <!-- Picked Events List -->
  <div id="picked-events-container">
    ${pickedEvents.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">🎾</div>
        <div class="empty-state-text">No events found</div>
        <div class="empty-state-sub">Try adjusting your filters or checking back later.</div>
      </div>
    ` : ''}
    <!-- Content rendered via JS in app.js for instant filtering -->
  </div>

  <!-- Calendar Modal -->
  <div id="calendar-modal" class="modal-overlay" style="display:none;" onclick="closeCalendarModal(event)">
    <div class="calendar-modal-content" onclick="event ? event.stopPropagation() : null">
      <div class="calendar-header">
        <div id="calendar-month-year" style="font-weight:600;font-size:16px;"></div>
        <div style="display:flex;gap:12px;align-items:center;">
          <button onclick="prevCalendarMonth()" class="cal-nav-btn">&lt;</button>
          <button onclick="nextCalendarMonth()" class="cal-nav-btn">&gt;</button>
          <button onclick="closeCalendarModal()" class="calendar-done-btn">Done</button>
        </div>
      </div>
      <div class="calendar-grid">
        <div class="cal-day">SUN</div>
        <div class="cal-day">MON</div>
        <div class="cal-day">TUE</div>
        <div class="cal-day">WED</div>
        <div class="cal-day">THU</div>
        <div class="cal-day">FRI</div>
        <div class="cal-day">SAT</div>
        <!-- Grid populated dynamically via JS -->
      </div>
      <div id="calendar-grid-dates" class="calendar-grid" style="row-gap:16px;margin-top:16px;"></div>
    </div>
  </div>
</div>

<!-- Page-specific scripts -->
<script>
(function() {
  window.__RALLY_PICKED_EVENTS__ = ${safePickedEvents};
  
  // Quick date strip generator (next 14 days)
  var ds = document.getElementById('home-date-strip');
  if (ds) {
    var html = '';
    var today = new Date();
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var fullDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    
    var mDisp = document.getElementById('current-month-display');
    var dDisp = document.getElementById('current-day-display');
    if (mDisp) mDisp.textContent = monthNames[today.getMonth()];
    if (dDisp) dDisp.textContent = fullDays[today.getDay()];
    
    // Set activeDateISO for initial render
    if (window.activeDateISO === null) window.activeDateISO = today.toISOString();

    for(var i=0; i<14; i++) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      var act = i === 0 ? ' active' : '';
      html += '<div class="date-chip' + act + '" onclick="filterByDate(this, \\'' + d.toISOString() + '\\')">' +
              '<div class="d-num">' + d.getDate() + '</div>' +
              '<div class="d-day">' + days[d.getDay()] + '</div>' +
              '</div>';
    }
    ds.innerHTML = html;
  }
})();
</script>
`;
};
