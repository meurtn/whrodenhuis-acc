// =============================================================================
// admin/app-admin.js
// Beheertool voor W.H. Rodenhuis
// Bereikbaar via /admin/ op de gehoste site - beveiligd met Google Auth
// Upload via Cloudinary · Schrijft naar Firestore
// =============================================================================

import { CLOUDINARY } from './firebase-config-admin.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function fb() {
  if (!window._fb) throw new Error('Firebase niet geladen.');
  return window._fb;
}

function formatPrice(p) {
  return '€\u00A0' + Number(p).toLocaleString('nl-NL');
}

let _toastTimer;
function showToast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast show ' + type;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function setLoading(btn, loading, label = 'Opslaan') {
  btn.disabled    = loading;
  btn.textContent = loading ? 'Bezig…' : label;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH - Google (primair) + e-mail/wachtwoord (fallback)
// Toegang alleen voor e-mailadressen in de Firestore 'admins' collectie.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Controleer of het ingelogde e-mailadres in de 'admins' collectie staat.
 * Zo niet: direct uitloggen en foutmelding tonen.
 */
async function checkAdminAccess(user) {
  const { db, doc, getDoc } = fb();
  try {
    const snap = await getDoc(doc(db, 'admins', user.email));
    if (snap.exists()) {
      showDashboard(user);
    } else {
      // Niet geautoriseerd - direct uitloggen
      await fb().signOut(fb().auth);
      showLogin();
      showLoginAlert(
        'Geen toegang. Dit account (' + user.email + ') is niet geautoriseerd als beheerder.'
      );
    }
  } catch (e) {
    // Firestore fout (bijv. geen internetverbinding)
    await fb().signOut(fb().auth);
    showLogin();
    showLoginAlert('Fout bij het controleren van toegangsrechten. Probeer opnieuw.');
  }
}

function initAuth() {
  fb().onAuthStateChanged(fb().auth, user => {
    if (user) {
      checkAdminAccess(user);
    } else {
      showLogin();
    }
  });
}

function showLogin() {
  document.getElementById('screen-login').style.display     = 'flex';
  document.getElementById('screen-dashboard').style.display = 'none';
}

function showLoginAlert(msg) {
  const alertEl = document.getElementById('login-alert');
  alertEl.textContent   = msg;
  alertEl.style.display = 'block';
}

function showDashboard(user) {
  document.getElementById('screen-login').style.display     = 'none';
  document.getElementById('screen-dashboard').style.display = 'block';
  document.getElementById('user-name').textContent =
    user.displayName || user.email || 'Beheerder';
  loadPaintings();
}

async function loginWithGoogle() {
  const alertEl = document.getElementById('login-alert');
  alertEl.style.display = 'none';
  try {
    await fb().signInWithGoogle();
    // onAuthStateChanged handelt de rest af inclusief de whitelist-check
  } catch (e) {
    showLoginAlert('Google-inloggen mislukt: ' + e.message);
  }
}

async function loginWithEmail() {
  const email   = document.getElementById('admin-email').value.trim();
  const pass    = document.getElementById('admin-pass').value;
  document.getElementById('login-alert').style.display = 'none';
  try {
    await fb().signInWithEmailAndPassword(fb().auth, email, pass);
    // onAuthStateChanged handelt de rest af inclusief de whitelist-check
  } catch {
    showLoginAlert('Inloggen mislukt. Controleer e-mail en wachtwoord.');
  }
}

async function logout() {
  await fb().signOut(fb().auth);
}

window.loginWithGoogle = loginWithGoogle;
window.loginWithEmail  = loginWithEmail;
window.logout          = logout;

// Enter-toets in wachtwoordveld
document.getElementById('admin-pass')
  ?.addEventListener('keydown', e => { if (e.key === 'Enter') loginWithEmail(); });

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN TAAL - NL/EN schakelaar
// ─────────────────────────────────────────────────────────────────────────────
let adminLang = 'nl'; // 'nl' | 'en'

function setAdminLang(lang) {
  adminLang = lang;

  // Update buttons
  document.getElementById('admin-lang-nl').classList.toggle('active', lang === 'nl');
  document.getElementById('admin-lang-en').classList.toggle('active', lang === 'en');

  // Update note in Over mij tab
  const note = document.getElementById('about-lang-note');
  if (note) {
    note.innerHTML = lang === 'nl'
      ? 'Huidige taal: <strong>Nederlands</strong> - gebruik de NL/EN knop bovenin om te wisselen.'
      : 'Current language: <strong>English</strong> - use the NL/EN button above to switch.';
  }

  // Reload active tab with new language
  const activeTab = document.querySelector('.tab-panel.active');
  if (activeTab?.id === 'tab-about')    loadAbout();
  if (activeTab?.id === 'tab-texts')    loadTexts();
  if (activeTab?.id === 'tab-overzicht') loadOverzicht();
}

