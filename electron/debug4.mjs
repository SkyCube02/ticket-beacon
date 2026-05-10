// Try accessing electron via the __non_webpack_require__ or builtin paths
import { createRequire } from 'module';
const req = createRequire(import.meta.url);

// In Electron, the electron module is a custom built-in
// Try various internal paths
const attempts = [
  'electron',
  'electron/main',
];

for (const mod of attempts) {
  try {
    const m = req(mod);
    console.log(`req('${mod}') type:`, typeof m, typeof m === 'object' ? 'keys:' + Object.keys(m || {}).slice(0,5).join(',') : String(m).slice(0,60));
  } catch(e) {
    console.log(`req('${mod}') failed:`, e.message.slice(0,60));
  }
}

// Check if process has any electron bindings
console.log('process._linkedBinding exists:', typeof process._linkedBinding);
try {
  const binding = process._linkedBinding('electron_browser_app');
  console.log('electron_browser_app binding type:', typeof binding);
} catch(e) {
  console.log('electron_browser_app binding err:', e.message.slice(0,60));
}
process.exit(0);
