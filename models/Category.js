const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const CategorySchema = new Schema({
  name: {type:String, required:true},
  slug: {type:String, required:true, unique:true},
  iconUrl: String,
  order: {type:Number, default:0},
  meta: Schema.Types.Mixed
});
module.exports = mongoose.model('Category', CategorySchema);