window.setAdminLang = setAdminLang;

// ─────────────────────────────────────────────────────────────────────────────
// TABBLADEN
// ─────────────────────────────────────────────────────────────────────────────
function showTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');

  if (tab === 'messages')  loadMessages();
  if (tab === 'about')     loadAbout();
  if (tab === 'texts')     loadTexts();
  if (tab === 'overzicht') loadOverzicht();
}
window.showTab = showTab;

// ─────────────────────────────────────────────────────────────────────────────
// CLOUDINARY UPLOAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload een bestand naar Cloudinary via unsigned preset.
 * Geeft terug: { url, publicId }
 */
async function uploadToCloudinary(file, onProgress) {
  const fd = new FormData();
  fd.append('file',          file);
  fd.append('upload_preset', CLOUDINARY.uploadPreset);
  fd.append('folder',        CLOUDINARY.folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY.uploadUrl);

    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        resolve({ url: res.secure_url, publicId: res.public_id });
      } else {
        reject(new Error('Cloudinary upload mislukt: ' + xhr.status));
      }
    };

    xhr.onerror = () => reject(new Error('Netwerkfout tijdens upload'));
    xhr.send(fd);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHILDERIJEN - WEBSITE OVERZICHT (alleen visible=true of geen visible-veld)
// ─────────────────────────────────────────────────────────────────────────────
let _allPaintings  = [];   // alle schilderijen in geheugen
let _paintSort     = { col: 'year', dir: 'desc' };

async function loadPaintings() {
  const { db, collection, getDocs } = fb();
  const tbody = document.getElementById('paintings-body');
  tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">Laden…</td></tr>';

  const snap = await getDocs(collection(db, 'paintings'));
  _allPaintings = [];
  snap.forEach(d => _allPaintings.push({ id: d.id, ...d.data() }));

  renderPaintingsTable();
}

function sortPaintingsBy(col) {
  if (_paintSort.col === col) {
    _paintSort.dir = _paintSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _paintSort = { col, dir: col === 'year' || col === 'price' ? 'desc' : 'asc' };
  }
  renderPaintingsTable();
}

