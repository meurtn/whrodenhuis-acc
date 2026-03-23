// =============================================================================
// app.js — W.H. Rodenhuis
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
  document.getElementById('lang-btn').textContent = lang === 'nl' ? 'EN' : 'NL';
  document.documentElement.lang = lang;
  applyTranslations();

  // Herlaad dynamische content in de actieve taal
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

  // Laad paginaspecifieke data
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
async function loadHero() {
  const { db, collection, getDocs, query, where } = fb();

  // Probeer eerst uitgelichte schilderijen
  const featuredSnap = await getDocs(query(collection(db, 'paintings'), where('featured', '==', true)));
  featuredSnap.forEach(d => heroSlides.push({ id: d.id, ...d.data() }));

  // Fallback: neem de eerste 6 schilderijen
  if (heroSlides.length < 2) {
    heroSlides = [];
    const allSnap = await getDocs(collection(db, 'paintings'));
    allSnap.forEach(d => { if (heroSlides.length < 6) heroSlides.push({ id: d.id, ...d.data() }); });
  }

  renderHeroSlides();
}

function renderHeroSlides() {
  const slideshowEl = document.getElementById('hero-slideshow');
  const dotsEl      = document.getElementById('hero-dots');
  if (!heroSlides.length) return;

  slideshowEl.innerHTML = heroSlides.map((p, i) => `
    <div class="hero-slide ${i === 0 ? 'active' : ''}" id="hs-${i}">
      <img src="${p.imageUrl || ''}" alt="${titleFor(p)}" loading="${i === 0 ? 'eager' : 'lazy'}">
      <div class="hero-slide-caption">
        <h3>${titleFor(p)}</h3>
        <p>${p.year || ''} · ${p.technique || ''}</p>
      </div>
    </div>`).join('');

  dotsEl.innerHTML = heroSlides.map((_, i) =>
    `<div class="hero-dot ${i === 0 ? 'active' : ''}" onclick="goHeroSlide(${i})"></div>`).join('');

  clearInterval(heroTimer);
  heroTimer = setInterval(() => goHeroSlide((heroIdx + 1) % heroSlides.length), 5200);
}

function goHeroSlide(i) {
  heroIdx = i;
  document.querySelectorAll('.hero-slide').forEach((s, j) => s.classList.toggle('active', j === i));
  document.querySelectorAll('.hero-dot').forEach((d, j)   => d.classList.toggle('active', j === i));
}

window.goHeroSlide = goHeroSlide;

