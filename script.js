function storeLabel(link) {
  if (!link) return '';
  if (link.includes('play.google.com')) return 'Google Play';
  if (link.includes('youtube.com') || link.includes('youtu.be')) return 'Watch Video';
  if (link.includes('apps.apple.com')) return 'App Store';
  return 'Open Project';
}

function badgeText(downloads) {
  if (!downloads) return '';
  return /\d/.test(downloads) ? `${downloads} downloads` : downloads;
}

const MILESTONE_BRACKETS = [
  { min: 100_000_000, label: '100M+' },
  { min: 50_000_000, label: '50M+' },
  { min: 10_000_000, label: '10M+' },
  { min: 5_000_000, label: '5M+' },
  { min: 1_000_000, label: '1M+' },
  { min: 500_000, label: '500K+' },
  { min: 100_000, label: '100K+' },
  { min: 50_000, label: '50K+' },
  { min: 10_000, label: '10K+' },
  { min: 5_000, label: '5K+' },
  { min: 1_000, label: '1K+' },
];

function parseMilestoneValue(raw) {
  if (!raw || typeof raw !== 'string') return 0;
  const cleaned = raw.trim().toUpperCase().replace(/,/g, '');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([KMB])?\+?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2];
  if (unit === 'B') return num * 1_000_000_000;
  if (unit === 'M') return num * 1_000_000;
  if (unit === 'K') return num * 1_000;
  return num;
}

function formatBracket(value) {
  for (const b of MILESTONE_BRACKETS) {
    if (value >= b.min) return b.label;
  }
  return null;
}

function applyWorkCard(card, game) {
  const title = card.querySelector('.work-info h3');
  if (title && game.title) title.textContent = game.title;

  const studio = card.querySelector('.work-top .studio');
  if (studio && game.studio) studio.textContent = game.studio;

  const genre = card.querySelector('.work-top .genre');
  if (genre && game.genre) genre.textContent = game.genre.split('·')[0].trim();

  if (game.category) card.dataset.category = game.category;
  card.dataset.hit = String(Boolean(game.premium));

  const desc = card.querySelector('.work-info > p');
  if (desc && game.description) desc.textContent = game.description;

  const tagsContainer = card.querySelector('.work-tags');
  if (tagsContainer && Array.isArray(game.tech) && game.tech.length > 0) {
    tagsContainer.innerHTML = game.tech.map((t) => `<span>${t}</span>`).join('');
  }

  const video = card.querySelector('.video-card');
  let badge = video?.querySelector('.stat-badge');
  const label = badgeText(game.downloads);
  if (label) {
    if (!badge && video) {
      badge = document.createElement('span');
      badge.className = 'stat-badge';
      video.querySelector('.video-thumb')?.after(badge);
    }
    if (badge) badge.textContent = label;
  } else {
    badge?.remove();
  }

  const footer = card.querySelector('.work-footer') || card.querySelector('.work-info');
  let link = card.querySelector('.card-link');
  const note = card.querySelector('.card-note');
  if (game.link && footer) {
    note?.remove();
    if (!link) {
      link = document.createElement('a');
      link.className = 'card-link';
      footer.prepend(link);
    }
    link.href = game.link;
    link.target = '_blank';
    link.rel = 'noopener';
    link.innerHTML = `${storeLabel(game.link)} <span>↗</span>`;
  } else if (!game.link) {
    link?.remove();
  }
}

