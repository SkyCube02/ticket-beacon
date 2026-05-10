// Check if electron app is available via process._linkedBinding
const names = ['electron_app', 'electron_browser_app', 'electron_browser_window', 
                'atom_browser_app', 'electron_common_asar'];
for (const name of names) {
  try {
    const b = process._linkedBinding(name);
    if (b) console.log(`_linkedBinding('${name}') found, app:`, typeof b.app);
  } catch(e) {
    // silently skip
  }
}
// Check ELECTRON_ENABLE_LOGGING env
console.log('ELECTRON env vars:', Object.keys(process.env).filter(k => k.startsWith('ELECTRON')).join(','));
// Check process properties
const allProcessKeys = Object.getOwnPropertyNames(process).filter(k => !['argv', 'env', 'execArgv', 'versions'].includes(k));
console.log('process keys with electron:', allProcessKeys.filter(k => k.toLowerCase().includes('electron') || k.toLowerCase().includes('browser')).join(','));
process.exit(0);
