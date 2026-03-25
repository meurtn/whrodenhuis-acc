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
// TABBLADEN
// ─────────────────────────────────────────────────────────────────────────────
function showTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');

  if (tab === 'messages') loadMessages();
  if (tab === 'about')    loadAbout();
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
// SCHILDERIJEN - OVERZICHT
// ─────────────────────────────────────────────────────────────────────────────
async function loadPaintings() {
  const { db, collection, getDocs } = fb();
  const tbody = document.getElementById('paintings-body');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Laden…</td></tr>';

  const snap = await getDocs(collection(db, 'paintings'));
  const paintings = [];
  snap.forEach(d => paintings.push({ id: d.id, ...d.data() }));

  // Sorteren: nieuwste eerst op basis van year
  paintings.sort((a, b) => (b.year || 0) - (a.year || 0));

  if (!paintings.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Nog geen schilderijen.</td></tr>';
    return;
  }

  tbody.innerHTML = paintings.map(p => `
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
      <td>
        <button class="btn btn-sm" onclick="openModal('${p.id}')">Bewerken</button>
      </td>
    </tr>`).join('');
}

function statusLabel(s) {
  return { available: 'Beschikbaar', reserved: 'Gereserveerd', sold: 'Verkocht' }[s] || s;
}

window.loadPaintings = loadPaintings;

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

  list.innerHTML = msgs.map(m => `
    <div class="message-card ${m.read ? '' : 'unread'}">
      <div class="message-card-header">
        <div>
          <strong>${m.type === 'enquiry' ? '📋 Aanvraag' : '✉ Contactbericht'}</strong>
          ${!m.read ? '<span class="new-badge">Nieuw</span>' : ''}
        </div>
        <span class="msg-email">${m.email || ''}</span>
      </div>
      <div class="message-meta">${m.name || '-'} · ${_formatDate(m.createdAt)}</div>
      ${m.subject ? `<div class="message-subject">${m.subject}</div>` : ''}
      <div class="message-body">${m.message || ('Schilderijen: ' + (m.titles || ''))}</div>
      ${m.total ? `<div class="message-total">Totaal: ${formatPrice(m.total)}</div>` : ''}
      <div class="message-actions">
        <a class="btn btn-sm" href="mailto:${m.email}?subject=Re: ${encodeURIComponent(m.subject || 'Uw bericht')}">
          Beantwoorden
        </a>
        <button class="btn btn-sm btn-danger" onclick="deleteMessage('${m.id}')">Verwijderen</button>
        ${!m.read ? `<button class="btn btn-sm" onclick="markRead('${m.id}', this)">Markeer gelezen</button>` : ''}
      </div>
    </div>`).join('');
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
// ─────────────────────────────────────────────────────────────────────────────
async function loadAbout() {
  const { db, doc, getDoc } = fb();
  try {
    const snap = await getDoc(doc(db, 'settings', 'about'));
    if (!snap.exists()) return;
    const data = snap.data();
    document.getElementById('about-photo-url').value = data.photoUrl || '';
    document.getElementById('about-bio1').value      = data.bio1     || '';
    document.getElementById('about-bio2').value      = data.bio2     || '';
    document.getElementById('about-email').value     = data.email    || '';
  } catch {}
}

async function saveAbout() {
  const { db, doc, setDoc } = fb();
  const saveBtn = document.getElementById('btn-save-about');

  // Optioneel: foto uploaden via Cloudinary
  const fileInput = document.getElementById('about-photo-file');
  let photoUrl = document.getElementById('about-photo-url').value.trim();

  if (fileInput?.files[0]) {
    setLoading(saveBtn, true, 'Opslaan');
    showToast('Foto uploaden…', 'info');
    const result = await uploadToCloudinary(fileInput.files[0], () => {});
    photoUrl = result.url;
  }

  const data = {
    photoUrl,
    bio1:  document.getElementById('about-bio1').value.trim(),
    bio2:  document.getElementById('about-bio2').value.trim(),
    email: document.getElementById('about-email').value.trim()
  };

  await setDoc(doc(db, 'settings', 'about'), data, { merge: true });
  showToast('"Over mij" opgeslagen.');
  setLoading(saveBtn, false, 'Opslaan');
}

window.loadAbout = loadAbout;
window.saveAbout = saveAbout;

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
