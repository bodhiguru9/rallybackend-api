/**
 * Rally Web App — Event Detail Page Template
 * Matches Figma: EventDetailsScreen (node 3406-1788)
 *
 * Sections:
 * 1. Top bar (back + "Event Details" title + share icon)
 * 2. Hero card (thumbnail, name, organiser, sport tags)
 * 3. Date & Location card (with embedded map)
 * 4. Members & Guests card (view-only avatars + tap to open modal)
 * 5. About Event card
 * 6. Restrictions card (if any)
 * 7. Refund Policy card (if paid)
 * 8. Organiser card (tappable → /organiser/:id)
 * 9. Sticky footer (Download App button, price row if paid)
 * 10. Members Modal (sheet, 4-col avatar grid)
 */

const { e, formatDateTime, renderTags, renderAvatar, formatPrice,
        restrictionText, mapEmbedUrl, refundPolicyText, renderParticipantAvatars } = require('./helpers');

module.exports = function eventDetailTemplate({ event }) {
  const price = event.eventPricePerGuest || event.gameJoinPrice || 0;
  const priceFormatted = formatPrice(price);
  const spotsBooked = event.participantsCount || (event.participants || []).length || 0;
  const totalSpots  = event.eventMaxGuest || event.gameSpots || 0;
  const spotsAvailable = Math.max(0, totalSpots - spotsBooked);
  const isFull = spotsAvailable === 0;
  const participants = event.participants || [];

  const creatorId  = event.creator?.userId || event.organiserId || '';
  const creatorName  = event.creator?.fullName || event.eventCreatorName || '';
  const creatorPic   = event.creator?.profilePic || event.eventCreatorProfilePic || '';
  const communityName = event.creator?.communityName || '';
  const eventsCreated = event.creator?.eventsCreated || 0;
  const totalAttendees = event.creator?.totalAttendees || 0;

  const restriction = restrictionText(event);
  const mapUrl = mapEmbedUrl(event.eventLocation || event.gameLocationArena);
  const refundNote = refundPolicyText(event.policyJoind, event.eventDateTime);
  const heroImage = (event.eventImages || event.gameImages || [])[0] || '';

  const instagramHandle = event.creator?.instagramHandle || event.creator?.instagramLink || '';
  const whatsappNumber   = event.creator?.whatsappNumber || event.creator?.mobileNumber || '';

  // Modal participants JSON (injected server-side for instant modal render)
  const participantsJson = JSON.stringify(participants).replace(/<\/script>/gi, '<\\/script>');

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

<!-- PAGE CONTENT -->
<div class="page-content fade-in" id="ed-content">

  <!-- 1. HERO CARD -->
  <div class="ed-hero-section">
    ${heroImage
      ? `<img class="ed-hero-img" src="${e(heroImage)}" alt="${e(event.eventName || '')}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
         <div class="ed-hero-img" style="display:none;background:linear-gradient(135deg,#1E3A5F,#3B82F6);border-radius:12px;align-items:center;justify-content:center;">
           <svg viewBox="0 0 24 24" width="32" height="32" stroke="rgba(255,255,255,0.5)" fill="none"><circle cx="12" cy="12" r="10"/></svg>
         </div>`
      : `<div class="ed-hero-img" style="background:linear-gradient(135deg,#1E3A5F,#3B82F6);border-radius:12px;display:flex;align-items:center;justify-content:center;">
           <svg viewBox="0 0 24 24" width="32" height="32" stroke="rgba(255,255,255,0.5)" fill="none"><circle cx="12" cy="12" r="10"/></svg>
         </div>`
    }
    <div class="ed-hero-info">
      <div class="ed-title">${e(event.eventName || 'Event')}</div>
      <div class="ed-by">by ${e(communityName || creatorName)}</div>
      <div class="event-card-tags">${renderTags(event.eventSports, event.eventType)}</div>
    </div>
    <button class="ed-hero-share" onclick="handleShare()" aria-label="Share event">
      <img src="/public/webapp/assets/paper-plane.png" alt="Share" width="16" height="16" />
    </button>
  </div>

  <!-- 2. DATE & LOCATION CARD -->
  <div class="ed-card">
    <div class="ed-card-title">Date &amp; Location</div>
    <div class="ed-card-row">
      <img src="/public/webapp/assets/time.png" alt="Time" width="15" height="15" style="flex-shrink:0;margin-top:2px;" />
      <span class="ed-card-row-text">${e(formatDateTime(event.eventDateTime, event.eventEndDateTime))}</span>
    </div>
    <div class="ed-card-row">
      <img src="/public/webapp/assets/location-pin.png" alt="Location" width="15" height="15" style="flex-shrink:0;margin-top:2px;" />
      <span class="ed-card-row-text">${e(event.eventLocation || event.gameLocationArena || 'Location TBC')}</span>
    </div>
    ${mapUrl ? `<iframe class="ed-map" src="${mapUrl}" loading="lazy" allowfullscreen="" referrerpolicy="no-referrer-when-downgrade" title="Event Location Map"></iframe>` : ''}
  </div>

  <!-- 3. MEMBERS & GUESTS -->
  <div class="ed-card">
    <div class="ed-card-title">Members &amp; Guests</div>
    <div class="ed-spots-row">
      <span class="ed-spots-count">${spotsBooked}/${totalSpots}</span>
      <span class="ed-spots-available" onclick="openMembersModal()" role="button" tabindex="0">
        ${isFull ? 'Full' : 'Spots Available'}
      </span>
    </div>
    ${renderParticipantAvatars(participants, 4)}
    ${refundNote ? `<div class="ed-refund-note">Refundable until: ${e(refundNote)}</div>` : ''}
  </div>

  <!-- 4. ABOUT EVENT & RESTRICTIONS -->
  <div class="ed-card">
    <div class="ed-card-title">About Event</div>
    <div class="ed-desc" id="ed-desc-text">${e(event.eventDescription || event.gameDescription || `Join us for an exciting ${event.eventType || 'sport'} event. A perfect mix of sport, fun, and community!`)}</div>
    ${(event.eventDescription || event.gameDescription || '').length > 200
      ? `<div style="margin-top:8px;"><span style="color:#3D6F92;font-size:13px;font-weight:600;cursor:pointer;" onclick="toggleDesc()">Read More</span></div>`
      : ''}
    <div class="ed-divider"></div>
    <div class="ed-card-title">Restrictions</div>
    <div class="ed-desc">${e(restriction || 'No specific restrictions.')}</div>
  </div>

  <!-- 6. REFUND POLICY (paid events only) -->
  ${priceFormatted && refundNote ? `
  <div class="ed-card">
    <div class="ed-card-title">Refund Policy</div>
    <div class="refund-text">${e(refundNote)}</div>
  </div>` : ''}

  <!-- 7. ORGANISER CARD -->
  ${creatorId ? `
  <div class="ed-card">
    <div class="ed-card-title">${e(communityName || 'Organiser')}</div>
    <div class="ed-org-card" onclick="location.href='/organiser/${e(String(creatorId))}'">
      <div>
        ${renderAvatar(creatorPic, communityName || creatorName, 'ed-org-avatar', 'ed-org-avatar-fallback')}
      </div>
      <div style="flex:1;min-width:0;">
        <div class="ed-org-name">${e(communityName || creatorName)}</div>
        <div class="ed-org-stats">
          <span class="tag tag-hosted">&#127931; ${eventsCreated} Hosted</span>
          <span class="tag tag-attendees">&#128101; ${totalAttendees} Attendees</span>
        </div>
        ${instagramHandle ? `<div class="org-contact-row" style="margin-top:8px;">
          <a href="https://instagram.com/${e(instagramHandle.replace(/^@/,''))}" target="_blank" rel="noopener" class="org-contact-link" onclick="event.stopPropagation()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/></svg>
            @${e(instagramHandle.replace(/^@/,''))}
          </a>
          ${whatsappNumber ? `<a href="https://wa.me/${e(whatsappNumber.replace(/\D/g,''))}" target="_blank" rel="noopener" class="org-contact-link" onclick="event.stopPropagation()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            ${e(whatsappNumber)}
          </a>` : ''}
        </div>` : ''}
      </div>
    </div>
  </div>` : ''}

  <!-- Bottom spacer for sticky footer -->
  <div style="height:24px;"></div>
</div>

<!-- STICKY FOOTER -->
<div class="sticky-footer">
  <div class="sticky-footer-inner">
    ${priceFormatted ? `
    <div class="footer-price-row">
      <span class="footer-price-label">Payment Details</span>
      <span class="footer-price-amount">${priceFormatted}</span>
    </div>` : ''}
    <button class="download-btn" onclick="handleDownload()">Download App to Book</button>
  </div>
</div>

<!-- MEMBERS MODAL -->
<div class="modal-backdrop" id="members-modal" onclick="closeMembersModal(event)">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-header">
      <div>
        <div class="modal-title">${e(event.eventName || 'Members')}</div>
        <div class="modal-subtitle">by ${e(communityName || creatorName)}</div>
      </div>
      <button class="modal-close" onclick="closeMembersModal()" aria-label="Close">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-spots-row">
      <span class="modal-spots-text">${spotsBooked}/${totalSpots}</span>
      <span class="modal-spots-label">${isFull ? 'Full' : 'Spots Available'}</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" id="modal-progress" style="width:${totalSpots > 0 ? Math.min(100, (spotsBooked/totalSpots)*100).toFixed(1) : 0}%"></div>
    </div>
    <div class="modal-grid" id="modal-grid">
      <!-- Populated by app.js from window.__RALLY__.participants -->
    </div>
  </div>
</div>

<!-- Page-specific scripts -->
<script>
(function() {
  // Truncate long description
  var descEl = document.getElementById('ed-desc-text');
  if (descEl && descEl.textContent.length > 200) {
    var full = descEl.textContent;
    var short = full.slice(0, 200) + '…';
    descEl.textContent = short;
    window.toggleDesc = function() {
      var expanded = descEl.dataset.expanded === '1';
      descEl.textContent = expanded ? short : full;
      descEl.dataset.expanded = expanded ? '0' : '1';
      event.target.textContent = expanded ? 'Read More' : 'Read Less';
    };
  }

  // Members modal
  window.openMembersModal = function() {
    document.getElementById('members-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    renderModalGrid();
  };
  window.closeMembersModal = function(e) {
    if (!e || e.target === document.getElementById('members-modal')) {
      document.getElementById('members-modal').classList.remove('open');
      document.body.style.overflow = '';
    }
  };

  function renderModalGrid() {
    var grid = document.getElementById('modal-grid');
    if (!grid) return;
    var participants = (window.__RALLY__ && window.__RALLY__.participants) || [];
    if (participants.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--c-text-3);">No participants yet</div>';
      return;
    }
    grid.innerHTML = participants.map(function(p) {
      var initials = (p.fullName || '?').split(/\\s+/).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase();
      var av = p.profilePic
        ? '<img class="modal-participant-av" src="' + escHtml(p.profilePic) + '" alt="' + escHtml(p.fullName || '') + '" onerror="this.style.display=\\\'none\\\';this.nextElementSibling.style.display=\\\'flex\\\';">'
          + '<div class="modal-participant-av-fallback" style="display:none;">' + escHtml(initials) + '</div>'
        : '<div class="modal-participant-av-fallback">' + escHtml(initials) + '</div>';
      var extra = (p.guestsCount || p.guestCount || 1) - 1;
      var name = (p.fullName || 'Guest') + (extra > 0 ? ' (+' + extra + ')' : '');
      return '<div class="modal-participant">' + av + '<div class="modal-participant-name">' + escHtml(name) + '</div></div>';
    }).join('');
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
</script>`;
};
