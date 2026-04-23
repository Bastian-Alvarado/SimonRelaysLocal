require('dotenv').config();
const { app, BrowserWindow, session, ipcMain, dialog } = require('electron');
app.commandLine.appendSwitch('ignore-certificate-errors');
const path = require('path');
const fs = require('fs');
const { protocol, net } = require('electron');
const DiscordRPC = require('discord-rpc');

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

let mainWindow;

// --- Discord Rich Presence Setup ---
const clientId = '1490907882877620254'; // User's personalization Client ID
DiscordRPC.register(clientId);
const rpc = new DiscordRPC.Client({ transport: 'ipc' });

// --- Offline Storage Setup ---
const OFFLINE_DIR = path.join(app.getPath('userData'), 'offline_music');
const DOWNLOADS_JSON = path.join(OFFLINE_DIR, 'downloads.json');

// --- IPC Handlers (Registered at top-level) ---

ipcMain.handle('upload-track-to-server', async (event, { localPath, serverUrl, metadata }) => {
    try {
        const filename = path.basename(localPath);
        const data = await fs.promises.readFile(localPath);
        
        const response = await net.fetch(`${serverUrl}/api/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'audio/' + path.extname(filename).slice(1),
                'X-Filename': filename,
                'X-Metadata': Buffer.from(JSON.stringify(metadata)).toString('base64')
            },
            body: data
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return { success: false, error: errData.error || response.statusText, album: errData.album };
        }

        return { success: true };
    } catch (err) {
        console.error('IPC upload error:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-downloaded-list', () => {
    return getDownloadsMetadata();
});

ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Music Folder',
        buttonLabel: 'Add Folder'
    });
    
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('download-track', async (event, { url, metadata }) => {
    const metadataMap = getDownloadsMetadata();
    if (metadataMap[url]) return { success: true, alreadyExists: true };

    const safeFilename = encodeURIComponent(url).replace(/%/g, '_').slice(-100) + '.cache';
    const targetPath = path.join(OFFLINE_DIR, safeFilename);
    
    try {
        const response = await net.fetch(url);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);

        const totalSize = parseInt(response.headers.get('content-length'), 10) || 0;
        const writer = fs.createWriteStream(targetPath);
        const reader = response.body.getReader();
        let downloadedSize = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) { writer.end(); break; }
            downloadedSize += value.length;
            writer.write(Buffer.from(value));
            const progress = totalSize ? (downloadedSize / totalSize) : 0;
            if (mainWindow) mainWindow.webContents.send('download-progress', { url, progress });
        }

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                metadataMap[url] = { localPath: safeFilename, downloadedAt: Date.now(), metadata: metadata };
                saveDownloadsMetadata(metadataMap);
                resolve({ success: true });
            });
            writer.on('error', (err) => {
                if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
                reject(err);
            });
        });
    } catch (error) {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        throw error;
    }
});

ipcMain.handle('delete-offline-track', async (event, url) => {
    const meta = getDownloadsMetadata();
    const info = meta[url];
    if (info) {
        const filePath = path.join(OFFLINE_DIR, info.localPath);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        delete meta[url];
        saveDownloadsMetadata(meta);
        return true;
    }
    return false;
});

ipcMain.handle('get-firebase-config', () => firebaseConfig);

if (!fs.existsSync(OFFLINE_DIR)) {
    fs.mkdirSync(OFFLINE_DIR, { recursive: true });
}

function getDownloadsMetadata() {
    if (!fs.existsSync(DOWNLOADS_JSON)) return {};
    try {
        return JSON.parse(fs.readFileSync(DOWNLOADS_JSON, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveDownloadsMetadata(data) {
    fs.writeFileSync(DOWNLOADS_JSON, JSON.stringify(data, null, 2));
}

// Register protocol before app ready
protocol.registerSchemesAsPrivileged([
    { scheme: 'simon-offline', privileges: { standard: true, secure: true, stream: true, bypassCSP: true } }
]);

async function setActivity(details, state, startTime = null, isPaused = false) {
    if (!rpc || !mainWindow) return;
    try {
        const activity = {
            details: details || 'Idle',
            state: isPaused ? '(PAUSED)' : (state || 'Browsing Library'),
            largeImageKey: 'logo',
            largeImageText: 'SimonRelays',
            instance: false,
        };
        
        if (startTime && !isPaused) {
            activity.startTimestamp = Math.floor(startTime / 1000);
        }

        await rpc.setActivity(activity);
    } catch (e) {
        console.error('Discord RPC Error:', e);
    }
}

rpc.on('ready', () => {
    console.log('Discord RPC Ready');
    setActivity();
});

rpc.login({ clientId }).catch(console.error);

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1050,
        height: 720,
        minWidth: 900,
        minHeight: 650,
        title: 'SimonRelays Player',
        backgroundColor: '#0a0a0f',
        autoHideMenuBar: true,
        frame: false, // Remove native title bar
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Automatically handle any 'download' events 
    session.defaultSession.on('will-download', (event, item, webContents) => {
        item.on('updated', (event, state) => {
            if (state === 'interrupted') console.log('Download interrupted');
        });
        item.once('done', (event, state) => {
            if (state === 'completed') console.log('Download successful');
        });
    });

    mainWindow.loadFile('index.html');

    // Allow Firebase Auth Google Sign-In popup to open.
    // Without this, Electron blocks signInWithPopup() by default.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://accounts.google.com') || url.startsWith('https://simonrelayshome.firebaseapp.com')) {
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    width: 500,
                    height: 650,
                    title: 'Sign in with Google',
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                    }
                }
            };
        }
        return { action: 'deny' };
    });

    // Notify renderer of maximize/unmaximize
    mainWindow.on('maximize', () => mainWindow.webContents.send('window-state-changed', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-state-changed', false));
}

app.whenReady().then(() => {
    // IPC Handlers
    ipcMain.handle('install-codecs', async () => {
        return new Promise((resolve) => {
            console.log("Installing propriety codecs...");
            setTimeout(() => {
                app.relaunch();
                app.exit(0);
                resolve(true);
            }, 3000); 
        });
    });

    // Window Controls
    ipcMain.on('window-minimize', () => mainWindow.minimize());
    ipcMain.on('window-maximize', () => {
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    });
    ipcMain.on('window-close', () => mainWindow.close());

    // Discord Presence
    ipcMain.on('update-presence', (event, data) => {
        const { title, artist, startTime, isPaused } = data;
        setActivity(title, `by ${artist}`, startTime, isPaused);
    });

    // --- Offline Protocol Handler ---
    protocol.handle('simon-offline', (request) => {
        const url = request.url.replace('simon-offline://', '');
        const decodedPath = decodeURIComponent(url);
        const filePath = path.join(OFFLINE_DIR, decodedPath);
        return net.fetch('file://' + filePath);
    });




    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
