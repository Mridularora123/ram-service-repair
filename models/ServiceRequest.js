// models/ServiceRequest.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ServiceRequestSchema = new Schema({
  requestId: { type: String, required: true, unique: true }, // SR-YYYYMMDD-0001
  category: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  series: { type: Schema.Types.ObjectId, ref: 'Series', default: null },
  model: { type: Schema.Types.ObjectId, ref: 'DeviceModel', default: null },
  repairOption: { type: Schema.Types.ObjectId, ref: 'RepairOption', default: null },
  repairCode: String,
  priceCents: { type: Number, default: null }, // cents or null
  currency: { type: String, default: 'EUR' },
  contact: Schema.Types.Mixed, // { full_name, email, phone, ... }
  consent: { type: Boolean, default: false },
  status: { type: String, default: 'new' },
  metadata: Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model('ServiceRequest', ServiceRequestSchema);
