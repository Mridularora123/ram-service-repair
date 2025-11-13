// server.js — updated
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const Category = require('./models/Category');
const DeviceModel = require('./models/Model');
const RepairOption = require('./models/RepairOption');
const ServiceRequest = require('./models/ServiceRequest');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// ---------- helper middleware to allow embedding in Shopify admin iframe ----------
function allowShopifyIframe(req, res, next) {
  // Remove X-Frame-Options if present (some hosts add it)
  try { res.removeHeader('X-Frame-Options'); } catch (e) { /* ignore */ }

  // Allow framing from Shopify admin domains and self
  // NOTE: adjust as needed if you want to add more origins
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors https://*.myshopify.com https://admin.shopify.com 'self';"
  );
  next();
}

// Use allowShopifyIframe only for admin routes (we don't want to weaken other paths)
app.use(['/admin', '/admin/*'], allowShopifyIframe);

// ---------- serve embeddable widget (existing) ----------
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'widget-example.js'));
});

// Basic health
app.get('/_health', (req, res) => res.json({ ok: true }));

// Connect MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error', err));

// Public API: lists for frontend widget
app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ order: 1 });
    res.json(cats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.get('/api/models', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    const models = await DeviceModel.find(filter).sort({ brand: 1, name: 1 });
    res.json(models);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.get('/api/repairs', async (req, res) => {
  try {
    const modelId = req.query.modelId;
    let repairs = await RepairOption.find({});
    // if modelId provided, merge any model override values
    if (modelId) {
      const model = await DeviceModel.findById(modelId);
      repairs = repairs.map(r => {
        const obj = r.toObject();
        const override = model && model.priceOverrides ? model.priceOverrides[r.code] : undefined;
        obj.priceEffective = override || r.basePrice || "CALL_FOR_PRICE";
        return obj;
      });
    }
    res.json(repairs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Admin-protected API (simple password)
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password || req.body.admin_password;
  if (pass && pass === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Admin endpoints: create/update categories/models/repairs
app.post('/admin/category', adminAuth, async (req, res) => {
  try {
    const doc = new Category(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.post('/admin/model', adminAuth, async (req, res) => {
  try {
    const doc = new DeviceModel(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Update model
app.put('/admin/model/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const updates = req.body;
    const doc = await DeviceModel.findByIdAndUpdate(id, updates, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.post('/admin/repair', adminAuth, async (req, res) => {
  try {
    const doc = new RepairOption(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Submit service request
app.post('/api/submit', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.contact || !payload.contact.email) return res.status(400).json({ error: 'Missing contact.email' });

    let price = null;
    const repair = await RepairOption.findOne({ code: payload.repair_code });
    if (!repair) {
      price = 'CALL_FOR_PRICE';
    } else {
      if (payload.modelId) {
        const model = await DeviceModel.findById(payload.modelId);
        if (model && model.priceOverrides && model.priceOverrides[repair.code]) price = model.priceOverrides[repair.code];
      }
      if (!price) {
        price = repair.basePrice || 'CALL_FOR_PRICE';
      }
    }
    const rec = new ServiceRequest({
      contact: payload.contact,
      category: payload.category,
      modelId: payload.modelId,
      repair_code: payload.repair_code,
      priceAtSubmit: price,
      metadata: payload.metadata || {}
    });
    await rec.save();
    // TODO: send emails
    res.json({ ok: true, id: rec._id, price, message: 'Request received' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// --------------- Embedded admin UI (simple) ---------------
// Admin page showing categories and models (calls public /api endpoints)
app.get('/admin', (req, res) => {
  // The allowShopifyIframe middleware set the correct CSP above.
  const host = process.env.HOST || (req.protocol + '://' + req.get('host'));
  res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RAM Service Repair — Admin</title>
<style>
  body{font-family:Inter,system-ui,Arial;margin:20px;color:#111;background:#f4f6f8}
  .row{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
  .panel{background:#fff;border-radius:8px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.05);flex:1;min-width:280px}
  ul{padding-left:18px}
  button{padding:8px 12px;border-radius:6px;border:1px solid #ddd;background:#f9f9f9;cursor:pointer}
  select{padding:8px;border-radius:8px;border:1px solid #ddd}
  pre{background:#fff8;border-radius:6px;padding:8px;white-space:pre-wrap}
</style>
</head>
<body>
  <h1>RAM Service Repair — Admin</h1>
  <p id="shop-info"></p>

  <div class="row">
    <div class="panel" style="max-width:360px">
      <h3>Categories</h3>
      <div id="categories">Loading…</div>
      <hr>
      <button id="refresh-cats">Refresh</button>
    </div>

    <div class="panel">
      <h3>Models</h3>
      <div>
        <label>Select category:</label>
        <select id="cat-select"><option value="">— choose —</option></select>
      </div>
      <div id="models-list" style="margin-top:12px">Pick a category to show models</div>
    </div>

    <div class="panel">
      <h3>Quick actions</h3>
      <p>Create a new category/model/repair using the Admin API (curl or the edit UI below).</p>
      <p><small>Examples (server must have ADMIN_PASSWORD set):</small></p>
      <pre>POST /admin/category (x-admin-password)</pre>
      <pre>POST /admin/model (x-admin-password)</pre>
      <div style="margin-top:8px">
        <button id="open-theme-snippet">Show widget snippet</button>
      </div>
      <div id="snippet" style="margin-top:12px;display:none">
        <pre>&lt;div id="ram-service-widget"&gt;&lt;/div&gt;
&lt;script&gt;(function(){var s=document.createElement('script');s.src='${host ? host.replace(/\\/$/,'') : ''}/widget.js';s.async=true;document.getElementById('ram-service-widget').appendChild(s);})();&lt;/script&gt;</pre>
      </div>
    </div>
  </div>

  <hr>
  <h3>Edit model (simple)</h3>
  <p>Open the Edit form in a new window to update a model (you'll need the admin password).</p>
  <div>
    <input id="edit-model-id" placeholder="paste model _id here" style="padding:8px;width:320px;border-radius:6px;border:1px solid #ddd" />
    <button id="open-edit">Open Edit</button>
  </div>

<script>
async function api(path){ 
  const r = await fetch(path, {credentials: 'same-origin'}); 
  if(!r.ok) throw new Error('API error '+r.status); 
  return r.json();
}

async function loadCategories(){
  const c = await api('/api/categories');
  const wrap = document.getElementById('categories');
  const sel = document.getElementById('cat-select');
  wrap.innerHTML = '';
  sel.innerHTML = '<option value="">— choose —</option>';
  if(!Array.isArray(c) || c.length===0){ wrap.innerHTML = '<em>No categories</em>'; return; }
  c.forEach(cat=>{
    const btn = document.createElement('button');
    btn.textContent = cat.name;
    btn.onclick = ()=> loadModels(cat.slug);
    wrap.appendChild(btn);
    wrap.appendChild(document.createElement('br'));

    const opt = document.createElement('option');
    opt.value = cat.slug;
    opt.textContent = cat.name;
    sel.appendChild(opt);
  });
}

async function loadModels(categorySlug){
  if(!categorySlug) return;
  document.getElementById('models-list').innerHTML = 'Loading…';
  const models = await api('/api/models?category='+encodeURIComponent(categorySlug));
  const el = document.getElementById('models-list');
  if(!models || models.length===0){ el.innerHTML='<em>No models</em>'; return; }
  el.innerHTML = '';
  const ul = document.createElement('ul');
  models.forEach(m=>{
    const li = document.createElement('li');
    li.innerHTML = '<strong>'+m.name+'</strong> <small>('+(m.sku||'')+')</small> '+
      '<button data-id="'+m._id+'" style="margin-left:8px">Edit</button>';
    ul.appendChild(li);
  });
  el.appendChild(ul);
  el.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=>{
      const id = b.getAttribute('data-id');
      window.open('/admin/edit-model?id='+encodeURIComponent(id), '_blank');
    });
  });
}

document.getElementById('refresh-cats').addEventListener('click', loadCategories);
document.getElementById('cat-select').addEventListener('change', (e)=> loadModels(e.target.value));
document.getElementById('open-theme-snippet').addEventListener('click', ()=> {
  document.getElementById('snippet').style.display = 'block';
});
document.getElementById('open-edit').addEventListener('click', ()=>{
  const id = document.getElementById('edit-model-id').value.trim();
  if(!id) return alert('Paste model id first');
  window.open('/admin/edit-model?id='+encodeURIComponent(id), '_blank');
});

(async function init(){
  try {
    const q = new URLSearchParams(window.location.search);
    if(q.get('shop')) document.getElementById('shop-info').textContent = 'Shop: '+q.get('shop');
    await loadCategories();
  } catch(err){
    console.error(err);
    alert('Failed to load admin UI: '+err.message);
  }
})();
</script>
</body>
</html>`);
});

// Simple edit-model page (opens in new tab/window). This page will request the model by id (public GET /api/models filtered) then allow updating via PUT with admin password (entered into the form).
app.get('/admin/edit-model', async (req, res) => {
  const id = req.query.id || '';
  const host = process.env.HOST || (req.protocol + '://' + req.get('host'));
  res.send(`<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Edit model</title>
<style>body{font-family:Inter,Arial;padding:18px;background:#f4f6f8}label{display:block;margin-top:8px}input,textarea,select{width:100%;padding:8px;border-radius:6px;border:1px solid #ccc}button{margin-top:12px;padding:8px 12px}</style>
</head>
<body>
  <h2>Edit model</h2>
  <p>Model id: <strong id="mid">${id}</strong></p>
  <div>
    <label>Admin password (server ADMIN_PASSWORD)</label>
    <input id="admin-pass" type="password" placeholder="enter admin password to save" />
    <label>Model JSON (edit and save)</label>
    <textarea id="model-json" rows="12" placeholder="model JSON will load here"></textarea>
    <div>
      <button id="save">Save (PUT /admin/model/:id)</button>
      <button id="load">Load model</button>
    </div>
    <div id="status" style="margin-top:12px"></div>
  </div>

<script>
async function fetchModel(id){
  // We use public /api/models? - get single model by fetching all in worst case
  const r = await fetch('/api/models?category=');
  if(!r.ok) throw new Error('Failed fetch');
  const arr = await r.json();
  const found = arr.find(m=>m._id === id);
  return found;
}

document.getElementById('load').addEventListener('click', async ()=>{
  const id = document.getElementById('mid').textContent.trim();
  if(!id) return alert('No id');
  try{
    document.getElementById('status').textContent='Loading...';
    // attempt to get model directly (if your server exposes GET /api/models?category=.. only then above fallback)
    let model = null;
    // Try to hit a direct endpoint first
    try {
      const r2 = await fetch('/api/models?id='+encodeURIComponent(id));
      if(r2.ok){
        const j = await r2.json();
        if(Array.isArray(j) && j.length) model = j[0];
        else if(j && j._id) model = j;
      }
    } catch(e) { /* ignore */ }

    if(!model){
      // fallback: fetch list and find
      const all = await fetch('/api/models');
      const arr = await all.json();
      model = arr.find(m=>m._id === id);
    }
    if(!model) {
      document.getElementById('status').textContent='Model not found via API. You can paste model JSON manually.';
      return;
    }
    document.getElementById('model-json').value = JSON.stringify(model, null, 2);
    document.getElementById('status').textContent='Loaded';
  }catch(err){
    console.error(err);
    document.getElementById('status').textContent='Error loading model: '+err.message;
  }
});

document.getElementById('save').addEventListener('click', async ()=>{
  try{
    const id = document.getElementById('mid').textContent.trim();
    const pass = document.getElementById('admin-pass').value.trim();
    if(!pass) return alert('Enter admin password');
    let payload = null;
    try { payload = JSON.parse(document.getElementById('model-json').value); } catch(e){ return alert('Invalid JSON'); }
    document.getElementById('status').textContent='Saving...';
    const r = await fetch('/admin/model/'+encodeURIComponent(id), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': pass
      },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    if(!r.ok) {
      document.getElementById('status').textContent = 'Save error: '+(j && j.error ? j.error : JSON.stringify(j));
    } else {
      document.getElementById('status').textContent = 'Saved OK';
      document.getElementById('model-json').value = JSON.stringify(j, null, 2);
    }
  }catch(err){
    console.error(err);
    document.getElementById('status').textContent = 'Save failed: '+err.message;
  }
});

// Auto-load if id present
if(document.getElementById('mid').textContent.trim()) {
  document.getElementById('load').click();
}
</script>
</body>
</html>`);
});

// Optionally allow fetching a single model by id (not protected) to make edit UI easier.
// WARNING: public exposure — only include if you want this convenience.
app.get('/api/models', async (req, res) => {
  try {
    if (req.query.id) {
      const doc = await DeviceModel.findById(req.query.id);
      return res.json(doc ? doc : {});
    }
    // earlier behavior (list by category)
    if (req.query.category) {
      const filter = { category: req.query.category };
      const models = await DeviceModel.find(filter).sort({ brand: 1, name: 1 });
      return res.json(models);
    }
    // if no query, return all models (careful on large DBs)
    const models = await DeviceModel.find({}).sort({ brand: 1, name: 1 });
    res.json(models);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// --------------- end admin UI ---------------

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on', PORT));
