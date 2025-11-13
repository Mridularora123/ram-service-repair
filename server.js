// server.js — final robust version
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

const app = express();

// try to require optional middleware but don't crash if not installed
try { const helmet = require('helmet'); app.use(helmet()); } catch (e) { /* optional */ }
try { const morgan = require('morgan'); app.use(morgan('dev')); } catch (e) { /* optional */ }

app.use(cors({
  origin: true, // allow requests from anywhere (for development). Restrict in production.
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','x-admin-password']
}));
app.use(express.json());

// Models (assumes these files exist in ./models)
const Category = require('./models/Category');
const DeviceModel = require('./models/Model'); // file name Model.js exporting DeviceModel
const RepairOption = require('./models/RepairOption');
const ServiceRequest = require('./models/ServiceRequest');

// Serve embeddable widget JS file
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'widget-example.js'));
});

// small snippet (useful if you want to paste an embed snippet)
app.get('/embed', (req, res) => {
  const envAppUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const host = envAppUrl || `${req.protocol}://${req.get('host')}`;
  const script = `<script>(function(){var s=document.createElement('script');s.src='${host}/widget.js';s.async=true;var mount=document.getElementById('ram-service-widget'); if(!mount){mount=document.createElement('div');mount.id='ram-service-widget';document.body.appendChild(mount);} mount.appendChild(s); })();</script>`;
  res.type('text/html').send(script);
});

// health + root
app.get('/_health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.json({ ok: true, message: 'RAM service API running' }));

// connect to mongo
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error', err));

// PUBLIC API

// GET categories
app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ order: 1 });
    res.json(cats);
  } catch (err) {
    console.error('categories error', err);
    res.status(500).json({ error: 'Categories load failed' });
  }
});

// GET series (optionally filter by category slug or id ?category=slugOrId)
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

// GET models optionally by category or series
// /api/models?category=slugOrId  OR /api/series/:seriesId/models
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

// GET models for a series
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

// GET repairs (optionally modelId to get effective prices)
app.get('/api/repairs', async (req, res) => {
  try {
    const modelId = req.query.modelId;
    let repairs = await RepairOption.find({}).sort({ name: 1 });
    if (modelId) {
      const model = await DeviceModel.findById(modelId);
      repairs = repairs.map(r => {
        const obj = r.toObject();
        // priceOverrides structure: [ { repairOptionId, repairOptionCode, price } ]
        let override = undefined;
        if (model && Array.isArray(model.priceOverrides)) {
          const ov = model.priceOverrides.find(po =>
            (po.repairOptionId && po.repairOptionId.toString() === r._id.toString()) ||
            (po.repairOptionCode && po.repairOptionCode === r.code)
          );
          if (ov) override = ov.price;
        }
        obj.priceEffective = (typeof override !== 'undefined') ? override : (r.basePrice || 'CALL_FOR_PRICE');
        return obj;
      });
    }
    res.json(repairs);
  } catch (err) {
    console.error('repairs error', err);
    res.status(500).json({ error: 'Repairs load failed' });
  }
});

// Admin auth (very simple header-based)
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password;
  if (pass && pass === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Admin endpoints: create category/model/repair/series (minimal)
app.post('/admin/category', adminAuth, async (req, res) => {
  const doc = new Category(req.body);
  await doc.save();
  res.json(doc);
});
app.post('/admin/model', adminAuth, async (req, res) => {
  const doc = new DeviceModel(req.body);
  await doc.save();
  res.json(doc);
});
app.post('/admin/repair', adminAuth, async (req, res) => {
  const doc = new RepairOption(req.body);
  await doc.save();
  res.json(doc);
});
app.post('/admin/series', adminAuth, async (req, res) => {
  const Series = require('./models/Series');
  const doc = new Series(req.body);
  await doc.save();
  res.json(doc);
});

// Submit service request
app.post('/api/submit', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.contact || !payload.contact.email) return res.status(400).json({ error: 'Missing contact.email' });

    let price = null;
    const repair = await RepairOption.findOne({ code: payload.repair_code }) || await RepairOption.findById(payload.repair_code);
    if (!repair) {
      price = 'CALL_FOR_PRICE';
    } else {
      if (payload.modelId) {
        const model = await DeviceModel.findById(payload.modelId);
        if (model && Array.isArray(model.priceOverrides)) {
          const ov = model.priceOverrides.find(po =>
            (po.repairOptionId && po.repairOptionId.toString() === repair._id.toString()) ||
            (po.repairOptionCode && po.repairOptionCode === repair.code)
          );
          if (ov) price = ov.price;
        }
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
    res.json({ ok: true, id: rec._id, price, message: 'Request received' });
  } catch (err) {
    console.error('submit error', err);
    res.status(500).json({ error: 'Submit failed' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on', PORT));
