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

// health + root
app.get('/_health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.send('RAM Service Repair API is running. See /_health'));

// serve embeddable widget JS file at /widget.js
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  // serve the static widget/example file (ensure widget-example.js exists in project root)
  res.sendFile(path.join(__dirname, 'widget-example.js'));
});

// ---------- MongoDB connect ----------
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error', err));

// ---------- Public API ----------
app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ order: 1 });
    res.json(cats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
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
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/repairs', async (req, res) => {
  try {
    const modelId = req.query.modelId;
    let repairs = await RepairOption.find({});
    if (modelId) {
      const model = await DeviceModel.findById(modelId);
      repairs = repairs.map(r => {
        const obj = r.toObject();
        const override = model?.priceOverrides?.get ? model.priceOverrides.get(r.code) : (model?.priceOverrides && model.priceOverrides[r.code]);
        obj.priceEffective = override || r.basePrice || "CALL_FOR_PRICE";
        return obj;
      });
    }
    res.json(repairs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Admin auth ----------
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password;
  if (pass && pass === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Admin endpoints (create/update)
app.post('/admin/category', adminAuth, async (req, res) => {
  try {
    const doc = new Category(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});
app.post('/admin/model', adminAuth, async (req, res) => {
  try {
    const doc = new DeviceModel(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});
app.post('/admin/repair', adminAuth, async (req, res) => {
  try {
    const doc = new RepairOption(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
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
      if (!price) price = repair.basePrice || 'CALL_FOR_PRICE';
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

    // TODO: add email / notification integrations later
    res.json({ ok: true, id: rec._id, price, message: 'Request received' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Admin helper: return install snippet ----------
/**
 * GET /admin/install-snippet
 * returns a ready-to-copy <script> tag that loads /widget.js from your app
 * protected with adminAuth so only you (with ADMIN_PASSWORD header) can view it
 */
app.get('/admin/install-snippet', adminAuth, (req, res) => {
  // derive host: prefer explicit APP_URL, otherwise use request host
  const configuredUrl = process.env.APP_URL ? String(process.env.APP_URL) : '';
  const reqProto = req.protocol || 'https';
  const reqHost = req.get('host') || '';
  const hostCandidate = configuredUrl || (reqHost ? `${reqProto}://${reqHost}` : '');
  // remove trailing slash without regex
  const host = hostCandidate && hostCandidate.endsWith('/') ? hostCandidate.slice(0, -1) : hostCandidate;
  const snippet = `<div id="ram-service-widget"></div>\n\n<script>(function(){var s=document.createElement('script');s.src='${host}/widget.js';s.async=true;document.getElementById('ram-service-widget').appendChild(s);})();</script>`;
  res.type('text/plain');
  res.send(snippet);
});

// ---------- Start server ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on', PORT));