// ─────────────────────────────────────────────────────────────────────────────
// UITGELICHTE SCHILDERIJEN (homepage)
// ─────────────────────────────────────────────────────────────────────────────
async function loadFeatured() {
  const grid = document.getElementById('featured-grid');
  grid.innerHTML = skeletonCards(3);

  const { db, collection, getDocs, query, where } = fb();
  let paintings = [];

  const featSnap = await getDocs(query(collection(db, 'paintings'), where('featured', '==', true)));
  featSnap.forEach(d => paintings.push({ id: d.id, ...d.data() }));

  if (paintings.length < 3) {
    const allSnap = await getDocs(collection(db, 'paintings'));
    allSnap.forEach(d => { if (paintings.length < 6) paintings.push({ id: d.id, ...d.data() }); });
  }

  grid.innerHTML = paintings.slice(0, 6).map(paintingCardHTML).join('') ||
    '<p class="muted">Voeg schilderijen toe via het admin-paneel.</p>';

  // Update statistieken
  const allSnap = await getDocs(collection(db, 'paintings'));
  let total = 0, sold = 0;
  allSnap.forEach(d => { total++; if (d.data().status === 'sold') sold++; });
  document.getElementById('stat-paintings').textContent = total || '100+';
  document.getElementById('stat-sold').textContent      = sold  || '—';
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
    ? t('sold') : (p.price ? formatPrice(p.price) : '—');

  return `
    <div class="painting-card" onclick="openLightbox('${p.id}')">
      <div class="painting-card-img">
        <img src="${p.imageUrl || ''}" alt="${title}" loading="lazy">
        <div class="painting-card-overlay"></div>
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

function renderGallery() {
  const filtered = activeFilter === 'all'
    ? allPaintings
    : allPaintings.filter(p => (p.tags || []).includes(activeFilter));

  document.getElementById('gallery-count').textContent =
    filtered.length + (lang === 'nl' ? ' werken' : ' works');

  document.getElementById('gallery-grid').innerHTML = filtered.length
    ? filtered.map(paintingCardHTML).join('')
    : `<p class="muted">${lang === 'nl' ? 'Geen schilderijen gevonden.' : 'No paintings found.'}</p>`;
}

window.filterGallery = filterGallery;

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTBOX
// ─────────────────────────────────────────────────────────────────────────────
async function openLightbox(id) {
  const { db, doc, getDoc } = fb();
  const snap = await getDoc(doc(db, 'paintings', id));
  if (!snap.exists()) return;

  currentPainting = { id, ...snap.data() };
  const p = currentPainting;

  document.getElementById('lb-img').src    = p.imageUrl || '';
  document.getElementById('lb-img').alt    = titleFor(p);
  document.getElementById('lb-title').textContent = titleFor(p);
  document.getElementById('lb-year').textContent  = p.year || '';

  document.getElementById('lb-price').textContent = p.status === 'sold'
    ? t('sold')
    : (p.price ? formatPrice(p.price) : '');

  document.getElementById('lb-story').textContent = lang === 'nl'
    ? (p.storyNl || '')
    : (p.storyEn || p.storyNl || '');

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

  // Reset reviewformulier
  selectedStars = 0;
  document.querySelectorAll('.star-btn').forEach(s => s.classList.remove('on'));
  document.getElementById('rv-name').value = '';
  document.getElementById('rv-text').value = '';

  loadReviews(id);

  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
  currentPainting = null;
}

window.openLightbox  = openLightbox;
window.closeLightbox = closeLightbox;

document.getElementById('lightbox').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeLightbox();
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

  showToast(lang === 'nl' ? 'Beoordeling geplaatst — dank!' : 'Review submitted — thank you!');
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
    bodyEl.innerHTML      = `<div class="cart-empty">${t('cart.empty')}</div>`;
    footerEl.style.display = 'none';
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

async function sendEnquiry() {
  if (!cart.length) return;
  const { db, collection, addDoc, serverTimestamp } = fb();

  const titles = cart.map(p => titleFor(p)).join(', ');
  const total  = cart.reduce((sum, p) => sum + Number(p.price), 0);

  await addDoc(collection(db, 'messages'), {
    type:      'enquiry',
    paintings: cart.map(p => p.id),
    titles,
    total,
    createdAt: serverTimestamp()
  });

  cart = [];
  renderCart();
  closeCart();
  showToast(lang === 'nl' ? 'Uw aanvraag is verzonden!' : 'Your enquiry has been sent!');
}

window.toggleCart    = toggleCart;
window.closeCart     = closeCart;
window.addToCart     = addToCart;
window.removeFromCart = removeFromCart;
window.sendEnquiry   = sendEnquiry;

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

  if (!name || !email || !message) {
    statusEl.innerHTML = `<div class="alert alert-err">${lang === 'nl' ? 'Vul alle verplichte velden in.' : 'Please fill in all required fields.'}</div>`;
    return;
  }

  const { db, collection, addDoc, serverTimestamp } = fb();
  await addDoc(collection(db, 'messages'), {
    type: 'contact', name, email, subject, message,
    read: false,
    createdAt: serverTimestamp()
  });

  statusEl.innerHTML = `<div class="alert alert-ok">${lang === 'nl' ? 'Uw bericht is verzonden. Dank!' : 'Your message has been sent. Thank you!'}</div>`;
  ['cf-name', 'cf-email', 'cf-subject', 'cf-message'].forEach(id =>
    document.getElementById(id).value = '');
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
      const bio1El = document.querySelector('[data-i18n="about.bio1"]');
      if (bio1El) bio1El.textContent = data.bio1;
    }
    if (data.bio2) {
      const bio2El = document.querySelector('[data-i18n="about.bio2"]');
      if (bio2El) bio2El.textContent = data.bio2;
    }
    if (data.email) {
      document.getElementById('contact-email').textContent = data.email;
    }
  } catch (e) {
    // Nog geen about-document — standaardteksten blijven zichtbaar
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — TOEGANG
// ─────────────────────────────────────────────────────────────────────────────
function openAdmin() {
  document.getElementById('admin-panel').classList.add('open');
  document.getElementById('admin-login').style.display    = 'flex';
  document.getElementById('admin-dashboard').style.display = 'none';
  document.getElementById('admin-email').value = '';
  document.getElementById('admin-pass').value  = '';
  document.getElementById('login-alert').style.display = 'none';

  // Als al ingelogd, ga direct naar dashboard
  fb().onAuthStateChanged(fb().auth, user => { if (user) showAdminDashboard(); });
}

function closeAdmin() {
  document.getElementById('admin-panel').classList.remove('open');
}

async function doLogin() {
  const email  = document.getElementById('admin-email').value.trim();
  const pass   = document.getElementById('admin-pass').value;
  const alertEl = document.getElementById('login-alert');

  try {
    await fb().signInWithEmailAndPassword(fb().auth, email, pass);
    showAdminDashboard();
  } catch {
    alertEl.style.display = 'block';
    alertEl.innerHTML = '<div class="alert alert-err">Inloggen mislukt. Controleer uw gegevens.</div>';
  }
}

async function doLogout() {
  await fb().signOut(fb().auth);
  closeAdmin();
}

function showAdminDashboard() {
  document.getElementById('admin-login').style.display     = 'none';
  document.getElementById('admin-dashboard').style.display = 'block';
  loadAdminPaintings();
}

window.openAdmin  = openAdmin;
window.closeAdmin = closeAdmin;
window.doLogin    = doLogin;
window.doLogout   = doLogout;

// Enter-toets in wachtwoordveld
document.getElementById('admin-pass')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — TABBLADEN
// ─────────────────────────────────────────────────────────────────────────────
function showAdminTab(tab, btn) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');

  if (tab === 'messages') loadAdminMessages();
  if (tab === 'about')    loadAdminAbout();
}

window.showAdminTab = showAdminTab;

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — SCHILDERIJEN
// ─────────────────────────────────────────────────────────────────────────────
async function loadAdminPaintings() {
  const { db, collection, getDocs } = fb();
  const snap   = await getDocs(collection(db, 'paintings'));
  const tbody  = document.getElementById('admin-paintings-body');
  let rows = '';

  snap.forEach(d => {
    const p = { id: d.id, ...d.data() };
    rows += `
      <tr>
        <td><img class="admin-thumb" src="${p.imageUrl || ''}" alt=""></td>
        <td>
          <strong>${p.titleNl || '—'}</strong>
          ${p.titleEn ? `<br><span style="font-size:0.8rem;color:var(--muted)">${p.titleEn}</span>` : ''}
        </td>
        <td>${p.year || '—'}</td>
        <td>${p.price ? formatPrice(p.price) : '—'}</td>
        <td><span class="tag">${t(p.status || 'available')}</span></td>
        <td style="text-align:center">${p.featured ? '✓' : ''}</td>
        <td><button class="btn btn-sm" onclick="openPaintingModal('${p.id}')">Bewerken</button></td>
      </tr>`;
  });

  tbody.innerHTML = rows ||
    '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:2rem">Nog geen schilderijen toegevoegd.</td></tr>';
}

function openPaintingModal(id) {
  const modal     = document.getElementById('painting-modal-bg');
  const deleteBtn = document.getElementById('pm-delete-btn');

  modal.classList.add('open');

  if (id) {
    document.getElementById('painting-modal-title').textContent = 'Schilderij bewerken';
    deleteBtn.style.display = 'inline-flex';
    _loadPaintingIntoModal(id);
  } else {
    document.getElementById('painting-modal-title').textContent = 'Nieuw schilderij';
    deleteBtn.style.display = 'none';
    _clearPaintingModal();
  }
}

function _clearPaintingModal() {
  ['pm-id', 'pm-title-nl', 'pm-title-en', 'pm-year', 'pm-price',
   'pm-size', 'pm-technique', 'pm-story-nl', 'pm-story-en', 'pm-tags', 'pm-image-url']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('pm-status').value   = 'available';
  document.getElementById('pm-featured').value = 'false';
  document.getElementById('pm-image').value    = '';
}

async function _loadPaintingIntoModal(id) {
  const { db, doc, getDoc } = fb();
  const snap = await getDoc(doc(db, 'paintings', id));
  if (!snap.exists()) return;
  const p = snap.data();

  document.getElementById('pm-id').value        = id;
  document.getElementById('pm-title-nl').value  = p.titleNl || '';
  document.getElementById('pm-title-en').value  = p.titleEn || '';
  document.getElementById('pm-year').value      = p.year || '';
  document.getElementById('pm-price').value     = p.price || '';
  document.getElementById('pm-size').value      = p.size || '';
  document.getElementById('pm-technique').value = p.technique || '';
  document.getElementById('pm-story-nl').value  = p.storyNl || '';
  document.getElementById('pm-story-en').value  = p.storyEn || '';
  document.getElementById('pm-tags').value      = (p.tags || []).join(', ');
  document.getElementById('pm-status').value    = p.status || 'available';
  document.getElementById('pm-featured').value  = String(!!p.featured);
  document.getElementById('pm-image-url').value = p.imageUrl || '';
}

function closePaintingModal() {
  document.getElementById('painting-modal-bg').classList.remove('open');
}

async function savePainting() {
  const { db, storage, doc, addDoc, updateDoc, collection, ref, uploadBytes, getDownloadURL, serverTimestamp } = fb();

  const id        = document.getElementById('pm-id').value;
  const fileInput = document.getElementById('pm-image');
  let imageUrl    = document.getElementById('pm-image-url').value.trim();

  // Upload afbeelding als er een bestand is geselecteerd
  if (fileInput.files[0]) {
    showToast('Afbeelding wordt geüpload…');
    const file       = fileInput.files[0];
    const storageRef = ref(storage, `paintings/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    imageUrl = await getDownloadURL(storageRef);
  }

  const data = {
    titleNl:   document.getElementById('pm-title-nl').value.trim(),
    titleEn:   document.getElementById('pm-title-en').value.trim(),
    year:      document.getElementById('pm-year').value.trim(),
    price:     Number(document.getElementById('pm-price').value) || 0,
    size:      document.getElementById('pm-size').value.trim(),
    technique: document.getElementById('pm-technique').value.trim(),
    storyNl:   document.getElementById('pm-story-nl').value.trim(),
    storyEn:   document.getElementById('pm-story-en').value.trim(),
    tags:      document.getElementById('pm-tags').value
                 .split(',').map(t => t.trim()).filter(Boolean),
    status:    document.getElementById('pm-status').value,
    featured:  document.getElementById('pm-featured').value === 'true',
    imageUrl,
    updatedAt: serverTimestamp()
  };

  if (id) {
    await updateDoc(doc(db, 'paintings', id), data);
    showToast('Schilderij bijgewerkt.');
  } else {
    data.createdAt = serverTimestamp();
    await addDoc(collection(db, 'paintings'), data);
    showToast('Schilderij toegevoegd.');
  }

  closePaintingModal();
  loadAdminPaintings();
}

