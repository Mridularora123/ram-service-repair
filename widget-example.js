// widget-example.js — embeddable widget
(function () {
  // helper to fetch JSON with helpful errors
  async function api(path) {
    if (!window.__RAM_API_BASE) throw new Error('API base not set');
    const url = window.__RAM_API_BASE.replace(/\/$/, '') + path;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(()=>'');
      throw new Error(`${res.status} ${res.statusText} - ${url} ${text ? ('| '+text) : ''}`);
    }
    return res.json();
  }

  function el(tag, txt, cls) {
    const e = document.createElement(tag);
    if (txt !== undefined) {
      if (tag === 'img') e.alt = txt;
      else e.innerText = txt;
    }
    if (cls) e.className = cls;
    return e;
  }

  // find script tag that loaded this file (so we can read data-api-base)
  let apiBase = null;
  const scripts = document.getElementsByTagName('script');
  for (let i = scripts.length - 1; i >= 0; i--) {
    const s = scripts[i];
    if (s.src && s.src.indexOf('/widget.js') !== -1) {
      apiBase = s.dataset && s.dataset.apiBase ? s.dataset.apiBase : null;
      break;
    }
  }
  if (!apiBase && window.RAM_SERVICE_API_BASE) apiBase = window.RAM_SERVICE_API_BASE;
  if (!apiBase && window.APP_URL) apiBase = window.APP_URL;
  if (!apiBase && window.location.hostname) {
    // do not default to same origin (Shopify) — prefer to require explicit API base
    // apiBase = window.location.origin; // avoid doing this
  }

  const mount = document.getElementById('ram-service-widget') || (function(){ const d = document.createElement('div'); d.id = 'ram-service-widget'; document.body.appendChild(d); return d; })();

  if (!apiBase) {
    mount.appendChild(el('p', 'Failed to load categories — set API base by adding data-api-base attribute to the script tag or set window.RAM_SERVICE_API_BASE.'));
    return;
  }

  window.__RAM_API_BASE = apiBase.replace(/\/$/, '');

  // Basic styling hook (host can override)
  const rootClass = 'ram-widget-root';
  const styleId = 'ram-widget-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      .${rootClass} { font-family: Arial, sans-serif; max-width:980px; margin:20px auto; }
      .${rootClass} .ram-row { display:flex; gap:12px; flex-wrap:wrap; margin:12px 0; }
      .${rootClass} button { padding:12px 18px; border-radius:8px; border:1px solid #ddd; background:#f6f9ff; cursor:pointer; }
      .${rootClass} .ram-btn-choose { background:#0b6; color:#fff; border:0; }
      .${rootClass} .ram-repair-card { border-radius:10px; padding:12px; background:#f3f8ff; width:220px; box-sizing:border-box; }
      .${rootClass} input, .${rootClass} textarea { width:100%; padding:8px; box-sizing:border-box; margin:6px 0; }
    `;
    document.head.appendChild(style);
  }

  const root = el('div', null, rootClass);
  mount.appendChild(root);

  const title = el('h3', 'Select device category');
  root.appendChild(title);

  const catsWrap = el('div', null, 'ram-row ram-categories');
  root.appendChild(catsWrap);

  const seriesWrap = el('div', null, 'ram-row ram-series');
  root.appendChild(el('h4', 'Select Series'));
  root.appendChild(seriesWrap);

  const modelsWrap = el('div', null, 'ram-row ram-models');
  root.appendChild(el('h4', 'Select model'));
  root.appendChild(modelsWrap);

  const repairsWrap = el('div', null, 'ram-row ram-repairs');
  root.appendChild(el('h4', 'Select type of injury'));
  root.appendChild(repairsWrap);

  const formWrap = el('div', null, 'ram-form-wrap');
  root.appendChild(formWrap);

  function clear(elm) { while (elm.firstChild) elm.removeChild(elm.firstChild); }

  // Load categories
  api('/api/categories').then(cats => {
    if (!Array.isArray(cats) || cats.length === 0) {
      catsWrap.appendChild(el('p', 'No categories available'));
      return;
    }
    cats.forEach(c => {
      const btn = el('button', c.name);
      btn.onclick = async () => {
        // highlight (simple)
        Array.from(catsWrap.children).forEach(n=> n.style.boxShadow='none');
        btn.style.boxShadow = 'inset 0 0 0 2px rgba(0,0,0,0.08)';
        // clear next levels
        clear(seriesWrap); clear(modelsWrap); clear(repairsWrap); clear(formWrap);
        seriesWrap.appendChild(el('p', 'Loading series...'));
        try {
          const series = await api('/api/series?category=' + encodeURIComponent(c.slug || c._id));
          clear(seriesWrap);
          if (!series || !series.length) {
            seriesWrap.appendChild(el('p', 'No series available'));
            return;
          }
          series.forEach(s => {
            const sb = el('button', s.name);
            sb.onclick = async () => {
              Array.from(seriesWrap.children).forEach(n=> n.style.boxShadow='none');
              sb.style.boxShadow = 'inset 0 0 0 2px rgba(0,0,0,0.08)';
              clear(modelsWrap); clear(repairsWrap); clear(formWrap);
              modelsWrap.appendChild(el('p', 'Loading models...'));
              try {
                const models = await api('/api/series/' + s._id + '/models');
                clear(modelsWrap);
                if (!models || !models.length) {
                  modelsWrap.appendChild(el('p', 'No models'));
                  return;
                }
                models.forEach(m => {
                  const mb = el('button', m.name);
                  mb.onclick = async () => {
                    Array.from(modelsWrap.children).forEach(n=> n.style.boxShadow='none');
                    mb.style.boxShadow = 'inset 0 0 0 2px rgba(0,0,0,0.08)';
                    clear(repairsWrap); clear(formWrap);
                    repairsWrap.appendChild(el('p','Loading repairs...'));
                    try {
                      const repairs = await api('/api/repairs?modelId=' + m._id);
                      clear(repairsWrap);
                      if (!repairs || !repairs.length) {
                        repairsWrap.appendChild(el('p','No repair options'));
                        return;
                      }
                      repairs.forEach(r => {
                        const card = el('div', null, 'ram-repair-card');
                        const name = el('div', r.name, 'ram-repair-name');
                        const price = el('div', (r.priceEffective !== undefined ? r.priceEffective : 'CALL_FOR_PRICE'), 'ram-repair-price');
                        const choose = el('button', 'Choose', 'ram-btn-choose');
                        choose.onclick = () => {
                          clear(formWrap);
                          const heading = el('h4', m.name + ' — ' + r.name);
                          const priceLine = el('div', 'Your price: ' + (r.priceEffective || 'CALL_FOR_PRICE'));
                          const form = el('form');
                          form.innerHTML = `
                            <label>Full name<br><input name="name" required></label>
                            <label>Email<br><input name="email" type="email" required></label>
                            <label>Phone<br><input name="phone"></label>
                            <label>Notes<br><textarea name="notes"></textarea></label>
                            <button type="submit">Request repair</button>
                          `;
                          form.onsubmit = async (ev) => {
                            ev.preventDefault();
                            const fd = new FormData(form);
                            const payload = {
                              contact: { name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone') },
                              category: c.slug || c._id,
                              modelId: m._id,
                              repair_code: r.code,
                              metadata: { notes: fd.get('notes') }
                            };
                            try {
                              const resp = await fetch(window.__RAM_API_BASE + '/api/submit', {
                                method: 'POST',
                                headers: {'Content-Type':'application/json'},
                                body: JSON.stringify(payload)
                              });
                              const j = await resp.json();
                              if (resp.ok) {
                                formWrap.innerHTML = '<p>Request submitted. Thank you.</p>';
                              } else {
                                formWrap.innerHTML = '<p>Submit failed: ' + (j.error || JSON.stringify(j)) + '</p>';
                              }
                            } catch (err) {
                              formWrap.innerHTML = '<p>Submit error: ' + err.message + '</p>';
                            }
                          };
                          formWrap.appendChild(heading);
                          formWrap.appendChild(priceLine);
                          formWrap.appendChild(form);
                        };
                        card.appendChild(name);
                        card.appendChild(price);
                        card.appendChild(choose);
                        repairsWrap.appendChild(card);
                      });
                    } catch (err) {
                      clear(repairsWrap);
                      repairsWrap.appendChild(el('p','Failed to load repairs — ' + err.message));
                    }
                  };
                  modelsWrap.appendChild(mb);
                });
              } catch (err) {
                clear(modelsWrap);
                modelsWrap.appendChild(el('p','Failed to load models — ' + err.message));
              }
            };
            seriesWrap.appendChild(sb);
          });
        } catch (err) {
          clear(seriesWrap);
          seriesWrap.appendChild(el('p','Failed to load series — ' + err.message));
        }
      };
      catsWrap.appendChild(btn);
    });
  }).catch(err => {
    clear(catsWrap);
    catsWrap.appendChild(el('p', 'Failed to load categories — check API base and CORS. ' + err.message));
  });
})();
