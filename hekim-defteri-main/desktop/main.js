const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { createBackup } = require('./database');

// ===== GLOBAL ERROR HANDLING =====
process.on('uncaughtException', (error) => {
  console.error('[Kritik Xəta] Tutulmayan xəta:', error);
  dialog.showErrorBox(
    'Proqram Xətası',
    `Gözlənilməz xəta baş verdi:\n\n${error.message}\n\nProqram davam edəcək, lakin bəzi funksiyalar işləməyə bilər.`
  );
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Kritik Xəta] İdarə olunmamış Promise:', reason);
});

let mainWindow;

// Server port
const PORT = 3001;

// ===== AUTO-UPDATER KONFIQURASIYASI =====
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Log for debugging
autoUpdater.logger = {
  info: (msg) => console.log('[Updater]', msg),
  warn: (msg) => console.warn('[Updater]', msg),
  error: (msg) => console.error('[Updater]', msg)
};

// Update status tracking
let updateStatus = {
  status: 'idle', // idle, checking, available, downloading, downloaded, error
  version: null,
  progress: null,
  error: null
};

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    updateStatus = { status: 'checking', version: null, progress: null, error: null };
    console.log('[Updater] Yeniləmə yoxlanılır...');
  });

  autoUpdater.on('update-available', (info) => {
    updateStatus = { status: 'available', version: info.version, progress: null, error: null };
    console.log(`[Updater] Yeni versiya mövcuddur: ${info.version}`);

    // Notify user through the app
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Yeniləmə Mövcuddur',
        message: `Yeni versiya mövcuddur: v${info.version}`,
        detail: 'Yeniləməni yükləmək istəyirsiniz? Məlumatlarınız qorunacaq.',
        buttons: ['Yeniləməni Yüklə', 'Sonra'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) {
          // Create backup before downloading update
          console.log('[Updater] Yeniləmə öncəsi backup yaradılır...');
          createBackup();
          autoUpdater.downloadUpdate();
        }
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    updateStatus = { status: 'idle', version: null, progress: null, error: null };
    console.log('[Updater] Proqram ən son versiyadır.');
  });

  autoUpdater.on('download-progress', (progress) => {
    updateStatus = {
      status: 'downloading',
      version: updateStatus.version,
      progress: Math.round(progress.percent),
      error: null
    };
    console.log(`[Updater] Yüklənir: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateStatus = { status: 'downloaded', version: info.version, progress: 100, error: null };
    console.log(`[Updater] Yeniləmə yükləndi: v${info.version}`);

    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Yeniləmə Hazırdır',
        message: `v${info.version} yükləndi`,
        detail: 'Yeniləməni quraşdırmaq üçün proqram yenidən başladılacaq. Məlumatlarınız qorunacaq.',
        buttons: ['İndi Yenidən Başlat', 'Bağlananda Quraşdır'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) {
          // Create another backup just before restart
          createBackup();
          autoUpdater.quitAndInstall(false, true);
        }
      });
    }
  });

  autoUpdater.on('error', (error) => {
    updateStatus = { status: 'error', version: null, progress: null, error: error.message };
    console.error('[Updater] Xəta:', error.message);
  });

  // Check for updates every 30 minutes
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);

  // Initial check after 10 seconds
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10000);
}

// Export update status for server API
function getUpdateStatus() {
  return updateStatus;
}

function checkForUpdates() {
  return autoUpdater.checkForUpdates();
}

function downloadUpdate() {
  createBackup();
  return autoUpdater.downloadUpdate();
}

function installUpdate() {
  createBackup();
  autoUpdater.quitAndInstall(false, true);
}

// Make these available globally for server.js
global.updateFunctions = {
  getUpdateStatus,
  checkForUpdates,
  downloadUpdate,
  installUpdate
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false,
    backgroundColor: '#f1f5f9',
    title: 'Həkim Borc Dəftəri'
  });

  // Remove default menu
  Menu.setApplicationMenu(null);

  // Load the app
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle load failures - retry
  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      mainWindow.loadURL(`http://localhost:${PORT}`);
    }, 1000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    try {
      // Set port before requiring server
      process.env.PORT = PORT;
      
      // Run server in-process (not as child process)
      const expressApp = require('./server');
      
      // Give server more time to bind to port and be ready
      setTimeout(resolve, 3000);
    } catch (error) {
      reject(error);
    }
  });
}

function stopServer() {
  if (server) {
    server.close();
    server = null;
  }
}

app.whenReady().then(async () => {
  try {
    await startServer();
    createWindow();
    setupAutoUpdater();
  } catch (error) {
    dialog.showErrorBox('Xəta', 'Server başladıla bilmədi: ' + error.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopServer();
});
