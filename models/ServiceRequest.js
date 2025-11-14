const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ServiceRequestSchema = new Schema({
  contact: Schema.Types.Mixed,
  category: String,
  seriesId: String,
  modelId: String,
  repair_code: String,
  priceAtSubmit: Schema.Types.Mixed,
  metadata: Schema.Types.Mixed
}, { timestamps: true });
module.exports = mongoose.model('ServiceRequest', ServiceRequestSchema);
