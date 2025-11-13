// server.js — full final
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');

const Category = require('./models/Category');
const DeviceModel = require('./models/Model');
const RepairOption = require('./models/RepairOption');
const ServiceRequest = require('./models/ServiceRequest');

const app = express();

// Security + parsing + logging
app.use(helmet());
app.use(morgan('tiny'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - for testing allow all origins, you can restrict to your shop domain later
app.use(cors({
  origin: (origin, cb) => cb(null, true)
}));

// Serve widget and static files (if any) from project root
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'widget-example.js'));
});
app.use('/static', express.static(path.join(__dirname, 'public')));

// health
app.get('/', (req, res) => res.json({ ok: true, message: 'RAM service API running' }));
app.get('/_health', (req, res) => res.json({ ok: true }));

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error', err));

// ---------- Public APIs used by the widget ----------

// GET categories
app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ order: 1 }).lean();
    res.json(cats);
  } catch (err) {
    console.error('categories error', err);
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

// GET series (optionally filter by ?category=slugOrId)
app.get('/api/series', async (req, res) => {
  try {
    const Series = require('./models/Series');
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
    console.error('series error', err);
    res.status(500).json({ error: 'Series load failed' });
  }
});

// GET models (optionally filter by ?category=slug)
app.get('/api/models', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    const models = await DeviceModel.find(filter).sort({ brand: 1, name: 1 }).lean();
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
    const models = await DeviceModel.find({ series: seriesId }).sort({ brand: 1, name: 1 }).lean();
    res.json(models);
  } catch (err) {
    console.error('series models error', err);
    res.status(500).json({ error: 'Models for series failed' });
  }
});

// GET repairs (optionally ?modelId=)
app.get('/api/repairs', async (req, res) => {
  try {
    const modelId = req.query.modelId;
    let repairs = await RepairOption.find({}).lean();
    if (modelId) {
      const model = await DeviceModel.findById(modelId).lean();
      repairs = repairs.map(r => {
        const obj = { ...r };
        // Look for price override in model.priceOverrides (array)
        let override = null;
        if (model && Array.isArray(model.priceOverrides)) {
          override = model.priceOverrides.find(po => {
            if (po.repairOptionId && String(po.repairOptionId) === String(r._id)) return true;
            if (po.repairOptionCode && po.repairOptionCode === r.code) return true;
            return false;
          });
        }
        if (override && typeof override.price !== 'undefined' && override.price !== null) {
          obj.priceEffective = override.price;
        } else {
          obj.priceEffective = (r.basePrice !== undefined && r.basePrice !== null) ? r.basePrice : 'CALL_FOR_PRICE';
        }
        return obj;
      });
    } else {
      repairs = repairs.map(r => ({ ...r, priceEffective: (r.basePrice !== undefined && r.basePrice !== null) ? r.basePrice : 'CALL_FOR_PRICE' }));
    }
    res.json(repairs);
  } catch (err) {
    console.error('repairs error', err);
    res.status(500).json({ error: 'Repairs load failed' });
  }
});

// ---------- Admin endpoints (simple password auth) ----------
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password;
  if (pass && process.env.ADMIN_PASSWORD && pass === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

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

// ---------- Submit service request ----------
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
        if (model && model.priceOverrides && Array.isArray(model.priceOverrides)) {
          const ov = model.priceOverrides.find(po => (po.repairOptionId && String(po.repairOptionId) === String(repair._id)) || (po.repairOptionCode && po.repairOptionCode === repair.code));
          if (ov && (ov.price !== undefined && ov.price !== null)) price = ov.price;
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

    // (optional) add hooks/notifications here

    res.json({ ok: true, id: rec._id, price, message: 'Request received' });
  } catch (err) {
    console.error('submit error', err);
    res.status(500).json({ error: 'Submission failed' });
  }
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on', PORT));
