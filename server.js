// server.js - Updated, copy/paste replace your current file
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
// Series model is required dynamically in some routes to avoid circular issues
// const Series = require('./models/Series');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// serve embeddable widget file directly (static JS)
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'widget-example.js'));
});

// optional small embeddable snippet endpoint
app.get('/embed', (req, res) => {
  const envAppUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const host = envAppUrl || `${req.protocol}://${req.get('host')}`;
  const script = `<script>(function(){var s=document.createElement('script');s.src='${host}/widget.js';s.async=true;var mount=document.getElementById('ram-service-widget'); if(!mount){mount=document.createElement('div');mount.id='ram-service-widget';document.body.appendChild(mount);} mount.appendChild(s); })();</script>`;
  res.type('text/html');
  res.send(script);
});

// simple health check
app.get('/_health', (req, res) => res.json({ ok: true }));

// Connect MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error', err);
    process.exit(1);
  });

/* ------------------------
   Public API endpoints
   ------------------------ */

// GET categories
app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ order: 1 }).lean();
    res.json(cats);
  } catch (err) {
    console.error('categories error', err);
    res.status(500).json({ error: 'Categories load failed' });
  }
});

// GET series (allow ?category=<slugOrId> to filter)
app.get('/api/series', async (req, res) => {
  try {
    const Series = require('./models/Series');
    const filter = {};
    if (req.query.category) {
      const cat = String(req.query.category);
      if (/^[0-9a-fA-F]{24}$/.test(cat)) {
        filter.category = cat;
      } else {
        // try find category by slug or name
        const found = await Category.findOne({ $or: [{ slug: cat }, { name: cat }] }).lean();
        if (!found) {
          // no category found => return empty list (widget handles empty)
          return res.json([]);
        }
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

// GET models for a series (by series id)
app.get('/api/series/:seriesId/models', async (req, res) => {
  try {
    const { seriesId } = req.params;
    if (!seriesId || !/^[0-9a-fA-F]{24}$/.test(String(seriesId))) {
      return res.status(400).json({ error: 'Invalid seriesId' });
    }
    const models = await DeviceModel.find({ series: seriesId }).sort({ brand: 1, name: 1 }).lean();
    res.json(models);
  } catch (err) {
    console.error('series models error', err);
    res.status(500).json({ error: 'Models for series failed' });
  }
});

// GET models (legacy route) - optional filter by category or series query params
app.get('/api/models', async (req, res) => {
  try {
    const q = {};
    // accept ?series=<seriesIdOrSlug>
    if (req.query.series) {
      const seriesVal = String(req.query.series);
      if (/^[0-9a-fA-F]{24}$/.test(seriesVal)) {
        q.series = seriesVal;
      } else {
        const Series = require('./models/Series');
        const found = await Series.findOne({ slug: seriesVal }).lean();
        if (found) q.series = found._id;
        else {
          // If no series found by slug, leave q empty (return all) or return empty - choose all to be forgiving
        }
      }
    }
    // accept ?category=<slugOrId> by mapping to series' category
    if (req.query.category) {
      const catVal = String(req.query.category);
      const Series = require('./models/Series');
      let catId = null;
      if (/^[0-9a-fA-F]{24}$/.test(catVal)) catId = catVal;
      else {
        const foundCat = await Category.findOne({ $or: [{ slug: catVal }, { name: catVal }] }).lean();
        if (foundCat) catId = foundCat._id;
      }
      if (catId) {
        const seriesList = await Series.find({ category: catId }).select('_id').lean();
        const seriesIds = seriesList.map(s => s._id);
        q.series = { $in: seriesIds };
      }
    }

    const models = await DeviceModel.find(q).sort({ brand: 1, name: 1 }).lean();
    res.json(models);
  } catch (err) {
    console.error('models error', err);
    res.status(500).json({ error: 'Models load failed' });
  }
});

// GET repairs - if modelId passed, compute priceEffective using model.priceOverrides (array)
app.get('/api/repairs', async (req, res) => {
  try {
    const modelId = req.query.modelId;
    let repairs = await RepairOption.find({}).lean();

    if (modelId) {
      const model = await DeviceModel.findById(modelId).lean();
      if (model) {
        repairs = repairs.map(r => {
          const obj = { ...r };
          let overrideEntry = null;
          if (Array.isArray(model.priceOverrides) && model.priceOverrides.length) {
            overrideEntry = model.priceOverrides.find(po => {
              if (po.repairOptionId && String(po.repairOptionId) === String(r._id)) return true;
              if (po.repairOptionCode && po.repairOptionCode === r.code) return true;
              return false;
            });
          }
          if (overrideEntry && typeof overrideEntry.price !== 'undefined' && overrideEntry.price !== null) {
            obj.priceEffective = overrideEntry.price;
          } else {
            obj.priceEffective = (r.basePrice !== undefined && r.basePrice !== null) ? r.basePrice : 'CALL_FOR_PRICE';
          }
          return obj;
        });
      } else {
        // modelId provided but not found -> return repairs with basePrice
        repairs = repairs.map(r => ({ ...r, priceEffective: (r.basePrice !== undefined && r.basePrice !== null) ? r.basePrice : 'CALL_FOR_PRICE' }));
      }
    } else {
      repairs = repairs.map(r => ({ ...r, priceEffective: (r.basePrice !== undefined && r.basePrice !== null) ? r.basePrice : 'CALL_FOR_PRICE' }));
    }

    res.json(repairs);
  } catch (err) {
    console.error('repairs error', err);
    res.status(500).json({ error: 'Repairs load failed' });
  }
});

/* ------------------------
   Admin endpoints (simple password auth)
   ------------------------ */

function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password;
  if (pass && pass === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// POST create category
app.post('/admin/category', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.slug) return res.status(400).json({ error: 'name and slug required' });
    const doc = new Category({
      name: body.name,
      slug: body.slug,
      iconUrl: body.iconUrl || '',
      order: body.order || 0,
      meta: body.meta || {}
    });
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin category create error', err);
    res.status(500).json({ error: 'Category create failed' });
  }
});

// POST create series
app.post('/admin/series', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.slug || !body.category) return res.status(400).json({ error: 'name, slug and category required' });

    // Accept category as slug or id
    let categoryId = body.category;
    if (!/^[0-9a-fA-F]{24}$/.test(String(categoryId))) {
      const found = await Category.findOne({ $or: [{ slug: categoryId }, { name: categoryId }] }).lean();
      if (!found) return res.status(400).json({ error: 'category not found (provide slug or id)' });
      categoryId = found._id;
    }

    const Series = require('./models/Series');
    const doc = new Series({
      name: body.name,
      slug: body.slug,
      category: categoryId,
      iconUrl: body.iconUrl || '',
      order: body.order || 0
    });
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin series create error', err);
    res.status(500).json({ error: 'Series create failed' });
  }
});

