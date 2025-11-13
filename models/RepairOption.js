const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const RepairSchema = new Schema({
  code: {type:String, required:true, unique:true}, // internal code
  name: {type:String, required:true},
  basePrice: String, // number or string/call-for-price
  etaDays: Number,
  warrantyText: String,
  images: [String],
  notes: String,
  meta: Schema.Types.Mixed
});
module.exports = mongoose.model('RepairOption', RepairSchema);
