/* widget-example.js
   Put this file at /widget.js on your host (server serves it in server.js).
   The widget will call:
     - GET /api/categories
     - GET /api/series
     - GET /api/series/:seriesId/models
     - GET /api/repairs?modelId=...
     - POST /api/submit
*/
(function () {
  const API_BASE = (window.RAM_SERVICE_API_BASE || '').replace(/\/$/, '') || (location.origin);
  const mountId = 'ram-service-widget';
  const ns = 'ramsvc';

  const q = (s, p = document) => p.querySelector(s);
  const ce = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };

  // money helper (handles integer cents or numeric)
  const money = v => {
    if (v === null || v === undefined) return 'CALL_FOR_PRICE';
    if (Number.isInteger(v)) return (v/100).toLocaleString() + ' €';
    if (!isNaN(Number(v))) return Number(v).toLocaleString() + ' €';
    return String(v);
  };

  function apiGET(path) {
    return fetch(API_BASE + path, { credentials: 'omit' })
      .then(r => { if (!r.ok) throw new Error('Network ' + r.status); return r.json(); });
  }
  function apiPOST(path, body) {
    return fetch(API_BASE + path, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    }).then(r => { if (!r.ok) return r.json().then(j=>{throw j}); return r.json(); });
  }

  // inject small CSS
  const css = `
  #${mountId} { font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial; color:#111; padding:30px 0; }
  #${mountId} .${ns}-center { text-align:center; }
  #${mountId} h2 { font-size:28px; margin:0 0 18px 0; font-weight:700; }
  #${mountId} .${ns}-grid { display:flex; gap:22px; flex-wrap:wrap; justify-content:center; margin:18px 0; }
  #${mountId} .${ns}-tile { width:220px; height:180px; background:#ecf3ff; border-radius:10px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px; cursor:pointer; transition:transform .12s; }
  #${mountId} .${ns}-tile.selected{ background:#cfd8e6; }
  #${mountId} .${ns}-tile img{ max-height:70px; margin-bottom:12px; object-fit:contain; }
  #${mountId} .${ns}-tile h4{ margin:0; font-size:16px; font-weight:700; }
  #${mountId} .${ns}-pill { display:inline-block; padding:12px 24px; border-radius:40px; border:2px solid #121212; background:#fff; font-weight:700; margin:10px auto; cursor:pointer; }
  #${mountId} .${ns}-priceCard{ background:#e7eefc; padding:16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-top:18px; }
  #${mountId} .${ns}-form{ max-width:920px; margin:26px auto; background:#f4fbff; padding:22px; border-radius:8px; }
  #${mountId} label{ display:block; font-weight:600; font-size:13px; margin-bottom:6px; }
  #${mountId} input[type=text], #${mountId} input[type=email], #${mountId} input[type=tel], #${mountId} textarea, #${mountId} select { width:100%; padding:10px 12px; border-radius:999px; border:2px solid #d0d6dd; box-sizing:border-box; }
  #${mountId} textarea{ min-height:120px; border-radius:12px; }
  #${mountId} .${ns}-btn{ padding:12px 20px; border-radius:28px; background:#0a63d6; color:#fff; font-weight:700; border:none; cursor:pointer; }
  #${mountId} .${ns}-muted{ color:#6c6f76; font-size:13px; }
  #${mountId} .${ns}-row{ display:flex; gap:16px; flex-wrap:wrap; margin-bottom:12px; }
  #${mountId} .${ns}-col{ flex:1 1 220px; min-width:220px; }
  #${mountId} .${ns}-hr{ height:1px; background:#d6dde6; margin:18px 0; }
  @media (max-width:900px){ #${mountId} .${ns}-tile{ width:45%; } #${mountId} .${ns}-col{ min-width:100%; } }
  @media (max-width:480px){ #${mountId} .${ns}-tile{ width:100%; } }
  `;
  const style = ce('style'); style.innerText = css; document.head.appendChild(style);

  const mount = document.getElementById(mountId);
  if (!mount) { console.error('ram widget mount not found'); return; }
  mount.innerHTML = ''; // clean
  mount.classList.add(ns + '-wrap');

  // build base structure: categories only visible initially
  const header = ce('div', ns + '-center'); header.innerHTML = `<h2>Select device category</h2>`; mount.appendChild(header);
  const categoryGrid = ce('div', ns + '-grid'); mount.appendChild(categoryGrid);

  // placeholders (hidden until used)
  const seriesTitle = ce('h3', ns + '-center'); seriesTitle.innerText = 'Select Series'; seriesTitle.style.display = 'none';
  const seriesGrid = ce('div', ns + '-grid'); seriesGrid.style.display = 'none';
  mount.appendChild(seriesTitle); mount.appendChild(seriesGrid);

  const modelWrap = ce('div', ns + '-center'); modelWrap.style.display = 'none'; const modelPill = ce('div', ns + '-pill'); modelPill.innerText = 'Select a model from the list...'; modelWrap.appendChild(modelPill); mount.appendChild(modelWrap);

  const damageTitle = ce('h3', ns + '-center'); damageTitle.innerText = 'Select type of injury'; damageTitle.style.display = 'none';
  const damageGrid = ce('div', ns + '-grid'); damageGrid.style.display = 'none';
  mount.appendChild(damageTitle); mount.appendChild(damageGrid);

  const priceCard = ce('div', ns + '-priceCard'); priceCard.style.display = 'none';
  priceCard.innerHTML = `<div><div class="${ns}-muted">Selected</div><div class="${ns}-summaryTitle" style="font-weight:900"></div></div><div style="text-align:right"><div class="${ns}-muted">Your price:</div><div class="${ns}-summaryPrice" style="font-weight:800"></div></div>`;
  mount.appendChild(priceCard);

  const formWrap = ce('div', ns + '-form'); formWrap.style.display = 'none'; mount.appendChild(formWrap);

  // state
  const state = {
    categories: [], series: [], models: [], repairs: [],
    selectedCategory: null, selectedSeries: null, selectedModel: null, selectedRepair: null, price: null
  };

  function clearChildren(el){ while(el.firstChild) el.removeChild(el.firstChild); }

  // render functions
  function renderCategories(list){
    clearChildren(categoryGrid);
    if(!list || list.length===0){ categoryGrid.innerText = 'No categories configured'; return; }
    list.forEach(c => {
      const t = ce('div', ns + '-tile'); t.setAttribute('data-slug', c.slug || '');
      const img = ce('img'); img.src = c.iconUrl || ''; img.alt = c.name || '';
      const h = ce('h4'); h.innerText = c.name;
      t.appendChild(img); t.appendChild(h);
      t.onclick = () => {
        state.selectedCategory = c;
        // highlight
        Array.from(categoryGrid.children).forEach(ch => ch.classList.remove('selected'));
        t.classList.add('selected');
        // show series (fetch)
        loadSeriesForCategory(c);
        // hide downstream until series selected
        seriesGrid.style.display = 'block'; seriesTitle.style.display = 'block';
        modelWrap.style.display = 'none'; modelPill.innerText = 'Select a model from the list...';
        damageGrid.style.display = 'none'; damageTitle.style.display = 'none'; priceCard.style.display = 'none'; formWrap.style.display = 'none';
      };
      categoryGrid.appendChild(t);
    });
    categoryGrid.scrollIntoView({behavior:'smooth', block:'center'});
  }

  function renderSeries(list){
    clearChildren(seriesGrid);
    if(!list || list.length===0){ seriesGrid.innerText = 'No series'; return; }
    list.forEach(s => {
      const t = ce('div', ns + '-tile'); const img = ce('img'); img.src = s.iconUrl || ''; const h = ce('h4'); h.innerText = s.name;
      t.appendChild(img); t.appendChild(h);
      t.onclick = () => {
        state.selectedSeries = s;
        Array.from(seriesGrid.children).forEach(c => c.classList.remove('selected'));
        t.classList.add('selected');
        // fetch models for selected series
        loadModelsForSeries(s._id);
        // hide downstream until model chosen
        modelWrap.style.display = 'block';
        damageGrid.style.display = 'none'; damageTitle.style.display = 'none'; priceCard.style.display = 'none'; formWrap.style.display = 'none';
      };
      seriesGrid.appendChild(t);
    });
    seriesGrid.scrollIntoView({behavior:'smooth', block:'center'});
  }

  function renderModelsSelect(list){
    clearChildren(modelWrap);
    if(!list || list.length===0){ modelWrap.innerText = 'No models'; return; }
    // create native select styled as pill
    const select = ce('select'); select.style.padding = '12px 18px'; select.style.borderRadius='40px'; select.style.border='2px solid #121212'; select.style.width='380px';
    const empty = ce('option'); empty.value=''; empty.innerText='Select a model from the list...'; select.appendChild(empty);
    list.forEach(m => { const o = ce('option'); o.value = m._id || m.slug || m.name; o.innerText = m.name; select.appendChild(o); });
    select.onchange = () => {
      const id = select.value;
      const model = list.find(x => (x._id === id) || (x.slug === id) || (x.name === id));
      state.selectedModel = model;
      modelPill.innerText = model ? model.name : 'Select a model from the list...';
      // load repairs for this model
      if(model) loadRepairsForModel(model._id);
    };
    modelWrap.appendChild(select);
    modelWrap.scrollIntoView({behavior:'smooth', block:'center'});
  }

  function renderRepairs(list){
    clearChildren(damageGrid);
    if(!list || list.length===0){ damageGrid.innerText = 'No repair options'; return; }
    list.forEach(r => {
      const t = ce('div', ns + '-tile'); const img = ce('img'); img.src = (r.images && r.images[0]) || ''; const h = ce('h4'); h.innerText = r.name;
      const sub = ce('div'); sub.className = ns + '-muted'; sub.style.marginTop='8px';
      sub.innerText = (typeof r.priceEffective !== 'undefined') ? money(r.priceEffective) : money(r.basePrice);
      t.appendChild(img); t.appendChild(h); t.appendChild(sub);
      t.onclick = () => {
        state.selectedRepair = r;
        // highlight
        Array.from(damageGrid.children).forEach(ch => ch.classList.remove('selected'));
        t.classList.add('selected');
        // compute price and show price card + form
        computeEffectivePrice();
        priceCard.style.display = 'flex';
        formWrap.style.display = 'block';
        damageTitle.style.display = 'block';
        // populate summary inside priceCard
        q('.' + ns + '-summaryTitle', priceCard).innerText = (state.selectedRepair ? state.selectedRepair.name : '');
        q('.' + ns + '-summaryPrice', priceCard).innerText = (state.price ? money(state.price) : 'CALL_FOR_PRICE');
        // render the full form (function below)
        renderForm();
      };
      damageGrid.appendChild(t);
    });
    damageGrid.scrollIntoView({behavior:'smooth', block:'center'});
  }

  function computeEffectivePrice(){
    let price = null;
    const r = state.selectedRepair;
    if(!r){ state.price=null; return; }
    // try model override stored in model.priceOverrides array
    if(state.selectedModel && Array.isArray(state.selectedModel.priceOverrides)){
      const ov = state.selectedModel.priceOverrides.find(po => (po.repairOptionId && String(po.repairOptionId) === String(r._id)) || (po.repairOptionCode && po.repairOptionCode === r.code));
      if(ov && typeof ov.price !== 'undefined' && ov.price !== null) price = ov.price;
    }
    if(price === null || price === undefined){
      price = (typeof r.priceEffective !== 'undefined' && r.priceEffective !== null) ? r.priceEffective : (r.basePrice || null);
    }
    state.price = price;
  }

  // --- form creation (full fields matching screenshot) ---
  function renderForm(){
    clearChildren(formWrap);
    // top summary area (image + summary)
    const top = ce('div'); top.style.display='flex'; top.style.justifyContent='space-between'; top.style.gap='16px';
    const left = ce('div'); left.style.flex='1';
    left.innerHTML = `<div style="display:flex;gap:12px;align-items:center"><div style="width:120px"><img src="${(state.selectedModel && state.selectedModel.imageUrl) || ''}" style="width:100%;height:auto;object-fit:contain"/></div><div><div style="font-weight:900;font-size:16px">${state.selectedModel ? state.selectedModel.name : ''}</div><div class="${ns}-muted">${state.selectedModel ? (state.selectedModel.brand || '') : ''}</div></div></div>`;
    const right = ce('div'); right.style.flex='0 0 260px'; right.innerHTML = `<div class="${ns}-muted">This is how much the repair costs</div><div style="font-weight:900;font-size:20px;margin-top:6px">${state.selectedRepair ? state.selectedRepair.name : ''}</div><div class="${ns}-summaryPrice" style="font-size:20px;margin-top:8px">${state.price ? money(state.price) : 'CALL_FOR_PRICE'}</div>`;
    top.appendChild(left); top.appendChild(right);
    formWrap.appendChild(top);

    const heading = ce('h3'); heading.innerText = 'REPAIR FORM'; formWrap.appendChild(heading);

    // contact grid
    const contactGrid = ce('div'); contactGrid.className = ns + '-row';
    function makeField(labelText, name, type = 'text', placeholder = '', required = false){
      const col = ce('div', ns + '-col');
      const lab = ce('label'); lab.innerText = labelText + (required ? ' *' : '');
      const inp = type === 'textarea' ? ce('textarea') : ce('input');
      if(type !== 'textarea') inp.type = type;
      inp.name = name; inp.placeholder = placeholder;
      if(required) inp.setAttribute('data-required','1');
      col.appendChild(lab); col.appendChild(inp);
      return col;
    }
    contactGrid.appendChild(makeField('Company', 'company', 'text', 'Company'));
    contactGrid.appendChild(makeField('Company Tax Number', 'tax_number', 'text', 'Tax Number'));
    contactGrid.appendChild(makeField('Full name', 'full_name', 'text', 'Full name', true));
    contactGrid.appendChild(makeField('Street and house number', 'address', 'text', 'Street and house number'));
    contactGrid.appendChild(makeField('Postal code and city', 'postal_city', 'text', 'Postal code and city'));
    contactGrid.appendChild(makeField('Email', 'email', 'email', 'Email', true));
    contactGrid.appendChild(makeField('Contact phone number', 'phone', 'tel', 'Contact phone number', true));
    formWrap.appendChild(contactGrid);

    formWrap.appendChild(ce('div', ns + '-hr'));

    // device fields
    const deviceRow = ce('div'); deviceRow.className = ns + '-row';
    deviceRow.appendChild(makeField('Device manufacturer and model', 'device_model', 'text', 'Manufacturer and model', true));
    deviceRow.appendChild(makeField('IMEI/Serial number', 'imei', 'text', 'IMEI/Serial number'));
    formWrap.appendChild(deviceRow);

    // radio groups
    const radiosRow = ce('div'); radiosRow.className = ns + '-row';
    function makeRadioGroup(labelText, name, opts){
      const wrap = ce('div', ns + '-col');
      const lab = ce('label'); lab.innerText = labelText; wrap.appendChild(lab);
      const inner = ce('div'); inner.style.display = 'flex'; inner.style.gap = '12px';
      opts.forEach(o => {
        const lbl = ce('label'); lbl.style.fontWeight='600';
        const r = ce('input'); r.type='radio'; r.name=name; r.value=o.value;
        lbl.appendChild(r); lbl.appendChild(document.createTextNode(' ' + o.label));
        inner.appendChild(lbl);
      });
      wrap.appendChild(inner); return wrap;
    }
    radiosRow.appendChild(makeRadioGroup('Type of repair (check as appropriate)', 'repair_type', [{value:'warranty',label:'Warranty'},{value:'out',label:'Out of warranty'}]));
    radiosRow.appendChild(makeRadioGroup('Completed warranty card', 'warranty_card', [{value:'YES',label:'YES'},{value:'NO',label:'NO'}]));
    radiosRow.appendChild(makeRadioGroup('Invoice with IMEI/Serial number', 'receipt', [{value:'YES',label:'YES'},{value:'NO',label:'NO'}]));
    formWrap.appendChild(radiosRow);

    const note = ce('div'); note.className=ns + '-muted'; note.innerHTML = '<small><b>Note:</b> Data transfer is an additional paid service... (editable text)</small>'; formWrap.appendChild(note);

    // pin + pattern
    const pinRow = ce('div'); pinRow.className = ns + '-row';
    pinRow.appendChild(makeField('PIN', 'pin', 'text', 'PIN'));
    const patCol = ce('div', ns + '-col'); const lab = ce('label'); lab.innerText='Pattern'; patCol.appendChild(lab);
    const patBox = ce('div'); patBox.style.width='150px'; patBox.style.height='150px'; patBox.style.border='2px dashed #d0d6dd'; patBox.style.borderRadius='8px'; patBox.style.display='flex'; patBox.style.alignItems='center'; patBox.style.justifyContent='center'; patBox.innerHTML='<div class="'+ns+'-muted">pattern</div>';
    patCol.appendChild(patBox); pinRow.appendChild(patCol); formWrap.appendChild(pinRow);

    // service type select
    const serviceRow = ce('div'); serviceRow.className = ns + '-row';
    const servCol = ce('div', ns + '-col'); const servLabel = ce('label'); servLabel.innerText='How to get to the Service'; const servSel = ce('select'); ['Personal delivery','Shipping'].forEach(v => { const o=ce('option'); o.value=v; o.innerText=v; servSel.appendChild(o); });
    servCol.appendChild(servLabel); servCol.appendChild(servSel); serviceRow.appendChild(servCol); formWrap.appendChild(serviceRow);

    formWrap.appendChild(ce('div', ns + '-hr'));

    // description
    const desc = makeField('Error description','body','textarea','Error description'); formWrap.appendChild(desc);

    // terms and signature
    const terms = ce('div'); terms.className = ns + '-muted'; terms.style.margin='12px 0'; terms.innerHTML='<small><b>Note:</b> For warranty repairs it is mandatory to attach warranty certificate...</small>';
    formWrap.appendChild(terms);

    formWrap.appendChild(makeField('Signature','signature','text','Signature'));

    // submit
    const submitRow = ce('div'); submitRow.style.textAlign='left'; submitRow.style.marginTop='16px';
    const btn = ce('button'); btn.className = ns + '-btn'; btn.innerText='Request repair';
    btn.onclick = onSubmit; submitRow.appendChild(btn); formWrap.appendChild(submitRow);

    // set hidden meta on formWrap
    formWrap.dataset.category = state.selectedCategory ? state.selectedCategory.slug : '';
    formWrap.dataset.series = state.selectedSeries ? (state.selectedSeries._id || '') : '';
    formWrap.dataset.modelId = state.selectedModel ? (state.selectedModel._id || '') : '';
    formWrap.dataset.repairCode = state.selectedRepair ? (state.selectedRepair.code || state.selectedRepair._id) : '';

    // show
    priceCard.style.display = 'flex';
    formWrap.style.display = 'block';
    q('.' + ns + '-summaryPrice', formWrap) ? q('.' + ns + '-summaryPrice', formWrap).innerText = (state.price ? money(state.price) : 'CALL_FOR_PRICE') : null;
  }

  // loaders
  function loadCategories(){
    apiGET('/api/categories').then(list => {
      state.categories = list || [];
      renderCategories(state.categories);
    }).catch(err => {
      console.error('categories err', err);
      categoryGrid.innerText = 'Failed to load categories — check API base and CORS';
    });
  }

  function loadSeriesForCategory(cat){
    apiGET('/api/series?category=' + encodeURIComponent(cat.slug || cat._id || ''))
      .then(list => {
        state.series = (list || []);
        renderSeries(state.series);
      }).catch(err => {
        console.error('series err', err);
        seriesGrid.innerText = 'Failed to load series';
        seriesGrid.style.display = 'block';
        seriesTitle.style.display = 'block';
      });
  }

  function loadModelsForSeries(seriesId){
    apiGET('/api/series/' + encodeURIComponent(seriesId) + '/models')
      .then(list => {
        state.models = list || [];
        renderModelsSelect(state.models);
      }).catch(err => {
        console.error('models err', err);
        modelWrap.innerText = 'Failed to load models';
        modelWrap.style.display = 'block';
      });
  }

  function loadRepairsForModel(modelId){
    apiGET('/api/repairs?modelId=' + encodeURIComponent(modelId))
      .then(list => {
        state.repairs = list || [];
        damageTitle.style.display = 'block';
        damageGrid.style.display = 'flex';
        renderRepairs(state.repairs);
      }).catch(err => {
        console.error('repairs err', err);
        damageGrid.innerText = 'Failed to load repairs';
        damageGrid.style.display = 'block';
      });
  }

  // submit handler
  function collectFormData(){
    const inputs = formWrap.querySelectorAll('input, textarea, select');
    const contact = {};
    inputs.forEach(i => { if(!i.name) return; if(i.type==='radio'){ if(!contact[i.name]){ const c = formWrap.querySelector('input[name="'+i.name+'"]:checked'); contact[i.name] = c ? c.value : ''; } } else contact[i.name]=i.value; });
    return {
      contact,
      category: state.selectedCategory ? state.selectedCategory.slug : '',
      seriesId: state.selectedSeries ? (state.selectedSeries._id || '') : '',
      modelId: state.selectedModel ? (state.selectedModel._id || '') : '',
      repair_code: state.selectedRepair ? (state.selectedRepair.code || state.selectedRepair._id) : '',
      metadata: { priceComputed: state.price, widgetAt: window.location.href }
    };
  }
  function validateForm(){
    let ok = true;
    const required = formWrap.querySelectorAll('[data-required="1"]');
    required.forEach(r => { if(!r.value || r.value.trim()===''){ ok=false; r.style.borderColor='red'; } else r.style.borderColor=''; });
    if(!state.selectedModel){ ok=false; alert('Please select a model.'); }
    if(!state.selectedRepair){ ok=false; alert('Please select a repair type.'); }
    return ok;
  }
  function onSubmit(){
    if(!validateForm()) return;
    const payload = collectFormData();
    const btn = formWrap.querySelector('.' + ns + '-btn');
    btn.disabled = true; btn.innerText = 'Sending...';
    apiPOST('/api/submit', payload).then(res => {
      btn.disabled = false; btn.innerText = 'Request repair';
      // show confirmation
      mount.innerHTML = '';
      const okWrap = ce('div'); okWrap.style.padding='30px 10px'; okWrap.className = ns + '-center';
      const title = ce('h2'); title.innerText = 'Thank you — request received';
      const p = ce('p'); p.className = ns + '-muted';
      p.innerHTML = `We created request <strong>${res.id || res._id || '—'}</strong>. Price: <strong>${res.price ? (Number.isInteger(res.price) ? (res.price/100).toLocaleString() + ' €' : String(res.price)) : 'CALL_FOR_PRICE'}</strong>`;
      okWrap.appendChild(title); okWrap.appendChild(p); mount.appendChild(okWrap);
    }).catch(err => {
      btn.disabled = false; btn.innerText = 'Request repair';
      console.error('submit err', err);
      alert('Submission failed: ' + (err && err.error ? err.error : (err && err.message ? err.message : 'Unknown error')));
    });
  }

  // wire the dynamic chain: series -> models
  function loadModelsForSeries(seriesId){ apiGET('/api/series/' + encodeURIComponent(seriesId) + '/models').then(list => { state.models = list || []; renderModelsSelect(state.models); }).catch(err => { console.error(err); modelWrap.innerText = 'Failed to load models'; modelWrap.style.display='block'; }); }

  // initial load
  loadCategories();
})();
