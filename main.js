const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;

const isDev = process.env.NODE_ENV !== 'production';

function waitForServer(url, maxRetries = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http.get(url, (res) => {
        resolve();
      }).on('error', () => {
        if (attempts >= maxRetries) {
          reject(new Error(`Server not ready after ${maxRetries} attempts`));
        } else {
          setTimeout(check, 200);
        }
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'EdiProspect',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    const serverPath = path.join(__dirname, '.next', 'standalone', 'server.js');
    const exists = fs.existsSync(serverPath);
    
    console.log('[EdiProspect] __dirname:', __dirname);
    console.log('[EdiProspect] serverPath:', serverPath);
    console.log('[EdiProspect] server exists:', exists);

    if (!exists) {
      dialog.showErrorBox('EdiProspect Error', `server.js not found at:\n${serverPath}`);
      return;
    }

    const port = 3000;
    const userDataPath = app.getPath('userData');

    process.env.PORT = port.toString();
    process.env.APPDATA_DIR = userDataPath;

    // Require the server — server.js sets process.env.NODE_ENV and process.chdir itself
    try {
      require(serverPath);
      console.log('[EdiProspect] require(server.js) succeeded');
    } catch (err) {
      console.error('[EdiProspect] require(server.js) FAILED:', err.message);
      console.error(err.stack);
      dialog.showErrorBox('Server Error', `Failed to start server:\n${err.message}\n\n${err.stack}`);
      return;
    }

    const serverUrl = `http://localhost:${port}`;
    waitForServer(serverUrl)
      .then(() => {
        console.log('[EdiProspect] Server ready, loading UI...');
        if (mainWindow) {
          mainWindow.loadURL(serverUrl);
        }
      })
      .catch((err) => {
        console.error('[EdiProspect] Server timeout:', err.message);
        dialog.showErrorBox('Server Timeout', `Server failed to start in time:\n${err.message}`);
      });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
