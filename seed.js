// seed.js
require('dotenv').config();
const mongoose = require('mongoose');

const Category = require('./models/Category');
const Series = require('./models/Series');
const Model = require('./models/Model');
const RepairOption = require('./models/RepairOption');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';

async function run() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  // CLEAN (BE CAREFUL: deletes existing lists)
  await Category.deleteMany({});
  await Series.deleteMany({});
  await Model.deleteMany({});
  await RepairOption.deleteMany({});

  // CREATE shared repair options (example)
  const repairs = [
    { name: 'Rear cover', code: 'rear_cover', basePrice: 15000 },
    { name: 'Display', code: 'display', basePrice: 25000 },
    { name: 'Battery', code: 'battery', basePrice: 12000 },
    { name: 'Water damage', code: 'water', basePrice: 35000 }
  ];
  const repairDocs = await RepairOption.insertMany(repairs);
  console.log('Created repairs:', repairDocs.map(r => r.code).join(', '));

  // Category A (Phones)
  const catPhones = await Category.create({ name: 'Phones', slug: 'phones', order: 1, iconUrl: '' });
  const seriesPhone1 = await Series.create({ name: 'Galaxy S Series', slug: 'galaxy-s', category: catPhones._id });
  const seriesPhone2 = await Series.create({ name: 'iPhone Series', slug: 'iphone', category: catPhones._id });

  // Models for Galaxy S
  const m1 = await Model.create({
    name: 'Galaxy S10',
    brand: 'Samsung',
    slug: 'galaxy-s10',
    series: seriesPhone1._id,
    category: catPhones._id,
    imageUrl: '',
    priceOverrides: [
      { repairOptionCode: 'display', price: 22000 }, // custom price for this model
      { repairOptionCode: 'battery', price: 10000 }
    ]
  });
  const m2 = await Model.create({
    name: 'Galaxy S20',
    brand: 'Samsung',
    slug: 'galaxy-s20',
    series: seriesPhone1._id,
    category: catPhones._id,
    imageUrl: ''
  });

  // Models for iPhone series
  const m3 = await Model.create({
    name: 'iPhone 11',
    brand: 'Apple',
    slug: 'iphone-11',
    series: seriesPhone2._id,
    category: catPhones._id
  });

  // Category B (Tablets)
  const catTablets = await Category.create({ name: 'Tablet Computers', slug: 'tablet', order: 2, iconUrl: '' });
  const seriesTab1 = await Series.create({ name: 'Galaxy Tab', slug: 'galaxy-tab', category: catTablets._id });
  const seriesTab2 = await Series.create({ name: 'iPad', slug: 'ipad', category: catTablets._id });

  const t1 = await Model.create({
    name: 'Galaxy Tab S6',
    brand: 'Samsung',
    slug: 'galaxy-tab-s6',
    series: seriesTab1._id,
    category: catTablets._id
  });

  // For each model we want unique available repair options — create subset logic by model if needed.
  // (We're using the repair options created earlier; widget will use price overrides when present.)

  console.log('Seed complete');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
