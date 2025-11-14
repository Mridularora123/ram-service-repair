const mongoose = require('mongoose');

const ModelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, index: true },
  brand: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }, // ObjectId
  series: { type: mongoose.Schema.Types.ObjectId, ref: 'Series' },     // ObjectId
  imageUrl: { type: String },
  priceOverrides: { type: Array }, // keep flexible for overrides
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DeviceModel', ModelSchema);
