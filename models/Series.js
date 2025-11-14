// models/Series.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SeriesSchema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, index: true },
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  iconUrl: String,
  image: String,
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Series', SeriesSchema);
