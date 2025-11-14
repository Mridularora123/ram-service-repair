// RAM Service Repair storefront widget (updated to strict Category->Series->Model->Repairs flow)
(function () {
  // ---- CONFIG ----------
  const API_BASE = (window.RAM_SERVICE_API_BASE || '').replace(/\/$/, '') || 'https://ram-service-repair1.onrender.com';
  const mountId = 'ram-service-widget';
  const ns = 'ramsvc'; // CSS namespace

  // ---- helpers ----
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

  // ---- inject CSS ----
  const css = `
  #${mountId} {font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#111; box-sizing:border-box;}
  #${mountId} .${ns}-centerCol{max-width:1050px;margin:0 auto;padding:28px 20px;}
  #${mountId} .${ns}-wrap{padding:28px 0;}
  #${mountId} .${ns}-panel{background:#eef6ff;border-radius:12px;padding:28px;margin-bottom:28px;border:1px solid rgba(13,44,84,0.04);}
  #${mountId} .${ns}-headingTop{font-size:28px;text-align:center;margin-bottom:18px;font-weight:800;}
  #${mountId} .${ns}-sub{color:#6c6f76;font-weight:600;font-size:14px;margin-bottom:12px;text-align:center;}
  #${mountId} .${ns}-grid{display:flex;flex-wrap:wrap;gap:26px;justify-content:center;margin:18px 0;}
  #${mountId} .${ns}-tile{width:220px;height:220px;background:#ecf3ff;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px;cursor:pointer;transition:transform .14s,box-shadow .14s;border:1px solid rgba(10,20,40,0.04);}
  #${mountId} .${ns}-tile:hover{transform:translateY(-6px);box-shadow:0 18px 36px rgba(10,20,40,0.06);}
  #${mountId} .${ns}-tile.selected{background:#cfd8e6;border:2px solid rgba(10,20,40,0.06);}
  #${mountId} .${ns}-tile img{max-height:96px;max-width:120px;object-fit:contain;margin-bottom:10px;opacity:.98;}
  #${mountId} .${ns}-tile h4{margin:0;font-size:15px;font-weight:700;text-align:center;color:#0b1724;}
  #${mountId} .${ns}-pill{display:inline-block;border-radius:999px;padding:12px 30px;border:2px solid #061130;background:#fff;font-weight:700;margin:12px auto;cursor:pointer;min-width:360px;max-width:90%;text-align:center;}
  #${mountId} .${ns}-priceCard{background:#eef6ff;padding:20px;border-radius:10px;display:flex;gap:18px;align-items:center;justify-content:space-between;border:1px solid rgba(10,20,40,0.04);}
  #${mountId} .${ns}-form{max-width:1000px;margin:18px auto 0;background:#eef6ff;padding:22px;border-radius:10px;border:1px solid rgba(10,20,40,0.04);}
  #${mountId} .${ns}-row{display:flex;gap:14px;flex-wrap:wrap;}
  #${mountId} .${ns}-col{flex:1 1 220px;min-width:220px;}
  #${mountId} label{display:block;font-size:13px;margin-bottom:6px;font-weight:700;color:#26313b;}
  #${mountId} input[type=text], #${mountId} input[type=email], #${mountId} input[type=tel], #${mountId} textarea, #${mountId} select { width:100%; padding:12px 16px;border-radius:999px;border:2px solid rgba(10,20,40,0.06);background:#fff;box-sizing:border-box;font-size:14px; }
  #${mountId} textarea{min-height:120px;border-radius:12px;padding:14px;}
  #${mountId} .${ns}-hr{height:1px;background:rgba(10,20,40,0.06);margin:18px 0;border-radius:2px;}
  #${mountId} .${ns}-btn{display:inline-block;padding:12px 24px;border-radius:28px;background:#0a63d6;color:#fff;font-weight:800;border:none;cursor:pointer;box-shadow:0 8px 18px rgba(10,20,40,0.08);}
  #${mountId} .${ns}-muted{color:#6c6f76;font-size:13px;}
  #${mountId} .${ns}-summaryTitle{font-weight:800;margin:0 0 6px 0;font-size:15px;}
  #${mountId} .${ns}-summaryPrice{font-size:22px;font-weight:900;}
  #${mountId} .${ns}-hidden{display:none;}
  @media (max-width:980px){
    #${mountId} .${ns}-tile{width:45%;}
    #${mountId} .${ns}-col{min-width:100%;}
    #${mountId} .${ns}-pill{min-width:300px;}
  }
  @media (max-width:480px){
    #${mountId} .${ns}-tile{width:100%;height:180px;}
    #${mountId} .${ns}-grid{gap:12px;}
    #${mountId} .${ns}-pill{min-width:200px;padding:10px 16px;}
  }
  `;
  const style = ce('style'); style.innerText = css; document.head.appendChild(style);

  // ---- build skeleton ----
  const mount = document.getElementById(mountId);
  if (!mount) {
    console.error('RAM Service widget: missing mount element with id #' + mountId);
    return;
  }
  mount.classList.add(ns + '-wrap');

  const centerCol = ce('div', ns + '-centerCol');
  mount.appendChild(centerCol);

  // header area
  const headerPanel = ce('div', ns + '-panel');
  headerPanel.innerHTML = `<div class="${ns}-headingTop">Select device category</div><div class="${ns}-sub">Choose category → series → model → repair → submit</div>`;
  centerCol.appendChild(headerPanel);

  // category grid
  const categoryPanel = ce('div', ns + '-panel');
  const categoryGrid = ce('div', ns + '-grid'); categoryPanel.appendChild(categoryGrid);
  centerCol.appendChild(categoryPanel);

  // model pill / series area
  const modelPanel = ce('div', ns + '-panel');
  modelPanel.style.textAlign = 'center';
  const modelPill = ce('div', ns + '-pill'); modelPill.innerText = 'Select a model from the list...';
  modelPanel.appendChild(modelPill);
  centerCol.appendChild(modelPanel);

  // damage types
  const damagePanel = ce('div', ns + '-panel');
  const damageTitle = ce('div'); damageTitle.className = ns + '-headingTop'; damageTitle.innerText = 'Select type of injury';
  damagePanel.appendChild(damageTitle);
  const damageGrid = ce('div', ns + '-grid'); damagePanel.appendChild(damageGrid);
  centerCol.appendChild(damagePanel);

  // price + summary card
  const summaryPanel = ce('div', ns + '-panel');
  const priceCard = ce('div', ns + '-priceCard');
  priceCard.innerHTML = `<div><div class="${ns}-summaryTitle">Repair selection</div><div class="${ns}-muted">Choose options to see price</div></div>
    <div style="text-align:right"><div class="${ns}-muted">Your price</div><div class="${ns}-summaryPrice">CALL_FOR_PRICE</div></div>`;
  summaryPanel.appendChild(priceCard);
  centerCol.appendChild(summaryPanel);

  // form panel (hidden until damage selected)
  const formWrap = ce('div', ns + '-form');
  formWrap.classList.add(ns + '-hidden');
  centerCol.appendChild(formWrap);

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

  // ---- render functions ----
  function clearChildren(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function renderCategories() {
    clearChildren(categoryGrid);
    if (!state.categories || state.categories.length === 0) {
      categoryGrid.appendChild(ce('div')).innerText = 'No categories';
      return;
    }
    state.categories.forEach(cat => {
      const t = ce('div', ns + '-tile');
      t.setAttribute('data-slug', cat.slug || '');
      const img = ce('img'); img.src = cat.iconUrl || cat.image || ''; img.alt = cat.name || '';
      const h = ce('h4'); h.innerText = cat.name;
      t.appendChild(img); t.appendChild(h);
      t.onclick = () => {
        state.selectedCategory = cat;
        qa('.' + ns + '-tile', categoryGrid).forEach(c => c.classList.remove('selected'));
        t.classList.add('selected');
        // fetch series for THIS category (strict)
        loadSeriesForCategory(cat);
        // reset downstream
        state.selectedSeries = null; state.models = []; state.selectedModel = null; state.repairs = []; state.selectedRepair = null;
        renderModelsPill(null);
        renderRepairs([]);
        hideForm();
      };
      categoryGrid.appendChild(t);
    });
    categoryGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderSeries(list) {
    let seriesRow = mount.querySelector('.' + ns + '-seriesRow');
    if (!seriesRow) {
      seriesRow = ce('div', ns + '-grid ' + ns + '-seriesRow');
      seriesRow.style.marginTop = '8px';
      categoryGrid.parentNode.insertBefore(seriesRow, categoryGrid.nextSibling);
    }
    clearChildren(seriesRow);
    if (!list || list.length === 0) {
      const noMsg = ce('div'); noMsg.style.padding = '18px'; noMsg.style.textAlign = 'center'; noMsg.style.width = '100%';
      noMsg.innerText = 'No series found for this category.';
      seriesRow.appendChild(noMsg);
      return;
    }
    list.forEach(s => {
      const t = ce('div', ns + '-tile');
      const img = ce('img'); img.src = s.iconUrl || s.image || ''; img.alt = s.name || '';
      const h = ce('h4'); h.innerText = s.name;
      t.appendChild(img); t.appendChild(h);
      t.onclick = () => {
        state.selectedSeries = s;
        qa('.' + ns + '-tile', seriesRow).forEach(c => c.classList.remove('selected'));
        t.classList.add('selected');
        // load models for series (strict)
        loadModelsForSeries(s._id);
        // reset
        state.selectedModel = null; state.repairs = []; state.selectedRepair = null;
        renderModelsPill(null);
        renderRepairs([]);
        hideForm(false);
      };
      seriesRow.appendChild(t);
    });
    seriesRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }


  function renderModelsPill(model) {
    if (!model) {
      modelPill.innerText = 'Select a model from the list...';
      modelPill.classList.remove('selected');
      modelPill.style.border = '2px solid #061130';
      modelPill.onclick = () => {
        if (state.models && state.models.length) {
          openModelSelect();
        } else {
          // no models loaded yet
          alert('Please choose a series first.');
        }
      };
      return;
    }
    modelPill.innerText = `${model.name}${model.brand ? ' — ' + model.brand : ''}`;
    modelPill.classList.add('selected');
    modelPill.style.border = '2px dashed rgba(0,0,0,0.06)';
    modelPill.onclick = openModelSelect;
  }

  function openModelSelect() {
    const existing = document.getElementById(ns + '-model-select-popup');
    if (existing) { existing.remove(); return; }
    const popup = ce('div'); popup.id = ns + '-model-select-popup';
    popup.style.position = 'fixed'; popup.style.left = '50%'; popup.style.top = '50%';
    popup.style.transform = 'translate(-50%,-50%)'; popup.style.zIndex = 99999;
    popup.style.background = '#fff'; popup.style.borderRadius = '12px'; popup.style.padding = '18px'; popup.style.boxShadow = '0 30px 60px rgba(10,20,40,.12)';
    popup.style.maxHeight = '70vh'; popup.style.overflow = 'auto'; popup.style.minWidth = '320px';
    const title = ce('div'); title.style.fontWeight = 800; title.style.marginBottom = '12px'; title.innerText = 'Select model';
    popup.appendChild(title);
    state.models.forEach(m => {
      const btn = ce('button'); btn.style.display = 'block'; btn.style.width = '100%'; btn.style.padding = '10px 12px'; btn.style.marginBottom = '8px';
      btn.style.borderRadius = '10px'; btn.style.border = '1px solid rgba(10,20,40,.06)'; btn.style.background = '#f8fbff';
      btn.innerText = m.name + (m.brand ? ' — ' + m.brand : '');
      btn.onclick = () => {
        state.selectedModel = m;
        renderModelsPill(m);
        // load repairs for this model strictly
        loadRepairsForModel(m._id || m.slug || m.name);
        popup.remove();
      };
      popup.appendChild(btn);
    });
    const close = ce('button'); close.innerText = 'Close'; close.style.marginTop = '6px';
    close.onclick = () => popup.remove();
    popup.appendChild(close);
    document.body.appendChild(popup);
  }

  function renderRepairs(list) {
    clearChildren(damageGrid);
    if (!list || list.length === 0) {
      damageGrid.appendChild(ce('div')).innerText = 'No repair options';
      return;
    }
    list.forEach(r => {
      const t = ce('div', ns + '-tile');
      const img = ce('img'); img.src = (r.images && r.images[0]) || r.iconUrl || ''; img.alt = r.name || '';
      const h = ce('h4'); h.innerText = r.name;
      const sub = ce('div'); sub.className = ns + '-muted'; sub.style.marginTop = '8px';
      const pe = (r.priceEffective !== undefined && r.priceEffective !== null) ? r.priceEffective : r.basePrice;
      sub.innerText = (pe && pe !== 'CALL_FOR_PRICE') ? money(pe) : 'CALL_FOR_PRICE';
      t.appendChild(img); t.appendChild(h); t.appendChild(sub);
      t.onclick = () => {
        state.selectedRepair = r;
        computeEffectivePrice();
        qa('.' + ns + '-tile', damageGrid).forEach(c => c.classList.remove('selected'));
        t.classList.add('selected');
        showForm();
        formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      damageGrid.appendChild(t);
    });
    damageGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---- price computation ----
  function computeEffectivePrice() {
    let price = null;
    const r = state.selectedRepair;
    if (!r) { state.price = null; updatePriceCard(); return; }
    if (state.selectedModel && state.selectedModel.priceOverrides && Array.isArray(state.selectedModel.priceOverrides)) {
      const ov = state.selectedModel.priceOverrides.find(o => (o.repairOptionCode && (o.repairOptionCode === r.code)) || (o.repairOptionId && String(o.repairOptionId) === String(r._id)));
      if (ov && (ov.price !== undefined && ov.price !== null)) price = ov.price;
    }
    if (price === null || price === undefined) {
      if (r.priceEffective !== undefined && r.priceEffective !== null) price = r.priceEffective;
      else if (r.basePrice !== undefined && r.basePrice !== null) price = r.basePrice;
    }
    state.price = price || null;
    updatePriceCard();
  }
  function updatePriceCard() {
    const pEls = document.getElementsByClassName(ns + '-summaryPrice');
    for (let i = 0; i < pEls.length; i++) {
      pEls[i].innerText = state.price ? money(state.price) : 'CALL_FOR_PRICE';
    }
    const titleEl = mount.querySelector('.' + ns + '-summaryTitle');
    if (titleEl) titleEl.innerText = state.selectedModel ? (state.selectedModel.name || '') : 'Repair selection';
  }

  // ---- form rendering ----
  function hideForm() {
    formWrap.classList.add(ns + '-hidden');
    clearChildren(formWrap);
  }
  function showForm() {
    clearChildren(formWrap);
    formWrap.classList.remove(ns + '-hidden');

    const top = ce('div'); top.className = ns + '-row';
    top.style.marginBottom = '12px';
    const left = ce('div', ns + '-col');
    left.innerHTML = `<div style="display:flex;gap:14px;align-items:center;">
      <div style="width:120px"><img src="${(state.selectedModel && state.selectedModel.imageUrl) || ''}" style="width:100%;height:auto;object-fit:contain;border-radius:8px;background:#fff;padding:6px" /></div>
      <div>
        <div style="font-weight:900;font-size:16px">${state.selectedModel ? state.selectedModel.name : ''}</div>
        <div class="${ns}-muted">${state.selectedModel ? state.selectedModel.brand || '' : ''}</div>
      </div>
    </div>`;
    const right = ce('div', ns + '-col');
    right.innerHTML = `<div class="${ns}-muted">This is how much the repair costs</div>
      <div style="font-weight:900;font-size:20px;margin-top:6px">${state.selectedRepair ? state.selectedRepair.name : ''}</div>
      <div style="margin-top:10px;font-size:20px" class="${ns}-summaryPrice">${state.price ? money(state.price) : 'CALL_FOR_PRICE'}</div>`;
    top.appendChild(left); top.appendChild(right);
    formWrap.appendChild(top);

    const header = ce('h3'); header.innerText = 'REPAIR FORM'; header.style.margin = '12px 0';
    formWrap.appendChild(header);

    const grid = ce('div', ns + '-row');
    grid.style.marginBottom = '12px';
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

    formWrap.appendChild(ce('div', ns + '-hr'));

    const deviceRow = ce('div', ns + '-row');
    deviceRow.appendChild(makeField('Device manufacturer and model', 'device_model', 'text', 'Manufacturer and model', true));
    deviceRow.appendChild(makeField('IMEI/Serial number', 'imei', 'text', 'IMEI/Serial number'));
    formWrap.appendChild(deviceRow);

    const radiosRow = ce('div', ns + '-row');
    const makeRadioGroup = (labelText, name, opts) => {
      const wrap = ce('div', ns + '-col');
      const lab = ce('label'); lab.innerText = labelText; wrap.appendChild(lab);
      const inner = ce('div'); inner.style.display = 'flex'; inner.style.gap = '12px';
      opts.forEach(o => {
        const lbl = ce('label'); lbl.style.fontWeight = '700'; lbl.style.display = 'flex'; lbl.style.alignItems = 'center'; lbl.style.gap = '8px';
        const r = ce('input'); r.type = 'radio'; r.name = name; r.value = o.value;
        lbl.appendChild(r); lbl.appendChild(document.createTextNode(o.label));
        inner.appendChild(lbl);
      });
      wrap.appendChild(inner); return wrap;
    };
    radiosRow.appendChild(makeRadioGroup('Type of repair', 'repair_type', [{ value: 'warranty', label: 'Warranty' }, { value: 'out', label: 'Out of warranty' }]));
    radiosRow.appendChild(makeRadioGroup('Completed warranty card', 'warranty_card', [{ value: 'YES', label: 'YES' }, { value: 'NO', label: 'NO' }]));
    radiosRow.appendChild(makeRadioGroup('Invoice with IMEI', 'receipt', [{ value: 'YES', label: 'YES' }, { value: 'NO', label: 'NO' }]));
    formWrap.appendChild(radiosRow);

    const note = ce('div'); note.className = ns + '-muted'; note.style.margin = '12px 0';
    note.innerHTML = `<small><b>Note:</b> Data transfer/preservation is an optional paid service. (Replace in admin later)</small>`;
    formWrap.appendChild(note);

    const pinRow = ce('div', ns + '-row');
    const pinCol = ce('div', ns + '-col'); pinCol.appendChild(makeField('PIN', 'pin', 'text', 'PIN'));
    const patCol = ce('div', ns + '-col');
    const patLabel = ce('label'); patLabel.innerText = 'Pattern'; patCol.appendChild(patLabel);
    const patBox = ce('div'); patBox.style.width = '150px'; patBox.style.height = '150px'; patBox.style.border = '2px dashed rgba(10,20,40,.06)'; patBox.style.borderRadius = '8px'; patBox.style.display = 'flex'; patBox.style.alignItems = 'center'; patBox.style.justifyContent = 'center';
    patBox.innerHTML = '<div class="' + ns + '-muted">pattern</div>'; patCol.appendChild(patBox);
    pinRow.appendChild(pinCol); pinRow.appendChild(patCol);
    formWrap.appendChild(pinRow);

    const serviceRow = ce('div', ns + '-row');
    const serviceCol = ce('div', ns + '-col');
    const serviceLab = ce('label'); serviceLab.innerText = 'How to get to the Service';
    const serviceSel = ce('select'); serviceSel.name = 'service_type';
    ['Personal delivery', 'Shipping'].forEach(v => { const o = document.createElement('option'); o.value = v; o.innerText = v; serviceSel.appendChild(o); });
    serviceCol.appendChild(serviceLab); serviceCol.appendChild(serviceSel);
    serviceRow.appendChild(serviceCol);
    formWrap.appendChild(serviceRow);

    formWrap.appendChild(ce('div', ns + '-hr'));
    const descCol = ce('div'); descCol.appendChild(makeField('Error description', 'body', 'textarea', 'Describe the problem'));
    formWrap.appendChild(descCol);

    formWrap.appendChild(ce('div', ns + '-hr'));
    const signRow = ce('div', ns + '-row');
    signRow.appendChild(makeField('Signature', 'signature', 'text', 'Signature'));
    formWrap.appendChild(signRow);

    const submitRow = ce('div'); submitRow.style.textAlign = 'left'; submitRow.style.marginTop = '16px';
    const btn = ce('button'); btn.className = ns + '-btn'; btn.innerText = 'Request repair';
    btn.onclick = onSubmit;
    submitRow.appendChild(btn);
    formWrap.appendChild(submitRow);

    formWrap.dataset.category = state.selectedCategory ? state.selectedCategory.slug : '';
    formWrap.dataset.series = state.selectedSeries ? (state.selectedSeries._id || '') : '';
    formWrap.dataset.modelId = state.selectedModel ? (state.selectedModel._id || '') : '';
    formWrap.dataset.repairCode = state.selectedRepair ? (state.selectedRepair.code || '') : '';
  }

  // ---- submission ----
  function collectFormData() {
    const inputs = formWrap.querySelectorAll('input, textarea, select');
    const contact = {};
    inputs.forEach(i => {
      const name = i.name;
      if (!name) return;
      if (i.type === 'radio') {
        if (!contact[name]) {
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
    const btn = formWrap.querySelector('.' + ns + '-btn');
    btn.disabled = true; btn.innerText = 'Sending...';
    apiPOST('/api/submit', payload).then(res => {
      btn.disabled = false; btn.innerText = 'Request repair';
      clearChildren(mount);
      const okWrap = ce('div', ns + '-centerCol'); okWrap.style.padding = '30px 10px';
      okWrap.innerHTML = `<div style="text-align:center;padding:40px;"><h2>Thank you — request received</h2><p class="${ns}-muted">We created request <strong>${res.id || res._id || '—'}</strong>. Price: <strong>${res.price ? (Number.isInteger(res.price) ? (res.price / 100).toLocaleString() + ' €' : String(res.price)) : 'CALL_FOR_PRICE'}</strong></p></div>`;
      mount.appendChild(okWrap);
    }).catch(err => {
      btn.disabled = false; btn.innerText = 'Request repair';
      console.error('submit err', err);
      alert('Submission failed: ' + (err && (err.error || err.message) ? (err.error || err.message) : 'Unknown error'));
    });
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

  // NEW: load series for THIS category by passing category param (server will return only those series)
  // NEW: load series for THIS category by passing category param (server will return only those series)
  function loadSeriesForCategory(category) {
    if (!category) return;
    const param = encodeURIComponent(category.slug || category._id || category.name || '');
    console.log('[ramsvc] loadSeriesForCategory -> category param:', param, 'category object:', category);

    // First try the strict server-side request
    apiGET('/api/series?category=' + param).then(list => {
      console.log('[ramsvc] /api/series?category returned', list && list.length ? list.length : 0, 'items', list);
      state.series = list || [];
      renderSeries(state.series);

      // If server returned nothing, try fallback: fetch all series then client-side filter
      if ((!list || list.length === 0) && (category._id || category.slug || category.name)) {
        console.warn('[ramsvc] empty result for strict query — attempting fallback to /api/series and client-side filter');
        apiGET('/api/series').then(all => {
          console.log('[ramsvc] fallback /api/series returned', all && all.length ? all.length : 0, 'items');
          // filter where series.category equals category._id or equals category.slug/name (handles different doc shapes)
          const filtered = (all || []).filter(s => {
            if (!s) return false;
            // series.category might be an ObjectId string OR populated object
            const sc = s.category;
            if (!sc) return false;
            if (typeof sc === 'string') {
              return sc === String(category._id) || sc === category.slug || sc === category.name;
            } else if (typeof sc === 'object') {
              // populated object
              return String(sc._id || sc.id || sc) === String(category._id) || (sc.slug && sc.slug === category.slug) || (sc.name && sc.name === category.name);
            }
            return false;
          });
          console.log('[ramsvc] fallback filtered series count:', filtered.length);
          state.series = filtered;
          renderSeries(state.series);
        }).catch(err => {
          console.error('[ramsvc] fallback /api/series failed', err);
        });
      }
    }).catch(err => {
      console.error('[ramsvc] /api/series?category error', err);
      // try fallback too
      apiGET('/api/series').then(all => {
        const filtered = (all || []).filter(s => {
          if (!s) return false;
          const sc = s.category;
          if (!sc) return false;
          if (typeof sc === 'string') return sc === String(category._id) || sc === category.slug || sc === category.name;
          else if (typeof sc === 'object') return String(sc._id || sc.id || sc) === String(category._id) || (sc.slug && sc.slug === category.slug) || (sc.name && sc.name === category.name);
          return false;
        });
        state.series = filtered;
        renderSeries(state.series);
      }).catch(e2 => {
        console.error('[ramsvc] fallback /api/series also failed', e2);
      });
    });
  }


  function loadModelsForSeries(seriesId) {
    if (!seriesId) return;
    apiGET('/api/series/' + encodeURIComponent(seriesId) + '/models').then(list => {
      state.models = list || [];
      renderModelsPill(null);
    }).catch(err => {
      console.error('models for series err', err);
    });
  }

  function loadRepairsForModel(modelId) {
    if (!modelId) return;
    apiGET('/api/repairs?modelId=' + encodeURIComponent(modelId)).then(list => {
      state.repairs = list || [];
      renderRepairs(state.repairs);
    }).catch(err => {
      console.error('repairs err', err);
      damageGrid.innerText = 'Failed to load repairs';
    });
  }

  // ---- init ----
  loadCategories();

})();
