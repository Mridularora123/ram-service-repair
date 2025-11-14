// widget-example.js — storefront widget (overwrite)
(function () {
  // ---- CONFIG ----------
  const API_BASE = (window.RAM_SERVICE_API_BASE || '').replace(/\/$/, '') || (window.location.protocol + '//' + window.location.host);
  const mountId = 'ram-service-widget';
  const ns = 'ramsvc'; // CSS namespace

  // helpers
  const q = (s, p = document) => p.querySelector(s);
  const qa = (s, p = document) => Array.from(p.querySelectorAll(s));
  const ce = (tag, cls) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  };
  const money = v => {
    if (v === null || v === undefined) return 'CALL_FOR_PRICE';
    if (Number.isInteger(v)) return (v / 100).toLocaleString() + ' €';
    if (!isNaN(Number(v))) return Number(v).toLocaleString() + ' €';
    return String(v);
  };

  function apiGET(path) {
    return fetch(API_BASE + path, { credentials: 'omit' })
      .then(r => { if (!r.ok) throw new Error('Network error ' + r.status); return r.json(); });
  }
  function apiPOST(path, body) {
    return fetch(API_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(r => { if (!r.ok) return r.json().then(j => { throw j; }); return r.json(); });
  }

  // simple CSS
  const css = `
  #${mountId}{font-family:Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial; color:#111; box-sizing:border-box;}
  #${mountId} .${ns}-centerCol{max-width:1050px;margin:0 auto;padding:20px;}
  #${mountId} .${ns}-grid{display:flex;flex-wrap:wrap;gap:18px;justify-content:center;margin:18px 0;}
  #${mountId} .${ns}-tile{width:200px;height:170px;background:#eef6ff;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;cursor:pointer;border:1px solid rgba(10,20,40,0.04);}
  #${mountId} .${ns}-tile img{max-height:80px;max-width:120px;object-fit:contain;margin-bottom:8px;}
  #${mountId} .${ns}-tile.selected{background:#d9ecff;border:2px solid rgba(10,20,40,0.06);}
  #${mountId} .${ns}-pill{display:inline-block;border-radius:999px;padding:10px 20px;border:2px solid #061130;background:#fff;font-weight:700;margin:12px auto;cursor:pointer;min-width:300px;text-align:center;}
  #${mountId} .${ns}-muted{color:#6c6f76;font-size:13px;}
  #${mountId} .${ns}-form{max-width:1000px;margin:18px auto 0;background:#fff;padding:22px;border-radius:10px;border:1px solid rgba(10,20,40,0.04);}
  #${mountId} label{display:block;font-weight:700;margin-bottom:6px;}
  #${mountId} input, #${mountId} textarea, #${mountId} select{width:100%;padding:10px;border-radius:8px;border:1px solid rgba(10,20,40,0.06);box-sizing:border-box;}
  #${mountId} .${ns}-btn{padding:10px 16px;background:#0a63d6;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:800;}
  @media (max-width:580px){ #${mountId} .${ns}-tile{width:100%;height:140px;} #${mountId} .${ns}-pill{min-width:200px;} }
  `;
  const style = ce('style'); style.innerText = css; document.head.appendChild(style);

  // mount
  const mount = document.getElementById(mountId);
  if (!mount) { console.error('RAM Service widget: missing mount element with id #' + mountId); return; }
  mount.classList.add(ns + '-wrap');
  mount.innerHTML = '';
  const center = ce('div', ns + '-centerCol'); mount.appendChild(center);

  // header
  const header = ce('div'); header.innerHTML = `<h2 style="text-align:center;margin:0 0 8px 0">Service Repair</h2><div class="${ns}-muted" style="text-align:center">Choose category → series → model → repair → submit</div>`; center.appendChild(header);

  // category grid
  const categoryGrid = ce('div', ns + '-grid'); center.appendChild(categoryGrid);

  // series area (inserted under categories)
  let seriesRow = null;
  function ensureSeriesRow() {
    if (!seriesRow) {
      seriesRow = ce('div', ns + '-grid ' + ns + '-seriesRow');
      center.insertBefore(seriesRow, categoryGrid.nextSibling);
    }
  }

  // model pill
  const pillWrap = ce('div'); pillWrap.style.textAlign = 'center'; const modelPill = ce('div', ns + '-pill'); modelPill.textContent = 'Select model...'; pillWrap.appendChild(modelPill); center.appendChild(pillWrap);

  // repair grid
  const repairGrid = ce('div', ns + '-grid'); center.appendChild(repairGrid);

  // price summary
  const priceWrap = ce('div'); priceWrap.style.margin = '10px 0'; priceWrap.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong id="${ns}-title">Repair selection</strong><div class="${ns}-muted">Choose options to see price</div></div><div style="text-align:right"><div class="${ns}-muted">Your price</div><div id="${ns}-price" style="font-weight:900">CALL_FOR_PRICE</div></div></div>`; center.appendChild(priceWrap);

  // form panel
  const formPanel = ce('div'); formPanel.className = ns + '-form'; formPanel.style.display = 'none'; center.appendChild(formPanel);

  // state
  const state = {
    categories: [],
    series: [],
    models: [],
    repairs: [],
    selectedCategory: null,
    selectedSeries: null,
    selectedModel: null,
    selectedRepair: null,
    price: null
  };

  // helpers
  function clearChildren(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function renderCategories() {
    clearChildren(categoryGrid);
    if (!state.categories.length) { categoryGrid.appendChild(ce('div')).innerText = 'No categories'; return; }
    state.categories.forEach(cat => {
      const t = ce('div', ns + '-tile'); t.setAttribute('data-id', cat._id || ''); const img = ce('img'); img.src = cat.iconUrl || cat.image || ''; const name = ce('div'); name.innerText = cat.name;
      t.appendChild(img); t.appendChild(name);
      t.onclick = () => {
        state.selectedCategory = cat;
        Array.from(categoryGrid.children).forEach(c => c.classList.remove('selected'));
        t.classList.add('selected');
        loadSeries(cat);
        // reset downstream
        state.selectedSeries = null; state.models = []; state.selectedModel = null; state.repairs = []; state.selectedRepair = null;
        renderModelPill(null);
        renderRepairs([]);
        hideForm();
      };
      categoryGrid.appendChild(t);
    });
  }

  function renderSeries(list) {
    ensureSeriesRow();
    clearChildren(seriesRow);
    if (!list || !list.length) return;
    list.forEach(s => {
      const t = ce('div', ns + '-tile'); const img = ce('img'); img.src = s.image || ''; const n = ce('div'); n.innerText = s.name;
      t.appendChild(img); t.appendChild(n);
      t.onclick = () => {
        state.selectedSeries = s;
        Array.from(seriesRow.children).forEach(c => c.classList.remove('selected'));
        t.classList.add('selected');
        loadModelsForSeries(s._id);
        // reset downstream
        state.selectedModel = null; state.repairs = []; state.selectedRepair = null;
        renderModelPill(null);
        renderRepairs([]);
        hideForm();
      };
      seriesRow.appendChild(t);
    });
  }

  function renderModelPill(model) {
    if (!model) {
      modelPill.textContent = 'Select model...';
      modelPill.classList.remove('selected');
      modelPill.onclick = () => { if (state.models && state.models.length) openModelSelect(); };
      return;
    }
    modelPill.textContent = `${model.name}${model.brand ? ' — ' + model.brand : ''}`;
    modelPill.classList.add('selected');
    modelPill.onclick = openModelSelect;
  }

  function openModelSelect() {
    const existing = document.getElementById(ns + '-model-popup');
    if (existing) { existing.remove(); return; }
    const popup = ce('div'); popup.id = ns + '-model-popup';
    popup.style.position = 'fixed'; popup.style.left = '50%'; popup.style.top = '50%'; popup.style.transform = 'translate(-50%,-50%)'; popup.style.zIndex = 99999;
    popup.style.background = '#fff'; popup.style.borderRadius = '10px'; popup.style.padding = '12px'; popup.style.boxShadow = '0 30px 60px rgba(0,0,0,0.12)'; popup.style.maxHeight = '70vh'; popup.style.overflow = 'auto'; popup.style.minWidth = '320px';
    const title = ce('div'); title.style.fontWeight = 800; title.style.marginBottom = '10px'; title.innerText = 'Select model';
    popup.appendChild(title);
    state.models.forEach(m => {
      const btn = ce('button'); btn.style.display = 'block'; btn.style.width = '100%'; btn.style.padding = '10px'; btn.style.marginBottom = '8px'; btn.style.borderRadius = '8px'; btn.innerText = m.name + (m.brand ? ' — ' + m.brand : '');
      btn.onclick = () => { state.selectedModel = m; renderModelPill(m); loadRepairsForModel(m._id); popup.remove(); };
      popup.appendChild(btn);
    });
    const close = ce('button'); close.innerText = 'Close'; close.onclick = () => popup.remove(); popup.style.marginTop = '6px'; popup.appendChild(close);
    document.body.appendChild(popup);
  }

  function renderRepairs(list) {
    clearChildren(repairGrid);
    if (!list || !list.length) { repairGrid.appendChild(ce('div')).innerText = 'No repair options'; return; }
    list.forEach(r => {
      const t = ce('div', ns + '-tile'); const img = ce('img'); img.src = (r.images && r.images[0]) || r.iconUrl || ''; const n = ce('div'); n.innerText = r.name;
      const sub = ce('div'); sub.className = ns + '-muted'; sub.style.marginTop = '8px';
      const pe = (r.priceEffective !== undefined && r.priceEffective !== null) ? r.priceEffective : r.basePrice;
      sub.innerText = (pe !== null && pe !== undefined) ? money(pe) : 'CALL_FOR_PRICE';
      t.appendChild(img); t.appendChild(n); t.appendChild(sub);
      t.onclick = () => {
        state.selectedRepair = r;
        computePrice();
        Array.from(repairGrid.children).forEach(c => c.classList.remove('selected'));
        t.classList.add('selected');
        showForm();
        formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      repairGrid.appendChild(t);
    });
  }

  function computePrice() {
    let price = null;
    if (!state.selectedRepair) { state.price = null; updatePrice(); return; }
    price = (state.selectedRepair.priceEffective !== undefined && state.selectedRepair.priceEffective !== null) ? state.selectedRepair.priceEffective : state.selectedRepair.basePrice;
    // If model has priceOverrides array where an override exists, prefer that (some models may already include overrides in the model document)
    if (state.selectedModel && Array.isArray(state.selectedModel.priceOverrides)) {
      const ov = state.selectedModel.priceOverrides.find(o => (o.repairOptionId && String(o.repairOptionId) === String(state.selectedRepair._id)) || (o.repairOptionCode && o.repairOptionCode === state.selectedRepair.code));
      if (ov && typeof ov.price !== 'undefined' && ov.price !== null) price = ov.price;
    }
    state.price = price !== undefined && price !== null ? price : null;
    updatePrice();
  }

  function updatePrice() {
    const priceEl = q('#' + ns + '-price', mount);
    if (priceEl) priceEl.innerText = state.price ? money(state.price) : 'CALL_FOR_PRICE';
    const titleEl = q('#' + ns + '-title', mount);
    if (titleEl) titleEl.innerText = state.selectedModel ? (state.selectedModel.name || 'Repair selection') : 'Repair selection';
  }

  function hideForm() { formPanel.style.display = 'none'; formPanel.innerHTML = ''; }
  function showForm() {
    formPanel.style.display = 'block';
    formPanel.innerHTML = '';
    // top summary
    const top = ce('div'); top.style.display = 'flex'; top.style.justifyContent = 'space-between'; top.style.alignItems = 'center'; top.style.marginBottom = '12px';
    const left = ce('div'); left.innerHTML = `<div style="font-weight:900">${state.selectedModel ? state.selectedModel.name : ''}</div><div class="${ns}-muted">${state.selectedModel ? state.selectedModel.brand || '' : ''}</div>`;
    const right = ce('div'); right.innerHTML = `<div class="${ns}-muted">Repair</div><div style="font-weight:900">${state.selectedRepair ? state.selectedRepair.name : ''}</div><div style="margin-top:6px;font-weight:900">${state.price ? money(state.price) : 'CALL_FOR_PRICE'}</div>`;
    top.appendChild(left); top.appendChild(right); formPanel.appendChild(top);

    // form fields
    const makeField = (label, name, type = 'text', required = false) => {
      const wrap = ce('div'); wrap.style.marginBottom = '8px';
      const lab = ce('label'); lab.innerText = label + (required ? ' *' : ''); const inp = (type === 'textarea') ? ce('textarea') : ce('input');
      if (type !== 'textarea') inp.type = type;
      inp.name = name; inp.style.width = '100%'; if (required) inp.setAttribute('data-required', '1');
      wrap.appendChild(lab); wrap.appendChild(inp); return wrap;
    };

    const grid = ce('div');
    grid.appendChild(makeField('Full name', 'full_name', 'text', true));
    grid.appendChild(makeField('Email', 'email', 'email', true));
    grid.appendChild(makeField('Phone', 'phone', 'tel', true));
    grid.appendChild(makeField('Address', 'address'));
    grid.appendChild(makeField('Device (manufacturer + model)', 'device_model', 'text', true));
    grid.appendChild(makeField('IMEI / Serial', 'imei'));
    formPanel.appendChild(grid);

    // description
    formPanel.appendChild(makeField('Error description', 'body', 'textarea'));

    // submit
    const submitWrap = ce('div'); submitWrap.style.marginTop = '12px';
    const btn = ce('button', ns + '-btn'); btn.innerText = 'Request repair';
    btn.onclick = onSubmit;
    submitWrap.appendChild(btn);
    formPanel.appendChild(submitWrap);

    // store metadata on formPanel for debug if needed
    formPanel.dataset.category = state.selectedCategory ? state.selectedCategory._id : '';
    formPanel.dataset.series = state.selectedSeries ? state.selectedSeries._id : '';
    formPanel.dataset.modelId = state.selectedModel ? state.selectedModel._id : '';
    formPanel.dataset.repairCode = state.selectedRepair ? (state.selectedRepair.code || state.selectedRepair._id) : '';
  }

  function collectFormData() {
    const inputs = formPanel.querySelectorAll('input, textarea, select');
    const contact = {};
    inputs.forEach(i => {
      if (!i.name) return;
      if (i.type === 'radio') {
        if (!contact[i.name]) {
          const c = formPanel.querySelector('input[name="' + i.name + '"]:checked');
          contact[i.name] = c ? c.value : '';
        }
      } else {
        contact[i.name] = i.value;
      }
    });
    return {
      contact,
      category: state.selectedCategory ? state.selectedCategory._id : null,
      seriesId: state.selectedSeries ? state.selectedSeries._id : null,
      modelId: state.selectedModel ? state.selectedModel._id : null,
      repair_code: state.selectedRepair ? (state.selectedRepair.code || state.selectedRepair._id) : null,
      metadata: { priceComputed: state.price, widgetAt: window.location.href }
    };
  }

  function validateForm() {
    let ok = true;
    const required = formPanel.querySelectorAll('[data-required="1"]');
    required.forEach(r => {
      if (!r.value || r.value.trim() === '') { ok = false; r.style.borderColor = 'red'; } else r.style.borderColor = '';
    });
    if (!state.selectedModel) { alert('Please select a model'); ok = false; }
    if (!state.selectedRepair) { alert('Please select a repair type'); ok = false; }
    return ok;
  }

  function onSubmit() {
    if (!validateForm()) return;
    const payload = collectFormData();
    const btn = formPanel.querySelector('button');
    btn.disabled = true; btn.innerText = 'Sending...';
    apiPOST('/api/submit', payload).then(res => {
      btn.disabled = false; btn.innerText = 'Request repair';
      // success UI
      mount.innerHTML = `<div style="max-width:800px;margin:30px auto;padding:40px;text-align:center;background:#f6fcff;border-radius:12px"><h2>Thank you — request received</h2><p class="${ns}-muted">Request id <strong>${res.id || res._id || '-'}</strong>. Price: <strong>${res.price ? (Number.isInteger(res.price) ? (res.price/100).toLocaleString() + ' €' : res.price) : 'CALL_FOR_PRICE'}</strong></p></div>`;
    }).catch(err => {
      btn.disabled = false; btn.innerText = 'Request repair';
      console.error('submit err', err);
      alert('Submission failed: ' + (err && (err.error || err.message) ? (err.error || err.message) : 'Unknown error'));
    });
  }

  // LOADERS
  function loadCategories() {
    apiGET('/api/categories').then(list => { state.categories = list || []; renderCategories(); }).catch(err => { console.error('categories err', err); categoryGrid.innerText = 'Failed to load categories'; });
  }
  function loadSeries(category) {
    // call series endpoint with category id to get only series for that category
    const catId = category._id || category.slug || '';
    apiGET('/api/series?category=' + encodeURIComponent(catId)).then(list => { state.series = list || []; renderSeries(state.series); }).catch(err => { console.error('series err', err); });
  }
  function loadModelsForSeries(seriesId) {
    if (!seriesId) return;
    apiGET('/api/series/' + encodeURIComponent(seriesId) + '/models').then(list => { state.models = list || []; renderModelPill(null); }).catch(err => { console.error('models err', err); });
  }
  function loadRepairsForModel(modelId) {
    if (!modelId) return;
    apiGET('/api/repairs?modelId=' + encodeURIComponent(modelId)).then(list => { state.repairs = list || []; renderRepairs(state.repairs); }).catch(err => { console.error('repairs err', err); repairGrid.innerText = 'Failed to load repairs'; });
  }

  // init
  loadCategories();

})();
