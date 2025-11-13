// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// optional middleware: helmet, morgan (don't crash if missing)
let helmet;
try { helmet = require('helmet'); } catch (e) { console.warn('helmet not installed — continuing without it'); }
let morgan;
try { morgan = require('morgan'); } catch (e) { console.warn('morgan not installed — continuing without request logging'); }

if (helmet) app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
if (morgan) app.use(morgan('tiny'));

// models (lazy require to avoid startup crashes if files missing)
const Category = require('./models/Category');
const DeviceModel = require('./models/Model');
const RepairOption = require('./models/RepairOption');
const ServiceRequest = require('./models/ServiceRequest');

// serve embeddable widget file at /widget.js
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'widget-example.js'));
});

// embed snippet endpoint useful for theme liquid
app.get('/embed', (req, res) => {
  const envAppUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const host = envAppUrl || `${req.protocol}://${req.get('host')}`;
  const script = `<script>(function(){var s=document.createElement('script');s.src='${host}/widget.js';s.async=true;var mount=document.getElementById('ram-service-widget'); if(!mount){mount=document.createElement('div');mount.id='ram-service-widget';document.body.appendChild(mount);} mount.appendChild(s); })();</script>`;
  res.type('text/html').send(script);
});

app.get('/_health', (req, res) => res.json({ ok: true }));

// Connect MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error', err));

// ----------------- Public API -----------------

// GET categories
app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ order: 1 });
    res.json(cats);
  } catch (err) {
    console.error('categories error', err);
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

// GET all series (optionally filter by category via ?category=slugOrId)
app.get('/api/series', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    const Series = require('./models/Series');
    const list = await Series.find(filter).sort({ order: 1 });
    res.json(list);
  } catch (err) {
    console.error('series error', err);
    res.status(500).json({ error: 'Series load failed' });
  }
});

// GET models (optionally by category via ?category= or by series via ?series=)
app.get('/api/models', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.series) filter.series = req.query.series;
    const models = await DeviceModel.find(filter).sort({ brand: 1, name: 1 });
    res.json(models);
  } catch (err) {
    console.error('models error', err);
    res.status(500).json({ error: 'Models load failed' });
  }
});

// GET models for a specific series id: /api/series/:seriesId/models
app.get('/api/series/:seriesId/models', async (req, res) => {
  try {
    const { seriesId } = req.params;
    const models = await DeviceModel.find({ series: seriesId }).sort({ brand: 1, name: 1 });
    res.json(models);
  } catch (err) {
    console.error('series models error', err);
    res.status(500).json({ error: 'Models for series failed' });
  }
});

// GET repairs (optionally pass ?modelId to calculate priceEffective from model overrides)
app.get('/api/repairs', async (req, res) => {
  try {
    const modelId = req.query.modelId;
    const repairs = await RepairOption.find({});
    if (!modelId) return res.json(repairs);
    const model = await DeviceModel.findById(modelId).lean();
    const mapped = repairs.map(r => {
      const obj = r.toObject ? r.toObject() : r;
      // priceOverrides is array of { repairOptionCode | repairOptionId, price }
      let overridePrice = null;
      if (model && Array.isArray(model.priceOverrides)) {
        const found = model.priceOverrides.find(po => (po.repairOptionCode && po.repairOptionCode === r.code) || (po.repairOptionId && String(po.repairOptionId) === String(r._id)));
        if (found) overridePrice = found.price;
      }
      obj.priceEffective = overridePrice != null ? overridePrice : (r.basePrice || 'CALL_FOR_PRICE');
      return obj;
    });
    res.json(mapped);
  } catch (err) {
    console.error('repairs error', err);
    res.status(500).json({ error: 'Repairs load failed' });
  }
});

// ----------------- Admin endpoints (simple password guard) -----------------
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password;
  if (pass && process.env.ADMIN_PASSWORD && pass === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.post('/admin/category', adminAuth, async (req, res) => {
  try {
    const doc = new Category(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin category create error', err);
    res.status(500).json({ error: 'Category create failed' });
  }
});
app.post('/admin/model', adminAuth, async (req, res) => {
  try {
    const doc = new DeviceModel(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin model create error', err);
    res.status(500).json({ error: 'Model create failed' });
  }
});
app.post('/admin/repair', adminAuth, async (req, res) => {
  try {
    const doc = new RepairOption(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin repair create error', err);
    res.status(500).json({ error: 'Repair create failed' });
  }
});
app.post('/admin/series', adminAuth, async (req, res) => {
  try {
    const Series = require('./models/Series');
    const doc = new Series(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin series create error', err);
    res.status(500).json({ error: 'Series create failed' });
  }
});

// ----------------- Submit service request -----------------
app.post('/api/submit', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.contact || !payload.contact.email) return res.status(400).json({ error: 'Missing contact.email' });

    let finalPrice = null;
    const repair = await RepairOption.findOne({ code: payload.repair_code });
    if (!repair) finalPrice = 'CALL_FOR_PRICE';
    else {
      if (payload.modelId) {
        const model = await DeviceModel.findById(payload.modelId).lean();
        if (model && Array.isArray(model.priceOverrides)) {
          const found = model.priceOverrides.find(po => (po.repairOptionCode && po.repairOptionCode === repair.code) || (po.repairOptionId && String(po.repairOptionId) === String(repair._id)));
          if (found) finalPrice = found.price;
        }
      }
      if (finalPrice == null) finalPrice = repair.basePrice || 'CALL_FOR_PRICE';
    }

    const rec = new ServiceRequest({
      contact: payload.contact,
      category: payload.category,
      modelId: payload.modelId,
      repair_code: payload.repair_code,
      priceAtSubmit: finalPrice,
      metadata: payload.metadata || {}
    });
    await rec.save();

    // return saved id and price
    res.json({ ok: true, id: rec._id, price: finalPrice, message: 'Request received' });
  } catch (err) {
    console.error('submit error', err);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// catch-all
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on', PORT));
