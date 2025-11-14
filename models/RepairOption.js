// models/RepairOption.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RepairSchema = new Schema({
  code: { type: String, required: true, unique: true }, // internal code
  name: { type: String, required: true },
  description: String,
  basePrice: { type: Number, default: null }, // in cents (Number) — null => call-for-price
  currency: { type: String, default: 'EUR' },
  etaDays: Number,
  warrantyText: String,
  images: { type: [String], default: [] },
  notes: String,
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  meta: Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model('RepairOption', RepairSchema);
