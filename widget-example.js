/* RAM Service Repair — storefront widget
   Replace widget-example.js with this file and serve it at /widget.js
   Expects these endpoints:
   - GET /api/categories
   - GET /api/series
   - GET /api/series/:seriesId/models
   - GET /api/models?category=slug
   - GET /api/repairs?modelId=MODEL_ID
   - POST /api/submit
   Admin password etc are server-side — nothing secret here.
*/
(function () {
  // ---- CONFIG ----------
  const API_BASE = (window.RAM_SERVICE_API_BASE || '').replace(/\/$/, '') || 'https://ram-service-repair1.onrender.com';
  const mountId = 'ram-service-widget';
  const ns = 'ramsvc'; // CSS namespace

  // ---- small helpers ----
  const q = (s, p = document) => p.querySelector(s);
  const ce = (tag, cls) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  };
  const money = v => {
    if (v === null || v === undefined) return 'CALL_FOR_PRICE';
    // we store cents maybe (15000 -> 150.00). If value looks large, format.
    if (Number.isInteger(v)) return (v / 100).toLocaleString() + ' €';
    if (!isNaN(Number(v))) return Number(v).toLocaleString() + ' €';
    return String(v);
  };

  function apiGET(path) {
    return fetch(API_BASE + path, { credentials: 'omit' })
      .then(r => {
        if (!r.ok) throw new Error('Network error ' + r.status);
        return r.json();
      });
  }

  function apiPOST(path, body) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => {
      if (!r.ok) return r.json().then(j => { throw j; });
      return r.json();
    });
  }

  // ---- inject CSS (namespaced) ----
  const css = `
  /* widget base */
  #${mountId} .${ns}-wrap{font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#111;}
  #${mountId} .${ns}-center{text-align:center;}
  #${mountId} h2.${ns}-heading{font-size:28px;margin:24px 0 18px 0;font-weight:700;}
  #${mountId} .${ns}-grid{display:flex;flex-wrap:wrap;gap:24px;justify-content:center;margin:18px 0;}
  #${mountId} .${ns}-tile{width:220px;height:180px;background:#ecf3ff;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px;cursor:pointer;transition:transform .12s,box-shadow .12s;}
  #${mountId} .${ns}-tile:hover{transform:translateY(-4px);box-shadow:0 8px 20px rgba(0,0,0,.06);}
  #${mountId} .${ns}-tile.selected{background:#cfd8e6;}
  #${mountId} .${ns}-tile img{max-height:70px;max-width:120px;object-fit:contain;margin-bottom:12px;}
  #${mountId} .${ns}-tile h4{margin:0;font-size:16px;font-weight:700;}
  #${mountId} .${ns}-pill{display:inline-block;border-radius:40px;padding:12px 26px;border:2px solid #121212; font-weight:700;background:#fff; margin: 10px auto; cursor:pointer;}
  #${mountId} .${ns}-priceCard{background:#e7eefc;padding:18px;border-radius:8px;display:flex;gap:18px;align-items:center;justify-content:space-between;}
  #${mountId} .${ns}-form{max-width:920px;margin:26px auto;background:#f4fbff;padding:22px;border-radius:8px;}
  #${mountId} .${ns}-row{display:flex;gap:16px;flex-wrap:wrap;}
  #${mountId} .${ns}-col{flex:1 1 220px;min-width:220px;}
  #${mountId} label{display:block;font-size:13px;margin-bottom:6px;font-weight:600;}
  #${mountId} input[type=text], #${mountId} input[type=email], #${mountId} input[type=tel], #${mountId} textarea, #${mountId} select {
    width:100%; padding:10px 12px;border-radius:999px;border:2px solid #d0d6dd;background:white;box-sizing:border-box;
  }
  #${mountId} textarea{min-height:120px;border-radius:12px;}
  #${mountId} .${ns}-hr{height:1px;background:#d6dde6;margin:18px 0;}
  #${mountId} .${ns}-btn{display:inline-block;padding:12px 18px;border-radius:28px;background:#0a63d6;color:#fff;font-weight:700;border:none;cursor:pointer;}
  #${mountId} .${ns}-muted{color:#6c6f76;font-size:13px;}
  #${mountId} .${ns}-summaryTitle{font-weight:700;margin:0 0 4px 0;}
  #${mountId} .${ns}-centerCol{max-width:1200px;margin:0 auto;padding:0 20px;}
  #${mountId} .${ns}-hidden{display:none;}
  /* responsive */
  @media (max-width:900px){
    #${mountId} .${ns}-tile{width:45%;}
    #${mountId} .${ns}-col{min-width:100%;}
  }
  @media (max-width:480px){
    #${mountId} .${ns}-tile{width:100%;}
    #${mountId} .${ns}-grid{gap:12px;}
  }
  `;
  const style = ce('style'); style.innerText = css; document.head.appendChild(style);

  // ---- build UI skeleton ----
  const mount = document.getElementById(mountId);
  if (!mount) {
    console.error('RAM Service widget: missing mount element with id #' + mountId);
    return;
  }
  mount.classList.add(ns + '-wrap');

  // header
  const header = ce('div', ns + '-center');
  header.innerHTML = `<h2 class="${ns}-heading">Select device category</h2>`;
  mount.appendChild(header);

  // containers
  const categoryWrap = ce('div', ns + '-centerCol');
  const categoryGrid = ce('div', ns + '-grid'); categoryWrap.appendChild(categoryGrid);
  mount.appendChild(categoryWrap);

  // series
  const seriesWrap = ce('div', ns + '-centerCol');
  const seriesTitle = ce('h3', ns + '-heading'); seriesTitle.innerText = 'Select Series';
  const seriesGrid = ce('div', ns + '-grid'); seriesWrap.appendChild(seriesTitle); seriesWrap.appendChild(seriesGrid);
  mount.appendChild(seriesWrap);

  // model pill
  const modelWrap = ce('div', ns + '-centerCol');
  const modelPill = ce('div', ns + '-pill'); modelPill.innerText = 'Select a model from the list...'; modelPill.style.display = 'block'; modelPill.style.width = 'fit-content';
  modelWrap.appendChild(modelPill);
  mount.appendChild(modelWrap);

  // damage types (repairs)
  const damageTitle = ce('h3', ns + '-heading'); damageTitle.innerText = 'Select type of injury';
  const damageGrid = ce('div', ns + '-grid');
  mount.appendChild(damageTitle); mount.appendChild(damageGrid);

  // summary + form area
  const summaryWrap = ce('div', ns + '-centerCol');
  const priceCard = ce('div', ns + '-priceCard'); priceCard.style.marginTop = '20px';
  const cardLeft = ce('div'); const cardRight = ce('div'); cardLeft.innerHTML = `<div class="${ns}-summaryTitle"></div><div class="${ns}-muted"></div>`;
  cardRight.innerHTML = `<div style="text-align:right"><div class="${ns}-muted">Your price:</div><div class="${ns}-summaryPrice" style="font-size:20px;font-weight:800"></div></div>`;
  priceCard.appendChild(cardLeft); priceCard.appendChild(cardRight);
  summaryWrap.appendChild(priceCard);

  const formWrap = ce('div', ns + '-form');
  mount.appendChild(summaryWrap);
  mount.appendChild(formWrap);

  // state
  const state = {
    categories: [],
    series: [],
    selectedCategory: null,
    selectedSeries: null,
    models: [],
    selectedModel: null,
    repairs: [],
    selectedRepair: null,
    price: null
  };

  // ---- render helpers ----
  function clearChildren(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function renderCategories() {
    clearChildren(categoryGrid);
    if (!state.categories || state.categories.length === 0) {
      categoryGrid.appendChild(ce('div')).innerText = 'No categories configured';
      return;
    }
    state.categories.forEach(cat => {
      const t = ce('div', ns + '-tile');
      t.setAttribute('data-slug', cat.slug || '');
      const img = ce('img'); img.src = cat.iconUrl || ''; img.alt = cat.name || '';
      const h = ce('h4'); h.innerText = cat.name;
      t.appendChild(img); t.appendChild(h);
      t.onclick = () => {
        state.selectedCategory = cat;
        // highlight
        Array.from(categoryGrid.children).forEach(c => c.classList.remove('selected'));
        t.classList.add('selected');
        // load series for this category
        loadSeries(cat);
        // reset downstream
        state.selectedSeries = null; state.models = []; state.selectedModel = null; state.repairs = []; state.selectedRepair = null;
        renderSeries([]);
        renderModelsPill(null);
        renderRepairs([]);
        renderForm(false);
      };
      categoryGrid.appendChild(t);
    });
    // scroll into view
    categoryGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderSeries(list) {
    clearChildren(seriesGrid);
    if (!list || list.length === 0) {
      seriesGrid.appendChild(ce('div')).innerText = 'No series';
      return;
    }
    list.forEach(s => {
      const t = ce('div', ns + '-tile');
      const img = ce('img'); img.src = s.iconUrl || ''; img.alt = s.name || '';
      const h = ce('h4'); h.innerText = s.name;
      t.appendChild(img); t.appendChild(h);
      t.onclick = () => {
        state.selectedSeries = s;
        Array.from(seriesGrid.children).forEach(c => c.classList.remove('selected'));
        t.classList.add('selected');
        // load models for series
        loadModelsForSeries(s._id);
        // reset
        state.selectedModel = null; state.repairs = []; state.selectedRepair = null;
        renderModelsPill(null);
        renderRepairs([]);
        renderForm(false);
      };
      seriesGrid.appendChild(t);
    });
    seriesGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderModelsPill(model) {
    if (!model) {
      modelPill.innerText = 'Select a model from the list...';
      modelPill.classList.remove('selected');
      return;
    }
    modelPill.innerText = model.name;
    modelPill.classList.add('selected');
  }

  function renderRepairs(list) {
    clearChildren(damageGrid);
    if (!list || list.length === 0) {
      damageGrid.appendChild(ce('div')).innerText = 'No repair options';
      return;
    }
    list.forEach(r => {
      const t = ce('div', ns + '-tile');
      const img = ce('img'); img.src = (r.images && r.images[0]) || ''; img.alt = r.name || '';
      const h = ce('h4'); h.innerText = r.name;
      const sub = ce('div'); sub.className = ns + '-muted'; sub.style.marginTop = '8px';
      // priceEffective may be included by API (server code tries to provide)
      const pe = r.priceEffective !== undefined ? r.priceEffective : r.basePrice;
      sub.innerText = (pe ? money(pe) : 'Pokličite za ceno');
      t.appendChild(img); t.appendChild(h); t.appendChild(sub);
      t.onclick = () => {
        state.selectedRepair = r;
        // compute live price
        computeEffectivePrice();
        Array.from(damageGrid.children).forEach(c => c.classList.remove('selected'));
        t.classList.add('selected');
        // show form
        renderForm(true);
        // scroll to form
        formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      damageGrid.appendChild(t);
    });
    damageGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---- form rendering (full fields) ----
  function renderForm(show) {
    clearChildren(formWrap);
    if (!show) return;
    // top summary
    const top = ce('div'); top.className = ns + '-row';
    top.style.marginBottom = '12px';
    const left = ce('div', ns + '-col');
    left.innerHTML = `<div style="display:flex;gap:14px;align-items:center;">
      <div style="width:120px"><img src="${(state.selectedModel && state.selectedModel.imageUrl) || ''}" style="width:100%;height:auto;object-fit:contain" /></div>
      <div>
        <div style="font-weight:900;font-size:16px">${state.selectedModel ? state.selectedModel.name : ''}</div>
        <div class="${ns}-muted">${state.selectedModel ? state.selectedModel.brand || '' : ''}</div>
      </div>
    </div>`;
    const right = ce('div', ns + '-col');
    right.innerHTML = `<div class="${ns}-muted">This is how much the repair costs</div>
      <div style="font-weight:900;font-size:20px;margin-top:6px">${state.selectedRepair ? state.selectedRepair.name : ''}</div>
      <div style="margin-top:10px;font-size:20px" class="${ns}-summaryPrice">${state.price ? money(state.price) : 'Pokličite za ceno'}</div>`;
    top.appendChild(left); top.appendChild(right);
    formWrap.appendChild(top);

    // header
    const header = ce('h3'); header.innerText = 'REPAIR FORM'; formWrap.appendChild(header);

    // contact info grid (match fields)
    const grid = ce('div', ns + '-row');
    grid.style.marginBottom = '12px';

    // columns like your Liquid: company, tax, name, address, postal+city, email, phone
    const makeField = (labelText, name, type = 'text', placeholder = '', required = false) => {
      const c = ce('div', ns + '-col');
      const lab = ce('label'); lab.innerText = labelText + (required ? ' *' : '');
      const inp = (type === 'textarea') ? ce('textarea') : ce('input');
      if (type !== 'textarea') inp.type = type;
      inp.name = name; inp.placeholder = placeholder;
      if (required) inp.setAttribute('data-required', '1');
      c.appendChild(lab); c.appendChild(inp);
      return c;
    };

    grid.appendChild(makeField('Company', 'company', 'text', 'Company'));
    grid.appendChild(makeField('Company Tax Number', 'tax_number', 'text', 'Tax Number'));
    grid.appendChild(makeField('Full name', 'full_name', 'text', 'Full name'));
    grid.appendChild(makeField('Street and house number', 'address', 'text', 'Street and house number'));
    grid.appendChild(makeField('Postal code and city', 'postal_city', 'text', 'Postal code and city'));
    grid.appendChild(makeField('Email', 'email', 'email', 'Email', true));
    grid.appendChild(makeField('Contact phone number', 'phone', 'tel', 'Contact phone number', true));

    formWrap.appendChild(grid);

    // spacer
    formWrap.appendChild(ce('div', ns + '-hr'));

    // Device fields
    const deviceRow = ce('div', ns + '-row');
    deviceRow.appendChild(makeField('Device manufacturer and model', 'device_model', 'text', 'Manufacturer and model', true));
    deviceRow.appendChild(makeField('IMEI/Serial number', 'imei', 'text', 'IMEI/Serial number'));
    formWrap.appendChild(deviceRow);

    // radios groups row (three groups)
    const radiosRow = ce('div', ns + '-row');
    const makeRadioGroup = (labelText, name, opts) => {
      const wrap = ce('div', ns + '-col');
      const lab = ce('label'); lab.innerText = labelText; wrap.appendChild(lab);
      const inner = ce('div'); inner.style.display = 'flex'; inner.style.gap = '12px';
      opts.forEach(o => {
        const lbl = ce('label'); lbl.style.fontWeight = '600';
        const r = ce('input'); r.type = 'radio'; r.name = name; r.value = o.value;
        lbl.appendChild(r); lbl.appendChild(document.createTextNode(' ' + o.label));
        inner.appendChild(lbl);
      });
      wrap.appendChild(inner); return wrap;
    };
    radiosRow.appendChild(makeRadioGroup('Type of repair (check as appropriate)', 'repair_type', [{ value: 'warranty', label: 'Warranty' }, { value: 'out', label: 'Out of warranty' }]));
    radiosRow.appendChild(makeRadioGroup('Completed warranty card', 'warranty_card', [{ value: 'YES', label: 'DA' }, { value: 'NO', label: 'NE' }]));
    radiosRow.appendChild(makeRadioGroup('Invoice with IMEI/Serial number', 'receipt', [{ value: 'YES', label: 'DA' }, { value: 'NO', label: 'NE' }]));
    formWrap.appendChild(radiosRow);

    // note text
    const note = ce('div'); note.className = ns + '-muted'; note.style.margin = '12px 0';
    note.innerHTML = `<small><b>Note:</b> Data transfer is an additional paid service... (you can replace this text in admin later)</small>`;
    formWrap.appendChild(note);

    // PIN + pattern row
    const pinRow = ce('div', ns + '-row');
    const pinCol = ce('div', ns + '-col'); pinCol.appendChild(makeField('PIN', 'pin', 'text', 'PIN'));
    const patCol = ce('div', ns + '-col');
    const patLabel = ce('label'); patLabel.innerText = 'Pattern'; patCol.appendChild(patLabel);
    const patBox = ce('div'); patBox.style.width = '150px'; patBox.style.height = '150px'; patBox.style.border = '2px dashed #d0d6dd'; patBox.style.borderRadius = '8px'; patBox.style.display = 'flex'; patBox.style.alignItems = 'center'; patBox.style.justifyContent = 'center';
    patBox.innerHTML = '<div class="' + ns + '-muted">pattern</div>'; patCol.appendChild(patBox);
    pinRow.appendChild(pinCol); pinRow.appendChild(patCol);
    formWrap.appendChild(pinRow);

    // Service type (select)
    const serviceRow = ce('div', ns + '-row');
    const serviceCol = ce('div', ns + '-col');
    const serviceLab = ce('label'); serviceLab.innerText = 'How to get to the Service';
    const serviceSel = ce('select'); serviceSel.name = 'service_type';
    ['Personal delivery', 'Shipping'].forEach(v => { const o = document.createElement('option'); o.value = v; o.innerText = v; serviceSel.appendChild(o); });
    serviceCol.appendChild(serviceLab); serviceCol.appendChild(serviceSel);
    formWrap.appendChild(serviceRow); serviceRow.appendChild(serviceCol);

    // Description
    formWrap.appendChild(ce('div', ns + '-hr'));
    const descCol = ce('div'); descCol.appendChild(makeField('Opis napake / Error description', 'body', 'textarea', 'Opis napake'));
    formWrap.appendChild(descCol);

    // Big note (terms) and signature
    const terms = ce('div'); terms.className = ns + '-muted'; terms.style.margin = '12px 0'; terms.innerHTML = '<small><b>Note:</b> For warranty repairs it is mandatory to attach ...</small>';
    formWrap.appendChild(terms);

    const signRow = ce('div', ns + '-row');
    signRow.appendChild(makeField('Signature', 'signature', 'text', 'Signature'));
    formWrap.appendChild(signRow);

    // submit
    const submitRow = ce('div'); submitRow.style.textAlign = 'left'; submitRow.style.marginTop = '16px';
    const btn = ce('button'); btn.className = ns + '-btn'; btn.innerText = 'Request repair';
    btn.onclick = onSubmit;
    submitRow.appendChild(btn);
    formWrap.appendChild(submitRow);

    // populate some default values
    // set hidden fields for category/model/repair
    formWrap.dataset.category = state.selectedCategory ? state.selectedCategory.slug : '';
    formWrap.dataset.series = state.selectedSeries ? (state.selectedSeries._id || '') : '';
    formWrap.dataset.modelId = state.selectedModel ? (state.selectedModel._id || '') : '';
    formWrap.dataset.repairCode = state.selectedRepair ? (state.selectedRepair.code || '') : '';

    // update summary price text
    const priceEl = q('.' + ns + '-summaryPrice', formWrap);
    if (priceEl) priceEl.innerText = (state.price ? money(state.price) : 'Pokličite za ceno');
  }

  // ---- compute effective price using precedence: model override > repair.basePrice > CALL_FOR_PRICE
  function computeEffectivePrice() {
    let price = null;
    const r = state.selectedRepair;
    if (!r) { state.price = null; updatePriceCard(); return; }
    // try model override
    if (state.selectedModel && state.selectedModel.priceOverrides && Array.isArray(state.selectedModel.priceOverrides)) {
      const ov = state.selectedModel.priceOverrides.find(o => (o.repairOptionCode && (o.repairOptionCode === r.code)) || (o.repairOptionId && String(o.repairOptionId) === String(r._id)));
      if (ov && (ov.price !== undefined && ov.price !== null)) price = ov.price;
    }
    // fallback to repair.basePrice
    if (price === null || price === undefined) {
      if (r.priceEffective !== undefined) price = r.priceEffective;
      else if (r.basePrice !== undefined && r.basePrice !== null) price = r.basePrice;
    }
    state.price = price || null;
    updatePriceCard();
  }
  function updatePriceCard() {
    const pEls = document.getElementsByClassName(ns + '-summaryPrice');
    for (let i = 0; i < pEls.length; i++) {
      pEls[i].innerText = state.price ? money(state.price) : 'Pokličite za ceno';
    }
  }

  // ---- loaders ----
  function loadCategories() {
    apiGET('/api/categories').then(list => {
      state.categories = list || [];
      renderCategories();
    }).catch(err => {
      console.error('categories err', err);
      categoryGrid.innerText = 'Failed to load categories';
    });
  }

  function loadSeries(category) {
    // try GET /api/series filtered server-side if available; otherwise we can call /api/series and filter client-side
    apiGET('/api/series').then(list => {
      // filter by category if series has "category" property
      const filtered = (list || []).filter(s => {
        if (!category) return true;
        if (!s.category) return true;
        // category may be stored as slug or id — accept either
        return s.category === category.slug || s.category === category._id || (s.category && s.category._id === category._id);
      });
      state.series = filtered;
      renderSeries(filtered);
    }).catch(err => {
      console.error('series err', err);
      seriesGrid.innerText = 'Failed to load series';
    });
  }

  function loadModelsForSeries(seriesId) {
    if (!seriesId) return;
    apiGET('/api/series/' + encodeURIComponent(seriesId) + '/models').then(list => {
      state.models = list || [];
      // show model pill drop-in: if many models, show the select modal — for simplicity use a native select dropdown inside a small modal-like area
      // Build a select dropdown in place of pill
      const select = ce('select'); select.style.width = '360px'; select.style.padding = '12px 18px'; select.style.borderRadius = '40px'; select.style.border = '2px solid #121212';
      const emptyOpt = ce('option'); emptyOpt.value = ''; emptyOpt.innerText = 'Bitte wählen…'; select.appendChild(emptyOpt);
      list.forEach(m => {
        const o = ce('option'); o.value = m._id || m.slug || m.name; o.innerText = m.name; select.appendChild(o);
      });
      clearChildren(modelWrap); modelWrap.appendChild(select);
      select.onchange = () => {
        const id = select.value;
        const model = list.find(x => x._id === id || x.slug === id) || null;
        state.selectedModel = model;
        renderModelsPill(model);
        // load repairs for model
        loadRepairsForModel(model ? (model._id || model.slug) : null);
      };
      select.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }).catch(err => {
      console.error('models for series err', err);
      modelWrap.innerText = 'Failed to load models';
    });
  }

  function loadRepairsForModel(modelId) {
    if (!modelId) return;
    apiGET('/api/repairs?modelId=' + encodeURIComponent(modelId)).then(list => {
      // ensure repairs have code/name
      state.repairs = list || [];
      renderRepairs(state.repairs);
    }).catch(err => {
      console.error('repairs err', err);
      damageGrid.innerText = 'Failed to load repairs';
    });
  }

  // ---- submit handler ----
  function collectFormData() {
    const inputs = formWrap.querySelectorAll('input, textarea, select');
    const contact = {};
    inputs.forEach(i => {
      const name = i.name;
      if (!name) return;
      if (i.type === 'radio') {
        if (!contact[name]) {
          // pick checked
          const c = formWrap.querySelector('input[name="' + name + '"]:checked');
          contact[name] = c ? c.value : '';
        }
      } else {
        contact[name] = i.value;
      }
    });
    return {
      contact,
      category: state.selectedCategory ? state.selectedCategory.slug : '',
      seriesId: state.selectedSeries ? (state.selectedSeries._id || '') : '',
      modelId: state.selectedModel ? (state.selectedModel._id || '') : '',
      repair_code: state.selectedRepair ? (state.selectedRepair.code || state.selectedRepair._id) : '',
      metadata: {
        priceComputed: state.price,
        widgetAt: window.location.href
      }
    };
  }

  function validateForm() {
    // check required fields (data-required attr)
    let ok = true;
    const required = formWrap.querySelectorAll('[data-required="1"]');
    required.forEach(r => {
      if (!r.value || r.value.trim() === '') {
        ok = false;
        r.style.borderColor = 'red';
      } else {
        r.style.borderColor = '';
      }
    });
    if (!state.selectedModel) {
      ok = false;
      alert('Please select a model.');
    }
    if (!state.selectedRepair) {
      ok = false;
      alert('Please select a repair type.');
    }
    return ok;
  }

  function onSubmit(evt) {
    if (!validateForm()) return;
    const payload = collectFormData();
    // disable button and show loading
    const btn = formWrap.querySelector('.' + ns + '-btn');
    btn.disabled = true; btn.innerText = 'Sending...';
    apiPOST('/api/submit', payload).then(res => {
      btn.disabled = false; btn.innerText = 'Request repair';
      // show confirmation
      clearChildren(mount);
      const okWrap = ce('div', ns + '-center'); okWrap.style.padding = '30px 10px';
      const title = ce('h2'); title.innerText = 'Thank you — request received';
      const p = ce('p'); p.className = ns + '-muted'; p.innerHTML = `We created request <strong>${res.id || res._id || '—'}</strong>. Price: <strong>${res.price ? (Number.isInteger(res.price) ? (res.price/100).toLocaleString() + ' €' : String(res.price)) : 'CALL_FOR_PRICE'}</strong>`;
      okWrap.appendChild(title); okWrap.appendChild(p);
      mount.appendChild(okWrap);
    }).catch(err => {
      btn.disabled = false; btn.innerText = 'Request repair';
      console.error('submit err', err);
      alert('Submission failed: ' + (err && err.error ? err.error : (err && err.message ? err.message : 'Unknown error')));
    });
  }

  // ---- init ----
  loadCategories();

})();
