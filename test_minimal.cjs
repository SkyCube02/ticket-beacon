console.log('Loading electron...');
const e = require('electron');
console.log('electron type:', typeof e, 'has app:', typeof e.app);
console.log('Loading sqlite...');
try {
  const db = require('better-sqlite3');
  console.log('sqlite OK');
} catch(err) {
  console.error('sqlite ERROR:', err.message);
}
