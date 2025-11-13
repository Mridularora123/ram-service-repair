// widget-example.js — embeddable widget (final)
(function () {
  // simple helpers
  function qs(path){ return (window.RAM_SERVICE_API_BASE || location.origin) + path; }
  async function apiGET(path){ const r = await fetch(qs(path)); if(!r.ok) throw new Error('API ' + path + ' ' + r.status); return r.json(); }
  function el(tag, cls, txt){ const e = document.createElement(tag); if(cls) e.className = cls; if(txt!==undefined) e.innerText = txt; return e; }
  function money(v){ return (v===undefined || v===null) ? 'Call for price' : (typeof v === 'number' ? (v/100).toFixed(2) : v); }

  // basic styles injected
  const style = document.createElement('style');
  style.innerHTML = `
    #ram-widget { font-family: Arial, Helvetica, sans-serif; max-width:980px; margin:40px auto; color:#222; }
    #ram-widget h2 { text-align:center; margin:20px 0; }
    .ram-row { display:flex; gap:18px; flex-wrap:wrap; justify-content:center; margin:18px 0; }
    .ram-card { background:#eef5ff; padding:22px; border-radius:10px; width:200px; text-align:center; cursor:pointer; box-shadow:0 2px 0 rgba(0,0,0,0.03); }
    .ram-card.selected { background:#cfd8e6; }
    .ram-select { padding:14px 18px; border-radius:34px; border:2px solid #111; background:#fff; display:inline-block; margin:16px auto; }
    .ram-info { margin:24px 0; padding:12px; background:#f6fbff; border-radius:8px; }
    .ram-form { background:#f3f8ff; padding:18px; border-radius:10px; }
    .ram-form input, .ram-form textarea, .ram-form select { width:100%; padding:10px; margin:8px 0; border-radius:8px; border:1px solid #d1dbe8; }
    .ram-button { background:#0b63d6;color:#fff;padding:12px 18px;border-radius:8px;border:0;cursor:pointer;margin-top:8px; }
    .hide{ display:none; }
    @media(max-width:600px){ .ram-card{ width:140px; padding:12px } }
  `;
  document.head.appendChild(style);

  // main mount
  const mount = (function(){
    let m = document.getElementById('ram-service-widget');
    if(!m){
      m = document.createElement('div'); m.id = 'ram-service-widget';
      document.body.appendChild(m);
    }
    return m;
  })();

  // top container
  const root = el('div','', '');
  root.id = 'ram-widget';
  mount.appendChild(root);

  root.innerHTML = `<h2>Service Repair — quick form</h2>`;

  // sections
  const catWrap = el('div','','');
  const seriesWrap = el('div','','');
  const modelWrap = el('div','','');
  const repairsWrap = el('div','','');
  const formWrap = el('div','','');

  root.appendChild(catWrap);
  root.appendChild(seriesWrap);
  root.appendChild(modelWrap);
  root.appendChild(repairsWrap);
  root.appendChild(formWrap);

  // state
  const state = { category:null, series:null, model:null, repair:null };

  // render helpers
  function clear(elm){ elm.innerHTML = ''; }
  function setSelectedCard(listEls, id){ listEls.forEach(e => e.classList.toggle('selected', e.dataset.id === id)); }

  // 1) categories
  async function loadCategories(){
    clear(catWrap);
    catWrap.appendChild(el('h3','','Select device category'));
    const row = el('div','ram-row','Loading categories...');
    catWrap.appendChild(row);
    try {
      const cats = await apiGET('/api/categories');
      clear(row);
      const cardEls = [];
      cats.forEach(c=>{
        const card = el('div','ram-card', c.name);
        card.dataset.id = c._id || c.slug;
        card.onclick = ()=> {
          state.category = c;
          // highlight
          setSelectedCard(cardEls, card.dataset.id);
          // load series for this category
          loadSeries(c);
        };
        row.appendChild(card);
        cardEls.push(card);
      });
      if (cats.length===0) row.innerText = 'No categories found';
    } catch (e) {
      console.error(e);
      clear(row);
      row.innerText = 'Failed to load categories — check API base and CORS: ' + (window.RAM_SERVICE_API_BASE || location.origin) + '/api/categories';
    }
  }

  // 2) series
  async function loadSeries(category){
    clear(seriesWrap);
    seriesWrap.appendChild(el('h3','','Select Series'));
    const row = el('div','ram-row','Loading series...');
    seriesWrap.appendChild(row);
    try {
      // query either by slug or category id (server supports both)
      const q = category.slug ? ('/api/series?category=' + encodeURIComponent(category.slug)) : ('/api/series?category=' + encodeURIComponent(category._id));
      const series = await apiGET(q);
      clear(row);
      if (!Array.isArray(series) || series.length===0) {
        row.innerText = 'No series for this category';
        // still show model select dropdown placeholder (optional)
        modelWrap.innerHTML = '<div style="text-align:center;margin:18px 0;"><em>Select a series to continue</em></div>';
        repairsWrap.innerHTML = '<div style="text-align:center;margin:18px 0;"><em>No repair options</em></div>';
        formWrap.innerHTML = '';
        return;
      }
      const cardEls = [];
      series.forEach(s=>{
        const card = el('div','ram-card', s.name);
        card.dataset.id = s._id;
        card.onclick = ()=> {
          state.series = s;
          setSelectedCard(cardEls, card.dataset.id);
          loadModelsForSeries(s);
        };
        row.appendChild(card);
        cardEls.push(card);
      });
    } catch (e) {
      console.error(e);
      clear(row);
      row.innerText = 'Failed to load series';
    }
  }

  // 3) models for series
  async function loadModelsForSeries(series){
    clear(modelWrap);
    modelWrap.appendChild(el('h3','','Select a model from the list'));
    const row = el('div','ram-row','Loading models...');
    modelWrap.appendChild(row);
    try {
      const models = await apiGET('/api/series/' + encodeURIComponent(series._id) + '/models');
      clear(row);
      if (!Array.isArray(models) || models.length===0) {
        row.innerText = 'No models found';
        repairsWrap.innerHTML = '<div style="text-align:center;margin:18px 0;"><em>No repair options</em></div>';
        formWrap.innerHTML = '';
        return;
      }
      const cardEls = [];
      models.forEach(m=>{
        const card = el('div','ram-card', m.name + (m.sku ? ('\n' + m.sku) : ''));
        card.dataset.id = m._id;
        card.onclick = ()=> {
          state.model = m;
          setSelectedCard(cardEls, card.dataset.id);
          loadRepairsForModel(m);
        };
        row.appendChild(card);
        cardEls.push(card);
      });
    } catch (e) {
      console.error(e);
      clear(row);
      row.innerText = 'Failed to load models';
    }
  }

  // 4) repairs for model
  async function loadRepairsForModel(model){
    clear(repairsWrap);
    repairsWrap.appendChild(el('h3','','Select type of injury'));
    const row = el('div','ram-row','Loading repair options...');
    repairsWrap.appendChild(row);
    try {
      const repairs = await apiGET('/api/repairs?modelId=' + encodeURIComponent(model._id));
      clear(row);
      if (!Array.isArray(repairs) || repairs.length===0) { row.innerText = 'No repair options'; formWrap.innerHTML=''; return; }

      const cardEls = [];
      repairs.forEach(r=>{
        const card = el('div','ram-card', r.name + '\n' + (r.etaDays ? (r.etaDays + ' days') : ''));
        card.dataset.id = r.code || r._id;
        card.onclick = ()=>{
          state.repair = r;
          setSelectedCard(cardEls, card.dataset.id);
          showForm();
        };
        row.appendChild(card);
        cardEls.push(card);
      });
    } catch (e) {
      console.error(e);
      clear(row);
      row.innerText = 'Failed to load repairs';
    }
  }

  // 5) show the form (populated with selected category/series/model/repair)
  function showForm(){
    clear(formWrap);
    const info = el('div','ram-info','');
    info.innerHTML = `
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">
        <div style="min-width:120px;"><strong>${state.model.name || ''}</strong><div style="font-size:12px;color:#555">${state.model.sku || ''}</div></div>
        <div style="flex:1">
          <div style="font-size:14px;color:#333">Repair: <strong>${state.repair.name || ''}</strong></div>
          <div style="font-size:26px;margin-top:6px;color:#0b63d6">Your price: <strong>${money(state.repair.priceEffective)}</strong></div>
        </div>
      </div>
    `;
    formWrap.appendChild(info);

    const formCard = el('div','ram-form','');
    formCard.innerHTML = `
      <h4>Repair form</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label>First and last name</label>
          <input id="ram-name" placeholder="Full name" />
          <label>Email</label>
          <input id="ram-email" placeholder="Email" />
          <label>Contact phone</label>
          <input id="ram-phone" placeholder="Phone" />
        </div>
        <div>
          <label>Company</label>
          <input id="ram-company" placeholder="Company (optional)" />
          <label>Address</label>
          <input id="ram-address" placeholder="Street, city" />
          <label>Postal code</label>
          <input id="ram-postal" placeholder="Postal code" />
        </div>
      </div>
      <div style="margin-top:10px;">
        <label>IMEI / Serial (optional)</label>
        <input id="ram-imei" placeholder="IMEI or serial" />
        <label>Problem description</label>
        <textarea id="ram-desc" rows="4" placeholder="Describe problem"></textarea>
        <div style="display:flex;gap:12px;align-items:center;">
          <button id="ram-submit" class="ram-button">Request repair</button>
          <div id="ram-msg" style="margin-left:12px;color:green;"></div>
        </div>
      </div>
    `;
    formWrap.appendChild(formCard);

    // submit handler
    document.getElementById('ram-submit').onclick = async function(){
      const contact = {
        name: document.getElementById('ram-name').value,
        email: document.getElementById('ram-email').value,
        phone: document.getElementById('ram-phone').value,
        company: document.getElementById('ram-company').value,
        address: document.getElementById('ram-address').value,
        postal: document.getElementById('ram-postal').value
      };
      if(!contact.email) { document.getElementById('ram-msg').innerText = 'Email required'; return; }
      const payload = {
        contact,
        category: state.category.slug || state.category._id,
        modelId: state.model._id,
        repair_code: state.repair.code || state.repair._id,
        metadata: {
          imei: document.getElementById('ram-imei').value,
          description: document.getElementById('ram-desc').value
        }
      };
      try {
        const r = await fetch(qs('/api/submit'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const j = await r.json();
        if (r.ok) {
          document.getElementById('ram-msg').style.color = 'green';
          document.getElementById('ram-msg').innerText = 'Submitted — id: ' + j.id;
        } else {
          document.getElementById('ram-msg').style.color = 'red';
          document.getElementById('ram-msg').innerText = (j.error || JSON.stringify(j));
        }
      } catch (e) {
        console.error(e);
        document.getElementById('ram-msg').style.color = 'red';
        document.getElementById('ram-msg').innerText = 'Submit failed';
      }
    };
  }

  // start
  loadCategories();
})();
