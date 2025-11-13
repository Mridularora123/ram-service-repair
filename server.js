// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');

// Models (make sure these files exist in ./models)
const Category = require('./models/Category');
const DeviceModel = require('./models/Model');
const RepairOption = require('./models/RepairOption');
const ServiceRequest = require('./models/ServiceRequest');
const Series = require('./models/Series');

const app = express();

// security & logging (optional but recommended)
app.use(helmet());
app.use(morgan('combined'));

// basic middleware
app.use(cors()); // allow all origins (change to specific origin in production)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// serve admin static UI (optional)
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// serve embeddable widget file directly (static JS)
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'widget-example.js'));
});

// optional small embeddable snippet endpoint for theme copy/paste
app.get('/embed', (req, res) => {
  const envAppUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const host = envAppUrl || `${req.protocol}://${req.get('host')}`;
  // The snippet injects the widget script and ensures there's a mount point
  const script = `<script>(function(){var s=document.createElement('script');s.src='${host}/widget.js';s.async=true;var mount=document.getElementById('ram-service-widget'); if(!mount){mount=document.createElement('div');mount.id='ram-service-widget';document.body.appendChild(mount);} document.getElementById('ram-service-widget').appendChild(s);})();</script>`;
  res.type('text/html');
  res.send(script);
});

// root health
app.get('/', (req, res) => res.json({ ok: true, message: 'RAM service API running' }));
app.get('/_health', (req, res) => res.json({ ok: true }));

// Connect MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB error', err);
    // do not exit — allow the app to start (you can handle later)
  });

// Public API: categories
app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ order: 1 });
    res.json(cats);
  } catch (err) {
    console.error('categories error', err);
    res.status(500).json({ error: 'Categories load failed' });
  }
});

// series (optionally filter by category slug or id via ?category=...)
app.get('/api/series', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    const list = await Series.find(filter).sort({ order: 1 });
    res.json(list);
  } catch (err) {
    console.error('series error', err);
    res.status(500).json({ error: 'Series load failed' });
  }
});

// models list (optionally filter by category or series)
app.get('/api/models', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.series) filter.series = req.query.series;
    if (req.query.seriesId) filter.series = req.query.seriesId;
    const models = await DeviceModel.find(filter).sort({ brand: 1, name: 1 });
    res.json(models);
  } catch (err) {
    console.error('models error', err);
    res.status(500).json({ error: 'Models load failed' });
  }
});

// models by seriesId (returns models where series matches seriesId)
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

// repairs list (optionally compute price overrides when modelId provided)
app.get('/api/repairs', async (req, res) => {
  try {
    const modelId = req.query.modelId;
    let repairs = await RepairOption.find({});
    if (modelId) {
      const model = await DeviceModel.findById(modelId);
      repairs = repairs.map(r => {
        const obj = r.toObject();
        // model.priceOverrides is an array of { repairOptionCode, price }
        let override = null;
        if (model && Array.isArray(model.priceOverrides)) {
          const o = model.priceOverrides.find(p => p.repairOptionCode === r.code || String(p.repairOptionId) === String(r._id));
          if (o) override = o.price;
        }
        obj.priceEffective = (override != null) ? override : (r.basePrice || 'CALL_FOR_PRICE');
        return obj;
      });
    }
    res.json(repairs);
  } catch (err) {
    console.error('repairs error', err);
    res.status(500).json({ error: 'Repairs load failed' });
  }
});

// simple admin auth for quick admin UI (password via env ADMIN_PASSWORD)
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password;
  if (pass && process.env.ADMIN_PASSWORD && pass === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Admin endpoints for seeding data from the minimal admin page
app.post('/admin/category', adminAuth, async (req, res) => {
  try { const doc = new Category(req.body); await doc.save(); res.json(doc); } catch (err) { console.error(err); res.status(500).json({ error: 'Create category failed' }); }
});
app.post('/admin/model', adminAuth, async (req, res) => {
  try { const doc = new DeviceModel(req.body); await doc.save(); res.json(doc); } catch (err) { console.error(err); res.status(500).json({ error: 'Create model failed' }); }
});
app.post('/admin/repair', adminAuth, async (req, res) => {
  try { const doc = new RepairOption(req.body); await doc.save(); res.json(doc); } catch (err) { console.error(err); res.status(500).json({ error: 'Create repair failed' }); }
});
app.post('/admin/series', adminAuth, async (req, res) => {
  try { const doc = new Series(req.body); await doc.save(); res.json(doc); } catch (err) { console.error(err); res.status(500).json({ error: 'Create series failed' }); }
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
        if (model && Array.isArray(model.priceOverrides)) {
          const ovr = model.priceOverrides.find(p => p.repairOptionCode === repair.code || String(p.repairOptionId) === String(repair._id));
          if (ovr) price = ovr.price;
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

    // optional: send notification/email here
    res.json({ ok: true, id: rec._id, price, message: 'Request received' });
  } catch (err) {
    console.error('submit error', err);
    res.status(500).json({ error: 'Submit failed' });
  }
});

// static catch-all for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on', PORT));
