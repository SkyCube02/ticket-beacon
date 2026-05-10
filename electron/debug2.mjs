import * as ns from 'electron';
const mod = ns['module.exports'];
console.log('module.exports type:', typeof mod);
if (typeof mod === 'object' && mod) {
  const keys = Object.keys(mod);
  console.log('keys:', keys.slice(0,15).join(','));
  console.log('has app:', typeof mod.app);
}
process.exit(0);