function renderPaintingsTable() {
  const tbody = document.getElementById('paintings-body');

  // Only show paintings that are visible on website (visible=true or no visible field yet)
  const visible = _allPaintings.filter(p => p.visible !== false);

  // Sort
  const { col, dir } = _paintSort;
  const sorted = [...visible].sort((a, b) => {
    let va, vb;
    if (col === 'title')  { va = (a.titleNl || '').toLowerCase(); vb = (b.titleNl || '').toLowerCase(); }
    if (col === 'year')   { va = a.year  || 0; vb = b.year  || 0; }
    if (col === 'price')  { va = a.price || 0; vb = b.price || 0; }
    if (col === 'status') { va = a.status || ''; vb = b.status || ''; }
    if (va < vb) return dir === 'asc' ? -1 :  1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });

  // Update column header arrows
  ['title','year','price','status'].forEach(c => {
    const el = document.getElementById('sort-' + c);
    if (!el) return;
    el.classList.toggle('sort-active', _paintSort.col === c);
    const arrow = el.querySelector('.sort-arrow');
    if (arrow) {
      arrow.textContent = _paintSort.col === c
        ? (_paintSort.dir === 'asc' ? '↑' : '↓') : '';
    }
  });

  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">Geen zichtbare schilderijen. Activeer schilderijen via het OVERZICHT.</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map(p => `
    <tr>
      <td><img class="thumb" src="${p.imageUrl || ''}" alt=""></td>
      <td>
        <strong>${p.titleNl || '-'}</strong>
        ${p.titleEn ? `<br><span class="sub">${p.titleEn}</span>` : ''}
      </td>
      <td>${p.year || '-'}</td>
      <td>${p.price ? formatPrice(p.price) : '-'}</td>
      <td><span class="status-badge status-${p.status || 'available'}">${statusLabel(p.status)}</span></td>
      <td class="center">${p.showInHero     ? '✓' : ''}</td>
      <td class="center">${p.showInFeatured ? '✓' : ''}</td>
      <td><button class="btn btn-sm" onclick="openModal('${p.id}')">Bewerken</button></td>
    </tr>`).join('');
}

function statusLabel(s) {
  return { available: 'Beschikbaar', reserved: 'Gereserveerd', sold: 'Verkocht' }[s] || s;
}

window.loadPaintings     = loadPaintings;
window.sortPaintingsBy   = sortPaintingsBy;

// ─────────────────────────────────────────────────────────────────────────────
// OVERZICHT - kaartgrid van ALLE schilderijen, ook niet-zichtbare
// ─────────────────────────────────────────────────────────────────────────────
let _ovSort = { col: 'year', dir: 'desc' };

async function loadOverzicht() {
  const { db, collection, getDocs } = fb();
  const grid  = document.getElementById('overzicht-grid');
  const count = document.getElementById('overzicht-count');
  grid.innerHTML = '<p class="loading-cell">Laden…</p>';

  // Use cached paintings if available, otherwise fetch
  if (!_allPaintings.length) {
    const snap = await getDocs(collection(db, 'paintings'));
    _allPaintings = [];
    snap.forEach(d => _allPaintings.push({ id: d.id, ...d.data() }));
  }

  // Sort by year descending by default
  const sorted = [..._allPaintings].sort((a, b) => (b.year || 0) - (a.year || 0));

  if (count) count.textContent = `${sorted.length} schilderijen totaal -  ${sorted.filter(p => p.visible !== false).length} zichtbaar op website.`;

  if (!sorted.length) {
    grid.innerHTML = '<p class="loading-cell">Nog geen schilderijen.</p>';
    return;
  }

  const isEn = adminLang === 'en';
  grid.innerHTML = sorted.map(p => {
    const title   = isEn ? (p.titleEn || p.titleNl || '-') : (p.titleNl || '-');
    const story   = isEn ? (p.storyEn || p.storyNl || '') : (p.storyNl || '');
    const isVis   = p.visible !== false;
    const metaParts = [p.year, p.size, p.technique].filter(Boolean);

    return `
    <div class="ov-card ${isVis ? '' : 'not-visible'}" id="ov-card-${p.id}">
      <div class="ov-card-img">
        <img src="${p.imageUrl || ''}" alt="${title}" loading="lazy">
        <span class="ov-card-badge ${isVis ? 'visible-on' : ''}">
          ${isVis ? 'Zichtbaar' : 'Verborgen'}
        </span>
      </div>
      <div class="ov-card-body">
        <div class="ov-card-title">${title}</div>
        <div class="ov-card-meta">${metaParts.join(' · ')}</div>
        <div class="ov-card-actions">
          <button class="ov-visible-toggle ${isVis ? 'on' : ''}"
            onclick="toggleVisible('${p.id}', this)"
            title="${isVis ? 'Verbergen van website' : 'Tonen op website'}">
            ${isVis ? '✓ Zichtbaar' : '+ Zichtbaar maken'}
          </button>
          <button class="btn btn-sm" onclick="openModal('${p.id}')">Bewerken</button>
          <button class="btn btn-sm" onclick="toggleOvDetails('${p.id}')">Details</button>
        </div>
      </div>
      <div class="ov-details" id="ov-details-${p.id}">
        <div class="ov-detail-row"><span class="ov-detail-label">Jaar</span><span>${p.year || '-'}</span></div>
        <div class="ov-detail-row"><span class="ov-detail-label">Prijs</span><span>${p.price ? formatPrice(p.price) : '-'}</span></div>
        <div class="ov-detail-row"><span class="ov-detail-label">Afmetingen</span><span>${p.size || '-'}</span></div>
        <div class="ov-detail-row"><span class="ov-detail-label">Techniek</span><span>${p.technique || '-'}</span></div>
        <div class="ov-detail-row"><span class="ov-detail-label">Status</span><span>${statusLabel(p.status)}</span></div>
        ${story ? `
        <div class="ov-story">
          <div class="ov-story-label">Verhaal (${isEn ? 'EN' : 'NL'})</div>
          <p>${story}</p>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function toggleVisible(id, btn) {
  const painting = _allPaintings.find(p => p.id === id);
  if (!painting) return;

  const newVal = painting.visible === false; // toggle: false -> true, true/undefined -> false
  painting.visible = newVal;

  const { db, doc, updateDoc } = fb();
  await updateDoc(doc(db, 'paintings', id), { visible: newVal });

  // Update card UI
  const card = document.getElementById('ov-card-' + id);
  if (card) {
    card.classList.toggle('not-visible', !newVal);
    const badge = card.querySelector('.ov-card-badge');
    if (badge) {
      badge.textContent = newVal ? 'Zichtbaar' : 'Verborgen';
      badge.classList.toggle('visible-on', newVal);
    }
  }
  btn.classList.toggle('on', newVal);
  btn.textContent = newVal ? '✓ Zichtbaar' : '+ Zichtbaar maken';

  // Update count
  const count = document.getElementById('overzicht-count');
  if (count) count.textContent = `${_allPaintings.length} schilderijen totaal -  ${_allPaintings.filter(p => p.visible !== false).length} zichtbaar op website.`;

  showToast(newVal ? 'Schilderij zichtbaar op website.' : 'Schilderij verborgen van website.');

  // Refresh SCHILDERIJEN table if it's been loaded
  renderPaintingsTable();
}

function toggleOvDetails(id) {
  const el = document.getElementById('ov-details-' + id);
  if (el) el.classList.toggle('open');
}

window.loadOverzicht    = loadOverzicht;
window.toggleVisible    = toggleVisible;
window.toggleOvDetails  = toggleOvDetails;

// ─────────────────────────────────────────────────────────────────────────────
// SCHILDERIJ MODAL - toevoegen / bewerken
// ─────────────────────────────────────────────────────────────────────────────
let _modalPaintingId = null;
let _currentImageUrl  = null;
let _currentPublicId  = null;

function openModal(id) {
  _modalPaintingId = id || null;
  const modal      = document.getElementById('painting-modal');
  const title      = document.getElementById('modal-title');
  const deleteBtn  = document.getElementById('btn-delete');

  modal.classList.add('open');

  if (id) {
    title.textContent      = 'Schilderij bewerken';
    deleteBtn.style.display = 'inline-flex';
    _loadIntoModal(id);
  } else {
    title.textContent      = 'Nieuw schilderij';
    deleteBtn.style.display = 'none';
    _clearModal();
  }
}

function closeModal() {
  document.getElementById('painting-modal').classList.remove('open');
  _modalPaintingId = null;
  _currentImageUrl  = null;
  _currentPublicId  = null;
}

function _clearModal() {
  ['pm-id','pm-title-nl','pm-title-en','pm-year','pm-price',
   'pm-size','pm-technique','pm-story-nl','pm-story-en','pm-tags']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('pm-status').value          = 'available';
  document.getElementById('pm-show-hero').checked     = false;
  document.getElementById('pm-show-featured').checked = false;
  document.getElementById('pm-visible').checked       = false;
  document.getElementById('pm-image').value           = '';
  _setPreview(null);
  _resetProgress();
}

async function _loadIntoModal(id) {
  const { db, doc, getDoc } = fb();
  const snap = await getDoc(doc(db, 'paintings', id));
  if (!snap.exists()) return;
  const p = snap.data();

  document.getElementById('pm-title-nl').value  = p.titleNl   || '';
  document.getElementById('pm-title-en').value  = p.titleEn   || '';
  document.getElementById('pm-year').value       = p.year      || '';
  document.getElementById('pm-price').value      = p.price     || '';
  document.getElementById('pm-size').value       = p.size      || '';
  document.getElementById('pm-technique').value  = p.technique || '';
  document.getElementById('pm-story-nl').value   = p.storyNl   || '';
  document.getElementById('pm-story-en').value   = p.storyEn   || '';
  document.getElementById('pm-tags').value       = (p.tags || []).join(', ');
  document.getElementById('pm-status').value          = p.status    || 'available';
  document.getElementById('pm-show-hero').checked     = !!p.showInHero;
  document.getElementById('pm-show-featured').checked = !!p.showInFeatured;
  // visible defaults to true for existing paintings without the field
  document.getElementById('pm-visible').checked       = p.visible !== false;

  _currentImageUrl = p.imageUrl  || null;
  _currentPublicId  = p.publicId || null;
  _setPreview(_currentImageUrl);
}

function _setPreview(url) {
  const wrap = document.getElementById('img-preview-wrap');
  const img  = document.getElementById('img-preview');
  if (url) {
    img.src               = url;
    wrap.style.display    = 'block';
  } else {
    wrap.style.display    = 'none';
    img.src               = '';
  }
}

// Live preview bij bestandsselectie
document.getElementById('pm-image')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) _setPreview(URL.createObjectURL(file));
});

function _resetProgress() {
  const bar = document.getElementById('upload-progress');
  if (bar) { bar.style.display = 'none'; bar.value = 0; }
}

function _setProgress(pct) {
  const bar = document.getElementById('upload-progress');
  if (!bar) return;
  bar.style.display = 'block';
  bar.value         = pct;
}

async function savePainting() {
  const saveBtn = document.getElementById('btn-save');
  setLoading(saveBtn, true);

  try {
    const { db, doc, addDoc, updateDoc, collection, serverTimestamp } = fb();
    const fileInput = document.getElementById('pm-image');
    let imageUrl    = _currentImageUrl;
    let publicId    = _currentPublicId;

    // Upload naar Cloudinary als er een nieuw bestand is gekozen
    if (fileInput.files[0]) {
      showToast('Afbeelding uploaden…', 'info');
      const result = await uploadToCloudinary(fileInput.files[0], pct => _setProgress(pct));
      imageUrl = result.url;
      publicId  = result.publicId;
    }

    if (!imageUrl) {
      showToast('Voeg een afbeelding toe.', 'err');
      setLoading(saveBtn, false);
      return;
    }

    const tags = document.getElementById('pm-tags').value
      .split(',').map(t => t.trim()).filter(Boolean);

    const showInHero     = document.getElementById('pm-show-hero').checked;
    const showInFeatured = document.getElementById('pm-show-featured').checked;
    const visible        = document.getElementById('pm-visible').checked;

    const data = {
      titleNl:        document.getElementById('pm-title-nl').value.trim(),
      titleEn:        document.getElementById('pm-title-en').value.trim(),
      year:           document.getElementById('pm-year').value.trim(),
      price:          Number(document.getElementById('pm-price').value) || 0,
      size:           document.getElementById('pm-size').value.trim(),
      technique:      document.getElementById('pm-technique').value.trim(),
      storyNl:        document.getElementById('pm-story-nl').value.trim(),
      storyEn:        document.getElementById('pm-story-en').value.trim(),
      tags,
      status:         document.getElementById('pm-status').value,
      showInHero,
      showInFeatured,
      visible,
      // Keep legacy 'featured' field in sync for backwards compat
      featured:       showInHero || showInFeatured,
      imageUrl,
      publicId,
      updatedAt: serverTimestamp()
    };

    if (_modalPaintingId) {
      await updateDoc(doc(db, 'paintings', _modalPaintingId), data);
      showToast('Schilderij bijgewerkt.');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'paintings'), data);
      showToast('Schilderij toegevoegd.');
    }

    closeModal();
    loadPaintings();

  } catch (e) {
    showToast('Fout: ' + e.message, 'err');
  } finally {
    setLoading(saveBtn, false);
    _resetProgress();
  }
}

async function deletePainting() {
  if (!_modalPaintingId) return;
  if (!confirm('Schilderij definitief verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;

  const { db, doc, deleteDoc } = fb();
  await deleteDoc(doc(db, 'paintings', _modalPaintingId));
  showToast('Schilderij verwijderd.');
  closeModal();
  loadPaintings();
}

window.openModal      = openModal;
window.closeModal     = closeModal;
window.savePainting   = savePainting;
window.deletePainting = deletePainting;

// ─────────────────────────────────────────────────────────────────────────────
// BERICHTEN
// ─────────────────────────────────────────────────────────────────────────────
async function loadMessages() {
  const { db, collection, getDocs, query, orderBy } = fb();
  const list = document.getElementById('messages-list');
  list.innerHTML = '<p class="loading-cell">Laden…</p>';

  const snap = await getDocs(query(collection(db, 'messages'), orderBy('createdAt', 'desc')));
  const msgs = [];
  snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));

  if (!msgs.length) {
    list.innerHTML = '<p class="empty-note">Geen berichten ontvangen.</p>';
    return;
  }

  list.innerHTML = msgs.map(m => {
    const isEnquiry = m.type === 'enquiry';
    const replySubject = isEnquiry
      ? encodeURIComponent('Re: Aanvraag schilderijen')
      : encodeURIComponent('Re: ' + (m.subject || 'Uw bericht'));
    return `
    <div class="message-card ${m.read ? '' : 'unread'}">
      <div class="message-card-header">
        <div>
          <strong>${isEnquiry ? '📋 Aanvraag' : '✉ Contactbericht'}</strong>
          ${!m.read ? '<span class="new-badge">Nieuw</span>' : ''}
        </div>
        <span class="msg-date">${_formatDate(m.createdAt)}</span>
      </div>
      <div class="message-details">
        ${m.name    ? `<div class="message-detail-row"><span class="detail-label">Naam</span><span>${m.name}</span></div>` : ''}
        ${m.email   ? `<div class="message-detail-row"><span class="detail-label">E-mail</span><a href="mailto:${m.email}">${m.email}</a></div>` : ''}
        ${m.phone   ? `<div class="message-detail-row"><span class="detail-label">Telefoon</span><a href="tel:${m.phone}">${m.phone}</a></div>` : ''}
        ${m.subject ? `<div class="message-detail-row"><span class="detail-label">Onderwerp</span><span>${m.subject}</span></div>` : ''}
      </div>
      ${isEnquiry && m.titles ? `
        <div class="message-paintings">
          <span class="detail-label">Werken</span>
          <span>${m.titles}</span>
          ${m.total ? `<span class="message-total">${formatPrice(m.total)}</span>` : ''}
        </div>` : ''}
      ${m.message ? `<div class="message-body">${m.message}</div>` : ''}
      ${m.note    ? `<div class="message-body" style="font-style:italic;color:var(--muted)">Opmerking: ${m.note}</div>` : ''}
      <div class="message-actions">
        ${m.email ? `<a class="btn btn-sm" href="mailto:${m.email}?subject=${replySubject}">Beantwoorden</a>` : ''}
        <button class="btn btn-sm btn-danger" onclick="deleteMessage('${m.id}')">Verwijderen</button>
        ${!m.read ? `<button class="btn btn-sm" onclick="markRead('${m.id}', this)">Markeer gelezen</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function _formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('nl-NL', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

async function deleteMessage(id) {
  if (!confirm('Bericht verwijderen?')) return;
  const { db, doc, deleteDoc } = fb();
  await deleteDoc(doc(db, 'messages', id));
  loadMessages();
}

async function markRead(id, btn) {
  const { db, doc, updateDoc } = fb();
  await updateDoc(doc(db, 'messages', id), { read: true });
  btn.closest('.message-card').classList.remove('unread');
  btn.remove();
}

window.loadMessages  = loadMessages;
window.deleteMessage = deleteMessage;
window.markRead      = markRead;

// ─────────────────────────────────────────────────────────────────────────────
// OVER MIJ
// Bio fields are stored per language: bio1/bio2 (NL) and bio1En/bio2En (EN).
// Photos and email are language-independent.
// ─────────────────────────────────────────────────────────────────────────────
async function loadAbout() {
  const { db, doc, getDoc } = fb();
  const isEn = adminLang === 'en';

  // Update field labels to reflect current language
  const b1label = document.getElementById('about-bio1-label');
  const b2label = document.getElementById('about-bio2-label');
  if (b1label) b1label.textContent = isEn ? 'Biography - paragraph 1 (EN)' : 'Biografie - alinea 1 (NL)';
  if (b2label) b2label.textContent = isEn ? 'Biography - paragraph 2 (EN)' : 'Biografie - alinea 2 (NL)';

  try {
    const snap = await getDoc(doc(db, 'settings', 'about'));
    if (!snap.exists()) return;
    const data = snap.data();

    // Language-independent fields (only set when showing NL to avoid overwriting)
    if (!isEn) {
      document.getElementById('about-photo-url').value  = data.photoUrl        || '';
      document.getElementById('about-email').value      = data.email           || '';
      document.getElementById('atelier-photo-url').value = data.atelierPhotoUrl || '';
    }

    // Language-dependent bio fields
    document.getElementById('about-bio1').value = isEn ? (data.bio1En || '') : (data.bio1 || '');
    document.getElementById('about-bio2').value = isEn ? (data.bio2En || '') : (data.bio2 || '');

  } catch {}
}

async function saveAbout() {
  const { db, doc, setDoc } = fb();
  const saveBtn = document.getElementById('btn-save-about');
  const isEn    = adminLang === 'en';
  setLoading(saveBtn, true, 'Opslaan');

  const bio1val = document.getElementById('about-bio1').value.trim();
  const bio2val = document.getElementById('about-bio2').value.trim();

  if (isEn) {
    // EN: only save EN bio fields, leave everything else untouched
    await setDoc(doc(db, 'settings', 'about'), { bio1En: bio1val, bio2En: bio2val }, { merge: true });
  } else {
    // NL: save all fields including photos
    const photoUrl        = await _resolvePhoto('about-photo-file',   'about-photo-url',   saveBtn);
    const atelierPhotoUrl = await _resolvePhoto('atelier-photo-file', 'atelier-photo-url', saveBtn);
    await setDoc(doc(db, 'settings', 'about'), {
      photoUrl,
      bio1: bio1val,
      bio2: bio2val,
      email:          document.getElementById('about-email').value.trim(),
      atelierPhotoUrl
    }, { merge: true });
  }

  showToast('"Over mij" opgeslagen.');
  setLoading(saveBtn, false, 'Opslaan');
}

/** Upload a file from fileInputId, or return existing URL from urlInputId */
async function _resolvePhoto(fileInputId, urlInputId, btn) {
  const fileInput = document.getElementById(fileInputId);
  const existingUrl = document.getElementById(urlInputId)?.value.trim() || '';
  if (fileInput?.files[0]) {
    setLoading(btn, true, 'Opslaan');
    showToast('Foto uploaden…', 'info');
    const result = await uploadToCloudinary(fileInput.files[0], () => {});
    return result.url;
  }
  return existingUrl;
}

window.loadAbout = loadAbout;
window.saveAbout = saveAbout;

// ─────────────────────────────────────────────────────────────────────────────
// TEKSTEN
// Reads all fields from settings/texts and renders them as editable fields.
// The field key is used as the label. Any new key added in Firestore
// automatically appears here on next load - no code changes needed.
// ─────────────────────────────────────────────────────────────────────────────

// Human-readable labels for known keys. Unknown keys show the key itself.
const TEXT_LABELS = {
  'hero.eyebrow':         'Hero - bovenkopje (klein)',
  'hero.title1':          'Hero - titel regel 1',
  'hero.title2':          'Hero - titel regel 2 (cursief)',
  'hero.sub':             'Hero - ondertitel',
  'quote.text':           'Citaat (homepage)',
  'footer.desc':          'Footer - beschrijving',
  'contact.eyebrow':      'Contact - bovenkopje',
  'contact.title':        'Contact - koptitel',
  'contact.desc':         'Contact - beschrijving',
  'contact.note':         'Contact - galerijtip',
  'atelier.eyebrow':      'Atelier - bovenkopje',
  'atelier.title1':       'Atelier - koptitel regel 1',
  'atelier.title2':       'Atelier - koptitel regel 2 (cursief)',
  'atelier.body1':        'Atelier - alinea 1',
  'atelier.body2':        'Atelier - alinea 2',
  'atelier.chip1':        'Atelier - chip 1 (techniek-label)',
  'atelier.chip2':        'Atelier - chip 2',
  'atelier.chip3':        'Atelier - chip 3',
  'atelier.chip4':        'Atelier - chip 4',
  'atelier.step1.title':  'Atelier - stap 1 naam',
  'atelier.step1.desc':   'Atelier - stap 1 beschrijving',
  'atelier.step2.title':  'Atelier - stap 2 naam',
  'atelier.step2.desc':   'Atelier - stap 2 beschrijving',
  'atelier.step3.title':  'Atelier - stap 3 naam',
  'atelier.step3.desc':   'Atelier - stap 3 beschrijving',
  'atelier.step4.title':  'Atelier - stap 4 naam',
  'atelier.step4.desc':   'Atelier - stap 4 beschrijving',
};

const TEXT_DEFAULTS = {
  'hero.eyebrow':         'Klassieke Schilderkunst · Olieverf op Doek',
  'hero.title1':          'Schilderijen die',
  'hero.title2':          'het licht bewaren',
  'hero.sub':             'Een oeuvre van meer dan honderd werken in de traditie van de Hollandse Meesters. Elk doek vertelt een verhaal van licht, stilte en ambacht.',
  'quote.text':           '"Licht is niet wat het schilderij verlicht - licht ís het schilderij."',
  'footer.desc':          'Klassieke schilderkunst in de traditie van de Hollandse Meesters. Olieverf op doek, met aandacht voor licht, compositie en vakmanschap.',
  'contact.eyebrow':      'In contact komen',
  'contact.title':        'Interesse in een werk, of een opdracht?',
  'contact.desc':         'Ik ga graag met u in gesprek over mijn werk, mogelijkheden voor aankoop of het realiseren van een persoonlijk schilderij in opdracht. Vul het formulier in en ik reageer binnen enkele dagen.',
  'contact.note':         'Heeft u al een werk op het oog? Voeg het toe aan uw selectie vanuit de galerij voor een gerichte aanvraag.',
  'atelier.eyebrow':      'De kunstenaar aan het werk',
  'atelier.title1':       'Ambacht in een',
  'atelier.title2':       'tijdperk van snelheid',
  'atelier.body1':        'In het atelier ruikt het naar lijnzaadolie en terpentijn. Op een met gesso voorbereid linnen doek begint elk schilderij met een dunne imprimatura - een warme bruintint die het licht al van binnenuit laat gloeien voordat er ook maar een echte kleur op het doek zit.',
  'atelier.body2':        'W.H. Rodenhuis werkt in lagen, zoals de meesters van de Gouden Eeuw dat deden. Dode verf, kleuren, glacis. Het duurt soms weken voor een werk klaar is - en dat is precies de bedoeling. Geduld is de kern van het ambacht.',
  'atelier.chip1':        'Olieverf op linnen',
  'atelier.chip2':        'Klassieke lagentechniek',
  'atelier.chip3':        'Hollandse Meesters',
  'atelier.chip4':        'Licht & schaduw',
  'atelier.step1.title':  'Imprimatura',
  'atelier.step1.desc':   'Warme ondertoon die het licht stuurt',
  'atelier.step2.title':  'Dode verf',
  'atelier.step2.desc':   'Vorm en volume in grijstonen',
  'atelier.step3.title':  'Kleuren',
  'atelier.step3.desc':   'Rijke pigmenten, opgebouwd in lagen',
  'atelier.step4.title':  'Glacis',
  'atelier.step4.desc':   'Transparante afwerklagen voor diepte en glans',
};

// English default values (from i18n.js EN translations)
const TEXT_DEFAULTS_EN = {
  'hero.eyebrow':         'Classical Painting · Oil on Canvas',
  'hero.title1':          'Paintings that',
  'hero.title2':          'preserve the light',
  'hero.sub':             'A body of over one hundred works in the tradition of the Dutch Masters. Each canvas tells a story of light, silence, and craftsmanship.',
  'quote.text':           '"Light is not what illuminates the painting - light is the painting."',
  'footer.desc':          'Classical painting in the tradition of the Dutch Masters. Oil on canvas, with attention to light, composition, and craftsmanship.',
  'contact.eyebrow':      'Get in touch',
  'contact.title':        'Interested in a work, or a commission?',
  'contact.desc':         'I am happy to discuss my work, purchase options, or the creation of a personal commissioned painting. Fill in the form and I will respond within a few days.',
  'contact.note':         'Already have a work in mind? Add it to your selection from the gallery for a focused enquiry.',
  'atelier.eyebrow':      'The artist at work',
  'atelier.title1':       'Craftsmanship in an',
  'atelier.title2':       'age of speed',
  'atelier.body1':        'The studio smells of linseed oil and turpentine. On a gesso-prepared linen canvas, every painting begins with a thin imprimatura - a warm brown tone that makes the light glow from within before a single real colour touches the surface.',
  'atelier.body2':        'W.H. Rodenhuis works in layers, as the masters of the Golden Age did. Dead colour, glazes, scumbles. A work can take weeks to complete - and that is precisely the point. Patience is the heart of the craft.',
  'atelier.chip1':        'Oil on linen',
  'atelier.chip2':        'Classical layering technique',
  'atelier.chip3':        'Dutch Masters tradition',
  'atelier.chip4':        'Light & shadow',
  'atelier.step1.title':  'Imprimatura',
  'atelier.step1.desc':   'Warm undertone that guides the light',
  'atelier.step2.title':  'Dead colour',
  'atelier.step2.desc':   'Form and volume in grey tones',
  'atelier.step3.title':  'Colour',
  'atelier.step3.desc':   'Rich pigments, built up in layers',
  'atelier.step4.title':  'Glazes',
  'atelier.step4.desc':   'Transparent finishing layers for depth and luminosity',
};

async function loadTexts() {
  const { db, doc, getDoc } = fb();
  const editor = document.getElementById('texts-editor');
  const isEn   = adminLang === 'en';
  editor.innerHTML = '<p class="loading-cell">Laden…</p>';

  const defaults = isEn ? TEXT_DEFAULTS_EN : TEXT_DEFAULTS;
  let data = { ...defaults };
  try {
    const docId = isEn ? 'texts_en' : 'texts';
    const snap  = await getDoc(doc(db, 'settings', docId));
    if (snap.exists()) data = { ...defaults, ...snap.data() };
  } catch {}

  const langLabel = isEn ? 'English (EN)' : 'Nederlands (NL)';
  editor.innerHTML = `
    <div class="alert alert-info" style="margin-bottom:1.5rem">
      U bewerkt nu de <strong>${langLabel}</strong> teksten.
      Wissel via de NL/EN knop bovenin.
    </div>` +
    Object.entries(data).map(([key, value]) => {
      const label   = TEXT_LABELS[key] || key;
      const isLong  = String(value).length > 80 || String(value).includes('\n');
      const safeVal = String(value).replace(/"/g, '&quot;');
      const inputHtml = isLong
        ? `<textarea class="form-control" id="txt-${key}" rows="3">${value}</textarea>`
        : `<input class="form-control" type="text" id="txt-${key}" value="${safeVal}">`;
      return `
        <div class="form-group" style="margin-bottom:1.25rem">
          <label style="font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:0.4rem">
            ${label}
          </label>
          ${inputHtml}
        </div>`;
    }).join('');
}

async function saveTexts() {
  const { db, doc, setDoc } = fb();
  const editor = document.getElementById('texts-editor');
  const isEn   = adminLang === 'en';
  const docId  = isEn ? 'texts_en' : 'texts';

  const data = {};
  editor.querySelectorAll('[id^="txt-"]').forEach(el => {
    data[el.id.replace('txt-', '')] = el.value.trim();
  });

  await setDoc(doc(db, 'settings', docId), data, { merge: true });
  showToast(`Teksten (${isEn ? 'EN' : 'NL'}) opgeslagen.`);
}

window.loadTexts  = loadTexts;
window.saveTexts  = saveTexts;

// ─────────────────────────────────────────────────────────────────────────────
// INITIALISATIE
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const waitForFb = () => {
    try { fb(); initAuth(); }
    catch { setTimeout(waitForFb, 400); }
  };
  setTimeout(waitForFb, 300);
});
