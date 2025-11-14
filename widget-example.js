// widget-example.js (put at project root)
(function () {
  // default API base — widget will try window.RAM_SERVICE_API_BASE then APP_URL then fallback
  const API_BASE = (window.RAM_SERVICE_API_BASE || window.RAM_SERVICE_API || '').replace(/\/$/, '') || 'https://ram-service-repair1.onrender.com';
  const mountId = 'ram-service-widget';
  const ns = 'ramsvc';

  const q = (s, p = document) => p.querySelector(s);
  const qa = (s, p = document) => Array.from(p.querySelectorAll(s));
  const ce = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
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
      .then(r => r.json().then(j => { if (!r.ok) throw j; return j; }));
  }

  // inject simple CSS
  const css = `#${mountId}{font-family:Inter,system-ui,Arial;color:#111} /* minimal styling omitted for brevity - keep your original styles here */`;
  const style = ce('style'); style.innerText = css; document.head.appendChild(style);

  const mount = document.getElementById(mountId);
  if (!mount) { console.error('Missing mount element #' + mountId); return; }
  mount.innerHTML = '<div style="text-align:center;padding:36px"><strong>Loading service widget…</strong></div>';

  // state + placeholder render (re-use your full UI if you want; minimal for clarity)
  const state = { categories: [], series: [], models: [], repairs: [], selectedCategory: null, selectedSeries: null, selectedModel: null, selectedRepair: null, price: null };

  function renderError(msg) {
    mount.innerHTML = `<div style="text-align:center;padding:30px"><div style="color:#333;font-size:20px">Service Repair</div><div style="color:#777;margin-top:10px">${msg}</div></div>`;
  }

  function renderCategories() {
    const container = ce('div');
    container.style.display = 'flex';
    container.style.gap = '14px';
    container.style.justifyContent = 'center';
    if (!state.categories.length) {
      renderError('Failed to load categories');
      return;
    }
    state.categories.forEach(cat => {
      const btn = ce('button'); btn.innerText = cat.name; btn.style.padding = '14px 18px';
      btn.onclick = () => {
        state.selectedCategory = cat;
        loadSeries(cat);
      };
      container.appendChild(btn);
    });
    mount.innerHTML = '';
    const header = ce('div'); header.style.textAlign = 'center'; header.innerHTML = '<h2>Service Repair</h2><div>Choose category → series → model → repair → submit</div>';
    mount.appendChild(header);
    mount.appendChild(container);
    // series placeholder
    const seriesWrap = ce('div'); seriesWrap.id = ns + '-series'; seriesWrap.style.marginTop = '20px';
    mount.appendChild(seriesWrap);
    // model & repairs placeholders
    const modelWrap = ce('div'); modelWrap.id = ns + '-models'; modelWrap.style.marginTop = '20px';
    mount.appendChild(modelWrap);
    const repairsWrap = ce('div'); repairsWrap.id = ns + '-repairs'; repairsWrap.style.marginTop = '20px';
    mount.appendChild(repairsWrap);
  }

  function renderSeries(list) {
    const wrap = q('#' + ns + '-series', mount);
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!list || !list.length) { wrap.innerText = 'No series available for this category'; return; }
    list.forEach(s => {
      const b = ce('button'); b.innerText = s.name; b.style.margin = '6px';
      b.onclick = () => { state.selectedSeries = s; loadModelsForSeries(s._id); };
      wrap.appendChild(b);
    });
  }

  function renderModels(list) {
    const wrap = q('#' + ns + '-models', mount);
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!list || !list.length) { wrap.innerText = 'No models'; return; }
    list.forEach(m => {
      const b = ce('button'); b.innerText = (m.brand ? m.brand + ' ' : '') + m.name; b.style.margin = '6px';
      b.onclick = () => { state.selectedModel = m; loadRepairsForModel(m._id); };
      wrap.appendChild(b);
    });
  }

  function renderRepairs(list) {
    const wrap = q('#' + ns + '-repairs', mount);
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!list || !list.length) { wrap.innerText = 'No repair options'; return; }
    list.forEach(r => {
      const b = ce('button'); b.innerText = (r.name + (r.priceEffective ? ' — ' + money(r.priceEffective) : '')); b.style.margin='6px';
      b.onclick = () => { state.selectedRepair = r; showForm(); computeEffectivePrice(); };
      wrap.appendChild(b);
    });
  }

  function showForm() {
    // simple inline form below repairs
    let f = q('#' + ns + '-form', mount);
    if (!f) {
      f = ce('div'); f.id = ns + '-form'; f.style.marginTop = '18px';
      mount.appendChild(f);
    }
    f.innerHTML = '';
    const inputEmail = ce('input'); inputEmail.type='email'; inputEmail.placeholder='Email'; inputEmail.style.marginRight='8px';
    const btn = ce('button'); btn.innerText = 'Request repair'; btn.onclick = () => onSubmit(inputEmail.value);
    f.appendChild(inputEmail); f.appendChild(btn);
  }

  function computeEffectivePrice() {
    if (!state.selectedRepair) return;
    // widget already receives priceEffective from API; show on page
    const p = q('#' + ns + '-price', mount);
    if (!p) {
      const el = ce('div'); el.id = ns + '-price'; el.style.marginTop='12px'; el.innerText = 'Price: ' + (state.selectedRepair.priceEffective || state.selectedRepair.basePrice || 'CALL_FOR_PRICE');
      mount.appendChild(el); return;
    }
    p.innerText = 'Price: ' + (state.selectedRepair.priceEffective || state.selectedRepair.basePrice || 'CALL_FOR_PRICE');
  }

  function onSubmit(email) {
    if (!email) return alert('Enter email');
    const payload = {
      contact: { email },
      category: state.selectedCategory ? state.selectedCategory.slug : '',
      seriesId: state.selectedSeries ? state.selectedSeries._id : '',
      modelId: state.selectedModel ? state.selectedModel._id : '',
      repair_code: state.selectedRepair ? (state.selectedRepair.code || state.selectedRepair._id) : '',
      metadata: { widgetAt: window.location.href }
    };
    apiPOST('/api/submit', payload).then(res => {
      mount.innerHTML = `<div style="text-align:center;padding:30px"><h3>Thanks — request received</h3><div>Ref: ${res.id || res._id || '—'}</div></div>`;
    }).catch(err => {
      console.error('submit failed', err);
      alert('Submission failed: ' + (err.error || err.message || JSON.stringify(err)));
    });
  }

  // ---- data loaders ----
  function loadCategories() {
    apiGET('/api/categories').then(list => { state.categories = list || []; renderCategories(); }).catch(err => {
      console.error('categories err', err);
      renderError('Failed to load categories — make sure widget API base is correct: ' + API_BASE);
    });
  }

  function loadSeries(category) {
    apiGET('/api/series?category=' + encodeURIComponent(category.slug || category._id)).then(list => {
      state.series = list || []; renderSeries(state.series);
    }).catch(err => { console.error('series err', err); const wrap = q('#' + ns + '-series', mount); if (wrap) wrap.innerText = 'Failed to load series'; });
  }

  function loadModelsForSeries(seriesId) {
    apiGET('/api/series/' + encodeURIComponent(seriesId) + '/models').then(list => {
      state.models = list || []; renderModels(state.models);
    }).catch(err => { console.error('models err', err); const wrap = q('#' + ns + '-models', mount); if (wrap) wrap.innerText = 'Failed to load models'; });
  }

  function loadRepairsForModel(modelId) {
    apiGET('/api/repairs?modelId=' + encodeURIComponent(modelId)).then(list => {
      state.repairs = list || []; renderRepairs(state.repairs);
    }).catch(err => { console.error('repairs err', err); const wrap = q('#' + ns + '-repairs', mount); if (wrap) wrap.innerText = 'Failed to load repairs'; });
  }

  // init
  loadCategories();

  // expose debug info
  window.RAM_SERVICE_WIDGET = { apiBase: API_BASE };
})();
