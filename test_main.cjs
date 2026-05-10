const e = require('electron');
console.log('electron type:', typeof e);
console.log('app type:', typeof e.app);
console.log('app defined:', !!e.app);
process.exit(0);
