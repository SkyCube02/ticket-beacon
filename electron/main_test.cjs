const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
console.log('app type:', typeof app);
if (app) {
  app.whenReady().then(() => {
    console.log('App ready!');
    app.quit();
  });
} else {
  console.log('FAIL: app is undefined');
  process.exit(1);
}
