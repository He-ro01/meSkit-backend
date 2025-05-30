const mongoose = require('mongoose');

const CacheVideoSchema = new mongoose.Schema({
  sourceUrl: String,
  outputUrl: String,
  folder: String,
  createdAt: { type: Date, default: Date.now, expires: 600 }
});

module.exports = mongoose.model('CacheVideo', CacheVideoSchema);
