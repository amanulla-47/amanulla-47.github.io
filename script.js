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
