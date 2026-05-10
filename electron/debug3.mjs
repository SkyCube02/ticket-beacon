import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Try requiring electron from the dist dir
try {
  const e = require('C:/Users/benco/ticket-beacon/node_modules/electron/dist/electron.exe');
  console.log('direct exe type:', typeof e);
} catch(err) {
  console.log('direct exe err:', err.message.slice(0,80));
}

// Try node_modules electron index
const path = require('path');
const electronPath = require('C:/Users/benco/ticket-beacon/node_modules/electron');
console.log('electron path:', electronPath);

// What does process give us?
console.log('process.versions.electron:', process.versions.electron);
console.log('process.type:', process.type);

// Check if there are any electron-related globals
const keys = Object.keys(global).filter(k => k.toLowerCase().includes('electron') || k.toLowerCase().includes('app'));
console.log('global electron-related keys:', keys.join(','));
process.exit(0);
