const mongoose = require('mongoose');

const SeriesSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, lowercase: true, index: true },
  description: { type: String },
  iconUrl: { type: String },
  image: { type: String },
  order: { type: Number, default: 0 },
  // IMPORTANT: category must be stored as ObjectId
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Series', SeriesSchema);
