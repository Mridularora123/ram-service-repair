// widget-example.js (embeddable - keep small & self-contained)
(function () {
  // safe small helper
  function qs(sel, parent){ return (parent||document).querySelector(sel); }
  function ce(tag, txt){ const e=document.createElement(tag); if(txt) e.innerText=txt; return e; }
  function qsa(sel, parent){ return Array.from((parent||document).querySelectorAll(sel)); }

  // determine API base: prefer explicitly set global, otherwise derive from this script tag src
  (function ensureApiBase(){
    if (window.RAM_SERVICE_API_BASE) return;
    // try to find this script's src
    const scripts = document.getElementsByTagName('script');
    for (let i=0;i<scripts.length;i++){
      const s = scripts[i];
      if (s.src && s.src.indexOf('widget.js') !== -1) {
        const base = s.src.replace(/\/widget\.js.*$/,'');
        window.RAM_SERVICE_API_BASE = base;
        return;
      }
    }
    // fallback to current origin
    window.RAM_SERVICE_API_BASE = (location.protocol + '//' + location.host);
  })();

  async function api(path){
    const url = window.RAM_SERVICE_API_BASE.replace(/\/$/,'') + path;
    const r = await fetch(url);
    if (!r.ok) throw new Error('API fetch failed: ' + url + ' status:' + r.status);
    return r.json();
  }

  // render helpers
  function clearMount(m) { while (m.firstChild) m.removeChild(m.firstChild); }
  function mountMessage(m, txt){ const p = ce('div', txt); p.style.padding='18px 0'; p.style.textAlign='center'; m.appendChild(p); }

  // mount point
  let mount = document.getElementById('ram-service-widget');
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'ram-service-widget';
    document.body.appendChild(mount);
  }
  // basic styles
  const styleId = 'ram-service-widget-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      #ram-service-widget { max-width: 1100px; margin: 36px auto; font-family: Arial, Helvetica, sans-serif; color:#222; }
      #ram-service-widget h3 { text-align:center; font-size:28px; margin:10px 0 24px; }
      #ram-service-widget .grid { display:flex; gap:18px; flex-wrap:wrap; justify-content:center; }
      #ram-service-widget .card { width:220px; height:160px; background:#eef4fb; border-radius:10px; display:flex; align-items:center; justify-content:center; text-align:center; cursor:pointer; padding:14px; box-shadow:0 2px 0 rgba(0,0,0,0.03); }
      #ram-service-widget .card.selected { background:#cfd8e6; }
      #ram-service-widget .btn { display:inline-block; padding:12px 22px; border-radius:28px; border:2px solid #111; background:white; cursor:pointer; }
      #ram-service-widget .select { display:block; width:360px; margin: 8px auto 24px; padding:12px 18px; border-radius:28px; border:2px solid #111; background:white; }
      #ram-service-widget .repairs { display:flex; gap:14px; flex-wrap:wrap; justify-content:center; margin-top:18px; }
      #ram-service-widget .repair-card { width:220px; height:120px; background:#eef4fb; border-radius:10px; padding:12px; text-align:center; cursor:pointer; }
      #ram-service-widget .price-box { margin-top:18px; padding:18px; background:#eef4fb; border-radius:10px; text-align:center; }
      #ram-service-widget form { margin-top:20px; padding:18px; border-radius:10px; background:#f6fbff; }
      #ram-service-widget form input, #ram-service-widget form textarea { width:100%; padding:10px; margin:8px 0; border-radius:8px; border:1px solid #ccc; }
    `;
    document.head.appendChild(style);
  }

  // UI building
  clearMount(mount);
  mount.appendChild(ce('h3','Select device category'));

  const catContainer = ce('div'); catContainer.className='grid'; mount.appendChild(catContainer);
  mountMessage(mount, 'Loading categories...');

  // state
  const state = { category: null, series: null, model: null, repair: null };

  // listeners helpers
  function onCategorySelected(c) {
    state.category = c;
    // highlight selection
    qsa('#ram-service-widget .card').forEach(el => el.classList.remove('selected'));
    const el = document.querySelector(`#ram-service-widget .card[data-cat='${c._id}']`);
    if (el) el.classList.add('selected');

    // load series for category
    loadSeries(c);
  }

  function onSeriesSelected(s) {
    state.series = s;
    qsa('#ram-service-widget .card.series').forEach(el => el.classList.remove('selected'));
    const el = document.querySelector(`#ram-service-widget .card.series[data-series='${s._id}']`);
    if (el) el.classList.add('selected');

    // load models for series
    loadModelsForSeries(s);
  }

  function onModelSelected(m) {
    state.model = m;
    // update selected UI (if using select)
    const sel = qs('#ram-service-widget select.model-select');
    if (sel) sel.value = m._id;
    // load repairs for model
    loadRepairs(m);
  }

  function onRepairSelected(r) {
    state.repair = r;
    qsa('#ram-service-widget .repair-card').forEach(el => el.classList.remove('selected'));
    const el = document.querySelector(`#ram-service-widget .repair-card[data-repair='${r.code}']`);
    if (el) el.classList.add('selected');
    // show price
    showPrice(r);
    // show form
    showForm();
  }

  // API load functions
  async function loadCategories(){
    try {
      const cats = await api('/api/categories');
      catContainer.innerHTML = '';
      if (!cats || cats.length === 0) { mountMessage(mount,'No categories found'); return; }
      cats.forEach(c => {
        const b = ce('div'); b.className='card'; b.dataset.cat = c._id;
        b.innerHTML = `<div><strong>${c.name}</strong></div>`;
        b.onclick = ()=> onCategorySelected(c);
        catContainer.appendChild(b);
      });
      // clear any loading message
      const msgs = qsa('#ram-service-widget > div');
      // proceed auto-select first (optional)
      // onCategorySelected(cats[0]);
    } catch (err) {
      clearMount(mount);
      mount.appendChild(ce('h3','Select device category'));
      mountMessage(mount, 'Failed to load categories — check API base and CORS (' + (window.RAM_SERVICE_API_BASE + '/api/categories') + ')');
      console.error(err);
    }
  }

  async function loadSeries(category) {
    // remove previous series area
    // create series section below categories
    let seriesSection = qs('#ram-service-widget .series-section');
    if (!seriesSection) {
      seriesSection = ce('div'); seriesSection.className='series-section';
      seriesSection.appendChild(ce('h3','Select Series'));
      const sgrid = ce('div'); sgrid.className='grid'; sgrid.style.marginTop='8px';
      seriesSection.appendChild(sgrid);
      mount.appendChild(seriesSection);
    }
    const sgrid = qs('#ram-service-widget .series-section .grid');
    sgrid.innerHTML = '';
    mountMessage(mount, 'Loading series...');
    try {
      const list = await api('/api/series?category=' + encodeURIComponent(category._id));
      if (!list || list.length === 0) {
        mountMessage(mount, 'No series for this category');
        return;
      }
      list.forEach(s => {
        const b = ce('div'); b.className='card series'; b.dataset.series = s._id;
        b.innerHTML = `<div><strong>${s.name}</strong></div>`;
        b.onclick = ()=> onSeriesSelected(s);
        sgrid.appendChild(b);
      });
      mountMessage(mount, 'Select a model from the list');
    } catch (err) {
      console.error(err);
      mountMessage(mount, 'Failed to load series');
    }
  }

  async function loadModelsForSeries(series) {
    // render a select and/or grid of models
    // create model select
    let modelArea = qs('#ram-service-widget .model-area');
    if (!modelArea) {
      modelArea = ce('div'); modelArea.className='model-area';
      modelArea.appendChild(ce('h3','Select a model from the list'));
      const sel = document.createElement('select'); sel.className='select model-select';
      sel.onchange = async function(){ const id = this.value; if(!id) return; const models = await api('/api/models?series=' + id); if(models && models[0]) onModelSelected(models[0]); };
      modelArea.appendChild(sel);
      mount.appendChild(modelArea);
    }
    const sel = qs('#ram-service-widget select.model-select');
    sel.innerHTML = '<option value="">Please choose...</option>';
    mountMessage(mount, 'Loading models...');
    try {
      const models = await api('/api/series/' + encodeURIComponent(series._id) + '/models');
      if (!models || models.length === 0) {
        mountMessage(mount, 'No models for this series');
        return;
      }
      models.forEach(m => {
        const opt = document.createElement('option'); opt.value = m._id; opt.text = (m.name + (m.sku ? ' - ' + m.sku : ''));
        sel.appendChild(opt);
      });
      // auto-select first model for faster flow (optional)
      // onModelSelected(models[0]);
      mountMessage(mount, 'Select type of injury');
    } catch (err) {
      console.error(err);
      mountMessage(mount, 'Failed to load models');
    }
  }

  async function loadRepairs(model) {
    // show repairs grid
    let repairsSection = qs('#ram-service-widget .repairs-section');
    if (!repairsSection) {
      repairsSection = ce('div'); repairsSection.className='repairs-section';
      repairsSection.appendChild(ce('h3','Select type of injury'));
      const box = ce('div'); box.className='repairs'; repairsSection.appendChild(box);
      mount.appendChild(repairsSection);
    }
    const box = qs('#ram-service-widget .repairs');
    box.innerHTML = '';
    mountMessage(mount, 'Loading repair options...');
    try {
      const repairs = await api('/api/repairs?modelId=' + encodeURIComponent(model._id));
      if (!repairs || repairs.length === 0) {
        mountMessage(mount, 'No repair options');
        return;
      }
      repairs.forEach(r => {
        const c = ce('div'); c.className='repair-card'; c.dataset.repair = r.code;
        c.innerHTML = `<div><strong>${r.name}</strong><div style="font-size:12px;margin-top:6px;">${r.priceEffective ? ('Price: ' + r.priceEffective) : ''}</div></div>`;
        c.onclick = ()=> onRepairSelected(r);
        box.appendChild(c);
      });
      mountMessage(mount, '');
    } catch (err) {
      console.error(err);
      mountMessage(mount,'Failed to load repairs');
    }
  }

  function showPrice(r) {
    let p = qs('#ram-service-widget .price-box');
    if (!p) { p = ce('div'); p.className='price-box'; mount.appendChild(p); }
    p.innerHTML = `<div><strong>${r.name}</strong></div><div style="margin-top:8px;">Your price: <strong>${r.priceEffective || 'CALL_FOR_PRICE'}</strong></div>`;
  }

  function showForm() {
    // simple contact form; adapt fields later to full form from screenshot
    let f = qs('#ram-service-widget form');
    if (f) return; // already shown
    f = document.createElement('form');
    f.innerHTML = `
      <h4>Repair form</h4>
      <label>Full name</label><input name="name" placeholder="Full name" required />
      <label>Email</label><input name="email" placeholder="Email" required />
      <label>Phone</label><input name="phone" placeholder="Phone" />
      <label>Notes / error description</label><textarea name="notes" rows="4"></textarea>
      <button type="submit" class="btn">Request repair</button>
    `;
    f.onsubmit = async function(e){
      e.preventDefault();
      const form = new FormData(f);
      const payload = {
        contact: { name: form.get('name'), email: form.get('email'), phone: form.get('phone') },
        category: state.category ? state.category._id : null,
        modelId: state.model ? state.model._id : null,
        repair_code: state.repair ? state.repair.code : null,
        metadata: { notes: form.get('notes') || '' }
      };
      try {
        const res = await fetch(window.RAM_SERVICE_API_BASE + '/api/submit', {
          method:'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.ok) {
          f.innerHTML = '<div>Request received — thank you. We will contact you shortly.</div>';
        } else {
          f.insertAdjacentHTML('afterbegin', '<div style="color:red;">Submit failed: '+ (json.error || JSON.stringify(json)) +'</div>');
        }
      } catch (err) {
        console.error(err);
        f.insertAdjacentHTML('afterbegin', '<div style="color:red;">Submit failed — check console</div>');
      }
    };
    mount.appendChild(f);
  }

  // initial load
  loadCategories();

})();
