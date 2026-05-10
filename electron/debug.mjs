import electron from 'electron';
console.log('typeof electron:', typeof electron);
if (typeof electron === 'object' && electron !== null) {
  console.log('keys:', Object.keys(electron).slice(0,10).join(','));
} else {
  console.log('value:', String(electron).slice(0,100));
}
import * as ns from 'electron';
console.log('ns keys:', Object.keys(ns).slice(0,10).join(','));
process.exit(0);
