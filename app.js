// =============================================================================
// app.js - W.H. Rodenhuis
// Importeert i18n; verwacht dat window._fb is ingesteld door firebase-config.js
// =============================================================================

import { translations, t, setLang, applyTranslations, lang as initialLang } from './js/i18n.js';

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
let lang          = initialLang;   // 'nl' | 'en'
let cart          = [];            // Array van painting-objecten in selectie
let allPaintings  = [];            // Cache van alle schilderijen (galerij)
let activeFilter  = 'all';         // Actieve galerijfilter
let currentPainting = null;        // Open schilderij in lightbox
let selectedStars = 0;             // Sterren in reviewformulier
let heroSlides    = [];            // Schilderijen in hero-slideshow
let heroIdx       = 0;             // Huidige slide-index
let heroTimer     = null;          // Interval voor automatisch wisselen

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Wacht tot window._fb beschikbaar is */
function fb() {
  if (!window._fb) throw new Error('Firebase niet geladen. Controleer firebase-config.js.');
  return window._fb;
}

/** Formatteer prijs in NL-stijl */
function formatPrice(price) {
  return '€\u00A0' + Number(price).toLocaleString('nl-NL');
}

/** Geef de juiste titel terug op basis van taal */
function titleFor(painting) {
  return lang === 'nl'
    ? painting.titleNl
    : (painting.titleEn || painting.titleNl);
}

