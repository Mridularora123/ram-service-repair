// seeds/seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Series = require('../models/Series');
const DeviceModel = require('../models/Model');
const RepairOption = require('../models/RepairOption');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ram-service';

async function main(){
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  // 1. Read categories that already exist
  const cats = await Category.find({}).lean();
  if(!cats || !cats.length){
    console.log('No categories found. Please create categories first or include categories seed.');
    process.exit(1);
  }

  // helper: get category by slug or name
  const pickCat = (slugOrName) => cats.find(c => c.slug === slugOrName || c.name === slugOrName);

  // mapping - adjust slugs to your categories
  const map = [
    { slug: 'samsung-galaxy', name: 'Samsung Galaxy', categorySlug: 'phones' },
    { slug: 'iphone-series', name: 'iPhone Series', categorySlug: 'phones' },
    { slug: 'tablet-series', name: 'Tablet Series', categorySlug: 'tablet' },
    { slug: 'smart-home', name: 'Smart Home', categorySlug: 'smartphone' },
    { slug: 'plumbing-series', name: 'Plumbing Lines', categorySlug: 'plumbing' },
    { slug: 'electrical-series', name: 'Electrical Lines', categorySlug: 'electrical' }
  ];

  // create series if not exist
  for(const m of map){
    const cat = pickCat(m.categorySlug);
    if(!cat){
      console.log('Skipping', m.slug, 'no category found for', m.categorySlug);
      continue;
    }
    let s = await Series.findOne({ slug: m.slug, category: cat._id });
    if(!s){
      s = await Series.create({
        name: m.name,
        slug: m.slug,
        category: cat._id,
        description: `${m.name} for ${cat.name}`
      });
      console.log('Created series', s.slug);
    } else {
      console.log('Series exists', s.slug);
    }

    // create one sample model per series for testing
    let md = await DeviceModel.findOne({ slug: `${m.slug}-model` });
    if(!md){
      md = await DeviceModel.create({
        name: `${m.name} Model A`,
        slug: `${m.slug}-model`,
        brand: m.name.split(' ')[0],
        category: cat._id,
        series: s._id,
        imageUrl: ''
      });
      console.log('Created model', md.slug);
    } else {
      console.log('Model exists', md.slug);
    }
  }

  // create a couple of repair options if none exist
  const repairsCount = await RepairOption.countDocuments();
  if(repairsCount === 0){
    await RepairOption.create([
      { name: 'Screen replacement', slug:'screen', code:'SCREEN', basePrice: 49900 },
      { name: 'Battery replacement', slug:'battery', code:'BATTERY', basePrice: 29900 },
      { name: 'Charging port', slug:'charging-port', code:'CHARGE', basePrice: 15900 }
    ]);
    console.log('Created repair options');
  } else {
    console.log('Repair options already exist:', repairsCount);
  }

  console.log('Seed finished');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