// POST create model (accept series slug or id)
app.post('/admin/model', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.slug) return res.status(400).json({ error: 'name and slug are required' });

    let seriesId = body.series || null;
    if (seriesId) {
      if (!/^[0-9a-fA-F]{24}$/.test(String(seriesId))) {
        const Series = require('./models/Series');
        const found = await Series.findOne({ slug: seriesId }).lean();
        if (!found) return res.status(400).json({ error: 'series not found (provide slug or id)' });
        seriesId = found._id;
      }
    }

    const doc = new DeviceModel({
      name: body.name,
      brand: body.brand || '',
      series: seriesId,
      slug: body.slug,
      sku: body.sku || '',
      imageUrl: body.imageUrl || '',
      priceOverrides: Array.isArray(body.priceOverrides) ? body.priceOverrides : [],
      metafields: body.metafields || {}
    });

    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin model create error', err);
    res.status(500).json({ error: 'Model create failed' });
  }
});

// POST create repair option
app.post('/admin/repair', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.code || !body.name) return res.status(400).json({ error: 'code and name are required' });

    const doc = new RepairOption({
      code: body.code,
      name: body.name,
      basePrice: (typeof body.basePrice !== 'undefined' ? body.basePrice : null),
      etaDays: body.etaDays || null,
      warrantyText: body.warrantyText || '',
      images: Array.isArray(body.images) ? body.images : [],
      notes: body.notes || '',
      meta: body.meta || {}
    });

    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('admin repair create error', err);
    res.status(500).json({ error: 'Repair create failed' });
  }
});

/* ------------------------
   Submit service request
   ------------------------ */
app.post('/api/submit', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.contact || !payload.contact.email) return res.status(400).json({ error: 'Missing contact.email' });

    let price = null;
    const repair = await RepairOption.findOne({ code: payload.repair_code }).lean();
    if (!repair) {
      price = 'CALL_FOR_PRICE';
    } else {
      if (payload.modelId) {
        const model = await DeviceModel.findById(payload.modelId).lean();
        if (model && Array.isArray(model.priceOverrides) && model.priceOverrides.length) {
          const overrideEntry = model.priceOverrides.find(po => {
            if (po.repairOptionId && String(po.repairOptionId) === String(repair._id)) return true;
            if (po.repairOptionCode && po.repairOptionCode === repair.code) return true;
            return false;
          });
          if (overrideEntry && typeof overrideEntry.price !== 'undefined' && overrideEntry.price !== null) {
            price = overrideEntry.price;
          }
        }
      }
      if (!price) {
        price = (repair.basePrice !== undefined && repair.basePrice !== null) ? repair.basePrice : 'CALL_FOR_PRICE';
      }
    }

    const rec = new ServiceRequest({
      contact: payload.contact,
      category: payload.category || null,
      modelId: payload.modelId || null,
      repair_code: payload.repair_code || null,
      priceAtSubmit: price,
      metadata: payload.metadata || {}
    });
    await rec.save();

    // Optionally send notification / email here

    res.json({ ok: true, id: rec._id, price, message: 'Request received' });
  } catch (err) {
    console.error('submit error', err);
    res.status(500).json({ error: 'Submit failed' });
  }
});

/* ------------------------
   Start server
   ------------------------ */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on', PORT));