/** Maak skeleton-laadkaarten aan */
function skeletonCards(count = 6) {
  return Array(count).fill(`
    <div class="loading-card">
      <div class="loading-card-img skeleton"></div>
      <div class="loading-card-body">
        <div class="loading-line skeleton" style="width:70%"></div>
        <div class="loading-line skeleton" style="width:40%"></div>
      </div>
    </div>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────────
let _toastTimer;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAAL WISSELEN
// ─────────────────────────────────────────────────────────────────────────────
function toggleLang() {
  lang = lang === 'nl' ? 'en' : 'nl';
  setLang(lang);
  document.getElementById('lang-btn').textContent = lang === 'nl' ? 'NL' : 'EN';
  document.documentElement.lang = lang;
  applyTranslations();

  // Re-apply Firestore texts when switching to NL
  if (lang === 'nl') {
    try { loadSiteTexts(); } catch {}
  }

  // Reload dynamic content in active language
  const activePage = document.querySelector('.page.active');
  if (activePage?.id === 'page-gallery') renderGallery();
  if (activePage?.id === 'page-about')   loadAboutPage();
}

window.toggleLang = toggleLang;

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATIE
// ─────────────────────────────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  window.scrollTo(0, 0);
  closeMobile();

  // Update nav active state
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('onclick')?.includes("'" + name + "'"));
  });

  if (name === 'gallery') loadGallery();
  if (name === 'about')   loadAboutPage();
}

window.showPage = showPage;

// Scrollschaduw op navigatie
window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 40);
});

// ─────────────────────────────────────────────────────────────────────────────
// MOBIEL MENU
// ─────────────────────────────────────────────────────────────────────────────
function toggleMobile() {
  document.getElementById('mobile-menu').classList.toggle('open');
}

function closeMobile() {
  document.getElementById('mobile-menu').classList.remove('open');
}

window.toggleMobile = toggleMobile;
window.closeMobile  = closeMobile;

// ─────────────────────────────────────────────────────────────────────────────
// ZOEKEN
// ─────────────────────────────────────────────────────────────────────────────
function toggleSearch() {
  const overlay = document.getElementById('search-overlay');
  const isOpen  = overlay.classList.toggle('open');

  if (isOpen) {
    setTimeout(() => document.getElementById('search-input').focus(), 50);
  } else {
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
  }
}

window.toggleSearch = toggleSearch;

document.getElementById('search-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) toggleSearch();
});

async function doSearch(query) {
  const resultsEl = document.getElementById('search-results');
  if (!query.trim()) { resultsEl.innerHTML = ''; return; }

  const { db, collection, getDocs } = fb();
  const snap = await getDocs(collection(db, 'paintings'));
  const ql   = query.toLowerCase();
  const hits = [];

  snap.forEach(d => {
    const p   = { id: d.id, ...d.data() };
    const hay = [p.titleNl, p.titleEn, ...(p.tags || [])].join(' ').toLowerCase();
    if (hay.includes(ql)) hits.push(p);
  });

  if (!hits.length) {
    resultsEl.innerHTML = '<p class="muted" style="padding:0.5rem 0;font-size:0.9rem">Geen resultaten gevonden.</p>';
    return;
  }

  resultsEl.innerHTML = hits.map(p => `
    <div class="search-result-item" onclick="toggleSearch(); openLightbox('${p.id}')">
      <img class="search-result-thumb" src="${p.imageUrl || ''}" alt="${titleFor(p)}">
      <div class="search-result-info">
        <h4>${titleFor(p)}</h4>
        <p>${p.year || ''} · ${p.technique || ''} · ${(p.tags || []).slice(0, 3).join(', ')}</p>
      </div>
    </div>`).join('');
}

window.doSearch = doSearch;

// ─────────────────────────────────────────────────────────────────────────────
// HERO SLIDESHOW
// ─────────────────────────────────────────────────────────────────────────────
// -----------------------------------------------------------------------------
// HERO - scrolling thumbnail strip
// -----------------------------------------------------------------------------
async function loadHero() {
  const { db, collection, getDocs, query, where } = fb();

  // Try showInHero first, fall back to all paintings
  const featSnap = await getDocs(query(collection(db, 'paintings'), where('showInHero', '==', true)));
  featSnap.forEach(d => heroSlides.push({ id: d.id, ...d.data() }));

  // Legacy fallback: paintings with featured=true but no showInHero field yet
  if (!heroSlides.length) {
    const legacySnap = await getDocs(query(collection(db, 'paintings'), where('featured', '==', true)));
    legacySnap.forEach(d => heroSlides.push({ id: d.id, ...d.data() }));
  }

  // Final fallback: any paintings at all
  if (heroSlides.length < 2) {
    heroSlides = [];
    const allSnap = await getDocs(collection(db, 'paintings'));
    allSnap.forEach(d => heroSlides.push({ id: d.id, ...d.data() }));
  }

  renderHeroStrip();
}

function renderHeroStrip() {
  const strip = document.getElementById('hero-strip');
  if (!strip || !heroSlides.length) return;

  // Duplicate items for seamless infinite scroll
  const items = [...heroSlides, ...heroSlides];
  strip.innerHTML = items.map(p => `
    <div class="hero-strip-item" onclick="openLightbox('${p.id}')" title="${titleFor(p)}">
      <img src="${p.imageUrl || ''}" alt="${titleFor(p)}" loading="lazy">
    </div>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// UITGELICHTE SCHILDERIJEN (homepage)
// ─────────────────────────────────────────────────────────────────────────────
async function loadFeatured() {
  const grid = document.getElementById('featured-grid');
  grid.innerHTML = skeletonCards(3);

  const { db, collection, getDocs, query, where } = fb();
  let paintings = [];

  // Try showInFeatured first
  const featSnap = await getDocs(query(collection(db, 'paintings'), where('showInFeatured', '==', true)));
  featSnap.forEach(d => paintings.push({ id: d.id, ...d.data() }));

  // Legacy fallback: paintings with featured=true but no showInFeatured field yet
  if (!paintings.length) {
    const legacySnap = await getDocs(query(collection(db, 'paintings'), where('featured', '==', true)));
    legacySnap.forEach(d => paintings.push({ id: d.id, ...d.data() }));
  }

  // Final fallback: show first few paintings
  if (paintings.length < 2) {
    paintings = [];
    const allSnap = await getDocs(collection(db, 'paintings'));
    allSnap.forEach(d => { if (paintings.length < 6) paintings.push({ id: d.id, ...d.data() }); });
  }

  grid.innerHTML = paintings.slice(0, 6).map(paintingCardHTML).join('') ||
    '<p class="muted">Voeg schilderijen toe via het admin-paneel.</p>';
  observeRevealElements();

  // Update statistieken in hero
  const allSnap2 = await getDocs(collection(db, 'paintings'));
  let total = 0, sold = 0;
  allSnap2.forEach(d => { total++; if (d.data().status === 'sold') sold++; });
  const paintEl = document.getElementById('stat-paintings');
  const soldEl  = document.getElementById('stat-sold');
  if (paintEl) paintEl.textContent = total || '100+';
  if (soldEl)  soldEl.textContent  = sold  || '-';
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHILDERIJKAART HTML
// ─────────────────────────────────────────────────────────────────────────────
function paintingCardHTML(p) {
  const title    = titleFor(p);
  const tags     = (p.tags || []).slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('');
  const soldBadge = p.status === 'sold'
    ? `<span class="sold-badge">${t('sold')}</span>` : '';
  const priceLabel = p.status === 'sold'
    ? t('sold') : (p.price ? formatPrice(p.price) : '-');
  const overlayText = lang === 'nl' ? 'Bekijk details' : 'View details';

  return `
    <div class="painting-card reveal" onclick="openLightbox('${p.id}')">
      <div class="painting-card-img">
        <img src="${p.imageUrl || ''}" alt="${title}" loading="lazy">
        <div class="painting-card-overlay">
          <span class="painting-card-overlay-text">${overlayText}</span>
        </div>
        ${soldBadge}
      </div>
      <div class="painting-card-body">
        <h3>${title}</h3>
        <div class="painting-card-meta">
          <span class="painting-card-price">${priceLabel}</span>
          <span class="painting-card-year">${p.year || ''}</span>
        </div>
        <div class="painting-tags">${tags}</div>
      </div>
    </div>`;
}

// Scroll reveal observer - activates .reveal elements as they enter viewport
const _revealObserver = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); _revealObserver.unobserve(e.target); } }),
  { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
);

