/**
 * Rally Web App — Organiser Profile Template
 * Matches Figma: Organiser Profile (node 3452-2926)
 */
const { e, renderTags, formatDateTime, formatPrice, titleCase, mapEmbedUrl, renderAvatar } = require('./helpers');

module.exports = function organiserProfileTemplate({ organiser, events = [], packages = [] }) {
  const name = organiser.communityName || organiser.fullName || 'Organiser';
  const pic = organiser.profilePic || '';
  const bio = organiser.organiserBio || '';
  const hosted = organiser.eventsCreated || 0;
  const attendees = organiser.totalAttendees || 0;
  const subscribers = organiser.followersCount || 0;
  
  const isVerified = organiser.isVerified || false;
  const instagramHandle = organiser.instagramHandle || organiser.instagramLink || '';
  const whatsappNumber = organiser.whatsappNumber || organiser.mobileNumber || '';
  
  const sports = organiser.organiserSports || [];
  
  // Inject data for client-side interactivity (tabs)
  const safeEvents = JSON.stringify(events).replace(/<\/script>/gi, '<\\/script>');
  const safePackages = JSON.stringify(packages).replace(/<\/script>/gi, '<\\/script>');

  return `
<!-- TOP BAR -->
<div class="top-bar org-top">
  <div class="top-bar-left">
    <button class="back-btn" onclick="history.length>1?history.back():location.href='/'" aria-label="Go back">
      <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <span class="top-bar-title">Profile</span>
  </div>
</div>

<div class="page-content fade-in">
  
  <!-- PROFILE HEADER -->
  <div class="org-profile-header">
    <div style="position:relative;">
      ${renderAvatar(pic, name, 'org-profile-avatar', 'org-profile-avatar-fallback')}
    </div>
    <div class="org-profile-info">
      <div class="org-profile-name-row" style="display:flex;align-items:center;">
        <div class="org-profile-name">${e(name)}</div>
        ${isVerified ? `
        <div class="verified-badge" title="Verified Organiser" style="margin-left:6px;margin-top:0;">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>` : ''}
        <button class="share-btn" style="margin-left:8px;" onclick="handleShareProfile('${e(String(organiser.userId))}', '${e(name)}', '${e(organiser.fullName || name)}')" aria-label="Share">
          <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div class="org-profile-by">by ${e(organiser.fullName || name)}</div>
      
      <div class="org-contact-row" style="margin-top:16px;">
        ${instagramHandle ? `
        <a href="https://instagram.com/${e(instagramHandle.replace(/\/+$/, '').split('/').pop().split('?')[0].replace(/^@/,''))}" target="_blank" rel="noopener" class="insta-pill">
          <img src="/public/webapp/assets/instagram.png" alt="Insta" width="10" height="10" />
          ${e(instagramHandle.replace(/\/+$/, '').split('/').pop().split('?')[0].replace(/^@/,''))}
        </a>` : ''}
        ${whatsappNumber ? `
        <a href="https://wa.me/${e(whatsappNumber.replace(/[^a-zA-Z0-9+]/g,''))}" target="_blank" rel="noopener" class="insta-pill">
          <img src="/public/webapp/assets/whatsapp-icon.png" alt="WhatsApp" width="10" height="10" />
          ${e(whatsappNumber)}
        </a>` : ''}
      </div>
    </div>
  </div>

  <!-- STATS -->
  <div class="org-stats-row">
    <div class="org-stat">
      <div class="org-stat-num">${hosted}</div>
      <div class="org-stat-label">Hosted</div>
    </div>
    <div class="org-stat">
      <div class="org-stat-num">${attendees}</div>
      <div class="org-stat-label">Attendees</div>
    </div>
    <div class="org-stat">
      <div class="org-stat-num">${subscribers}</div>
      <div class="org-stat-label">Subscribers</div>
    </div>
  </div>

  <!-- BIO & TAGS -->
  ${bio ? `
  <div class="org-bio" id="org-bio-text">
    ${e(bio)}
  </div>` : ''}
  
  ${sports && sports.length > 0 ? `
  <div class="org-sport-tags">
    ${renderTags(sports)}
  </div>` : ''}

  <!-- SHARE (Moved to top row) -->

  <!-- TABS -->
  <div class="org-tabs">
    <div class="org-tab active" id="tab-events" onclick="switchTab('events')">Events</div>
    <div class="org-tab" id="tab-packages" onclick="switchTab('packages')">Packages</div>
    <!-- Snaps tab hidden as per Figma comment / spec -->
  </div>

  <!-- TAB CONTENT: EVENTS -->
  <div id="content-events">
    ${events.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">🎯</div>
        <div class="empty-state-text">No upcoming events</div>
        <div class="empty-state-sub">Check back later for new events</div>
      </div>
    ` : events.map(ev => {
      const p = ev.eventPricePerGuest || ev.gameJoinPrice || 0;
      const isFree = p === 0;
      const spotsBooked = ev.participantsCount || (ev.participants || []).length || 0;
      const totalSpots  = ev.eventMaxGuest || ev.gameSpots || 0;
      const thumb = (ev.eventImages || ev.gameImages || [])[0] || '';
      
      return `
      <div class="event-card" onclick="location.href='/event/${e(String(ev._id))}'">
        ${thumb
          ? `<img class="event-card-thumb" src="${e(thumb)}" alt="${e(ev.eventName || '')}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
             <div class="event-card-thumb-fallback" style="display:none;"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>`
          : `<div class="event-card-thumb-fallback"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>`
        }
        <div class="event-card-body">
          <div class="event-card-name">${e(ev.eventName || 'Event')}</div>
          <div class="event-card-tags" style="margin-bottom:8px;">${renderTags(ev.eventSports, ev.eventType)}</div>
          
          <div class="event-card-meta">
            <div class="event-card-meta-row">
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ${e(formatDateTime(ev.eventDateTime))}
            </div>
            <div class="event-card-meta-row" style="margin-top:2px;">
              <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">
                ${e(ev.eventLocation || ev.gameLocationArena || 'Dubai')}
              </span>
            </div>
          </div>
        </div>
        <div class="event-card-right">
          <button class="share-btn" onclick="event.stopPropagation(); handleShareEvent('${e(String(ev._id))}', '${e(ev.eventName || 'Event')}', '${e(name)}', '${e(formatDateTime(ev.eventDateTime))}', '${e(ev.eventLocation || '')}', '${isFree ? 'Free' : e(p)}') " aria-label="Share">
            <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
          <div style="text-align:right;">
            <div class="spots-badge" style="margin-bottom:3px;">
              ${totalSpots > 0 ? (totalSpots - spotsBooked > 0 ? (totalSpots - spotsBooked) + ' spots left' : 'Full') : 'Available'}
            </div>
            ${isFree 
              ? `<div class="free-badge">Free</div>` 
              : `<div class="price-badge">${formatPrice(p)}</div>`
            }
          </div>
        </div>
      </div>
      `;
    }).join('')}
  </div>

  <!-- TAB CONTENT: PACKAGES -->
  <div id="content-packages" style="display:none;">
    ${packages.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">🎟️</div>
        <div class="empty-state-text">No packages available</div>
        <div class="empty-state-sub">This organiser hasn't created any packages yet</div>
      </div>
    ` : packages.map(pkg => {
      // Figma shows packages like events but slightly different card format
      const price = pkg.packagePrice || pkg.price || 0;
      return `
      <div class="pkg-card" onclick="handleDownload()">
        <div class="pkg-card-header">
          <div class="pkg-card-name">${e(pkg.packageName || pkg.title || 'Package')}</div>
          <button class="pkg-card-share" onclick="event.stopPropagation(); handleSharePackage('${e(String(pkg._id))}')">
            <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div class="event-card-tags">${renderTags(pkg.sports || pkg.sport)}</div>
        <div class="pkg-card-meta">
          ${pkg.validityDays ? `
          <div class="pkg-card-meta-row">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Valid for ${pkg.validityDays} days
          </div>` : ''}
          ${pkg.location ? `
          <div class="pkg-card-meta-row">
            <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${e(pkg.location)}
          </div>` : ''}
        </div>
        <div class="pkg-card-footer">
          <div class="spots-badge">${pkg.credits ? pkg.credits + ' Credits' : 'Available'}</div>
          <div class="pkg-price">${e(formatPrice(price))}</div>
        </div>
      </div>
      `;
    }).join('')}
  </div>

</div>

<!-- Page-specific scripts -->
<script>
(function() {
  // Bio truncation
  var bioEl = document.getElementById('org-bio-text');
  if (bioEl && bioEl.textContent.trim().length > 150) {
    var full = bioEl.textContent.trim();
    var short = full.slice(0, 150) + '…';
    bioEl.innerHTML = escHtml(short) + ' <span class="read-more" onclick="toggleBio(event)">Read More</span>';
    
    window.toggleBio = function(e) {
      if (bioEl.dataset.expanded === '1') {
        bioEl.innerHTML = escHtml(short) + ' <span class="read-more" onclick="toggleBio(event)">Read More</span>';
        bioEl.dataset.expanded = '0';
      } else {
        bioEl.innerHTML = escHtml(full) + ' <span class="read-more" onclick="toggleBio(event)">Read Less</span>';
        bioEl.dataset.expanded = '1';
      }
    };
  }

  // Tabs
  window.switchTab = function(tab) {
    document.getElementById('tab-events').classList.remove('active');
    document.getElementById('tab-packages').classList.remove('active');
    document.getElementById('content-events').style.display = 'none';
    document.getElementById('content-packages').style.display = 'none';
    
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('content-' + tab).style.display = 'block';
  };

  // Safe share handler
  window.handleShareProfile = function(id) {
    if (navigator.share) {
      navigator.share({
        title: 'Rally Organiser Profile',
        url: window.location.href
      }).catch(console.error);
    } else {
      handleDownload();
    }
  };

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
</script>
`;
};