async function deletePainting() {
  const id = document.getElementById('pm-id').value;
  if (!id) return;
  if (!confirm('Weet u zeker dat u dit schilderij wilt verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;

  const { db, doc, deleteDoc } = fb();
  await deleteDoc(doc(db, 'paintings', id));
  closePaintingModal();
  loadAdminPaintings();
  showToast('Schilderij verwijderd.');
}

window.loadAdminPaintings = loadAdminPaintings;
window.openPaintingModal  = openPaintingModal;
window.closePaintingModal = closePaintingModal;
window.savePainting       = savePainting;
window.deletePainting     = deletePainting;

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — BERICHTEN
// ─────────────────────────────────────────────────────────────────────────────
async function loadAdminMessages() {
  const { db, collection, getDocs, query, orderBy } = fb();
  const list = document.getElementById('messages-list');
  list.innerHTML = '<p class="muted">Berichten laden…</p>';

  const snap = await getDocs(query(collection(db, 'messages'), orderBy('createdAt', 'desc')));
  const msgs = [];
  snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));

  if (!msgs.length) {
    list.innerHTML = '<p class="muted">Geen berichten ontvangen.</p>';
    return;
  }

  list.innerHTML = msgs.map(m => `
    <div class="message-card">
      <div class="message-card-header">
        <strong>${m.type === 'enquiry' ? 'Aanvraag' : 'Contactbericht'}: ${m.name || '—'}</strong>
        <span class="tag">${m.email || ''}</span>
      </div>
      ${m.subject ? `<div class="message-card-subject">${m.subject}</div>` : ''}
      <div class="message-card-body">${m.message || ('Schilderijen: ' + (m.titles || '')) }</div>
      ${m.total ? `<div class="message-card-total">Totaal: ${formatPrice(m.total)}</div>` : ''}
    </div>`).join('');
}

