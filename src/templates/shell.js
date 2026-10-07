/**
 * Rally Web App — HTML Shell
 * Shared <head> + page wrapper for all web preview pages.
 * Page data is injected into window.__RALLY__ for instant render (no loading flash).
 *
 * @param {object} opts
 * @param {string}  opts.title       - <title> and og:title
 * @param {string}  opts.description - meta description and og:description
 * @param {string}  opts.ogImage     - og:image URL
 * @param {string}  opts.ogUrl       - canonical og:url
 * @param {string}  opts.bodyClass   - extra class on #app (e.g. 'org-bg')
 * @param {string}  opts.bodyContent - inner HTML string
 * @param {any}     opts.pageData    - JSON-serialisable data injected as window.__RALLY__
 */
module.exports = function shell({ title, description, ogImage, ogUrl, bodyClass = '', bodyContent = '', pageData = null }) {
  const safePageData = pageData ? JSON.stringify(pageData).replace(/<\/script>/gi, '<\\/script>') : 'null';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  <meta name="theme-color" content="#3B82F6">
  <title>${title ? `${title} | Rally` : 'Rally — Find Sports Events Near You'}</title>
  <meta name="description" content="${description || 'Find and join exciting sports events near you on Rally.'}">
  <meta name="robots" content="noindex,nofollow">

  <!-- Open Graph -->
  <meta property="og:title" content="${title || 'Rally'}">
  <meta property="og:description" content="${description || 'Find and join exciting sports events near you.'}">
  <meta property="og:image" content="${ogImage || 'https://backend2.rallysports.ae/public/rally-logo-bg.png'}">
  <meta property="og:url" content="${ogUrl || 'https://backend2.rallysports.ae'}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Rally">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title || 'Rally'}">
  <meta name="twitter:description" content="${description || 'Find and join exciting sports events near you.'}">
  <meta name="twitter:image" content="${ogImage || 'https://backend2.rallysports.ae/public/rally-logo-bg.png'}">

  <!-- App Store Smart Banners (iOS only) -->
  <meta name="apple-itunes-app" content="app-id=6526470249">

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">

  <!-- Rally Web CSS -->
  <link rel="stylesheet" href="/public/webapp/styles/rally-web.css">
</head>
<body>
  <div id="app"${bodyClass ? ` class="${bodyClass}"` : ''}>
    ${bodyContent}
  </div>

  <!-- Page data pre-injected by server for instant render (no API round-trip on load) -->
  <script>window.__RALLY__ = ${safePageData};</script>
  <!-- App JS -->
  <script src="/public/webapp/js/app.js" defer></script>
</body>
</html>`;
};
