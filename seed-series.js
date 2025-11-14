// seed-series.js - run once (node seed-series.js)
require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('./models/Category');
const Series = require('./models/Series');
const DeviceModel = require('./models/Model');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to', (mongoose.connection && mongoose.connection.db && mongoose.connection.db.databaseName));

  // Create Category
  const catData = { name: 'Phones', slug: 'phones', iconUrl: '' };
  let cat = await Category.findOne({ slug: catData.slug });
  if (!cat) cat = await new Category(catData).save();

  // Create Series tied to category
  const seriesData = { name: 'Galaxy', slug: 'galaxy', category: cat._id, iconUrl: '' };
  let series = await Series.findOne({ slug: seriesData.slug, category: cat._id });
  if (!series) series = await new Series(seriesData).save();

  // Create Model tied to series
  const modelData = { name: 'Galaxy S10', slug: 'galaxy-s10', series: series._id, brand: 'Samsung', imageUrl: '' };
  let model = await DeviceModel.findOne({ slug: modelData.slug, series: series._id });
  if (!model) model = await new DeviceModel(modelData).save();

  console.log('Seed complete: category', cat._id, 'series', series._id, 'model', model._id);
  await mongoose.disconnect();
}
run().catch(e => {
  console.error('seed err', e);
  process.exit(1);
});