window.loadAdminMessages = loadAdminMessages;

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — OVER MIJ
// ─────────────────────────────────────────────────────────────────────────────
async function loadAdminAbout() {
  const { db, doc, getDoc } = fb();
  try {
    const snap = await getDoc(doc(db, 'settings', 'about'));
    if (!snap.exists()) return;
    const data = snap.data();

    document.getElementById('about-photo-url').value = data.photoUrl || '';
    document.getElementById('about-bio1').value      = data.bio1 || '';
    document.getElementById('about-bio2').value      = data.bio2 || '';
    document.getElementById('about-email').value     = data.email || '';
  } catch {}
}

async function saveAbout() {
  const { db, doc, setDoc } = fb();
  const data = {
    photoUrl: document.getElementById('about-photo-url').value.trim(),
    bio1:     document.getElementById('about-bio1').value.trim(),
    bio2:     document.getElementById('about-bio2').value.trim(),
    email:    document.getElementById('about-email').value.trim()
  };

  await setDoc(doc(db, 'settings', 'about'), data, { merge: true });
  showToast('"Over mij" opgeslagen.');
}

window.loadAdminAbout = loadAdminAbout;
window.saveAbout      = saveAbout;

// ─────────────────────────────────────────────────────────────────────────────
// INITIALISATIE
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Wacht even tot Firebase module volledig geladen is
  const init = () => {
    try {
      fb(); // Gooit een error als Firebase nog niet klaar is
      loadHero();
      loadFeatured();
    } catch {
      setTimeout(init, 500);
    }
  };

  setTimeout(init, 300);
  renderCart();
  applyTranslations();
});
