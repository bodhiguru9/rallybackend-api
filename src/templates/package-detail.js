/**
 * Rally Web App — Package Detail Page Template
 * Matches PlayerPackageDetailScreen.tsx
 *
 * Sections:
 * 1. Top bar (back + "Package Details" title + Download App button)
 * 2. Hero card (thumbnail, name, sport tags + +N badge, eventType tag, share button)
 * 3. Date & Location card (validity date, location, embedded map)
 * 4. About Package & Restrictions card (description + read more, restrictions, participant avatars)
 * 5. Validity card (golden coins, validity title & subtitle)
 * 6. Organiser profile card (avatar, name, social links, hosted & attendees stats)
 * 7. Registration start banner (if future start time)
 * 8. FAQs accordion card
 * 9. Sticky footer (Payment Details breakdown + Total + Download App to Book button)
 */

const {
  e,
  renderTags,
  renderAvatar,
  formatPrice,
  mapEmbedUrl,
  renderParticipantAvatars,
  formatPackageValidity,
  formatPackageLocation,
} = require('./helpers');

const DEFAULT_FAQS = [
  {
    question: 'How long is this package valid?',
    answer: 'The package validity duration is set by the organiser upon creation, expiring at the end of the specified term.',
  },
  {
    question: 'Can I cancel or switch plans later?',
    answer: 'Yes, you can cancel or change your plan from your profile settings before the renewal date.',
  },
  {
    question: 'Can I bring a guest on my subscription?',
    answer: 'Subscriptions are applicable for the account holder. Additional guests may require separate tickets or bookings.',
  },
];

