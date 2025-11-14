// server.js — full server (overwrite your existing server.js with this)
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const Category = require('./models/Category');
const Series = require('./models/Series');
const DeviceModel = require('./models/Model');
const RepairOption = require('./models/RepairOption');
const ServiceRequest = require('./models/ServiceRequest');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve widget file (you already have widget-example.js in project root)
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'widget-example.js'));
});

// Optional embed snippet endpoint (returns a small script you can paste in Shopify)
app.get('/embed', (req, res) => {
  const envAppUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const host = envAppUrl || `${req.protocol}://${req.get('host')}`;
  const script = `<script>(function(){var s=document.createElement('script');s.src='${host}/widget.js';s.async=true;var mount=document.getElementById('ram-service-widget'); if(!mount){mount=document.createElement('div');mount.id='ram-service-widget';document.body.appendChild(mount);} mount.appendChild(s); })();</script>`;
  res.type('text/html');
  res.send(script);
});

app.get('/_health', (req, res) => res.json({ ok: true }));

// Connect MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error', err));

// Simple admin auth (header x-admin-password or ?admin_password=)
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password;
  if (pass && process.env.ADMIN_PASSWORD && pass === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ----------------- PUBLIC API -----------------

// GET categories
app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ order: 1 }).lean();
    res.json(cats);
  } catch (err) {
    console.error('categories err', err);
    res.status(500).json({ error: 'Categories load failed' });
  }
});

// GET series (optional ?category=slugOrId)
app.get('/api/series', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) {
      const cat = req.query.category;
      if (/^[0-9a-fA-F]{24}$/.test(String(cat))) {
        filter.category = cat;
      } else {
        const found = await Category.findOne({ $or: [{ slug: cat }, { name: cat }] }).lean();
        if (!found) return res.json([]);
        filter.category = found._id;
      }
    }
    const list = await Series.find(filter).sort({ order: 1 }).lean();
    res.json(list);
  } catch (err) {
    console.error('series err', err);
    res.status(500).json({ error: 'Series load failed' });
  }
});

// GET models (optional ?series=SERIES_ID or ?category=slugOrId)
app.get('/api/models', async (req, res) => {
  try {
    const filter = {};
    if (req.query.series) filter.series = req.query.series;
    if (req.query.category) {
      const cat = req.query.category;
      if (/^[0-9a-fA-F]{24}$/.test(String(cat))) filter.category = cat;
      else {
        const found = await Category.findOne({ $or: [{ slug: cat }, { name: cat }] }).lean();
        if (found) filter.category = found._id;
      }
    }
    const models = await DeviceModel.find(filter).sort({ order: 1 }).populate('repairs').lean();
    res.json(models);
  } catch (err) {
    console.error('models err', err);
    res.status(500).json({ error: 'Models load failed' });
  }
});

// GET models for a series
app.get('/api/series/:seriesId/models', async (req, res) => {
  try {
    const models = await DeviceModel.find({ series: req.params.seriesId }).sort({ order: 1 }).populate('repairs').lean();
    res.json(models);
  } catch (err) {
    console.error('series models err', err);
    res.status(500).json({ error: 'Models for series failed' });
  }
});