function observeRevealElements() {
  document.querySelectorAll('.reveal:not(.visible)').forEach(el => _revealObserver.observe(el));
}

// ─────────────────────────────────────────────────────────────────────────────
// GALERIJ
// ─────────────────────────────────────────────────────────────────────────────
async function loadGallery() {
  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = skeletonCards(6);

  const { db, collection, getDocs } = fb();
  const snap = await getDocs(collection(db, 'paintings'));

  allPaintings = [];
  snap.forEach(d => allPaintings.push({ id: d.id, ...d.data() }));

  // Bouw tagfilters op
  const allTags = new Set();
  allPaintings.forEach(p => (p.tags || []).forEach(tag => allTags.add(tag)));

  const filtersEl = document.getElementById('gallery-filters');
  filtersEl.innerHTML =
    `<button class="filter-chip ${activeFilter === 'all' ? 'active' : ''}" data-filter="all" onclick="filterGallery('all')">${t('filter.all')}</button>` +
    [...allTags].sort().map(tag =>
      `<button class="filter-chip ${activeFilter === tag ? 'active' : ''}" data-filter="${tag}" onclick="filterGallery('${tag}')">${tag}</button>`
    ).join('');

  renderGallery();
}

function filterGallery(filter) {
  activeFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(chip =>
    chip.classList.toggle('active', chip.dataset.filter === filter));
  renderGallery();
}

// Sort keeps original array order intact by working on a copy per-render
let _sortMode = 'default';
function sortGallery(value) {
  _sortMode = value;
  renderGallery();
}