function applyShipItem(originalCard, game, id) {
  const workTarget = document.getElementById(`work-${id}`);
  const href = workTarget ? `#work-${id}` : game.link;
  const needsLink = Boolean(href);
  const isLink = originalCard.tagName === 'A';
  let card = originalCard;

  if (needsLink !== isLink) {
    card = document.createElement(needsLink ? 'a' : 'div');
    [...originalCard.attributes].forEach(({ name, value }) => {
      if (!['href', 'target', 'rel', 'aria-label'].includes(name)) {
        card.setAttribute(name, value);
      }
    });
    card.innerHTML = originalCard.innerHTML;
    originalCard.replaceWith(card);
  }

  card.classList.toggle('static', !needsLink);
  card.classList.toggle('hit', Boolean(game.premium));

  if (needsLink) {
    card.href = href;
    if (href.startsWith('#')) {
      card.removeAttribute('target');
      card.removeAttribute('rel');
      card.setAttribute('aria-label', `See ${game.title} in Selected Work`);
    } else {
      card.target = '_blank';
      card.rel = 'noopener';
      card.setAttribute('aria-label', `${game.title} — open external link`);
    }
  }

  const currentIcon = card.querySelector('.game-icon');
  const nextIcon = game.icon
    ? Object.assign(document.createElement('img'), {
        className: 'game-icon',
        src: game.icon,
        alt: `${game.title} icon`,
        width: 120,
        height: 120,
        loading: 'lazy',
      })
    : Object.assign(document.createElement('div'), {
        className: 'game-icon placeholder',
        textContent: game.placeholder || game.title.slice(0, 3).toUpperCase(),
      });

  currentIcon?.replaceWith(nextIcon);
  const downloads = card.querySelector('.dl');
  const title = card.querySelector('strong');
  const genre = card.querySelector('em');
  if (downloads && game.downloads) downloads.textContent = game.downloads;
  if (title && game.title) title.textContent = game.title;
  if (genre && game.genre) genre.textContent = game.genre;
}

function applyGameConfig() {
  const games = window.PORTFOLIO_CONFIG?.games;
  if (!games) return;

  document.querySelectorAll('.work-card[data-game]').forEach((card) => {
    const game = games[card.dataset.game];
    if (game) applyWorkCard(card, game);
  });

  document.querySelectorAll('.ship-item[data-game]').forEach((card) => {
    const id = card.dataset.game;
    const game = games[id];
    if (game) applyShipItem(card, game, id);
  });

  // Keep hero gallery chips in sync as well
  Object.entries(games).forEach(([id, game]) => {
    const chipSpan = document.querySelector(`.gallery-chip[href="#work-${id}"] span`);
    if (chipSpan && game.downloads) {
      chipSpan.textContent = game.downloads;
    }
  });
}

/*
 * Live Store Milestone Sync (High-Water Mark Rule):
 * 1. Reads pre-fetched store-cache.json (updated daily by GitHub Actions).
 * 2. Performs lightweight client-side lookups for App Store & Google Play links
 *    (cached in sessionStorage for 6 hours) and automatically upgrades any badge
 *    if a store reports a higher download bracket.
 */
function upgradeGameMilestone(id, candidateBracket) {
  const games = window.PORTFOLIO_CONFIG?.games;
  const game = games?.[id];
  if (!game || !candidateBracket) return false;

  const currentVal = parseMilestoneValue(game.downloads);
  const candidateVal = parseMilestoneValue(candidateBracket);

  if (candidateVal > currentVal) {
    game.downloads = candidateBracket;
    if (candidateVal >= 1_000_000) {
      game.premium = true;
    }
    return true;
  }
  return false;
}

async function fetchLiveAppStoreBracket(url) {
  const match = url.match(/apps\.apple\.com\/(?:([a-z]{2})\/)?app\/(?:[^/]+\/)?id(\d+)/i);
  if (!match) return null;
  const country = (match[1] || 'us').toLowerCase();
  const appId = match[2];

  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}&country=${encodeURIComponent(country)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const app = data?.results?.[0];
  if (!app) return null;
  const ratingCount = Number(app.userRatingCount || 0);
  // Conservative floor estimate: ~30 installs per public rating on iOS
  return formatBracket(ratingCount * 30);
}

