const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ModelSchema = new Schema({
  brand: String,
  name: {type:String, required:true},
  slug: String,
  category: String, // slug of category
  sku: String,
  imageUrl: String,
  // priceOverrides: map of repair_code -> price (numbers or strings like "150€" or "CALL_FOR_PRICE")
  priceOverrides: { type: Map, of: String },
  meta: Schema.Types.Mixed
});
module.exports = mongoose.model('DeviceModel', ModelSchema);