function renderGallery() {
  let filtered = activeFilter === 'all'
    ? [...allPaintings]
    : allPaintings.filter(p => (p.tags || []).includes(activeFilter));

  if (_sortMode === 'year-desc')  filtered.sort((a,b) => (b.year||0) - (a.year||0));
  if (_sortMode === 'year-asc')   filtered.sort((a,b) => (a.year||0) - (b.year||0));
  if (_sortMode === 'price-asc')  filtered.sort((a,b) => (a.price||0) - (b.price||0));
  if (_sortMode === 'price-desc') filtered.sort((a,b) => (b.price||0) - (a.price||0));

  document.getElementById('gallery-count').textContent =
    filtered.length + (lang === 'nl' ? ' werken' : ' works');

  document.getElementById('gallery-grid').innerHTML = filtered.length
    ? filtered.map(paintingCardHTML).join('')
    : `<p class="muted">${lang === 'nl' ? 'Geen schilderijen gevonden.' : 'No paintings found.'}</p>`;
  observeRevealElements();
}

window.filterGallery = filterGallery;
window.sortGallery   = sortGallery;

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTBOX - with prev/next navigation
// ─────────────────────────────────────────────────────────────────────────────
let _lightboxIds = [];   // ordered list of visible painting IDs for navigation
let _lightboxIdx = -1;  // current index in that list
async function openLightbox(id) {
  const { db, doc, getDoc } = fb();
  const snap = await getDoc(doc(db, 'paintings', id));
  if (!snap.exists()) return;

  // Build navigation list from currently visible grid cards
  const cards = document.querySelectorAll('.painting-card');
  _lightboxIds = [...cards].map(c => c.getAttribute('onclick')?.match(/'([^']+)'/)?.[1]).filter(Boolean);
  _lightboxIdx = _lightboxIds.indexOf(id);

  currentPainting = { id, ...snap.data() };
  _renderLightbox(currentPainting);

  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _renderLightbox(p) {
  document.getElementById('lb-img').src    = p.imageUrl || '';
  document.getElementById('lb-img').alt    = titleFor(p);
  document.getElementById('lb-title').textContent = titleFor(p);

  document.getElementById('lb-price').textContent = p.status === 'sold'
    ? t('sold') : (p.price ? formatPrice(p.price) : '');

  document.getElementById('lb-story').textContent = lang === 'nl'
    ? (p.storyNl || '') : (p.storyEn || p.storyNl || '');

  document.getElementById('lb-specs').innerHTML = [
    ['lb.size',      p.size],
    ['lb.technique', p.technique],
    ['lb.year',      p.year],
    ['lb.status',    t(p.status || 'available')]
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `
      <div class="lightbox-spec">
        <span class="label">${t(k)}</span>
        <span>${v}</span>
      </div>`).join('');

  document.getElementById('lb-tags').innerHTML =
    (p.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('');

  document.getElementById('lb-actions').innerHTML = p.status !== 'sold'
    ? `<button class="btn btn-solid" onclick="addToCart(currentPainting)">${t('btn.addcart')}</button>
       <button class="btn" onclick="showPage('contact');closeLightbox()">${t('btn.enquire')}</button>`
    : `<button class="btn" onclick="showPage('contact');closeLightbox()">${t('btn.enquire')}</button>`;

  // Reset review form
  selectedStars = 0;
  document.querySelectorAll('.star-btn').forEach(s => s.classList.remove('on'));
  const rvName = document.getElementById('rv-name');
  const rvText = document.getElementById('rv-text');
  if (rvName) rvName.value = '';
  if (rvText) rvText.value = '';

  // Scroll info panel to top
  const scroll = document.querySelector('.lightbox-panel-scroll');
  if (scroll) scroll.scrollTop = 0;

  loadReviews(p.id);
}

async function navigateLightbox(direction) {
  if (!_lightboxIds.length) return;
  _lightboxIdx = (_lightboxIdx + direction + _lightboxIds.length) % _lightboxIds.length;
  const nextId = _lightboxIds[_lightboxIdx];
  const { db, doc, getDoc } = fb();
  const snap = await getDoc(doc(db, 'paintings', nextId));
  if (!snap.exists()) return;
  currentPainting = { id: nextId, ...snap.data() };
  _renderLightbox(currentPainting);
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
  currentPainting = null;
}

window.openLightbox     = openLightbox;
window.closeLightbox    = closeLightbox;
window.navigateLightbox = navigateLightbox;

document.getElementById('lightbox').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeLightbox();
});

