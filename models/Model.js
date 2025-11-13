// models/Model.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PriceOverrideSchema = new Schema({
  // either supply repairOptionId (ObjectId) OR repairOptionCode (string)
  repairOptionId: { type: Schema.Types.ObjectId, ref: 'RepairOption' },
  repairOptionCode: String,
  price: Number // in cents (e.g. 15000 => 150.00)
}, { _id: false });

const DeviceModelSchema = new Schema({
  name: { type: String, required: true },
  brand: String,
  series: { type: Schema.Types.ObjectId, ref: 'Series' },
  slug: { type: String, required: true, unique: true },
  sku: String,
  imageUrl: String,
  priceOverrides: { type: [PriceOverrideSchema], default: [] },
  metafields: Schema.Types.Mixed,
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('DeviceModel', DeviceModelSchema);
