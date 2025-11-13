// widget-example.js
(function(){
  function el(tag, txt, className){
    const e = document.createElement(tag);
    if (txt) e.innerText = txt;
    if (className) e.className = className;
    return e;
  }
  async function api(path){
    const base = window.RAM_SERVICE_API_BASE || '';
    const url = (base + path).replace(/\/+/g, '/').replace('http:/','http://').replace('https:/','https://');
    // if base is full origin it will be fine; otherwise relative
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  const mount = document.getElementById('ram-service-widget');
  if (!mount) {
    console.warn('ram-service-widget not found; creating one at document.body');
    const m = document.createElement('div');
    m.id = 'ram-service-widget';
    document.body.appendChild(m);
  }

  const container = document.createElement('div');
  container.style.maxWidth = '1100px';
  container.style.margin = '40px auto';
  container.style.fontFamily = 'Arial, Helvetica, sans-serif';
  mount.appendChild(container);

  const title = el('h2','Select device category');
  title.style.textAlign = 'center';
  container.appendChild(title);

  const status = el('div','Loading categories...');
  status.style.textAlign = 'center';
  status.style.marginBottom = '18px';
  container.appendChild(status);

  // get categories and render simple grid
  api('/api/categories').then(cats=>{
    status.innerText = ''; // clear
    if (!Array.isArray(cats) || cats.length === 0) {
      status.innerText = 'No categories found';
      return;
    }
    const grid = el('div');
    grid.style.display = 'flex';
    grid.style.gap = '18px';
    grid.style.justifyContent = 'center';
    grid.style.flexWrap = 'wrap';
    container.appendChild(grid);

    cats.forEach(c=>{
      const card = el('button','');
      card.style.width = '220px';
      card.style.height = '140px';
      card.style.borderRadius = '12px';
      card.style.border = '1px solid #ddd';
      card.style.background = '#eef6ff';
      card.style.cursor = 'pointer';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.alignItems = 'center';
      card.style.justifyContent = 'center';
      card.style.padding = '12px';
      card.innerText = c.name || c.slug || 'Category';
      card.onclick = () => onCategorySelected(c);
      grid.appendChild(card);
    });
  }).catch(err=>{
    status.innerText = `Failed to load categories — check API base and CORS. ${err.message}`;
    console.error('widget categories error', err);
  });

  let selected = { category: null, series: null, model: null, repair: null };

  function clearBelow(node) {
    // remove nodes after the supplied node in container
    while (container.lastChild && container.lastChild !== node) {
      container.removeChild(container.lastChild);
    }
  }

  function onCategorySelected(c) {
    selected.category = c;
    // show selected state
    const sel = el('div', `Selected category: ${c.name}`);
    sel.style.textAlign = 'center';
    sel.style.marginTop = '18px';
    container.appendChild(sel);

    // load series for the category
    const sTitle = el('h3', 'Select Series');
    sTitle.style.textAlign = 'center';
    container.appendChild(sTitle);

    const seriesWrap = el('div');
    seriesWrap.style.display = 'flex';
    seriesWrap.style.gap = '12px';
    seriesWrap.style.justifyContent = 'center';
    container.appendChild(seriesWrap);

    api(`/api/series?category=${encodeURIComponent(c.slug || c._id)}`).then(seriesList=>{
      if (!Array.isArray(seriesList) || seriesList.length === 0) {
        seriesWrap.appendChild(el('div','No series found'));
        return;
      }
      seriesList.forEach(s=>{
        const b = el('button', s.name || s.slug);
        b.style.width = '200px';
        b.style.height = '120px';
        b.style.borderRadius = '10px';
        b.onclick = ()=> onSeriesSelected(s);
        seriesWrap.appendChild(b);
      });
    }).catch(err=>{
      seriesWrap.appendChild(el('div','Failed to load series: ' + err.message));
      console.error('widget series error', err);
    });
  }

  function onSeriesSelected(series) {
    selected.series = series;
    // remove everything after series area and load models
    clearBelow(container.querySelector('h3') || container.firstChild);
    const mTitle = el('h3', 'Select a model from the list');
    mTitle.style.textAlign = 'center';
    container.appendChild(mTitle);

    const modelSelect = el('div');
    modelSelect.style.display = 'flex';
    modelSelect.style.gap = '12px';
    modelSelect.style.justifyContent = 'center';
    modelSelect.style.flexWrap = 'wrap';
    container.appendChild(modelSelect);

    api(`/api/series/${encodeURIComponent(series._id)}/models`).then(models=>{
      if (!Array.isArray(models) || models.length === 0) {
        modelSelect.appendChild(el('div','No models found'));
        return;
      }
      models.forEach(m=>{
        const card = el('button', m.name || m.slug);
        card.style.width = '280px';
        card.style.height = '70px';
        card.onclick = ()=> onModelSelected(m);
        modelSelect.appendChild(card);
      });
    }).catch(err=>{
      modelSelect.appendChild(el('div','Failed to load models: ' + err.message));
      console.error('widget models error', err);
    });
  }

  function onModelSelected(model) {
    selected.model = model;
    // clear beneath model area
    clearBelow(container.querySelector('div[style*="flex-wrap"]') || container.firstChild);
    const title = el('h3', 'Select type of injury');
    title.style.textAlign = 'center';
    container.appendChild(title);

    const repairsWrap = el('div');
    repairsWrap.style.display = 'flex';
    repairsWrap.style.flexWrap = 'wrap';
    repairsWrap.style.gap = '14px';
    repairsWrap.style.justifyContent = 'center';
    container.appendChild(repairsWrap);

    api(`/api/repairs?modelId=${encodeURIComponent(model._id)}`).then(repairs=>{
      if (!Array.isArray(repairs) || repairs.length === 0) {
        repairsWrap.appendChild(el('div','No repair options'));
        return;
      }
      repairs.forEach(r=>{
        const b = el('button', `${r.name} — ${r.priceEffective || ''}`);
        b.style.minWidth = '220px';
        b.style.height = '110px';
        b.onclick = ()=> onRepairSelected(r);
        repairsWrap.appendChild(b);
      });
    }).catch(err=>{
      repairsWrap.appendChild(el('div','Failed to load repairs: ' + err.message));
      console.error('widget repairs error', err);
    });
  }

  function onRepairSelected(repair) {
    selected.repair = repair;
    // show summary and form
    clearBelow(container.querySelector('h3') || container.firstChild);
    const summary = el('div', `Selected: ${selected.category.name} > ${selected.series.name} > ${selected.model.name} > ${repair.name}`);
    summary.style.textAlign = 'center';
    summary.style.margin = '10px 0 20px';
    container.appendChild(summary);

    const priceBox = el('div', `Estimated price: ${repair.priceEffective || 'CALL_FOR_PRICE'}`);
    priceBox.style.textAlign = 'center';
    priceBox.style.marginBottom = '12px';
    container.appendChild(priceBox);

    // small form: name + email + phone + submit
    const form = document.createElement('form');
    form.style.maxWidth = '700px';
    form.style.margin = '0 auto';
    form.style.display = 'grid';
    form.style.gridTemplateColumns = '1fr';
    form.style.gap = '8px';

    const nameIn = document.createElement('input');
    nameIn.placeholder = 'Full name';
    nameIn.required = true;
    form.appendChild(nameIn);

    const emailIn = document.createElement('input');
    emailIn.placeholder = 'Email';
    emailIn.type = 'email';
    emailIn.required = true;
    form.appendChild(emailIn);

    const phoneIn = document.createElement('input');
    phoneIn.placeholder = 'Phone';
    form.appendChild(phoneIn);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.innerText = 'Request repair';
    submitBtn.style.padding = '10px';
    form.appendChild(submitBtn);

    const msg = el('div','');
    msg.style.textAlign = 'center';
    msg.style.marginTop = '8px';
    container.appendChild(form);
    container.appendChild(msg);

    form.onsubmit = async (ev) => {
      ev.preventDefault();
      submitBtn.disabled = true;
      msg.innerText = 'Submitting...';
      try {
        const payload = {
          contact: { name: nameIn.value, email: emailIn.value, phone: phoneIn.value },
          category: selected.category.slug || selected.category._id,
          modelId: selected.model._id,
          repair_code: selected.repair.code,
        };
        const res = await fetch((window.RAM_SERVICE_API_BASE || '') + '/api/submit', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || JSON.stringify(data));
        msg.innerText = `Request received — id: ${data.id} — price: ${data.price}`;
        form.reset();
      } catch (err) {
        msg.innerText = 'Submit failed: ' + (err.message || err);
        console.error('widget submit error', err);
      } finally {
        submitBtn.disabled = false;
      }
    };
  }

})();
