const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const SeriesSchema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true },
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  description: String,
  image: String,
  iconUrl: String,
  order: { type: Number, default: 0 }
}, { timestamps: true });
module.exports = mongoose.model('Series', SeriesSchema);
