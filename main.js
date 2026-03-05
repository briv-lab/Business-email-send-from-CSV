const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;

/**
 * Polls localhost until the Next.js server responds.
 * Retries every 200ms, up to maxRetries times.
 */
function waitForServer(url, maxRetries = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http.get(url, () => resolve()).on('error', () => {
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

  // app.isPackaged is the ONLY reliable way to detect production in Electron.
  // process.env.NODE_ENV is NOT set in packaged apps.
  if (!app.isPackaged) {
    // DEV: Next.js dev server is already running via 'npm run dev'
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // PRODUCTION: Start the standalone Next.js server in-process.
    // With asar:false, all files are plain on disk next to main.js.
    const serverPath = path.join(__dirname, '.next', 'standalone', 'server.js');

    if (!fs.existsSync(serverPath)) {
      console.error('[EdiProspect] server.js not found at', serverPath);
      return;
    }

    const port = 3000;
    const userDataPath = app.getPath('userData');

    // Set env vars BEFORE requiring the server
    process.env.PORT = port.toString();
    process.env.APPDATA_DIR = userDataPath;
    // NODE_ENV is set by server.js itself (process.env.NODE_ENV = 'production')

    try {
      require(serverPath);
      console.log('[EdiProspect] Next.js server starting...');
    } catch (err) {
      console.error('[EdiProspect] Failed to start server:', err);
      return;
    }

    // Poll until the server is ready, then load the UI
    const serverUrl = `http://localhost:${port}`;
    waitForServer(serverUrl)
      .then(() => {
        console.log('[EdiProspect] Server ready!');
        if (mainWindow) {
          mainWindow.loadURL(serverUrl);
        }
      })
      .catch((err) => {
        console.error('[EdiProspect] Server timeout:', err.message);
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
