import * as ns from 'electron';
// Maybe the module.exports proxy has properties not shown by Object.keys
const mod = ns['module.exports'];
console.log('mod.app:', typeof mod.app);
console.log('mod.BrowserWindow:', typeof mod.BrowserWindow);
console.log('ns.default.app:', typeof ns.default.app);
// Try the default export directly
const d = ns.default;
console.log('d.app:', typeof d.app, d.app ? 'defined!' : 'undefined');
process.exit(0);
