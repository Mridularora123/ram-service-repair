// server.js — final
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');

const app = express();

// basic middleware
app.use(helmet());
app.use(morgan('tiny'));
app.use(express.json()); // built-in body parser
app.use(cors()); // you can restrict origins below for production

// Models (ensure these files exist in ./models)
const Category = require('./models/Category');
const DeviceModel = require('./models/Model'); // your DeviceModel file
const RepairOption = require('./models/RepairOption');
const ServiceRequest = require('./models/ServiceRequest');
const Series = require('./models/Series');

// Serve the embeddable widget JS file at /widget.js
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'widget-example.js'));
});

// Serve a tiny admin HTML (optional) to call admin endpoints from browser
app.get('/admin', (req, res) => {
  res.type('text/html');
  res.sendFile(path.join(__dirname, 'admin', 'index.html')); // you included admin/index.html
});

// simple health check
app.get('/_health', (req, res) => res.json({ ok: true }));

// Connect MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB error', err);
    process.exit(1);
  });

/*
  Public API
*/

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

// GET series (optionally filter by category slug or id via ?category=slugOrId)
app.get('/api/series', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) {
      filter.category = req.query.category; // could be slug or ObjectId depending on how you seed
    }
    const list = await Series.find(filter).sort({ order: 1 });
    res.json(list);
  } catch (err) {
    console.error('series error', err);
    res.status(500).json({ error: 'Series load failed' });
  }
});

// GET models for a series (returns models where series matches seriesId)
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

// GET models (general list) with optional filter by category or series
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

// GET repairs - if modelId provided, include priceEffective using model priceOverrides
app.get('/api/repairs', async (req, res) => {
  try {
    const modelId = req.query.modelId;
    const repairs = await RepairOption.find({}).sort({ name: 1 });
    if (!modelId) {
      // return base repairs
      return res.json(repairs.map(r => ({ ...r.toObject(), priceEffective: r.basePrice })));
    }
    const model = await DeviceModel.findById(modelId);
    const out = repairs.map(r => {
      const rObj = r.toObject();
      // model.priceOverrides is an array of { repairOptionId | repairOptionCode, price }
      let override = undefined;
      if (model && Array.isArray(model.priceOverrides)) {
        // match by repairOptionCode first (r.code), or by repairOptionId
        const found = model.priceOverrides.find(po => (po.repairOptionCode && po.repairOptionCode === r.code) || (po.repairOptionId && String(po.repairOptionId) === String(r._id)));
        if (found) override = found.price;
      }
      rObj.priceEffective = (override !== undefined && override !== null) ? override : (r.basePrice || 'CALL_FOR_PRICE');
      return rObj;
    });
    res.json(out);
  } catch (err) {
    console.error('repairs error', err);
    res.status(500).json({ error: 'Repairs load failed' });
  }
});

/*
  Admin endpoints (protected by simple admin password)
*/
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password || req.body.admin_password;
  if (pass && pass === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.post('/admin/category', adminAuth, async (req, res) => {
  try {
    const doc = new Category(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin category save error', err);
    res.status(500).json({ error: 'Category save failed', details: err.message });
  }
});

app.post('/admin/series', adminAuth, async (req, res) => {
  try {
    const doc = new Series(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin series save error', err);
    res.status(500).json({ error: 'Series save failed', details: err.message });
  }
});

app.post('/admin/model', adminAuth, async (req, res) => {
  try {
    const doc = new DeviceModel(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin model save error', err);
    res.status(500).json({ error: 'Model save failed', details: err.message });
  }
});

app.post('/admin/repair', adminAuth, async (req, res) => {
  try {
    const doc = new RepairOption(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin repair save error', err);
    res.status(500).json({ error: 'Repair save failed', details: err.message });
  }
});

// Optional: seed sample data (dangerous in production) — protected by ADMIN_PASSWORD
app.post('/admin/seed-sample', adminAuth, async (req, res) => {
  try {
    // sample entries (idempotent-ish by slug/code)
    const cat = await Category.findOneAndUpdate({ slug: 'smartphones' }, { name: 'Smartphones', slug: 'smartphones' }, { upsert: true, new: true });
    const ser = await Series.findOneAndUpdate({ slug: 'galaxy-tab' }, { name: 'Galaxy Tab', slug: 'galaxy-tab', category: cat._id }, { upsert: true, new: true });
    const model = await DeviceModel.findOneAndUpdate({ slug: 'galaxy-tab-s10' }, { name: 'Galaxy Tab S10+', slug: 'galaxy-tab-s10', series: ser._id }, { upsert: true, new: true });
    const repair = await RepairOption.findOneAndUpdate({ code: 'rear-cover' }, { code: 'rear-cover', name: 'Rear cover', basePrice: 150 }, { upsert: true, new: true });

    res.json({ ok: true, cat, ser, model, repair });
  } catch (err) {
    console.error('seed error', err);
    res.status(500).json({ error: 'Seed failed', details: err.message });
  }
});

/*
  Service request submission
*/
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
        if (model && Array.isArray(model.priceOverrides)) {
          const found = model.priceOverrides.find(po => (po.repairOptionCode && po.repairOptionCode === repair.code) || (po.repairOptionId && String(po.repairOptionId) === String(repair._id)));
          if (found) price = found.price;
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

    // TODO: add notifications/email here (use nodemailer/sendgrid)
    res.json({ ok: true, id: rec._id, price, message: 'Request received' });
  } catch (err) {
    console.error('submit error', err);
    res.status(500).json({ error: 'Submit failed', details: err.message });
  }
});

// fallback 404 JSON
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on', PORT));
