// models/Series.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SeriesSchema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true },
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  iconUrl: String,
  order: { type: Number, default: 0 },
  meta: Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model('Series', SeriesSchema);
