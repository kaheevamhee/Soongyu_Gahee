(() => {
  'use strict';

  // ============ toast ============
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  document.body.appendChild(toastEl);
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
  }

  // ============ D-day countdown ============
  const WEDDING_AT = new Date('2026-11-07T12:00:00+09:00').getTime();
  const pad = (n) => String(n).padStart(2, '0');
  function tickDday() {
    let d = Math.max(0, WEDDING_AT - Date.now());
    const days = Math.floor(d / 86400000); d -= days * 86400000;
    const hours = Math.floor(d / 3600000); d -= hours * 3600000;
    const mins = Math.floor(d / 60000); d -= mins * 60000;
    const secs = Math.floor(d / 1000);
    document.getElementById('ddDays').textContent = days;
    document.getElementById('ddHours').textContent = pad(hours);
    document.getElementById('ddMins').textContent = pad(mins);
    document.getElementById('ddSecs').textContent = pad(secs);
  }
  tickDday();
  setInterval(tickDday, 1000);

  // ============ calendar ============
  function buildCalendar() {
    const grid = document.getElementById('calendarGrid');
    const first = new Date(2026, 10, 1);
    const start = first.getDay();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < start; i++) {
      frag.appendChild(document.createElement('div'));
    }
    for (let day = 1; day <= 30; day++) {
      const cell = document.createElement('div');
      const dow = (start + day - 1) % 7;
      cell.textContent = day;
      if (day === 7) cell.classList.add('wedding-day');
      else if (dow === 0) cell.classList.add('sun');
      frag.appendChild(cell);
    }
    grid.appendChild(frag);
  }
  buildCalendar();

  // ============ image slots (read-only) ============
  // Photos are baked-in static files under assets/images/. The invitation is
  // view-only for visitors — no upload, drag, or edit UI. The couple changes
  // photos by replacing the files in the repo (same filename overwrites).
  const GALLERY_COUNT = 25;
  const galleryIds = Array.from({ length: GALLERY_COUNT }, (_, i) => 'g' + (i + 1));

  class ImageSlotController {
    constructor(root) {
      this.root = root;
      this.id = root.dataset.slot;
      this.staticSrc = root.dataset.static || '';
      this.img = root.querySelector('.img-slot-img');

      // Mark filled once the photo decodes; a missing file just leaves the
      // neutral empty frame (no broken-image icon, no upload prompt).
      this.img.addEventListener('load', () => this.root.classList.add('filled'));
      this.img.addEventListener('error', () => this.root.classList.remove('filled'));

      // Only the gallery is interactive — tap a photo to open the viewer.
      if (galleryIds.indexOf(this.id) >= 0) {
        root.style.cursor = 'pointer';
        root.addEventListener('click', () => openLightbox(this.id));
      }

      if (this.staticSrc) this.img.src = this.staticSrc;
    }
  }

  // ---- build gallery cards (GALLERY_COUNT) before wiring controllers ----
  (function buildGallery() {
    const scroller = document.getElementById('galleryScroller');
    if (!scroller) return;
    scroller.innerHTML = '';
    galleryIds.forEach((id, i) => {
      const slide = document.createElement('div');
      slide.className = 'gallery-slide';
      slide.innerHTML =
        '<div class="gallery-img img-slot" data-slot="' + id + '" data-shape="rounded" data-radius="4" ' +
        'data-static="assets/images/gallery-' + (i + 1) + '.jpg">' +
        '<div class="img-slot-inner"><img class="img-slot-img" alt="사진 ' + (i + 1) + '"></div>' +
        '</div>';
      scroller.appendChild(slide);
    });
  })();

  const slotControllers = new Map();
  document.querySelectorAll('.img-slot').forEach((el) => {
    const ctrl = new ImageSlotController(el);
    slotControllers.set(ctrl.id, ctrl);
  });

  // ============ story carousel ============
  const storyScroller = document.getElementById('storyScroller');
  const storySlideCount = storyScroller.children.length;
  const storyDotsWrap = document.getElementById('storyDots');
  let storyIndex = 0;

  for (let i = 0; i < storySlideCount; i++) {
    const b = document.createElement('button');
    b.setAttribute('aria-label', '슬라이드 ' + (i + 1));
    b.addEventListener('click', () => goStory(i));
    storyDotsWrap.appendChild(b);
  }
  function renderStoryDots() {
    [...storyDotsWrap.children].forEach((b, i) => b.classList.toggle('active', i === storyIndex));
  }
  function goStory(i) {
    storyIndex = Math.max(0, Math.min(storySlideCount - 1, i));
    renderStoryDots();
    const step = storyScroller.scrollWidth / storySlideCount;
    storyScroller.scrollTo({ left: step * storyIndex, behavior: 'smooth' });
  }
  let storyScrollTimer = null;
  storyScroller.addEventListener('scroll', () => {
    clearTimeout(storyScrollTimer);
    storyScrollTimer = setTimeout(() => {
      const step = storyScroller.scrollWidth / storySlideCount;
      const idx = Math.max(0, Math.min(storySlideCount - 1, Math.round(storyScroller.scrollLeft / step)));
      if (idx !== storyIndex) { storyIndex = idx; renderStoryDots(); }
    }, 60);
  });
  document.getElementById('storyPrev').addEventListener('click', () => goStory(storyIndex - 1));
  document.getElementById('storyNext').addEventListener('click', () => goStory(storyIndex + 1));
  renderStoryDots();

  // ============ gallery carousel + lightbox ============
  const galleryScroller = document.getElementById('galleryScroller');
  document.getElementById('galPrev').addEventListener('click', () => {
    galleryScroller.scrollBy({ left: -galleryScroller.clientWidth * 0.7, behavior: 'smooth' });
  });
  document.getElementById('galNext').addEventListener('click', () => {
    galleryScroller.scrollBy({ left: galleryScroller.clientWidth * 0.7, behavior: 'smooth' });
  });

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCounter = document.getElementById('lightboxCounter');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  let lbItems = [];
  let lbIndex = 0;

  function openLightbox(id) {
    // Build from the known photo sources, not the DOM 'filled' state —
    // gallery images are lazy-loaded, so off-screen ones aren't decoded yet
    // but their src is known and belongs in the viewer.
    lbItems = galleryIds
      .map((gid) => ({ id: gid, ctrl: slotControllers.get(gid) }))
      .filter((it) => it.ctrl && it.ctrl.staticSrc);
    if (!lbItems.length) return;
    lbIndex = Math.max(0, lbItems.findIndex((it) => it.id === id));
    renderLightbox();
    lightbox.hidden = false;
  }
  function renderLightbox() {
    const it = lbItems[lbIndex];
    lightboxImg.src = it.ctrl.staticSrc || it.ctrl.img.src;
    lightboxCounter.textContent = (lbIndex + 1) + ' / ' + lbItems.length;
    const many = lbItems.length > 1;
    lightboxPrev.hidden = !many;
    lightboxNext.hidden = !many;
  }
  function closeLightbox() { lightbox.hidden = true; }
  function lbPrev() { lbIndex = (lbIndex - 1 + lbItems.length) % lbItems.length; renderLightbox(); }
  function lbNext() { lbIndex = (lbIndex + 1) % lbItems.length; renderLightbox(); }

  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  lightboxPrev.addEventListener('click', (e) => { e.stopPropagation(); lbPrev(); });
  lightboxNext.addEventListener('click', (e) => { e.stopPropagation(); lbNext(); });
  document.addEventListener('keydown', (e) => {
    if (lightbox.hidden) return;
    if (e.key === 'ArrowLeft') lbPrev();
    else if (e.key === 'ArrowRight') lbNext();
    else if (e.key === 'Escape') closeLightbox();
  });
  let touchX = 0;
  lightbox.addEventListener('touchstart', (e) => { touchX = e.touches[0] ? e.touches[0].clientX : 0; });
  lightbox.addEventListener('touchend', (e) => {
    const x = e.changedTouches[0] ? e.changedTouches[0].clientX : 0;
    const d = x - touchX;
    if (d < -40) lbNext(); else if (d > 40) lbPrev();
  });

  // ============ accordion ============
  function setupAccordion(toggleId, panelId, chevronId) {
    const toggle = document.getElementById(toggleId);
    const panel = document.getElementById(panelId);
    const chevron = document.getElementById(chevronId);
    toggle.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      chevron.classList.toggle('open', open);
    });
  }
  setupAccordion('groomToggle', 'groomPanel', 'groomChevron');
  setupAccordion('brideToggle', 'bridePanel', 'brideChevron');

  // ============ copy account numbers ============
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    const original = btn.textContent;
    btn.addEventListener('click', async () => {
      const num = btn.dataset.num;
      try {
        if (navigator.clipboard) await navigator.clipboard.writeText(num);
      } catch (e) {}
      btn.textContent = '복사됨 ✓';
      setTimeout(() => { btn.textContent = original; }, 1500);
    });
  });

  // ============ map buttons ============
  document.getElementById('btnNaver').addEventListener('click', () => {
    window.open('https://map.naver.com/p/entry/place/33499928', '_blank');
  });
  document.getElementById('btnKakao').addEventListener('click', () => {
    window.open('https://map.kakao.com/?q=' + encodeURIComponent('강서 더베뉴지'), '_blank');
  });
  document.getElementById('btnTmap').addEventListener('click', () => {
    window.location.href = 'tmap://search?name=' + encodeURIComponent('강서 더베뉴지');
    setTimeout(() => window.open('https://www.tmap.co.kr/', '_blank'), 500);
  });

  // ============ share / copy link ============
  document.getElementById('shareBtn').addEventListener('click', async () => {
    const url = location.href;
    if (navigator.share) {
      try { await navigator.share({ title: '이순규 ♥ 전가희 결혼합니다', url }); } catch (e) {}
    } else {
      copyLink();
    }
  });
  function copyLink() {
    const btn = document.getElementById('copyLinkBtn');
    const original = btn.textContent;
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(location.href);
    } catch (e) {}
    btn.textContent = '복사됨 ✓';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }
  document.getElementById('copyLinkBtn').addEventListener('click', copyLink);

  // ============ background music ============
  const bgm = document.getElementById('bgm');
  const musicToggle = document.getElementById('musicToggle');
  const musicNote = document.getElementById('musicNote');
  // Default ON (autoplay). Browsers block audio autoplay until a user
  // gesture, so we try immediately and, if blocked, start on the first tap
  // /scroll/keypress anywhere on the page.
  let musicOn = true;
  bgm.volume = 0;

  function fadeTo(target, ms) {
    const start = bgm.volume;
    const t0 = performance.now();
    function step(t) {
      const p = Math.min(1, (t - t0) / ms);
      bgm.volume = Math.max(0, Math.min(1, start + (target - start) * p));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function reflectMusic() {
    musicToggle.classList.toggle('on', musicOn);
    musicToggle.setAttribute('aria-pressed', String(musicOn));
    musicToggle.setAttribute('aria-label', musicOn ? '배경음악 끄기' : '배경음악 켜기');
  }

  const GESTURES = ['pointerdown', 'touchstart', 'click', 'keydown', 'scroll'];
  function armAutoplay() {
    const start = () => {
      GESTURES.forEach((ev) => window.removeEventListener(ev, start, true));
      if (musicOn && bgm.paused) {
        bgm.play().then(() => fadeTo(0.5, 800)).catch(() => {});
      }
    };
    GESTURES.forEach((ev) => window.addEventListener(ev, start, { capture: true, passive: true }));
  }
  // Try to autoplay right away; fall back to first-gesture start if blocked.
  (function tryAutoplay() {
    reflectMusic();
    bgm.play().then(() => fadeTo(0.5, 800)).catch(() => armAutoplay());
  })();

  musicToggle.addEventListener('click', async (e) => {
    e.stopPropagation();
    musicOn = !musicOn;
    reflectMusic();
    if (musicOn) {
      try {
        await bgm.play();
        fadeTo(0.5, 800);
      } catch (err) {
        toast('배경음악 파일을 아직 준비 중이에요.');
        musicOn = false;
        reflectMusic();
      }
    } else {
      fadeTo(0, 400);
      setTimeout(() => { if (!musicOn) bgm.pause(); }, 420);
    }
  });

  // ============ 모션: 인트로 · 스크롤 등장 · 히어로 패럴랙스 ============
  const reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 진입 인트로 레이어 — 잠깐 보였다가 위로 걷힘
  (function intro() {
    const el = document.getElementById('intro');
    if (!el) return;
    if (reduceMotion) { el.remove(); return; }
    document.body.style.overflow = 'hidden';
    setTimeout(() => { el.classList.add('up'); document.body.style.overflow = ''; }, 1900);
    setTimeout(() => { el.remove(); }, 3050);
  })();

  // 스크롤 등장(reveal)
  (function reveal() {
    const targets = ['.dday', '.greeting', '.story-section', '.gallery-section',
      '.accounts-section', '.location-section', '.site-footer'];
    const els = [];
    targets.forEach((sel) => { const n = document.querySelector(sel); if (n) { n.classList.add('reveal'); els.push(n); } });
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach((n) => n.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    els.forEach((n) => io.observe(n));
  })();

  // 히어로 패럴랙스 (텍스트 드리프트·페이드 + 이미지 크롭 시프트)
  (function heroParallax() {
    if (reduceMotion) return;
    const heroImg = document.querySelector('.hero-slot .img-slot-img');
    const heroText = document.querySelector('.hero-text');
    if (!heroImg && !heroText) return;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || window.pageYOffset;
        if (y < 720) {
          if (heroText) {
            heroText.style.transform = 'translateY(' + (y * 0.3) + 'px)';
            heroText.style.opacity = String(Math.max(0, 1 - y / 420));
          }
          if (heroImg) heroImg.style.objectPosition = '50% ' + (50 - y * 0.035) + '%';
        }
        ticking = false;
      });
    }, { passive: true });
  })();
})();
