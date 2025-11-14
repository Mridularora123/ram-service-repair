// models/Model.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PriceOverrideSchema = new Schema({
  repairOptionId: { type: Schema.Types.ObjectId, ref: 'RepairOption' },
  repairOptionCode: String,
  price: Number // price in cents (or integer)
}, { _id: false });

const ModelSchema = new Schema({
  name: { type: String, required: true },
  brand: String,
  slug: { type: String, required: true, index: true },
  series: { type: Schema.Types.ObjectId, ref: 'Series' }, // belongs to series
  category: { type: Schema.Types.ObjectId, ref: 'Category' }, // optional direct category reference
  imageUrl: String,
  priceOverrides: [PriceOverrideSchema],
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('DeviceModel', ModelSchema);
