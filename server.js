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
app.use(cors()); // allow widget to fetch
app.use(bodyParser.json());

// Serve widget static JS
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'widget-example.js'));
});

// embed snippet (returns a small script you can paste)
app.get('/embed', (req, res) => {
  const host = (process.env.APP_URL || '').replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
  const script = `<script>(function(){var s=document.createElement('script');s.src='${host}/widget.js';s.async=true;document.body.appendChild(s);})();</script>`;
  res.type('text/html').send(script);
});

// health
app.get('/_health', (req, res) => res.json({ ok: true }));

// Connect MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error', err));

// ---------- Public API ----------

// categories
app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ order: 1 }).lean();
    res.json(cats);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Categories load failed' }); }
});

// series (optionally filter by ?category=slugOrId)
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
  } catch (e) { console.error(e); res.status(500).json({ error: 'Series load failed' }); }
});

// models for a series
app.get('/api/series/:seriesId/models', async (req, res) => {
  try {
    const { seriesId } = req.params;
    const models = await DeviceModel.find({ series: seriesId }).sort({ order: 1, brand: 1, name: 1 }).lean();
    res.json(models);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Models for series failed' }); }
});

// get models optionally by category slug or id
app.get('/api/models', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) {
      const cat = req.query.category;
      if (/^[0-9a-fA-F]{24}$/.test(String(cat))) filter.category = cat;
      else {
        const found = await Category.findOne({ $or: [{ slug: cat }, { name: cat }] }).lean();
        if (!found) return res.json([]);
        filter.category = found._id;
      }
    }
    const models = await DeviceModel.find(filter).sort({ order: 1 }).lean();
    res.json(models);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Models load failed' }); }
});

// repairs for model (apply model priceOverrides)
app.get('/api/repairs', async (req, res) => {
  try {
    const modelId = req.query.modelId;
    let repairs = await RepairOption.find({}).lean();
    if (modelId) {
      const model = await DeviceModel.findById(modelId).lean();
      if (model) {
        repairs = repairs.map(r => {
          const obj = { ...r };
          let override = null;
          if (Array.isArray(model.priceOverrides)) {
            override = model.priceOverrides.find(po => {
              if (po.repairOptionId && String(po.repairOptionId) === String(r._id)) return true;
              if (po.repairOptionCode && po.repairOptionCode === r.code) return true;
              return false;
            });
          } else if (model.priceOverrides && typeof model.priceOverrides === 'object') {
            override = { price: model.priceOverrides[r.code] };
          }
          obj.priceEffective = override && override.price !== undefined && override.price !== null
            ? override.price : (r.basePrice !== undefined && r.basePrice !== null ? r.basePrice : 'CALL_FOR_PRICE');
          return obj;
        });
      } else {
        repairs = repairs.map(r => ({ ...r, priceEffective: (r.basePrice !== undefined ? r.basePrice : 'CALL_FOR_PRICE') }));
      }
    } else {
      repairs = repairs.map(r => ({ ...r, priceEffective: (r.basePrice !== undefined ? r.basePrice : 'CALL_FOR_PRICE') }));
    }
    res.json(repairs);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Repairs load failed' }); }
});

// submit
app.post('/api/submit', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.contact || !payload.contact.email) return res.status(400).json({ error: 'Missing contact.email' });
    // calculate price
    let price = null;
    const repair = await RepairOption.findOne({ code: payload.repair_code });
    if (!repair) price = 'CALL_FOR_PRICE';
    else {
      if (payload.modelId) {
        const model = await DeviceModel.findById(payload.modelId);
        if (model && model.priceOverrides) {
          if (Array.isArray(model.priceOverrides)) {
            const po = model.priceOverrides.find(x => x.repairOptionCode === repair.code || String(x.repairOptionId) === String(repair._id));
            if (po) price = po.price;
          } else if (typeof model.priceOverrides === 'object') {
            price = model.priceOverrides[repair.code] || null;
          }
        }
      }
      if (!price) price = repair.basePrice || 'CALL_FOR_PRICE';
    }
    const rec = new ServiceRequest({
      contact: payload.contact,
      category: payload.category,
      seriesId: payload.seriesId,
      modelId: payload.modelId,
      repair_code: payload.repair_code,
      priceAtSubmit: price,
      metadata: payload.metadata || {}
    });
    await rec.save();
    res.json({ ok: true, id: rec._id, price, message: 'Request received' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Submit failed' }); }
});

// ----------------- Admin simple endpoints -----------------
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password;
  if (pass && process.env.ADMIN_PASSWORD && pass === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.post('/admin/category', adminAuth, async (req, res) => {
  const doc = new Category(req.body); await doc.save(); res.json(doc);
});
app.post('/admin/series', adminAuth, async (req, res) => {
  const doc = new Series(req.body); await doc.save(); res.json(doc);
});
app.post('/admin/model', adminAuth, async (req, res) => {
  const doc = new DeviceModel(req.body); await doc.save(); res.json(doc);
});
app.post('/admin/repair', adminAuth, async (req, res) => {
  const doc = new RepairOption(req.body); await doc.save(); res.json(doc);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on', PORT));
