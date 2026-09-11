(() => {
  'use strict';

  const LANG_KEY = 'mRfqLanguage';
  const state=()=>API.state(), save=next=>API.save(next), session=()=>API.session();
  const setSession=()=>{}; // Sessions are owned by the server, never by browser state.
  function language() { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ar'; }
  function tr(ar, en) { return language() === 'ar' ? ar : en; }
  function applyLanguage(lang) {
    lang = lang === 'en' ? 'en' : 'ar';
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-ar][data-en]').forEach(el => { el.textContent = el.dataset[lang]; });
    document.querySelectorAll('[data-lang]').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
    applySettings();
  }
  function applySettings() {
    const settings = state().settings || {};
    const suffix = language() === 'ar' ? 'Ar' : 'En';
    document.querySelectorAll('[data-setting]').forEach(el => {
      const value = settings[`${el.dataset.setting}${suffix}`];
      if (value) el.textContent = value;
    });
    document.querySelectorAll('.brand-mark').forEach(mark => {
      if (settings.logo) {
        mark.textContent = ''; mark.style.backgroundImage = `url("${settings.logo}")`;
        mark.style.backgroundSize = 'contain'; mark.style.backgroundPosition = 'center'; mark.style.backgroundRepeat = 'no-repeat'; mark.style.backgroundColor = 'white';
      } else { mark.textContent = settings.logoText || 'M'; mark.style.backgroundImage = ''; }
    });
  }
  function bindLanguage() {
    document.querySelectorAll('[data-lang]').forEach(btn => btn.addEventListener('click', () => applyLanguage(btn.dataset.lang)));
    applyLanguage(language());
  }
  function requireRole(role) {
    const current = session();
    if (!current || current.role !== role || state().accounts.find(a=>a.id===current.id)?.deletedAt) {
      const next = encodeURIComponent(location.pathname.split('/').pop() || `${role}.html`);
      location.replace(`login.html?role=${role}&next=${next}`);
      return null;
    }
    return current;
  }
  async function logout() { await API.request('auth/logout',{}); location.href = 'index.html'; }
  function bindLogout() { document.querySelectorAll('[data-logout]').forEach(btn => btn.addEventListener('click', logout)); }
  function fillUser(current, roleAr, roleEn) {
    document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = current?.name || tr('حسابي','My account'); });
    document.querySelectorAll('[data-user-role]').forEach(el => {
      el.dataset.ar = roleAr; el.dataset.en = roleEn; el.textContent = tr(roleAr, roleEn);
    });
    document.querySelectorAll('[data-avatar]').forEach(el => { el.textContent = (current?.name || 'M').trim().charAt(0).toUpperCase(); });
  }
  function toast(arTitle, enTitle, arText, enText) {
    let box = document.querySelector('#toast');
    if (!box) {
      box = document.createElement('div'); box.id = 'toast'; box.className = 'toast';
      box.innerHTML = '<span class="toast-icon">✓</span><div><strong></strong><span></span></div>';
      document.body.append(box);
    }
    box.querySelector('strong').textContent = tr(arTitle, enTitle);
    box.querySelector('div span').textContent = tr(arText, enText);
    box.classList.add('show'); clearTimeout(box._timer);
    box._timer = setTimeout(() => box.classList.remove('show'), 3300);
  }
  function openDialog(id) { document.getElementById(id)?.classList.remove('hidden'); }
  function closeDialog(id) { document.getElementById(id)?.classList.add('hidden'); }
  function bindDialogs() {
    document.querySelectorAll('[data-open-dialog]').forEach(btn => btn.addEventListener('click', () => openDialog(btn.dataset.openDialog)));
    document.querySelectorAll('[data-close-dialog]').forEach(btn => btn.addEventListener('click', () => closeDialog(btn.dataset.closeDialog)));
    document.querySelectorAll('.dialog-backdrop').forEach(bg => bg.addEventListener('mousedown', e => { if (e.target === bg) closeDialog(bg.id); }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.dialog-backdrop:not(.hidden)').forEach(d => closeDialog(d.id)); });
  }
  function containsContact(text) {
    return /(?:\+?\d[\d\s-]{7,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|(?:whats|wechat|telegram))/i.test(text || '');
  }
  function imageData(file, maxSize = 1200, quality = .82) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        image.onerror = () => resolve(reader.result); image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function setupImages(inputId, previewId, onChange, max = 5) {
    const input = document.getElementById(inputId), preview = document.getElementById(previewId);
    let images = [];
    if (!input || !preview) return { get: () => images, reset: () => {} };
    const render = () => {
      preview.innerHTML = images.map((src, i) => `<div class="preview-tile" data-main-label="${tr('الرئيسية','Main')}"><img src="${src}" alt=""><button type="button" class="remove-image" data-index="${i}" aria-label="Remove">×</button></div>`).join('') || `<div class="image-limit-note">${tr('لم تُضف صور بعد','No images added yet')}</div>`;
      preview.querySelectorAll('.remove-image').forEach(btn => btn.addEventListener('click', () => { images.splice(Number(btn.dataset.index),1); render(); onChange?.(images); }));
    };
    input.addEventListener('change', async () => {
      for (const file of [...input.files].slice(0, max - images.length)) {
        if (!file.type.startsWith('image/')) continue;
        images.push(await imageData(file)); render(); onChange?.(images);
      }
      input.value = '';
    });
    render();
    return { get: () => [...images], reset: () => { images = []; render(); } };
  }
  function imageGallery(images = []) {
    if (!images.length) return '<div class="market-gallery"><span class="market-main-image placeholder">M</span><div class="market-thumbs"><span class="market-thumb placeholder">M</span><span class="market-thumb placeholder">M</span><span class="market-thumb placeholder">M</span></div></div>';
    const thumbs = images.slice(1,4).map(src => `<img class="market-thumb" src="${src}" alt="">`).join('');
    return `<div class="market-gallery"><img class="market-main-image" src="${images[0]}" alt=""><div class="market-thumbs">${thumbs}</div><span class="image-count">${images.length} ${tr('صور','images')}</span></div>`;
  }
  function id(prefix) { return `${prefix}-${crypto.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2)}`; }

  const can=permission=>session()?.role==='admin'&&(session().isOwner||session().permissions?.includes(permission));
  window.M = { state, save, session, setSession, can, language, tr, applyLanguage, applySettings, bindLanguage, requireRole, logout, bindLogout, fillUser, toast, openDialog, closeDialog, bindDialogs, containsContact, imageData, setupImages, imageGallery, id };
  document.addEventListener('DOMContentLoaded', async () => {
    bindLanguage(); bindDialogs(); bindLogout();
    try { await API.refresh(); applyLanguage(language()); }
    catch(error) {
      const notice=document.createElement('p');notice.className='account-restriction';notice.setAttribute('role','alert');notice.textContent=error.message;
      document.querySelector('main')?.prepend(notice);
      if(/(?:customer|supplier|admin)\.html$/.test(location.pathname)&&!location.pathname.includes('register-'))return;
    }
    document.dispatchEvent(new Event('m:ready'));
  });
})();
