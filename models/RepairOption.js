const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const RepairSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  description: String,
  basePrice: Number, // cents or chosen unit
  images: [String],
  iconUrl: String,
  order: { type: Number, default: 0 }
}, { timestamps: true });
module.exports = mongoose.model('RepairOption', RepairSchema);
