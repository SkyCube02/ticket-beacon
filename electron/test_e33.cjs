const e = require('electron');
console.log('type:', typeof e);
console.log('is string:', typeof e === 'string');
console.log('process.type:', process.type);
console.log('versions.electron:', process.versions && process.versions.electron);
if (typeof e === 'object' && e) {
  console.log('keys:', Object.keys(e).slice(0,8).join(','));
} else {
  console.log('value:', String(e).slice(0,80));
}
process.exit(0);
