const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const RequestSchema = new Schema({
  contact: Schema.Types.Mixed,
  category: String,
  modelId: {type:Schema.Types.ObjectId, ref:'DeviceModel'},
  repair_code: String,
  priceAtSubmit: String,
  createdAt: {type:Date, default: Date.now},
  metadata: Schema.Types.Mixed
});
module.exports = mongoose.model('ServiceRequest', RequestSchema);