// GET repairs (global). Optional ?modelId to filter to model-supported repairs and compute effective prices.
app.get('/api/repairs', async (req, res) => {
  try {
    const modelId = req.query.modelId;
    let repairs = await RepairOption.find({}).sort({ order: 1 }).lean();

    if (modelId) {
      const model = await DeviceModel.findById(modelId).lean();
      if (model) {
        // if model.repairs exists, limit to those
        if (Array.isArray(model.repairs) && model.repairs.length) {
          repairs = repairs.filter(r => model.repairs.some(rr => String(rr) === String(r._id)));
        }
        // compute priceEffective for each repair based on model overrides
        repairs = repairs.map(r => {
          const clone = { ...r };
          let effective = (r.basePrice !== undefined && r.basePrice !== null) ? r.basePrice : null;
          if (Array.isArray(model.priceOverrides)) {
            const ov = model.priceOverrides.find(po => (po.repairOptionId && String(po.repairOptionId) === String(r._id)) || (po.repairOptionCode && po.repairOptionCode === r.code));
            if (ov && typeof ov.price !== 'undefined' && ov.price !== null) effective = ov.price;
          }
          clone.priceEffective = effective;
          return clone;
        });
      } else {
        repairs = repairs.map(r => ({ ...r, priceEffective: (r.basePrice !== undefined && r.basePrice !== null) ? r.basePrice : null }));
      }
    } else {
      repairs = repairs.map(r => ({ ...r, priceEffective: (r.basePrice !== undefined && r.basePrice !== null) ? r.basePrice : null }));
    }

    res.json(repairs);
  } catch (err) {
    console.error('repairs err', err);
    res.status(500).json({ error: 'Repairs load failed' });
  }
});

// Submit service request
app.post('/api/submit', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.contact || !payload.contact.email) return res.status(400).json({ error: 'Missing contact.email' });

    let price = null;
    if (payload.repair_code) {
      const repair = await RepairOption.findOne({ $or: [{ code: payload.repair_code }, { _id: payload.repair_code }] }).lean();
      if (repair) {
        price = repair.basePrice;
        if (payload.modelId) {
          const model = await DeviceModel.findById(payload.modelId).lean();
          if (model && Array.isArray(model.priceOverrides)) {
            const ov = model.priceOverrides.find(po => (po.repairOptionId && String(po.repairOptionId) === String(repair._id)) || (po.repairOptionCode && po.repairOptionCode === repair.code));
            if (ov && typeof ov.price !== 'undefined' && ov.price !== null) price = ov.price;
          }
        }
      }
    }
    if (!price) price = 'CALL_FOR_PRICE';

    const rec = new ServiceRequest({
      contact: payload.contact,
      category: payload.category || null,
      seriesId: payload.seriesId || null,
      modelId: payload.modelId || null,
      repair_code: payload.repair_code || null,
      priceAtSubmit: price,
      metadata: payload.metadata || {}
    });
    await rec.save();

    res.json({ ok: true, id: rec._id, price });
  } catch (err) {
    console.error('submit err', err);
    res.status(500).json({ error: 'Submit failed' });
  }
});

// ----------------- ADMIN CRUD -----------------
// Create category / series / model / repair via simple admin endpoints (x-admin-password required)
app.post('/admin/category', adminAuth, async (req, res) => {
  const doc = new Category(req.body);
  await doc.save();
  res.json(doc);
});
app.put('/admin/category/:id', adminAuth, async (req, res) => {
  const doc = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(doc);
});
app.delete('/admin/category/:id', adminAuth, async (req, res) => {
  await Category.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

app.post('/admin/series', adminAuth, async (req, res) => {
  const doc = new Series(req.body);
  await doc.save();
  res.json(doc);
});
app.put('/admin/series/:id', adminAuth, async (req, res) => {
  const doc = await Series.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(doc);
});
app.delete('/admin/series/:id', adminAuth, async (req, res) => {
  await Series.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

app.post('/admin/model', adminAuth, async (req, res) => {
  const doc = new DeviceModel(req.body);
  await doc.save();
  res.json(doc);
});
app.put('/admin/model/:id', adminAuth, async (req, res) => {
  const doc = await DeviceModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(doc);
});
app.delete('/admin/model/:id', adminAuth, async (req, res) => {
  await DeviceModel.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

app.post('/admin/repair', adminAuth, async (req, res) => {
  const doc = new RepairOption(req.body);
  await doc.save();
  res.json(doc);
});
app.put('/admin/repair/:id', adminAuth, async (req, res) => {
  const doc = await RepairOption.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(doc);
});
app.delete('/admin/repair/:id', adminAuth, async (req, res) => {
  await RepairOption.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on', PORT));
