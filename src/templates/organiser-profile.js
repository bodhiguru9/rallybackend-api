/**
 * Rally Web App — Organiser Profile Template
 * Matches Figma: Organiser Profile (node 3452-2926)
 */
const { e, renderTags, formatDateTime, formatPrice, titleCase, mapEmbedUrl, renderAvatar, renderEventCard, renderPackageCard } = require('./helpers');

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
      <div class="org-profile-name-row">
        <div style="display:flex;align-items:center;flex:1;min-width:0;gap:6px;">
          <div class="org-profile-name">${e(name)}</div>
          ${isVerified ? `
          <img src="/public/webapp/assets/verifiedicon.png" width="20" height="20" alt="Verified" title="Verified Organiser" style="flex-shrink:0;" />` : ''}
        </div>
        <button class="share-btn org-header-share-btn" onclick="handleShareProfile('${e(String(organiser.userId))}', '${e(name)}', '${e(organiser.fullName || name)}')" aria-label="Share">
          <img src="/public/webapp/assets/paper-plane.png" width="22" height="22" alt="Share" />
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
    ` : events.map(ev => renderEventCard({
        ...ev,
        creator: {
          communityName: name,
          fullName: organiser.fullName || name
        }
      })).join('')}
  </div>

  <!-- TAB CONTENT: PACKAGES -->
  <div id="content-packages" style="display:none;">
    ${packages.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">🎟️</div>
        <div class="empty-state-text">No packages available</div>
        <div class="empty-state-sub">This organiser hasn't created any packages yet</div>
      </div>
    ` : packages.map(pkg => renderPackageCard(pkg, organiser)).join('')}
  </div>

</div>

<!-- Page-specific scripts -->
<script>
(function() {
  window.__RALLY_EVENTS__ = ${safeEvents};
  window.__RALLY_PACKAGES__ = ${safePackages};
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
