// server.js
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

// serve embeddable widget file directly (static JS)
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'widget-example.js'));
});

// optional small embeddable snippet endpoint
// returns a small JS snippet you can paste into Shopify custom liquid.
// It references APP_URL from env (fallback to request host).
app.get('/embed', (req, res) => {
  // prefer APP_URL if set, otherwise build from request
  const envAppUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const host = envAppUrl || `${req.protocol}://${req.get('host')}`;
  // script to inject widget.js from your host (no regex literals inside the string)
  const script = `<script>(function(){var s=document.createElement('script');s.src='${host}/widget.js';s.async=true;var mount=document.getElementById('ram-service-widget'); if(!mount){mount=document.createElement('div');mount.id='ram-service-widget';document.body.appendChild(mount);} mount.appendChild(s); })();</script>`;
  res.type('text/html');
  res.send(script);
});

// simple health check
app.get('/_health', (req, res) => res.json({ ok: true }));

// Connect MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error', err));

// Public API: lists for frontend widget
app.get('/api/categories', async (req, res) => {
  const cats = await Category.find({}).sort({ order: 1 });
  res.json(cats);
});

app.get('/api/models', async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  const models = await DeviceModel.find(filter).sort({ brand: 1, name: 1 });
  res.json(models);
});

app.get('/api/repairs', async (req, res) => {
  const modelId = req.query.modelId;
  let repairs = await RepairOption.find({});
  if (modelId) {
    const model = await DeviceModel.findById(modelId);
    repairs = repairs.map(r => {
      const obj = r.toObject();
      const override = model?.priceOverrides?.[r.code] || model?.priceOverrides?.get?.(r.code);
      obj.priceEffective = override || r.basePrice || "CALL_FOR_PRICE";
      return obj;
    });
  }
  res.json(repairs);
});

// Admin simple password auth
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password;
  if (pass && pass === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Admin endpoints: create/update categories/models/repairs
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

// Submit service request
app.post('/api/submit', async (req, res) => {
  const payload = req.body;
  if (!payload.contact || !payload.contact.email) return res.status(400).json({ error: 'Missing contact.email' });

  let price = null;
  const repair = await RepairOption.findOne({ code: payload.repair_code });
  if (!repair) {
    price = 'CALL_FOR_PRICE';
  } else {
    if (payload.modelId) {
      const model = await DeviceModel.findById(payload.modelId);
      if (model && model.priceOverrides && (model.priceOverrides[repair.code] || model.priceOverrides.get?.(repair.code))) {
        price = model.priceOverrides[repair.code] || model.priceOverrides.get(repair.code);
      }
    }
    if (!price) {
      price = repair.basePrice || 'CALL_FOR_PRICE';
    }
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

  // TODO: add notifications/email here
  res.json({ ok: true, id: rec._id, price, message: 'Request received' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on', PORT));
