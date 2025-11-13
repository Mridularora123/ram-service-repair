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

// Basic health
app.get('/_health', (req, res) => res.json({ok:true}));

// Connect MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=>console.log('MongoDB connected'))
  .catch(err=>console.error('MongoDB error', err));

// Public API: lists for frontend widget
app.get('/api/categories', async (req, res) => {
  const cats = await Category.find({}).sort({order:1});
  res.json(cats);
});

app.get('/api/models', async (req, res) => {
  // optional ?category=Tablet
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  const models = await DeviceModel.find(filter).sort({brand:1,name:1});
  res.json(models);
});

app.get('/api/repairs', async (req, res) => {
  // optional ?modelId=...
  const modelId = req.query.modelId;
  let repairs = await RepairOption.find({});
  if (modelId) {
    // include repairs with overrides merged
    const model = await DeviceModel.findById(modelId);
    repairs = repairs.map(r => {
      const obj = r.toObject();
      if (model && model.priceOverrides && model.priceOverrides[r.code]) {
        obj.priceEffective = model.priceOverrides[r.code];
      }
      return obj;
    });
  }
  res.json(repairs);
});

// Admin-protected API (simple password)
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.admin_password;
  if (pass && pass === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({error:'Unauthorized'});
}

// Admin endpoints: create/update categories/models/repairs
app.post('/admin/category', adminAuth, async (req,res)=>{
  const doc = new Category(req.body);
  await doc.save();
  res.json(doc);
});
app.post('/admin/model', adminAuth, async (req,res)=>{
  const doc = new DeviceModel(req.body);
  await doc.save();
  res.json(doc);
});
app.post('/admin/repair', adminAuth, async (req,res)=>{
  const doc = new RepairOption(req.body);
  await doc.save();
  res.json(doc);
});

// Submit service request
app.post('/api/submit', async (req,res)=>{
  const payload = req.body;
  // basic validation
  if (!payload.contact || !payload.contact.email) return res.status(400).json({error:'Missing contact.email'});
  // compute price precedence: model override > repair option override > category-level > default price
  let price = null;
  const repair = await RepairOption.findOne({code: payload.repair_code});
  if (!repair) {
    price = 'CALL_FOR_PRICE';
  } else {
    // model override
    if (payload.modelId) {
      const model = await DeviceModel.findById(payload.modelId);
      if (model && model.priceOverrides && model.priceOverrides[repair.code]) price = model.priceOverrides[repair.code];
    }
    if (!price) {
      // repair-level default price
      price = repair.basePrice || 'CALL_FOR_PRICE';
    }
  }
  // store record
  const rec = new ServiceRequest({
    contact: payload.contact,
    category: payload.category,
    modelId: payload.modelId,
    repair_code: payload.repair_code,
    priceAtSubmit: price,
    metadata: payload.metadata || {}
  });
  await rec.save();

  // TODO: send emails using configured transporter (left for integration)
  res.json({ok:true, id: rec._id, price, message: 'Request received'});
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=>console.log('Server started on', PORT));