// Keyboard navigation
document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (!lb.classList.contains('open')) return;
  if (e.key === 'Escape')     closeLightbox();
  if (e.key === 'ArrowRight') navigateLightbox(1);
  if (e.key === 'ArrowLeft')  navigateLightbox(-1);
});

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────────────────────────────────────────

// Sterren hover/selectie
document.querySelectorAll('.star-btn').forEach(star => {
  star.addEventListener('click', () => {
    selectedStars = +star.dataset.v;
    updateStarDisplay(selectedStars);
  });
  star.addEventListener('mouseenter', () => updateStarDisplay(+star.dataset.v));
  star.addEventListener('mouseleave', () => updateStarDisplay(selectedStars));
});

function updateStarDisplay(count) {
  document.querySelectorAll('.star-btn').forEach((s, i) =>
    s.classList.toggle('on', i < count));
}

async function loadReviews(paintingId) {
  const list = document.getElementById('lb-reviews');
  const { db, collection, getDocs, query, where, orderBy } = fb();

  const snap = await getDocs(
    query(collection(db, 'reviews'),
      where('paintingId', '==', paintingId),
      orderBy('createdAt', 'desc'))
  );

  const reviews = [];
  snap.forEach(d => reviews.push(d.data()));

  if (!reviews.length) {
    list.innerHTML = `<p class="muted" style="font-size:0.85rem;margin-bottom:0.5rem">${t('reviews.none')}</p>`;
    return;
  }

  list.innerHTML = '<div class="review-list">' +
    reviews.map(r => `
      <div class="review-item">
        <div class="review-header">
          <span class="review-author">${r.name}</span>
          <span class="review-stars">${'★'.repeat(r.stars)}</span>
        </div>
        <p class="review-text">${r.text}</p>
      </div>`).join('') +
    '</div>';
}

async function submitReview() {
  if (!currentPainting) return;
  if (!selectedStars) { showToast(lang === 'nl' ? 'Selecteer een aantal sterren' : 'Please select a star rating'); return; }

  const name = document.getElementById('rv-name').value.trim();
  const text = document.getElementById('rv-text').value.trim();
  if (!name || !text) {
    showToast(lang === 'nl' ? 'Vul naam en opmerking in' : 'Please fill in your name and comment');
    return;
  }

  const { db, collection, addDoc, serverTimestamp } = fb();
  await addDoc(collection(db, 'reviews'), {
    paintingId:  currentPainting.id,
    name,
    stars:       selectedStars,
    text,
    createdAt:   serverTimestamp()
  });

  showToast(lang === 'nl' ? 'Beoordeling geplaatst - dank!' : 'Review submitted - thank you!');
  loadReviews(currentPainting.id);

  document.getElementById('rv-name').value = '';
  document.getElementById('rv-text').value = '';
  selectedStars = 0;
  updateStarDisplay(0);
}

window.submitReview = submitReview;

