// server.js
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

// Serve widget file
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'widget-example.js'));
});

app.get('/embed', (req, res) => {
  const envAppUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const host = envAppUrl || `${req.protocol}://${req.get('host')}`;
  const script = `<script>(function(){var s=document.createElement('script');s.src='${host}/widget.js';s.async=true;var mount=document.getElementById('ram-service-widget'); if(!mount){mount=document.createElement('div');mount.id='ram-service-widget';document.body.appendChild(mount);} mount.appendChild(s); })();</script>`;
  res.type('text/html'); res.send(script);
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

/**
 * GET /api/series
 * Optional query param: ?category=slugOrIdOrName
 *
 * Robust rules:
 * - If no category param -> return all series (populated)
 * - If category param looks like ObjectId -> match common fields referencing that id
 * - Else try to find Category by slug/name -> then match series referencing that _id
 * - Else perform flexible server-side $or to match many shapes (category string, populated object fields, legacy keys)
 */
app.get('/api/series', async (req, res) => {
  try {
    const qcat = req.query.category;
    // default: return all
    if (!qcat) {
      const all = await Series.find({}).sort({ order: 1 }).populate('category').lean();
      return res.json(all);
    }

    // build filter
    const isObjectIdLike = (/^[0-9a-fA-F]{24}$/).test(String(qcat));
    const filter = {};

    if (isObjectIdLike) {
      // If qcat looks like an ObjectId string, try multiple common stored fields
      filter.$or = [
        { category: qcat },      // stored as ObjectId
        { categoryId: qcat },    // legacy string field
        { category_id: qcat },   // alternative naming
        { _id: qcat },           // maybe they passed a series id by mistake
      ];
    } else {
      // If not objectId-like, try resolving to a category document by slug/name
      const found = await Category.findOne({ $or: [{ slug: qcat }, { name: qcat }] }).lean();
      if (found) {
        // match by referenced _id or legacy fields that may store string id
        filter.$or = [
          { category: found._id },
          { categoryId: String(found._id) },
          { category_id: String(found._id) },
          { 'category._id': found._id },
          { 'category.slug': found.slug },
          { 'category.name': found.name }
        ];
      } else {
        // Flexible matching: try to match series that store category as slug/name string,
        // or series whose populated category has slug/name, or legacy fields.
        const q = qcat;
        filter.$or = [
          { category: q },            // category stored as slug or name string
          { categoryId: q },
          { category_id: q },
          { 'category.slug': q },
          { 'category.name': q },
          { slug: q },                // series slug equals q
          { name: q }                 // series name equals q
        ];
      }
    }

    const list = await Series.find(filter).sort({ order: 1 }).populate('category').lean();
    return res.json(list);
  } catch (err) {
    console.error('series err', err);
    res.status(500).json({ error: 'Series load failed' });
  }
});

// GET models (optional ?series=SERIES_ID)
app.get('/api/models', async (req, res) => {
  try {
    const filter = {};
    if (req.query.series) filter.series = req.query.series;
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
        if (Array.isArray(model.repairs) && model.repairs.length) {
          const allowedIds = model.repairs.map(r => String(r));
          repairs = repairs.filter(r => allowedIds.includes(String(r._id)));
        }
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

// ----------------- ADMIN CRUD ----------------- (unchanged)
app.post('/admin/category', adminAuth, async (req, res) => {
  try {
    if (req.body.slug) {
      const exists = await Category.findOne({ slug: req.body.slug });
      if (exists) return res.status(400).json({ error: 'Category slug already exists' });
    }
    const doc = new Category(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin category create err', err);
    res.status(500).json({ error: 'Category create failed' });
  }
});

app.put('/admin/category/:id', adminAuth, async (req, res) => {
  try {
    const doc = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(doc);
  } catch (err) {
    console.error('admin category update err', err);
    res.status(500).json({ error: 'Category update failed' });
  }
});

app.delete('/admin/category/:id', adminAuth, async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('admin category delete err', err);
    res.status(500).json({ error: 'Category delete failed' });
  }
});

app.post('/admin/series', adminAuth, async (req, res) => {
  try {
    if (!req.body.category) return res.status(400).json({ error: 'Series must have a category' });
    const cat = await Category.findById(req.body.category);
    if (!cat) return res.status(400).json({ error: 'Invalid category id' });
    if (req.body.slug) {
      const dup = await Series.findOne({ slug: req.body.slug, category: req.body.category });
      if (dup) return res.status(400).json({ error: 'Series slug already exists for this category' });
    }
    const doc = new Series(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin series create err', err);
    res.status(500).json({ error: 'Series create failed' });
  }
});

app.put('/admin/series/:id', adminAuth, async (req, res) => {
  try {
    if (req.body.category) {
      const cat = await Category.findById(req.body.category);
      if (!cat) return res.status(400).json({ error: 'Invalid category id' });
    }
    const doc = await Series.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(doc);
  } catch (err) {
    console.error('admin series update err', err);
    res.status(500).json({ error: 'Series update failed' });
  }
});

app.delete('/admin/series/:id', adminAuth, async (req, res) => {
  try {
    await Series.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('admin series delete err', err);
    res.status(500).json({ error: 'Series delete failed' });
  }
});

// models/repairs admin endpoints (unchanged)
app.post('/admin/model', adminAuth, async (req, res) => {
  try {
    if (!req.body.series) return res.status(400).json({ error: 'Model must belong to a series' });
    const s = await Series.findById(req.body.series);
    if (!s) return res.status(400).json({ error: 'Invalid series id' });
    if (req.body.slug) {
      const dup = await DeviceModel.findOne({ slug: req.body.slug, series: req.body.series });
      if (dup) return res.status(400).json({ error: 'Model slug already exists in this series' });
    }
    const doc = new DeviceModel(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin model create err', err);
    res.status(500).json({ error: 'Model create failed' });
  }
});

app.put('/admin/model/:id', adminAuth, async (req, res) => {
  try {
    if (req.body.series) {
      const s = await Series.findById(req.body.series);
      if (!s) return res.status(400).json({ error: 'Invalid series id' });
    }
    const doc = await DeviceModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(doc);
  } catch (err) {
    console.error('admin model update err', err);
    res.status(500).json({ error: 'Model update failed' });
  }
});

app.delete('/admin/model/:id', adminAuth, async (req, res) => {
  try {
    await DeviceModel.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('admin model delete err', err);
    res.status(500).json({ error: 'Model delete failed' });
  }
});

app.post('/admin/repair', adminAuth, async (req, res) => {
  try {
    if (req.body.code) {
      const dup = await RepairOption.findOne({ code: req.body.code });
      if (dup) return res.status(400).json({ error: 'Repair code already exists' });
    }
    const doc = new RepairOption(req.body);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin repair create err', err);
    res.status(500).json({ error: 'Repair create failed' });
  }
});

app.put('/admin/repair/:id', adminAuth, async (req, res) => {
  try {
    const doc = await RepairOption.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(doc);
  } catch (err) {
    console.error('admin repair update err', err);
    res.status(500).json({ error: 'Repair update failed' });
  }
});

app.delete('/admin/repair/:id', adminAuth, async (req, res) => {
  try {
    await RepairOption.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('admin repair delete err', err);
    res.status(500).json({ error: 'Repair delete failed' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on', PORT));