async function fetchLiveGooglePlayBracket(url) {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`${url}&hl=en&gl=US`)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(proxyUrl, { signal: controller.signal });
    if (!res.ok) return null;
    const html = await res.text();
    const tupleMatch = html.match(
      /\["(\d{1,3}(?:,\d{3})*\+)",(\d+),(\d+),"(\d+(?:\.\d+)?[KMB]?\+)"\]/i
    );
    if (tupleMatch) return tupleMatch[4].toUpperCase();
    const domMatch = html.match(/>(\d+(?:\.\d+)?[KMB]?\+)<\/div><div[^>]*>Downloads<\/div>/i);
    if (domMatch) return domMatch[1].toUpperCase();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function syncLiveStoreData() {
  const games = window.PORTFOLIO_CONFIG?.games;
  if (!games) return;

  let anyUpgraded = false;

  // Step 1: Check store-cache.json (populated by scheduled GitHub Action)
  if (location.protocol.startsWith('http')) {
    try {
      const cacheRes = await fetch('store-cache.json', { cache: 'no-cache' });
      if (cacheRes.ok) {
        const cache = await cacheRes.json();
        if (cache?.games) {
          for (const [id, entry] of Object.entries(cache.games)) {
            if (upgradeGameMilestone(id, entry.downloads)) {
              anyUpgraded = true;
            }
          }
        }
      }
    } catch {
      // Ignore if running locally via file:// or offline
    }
  }

  // Step 2: Check sessionStorage cache before running live browser checks
  const SESSION_KEY = 'portfolio_live_store_brackets_v1';
  const SESSION_TTL = 6 * 60 * 60 * 1000; // 6 hours
  let liveBrackets = null;

  try {
    const cachedRaw = sessionStorage.getItem(SESSION_KEY);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (Date.now() - parsed.timestamp < SESSION_TTL && parsed.brackets) {
        liveBrackets = parsed.brackets;
      }
    }
  } catch {
    // Ignore storage restrictions
  }

  if (!liveBrackets) {
    liveBrackets = {};
    const tasks = Object.entries(games).map(async ([id, game]) => {
      const link = game.link;
      if (!link) return;
      try {
        if (link.includes('apps.apple.com')) {
          const bracket = await fetchLiveAppStoreBracket(link);
          if (bracket) liveBrackets[id] = bracket;
        } else if (link.includes('play.google.com')) {
          const bracket = await fetchLiveGooglePlayBracket(link);
          if (bracket) liveBrackets[id] = bracket;
        }
      } catch {
        // Fail silently and keep config.js fallback
      }
    });

    await Promise.allSettled(tasks);

    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ timestamp: Date.now(), brackets: liveBrackets })
      );
    } catch {
      // Ignore storage errors
    }
  }

  for (const [id, bracket] of Object.entries(liveBrackets)) {
    if (upgradeGameMilestone(id, bracket)) {
      anyUpgraded = true;
    }
  }

  if (anyUpgraded) {
    applyGameConfig();
    updateFilterCounts();
  }
}

/* Filter Bar Logic */
const filterButtons = document.querySelectorAll('.filter-btn[data-filter]');
const workCards = document.querySelectorAll('.work-card');

function updateFilterCounts() {
  filterButtons.forEach((btn) => {
    const f = btn.dataset.filter;
    const countSpan = btn.querySelector('.count');
    if (!countSpan) return;
    let count = 0;
    workCards.forEach((card) => {
      if (f === 'all') count++;
      else if (f === 'hit' && card.dataset.hit === 'true') count++;
      else if (card.dataset.category === f) count++;
    });
    countSpan.textContent = String(count);
  });
}

function setFilter(filterValue) {
  filterButtons.forEach((btn) => {
    const isActive = btn.dataset.filter === filterValue;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  workCards.forEach((card) => {
    let matches = true;
    if (filterValue === 'hit') {
      matches = card.dataset.hit === 'true';
    } else if (filterValue !== 'all') {
      matches = card.dataset.category === filterValue;
    }

    if (matches) {
      card.hidden = false;
      card.classList.add('in');
    } else {
      const videoCard = card.querySelector('.video-card.is-playing');
      if (videoCard) restoreCard(videoCard);
      card.hidden = true;
    }
  });
}

filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    setFilter(btn.dataset.filter || 'all');
  });
});

function focusWorkCard(hash) {
  document.querySelectorAll('.work-card.is-focus').forEach((card) => {
    card.classList.remove('is-focus');
  });
  if (!hash?.startsWith('#work-')) return;
  const card = document.querySelector(hash);
  if (!card) return;
  if (card.hidden) {
    setFilter('all');
  }
  card.classList.add('in', 'is-focus');
}

