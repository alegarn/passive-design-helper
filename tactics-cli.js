#!/usr/bin/env node
// Refactor derived from logic.js

const { run } = require('./scripts/cli');

run().catch(err => {
  console.error(err.message);
  process.exit(1);
});