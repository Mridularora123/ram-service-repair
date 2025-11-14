// models/RepairOption.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RepairOptionSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, index: true }, // unique code
  description: String,
  basePrice: Number,
  images: [String],
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('RepairOption', RepairOptionSchema);