applyGameConfig();
updateFilterCounts();
focusWorkCard(location.hash);
window.addEventListener('hashchange', () => focusWorkCard(location.hash));
syncLiveStoreData();

/* Navigation & Mobile Drawer */
const nav = document.querySelector('.nav');
const toggle = document.querySelector('.nav-toggle');
const mobileNav = document.querySelector('.mobile-nav');

window.addEventListener(
  'scroll',
  () => {
    nav?.classList.toggle('scrolled', window.scrollY > 12);
  },
  { passive: true }
);

function closeMobileNav() {
  if (!mobileNav) return;
  mobileNav.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
}

toggle?.addEventListener('click', () => {
  const isOpen = mobileNav.hasAttribute('hidden') === false;
  if (isOpen) {
    closeMobileNav();
  } else {
    mobileNav.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  }
});

mobileNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', closeMobileNav);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMobileNav();
});

/* Active Section Highlight in Navbar */
const navLinks = document.querySelectorAll('.nav nav a[href^="#"]');
const trackedSections = [...navLinks]
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

if ('IntersectionObserver' in window && trackedSections.length > 0) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = `#${entry.target.id}`;
        navLinks.forEach((link) => {
          link.classList.toggle('active', link.getAttribute('href') === id);
        });
      });
    },
    { rootMargin: '-25% 0px -60% 0px', threshold: 0 }
  );

  trackedSections.forEach((sec) => sectionObserver.observe(sec));
}

/* Scroll Reveal Animations */
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -36px 0px' }
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('in'));
}

/* Video Player Controls */
function createPlayButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'play-btn';
  btn.setAttribute('aria-label', 'Play gameplay video');
  btn.innerHTML = '<span></span>';
  return btn;
}

function restoreCard(card) {
  const thumb = card.querySelector('.video-thumb');
  card.classList.remove('is-playing');
  card.querySelector('iframe')?.remove();
  if (thumb) thumb.hidden = false;
  if (!card.querySelector('.play-btn')) card.appendChild(createPlayButton());
}

function stopOtherVideos(activeCard) {
  document.querySelectorAll('.video-card.is-playing').forEach((card) => {
    if (card !== activeCard) restoreCard(card);
  });
}

function startVideoPlayback(videoCard) {
  if (!videoCard || videoCard.classList.contains('is-playing')) return;
  const id = videoCard.dataset.video;
  if (!id) return;
  stopOtherVideos(videoCard);
  videoCard.classList.add('is-playing');
  videoCard.querySelector('.play-btn')?.remove();
  const thumb = videoCard.querySelector('.video-thumb');
  if (thumb) thumb.hidden = true;
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
  iframe.title = 'Gameplay video';
  iframe.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  iframe.loading = 'lazy';
  videoCard.appendChild(iframe);
}

document.querySelectorAll('.video-card[data-video]').forEach((card) => {
  card.addEventListener('click', () => startVideoPlayback(card));
});

document.querySelectorAll('.watch-trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    const workCard = btn.closest('.work-card');
    const videoCard = workCard?.querySelector('.video-card[data-video]');
    if (videoCard) {
      startVideoPlayback(videoCard);
      videoCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
});

/* Copy Email Button */
const copyEmailBtn = document.querySelector('.copy-email-btn');
copyEmailBtn?.addEventListener('click', async () => {
  const email = copyEmailBtn.dataset.email;
  const label = copyEmailBtn.querySelector('.copy-label');
  if (!email || !label) return;

  try {
    await navigator.clipboard.writeText(email);
    const originalText = label.textContent;
    copyEmailBtn.classList.add('copied');
    label.textContent = '✓ Copied mdamanulla44@gmail.com';
    setTimeout(() => {
      copyEmailBtn.classList.remove('copied');
      label.textContent = originalText;
    }, 2400);
  } catch {
    window.location.href = `mailto:${email}`;
  }
});