module.exports = function packageDetailTemplate({ package: pkg, organiser = {}, timeZone = null }) {
  const pkgId = pkg.packageId || (pkg._id ? String(pkg._id) : '');
  const title = pkg.packageName || 'Package Details';
  const price = Number(pkg.packagePrice ?? pkg.price ?? 0);
  const vat = Math.round(price * 0.05 * 100) / 100;
  const finalTotal = price + vat;

  const validityDateString = formatPackageValidity(pkg, timeZone);
  const duration = pkg.validityPeriod?.duration;
  const durationStartIso = duration && duration[0] ? new Date(duration[0]).toISOString() : '';
  const durationEndIso = duration && duration[1] ? new Date(duration[1]).toISOString() : '';
  const locationDisplayString = formatPackageLocation(pkg);
  const mapUrl = mapEmbedUrl(locationDisplayString);

  // Validity card title & subtitle matching PlayerPackageDetailScreen.tsx
  let validityCardTitle = '1 Month Validity';
  if (pkg.validityMonths) {
    validityCardTitle = `${pkg.validityMonths} Month${pkg.validityMonths > 1 ? 's' : ''} Validity`;
  } else if (pkg.validityDays) {
    validityCardTitle = `${pkg.validityDays} Days Validity`;
  } else if (pkg.validity) {
    validityCardTitle = `${pkg.validity} Validity`;
  }
  const validityCardSubtitle = `You can attend events by this organiser during the validity:\n${validityDateString}`;

  // Restrictions text matching PlayerPackageDetailScreen.tsx
  let restrictionsText = 'Open & All Ages';
  if (pkg.restrictions) {
    const r = pkg.restrictions;
    const parts = [];
    if (r.gender && r.gender !== 'open' && r.gender !== 'all') {
      parts.push(r.gender.charAt(0).toUpperCase() + r.gender.slice(1) + ' Only');
    } else {
      parts.push('Open');
    }
    if (r.ageRange && (r.ageRange.min > 0 || (r.ageRange.max && r.ageRange.max < 100))) {
      parts.push(`Ages ${r.ageRange.min}-${r.ageRange.max}`);
    } else {
      parts.push('All Ages');
    }
    if (r.sportsLevel && r.sportsLevel !== 'all') {
      parts.push(r.sportsLevel.charAt(0).toUpperCase() + r.sportsLevel.slice(1));
    }
    if (r.levelRestriction && r.levelRestriction.trim()) {
      parts.push(r.levelRestriction.trim());
    }
    restrictionsText = parts.join(' & ');
  }

  // Sports & Badges
  const sports = Array.isArray(pkg.sports) && pkg.sports.length > 0 ? pkg.sports : ['all-sports'];
  const primarySport = sports[0];
  const additionalSportsCount = Math.max(0, sports.length - 1);
  const eventType = Array.isArray(pkg.eventType)
    ? (pkg.eventType[0] || '')
    : (typeof pkg.eventType === 'string' ? pkg.eventType : '');

  // Thumbnail
  const heroImage = pkg.imageUri || (pkg.packageImages && pkg.packageImages[0]) || '';

  // Participants & Spots
  const rawJoined = Array.isArray(pkg.joinedUsers)
    ? pkg.joinedUsers
    : (Array.isArray(pkg.purchasedBy) ? pkg.purchasedBy : []);
  const joinedCount = pkg.joinedUsersCount !== undefined && pkg.joinedUsersCount !== null
    ? pkg.joinedUsersCount
    : rawJoined.length;
  const maxSpots = pkg.maxPurchases || pkg.maxEvents || 0;
  const spotsLeft = maxSpots > 0 ? Math.max(0, maxSpots - joinedCount) : null;

  const participants = rawJoined.map((item, idx) => {
    const u = item.user || item;
    return {
      userId: u.userId ?? idx,
      fullName: u.fullName || 'Player',
      profilePic: u.profilePic || null,
    };
  });

  // Creator
  const creator = pkg.creator || organiser || {};
  const creatorId = creator.userId || creator._id || '';
  const creatorName = creator.communityName || creator.fullName || 'Organiser';
  const creatorPic = creator.profilePic || '';
  const eventsCreated = creator.eventsCreated || 0;
  const totalAttendees = creator.totalAttendees || 0;
  const instagramHandle = creator.instagramLink || creator.instagram_link || creator.instagramHandle || '';
  const whatsappNumber = creator.whatsappNumber || creator.mobileNumber || '';

  // Future registration check
  let isRegFuture = false;
  let regStartText = '';
  const regStartIso = pkg.registrationStartTime ? new Date(pkg.registrationStartTime).toISOString() : '';
  if (pkg.registrationStartTime) {
    try {
      const regTime = new Date(pkg.registrationStartTime).getTime();
      if (!isNaN(regTime) && regTime > Date.now()) {
        isRegFuture = true;
        const d = new Date(pkg.registrationStartTime);
        const opts = {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        };
        if (timeZone) opts.timeZone = timeZone;
        const formatted = d.toLocaleDateString('en-GB', opts);
        regStartText = `Registration starts on ${formatted}`;
      }
    } catch {}
  }

  // FAQs
  const faqs = Array.isArray(pkg.faqs) && pkg.faqs.length > 0 ? pkg.faqs : DEFAULT_FAQS;

  const description = pkg.packageDescription || pkg.description || 'No description provided.';

  // Safe JSON injection
  const safePkg = JSON.stringify(pkg).replace(/<\/script>/gi, '<\\/script>');
  const safeParticipants = JSON.stringify(participants).replace(/<\/script>/gi, '<\\/script>');

  return `
<!-- TOP BAR -->
<div class="top-bar">
  <div class="top-bar-left">
    <button class="back-btn" onclick="history.length>1?history.back():location.href='/'" aria-label="Go back">
      <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <span class="top-bar-title">Package Details</span>
  </div>
  <button class="download-pill-btn" onclick="handleDownload()" id="top-download-btn">
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="#fff" fill="none" stroke-width="2.5"><path d="M12 16l-4-4h2.5V4h3v8H16l-4 4z"/><path d="M4 18h16"/></svg>
    Download App
  </button>
</div>

<!-- PAGE CONTENT -->
<div class="page-content fade-in" id="pd-content">

  <!-- 1. PACKAGE OVERVIEW HERO CARD -->
  <div class="ed-card pd-hero-card">
    <div class="pd-hero-row">
      ${heroImage
        ? `<img class="pd-hero-img" src="${e(heroImage)}" alt="${e(title)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
           <div class="pd-hero-img pd-fallback-img" style="display:none;">
             <img src="/public/webapp/assets/other-yellow.png" width="32" height="32" alt="" />
           </div>`
        : `<div class="pd-hero-img pd-fallback-img">
             <img src="/public/webapp/assets/other-yellow.png" width="32" height="32" alt="" />
           </div>`
      }
      <div class="pd-hero-info">
        <div class="pd-title">${e(title)}</div>
        <div class="pd-tags-row">
          ${renderTags(primarySport)}
          ${additionalSportsCount > 0 ? `<span class="pd-overflow-badge">+${additionalSportsCount}</span>` : ''}
          ${eventType && eventType !== 'all-event-types' ? renderTags(null, eventType) : ''}
        </div>
      </div>
      <button class="pd-share-btn" onclick="handleSharePackage('${e(String(pkgId))}', '${e(title)}', '${e(creatorName)}', '${e(validityDateString)}', '${e(locationDisplayString)}', '${e(sports.join(', '))}', '${price}')" aria-label="Share package">
        <img src="/public/webapp/assets/paper-plane.png" width="18" height="18" alt="Share" />
      </button>
    </div>
  </div>

  <!-- 2. DATE, LOCATION & MAP CARD -->
  <div class="ed-card">
    <div class="ed-card-row">
      <img src="/public/webapp/assets/time.png" alt="Time" width="16" height="16" style="flex-shrink:0;margin-top:2px;" />
      <span class="ed-card-row-text js-validity-text" data-duration-start="${e(durationStartIso)}" data-duration-end="${e(durationEndIso)}">${e(validityDateString)}</span>
    </div>
    <div class="ed-card-row" style="margin-top:8px;">
      <img src="/public/webapp/assets/location-pin.png" alt="Location" width="16" height="16" style="flex-shrink:0;margin-top:2px;" />
      <span class="ed-card-row-text">${e(locationDisplayString)}</span>
    </div>
    ${mapUrl ? `<div class="pd-map-wrap"><iframe class="ed-map" src="${mapUrl}" loading="lazy" allowfullscreen="" referrerpolicy="no-referrer-when-downgrade" title="Package Location Map"></iframe></div>` : ''}
  </div>

  <!-- 3. ABOUT PACKAGE & RESTRICTIONS -->
  <div class="ed-card">
    <div class="ed-card-title">About Package</div>
    <div class="ed-desc" id="pd-desc-text">${e(description)}</div>
    ${description.length > 180 ? `
      <div style="margin-top:8px;">
        <span class="pd-read-more" onclick="togglePackageDesc()">Read More</span>
      </div>` : ''}
    <div class="ed-divider"></div>
    <div class="ed-card-title">Restrictions</div>
    <div class="pd-restrictions-row">
      <span class="pd-restrictions-text">${e(restrictionsText)}</span>
      <div onclick="event.stopPropagation();openMembersModalForPackage('${e(String(pkgId))}')" role="button" tabindex="0" title="View package members" style="cursor:pointer;">
        ${renderParticipantAvatars(participants, 4, pkgId, true)}
      </div>
    </div>
  </div>

  <!-- 4. VALIDITY CARD -->
  <div class="ed-card pd-validity-card">
    <div class="pd-validity-coins">
      <img src="/public/webapp/assets/goldencoins.png" width="40" height="40" alt="Validity" />
    </div>
    <div class="pd-validity-title">${e(validityCardTitle)}</div>
    <div class="pd-validity-sub">${e(validityCardSubtitle).replace(/\\n/g, '<br/>')}</div>
  </div>

  <!-- 5. ORGANISER PROFILE CARD -->
  ${creatorId ? `
  <div class="ed-card" onclick="location.href='/organiser/${e(String(creatorId))}'" style="cursor:pointer;">
    <div class="ed-org-card">
      <div>
        ${renderAvatar(creatorPic, creatorName, 'ed-org-avatar', 'ed-org-avatar-fallback')}
      </div>
      <div style="flex:1;min-width:0;">
        <div class="ed-org-name">${e(creatorName)}</div>
        ${(instagramHandle || whatsappNumber) ? `
          <div class="org-contact-row" style="margin:6px 0;">
            ${instagramHandle ? `
              <a href="https://instagram.com/${e(instagramHandle.replace(/^@/,''))}" target="_blank" rel="noopener" class="org-contact-link" onclick="event.stopPropagation()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/></svg>
                @${e(instagramHandle.replace(/^@/,''))}
              </a>` : ''}
            ${whatsappNumber ? `
              <a href="https://wa.me/${e(whatsappNumber.replace(/\\D/g,''))}" target="_blank" rel="noopener" class="org-contact-link" onclick="event.stopPropagation()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                ${e(whatsappNumber)}
              </a>` : ''}
          </div>` : ''}
        <div class="ed-org-stats">
          <span class="tag tag-hosted"><img src="/public/webapp/assets/calendar-hosted.png" width="13" height="13" alt="Hosted" style="vertical-align:middle;margin-right:4px;" />${eventsCreated} Hosted</span>
          <span class="tag tag-attendees"><img src="/public/webapp/assets/multiple-users.png" width="13" height="13" alt="Attendees" style="vertical-align:middle;margin-right:4px;" />${totalAttendees} Attendees</span>
        </div>
      </div>
    </div>
  </div>` : ''}

  <!-- 6. REGISTRATION START BANNER (if in future) -->
  ${isRegFuture ? `
  <div class="ed-card pd-reg-banner">
    <img src="/public/webapp/assets/warning-shield.png" width="24" height="24" alt="Warning" style="object-fit:contain;flex-shrink:0;" />
    <span class="pd-reg-banner-text js-reg-start" data-reg-start="${e(regStartIso)}">${e(regStartText)}</span>
  </div>` : ''}

  <!-- 7. FAQS ACCORDION CARD -->
  <div class="ed-card pd-faqs-card">
    <div class="ed-card-title" style="margin-bottom:12px;">FAQs</div>
    ${faqs.map((faq, idx) => `
      <div class="faq-item" id="faq-item-${idx}">
        <div class="faq-header" onclick="toggleFaq(${idx})">
          <span class="faq-question">${e(faq.question)}</span>
          <svg class="faq-chevron" id="faq-chevron-${idx}" viewBox="0 0 24 24" width="18" height="18" stroke="#64748B" fill="none" stroke-width="2"><polyline points="${idx === 0 ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}"/></svg>
        </div>
        <div class="faq-answer" id="faq-ans-${idx}" style="${idx === 0 ? 'display:block;' : 'display:none;'}">
          ${e(faq.answer)}
        </div>
      </div>
    `).join('')}
  </div>

  <!-- Bottom spacer for sticky footer -->
  <div style="height:170px;"></div>
</div>

<!-- STICKY BOTTOM PAYMENT BAR -->
<div class="sticky-footer pd-sticky-footer">
  <div class="sticky-footer-inner">
    <!-- Expandable Payment Breakdown -->
    <div class="pd-payment-header" onclick="togglePaymentDetails()" role="button" tabindex="0">
      <span class="pd-payment-title">Payment Details</span>
      <svg id="pd-payment-chevron" viewBox="0 0 24 24" width="18" height="18" stroke="#000" fill="none" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="pd-payment-breakdown" id="pd-payment-breakdown" style="display:none;">
      <div class="pd-breakdown-row">
        <span>Package Price</span>
        <span>AED ${price.toFixed(2)}</span>
      </div>
      <div class="pd-breakdown-row">
        <span>VAT (5%)</span>
        <span>AED ${vat.toFixed(2)}</span>
      </div>
    </div>
    <!-- Total Row -->
    <div class="pd-total-row">
      <span class="pd-total-label">Total</span>
      <div class="pd-total-wrap">
        <img src="/public/webapp/assets/dhiram.png" width="16" height="16" alt="AED" />
        <span class="pd-total-amount">${finalTotal.toFixed(2)}</span>
      </div>
    </div>
    <!-- CTA Button -->
    <button class="download-btn pd-download-btn" onclick="handleDownload()">Download App to Book</button>
  </div>
</div>

<!-- Page-specific scripts -->
<script>
(function() {
  window.__RALLY_PACKAGE__ = ${safePkg};
  window.__RALLY_PARTICIPANTS__ = ${safeParticipants};

  // Toggle Description
  var descEl = document.getElementById('pd-desc-text');
  if (descEl && descEl.textContent.length > 180) {
    var full = descEl.textContent;
    var short = full.slice(0, 180) + '…';
    descEl.textContent = short;
    window.togglePackageDesc = function() {
      var expanded = descEl.dataset.expanded === '1';
      descEl.textContent = expanded ? short : full;
      descEl.dataset.expanded = expanded ? '0' : '1';
      event.target.textContent = expanded ? 'Read More' : 'Read Less';
    };
  }

  // Toggle FAQ Accordion
  window.toggleFaq = function(idx) {
    var ans = document.getElementById('faq-ans-' + idx);
    var chev = document.getElementById('faq-chevron-' + idx);
    if (!ans) return;
    var isOpen = ans.style.display !== 'none';
    if (isOpen) {
      ans.style.display = 'none';
      if (chev) chev.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
    } else {
      ans.style.display = 'block';
      if (chev) chev.innerHTML = '<polyline points="18 15 12 9 6 15"/>';
    }
  };

  // Toggle Payment Details
  window.togglePaymentDetails = function() {
    var bd = document.getElementById('pd-payment-breakdown');
    var chev = document.getElementById('pd-payment-chevron');
    if (!bd) return;
    var isShown = bd.style.display !== 'none';
    bd.style.display = isShown ? 'none' : 'block';
    if (chev) {
      chev.innerHTML = isShown ? '<polyline points="6 9 12 15 18 9"/>' : '<polyline points="18 15 12 9 6 15"/>';
    }
  };
})();
</script>
`;
};
