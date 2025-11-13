// widget-example.js — embed this on the store page
(function () {
  // small helpers
  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.innerText = txt; return e; }
  function q(sel, root=document) { return root.querySelector(sel); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  async function api(path) {
    const base = (window.RAM_SERVICE_API_BASE || '').replace(/\/$/, '') || (location.protocol + '//' + location.host);
    const url = base + path;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${url}`);
    return res.json();
  }

  // mount point
  const mount = document.getElementById('ram-service-widget') || (function(){
    const m = document.createElement('div');
    m.id = 'ram-service-widget';
    document.body.appendChild(m);
    return m;
  })();

  // tiny CSS so it looks decent (override in theme if needed)
  const style = document.createElement('style');
  style.innerHTML = `
  #ram-service-widget { max-width: 1100px; margin: 30px auto; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; }
  #ram-service-widget h2 { text-align:center; font-size:26px; margin:18px 0; }
  .rs-row { display:flex; gap:18px; flex-wrap:wrap; justify-content:center; margin:14px 0; }
  .rs-card { width:220px; min-height:160px; border-radius:10px; background:#eaf1fb; padding:18px; cursor:pointer; text-align:center; box-shadow:0 1px 0 rgba(0,0,0,0.02); transition:transform .12s; display:flex;flex-direction:column;align-items:center;justify-content:center }
  .rs-card.selected { background:#cfd8e6; transform:translateY(-4px); }
  .rs-card img { max-width:86px; max-height:86px; object-fit:contain; margin-bottom:10px; }
  .rs-select { border-radius:36px; padding:14px 20px; border:3px solid #000; display:inline-block; margin:18px auto; min-width:350px; }
  .rs-none { color:#777; text-align:center; margin:30px 0; }
  .rs-pricebar { background:#eaf1fb; border-radius:10px; padding:18px; margin-top:22px; text-align:right; color:#333; }
  .rs-form { background:#eaf1fb; padding:20px; border-radius:10px; margin-top:18px; }
  .rs-field { margin-bottom:12px; }
  .rs-field input, .rs-field textarea { width:100%; padding:10px; border-radius:8px; border:1px solid #cfcfcf; }
  .rs-submit { padding:10px 18px; border-radius:8px; background:#0b67d0; color:#fff; border:0; cursor:pointer; }
  `;
  document.head.appendChild(style);

  // UI containers
  clear(mount);
  const title = el('h2', null, 'Select device category');
  const catRow = el('div','rs-row');
  const seriesTitle = el('h2', null, 'Select Series');
  const seriesRow = el('div','rs-row');
  const modelTitle = el('h2', null, 'Select a model from the list');
  const modelSelect = el('select','rs-select');
  const repairsTitle = el('h2', null, 'Select type of injury');
  const repairsRow = el('div','rs-row');
  const priceBar = el('div','rs-pricebar');
  const formWrapper = el('div','rs-form');

  mount.appendChild(title);
  mount.appendChild(catRow);
  mount.appendChild(seriesTitle);
  mount.appendChild(seriesRow);
  mount.appendChild(modelTitle);
  mount.appendChild(modelSelect);
  mount.appendChild(repairsTitle);
  mount.appendChild(repairsRow);
  mount.appendChild(priceBar);
  mount.appendChild(formWrapper);

  // state
  let STATE = {
    category: null,
    series: null,
    model: null,
    repair: null,
    repairsList: []
  };

  function showError(msg) {
    clear(mount);
    mount.appendChild(el('div','rs-none', msg));
  }

  // Render helpers
  function renderCategories(cats) {
    clear(catRow);
    cats.forEach(c=>{
      const card = el('div','rs-card');
      if (c.iconUrl) {
        const img = el('img'); img.src = c.iconUrl; card.appendChild(img);
      }
      card.appendChild(el('div',null, c.name));
      card.onclick = ()=> {
        STATE.category = c;
        // visual
        Array.from(catRow.children).forEach(n=>n.classList.remove('selected'));
        card.classList.add('selected');
        // load series
        loadSeries(c);
      };
      catRow.appendChild(card);
    });
  }

  async function loadSeries(category) {
    try {
      seriesRow.innerHTML = '';
      seriesTitle.innerText = 'Select Series';
      const list = await api(`/api/series?category=${encodeURIComponent(category.slug || category._id || category.name)}`);
      if (!list.length) {
        seriesRow.appendChild(el('div','rs-none','No series (create via admin)'));
        modelSelect.style.display = 'none';
        return;
      }
      modelSelect.style.display = '';
      list.forEach(s=>{
        const card = el('div','rs-card');
        if (s.iconUrl) { const img = el('img'); img.src = s.iconUrl; card.appendChild(img); }
        card.appendChild(el('div',null, s.name));
        card.onclick = ()=> {
          STATE.series = s;
          Array.from(seriesRow.children).forEach(n=>n.classList.remove('selected'));
          card.classList.add('selected');
          loadModelsForSeries(s);
        };
        seriesRow.appendChild(card);
      });
    } catch (err) {
      console.error(err);
      seriesRow.innerHTML = '';
      seriesRow.appendChild(el('div','rs-none','Failed to load series'));
    }
  }

  async function loadModelsForSeries(series) {
    try {
      // clear repairs & price & form
      repairsRow.innerHTML = '';
      priceBar.innerText = '';
      formWrapper.innerHTML = '';

      modelSelect.innerHTML = '';
      modelSelect.appendChild(new Option('Bitte wählen...', ''));
      const models = await api(`/api/series/${series._id}/models`);
      if (!models.length) {
        modelSelect.style.display = 'none';
        modelSelect.appendChild(new Option('No models available', ''));
        return;
      }
      modelSelect.style.display = '';
      models.forEach(m=>{
        const opt = new Option(m.name, m._id);
        modelSelect.appendChild(opt);
      });

      // on select change
      modelSelect.onchange = function() {
        const id = this.value;
        const selected = models.find(x => x._id === id);
        STATE.model = selected || null;
        loadRepairsForModel(selected);
      };
      // auto open first model (optional):
      // if (models[0]) { modelSelect.value = models[0]._id; STATE.model=models[0]; loadRepairsForModel(models[0]); }
    } catch (err) {
      console.error(err);
      modelSelect.style.display = 'none';
      modelSelect.innerHTML = '';
      modelSelect.appendChild(new Option('Failed to load models', ''));
    }
  }

  async function loadRepairsForModel(model) {
    try {
      repairsRow.innerHTML = '';
      priceBar.innerText = '';
      formWrapper.innerHTML = '';

      if (!model) {
        repairsRow.appendChild(el('div','rs-none','Select a model first'));
        return;
      }

      // repairs endpoint accepts modelId -> we will use it so server can apply overrides
      const repairs = await api(`/api/repairs?modelId=${encodeURIComponent(model._id)}`);
      STATE.repairsList = repairs || [];
      if (!repairs.length) {
        repairsRow.appendChild(el('div','rs-none','No repair options'));
        return;
      }
      repairs.forEach(r=>{
        const card = el('div','rs-card');
        if (r.images && r.images.length) {
          const i = el('img'); i.src = r.images[0]; card.appendChild(i);
        }
        card.appendChild(el('div',null, r.name));
        const priceLine = el('div', null, r.priceEffective ? formatPrice(r.priceEffective) : (r.basePrice ? formatPrice(r.basePrice) : 'Call for price'));
        priceLine.style.marginTop = '8px';
        priceLine.style.fontWeight = '600';
        card.appendChild(priceLine);
        card.onclick = ()=> {
          STATE.repair = r;
          Array.from(repairsRow.children).forEach(n=>n.classList.remove('selected'));
          card.classList.add('selected');
          showPriceAndForm(model, r);
        };
        repairsRow.appendChild(card);
      });
    } catch (err) {
      console.error(err);
      repairsRow.innerHTML = ''; repairsRow.appendChild(el('div','rs-none','Failed to load repairs'));
    }
  }

  function formatPrice(v) {
    if (v === undefined || v === null) return 'Call for price';
    // accept two formats: numeric in cents or string
    if (typeof v === 'number') {
      return (v/100).toFixed(2) + ' €';
    }
    // if string like "150€" or "CALL_FOR_PRICE"
    if (typeof v === 'string') {
      if (/^\d+$/.test(v)) return (parseInt(v,10)/100).toFixed(2) + ' €';
      return v;
    }
    return String(v);
  }

  function showPriceAndForm(model, repair) {
    priceBar.innerHTML = '';
    const left = el('div', null, `${model.name}`);
    const right = el('div', null, `Your price: ${formatPrice(repair.priceEffective || repair.basePrice)}`);
    priceBar.appendChild(left);
    priceBar.appendChild(right);

    // form (minimal, extend as needed)
    formWrapper.innerHTML = '';
    const formTitle = el('h3', null, 'Repair form');
    formWrapper.appendChild(formTitle);

    const fields = [
      { id:'fullName', label:'Full name', type:'text' },
      { id:'email', label:'Email', type:'email' },
      { id:'phone', label:'Phone', type:'tel' },
      { id:'notes', label:'Error description', type:'textarea' }
    ];
    const inputs = {};
    fields.forEach(f=>{
      const wrap = el('div','rs-field');
      const label = el('label', null, f.label);
      wrap.appendChild(label);
      let input;
      if (f.type === 'textarea') input = el('textarea'); else input = el('input');
      input.name = f.id; input.placeholder = f.label;
      wrap.appendChild(input);
      formWrapper.appendChild(wrap);
      inputs[f.id] = input;
    });

    const submitBtn = el('button','rs-submit','Request repair');
    submitBtn.onclick = async () => {
      // validation
      if (!inputs.fullName.value || !inputs.email.value) { alert('Name and email are required'); return; }
      // build payload using server shape
      const payload = {
        contact: {
          fullName: inputs.fullName.value,
          email: inputs.email.value,
          phone: inputs.phone.value
        },
        category: STATE.category ? (STATE.category.slug || STATE.category._id) : null,
        seriesId: STATE.series ? STATE.series._id : null,
        modelId: model._id,
        repair_code: repair.code,
        metadata: { notes: inputs.notes.value }
      };
      try {
        const base = (window.RAM_SERVICE_API_BASE || '').replace(/\/$/, '') || (location.protocol + '//' + location.host);
        const res = await fetch(base + '/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Submit failed');
        formWrapper.innerHTML = '';
        formWrapper.appendChild(el('div',null,'Request received. Tracking ID: ' + (json.id || '—')));
      } catch (err) {
        console.error(err);
        alert('Submit failed: ' + err.message);
      }
    };
    formWrapper.appendChild(submitBtn);
  }

  // initial load
  async function init() {
    try {
      const cats = await api('/api/categories');
      if (!cats || !cats.length) { showError('No categories found. Create categories in admin.'); return; }
      renderCategories(cats);
      // preload: try to fetch series (not necessary)
    } catch (err) {
      console.error(err);
      showError('Failed to load categories — check API base and CORS. ' + err.message);
    }
  }

  init();

})();
