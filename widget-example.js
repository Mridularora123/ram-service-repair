// Simple embeddable widget example (serve this from your app at /widget.js)
(function(){
  async function api(path){ return fetch(window.RAM_SERVICE_API_BASE + path).then(r=>r.json()); }
  function el(tag, txt){ const e = document.createElement(tag); if(txt) e.innerText = txt; return e; }
  window.RAM_SERVICE_API_BASE = window.RAM_SERVICE_API_BASE || 'https://YOUR_APP_URL';
  const mount = document.getElementById('ram-service-widget');
  mount.appendChild(el('h3','Select device category'));
  api('/api/categories').then(cats=>{
    const container = el('div');
    cats.forEach(c=>{
      const b = el('button', c.name);
      b.onclick = ()=> {
        // load models then repairs etc...
        mount.appendChild(el('div', 'Selected: ' + c.name));
      };
      container.appendChild(b);
    });
    mount.appendChild(container);
  });
})();