// ─────────────────────────────────────────────────────────────────────────────
// WINKELMANDJE / SELECTIE
// ─────────────────────────────────────────────────────────────────────────────
function toggleCart() {
  document.getElementById('cart-sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('open');
}

function closeCart() {
  document.getElementById('cart-sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

function addToCart(painting) {
  if (!painting) return;
  if (cart.find(c => c.id === painting.id)) {
    showToast(lang === 'nl' ? 'Al in uw selectie' : 'Already in your selection');
    return;
  }
  cart.push(painting);
  renderCart();
  showToast(lang === 'nl' ? 'Toegevoegd aan selectie' : 'Added to selection');
}

function removeFromCart(id) {
  cart = cart.filter(c => c.id !== id);
  renderCart();
}

function renderCart() {
  const bodyEl   = document.getElementById('cart-body');
  const footerEl = document.getElementById('cart-footer');
  const countEl  = document.getElementById('cart-count');

  countEl.textContent = cart.length;
  if (cart.length > 0) countEl.classList.add('visible');
  else                  countEl.classList.remove('visible');

  if (!cart.length) {
    bodyEl.innerHTML       = `<div class="cart-empty">${t('cart.empty')}</div>`;
    footerEl.style.display = 'none';
    // Reset to step 1 for next use
    const s1 = document.getElementById('cart-step-1');
    const s2 = document.getElementById('cart-step-2');
    if (s1) s1.style.display = 'block';
    if (s2) s2.style.display = 'none';
    return;
  }

  bodyEl.innerHTML = cart.map(p => `
    <div class="cart-item">
      <img src="${p.imageUrl || ''}" alt="${titleFor(p)}">
      <div>
        <div class="cart-item-title">${titleFor(p)}</div>
        <div class="cart-item-price">${formatPrice(p.price)}</div>
      </div>
      <button class="cart-remove" onclick="removeFromCart('${p.id}')" title="Verwijderen">✕</button>
    </div>`).join('');

  const total = cart.reduce((sum, p) => sum + Number(p.price), 0);
  document.getElementById('cart-total-price').textContent = formatPrice(total);
  footerEl.style.display = 'block';
}

function showEnquiryForm() {
  document.getElementById('cart-step-1').style.display = 'none';
  document.getElementById('cart-step-2').style.display = 'block';
  document.getElementById('eq-name').focus();
}

function hideEnquiryForm() {
  document.getElementById('cart-step-2').style.display = 'none';
  document.getElementById('cart-step-1').style.display = 'block';
}

async function sendEnquiry() {
  if (!cart.length) return;

  const name  = document.getElementById('eq-name').value.trim();
  const email = document.getElementById('eq-email').value.trim();
  const phone = document.getElementById('eq-phone').value.trim();
  const note  = document.getElementById('eq-note').value.trim();

  if (!name || !email) {
    showToast(lang === 'nl' ? 'Naam en e-mailadres zijn verplicht.' : 'Name and email are required.');
    return;
  }

  const { db, collection, addDoc, serverTimestamp } = fb();
  const titles = cart.map(p => titleFor(p)).join(', ');
  const total  = cart.reduce((sum, p) => sum + Number(p.price), 0);

  await addDoc(collection(db, 'messages'), {
    type:      'enquiry',
    name,
    email,
    phone:     phone || null,
    note:      note  || null,
    paintings: cart.map(p => p.id),
    titles,
    total,
    read:      false,
    createdAt: serverTimestamp()
  });

  cart = [];
  renderCart();
  closeCart();
  hideEnquiryForm();
  showToast(lang === 'nl' ? 'Uw aanvraag is verzonden!' : 'Your enquiry has been sent!');
}

window.toggleCart      = toggleCart;
window.closeCart       = closeCart;
window.addToCart       = addToCart;
window.removeFromCart  = removeFromCart;
window.sendEnquiry     = sendEnquiry;
window.showEnquiryForm = showEnquiryForm;
window.hideEnquiryForm = hideEnquiryForm;

// currentPainting nodig in HTML onclick
Object.defineProperty(window, 'currentPainting', {
  get() { return currentPainting; }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTFORMULIER
// ─────────────────────────────────────────────────────────────────────────────
async function sendContact() {
  const name    = document.getElementById('cf-name').value.trim();
  const email   = document.getElementById('cf-email').value.trim();
  const subject = document.getElementById('cf-subject').value.trim();
  const message = document.getElementById('cf-message').value.trim();
  const statusEl = document.getElementById('cf-status');
  const btn = document.querySelector('#contact-form-body .btn-solid');

  if (!name || !email || !message) {
    statusEl.innerHTML = `<div class="alert alert-err">${lang === 'nl' ? 'Vul alle verplichte velden in.' : 'Please fill in all required fields.'}</div>`;
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = lang === 'nl' ? 'Verzenden...' : 'Sending...'; }

  const { db, collection, addDoc, serverTimestamp } = fb();
  await addDoc(collection(db, 'messages'), {
    type: 'contact', name, email, subject, message,
    read: false, createdAt: serverTimestamp()
  });

  // Replace form with success message
  const formBody = document.getElementById('contact-form-body');
  formBody.innerHTML = `
    <div style="text-align:center;padding:3rem 1rem">
      <div style="font-size:2.5rem;margin-bottom:1rem">✓</div>
      <h3 style="font-family:var(--ff-serif);font-size:1.6rem;margin-bottom:0.75rem">${lang === 'nl' ? 'Bericht verzonden' : 'Message sent'}</h3>
      <p style="color:var(--muted);font-size:0.95rem;margin-bottom:1.5rem">${lang === 'nl' ? 'Dank voor uw bericht. Ik reageer zo snel mogelijk.' : 'Thank you for your message. I will respond as soon as possible.'}</p>
      <button class="btn" onclick="location.reload()">${lang === 'nl' ? 'Nieuw bericht' : 'New message'}</button>
    </div>`;
}

window.sendContact = sendContact;

// ─────────────────────────────────────────────────────────────────────────────
// OVER MIJ PAGINA
// ─────────────────────────────────────────────────────────────────────────────
async function loadAboutPage() {
  const { db, doc, getDoc } = fb();
  try {
    const snap = await getDoc(doc(db, 'settings', 'about'));
    if (!snap.exists()) return;
    const data = snap.data();

    if (data.photoUrl) {
      document.getElementById('about-photo-wrap').innerHTML =
        `<img src="${data.photoUrl}" alt="W.H. Rodenhuis">`;
    }
    if (data.bio1) {
      const el = document.querySelector('[data-i18n="about.bio1"]');
      if (el) el.textContent = data.bio1;
    }
    if (data.bio2) {
      const el = document.querySelector('[data-i18n="about.bio2"]');
      if (el) el.textContent = data.bio2;
    }
    if (data.email) {
      const el = document.getElementById('contact-email');
      if (el) { el.textContent = data.email; el.href = 'mailto:' + data.email; }
    }
    if (data.atelierPhotoUrl) {
      _applyAtelierPhoto(data.atelierPhotoUrl);
    }
  } catch {}
}

function _applyAtelierPhoto(url) {
  const wrap = document.getElementById('atelier-img-inner');
  if (!wrap) return;
  wrap.innerHTML = `<img src="${url}" alt="W.H. Rodenhuis in het atelier" loading="lazy">`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SITE TEKSTEN (vanuit Firestore settings/texts)
// Overschrijft data-i18n elementen met waarden die in admin zijn ingesteld.
// Werkt alleen voor de NL-taal - EN-vertalingen blijven uit i18n.js komen.
// ─────────────────────────────────────────────────────────────────────────────
async function loadSiteTexts() {
  const { db, doc, getDoc } = fb();
  try {
    const snap = await getDoc(doc(db, 'settings', 'texts'));
    if (!snap.exists()) return;
    const data = snap.data();

    // Apply each text key to any element with matching data-i18n attribute
    // Only applies when page is in Dutch (NL is the admin-editable language)
    if (lang !== 'nl') return;
    Object.entries(data).forEach(([key, value]) => {
      document.querySelectorAll(`[data-i18n="${key}"]`).forEach(el => {
        if (value) el.textContent = value;
      });
    });
  } catch {}
}

async function _loadAtelierPhotoFromDb() {
  const { db, doc, getDoc } = fb();
  try {
    const snap = await getDoc(doc(db, 'settings', 'about'));
    if (snap.exists() && snap.data().atelierPhotoUrl) {
      _applyAtelierPhoto(snap.data().atelierPhotoUrl);
    }
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIALISATIE
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const init = () => {
    try {
      fb();
      loadHero();
      loadFeatured();
      loadSiteTexts();
      _loadAtelierPhotoFromDb();
    } catch {
      setTimeout(init, 500);
    }
  };
  setTimeout(init, 300);
  renderCart();
  applyTranslations();
});

// EINDE - admin-functionaliteit zit in admin/index.html (lokaal bestand)

