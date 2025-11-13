/**
 * RAM Service Repair — embeddable widget
 * Drop this file on your server at /widget.js and include:
 *   <div id="ram-service-widget"></div>
 *   <script src="https://ram-service-repair1.onrender.com/widget.js" async></script>
 *
 * Notes:
 * - Uses your server endpoints at same host (relative fetch paths).
 * - Expects CORS allowed (server.js already uses cors()).
 * - No external libs. Works in modern browsers.
 */

(function () {
  const MOUNT_ID = 'ram-service-widget';
  const mount = document.getElementById(MOUNT_ID) || (function createMount(){
    const el = document.createElement('div');
    el.id = MOUNT_ID;
    document.body.appendChild(el);
    return el;
  })();

  // Small utility
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, String(v));
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (!c) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }
  function q(sel, root=document) { return root.querySelector(sel); }
  function qa(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }

  function formatPrice(cents, currency='EUR') {
    if (cents == null) return 'Pokličite za ceno';
    try {
      return new Intl.NumberFormat(undefined, { style:'currency', currency }).format(cents/100);
    } catch (e) {
      return (cents/100).toFixed(2) + ' ' + currency;
    }
  }

  // API helpers (relative)
  const API_ROOT = (function () {
    // if widget is loaded from app host, use that host origin, otherwise fallback to current host
    try {
      const script = document.currentScript && document.currentScript.src;
      if (script) {
        const url = new URL(script);
        return url.origin;
      }
    } catch (e) {}
    return (location.protocol + '//' + location.host);
  })();

  function api(path, opts) {
    return fetch(API_ROOT + path, opts).then(r => {
      if (!r.ok) return r.text().then(t => { throw new Error('API error ' + r.status + ' ' + t); });
      return r.json();
    });
  }

  // --- initial skeleton ---
  mount.innerHTML = '';
  mount.className = 'ram-widget-root';
  const container = el('div', { class: 'ram-widget container' });
  mount.appendChild(container);

  // Basic styles (scoped)
  const style = document.createElement('style');
  style.innerHTML = `
.ram-widget .row { display:flex; gap:18px; flex-wrap:wrap; justify-content:center; }
.ram-widget .title { text-align:center; font-size:26px; margin:24px 0; font-weight:700; }
.ram-widget .tile { width:260px; min-height:180px; border-radius:10px; background:#eef6ff; display:flex;flex-direction:column;align-items:center;justify-content:center;padding:22px;cursor:pointer;transition:all .15s;border:1px solid transparent; }
.ram-widget .tile.selected { background:#c9d6e8; transform:translateY(-4px); border-color:#a9b6c8; }
.ram-widget .tile img { max-height:90px; object-fit:contain; margin-bottom:12px; }
.ram-widget .select-wrap { width:100%; display:flex; justify-content:center; margin:18px 0; }
.ram-widget select { padding:12px 18px; border-radius:28px; border:1px solid #222; min-width:320px; max-width:560px; font-weight:600; }
.ram-widget .repairs { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; margin-top:16px; }
.ram-widget .repair { width:200px; min-height:160px; background:#eef6ff; border-radius:8px; padding:14px; text-align:center; cursor:pointer; border:1px solid transparent; }
.ram-widget .repair.selected { background:#cfe3f3; border-color:#9fb6ce; transform:translateY(-3px); }
.ram-widget .fs { display:flex; gap:12px; align-items:center; justify-content:center; margin-top:18px; }
.ram-widget .price { font-size:20px; font-weight:700; }
.ram-widget .form { margin:18px auto; max-width:760px; padding:16px; border-radius:8px; background:#f8fbff; border:1px solid #e6eef8; }
.ram-widget .form label { display:block; margin-bottom:6px; font-weight:600; }
.ram-widget .form input, .ram-widget .form textarea { width:100%; padding:10px 12px; border-radius:6px; border:1px solid #ccc; margin-bottom:12px; }
.ram-widget .btn { background:#0b66d3; color:#fff; padding:10px 16px; border-radius:8px; cursor:pointer; border:0; font-weight:700; }
.ram-widget .muted { color:#666; font-size:13px; }
.ram-widget .small { font-size:13px; color:#444; }
`;
  document.head.appendChild(style);

  // UI pieces
  const title = el('div', { class: 'title' }, 'Select device category');
  container.appendChild(title);

  const categoriesWrap = el('div', { class: 'row', id: 'r-categories' });
  container.appendChild(categoriesWrap);

  const seriesWrap = el('div', { class: 'row', id: 'r-series', style: 'margin-top:6px;' });
  container.appendChild(seriesWrap);

  const modelWrap = el('div', { class: 'select-wrap', id: 'r-model' });
  container.appendChild(modelWrap);

  const repairsWrap = el('div', { class: 'repairs', id: 'r-repairs' });
  container.appendChild(repairsWrap);

  const finalWrap = el('div', { class: 'fs', id: 'r-final' });
  container.appendChild(finalWrap);

  const formWrap = el('div', { class: 'form', id: 'r-form', style: 'display:none;' });
  container.appendChild(formWrap);

  // State
  const state = {
    categories: [],
    selectedCategory: null,
    series: [],
    selectedSeries: null,
    models: [],
    selectedModel: null,
    repairs: [],
    selectedRepair: null
  };

  // Render helpers
  function renderCategories() {
    categoriesWrap.innerHTML = '';
    if (!state.categories || state.categories.length === 0) {
      categoriesWrap.appendChild(el('div', { class: 'muted' }, 'No categories configured yet.'));
      return;
    }
    state.categories.forEach(c => {
      const img = c.iconUrl ? el('img', { src: c.iconUrl, alt: c.name }) : el('div', { html: '' });
      const t = el('div', { class: 'tile', 'data-slug': c.slug }, [
        img,
        el('div', { class: 'small' }, c.name)
      ]);
      t.onclick = () => {
        state.selectedCategory = c;
        state.selectedSeries = null;
        state.selectedModel = null;
        state.selectedRepair = null;
        // if server returned series embedded, use them
        state.series = c.series || [];
        // if no embedded series, attempt to fetch series via /api/series?categoryId (fallback to models)
        renderAll();
        if (!state.series || state.series.length === 0) {
          // fallback: try fetch models by category and compute seriesless option
          fetchModelsForCategory(c.slug).then(models => {
            state.models = models;
            renderAll();
          }).catch(e => console.warn('no models for category', e));
        }
      };
      categoriesWrap.appendChild(t);
    });
  }

  function renderSeries() {
    seriesWrap.innerHTML = '';
    if (!state.series || state.series.length === 0) return;
    const title = el('div', { class: 'title' }, 'Select Series');
    seriesWrap.appendChild(title);
    const row = el('div', { class: 'row' });
    state.series.forEach(s => {
      const img = s.iconUrl ? el('img', { src: s.iconUrl, alt: s.name }) : el('div', { html: '' });
      const t = el('div', { class: 'tile', 'data-id': s._id }, [
        img,
        el('div', { class: 'small' }, s.name)
      ]);
      t.onclick = () => {
        state.selectedSeries = s;
        state.selectedModel = null;
        state.selectedRepair = null;
        // fetch models for this series
        fetch(`${API_ROOT}/api/series/${s._id}/models`).then(r => r.json()).then(resp => {
          state.models = resp.items || resp || [];
          renderAll();
        }).catch(err => {
          console.error('error fetching models for series', err);
          state.models = [];
          renderAll();
        });
      };
      row.appendChild(t);
    });
    seriesWrap.appendChild(row);
  }

  function renderModels() {
    modelWrap.innerHTML = '';
    // if models exist show select
    if (!state.models || state.models.length === 0) return;
    const sel = el('select', { id: 'r-model-select' });
    sel.appendChild(el('option', { value: '' }, 'Select a model from the list…'));
    state.models.forEach(m => {
      const opt = el('option', { value: m._id }, (m.name || m.slug || m._id));
      sel.appendChild(opt);
    });
    sel.onchange = () => {
      const id = sel.value;
      state.selectedModel = state.models.find(x => String(x._id) === String(id));
      state.selectedRepair = null;
      if (state.selectedModel) {
        fetchRepairsForModel(state.selectedModel._id).then(list => {
          state.repairs = list;
          renderAll();
        });
      } else {
        state.repairs = [];
        renderAll();
      }
    };
    modelWrap.appendChild(sel);
  }

  function renderRepairs() {
    repairsWrap.innerHTML = '';
    if (!state.repairs || state.repairs.length === 0) return;
    const title = el('div', { class: 'title' }, 'Select type of injury');
    repairsWrap.appendChild(title);
    state.repairs.forEach(rp => {
      const r = el('div', { class: 'repair', 'data-code': rp.code }, [
        rp.images && rp.images[0] ? el('img', { src: rp.images[0], alt: rp.name }) : el('div', { html: '' }),
        el('div', { class: 'small' }, rp.name),
        el('div', { class: 'muted' }, formatPrice(rp.priceEffective, rp.currency || 'EUR'))
      ]);
      r.onclick = () => {
        state.selectedRepair = rp;
        // show contact form and price
        renderAll();
      };
      repairsWrap.appendChild(r);
    });
  }

  function renderFinal() {
    finalWrap.innerHTML = '';
    if (!state.selectedRepair) return;
    const priceDiv = el('div', { class: 'price' }, formatPrice(state.selectedRepair.priceEffective, state.selectedRepair.currency || 'EUR'));
    finalWrap.appendChild(priceDiv);
    const title = el('div', { class: 'small' }, state.selectedRepair.name);
    finalWrap.appendChild(title);
  }

  function renderForm() {
    formWrap.innerHTML = '';
    if (!state.selectedRepair) { formWrap.style.display = 'none'; return; }
    formWrap.style.display = 'block';
    formWrap.appendChild(el('h3', {}, 'Repair form'));
    // contact fields
    const nameLabel = el('label', {}, 'Full name');
    const nameInput = el('input', { type:'text', id:'r-contact-name', placeholder:'Full name' });
    const emailLabel = el('label', {}, 'Email');
    const emailInput = el('input', { type:'email', id:'r-contact-email', placeholder:'Email' });
    const phoneLabel = el('label', {}, 'Phone');
    const phoneInput = el('input', { type:'text', id:'r-contact-phone', placeholder:'Phone' });

    formWrap.appendChild(nameLabel); formWrap.appendChild(nameInput);
    formWrap.appendChild(emailLabel); formWrap.appendChild(emailInput);
    formWrap.appendChild(phoneLabel); formWrap.appendChild(phoneInput);

    formWrap.appendChild(el('label', {}, 'Additional notes (optional)'));
    const notes = el('textarea', { id:'r-contact-notes', rows:4, placeholder:'Describe the issue' });
    formWrap.appendChild(notes);

    const consentWrap = el('div', { style: 'margin-bottom:10px;' }, [
      el('label', {}, [
        el('input', { type:'checkbox', id:'r-consent' }),
        el('span', { html: ' I consent to my data being used for this repair request (GDPR).' })
      ])
    ]);
    formWrap.appendChild(consentWrap);

    const btn = el('button', { class: 'btn', type:'button' }, 'Request repair');
    btn.onclick = async () => {
      const contact = {
        full_name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        phone: phoneInput.value.trim()
      };
      if (!contact.full_name || !contact.email) {
        alert('Name and email are required');
        return;
      }
      const payload = {
        contact,
        category: state.selectedCategory ? state.selectedCategory._id || state.selectedCategory.slug : null,
        seriesId: state.selectedSeries ? state.selectedSeries._id : null,
        modelId: state.selectedModel ? state.selectedModel._id : null,
        repairOptionId: state.selectedRepair && state.selectedRepair._id ? state.selectedRepair._id : null,
        repair_code: state.selectedRepair ? state.selectedRepair.code : null,
        consent: !!q('#r-consent', formWrap)?.checked,
        metadata: { source: 'widget' }
      };
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        const json = await api('/api/submit', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        // show confirmation
        formWrap.innerHTML = '';
        formWrap.appendChild(el('h3', {}, 'Request received'));
        formWrap.appendChild(el('div', {}, 'Reference: ' + (json.requestId || json.id || '—')));
        formWrap.appendChild(el('div', {}, 'Price at submission: ' + (json.price ? formatPrice(json.price) : 'Pokličite za ceno')));
        formWrap.appendChild(el('div', { style: 'margin-top:10px' }, el('button', { class: 'btn', onclick: 'window.location.reload()' }, 'Reload page')));
      } catch (err) {
        console.error('submit error', err);
        alert('Submit failed: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Request repair';
      }
    };
    formWrap.appendChild(btn);
  }

  function renderAll() {
    // reflect selected visuals
    // categories: mark selected
    qa('.tile', categoriesWrap).forEach(t => {
      t.classList.toggle('selected', state.selectedCategory && (t.getAttribute('data-slug') === (state.selectedCategory.slug || '')));
    });
    renderSeries();
    renderModels();
    renderRepairs();
    renderFinal();
    renderForm();
  }

  // Fetch helpers
  async function loadCategories() {
    try {
      const json = await api('/api/categories');
      // server returns { ok: true, items: [...] } in my server version
      const items = (json && (json.items || json)) || [];
      // normalize: if server returns category objects without series embed, it's OK
      state.categories = items;
      renderCategories();
    } catch (err) {
      console.error('Failed to load categories', err);
      categoriesWrap.innerHTML = '<div class="muted">Failed to load categories (check server)</div>';
    }
  }

  async function fetchModelsForCategory(categorySlug) {
    try {
      const json = await api(`/api/models?category=${encodeURIComponent(categorySlug)}`);
      const items = (json && (json.items || json)) || [];
      return items;
    } catch (err) {
      console.warn('fetchModelsForCategory failed', err);
      return [];
    }
  }

  async function fetchRepairsForModel(modelId) {
    try {
      const json = await api(`/api/repairs?modelId=${encodeURIComponent(modelId)}`);
      const items = json && (json.items || json) || [];
      // unify priceEffective property: my server returns number or null
      return items.map(it => {
        // priceEffective may be null or number in cents
        it.priceEffective = (typeof it.priceEffective === 'number') ? it.priceEffective : (typeof it.basePrice === 'number' ? it.basePrice : null);
        // ensure _id, code, name fields exist
        return it;
      });
    } catch (err) {
      console.error('fetchRepairs failed', err);
      return [];
    }
  }

  // initial load
  loadCategories();

  // Expose for debugging
  window.RAM_WIDGET = { state, reload: loadCategories, API_ROOT };
})();
