function storeLabel(link) {
  if (!link) return '';
  if (link.includes('play.google.com')) return 'Google Play';
  if (link.includes('youtube.com') || link.includes('youtu.be')) return 'Watch';
  if (link.includes('apps.apple.com')) return 'App Store';
  return 'Open';
}

function badgeText(downloads) {
  if (!downloads) return '';
  return /\d/.test(downloads) ? `${downloads} downloads` : downloads;
}

function applyWorkCard(card, game) {
  const title = card.querySelector('.work-info h3');
  if (title) title.textContent = game.title;

  const genre = card.querySelector('.work-top .genre');
  if (genre && game.genre) genre.textContent = game.genre.split('·')[0].trim();

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

  const info = card.querySelector('.work-info');
  let link = card.querySelector('.card-link');
  if (game.link && info) {
    if (!link) {
      link = document.createElement('a');
      link.className = 'card-link';
      info.appendChild(link);
    }
    link.href = game.link;
    link.target = '_blank';
    link.rel = 'noopener';
    link.innerHTML = `${storeLabel(game.link)} <span>↗</span>`;
  } else {
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
      card.setAttribute('aria-label', `See ${game.title} in Shipped Titles`);
    } else {
      card.target = '_blank';
      card.rel = 'noopener';
      card.setAttribute('aria-label', `${game.title} — open game link`);
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
  if (downloads) downloads.textContent = game.downloads;
  if (title) title.textContent = game.title;
  if (genre) genre.textContent = game.genre;
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
}

function focusWorkCard(hash) {
  document.querySelectorAll('.work-card.is-focus').forEach((card) => {
    card.classList.remove('is-focus');
  });
  if (!hash?.startsWith('#work-')) return;
  const card = document.querySelector(hash);
  if (!card) return;
  card.classList.add('in', 'is-focus');
}

applyGameConfig();
focusWorkCard(location.hash);
window.addEventListener('hashchange', () => focusWorkCard(location.hash));

const nav = document.querySelector('.nav');
const toggle = document.querySelector('.nav-toggle');
const mobileNav = document.querySelector('.mobile-nav');

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 10);
}, { passive: true });

toggle?.addEventListener('click', () => {
  const open = mobileNav.hasAttribute('hidden') === false;
  if (open) {
    mobileNav.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  } else {
    mobileNav.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  }
});

mobileNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    mobileNav.hidden = true;
    toggle?.setAttribute('aria-expanded', 'false');
  });
});

const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('in'));
}

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

document.querySelectorAll('.video-card[data-video]').forEach((card) => {
  card.addEventListener('click', () => {
    if (card.classList.contains('is-playing')) return;
    const id = card.dataset.video;
    if (!id) return;
    stopOtherVideos(card);
    card.classList.add('is-playing');
    card.querySelector('.play-btn')?.remove();
    const thumb = card.querySelector('.video-thumb');
    if (thumb) thumb.hidden = true;
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
    iframe.title = 'Gameplay video';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';
    card.appendChild(iframe);
  });
});
