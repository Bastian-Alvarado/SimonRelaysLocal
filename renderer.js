const DEFAULT_SERVER_URL = 'https://localhost:3000';
const CURRENT_SERVER_URL = localStorage.getItem('serverUrl');
if (CURRENT_SERVER_URL === 'http://localhost:3000') {
    localStorage.removeItem('serverUrl'); // Clear old HTTP default to use HTTPS default
}

const isSelfHosted = (window.location.protocol.startsWith('http')) &&
    (window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.'));

let serverBaseUrl = isSelfHosted
    ? ''  // same-origin, use relative URLs
    : (localStorage.getItem('serverUrl') || DEFAULT_SERVER_URL).replace(/\/+$/, '');

const deviceId = localStorage.getItem('deviceId') || crypto.randomUUID();
localStorage.setItem('deviceId', deviceId);

document.addEventListener('DOMContentLoaded', async () => {
    // Views
    const homeView = document.getElementById('home-view');
    const albumView = document.getElementById('album-view');
    const searchView = document.getElementById('search-view');
    const artistView = document.getElementById('artist-view');

    // Elements
    const backBtn = document.getElementById('back-btn');
    const albumHeroDiv = document.getElementById('album-hero');

    // Artist Hero Elements
    const artistBackBtn = document.getElementById('artist-back-btn');
    const artistHeroName = document.getElementById('artist-hero-name');
    const artistHeroMeta = document.getElementById('artist-hero-meta');
    const artistPlayAllBtn = document.getElementById('artist-play-all-btn');
    const artistTrackList = document.getElementById('artist-track-list');
    const artistAlbumGrid = document.getElementById('artist-album-grid');

    // Header Inputs
    const navHomeBtn = document.getElementById('nav-home-btn');
    const searchInput = document.getElementById('search-input');
    const searchTrackList = document.getElementById('search-track-list');

    // Search section refs
    const searchArtistsSection = document.getElementById('search-artists-section');
    const searchArtistList = document.getElementById('search-artist-list');
    const searchPlaylistsSection = document.getElementById('search-playlists-section');
    const searchPlaylistList = document.getElementById('search-playlist-list');
    const searchTracksSection = document.getElementById('search-tracks-section');
    const searchEmptyState = document.getElementById('search-empty-state');
    const searchHistorySection = document.getElementById('search-history-section');
    const searchHistoryList = document.getElementById('search-history-list');
    const clearSearchHistoryBtn = document.getElementById('clear-search-history-btn');

    // Global Player Bar Nodes
    const trackListElement = document.getElementById('track-list');
    const audioPlayer = document.getElementById('audio-player');
    const bottomTitle = document.getElementById('bottom-title');
    const bottomArtist = document.getElementById('bottom-artist');
    const bottomArtWrapper = document.getElementById('bottom-art');
    const bottomOfflineBtn = document.getElementById('bottom-offline-btn');

    // Playback Controls
    const prevBtn = document.getElementById('prev-btn');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const nextBtn = document.getElementById('next-btn');
    const playIcon = document.getElementById('play-icon');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatBtn = document.getElementById('repeat-btn');
    const repeatIcon = document.getElementById('repeat-icon');

    // Scrubber Bar
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');
    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressFill = document.getElementById('progress-fill');
    const hoverTooltip = document.getElementById('hover-tooltip');

    // Volume Control Elements
    const muteBtn = document.getElementById('mute-btn');
    const muteIcon = document.getElementById('mute-icon');
    const volumeBarContainer = document.getElementById('volume-bar-container');
    const volumeFill = document.getElementById('volume-fill');

    // Dependency Modal Elements
    const dependencyModal = document.getElementById('dependency-modal');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalInstallBtn = document.getElementById('modal-install-btn');

    // Playlist Elements
    const playlistView = document.getElementById('playlist-view');
    const playlistHeroDiv = document.getElementById('playlist-hero');
    const playlistTrackList = document.getElementById('playlist-track-list');
    const playlistBackBtn = document.getElementById('playlist-back-btn');
    const playlistStrip = document.getElementById('playlist-strip');
    const createPlaylistModal = document.getElementById('create-playlist-modal');
    const playlistNameInput = document.getElementById('playlist-name-input');
    const createPlaylistCancelBtn = document.getElementById('create-playlist-cancel-btn');
    const createPlaylistConfirmBtn = document.getElementById('create-playlist-confirm-btn');
    const addToPlaylistDropdown = document.getElementById('add-to-playlist-dropdown');

    // Settings Elements
    const settingsBtn = document.getElementById('settings-btn');
    const profileBtn = document.getElementById('profile-btn');
    const settingsView = document.getElementById('settings-view');
    const profileView = document.getElementById('profile-view');
    const profileBody = profileView ? profileView.querySelector('.profile-body') : null;
    const settingsCloseBtn = document.getElementById('settings-close-btn');

    // Firebase / Auth Elements
    const loginOverlay = document.getElementById('login-overlay');
    const googleSigninBtn = document.getElementById('google-signin-btn');
    const skipLoginBtn = document.getElementById('skip-login-btn');
    const signoutBtn = document.getElementById('signout-btn');
    const settingsLoginBtn = document.getElementById('settings-login-btn');

    // Global State
    let currentUser = null;

    // ── Firebase Configuration ───────────────────────────────────────────────
    /**
     * NOTE FOR CONTRIBUTORS:
     * To protect sensitive API keys, this project uses environment variables.
     * 1. Create a `.env` file in the root directory.
     * 2. Add your Firebase credentials as follows:
     *    FIREBASE_API_KEY=your_key
     *    FIREBASE_AUTH_DOMAIN=your_domain
     *    FIREBASE_PROJECT_ID=your_id
     *    FIREBASE_STORAGE_BUCKET=your_bucket
     *    FIREBASE_MESSAGING_SENDER_ID=your_sender_id
     *    FIREBASE_APP_ID=your_app_id
     * 
     * The main process (main.js) loads these and injects them here via contextBridge.
     */
    let firebaseConfig = null;
    if (window.electronAPI && window.electronAPI.getFirebaseConfig) {
        firebaseConfig = await window.electronAPI.getFirebaseConfig();
    } else {
        // PWA / Browser Fallback: Fetch config from local backend
        try {
            const res = await fetch(`${serverBaseUrl}/api/firebase-config`);
            if (res.ok) {
                firebaseConfig = await res.json();
                console.log('[Cloud] Firebase config fetched from server API.');
            }
        } catch (e) {
            console.warn('[Cloud] Failed to fetch Firebase config from server API.', e);
        }
    }

    if (firebaseConfig && firebaseConfig.apiKey) {
        firebase.initializeApp(firebaseConfig);
        window._fbAuth = firebase.auth();
        window._fbDB = firebase.database();
        window._fbFS = firebase.firestore();
        console.log('[Cloud] Firebase initialized via Secure Injection.');

        // ── Auth State Listener ──────────────────────────────────────────────
        window._fbAuth.onAuthStateChanged(user => {
            currentUser = user;
            if (user) {
                console.log('[Cloud] User logged in:', user.email);
                if (loginOverlay) loginOverlay.classList.add('hidden');
                // Trigger fetch from Firebase
                fetchPlaylists();

                // Always update panels if they are currently visible
                if (settingsView && settingsView.classList.contains('active')) renderSettingsPanel();
                if (profileView && profileView.classList.contains('active')) renderProfilePanel();
            } else {
                console.log('[Cloud] User logged out.');
                // Show login overlay if not skipped in session
                if (loginOverlay && !sessionStorage.getItem('skipLogin')) {
                    loginOverlay.classList.remove('hidden');
                }
                // Clear playlists on logout
                allPlaylists = [];
                renderPlaylistsStrip();
                fetchPlaylists(); // Will trigger local fallback or empty render

                if (settingsView && settingsView.classList.contains('active')) renderSettingsPanel();
                if (profileView && profileView.classList.contains('active')) renderProfilePanel();
            }

            // Always update settings panel if it's currently visible
            if (settingsView && settingsView.classList.contains('active')) {
                renderSettingsPanel();
            }
        });
    } else {
        console.warn('[Cloud] Firebase configuration missing. Core features will run offline.');
    }

    // Mobile Bottom Nav Elements
    const mobileHomeBtn = document.getElementById('mobile-home-btn');
    const mobileSearchBtn = document.getElementById('mobile-search-btn');
    const mobileQueueBtn = document.getElementById('mobile-queue-btn');
    const mobileSettingsBtn = document.getElementById('mobile-settings-btn');
    const mobileProfileBtn = document.getElementById('mobile-profile-btn');
    const mobileNavItems = [mobileHomeBtn, mobileSearchBtn, mobileQueueBtn, mobileSettingsBtn, mobileProfileBtn];
    const mobileSearchInput = document.getElementById('mobile-search-input');

    // Metadata Edit Elements
    const editMetadataModal = document.getElementById('edit-metadata-modal');
    const metadataModalTitle = document.getElementById('metadata-modal-title');
    const metadataTitleInput = document.getElementById('metadata-title-input');
    const metadataArtistInput = document.getElementById('metadata-artist-input');
    const metadataAlbumInput = document.getElementById('metadata-album-input');
    const metadataYearInput = document.getElementById('metadata-year-input');
    const metadataArtPreview = document.getElementById('metadata-art-preview');
    const metadataArtInput = document.getElementById('metadata-art-input');
    const metadataArtDropzone = document.getElementById('metadata-art-dropzone');
    const metadataSaveBtn = document.getElementById('metadata-save-btn');
    const metadataCancelBtn = document.getElementById('metadata-cancel-btn');
    const metadataRestoreBtn = document.getElementById('metadata-restore-btn');

    // ── Auth Event Listeners ──────────────────────────────────────────────────
    if (googleSigninBtn) {
        googleSigninBtn.addEventListener('click', handleGoogleSignIn);
    }
    if (settingsLoginBtn) {
        settingsLoginBtn.addEventListener('click', handleGoogleSignIn);
    }
    if (skipLoginBtn) {
        skipLoginBtn.addEventListener('click', () => {
            if (loginOverlay) loginOverlay.classList.add('hidden');
            sessionStorage.setItem('skipLogin', 'true');
        });
    }
    if (signoutBtn) {
        signoutBtn.addEventListener('click', handleSignOut);
    }

    async function handleGoogleSignIn() {
        if (!window._fbAuth) {
            alert("Firebase not initialized. Check your configuration.");
            return;
        }
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await window._fbAuth.signInWithPopup(provider);
        } catch (e) {
            console.error("Sign-in failed", e);
            alert("Sign-in failed: " + e.message);
        }
    }

    async function handleSignOut() {
        if (!window._fbAuth) return;
        try {
            await window._fbAuth.signOut();
            sessionStorage.removeItem('skipLogin');
        } catch (e) {
            console.error("Sign-out failed", e);
        }
    }
    const trackContextMenu = document.getElementById('track-context-menu');
    const menuEditBtn = document.getElementById('menu-edit-btn');
    const menuPlaylistBtn = document.getElementById('menu-playlist-btn');
    const menuRemovePlaylistBtn = document.getElementById('menu-remove-playlist-btn');
    const menuGoArtistBtn = document.getElementById('menu-go-artist-btn');
    const menuGoAlbumBtn = document.getElementById('menu-go-album-btn');
    let currentEditingTrack = null;
    let currentEditingAlbum = null;
    let currentPlaylistId = null;
    let currentTrackItem = null;
    let isAlbumMode = false;
    let newCoverArtBase64 = null;

    function updateMobileNavActive(activeBtn) {
        mobileNavItems.forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
        if (activeBtn) activeBtn.classList.add('active');
    }

    // Window Controls
    const minBtn = document.getElementById('min-btn');
    const maxBtn = document.getElementById('max-btn');
    const closeBtn = document.getElementById('close-btn');
    const maxIcon = document.getElementById('max-icon');

    if (window.electronAPI) {
        minBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
        maxBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
        closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

        window.electronAPI.onWindowStateChanged((isMaximized) => {
            if (isMaximized) {
                // Restore icon (two overlapping squares)
                maxIcon.innerHTML = '<rect x="8" y="4" width="12" height="12" rx="2" ry="2"></rect><path d="M4 8v12h12"></path>';
            } else {
                // Maximize icon (single square)
                maxIcon.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>';
            }
        });
    }

    // ── Dynamic Color Logic ──────────────────────────────────────────────────
    async function updatePlayerBarDynamicColor(imgUrl) {
        if (!imgUrl || window.innerWidth > 768) return;

        const playerBar = document.querySelector('.player-bar');
        if (!playerBar) return;

        // If it's a relative URL (server source), make it absolute for the Image object
        const absoluteImageUrl = (imgUrl.startsWith('/') && !imgUrl.startsWith('//'))
            ? `${serverBaseUrl}${imgUrl}`
            : imgUrl;

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = absoluteImageUrl;

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 1; canvas.height = 1;

            ctx.drawImage(img, 0, 0, 1, 1);
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

            // Apply subtle tint (slightly darken and desaturate for UI overlay look)
            const dimR = Math.floor(r * 0.7);
            const dimG = Math.floor(g * 0.7);
            const dimB = Math.floor(b * 0.7);

            playerBar.style.setProperty('--player-dynamic-rgb', `${dimR}, ${dimG}, ${dimB}`);
            playerBar.style.setProperty('--player-dynamic-bg', `rgba(${dimR}, ${dimG}, ${dimB}, 0.75)`);
            // More solid version for the progress fill
            playerBar.style.setProperty('--player-dynamic-fill', `rgba(${r}, ${g}, ${b}, 0.85)`);
        };
    }

    const artistImageCache = {};

    async function fetchAndApplyArtistImage(artistName, elementNode, useXL = false) {
        if (!artistName || artistName === 'Unknown Artist') return;

        let targetEl = null;
        if (elementNode.classList && elementNode.classList.contains('artist-card-art')) {
            targetEl = elementNode;
        } else if (elementNode.classList && elementNode.classList.contains('artist-hero-avatar')) {
            targetEl = elementNode;
        } else if (elementNode.classList && elementNode.classList.contains('artist-avatar')) {
            targetEl = elementNode;
        } else {
            targetEl = elementNode.querySelector('.artist-card-art') || elementNode.querySelector('.artist-avatar');
        }

        if (!targetEl) return;

        function applyImgToNode(url, target, node) {
            if (!url || target.innerHTML.includes('<img')) return;
            target.innerHTML = `<img src="${url}" crossorigin="anonymous" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; animation: fadeIn 0.5s;">`;
            if (node.classList && node.classList.contains('artist-hero-avatar')) {
                const artistView = document.getElementById('artist-view');
                if (artistView) artistView.style.setProperty('--view-bg-image', `url("${url}")`);
            }
        }

        if (!artistImageCache[artistName]) {
            artistImageCache[artistName] = { resolved: false, pending: false, waiters: [] };
        }

        const state = artistImageCache[artistName];

        if (state.resolved) {
            applyImgToNode(useXL ? state.xl : state.medium, targetEl, elementNode);
            return;
        }

        // Add to waiters list for when fetch completes
        state.waiters.push({ targetEl, elementNode, useXL });

        if (state.pending) return; // Wait for the in-flight fetch

        state.pending = true;
        try {
            const res = await fetch(`${serverBaseUrl}/api/deezer-artist?q=${encodeURIComponent(artistName)}`);
            if (res.ok) {
                const metadata = await res.json();
                if (metadata.data && metadata.data.length > 0) {
                    const obj = metadata.data[0];
                    state.resolved = true;
                    state.medium = obj.picture_medium || obj.picture;
                    state.xl = obj.picture_xl || obj.picture_big || obj.picture;
                }
            }
        } catch (e) {
            console.error('Deezer fetch error', e);
        } finally {
            state.pending = false;
            const finalWaiters = state.waiters;
            state.waiters = []; // Clear before applying to avoid potential recursion issues

            finalWaiters.forEach(w => {
                if (state.resolved) {
                    applyImgToNode(w.useXL ? state.xl : state.medium, w.targetEl, w.elementNode);
                }
            });

            if (state.resolved) {
                document.dispatchEvent(new CustomEvent('artist-image-resolved', { detail: artistName }));
            }
        }
    }

    let allTracks = [];
    let albumsData = {};
    let currentPlaylistContext = [];
    let currentTrackIndex = -1;
    let isShuffleActive = false;
    let unplayedIndices = [];
    let repeatMode = 0;
    let globalPlayingTrack = null;
    let allPlaylists = [];
    let activePlaylistId = null;
    let pendingAddTrack = null;
    let createPlaylistCallback = null;
    let userQueue = [];
    let downloadedTracksMap = new Map(); // url -> localPath
    let pendingDownloads = new Map(); // url -> progress

    // ── Infinite Play State ───────────────────────────────────────────────────
    let sessionHistory          = [];   // up to 50 recently played URLs
    let sessionAffinity         = { artists: {}, genres: {} };
    let pendingRecommendedTrack = null; // pre-computed next pick
    // ─────────────────────────────────────────────────────────────────────────
    let pendingUploads = new Set();  // url
    let currentActiveBlobUrl = null;

    // ── IndexedDB Configuration (PWA Offline Support) ───────────────────────
    let db = null;
    const DB_NAME = 'SimonRelaysOffline';
    const DB_VERSION = 1;

    async function initDB() {
        if (db) return db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('tracks')) {
                    db.createObjectStore('tracks', { keyPath: 'trackUrl' });
                }
            };
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function saveTrackToIDB(trackUrl, blob, metadata) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['tracks'], 'readwrite');
            const store = transaction.objectStore('tracks');
            const request = store.put({ trackUrl, blob, metadata, savedAt: Date.now() });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function getTrackFromIDB(trackUrl) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['tracks'], 'readonly');
            const store = transaction.objectStore('tracks');
            const request = store.get(trackUrl);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteTrackFromIDB(trackUrl) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['tracks'], 'readwrite');
            const store = transaction.objectStore('tracks');
            const request = store.delete(trackUrl);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function getAllDownloadedFromIDB() {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['tracks'], 'readonly');
            const store = transaction.objectStore('tracks');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Lyrics Logic State
    const lyricsContainer = document.getElementById('immersive-lyrics-container');
    let lyricsData = [];
    let currentLyricIndex = -1;

    // Queue View Logic State
    const queueBtn = document.getElementById('queue-btn');
    const queueView = document.getElementById('queue-view');
    const queueNowPlaying = document.getElementById('queue-now-playing');
    const queueUserSection = document.getElementById('queue-user-section');
    const queueUserList = document.getElementById('queue-user-list');
    const queueContextList = document.getElementById('queue-context-list');
    const queueClearBtn = document.getElementById('queue-clear-btn');

    // Immersive View State
    const immersiveView = document.getElementById('immersive-view');
    const expandImmersiveBtn = document.getElementById('expand-immersive-btn');
    const immersiveBg = document.getElementById('immersive-bg');
    const immersiveArt = document.getElementById('immersive-art');
    const immersiveTitle = document.getElementById('immersive-title');
    const immersiveArtist = document.getElementById('immersive-artist');
    const immersiveLyricsContainer = lyricsContainer; // Keep reference for backward compatibility

    // Lyrics creation state
    let plainLyricsCache = '';
    let lyricsTrackUrl = '';
    let currentLyricsTitle = '';
    let currentLyricsArtist = '';
    let currentLyricsAlbum = '';
    let currentLyricsDuration = 0;
    let syncLines = [];
    let syncTimestamps = [];
    let syncCurrentLineIdx = 0;
    let syncKeyHandler = null;

    // ── Immersive UI logic ───────────────────────────────────────────────────
    // ── Immersive UI logic ───────────────────────────────────────────────────
    function toggleImmersiveView() {
        if (immersiveView.classList.contains('active')) {
            history.back();
        } else {
            navigateTo('immersive');
        }
    }
    if (expandImmersiveBtn) {
        expandImmersiveBtn.addEventListener('click', toggleImmersiveView);
    }
    const closeImmersiveBtn = document.getElementById('close-immersive-btn');
    if (closeImmersiveBtn) {
        closeImmersiveBtn.addEventListener('click', toggleImmersiveView);
    }
    const toggleArtBtn = document.getElementById('toggle-art-btn');
    if (toggleArtBtn) {
        toggleArtBtn.addEventListener('click', () => {
            immersiveView.classList.toggle('hide-art');
        });
    }

    function showImmersiveOverlay() {
        hideOverlays('immersive'); // Close settings/queue before opening immersive
        openViewAnimated(immersiveView);
        if (expandImmersiveBtn) expandImmersiveBtn.classList.add('active-icon');

        // Global state initialization
        document.body.classList.add('immersive-active');
        const playerBar = document.querySelector('.player-bar');
        if (playerBar) playerBar.classList.add('fullscreen-active');

        // instantly scroll to active lyric if any
        if (currentLyricIndex !== -1 && lyricsData[currentLyricIndex]) {
            updateLyricsSync();
        }
    }

    function hideImmersiveOverlay() {
        if (immersiveView && immersiveView.classList.contains('active')) {
            closeViewAnimated(immersiveView, 500);
            if (expandImmersiveBtn) expandImmersiveBtn.classList.remove('active-icon');

            // Global state cleanup
            document.body.classList.remove('immersive-active');
            const playerBar = document.querySelector('.player-bar');
            if (playerBar) playerBar.classList.remove('fullscreen-active');
        }
    }


    // ── Queue UI logic ────────────────────────────────────────────────────────
    function toggleQueueView() {
        if (queueView.classList.contains('active')) {
            history.back();
        } else {
            navigateTo('queue');
        }
    }

    function showQueueOverlay() {
        hideOverlays('queue'); // Ensure other overlays like settings are closed
        queueView.classList.remove('hidden');
        queueView.classList.add('active');
        if (queueBtn) queueBtn.classList.add('active-icon');
        renderQueueView();
    }

    queueBtn.addEventListener('click', toggleQueueView);

    queueClearBtn.addEventListener('click', () => {
        userQueue = [];
        renderQueueView();
    });

    function renderQueueView() {
        if (!globalPlayingTrack) {
            queueNowPlaying.innerHTML = '<div class="search-empty-text" style="font-size:14px; opacity:0.5;">Nothing playing</div>';
            queueUserSection.style.display = 'none';
            queueContextList.innerHTML = '<div class="search-empty-text" style="font-size:14px; opacity:0.5;">No context</div>';
            return;
        }

        // Render Now Playing
        renderTrackList([globalPlayingTrack], queueNowPlaying);

        // Render User Queue
        if (userQueue.length > 0) {
            queueUserSection.style.display = 'flex';
            renderTrackList(userQueue, queueUserList);
        } else {
            queueUserSection.style.display = 'none';
        }

        // Render Context Coming Up
        const contextRemaining = [];
        if (isShuffleActive) {
            unplayedIndices.forEach(idx => {
                if (currentPlaylistContext[idx] && !isTrackUnsupported(currentPlaylistContext[idx])) {
                    contextRemaining.push(currentPlaylistContext[idx]);
                }
            });
        } else {
            for (let i = currentTrackIndex + 1; i < currentPlaylistContext.length; i++) {
                if (!isTrackUnsupported(currentPlaylistContext[i])) {
                    contextRemaining.push(currentPlaylistContext[i]);
                }
            }
        }

        if (contextRemaining.length > 0) {
            renderTrackList(contextRemaining.slice(0, 50), queueContextList); // limit to 50 to prevent freezing
        } else {
            queueContextList.innerHTML = '<div class="search-empty-text" style="font-size:14px; opacity:0.5;">End of list</div>';
        }
    }

    function addToQueue(track) {
        userQueue.push(track);
        if (queueView.classList.contains('active')) {
            renderQueueView();
        }
    }

    // Modal Logic
    function showDependencyModal() {
        dependencyModal.classList.remove('hidden');
    }

    function hideDependencyModal() {
        dependencyModal.classList.add('hidden');
    }

    // Settings Panel Logic
    function openSettings(push = true) {
        if (push) navigateTo('settings');
        hideOverlays('settings'); // Close other overlays first
        settingsView.classList.add('active');
        if (settingsBtn) settingsBtn.classList.add('settings-btn-active');
    }

    function closeSettings() {
        settingsView.classList.remove('active');
        settingsBtn.classList.remove('settings-btn-active');
    }

    function openProfile(push = true) {
        if (push) navigateTo('profile');
        hideOverlays('profile');
        profileView.classList.add('active');
        if (profileBtn) profileBtn.classList.add('settings-btn-active');
    }

    function closeProfile() {
        profileView.classList.remove('active');
        if (profileBtn) profileBtn.classList.remove('settings-btn-active');
    }

    // ── Profile Panel Renderer ────────────────────────────────────────────────
    function renderProfilePanel() {
        if (!profileBody) return;

        profileBody.innerHTML = `
            <div class="settings-section">
                <div class="settings-section-title">Account &amp; Sync</div>
                <div class="settings-row" style="cursor: default;">
                    ${currentUser ? `
                        <div class="settings-profile-info">
                            <div style="position: relative; width: 48px; height: 48px; flex-shrink: 0;">
                                <img src="${currentUser.photoURL || 'icon.svg'}" alt="" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent); background: #1a1a20;">
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div class="settings-row-label" style="margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentUser.displayName || 'User'}</div>
                                <div class="settings-row-sub" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentUser.email}</div>
                            </div>
                            <button id="profile-signout-btn" class="settings-reset-btn">Sign Out</button>
                        </div>
                    ` : `
                        <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
                            <div class="settings-row-sub">Connect to Firebase to enable cross-device sync, cloud playlists, and remote control.</div>
                            <button id="profile-login-btn" class="settings-save-btn" style="align-self: flex-start;">Connect Cloud</button>
                        </div>
                    `}
                </div>
            </div>
            ${currentUser ? `
                <div class="settings-section">
                    <div class="settings-section-title">Edit Profile</div>
                    <div class="profile-edit-container" style="display: flex; flex-direction: column; gap: 20px; width: 100%;">
                        <div style="display: flex; align-items: center; gap: 20px; width: 100%;">
                             <div class="profile-pic-editor" id="profile-pic-trigger" style="position: relative; width: 100px; height: 100px; cursor: pointer; flex-shrink: 0;">
                                <img id="profile-pic-preview" src="${currentUser.photoURL || 'icon.svg'}" alt="" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 3px solid var(--accent); background: #1a1a20;">
                                <div class="edit-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                </div>
                             </div>
                             <div style="flex: 1; min-width: 0;">
                                <div class="settings-row-label" style="margin-bottom: 8px;">Nickname</div>
                                <input id="profile-nickname-input" class="settings-text-input" type="text" value="${currentUser.displayName || ''}" placeholder="Choose a nickname..." style="width: 100%; margin: 0;">
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">Email: ${currentUser.email}</div>
                             </div>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <div id="profile-status" style="font-size: 13px;"></div>
                            <button id="profile-save-btn" class="settings-save-btn">Update Profile</button>
                        </div>
                    </div>
                </div>
            ` : ''}
        `;

        const loginBtn = document.getElementById('profile-login-btn');
        if (loginBtn) loginBtn.addEventListener('click', handleGoogleSignIn);
        const logoutBtn = document.getElementById('profile-signout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', handleSignOut);

        const saveBtn = document.getElementById('profile-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const nick = document.getElementById('profile-nickname-input').value.trim();
                updateProfileData(nick);
            });
        }

        const picTrigger = document.getElementById('profile-pic-trigger');
        if (picTrigger) {
            picTrigger.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            let width = img.width;
                            let height = img.height;
                            const max = 400; // Smaller for profile pic
                            if (width > height) {
                                if (width > max) { height *= max / width; width = max; }
                            } else {
                                if (height > max) { width *= max / height; height = max; }
                            }
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);
                            const base64 = canvas.toDataURL('image/jpeg', 0.8);
                            updateProfileData(undefined, base64);
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                };
                input.click();
            });
        }
    }

    async function updateProfileData(displayName, photoBase64) {
        if (!currentUser) return;
        const statusEl = document.getElementById('profile-status');
        if (statusEl) {
            statusEl.textContent = 'Saving...';
            statusEl.style.color = 'var(--accent)';
        }

        try {
            const updates = {};
            if (displayName !== undefined) updates.displayName = displayName;
            if (photoBase64 !== undefined) updates.photoURL = photoBase64;

            await currentUser.updateProfile(updates);
            
            // Re-render
            renderProfilePanel();

            if (statusEl) {
                statusEl.textContent = 'Profile updated!';
                statusEl.style.color = '#4caf50';
                setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
            }
        } catch (e) {
            console.error('[Profile] Failed to update profile', e);
            if (statusEl) {
                statusEl.textContent = 'Error: ' + e.message;
                statusEl.style.color = '#f44336';
            }
        }
    }

    settingsBtn.addEventListener('click', () => {
        if (settingsView.classList.contains('active')) {
            closeSettings();
        } else {
            renderSettingsPanel();
            openSettings();
        }
    });

    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            if (profileView.classList.contains('active')) {
                closeProfile();
            } else {
                renderProfilePanel();
                openProfile();
            }
        });
    }

    settingsCloseBtn.addEventListener('click', closeSettings);

    // ── Metadata Editor Logic ────────────────────────────────────────────────

    function showContextMenu(e, track, sourceBtn, canEdit = true, playlistId = null, trackItem = null) {
        e.stopPropagation();
        currentEditingTrack = track;
        currentPlaylistId = playlistId;
        currentTrackItem = trackItem;

        const rect = sourceBtn.getBoundingClientRect();
        trackContextMenu.style.top = `${rect.bottom + 5}px`;
        trackContextMenu.style.left = `${rect.right - 180}px`;

        // Permission Gating: Only owners can edit info or remove from a specific playlist
        if (canEdit) {
            menuEditBtn.classList.remove('hidden');
            if (playlistId) {
                menuRemovePlaylistBtn.classList.remove('hidden');
            } else {
                menuRemovePlaylistBtn.classList.add('hidden');
            }
        } else {
            menuEditBtn.classList.add('hidden');
            menuRemovePlaylistBtn.classList.add('hidden');
        }

        trackContextMenu.classList.remove('hidden');
    }

    function hideContextMenu() {
        trackContextMenu.classList.add('hidden');
    }

    document.addEventListener('click', (e) => {
        // Close context menu if clicking outside
        if (trackContextMenu && !trackContextMenu.contains(e.target) && !e.target.closest('.track-item-more-btn')) {
            hideContextMenu();
        }
    });

    menuEditBtn.addEventListener('click', () => {
        hideContextMenu();
        if (currentEditingTrack) openEditMetadataModal(currentEditingTrack);
    });

    menuPlaylistBtn.addEventListener('click', (e) => {
        hideContextMenu();
        if (currentEditingTrack) showAddToPlaylistDropdown(currentEditingTrack, e.target);
    });

    menuRemovePlaylistBtn.addEventListener('click', () => {
        hideContextMenu();
        if (currentPlaylistId && currentEditingTrack && currentTrackItem) {
            removeTrackFromPlaylist(currentPlaylistId, currentEditingTrack.url, currentTrackItem);
        }
    });

    menuGoArtistBtn.addEventListener('click', () => {
        hideContextMenu();
        if (currentEditingTrack) {
            const artistName = (currentEditingTrack.metadata && currentEditingTrack.metadata.artist) ? currentEditingTrack.metadata.artist : 'Unknown Artist';
            const cleanArtist = artistName.includes(';') ? artistName.split(';')[0].trim() : artistName;
            openArtistView(cleanArtist);
        }
    });

    menuGoAlbumBtn.addEventListener('click', () => {
        hideContextMenu();
        if (currentEditingTrack) {
            const albumName = (currentEditingTrack.metadata && currentEditingTrack.metadata.album) ? currentEditingTrack.metadata.album : 'Unknown Album';
            const albumInfo = Object.values(albumsData).find(a => a.name === albumName);
            if (albumInfo) {
                openAlbumView(albumInfo);
            } else {
                // Fallback: search for tracks with this album name if not in albumsData
                console.warn('Album info not found in albumsData, falling back to manual search');
            }
        }
    });

    function openEditAlbumModal(albumInfo) {
        isAlbumMode = true;
        currentEditingAlbum = albumInfo;
        newCoverArtBase64 = null;

        metadataModalTitle.textContent = "Edit Album Information";

        // Hide song-specific fields
        metadataTitleInput.closest('.input-group').style.display = 'none';
        metadataYearInput.closest('.input-group').style.display = 'none';

        // Show cover editor for album level
        metadataArtDropzone.closest('.metadata-editor-left').style.display = 'flex';
        metadataRestoreBtn.style.display = 'none';

        metadataArtistInput.value = albumInfo.artist;
        metadataAlbumInput.value = albumInfo.name;

        // Show current album cover
        if (albumInfo.coverTrackPath) {
            metadataArtPreview.src = `${serverBaseUrl}/api/cover?path=${encodeURIComponent(albumInfo.coverTrackPath)}&t=${Date.now()}`;
            metadataArtPreview.style.display = 'block';
        } else {
            metadataArtPreview.src = '';
            metadataArtPreview.style.display = 'none';
        }

        editMetadataModal.classList.remove('hidden');
    }

    function openEditMetadataModal(track) {
        isAlbumMode = false;
        currentEditingTrack = track;
        newCoverArtBase64 = null;

        metadataModalTitle.textContent = "Edit Song Information";

        // Ensure all fields are visible
        metadataTitleInput.closest('.input-group').style.display = 'flex';
        metadataYearInput.closest('.input-group').style.display = 'flex';

        // Hide cover editor for individual songs
        metadataArtDropzone.closest('.metadata-editor-left').style.display = 'none';
        metadataRestoreBtn.style.display = 'block';

        metadataTitleInput.value = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
        metadataArtistInput.value = (track.metadata && track.metadata.artist) ? track.metadata.artist : '';
        metadataAlbumInput.value = (track.metadata && track.metadata.album) ? track.metadata.album : '';
        metadataYearInput.value = (track.metadata && track.metadata.year) ? track.metadata.year : '';

        if (track.hasBackup) {
            metadataRestoreBtn.classList.remove('hidden');
        } else {
            metadataRestoreBtn.classList.add('hidden');
        }

        editMetadataModal.classList.remove('hidden');
    }

    metadataCancelBtn.addEventListener('click', () => {
        editMetadataModal.classList.add('hidden');
    });

    metadataArtDropzone.addEventListener('click', () => {
        metadataArtInput.click();
    });

    metadataArtInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            newCoverArtBase64 = event.target.result;
            metadataArtPreview.src = newCoverArtBase64;
            metadataArtPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    });

    metadataSaveBtn.addEventListener('click', async () => {
        if (isAlbumMode) {
            if (!currentEditingAlbum) return;
            metadataSaveBtn.disabled = true;
            metadataSaveBtn.textContent = 'Saving...';

            try {
                const res = await fetch(`${serverBaseUrl}/api/update-album-metadata`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tracks: currentEditingAlbum.tracks.map(t => ({ relativePath: t.relativePath, isLocal: !!t.isLocal })),
                        metadata: {
                            artist: metadataArtistInput.value.trim(),
                            album: metadataAlbumInput.value.trim()
                        },
                        coverArt: newCoverArtBase64
                    })
                });

                if (res.ok) {
                    editMetadataModal.classList.add('hidden');
                    await initializeMusicLibrary();
                    alert('Album updated successfully!');
                } else {
                    const err = await res.json();
                    alert('Save failed: ' + err.error);
                }
            } catch (e) {
                alert('Error saving album metadata: ' + e.message);
            } finally {
                metadataSaveBtn.disabled = false;
                metadataSaveBtn.textContent = 'Save Changes';
            }
            return;
        }

        if (!currentEditingTrack) return;

        metadataSaveBtn.disabled = true;
        metadataSaveBtn.textContent = 'Saving...';

        const payload = {
            relativePath: currentEditingTrack.relativePath,
            isLocal: !!currentEditingTrack.isLocal,
            metadata: {
                title: metadataTitleInput.value.trim(),
                artist: metadataArtistInput.value.trim(),
                album: metadataAlbumInput.value.trim(),
                year: metadataYearInput.value
            },
            coverArt: null // coverArt editing disabled at song level
        };

        try {
            const res = await fetch(`${serverBaseUrl}/api/update-metadata`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                editMetadataModal.classList.add('hidden');
                // Force full refresh to show new metadata/art
                await initializeMusicLibrary();
            } else {
                const err = await res.json();
                alert('Save failed: ' + err.error);
            }
        } catch (e) {
            alert('Error saving metadata: ' + e.message);
        } finally {
            metadataSaveBtn.disabled = false;
            metadataSaveBtn.textContent = 'Save Changes';
        }
    });

    metadataRestoreBtn.addEventListener('click', async () => {
        if (!currentEditingTrack || !confirm('Are you sure you want to restore the original file from backup? This will undo all edits.')) return;

        metadataRestoreBtn.disabled = true;

        try {
            const res = await fetch(`${serverBaseUrl}/api/restore-backup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    relativePath: currentEditingTrack.relativePath,
                    isLocal: !!currentEditingTrack.isLocal
                })
            });

            if (res.ok) {
                editMetadataModal.classList.add('hidden');
                await initializeMusicLibrary();
            } else {
                const err = await res.json();
                alert('Restore failed: ' + err.error);
            }
        } catch (e) {
            alert('Error restoring backup: ' + e.message);
        } finally {
            metadataRestoreBtn.disabled = false;
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsView.classList.contains('active')) {
            closeSettings();
        }
    });

    // ── Settings Panel Renderer ───────────────────────────────────────────────
    function renderSettingsPanel() {
        const body = settingsView.querySelector('.settings-body');
        if (!body) return;

        const currentCustomUrl = localStorage.getItem('serverUrl') || '';
        const localPaths = getLocalMusicPaths();

        body.innerHTML = `
            <div class="settings-section">
                <div class="settings-section-title">Network</div>
                <div class="settings-row">
                    <div class="settings-row-info">
                        <div class="settings-row-label">Backend Server Address</div>
                        <div class="settings-row-sub">Override the default address (${DEFAULT_SERVER_URL}). Useful for connecting via Tailscale or a remote machine.</div>
                    </div>
                    <div class="settings-input-group">
                        <input id="server-url-input" class="settings-text-input" type="text" placeholder="${DEFAULT_SERVER_URL}" value="${currentCustomUrl}" spellcheck="false" autocomplete="off">
                        <button id="server-url-save-btn" class="settings-save-btn">Save &amp; Restart</button>
                        ${currentCustomUrl ? `<button id="server-url-reset-btn" class="settings-reset-btn">Reset to Default</button>` : ''}
                    </div>
                    ${currentCustomUrl ? `<div class="settings-active-url">Currently using: <span>${currentCustomUrl}</span></div>` : `<div class="settings-active-url">Currently using: <span>${DEFAULT_SERVER_URL} (default)</span></div>`}
                </div>
            </div>

            <div class="settings-section">
                <div class="settings-section-title">Local Music Sources</div>
                <div class="settings-row">
                    <div class="settings-row-info">
                        <div class="settings-row-label">Add Music Folder</div>
                        <div class="settings-row-sub">Point to any local folder. Its audio files are merged with your library automatically.</div>
                    </div>
                    <div class="settings-input-group">
                        <button id="local-path-add-btn" class="settings-save-btn">Add Folder</button>
                        <button id="local-rescan-btn" class="settings-reset-btn">Force Rescan Library</button>
                    </div>
                    <div id="local-path-status" class="local-path-status"></div>
                    ${localPaths.length > 0 ? `
                        <div class="local-sources-list">
                            ${localPaths.map((p, i) => `
                                <div class="local-source-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.5;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                    <span class="local-source-path" title="${p}">${p}</span>
                                    <button class="local-source-remove-btn" data-index="${i}" title="Remove">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<div class="local-sources-empty">No local sources added yet.</div>'}
                </div>
            </div>

            <div class="settings-section">
                <div class="settings-section-title">Cloud Library</div>
                <div class="settings-row">
                    <div class="settings-row-info">
                        <div class="settings-row-label">Upload to Server</div>
                        <div class="settings-row-sub">Add music directly to your Tailscale server. Files will be accessible on all your devices.</div>
                    </div>
                    <div class="settings-input-group">
                        <button id="cloud-upload-btn" class="settings-save-btn">Select Files</button>
                        <input type="file" id="cloud-upload-input" multiple accept="audio/*" style="display: none;">
                    </div>
                    <div id="cloud-upload-status" class="local-path-status" style="margin-top: 10px;"></div>
                </div>
            </div>
        `;

        // Network section handlers
        document.getElementById('server-url-save-btn').addEventListener('click', () => {
            const val = document.getElementById('server-url-input').value.trim().replace(/\/+$/, '');
            if (val && val !== DEFAULT_SERVER_URL) localStorage.setItem('serverUrl', val);
            else localStorage.removeItem('serverUrl');
            location.reload();
        });
        const resetBtn = document.getElementById('server-url-reset-btn');
        if (resetBtn) resetBtn.addEventListener('click', () => { localStorage.removeItem('serverUrl'); location.reload(); });

        // Local sources: Add folder (Native Picker)
        document.getElementById('local-path-add-btn').addEventListener('click', async () => {
            if (!window.electronAPI) {
                alert('Folder selection is only available in the desktop app.');
                return;
            }

            const pathVal = await window.electronAPI.selectDirectory();
            if (!pathVal) return;

            const statusEl = document.getElementById('local-path-status');
            const paths = getLocalMusicPaths();

            if (paths.includes(pathVal)) {
                statusEl.textContent = 'This folder is already added.';
                statusEl.className = 'local-path-status error';
                return;
            }

            statusEl.textContent = 'Scanning and adding folder...';
            statusEl.className = 'local-path-status scanning';
            document.getElementById('local-path-add-btn').disabled = true;

            try {
                const res = await fetch(`${serverBaseUrl}/api/scan-directory`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: pathVal })
                });

                if (!res.ok) throw new Error(res.statusText);

                paths.push(pathVal);
                saveLocalMusicPaths(paths);
                localStorage.setItem('lastScanTime', Date.now().toString());

                statusEl.textContent = `✓ Folder Added and Scanned successfully.`;
                statusEl.className = 'local-path-status success';

                await initializeMusicLibrary();
                renderSettingsPanel();
            } catch (e) {
                statusEl.textContent = `Error scanning: ${e.message}`;
                statusEl.className = 'local-path-status error';
            } finally {
                document.getElementById('local-path-add-btn').disabled = false;
            }
        });

        // Force Rescan Handler
        const rescanBtn = document.getElementById('local-rescan-btn');
        if (rescanBtn) {
            rescanBtn.addEventListener('click', async () => {
                const statusEl = document.getElementById('local-path-status');
                rescanBtn.disabled = true;
                statusEl.textContent = 'Refreshing all local sources...';
                statusEl.className = 'local-path-status scanning';

                try {
                    await rescanLocalSources();
                    statusEl.textContent = '✓ Library rescan complete.';
                    statusEl.className = 'local-path-status success';
                } catch (e) {
                    statusEl.textContent = 'Error during rescan.';
                    statusEl.className = 'local-path-status error';
                } finally {
                    rescanBtn.disabled = false;
                }
            });
        }

        // Local sources: Remove folder
        body.querySelectorAll('.local-source-remove-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = parseInt(btn.dataset.index);
                const paths = getLocalMusicPaths();
                paths.splice(idx, 1);
                saveLocalMusicPaths(paths);
                        await initializeMusicLibrary();
                renderSettingsPanel();
            });
        });

        // Cloud Upload handlers
        const uploadBtn = document.getElementById('cloud-upload-btn');
        const uploadInput = document.getElementById('cloud-upload-input');
        const uploadStatus = document.getElementById('cloud-upload-status');

        if (uploadBtn && uploadInput) {
            uploadBtn.addEventListener('click', () => uploadInput.click());
            uploadInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                if (files.length === 0) return;

                uploadBtn.disabled = true;
                uploadBtn.textContent = 'Uploading...';
                let successCount = 0;
                let errorCount = 0;

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    uploadStatus.textContent = `Uploading ${i + 1}/${files.length}: ${file.name}`;
                    
                    try {
                        const response = await fetch(`${serverBaseUrl}/api/upload`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'audio/mpeg',
                                'x-filename': file.name
                            },
                            body: file
                        });

                        if (response.ok) {
                            successCount++;
                        } else {
                            const err = await response.json();
                            console.error('Upload failed for', file.name, err);
                            errorCount++;
                        }
                    } catch (err) {
                        console.error('Upload error for', file.name, err);
                        errorCount++;
                    }
                }

                uploadBtn.disabled = false;
                uploadBtn.textContent = 'Select Files';
                uploadStatus.textContent = `Done! ${successCount} uploaded, ${errorCount} failed.`;
                uploadStatus.style.color = errorCount > 0 ? '#f44336' : '#4caf50';
                
                if (successCount > 0) {
                    await initializeMusicLibrary();
                    renderHomeGrid();
                }
            });
        }
    }
    // ─────────────────────────────────────────────────────────────────────────

    modalCancelBtn.addEventListener('click', hideDependencyModal);
    dependencyModal.addEventListener('click', (e) => {
        if (e.target === dependencyModal) hideDependencyModal();
    });

    modalInstallBtn.addEventListener('click', async () => {
        modalInstallBtn.textContent = 'Installing...';
        modalInstallBtn.disabled = true;
        modalCancelBtn.style.display = 'none';

        if (window.electronAPI) {
            await window.electronAPI.installCodecs();
        } else {
            console.warn('Install codecs only available in desktop app');
            // On mobile, we can just close the modal as the browser handles codecs
            hideDependencyModal();
        }

        hideDependencyModal();
    });

    // Playback Controls Logic
    repeatBtn.addEventListener('click', () => {
        repeatMode = (repeatMode + 1) % 3;
        if (repeatMode === 0) {
            repeatBtn.classList.remove('toggle-active');
            repeatIcon.innerHTML = `
                <polyline points="17 1 21 5 17 9"></polyline>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <polyline points="7 23 3 19 7 15"></polyline>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            `;
        } else if (repeatMode === 1) {
            repeatBtn.classList.add('toggle-active');
            repeatIcon.innerHTML = `
                <polyline points="17 1 21 5 17 9"></polyline>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <polyline points="7 23 3 19 7 15"></polyline>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            `;
        } else if (repeatMode === 2) {
            repeatBtn.classList.add('toggle-active');
            repeatIcon.innerHTML = `
                <polyline points="17 1 21 5 17 9"></polyline>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <polyline points="7 23 3 19 7 15"></polyline>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                <text x="12" y="16.5" font-size="9" font-family="sans-serif" font-weight="bold" stroke="none" fill="currentColor" text-anchor="middle">1</text>
            `;
        }
    });

    shuffleBtn.addEventListener('click', () => {
        isShuffleActive = !isShuffleActive;
        if (isShuffleActive) {
            shuffleBtn.classList.add('toggle-active');
            if (currentPlaylistContext.length > 0) {
                unplayedIndices = currentPlaylistContext.map((_, i) => i).filter(i => i !== currentTrackIndex);
            }
        } else {
            shuffleBtn.classList.remove('toggle-active');
        }
    });

    if (bottomOfflineBtn) {
        bottomOfflineBtn.addEventListener('click', () => {
            if (!globalPlayingTrack) return;
            if (globalPlayingTrack.isLocal) {
                console.log('Local tracks are already offline.');
                return;
            }

            const isOffline = downloadedTracksMap.has(globalPlayingTrack.url);
            const isDownloading = pendingDownloads.has(globalPlayingTrack.url);

            if (!isOffline && !isDownloading) {
                initiateDownload(globalPlayingTrack);
            } else if (isOffline) {
                // Future idea: maybe clicking a downloaded song shows info or allows deletion?
                // For now, do nothing.
                console.log('Track is already available offline');
            }
        });
    }

    playPauseBtn.addEventListener('click', () => {
        if (!audioPlayer.src) return;
        if (audioPlayer.paused) {
            audioPlayer.play();
        } else {
            audioPlayer.pause();
        }
    });

    audioPlayer.addEventListener('play', () => {
        playIcon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');

        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
        }

        if (window.electronAPI && globalPlayingTrack) {
            const title = (globalPlayingTrack.metadata && globalPlayingTrack.metadata.title) ? globalPlayingTrack.metadata.title : globalPlayingTrack.filename;
            const artist = (globalPlayingTrack.metadata && globalPlayingTrack.metadata.artist) ? globalPlayingTrack.metadata.artist : 'Unknown Artist';
            window.electronAPI.updatePresence({ title, artist, startTime: Date.now(), isPaused: false });
        }
    });

    audioPlayer.addEventListener('pause', () => {
        playIcon.setAttribute('d', 'M8 5v14l11-7z');

        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }

        if (window.electronAPI && globalPlayingTrack) {
            const title = (globalPlayingTrack.metadata && globalPlayingTrack.metadata.title) ? globalPlayingTrack.metadata.title : globalPlayingTrack.filename;
            const artist = (globalPlayingTrack.metadata && globalPlayingTrack.metadata.artist) ? globalPlayingTrack.metadata.artist : 'Unknown Artist';
            window.electronAPI.updatePresence({ title, artist, isPaused: true });
        }
    });

    function isTrackUnsupported(track) {
        if (!track || !track.filename) return false;
        const lower = track.filename.toLowerCase();
        return lower.endsWith('.m4a') || lower.endsWith('.aac');
    }

    function getNextPlayableIndex(startIndex, direction = 1, isAutoEnded = false) {
        let i = startIndex;
        const total = currentPlaylistContext.length;
        if (total === 0) return -1;
        let checked = 0;

        // Pre-check: if startIndex is already out of bounds, wrap or bail
        // before the loop body tries to access currentPlaylistContext[i].
        // Only wrap when repeatMode===1 — never wrap due to !isAutoEnded,
        // otherwise manual skip at end-of-album incorrectly restarts the album
        // instead of triggering the infinite-play recommendation.
        if (i >= total) {
            if (repeatMode === 1) {
                i = 0;
            } else {
                return -1;
            }
        } else if (i < 0) {
            if (repeatMode === 1) {
                i = total - 1;
            } else {
                return -1;
            }
        }

        while (checked < total) {
            if (!isTrackUnsupported(currentPlaylistContext[i])) return i;
            i += direction;
            checked++;
            if (i >= total) {
                if (repeatMode === 1) {
                    i = 0;
                } else {
                    return -1;
                }
            } else if (i < 0) {
                if (repeatMode === 1) {
                    i = total - 1;
                } else {
                    return -1;
                }
            }
        }
        return -1;
    }

    // ── Infinite Play Engine ──────────────────────────────────────────────────
    function _updateSessionAffinity(track) {
        const artist = track.metadata?.artist || '';
        const genre  = track.metadata?.genre  || '';
        if (artist) sessionAffinity.artists[artist] = ((sessionAffinity.artists[artist] || 0) * 0.75) + 1.0;
        if (genre)  sessionAffinity.genres[genre]   = ((sessionAffinity.genres[genre]   || 0) * 0.75) + 1.0;
    }

    function _isLastTrackInContext() {
        if (userQueue.length > 0 || repeatMode !== 0 || currentPlaylistContext.length === 0) return false;
        if (isShuffleActive) return unplayedIndices.length === 0;
        return getNextPlayableIndex(currentTrackIndex + 1, 1, true) === -1;
    }

    function _pickRecommendedTrack(currentTrack) {
        if (!allTracks || allTracks.length === 0) return null;
        const currentYear = parseInt(currentTrack?.metadata?.year) || 0;

        const candidates = allTracks.filter(t =>
            !isTrackUnsupported(t) && t.url !== currentTrack?.url
        );
        if (candidates.length === 0) return null;

        const scored = candidates.map(track => {
            const artist = track.metadata?.artist || '';
            const genre  = track.metadata?.genre  || '';
            const year   = parseInt(track.metadata?.year) || 0;
            let score = 0;

            // Artist affinity (0-40 pts)
            score += (sessionAffinity.artists[artist] || 0) * 40;
            // Genre affinity (0-20 pts)
            score += (sessionAffinity.genres[genre] || 0) * 20;
            // Era proximity — 1 pt per year, max 10 (within 10-year window)
            if (currentYear && year) score += Math.max(0, 10 - Math.abs(currentYear - year));
            // Recency penalty — exponential decay, -50 at position 0, ~0 at position 40
            const histPos = sessionHistory.lastIndexOf(track.url);
            if (histPos !== -1) {
                const distFromEnd = sessionHistory.length - 1 - histPos;
                score -= 50 * Math.exp(-distFromEnd / 10);
            }
            // Diversity nudge — penalise same artist if in last 3 plays
            const recentThree = sessionHistory.slice(-3);
            if (recentThree.some(url => allTracks.find(x => x.url === url)?.metadata?.artist === artist)) {
                score -= 20;
            }
            // Random noise (0-15 pts) — prevents deterministic loops
            score += Math.random() * 15;

            return { track, score };
        });

        // Shift scores so all weights are positive, then weighted-random pick
        const minScore = Math.min(...scored.map(s => s.score));
        const weighted = scored.map(s => ({ track: s.track, w: Math.max(0.1, s.score - minScore + 0.1) }));
        const total    = weighted.reduce((sum, s) => sum + s.w, 0);
        let rand = Math.random() * total;
        for (const s of weighted) {
            rand -= s.w;
            if (rand <= 0) return s.track;
        }
        return weighted[weighted.length - 1].track;
    }

    function _scheduleRecommendation(currentTrack) {
        pendingRecommendedTrack = null;
        setTimeout(() => {
            const pick = _pickRecommendedTrack(currentTrack);
            if (pick) {
                pendingRecommendedTrack = pick;
                console.log('[InfinitePlay] Ready:', pick.metadata?.title || pick.filename);
            }
        }, 0);
    }
    // ─────────────────────────────────────────────────────────────────────────

    function commitTrackChange(index) {
        if (index < 0 || index >= currentPlaylistContext.length) return;
        if (isTrackUnsupported(currentPlaylistContext[index])) return;
        if (index < 0 || index >= currentPlaylistContext.length) return;

        currentTrackIndex = index;
        if (isShuffleActive) {
            unplayedIndices = unplayedIndices.filter(i => i !== index);
        }

        const track = currentPlaylistContext[index];
        const title = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
        const artist = (track.metadata && track.metadata.artist) ? track.metadata.artist : 'Unknown Artist';

        document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));

        const activeView = document.querySelector('.view.active');
        if (activeView) {
            const trackItems = activeView.querySelectorAll('.track-item');
            if (trackItems[index]) {
                trackItems[index].classList.add('active');
            }
        }

        playTrack(track, title, artist);

        // Infinite Play: track session history + affinity, pre-compute rec if last track
        sessionHistory.push(track.url);
        if (sessionHistory.length > 50) sessionHistory.shift();
        _updateSessionAffinity(track);
        if (_isLastTrackInContext()) _scheduleRecommendation(track);

        // Keep the queue panel in sync with the new context
        if (queueView && queueView.classList.contains('active')) {
            renderQueueView();
        }
    }

    function playNextTrack(isAutoEnded) {
        if (userQueue.length > 0) {
            const nextTrack = userQueue.shift();
            // Do not update currentTrackIndex so playback resumes properly.
            const title = (nextTrack.metadata && nextTrack.metadata.title) ? nextTrack.metadata.title : nextTrack.filename;
            const artist = (nextTrack.metadata && nextTrack.metadata.artist) ? nextTrack.metadata.artist : 'Unknown Artist';
            playTrack(nextTrack, title, artist);
            if (queueView && queueView.classList.contains('active')) renderQueueView();
            return;
        }

        if (currentTrackIndex === -1) return;

        if (isShuffleActive) {
            if (unplayedIndices.length === 0) {
                if (repeatMode === 0) {
                    if (pendingRecommendedTrack) {
                        const rec = pendingRecommendedTrack;
                        pendingRecommendedTrack = null;
                        currentPlaylistContext = [rec];
                        unplayedIndices = [];
                        commitTrackChange(0);
                    } else {
                        audioPlayer.pause();
                    }
                    return;
                }
                unplayedIndices = currentPlaylistContext.map((_, i) => i)
                    .filter(i => i !== currentTrackIndex && !isTrackUnsupported(currentPlaylistContext[i]));
            }
            if (unplayedIndices.length > 0) {
                const randomIndex = Math.floor(Math.random() * unplayedIndices.length);
                commitTrackChange(unplayedIndices[randomIndex]);
            }
        } else {
            const nextIdx = getNextPlayableIndex(currentTrackIndex + 1, 1, isAutoEnded);
            if (nextIdx !== -1) {
                commitTrackChange(nextIdx);
            } else if (pendingRecommendedTrack) {
                const rec = pendingRecommendedTrack;
                pendingRecommendedTrack = null;
                currentPlaylistContext = [rec];
                unplayedIndices = [];
                commitTrackChange(0);
            } else {
                audioPlayer.pause();
            }
        }
    }

    function playPreviousTrack() {
        if (!audioPlayer.src) return;

        if (audioPlayer.currentTime > 3) {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
            return;
        }

        const prevIdx = getNextPlayableIndex(currentTrackIndex - 1, -1, false);
        if (prevIdx !== -1) {
            commitTrackChange(prevIdx);
        } else {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
        }
    }

    nextBtn.addEventListener('click', () => {
        playNextTrack(false);
    });

    prevBtn.addEventListener('click', () => {
        playPreviousTrack();
    });

    // Mobile Swipe Gestures
    let touchStartX = 0;
    let touchMoveX = 0;

    function initMobileGestures() {
        const playerBar = document.querySelector('.player-bar');
        if (!playerBar) return;

        playerBar.addEventListener('touchstart', (e) => {
            if (window.innerWidth > 768) return;

            // If we're interacting with a button, ignore the swipe logic
            if (e.target.closest('button') || e.target.closest('.volume-container') || e.target.closest('.progress-bar')) return;

            touchStartX = e.touches[0].clientX;
            touchMoveX = touchStartX; // Reset move tracker to start position
            playerBar.style.transition = 'none'; // Disable transition for raw tracking
        }, { passive: true });

        playerBar.addEventListener('touchmove', (e) => {
            if (window.innerWidth > 768) return;
            touchMoveX = e.touches[0].clientX;
            const deltaX = touchMoveX - touchStartX;

            // Limit the slide to ±40px for subtle feedback
            const boundedX = Math.max(-40, Math.min(40, deltaX));
            playerBar.style.transform = `translateX(${boundedX}px)`;
        }, { passive: true });

        playerBar.addEventListener('touchend', (e) => {
            if (window.innerWidth > 768) return;
            const deltaX = touchMoveX - touchStartX;

            playerBar.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            playerBar.style.transform = 'translateX(0)';

            if (Math.abs(deltaX) > 60) {
                if (deltaX < 0) {
                    // Swipe Left -> Next
                    playNextTrack(false);
                } else {
                    // Swipe Right -> Previous
                    playPreviousTrack();
                }
            } else if (Math.abs(deltaX) < 10) {
                // It was a tap, not a swipe
                const isButtonAction = e.target.closest('button') || e.target.closest('.volume-container') || e.target.closest('.progress-bar');
                if (!isButtonAction && typeof toggleImmersiveView === 'function') {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleImmersiveView();
                }
            }

            // Reset trackers
            touchStartX = 0;
            touchMoveX = 0;
        });
    }

    initMobileGestures();

    audioPlayer.addEventListener('ended', () => {
        if (repeatMode === 2) {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
        } else {
            playNextTrack(true);
        }
    });

    // Timing and Scrubber Logic
    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    audioPlayer.addEventListener('loadedmetadata', () => {
        totalTimeEl.textContent = formatTime(audioPlayer.duration);
    });

    audioPlayer.addEventListener('timeupdate', () => {
        if (!isDraggingScrubber) {
            currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
            if (audioPlayer.duration) {
                const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
                progressFill.style.width = `${percent}%`;

                // Update dynamic full-bar progress on mobile
                const playerBar = document.querySelector('.player-bar');
                if (playerBar && window.innerWidth <= 768) {
                    playerBar.style.setProperty('--player-progress', `${percent}%`);
                }
            }
        }

        if (typeof updateLyricsSync === 'function') {
            updateLyricsSync();
        }
    });

    let isDraggingScrubber = false;

    function updateScrubberVisuals(e) {
        if (!audioPlayer.duration) return;
        const rect = progressBarContainer.getBoundingClientRect();
        let clickX = e.clientX - rect.left;

        // bound it
        if (clickX < 0) clickX = 0;
        if (clickX > rect.width) clickX = rect.width;

        const percent = clickX / rect.width;

        // update local visuals
        progressFill.style.width = `${percent * 100}%`;
        currentTimeEl.textContent = formatTime(percent * audioPlayer.duration);
        return percent;
    }

    function isSeekingDisabled() {
        if (!globalPlayingTrack) return false;
        const url = globalPlayingTrack.url.toLowerCase();
        return url.endsWith('.m4a') || url.endsWith('.aac');
    }

    progressBarContainer.addEventListener('mousedown', (e) => {
        if (!audioPlayer.src) return;
        if (isSeekingDisabled()) return;
        isDraggingScrubber = true;
        updateScrubberVisuals(e);
    });

    progressBarContainer.addEventListener('mousemove', (e) => {
        if (!audioPlayer.duration) return;

        const rect = progressBarContainer.getBoundingClientRect();
        let hoverX = e.clientX - rect.left;

        if (hoverX < 0) hoverX = 0;
        if (hoverX > rect.width) hoverX = rect.width;

        const percent = hoverX / rect.width;

        hoverTooltip.style.left = `${percent * 100}%`;

        if (isSeekingDisabled()) {
            hoverTooltip.textContent = "Seeking disabled for M4A/AAC files";
        } else {
            hoverTooltip.textContent = formatTime(percent * audioPlayer.duration);
        }
    });

    // Touch support for mobile rail
    const handleTouchScrub = (e) => {
        if (!audioPlayer.src || isSeekingDisabled()) return;
        const touch = e.touches[0];
        if (!touch) return;
        const rect = progressBarContainer.getBoundingClientRect();
        let clickX = touch.clientX - rect.left;

        if (clickX < 0) clickX = 0;
        if (clickX > rect.width) clickX = rect.width;

        const percent = clickX / rect.width;
        progressFill.style.width = `${percent * 100}%`;

        if (audioPlayer.duration) {
            hoverTooltip.style.opacity = '1';
            hoverTooltip.style.left = `${percent * 100}%`;
            hoverTooltip.textContent = formatTime(percent * audioPlayer.duration);
        }

        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        return percent;
    };

    progressBarContainer.addEventListener('touchstart', (e) => {
        if (!audioPlayer.src || isSeekingDisabled()) return;
        isDraggingScrubber = true;
        handleTouchScrub(e);
    }, { passive: false });

    progressBarContainer.addEventListener('touchmove', (e) => {
        if (isDraggingScrubber) {
            handleTouchScrub(e);
        }
    }, { passive: false });

    progressBarContainer.addEventListener('touchend', (e) => {
        if (isDraggingScrubber) {
            isDraggingScrubber = false;
            const touch = e.changedTouches[0];
            if (touch) {
                const rect = progressBarContainer.getBoundingClientRect();
                let clickX = touch.clientX - rect.left;
                const percent = Math.max(0, Math.min(1, clickX / rect.width));

                if (audioPlayer.duration) {
                    audioPlayer.currentTime = percent * audioPlayer.duration;
                }
            }
            hoverTooltip.style.opacity = '0';
        }
        e.stopPropagation();
    });

    // Volume Drag and Toggle Logic
    let lastVolume = 0.7;
    audioPlayer.volume = lastVolume;
    volumeFill.style.width = '70%';
    let isDraggingVolume = false;

    function setMuteIcon(isMuted) {
        if (isMuted) {
            muteIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>`;
        } else {
            muteIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>`;
        }
    }

    muteBtn.addEventListener('click', () => {
        if (audioPlayer.volume > 0) {
            lastVolume = audioPlayer.volume;
            audioPlayer.volume = 0;
            volumeFill.style.width = '0%';
            setMuteIcon(true);
        } else {
            audioPlayer.volume = lastVolume || 0.7;
            volumeFill.style.width = `${audioPlayer.volume * 100}%`;
            setMuteIcon(false);
        }
    });

    function updateVolumeVisuals(e) {
        const rect = volumeBarContainer.getBoundingClientRect();
        let clickX = e.clientX - rect.left;

        if (clickX < 0) clickX = 0;
        if (clickX > rect.width) clickX = rect.width;

        const percent = clickX / rect.width;
        volumeFill.style.width = `${percent * 100}%`;
        audioPlayer.volume = percent;

        if (percent === 0) setMuteIcon(true);
        else setMuteIcon(false);
    }

    volumeBarContainer.addEventListener('mousedown', (e) => {
        isDraggingVolume = true;
        updateVolumeVisuals(e);
    });

    // Global Drag Bindings
    document.addEventListener('mousemove', (e) => {
        if (isDraggingScrubber) {
            updateScrubberVisuals(e);
        }
        if (isDraggingVolume) {
            updateVolumeVisuals(e);
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (isDraggingScrubber) {
            isDraggingScrubber = false;
            const percent = updateScrubberVisuals(e);
            if (audioPlayer.duration) {
                audioPlayer.currentTime = percent * audioPlayer.duration;
            }
        }
        if (isDraggingVolume) {
            isDraggingVolume = false;
        }
    });

    // Navigation View Switches
    function hideQueueOverlay() {
        if (queueView.classList.contains('active')) {
            queueView.classList.remove('active');
            queueView.classList.add('hidden');
            queueBtn.classList.remove('active-icon');
        }
    }

    // Helper for animated view transitions
    function openViewAnimated(viewNode) {
        if (!viewNode) return;
        viewNode.classList.remove('hidden');
        // Force a reflow or use setTimeout to ensure transition triggers after display change
        setTimeout(() => viewNode.classList.add('active'), 10);
    }

    function closeViewAnimated(viewNode, duration = 500) {
        if (!viewNode || !viewNode.classList.contains('active')) return;
        viewNode.classList.remove('active');
        setTimeout(() => {
            // Check if it's still supposed to be inactive before hiding
            if (!viewNode.classList.contains('active')) {
                viewNode.classList.add('hidden');
            }
        }, duration);
    }

    function hideOverlays(except = null) {
        if (except !== 'queue') hideQueueOverlay();
        if (except !== 'immersive' && typeof hideImmersiveOverlay === 'function') hideImmersiveOverlay();
        if (typeof hideContextMenu === 'function') hideContextMenu();
        if (except !== 'settings' && typeof closeSettings === 'function') closeSettings();
        if (except !== 'profile' && typeof closeProfile === 'function') closeProfile();
    }

    // ── Navigation & Persistence Logic ────────────────────────────────────────
    function navigateTo(viewId, stateData = {}, push = true) {
        if (push) {
            history.pushState({ viewId, stateData }, '', '#' + viewId);
        }
        renderState(viewId, stateData);
    }

    function renderState(viewId, stateData) {
        switch (viewId) {
            case 'home': switchToHomeView(false); break;
            case 'search':
                if (stateData.query !== undefined) {
                    if (searchInput) searchInput.value = stateData.query;
                    if (mobileSearchInput) mobileSearchInput.value = stateData.query;
                    renderSearchResults(stateData.query);
                }
                switchToSearchView(false);
                break;
            case 'album':
                if (stateData.albumInfo) openAlbumView(stateData.albumInfo, false);
                break;
            case 'artist':
                if (stateData.artistName) openArtistView(stateData.artistName, false);
                break;
            case 'playlist':
                if (stateData.playlist) openPlaylistView(stateData.playlist, false);
                break;
            case 'settings': openSettings(false); break;
            case 'profile':
                renderProfilePanel();
                openProfile(false);
                break;
            case 'queue': showQueueOverlay(); break;
            case 'immersive': showImmersiveOverlay(); break;
        }
    }

    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.viewId) {
            renderState(e.state.viewId, e.state.stateData);
        } else {
            // Default to home if no state (e.g. first load)
            switchToHomeView(false);
        }
    });

    function switchToHomeView(push = true) {
        if (push) navigateTo('home');
        hideOverlays();
        albumView.classList.remove('active'); albumView.classList.add('hidden');
        searchView.classList.remove('active'); searchView.classList.add('hidden');
        artistView.classList.remove('active'); artistView.classList.add('hidden');
        if (playlistView) { playlistView.classList.remove('active'); playlistView.classList.add('hidden'); }

        homeView.classList.remove('hidden'); homeView.classList.add('active');
    }



    function switchToSearchView(push = true) {
        if (push) navigateTo('search', { query: searchInput.value || (mobileSearchInput ? mobileSearchInput.value : '') });
        hideOverlays();
        albumView.classList.remove('active'); albumView.classList.add('hidden');
        homeView.classList.remove('active'); homeView.classList.add('hidden');
        artistView.classList.remove('active'); artistView.classList.add('hidden');
        if (playlistView) { playlistView.classList.remove('active'); playlistView.classList.add('hidden'); }


        searchView.classList.remove('hidden'); searchView.classList.add('active');
    }

    function switchToAlbumView(push = true) {
        // Note: stateData for album is usually handled by openAlbumView
        if (push) navigateTo('album');
        hideOverlays();
        searchView.classList.remove('active'); searchView.classList.add('hidden');
        homeView.classList.remove('active'); homeView.classList.add('hidden');
        artistView.classList.remove('active'); artistView.classList.add('hidden');
        if (playlistView) { playlistView.classList.remove('active'); playlistView.classList.add('hidden'); }


        albumView.classList.remove('hidden'); albumView.classList.add('active');
    }

    function switchToArtistView(push = true) {
        if (push) navigateTo('artist');
        hideOverlays();
        searchView.classList.remove('active'); searchView.classList.add('hidden');
        homeView.classList.remove('active'); homeView.classList.add('hidden');
        albumView.classList.remove('active'); albumView.classList.add('hidden');
        if (playlistView) { playlistView.classList.remove('active'); playlistView.classList.add('hidden'); }

        artistView.classList.remove('hidden'); artistView.classList.add('active');
    }

    function switchToPlaylistView(push = true) {
        if (push) navigateTo('playlist');
        hideOverlays();
        searchView.classList.remove('active'); searchView.classList.add('hidden');
        homeView.classList.remove('active'); homeView.classList.add('hidden');
        albumView.classList.remove('active'); albumView.classList.add('hidden');
        artistView.classList.remove('active'); artistView.classList.add('hidden');

        playlistView.classList.remove('hidden'); playlistView.classList.add('active');
    }

    if (playlistBackBtn) {
        playlistBackBtn.addEventListener('click', () => history.back());
    }


    // Top Navigation
    navHomeBtn.addEventListener('click', () => {
        searchInput.value = '';
        switchToHomeView();
    });

    backBtn.addEventListener('click', () => {
        history.back();
    });

    artistBackBtn.addEventListener('click', () => {
        history.back();
    });

    artistPlayAllBtn.addEventListener('click', () => {
        const firstTrack = artistTrackList.querySelector('.track-item:not(.unsupported-track)');
        if (firstTrack) {
            firstTrack.click();
        }
    });

    // Mobile Bottom Nav Listeners
    if (mobileHomeBtn) {
        mobileHomeBtn.addEventListener('click', () => {
            searchInput.value = '';
            switchToHomeView();
        });
    }

    if (mobileSearchBtn) {
        mobileSearchBtn.addEventListener('click', () => {
            switchToSearchView();
        });
    }

    if (mobileSettingsBtn) {
        mobileSettingsBtn.addEventListener('click', () => {
            if (settingsView.classList.contains('active')) {
                closeSettings();
            } else {
                renderSettingsPanel();
                openSettings();
            }
        });
    }

    if (mobileQueueBtn) {
        mobileQueueBtn.addEventListener('click', () => {
            toggleQueueView();
        });
    }

    if (mobileProfileBtn) {
        mobileProfileBtn.addEventListener('click', () => {
            if (profileView.classList.contains('active')) {
                closeProfile();
            } else {
                renderProfilePanel();
                openProfile();
            }
        });
    }

    const profileCloseBtn = document.getElementById('profile-close-btn');
    if (profileCloseBtn) profileCloseBtn.addEventListener('click', closeProfile);

    // Update active states on view switches
    const mobileNavObserver = new MutationObserver(() => {
        if (profileView && profileView.classList.contains('active')) updateMobileNavActive(mobileProfileBtn);
        else if (settingsView && settingsView.classList.contains('active')) updateMobileNavActive(mobileSettingsBtn);
        else if (queueView && queueView.classList.contains('active')) updateMobileNavActive(mobileQueueBtn);
        else if (searchView && searchView.classList.contains('active')) updateMobileNavActive(mobileSearchBtn);
        else if (homeView && homeView.classList.contains('active')) updateMobileNavActive(mobileHomeBtn);
        else updateMobileNavActive(null);
    });

    [homeView, searchView, queueView, settingsView].forEach(view => {
        if (view) mobileNavObserver.observe(view, { attributes: true, attributeFilter: ['class'] });
    });

    // Global Search Logic with Debounce
    let searchDebounceTimer = null;
    function handleSearchInput(e) {
        const query = e.target.value.toLowerCase().trim();
        // Sync both inputs
        if (searchInput) searchInput.value = e.target.value;
        if (mobileSearchInput) mobileSearchInput.value = e.target.value;

        // Clear previous timer
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

        // Handle search commit on Enter (immediate)
        if (e.key === 'Enter' && query) {
            saveSearchQuery(query);
            renderSearchHistory();
        }

        // If on app view, don't auto-switch back to home when clearing search
        if (!query) {
            renderSearchResults(''); // clear all results
            renderSearchHistory(); // Show history when search is empty
            return;
        }

        // Debounce the actual rendering/querying
        searchDebounceTimer = setTimeout(() => {
            switchToSearchView();
            renderSearchResults(query);
        }, 500);
    }

    if (searchInput) {
        searchInput.addEventListener('input', handleSearchInput);
    }
    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', handleSearchInput);
    }

    function saveSearchQuery(query) {
        if (!query) return;
        try {
            let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
            history = history.filter(q => q.toLowerCase() !== query.toLowerCase());
            history.unshift(query);
            localStorage.setItem('searchHistory', JSON.stringify(history.slice(0, 15)));
        } catch (e) { }
    }

    function renderSearchHistory() {
        if (!searchHistorySection || !searchHistoryList) return;

        const query = searchInput.value || (mobileSearchInput ? mobileSearchInput.value : '');
        if (query) {
            searchHistorySection.classList.add('hidden');
            return;
        }

        let history = [];
        try {
            history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
        } catch (e) { }

        if (history.length === 0) {
            searchHistorySection.classList.add('hidden');
            return;
        }

        searchHistorySection.classList.remove('hidden');
        searchHistoryList.innerHTML = '';

        history.forEach(queryText => {
            const pill = document.createElement('div');
            pill.className = 'search-history-pill';
            pill.textContent = queryText;
            pill.addEventListener('click', () => {
                if (searchInput) searchInput.value = queryText;
                if (mobileSearchInput) mobileSearchInput.value = queryText;
                switchToSearchView();
                renderSearchResults(queryText);
            });
            searchHistoryList.appendChild(pill);
        });
    }

    if (clearSearchHistoryBtn) {
        clearSearchHistoryBtn.addEventListener('click', () => {
            localStorage.removeItem('searchHistory');
            renderSearchHistory();
        });
    }

    // Initialize history visibility
    renderSearchHistory();

    async function renderSearchResults(query) {
        // Collect unique artists that actually have albums/tracks
        const seenArtists = new Set();
        Object.values(albumsData).forEach(album => {
            if (album.artist && album.artist !== 'Unknown Artist') {
                seenArtists.add(album.artist);
            }
        });
        const matchingArtists = Array.from(seenArtists).filter(a => a.toLowerCase().includes(query));

        // Filter local/own playlists
        const matchingPlaylists = allPlaylists.filter(p => p.name.toLowerCase().includes(query));

        // Filter tracks
        const matchingTracks = allTracks.filter(track => {
            const title = ((track.metadata && track.metadata.title) || track.filename).toLowerCase();
            const artist = ((track.metadata && track.metadata.artist) || '').toLowerCase();
            const album = ((track.metadata && track.metadata.album) || '').toLowerCase();
            return title.includes(query) || artist.includes(query) || album.includes(query) || track.filename.toLowerCase().includes(query);
        });

        renderSearchArtists(matchingArtists.slice(0, 5));
        renderSearchPlaylists(matchingPlaylists);
        renderSearchTracks(matchingTracks.slice(0, 20));

        const hasResults = matchingArtists.length > 0 || matchingPlaylists.length > 0 || matchingTracks.length > 0;
        if (searchEmptyState) searchEmptyState.classList.toggle('hidden', hasResults);

        // Global Search for Community Playlists (Always available if Firestore is initialized)
        if (window._fbFS && query.length >= 2) {
            const lowerQuery = query.toLowerCase();
            console.log('[Search] Triggering Global Search for:', lowerQuery);
            try {
                const snapshot = await window._fbFS.collection('playlists')
                    .where('name_lowercase', '>=', lowerQuery)
                    .where('name_lowercase', '<=', lowerQuery + '\uf8ff')
                    .limit(15)
                    .get();
                
                console.log('[Search] Cloud snapshot size:', snapshot.size);
                const globalPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Filter out playlists already in your personal library
                const ownIds = new Set(allPlaylists.map(p => p.id));
                const uniqueGlobal = globalPlaylists.filter(p => !ownIds.has(p.id));
                console.log('[Search] Unique global results after filtering:', uniqueGlobal.length);
                
                if (uniqueGlobal.length > 0) {
                    appendGlobalSearchPlaylists(uniqueGlobal);
                    if (searchEmptyState) searchEmptyState.classList.add('hidden');
                }
            } catch (err) {
                console.error('[Search] Global playlist search failed:', err);
            }
        }
    }

    function appendGlobalSearchPlaylists(playlists) {
        if (!searchPlaylistList || !searchPlaylistsSection) return;
        
        // Remove any previous global results to prevent duplicates during typing
        const existingGlobals = searchPlaylistList.querySelectorAll('[data-global="true"]');
        existingGlobals.forEach(el => el.remove());

        // Ensure the section is visible if we have global results
        searchPlaylistsSection.classList.remove('hidden');
        
        // Add a separator or sub-title if needed, but for now just append
        playlists.forEach(pl => {
            const row = document.createElement('div');
            row.className = 'search-result-row';
            row.dataset.global = "true";
            
            let coverHtml = '';
            if (pl.customCover) {
                coverHtml = `<img src="${pl.customCover}" class="search-row-cover-img" alt="">`;
            } else {
                coverHtml = `<div class="search-row-cover-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg></div>`;
            }

            row.innerHTML = `
                <div class="search-row-cover">${coverHtml}</div>
                <div class="search-row-info">
                    <div class="search-row-name">${pl.name}</div>
                    <div class="search-row-type">Community Playlist &middot; ${pl.userName || 'Shared'} &middot; ${pl.tracks ? pl.tracks.length : 0} tracks</div>
                </div>
                <svg class="search-row-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            `;
            row.addEventListener('click', () => { searchInput.value = ''; switchToHomeView(); openPlaylistView(pl); });
            searchPlaylistList.appendChild(row);
        });
    }

    function renderSearchArtists(artists) {
        if (!searchArtistsSection || !searchArtistList) return;
        if (artists.length === 0) { searchArtistsSection.classList.add('hidden'); return; }
        searchArtistsSection.classList.remove('hidden');
        searchArtistList.innerHTML = '';

        artists.forEach(artistName => {
            const row = document.createElement('div');
            row.className = 'search-result-row';
            row.innerHTML = `
                <div class="artist-card-art search-row-avatar"></div>
                <div class="search-row-info">
                    <div class="search-row-name">${artistName}</div>
                    <div class="search-row-type">Artist</div>
                </div>
                <svg class="search-row-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            `;
            // Apply Deezer artist photo to the circular avatar
            fetchAndApplyArtistImage(artistName, row.querySelector('.search-row-avatar'), false);
            row.addEventListener('click', () => { searchInput.value = ''; switchToHomeView(); openArtistView(artistName); });
            searchArtistList.appendChild(row);
        });
    }

    function renderSearchPlaylists(playlists) {
        if (!searchPlaylistsSection || !searchPlaylistList) return;
        if (playlists.length === 0) { searchPlaylistsSection.classList.add('hidden'); return; }
        searchPlaylistsSection.classList.remove('hidden');
        searchPlaylistList.innerHTML = '';

        playlists.forEach(pl => {
            const row = document.createElement('div');
            row.className = 'search-result-row';
            
            let coverHtml = '';
            if (pl.customCover) {
                coverHtml = `<img src="${pl.customCover}" class="search-row-cover-img" alt="">`;
            } else {
                const coverTrack = pl.tracks ? pl.tracks.find(t => t.metadata && t.metadata.hasCover) : null;
                coverHtml = coverTrack
                    ? `<img src="${serverBaseUrl}/api/cover?path=${encodeURIComponent(coverTrack.relativePath)}" class="search-row-cover-img" alt="">`
                    : `<div class="search-row-cover-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg></div>`;
            }

            row.innerHTML = `
                <div class="search-row-cover">${coverHtml}</div>
                <div class="search-row-info">
                    <div class="search-row-name">${pl.name}</div>
                    <div class="search-row-type">Playlist &middot; ${pl.tracks ? pl.tracks.length : 0} track${(pl.tracks && pl.tracks.length !== 1) ? 's' : ''}</div>
                </div>
                <svg class="search-row-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            `;
            row.addEventListener('click', () => { searchInput.value = ''; switchToHomeView(); openPlaylistView(pl); });
            searchPlaylistList.appendChild(row);
        });
    }

    function renderSearchTracks(tracks) {
        if (!searchTracksSection || !searchTrackList) return;
        if (tracks.length === 0) { searchTracksSection.classList.add('hidden'); return; }
        searchTracksSection.classList.remove('hidden');
        renderTrackList(tracks, searchTrackList);
    }

    // ── Music Library Initialization ──────────────────

    function getLocalMusicPaths() {
        try { return JSON.parse(localStorage.getItem('localMusicPaths') || '[]'); } catch (e) { return []; }
    }

    function saveLocalMusicPaths(paths) {
        localStorage.setItem('localMusicPaths', JSON.stringify(paths));
    }

    async function rescanLocalSources() {
        const paths = getLocalMusicPaths();
        if (paths.length === 0) return;

        console.log('Starting global local source rescan...');
        for (const path of paths) {
            try {
                await fetch(`${serverBaseUrl}/api/scan-directory`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path })
                });
            } catch (e) {
                console.error(`Failed to rescan path: ${path}`, e);
            }
        }

        localStorage.setItem('lastScanTime', Date.now().toString());
        await initializeMusicLibrary();
    }

    function getTrackDedupeKey(track) {
        if (track.metadata && track.metadata.title && track.metadata.artist) {
            const title = track.metadata.title.toLowerCase().trim();
            const artist = track.metadata.artist.toLowerCase().trim();
            const album = (track.metadata.album || 'unknown').toLowerCase().trim();
            const duration = track.metadata.duration ? Math.round(track.metadata.duration) : 0;
            return `${title}|||${artist}|||${album}|||${duration}`;
        }
        return track.filename.toLowerCase().trim();
    }

    function deduplicateTracks(serverTracks, localTracks) {
        const finalMap = new Map();

        // Process server tracks: Mark as server-side and add to map (deduplicating by metadata)
        serverTracks.forEach(st => {
            st.isServer = true;
            const key = getTrackDedupeKey(st);
            finalMap.set(key, st);
        });

        // Process local tracks: Merge into existing server entries or add as new local entries
        localTracks.forEach(lt => {
            const key = getTrackDedupeKey(lt);
            if (finalMap.has(key)) {
                const existing = finalMap.get(key);
                existing.isLocal = true;
                existing.isBoth = true; // Flag for the purple indicator
                existing.localPath = lt.relativePath; // Ensure absolute path is used for playback
            } else {
                lt.isLocal = true;
                lt.isServer = false;
                finalMap.set(key, lt);
            }
        });

        return Array.from(finalMap.values());
    }

    async function scanLocalPath(dirPath) {
        try {
            const res = await fetch(`${serverBaseUrl}/api/scan-directory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: dirPath })
            });
            if (res.ok) return await res.json();
        } catch (e) { console.error('Local scan error for', dirPath, e); }
        return [];
    }

    async function initializeMusicLibrary() {
        // Any reload means track metadata may have changed — clear stale view cache entries
        _openVCDB().then(async (db) => {
            const manifest = await _vcGetManifest(db);
            const albumAndArtistKeys = Object.keys(manifest.entries).filter(k => k.startsWith('album:') || k.startsWith('artist:'));
            for (const key of albumAndArtistKeys) await _vcEvict(db, manifest, key);
            if (albumAndArtistKeys.length > 0) await _vcPut(db, { key: VC_MANIFEST, data: manifest });
        }).catch(() => {});

        try {
            const serverRes = await fetch(`${serverBaseUrl}/api/audio`);
            const serverTracks = serverRes.ok ? await serverRes.json() : [];

            const localPaths = getLocalMusicPaths();
            const localArrays = await Promise.all(localPaths.map(p => scanLocalPath(p)));
            const localTracks = localArrays.flat();

            const merged = deduplicateTracks(serverTracks, localTracks);

            if (merged.length === 0) {
                return;
            }
            allTracks = merged;
            processAlbums(merged);
        } catch (err) {
            console.error('Error loading music library:', err);
        }
    }
    // ───────────────────────────────────────────────────────────

    function processAlbums(tracks) {
        albumsData = {};

        tracks.forEach(track => {
            const albumName = (track.metadata && track.metadata.album) ? track.metadata.album : "Unknown Album";
            const artistName = (track.metadata && track.metadata.artist) ? track.metadata.artist : "Unknown Artist";
            const addedAt = track.addedAt || 0;

            if (!albumsData[albumName]) {
                albumsData[albumName] = {
                    name: albumName,
                    artist: artistName,
                    coverTrackPath: (track.metadata && track.metadata.hasCover) ? track.relativePath : null,
                    tracks: [],
                    addedAt: addedAt
                };
            } else if (addedAt > albumsData[albumName].addedAt) {
                albumsData[albumName].addedAt = addedAt;
            }
            albumsData[albumName].tracks.push(track);
        });

        renderHomeGrid();
    }

    const CARD_PLAY_BTN_HTML = `<button class="card-play-btn" title="Play">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    </button>`;

    function createAlbumCard(albumInfo) {
        const card = document.createElement('div');
        card.className = 'album-card';

        let artHtml = `<div class="album-card-art"></div>`;
        if (albumInfo.coverTrackPath) {
            const pictureUrl = `${serverBaseUrl}/api/cover?path=${encodeURIComponent(albumInfo.coverTrackPath)}`;
            artHtml = `<img src="${pictureUrl}" class="album-card-art" alt="Album Cover">`;
        }

        card.innerHTML = `
            <div class="card-art-wrapper">
                ${artHtml}
                ${CARD_PLAY_BTN_HTML}
            </div>
            <div class="album-card-title">${albumInfo.name}</div>
            <div class="album-card-artist artist-link">${albumInfo.artist}</div>
        `;

        card.querySelector('.card-play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const firstIdx = albumInfo.tracks.findIndex(t => !isTrackUnsupported(t));
            if (firstIdx === -1) return;
            currentPlaylistContext = albumInfo.tracks;
            if (isShuffleActive) unplayedIndices = albumInfo.tracks.map((_, i) => i);
            commitTrackChange(firstIdx);
        });

        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('artist-link') || e.target.classList.contains('album-card-artist')) {
                e.stopPropagation();
                openArtistView(albumInfo.artist);
                return;
            }
            openAlbumView(albumInfo);
        });

        return card;
    }

    function renderHomeGrid() {
        const recentList = document.getElementById('recent-album-list');
        recentList.innerHTML = '';

        const albumsArray = Object.values(albumsData);
        // Sort descending by when file was added to library
        albumsArray.sort((a, b) => b.addedAt - a.addedAt);

        // Take up to exactly 8 albums for the 'recently added' strip
        const recentAlbums = albumsArray.slice(0, 8);
        recentAlbums.forEach(albumInfo => {
            recentList.appendChild(createAlbumCard(albumInfo));
        });



        if (typeof renderRecentArtists === 'function') {
            renderRecentArtists();
        }
    }



    function formatHeroDuration(totalSeconds) {
        totalSeconds = Math.round(totalSeconds);
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        if (hrs > 0) return `${hrs} hr ${mins} min`;
        if (mins > 0) return `${mins} min ${secs} sec`;
        return `${secs} sec`;
    }

    // ── View Cache (IndexedDB, 15 MB budget, 12-hour TTL, LRU) ───────────────
    const VC_DB_NAME   = 'SimonRelaysViewCache';
    const VC_STORE     = 'views';
    const VC_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
    const VC_TTL       = 12 * 60 * 60 * 1000; // 12 hours
    const VC_MANIFEST  = '__manifest__';
    let _vcDb = null;

    function _openVCDB() {
        if (_vcDb) return Promise.resolve(_vcDb);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(VC_DB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(VC_STORE)) {
                    db.createObjectStore(VC_STORE, { keyPath: 'key' });
                }
            };
            req.onsuccess = (e) => { _vcDb = e.target.result; resolve(_vcDb); };
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    function _vcGet(db, key) {
        return new Promise((resolve) => {
            const req = db.transaction(VC_STORE, 'readonly').objectStore(VC_STORE).get(key);
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror   = () => resolve(null);
        });
    }

    function _vcPut(db, record) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(VC_STORE, 'readwrite');
            tx.objectStore(VC_STORE).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror    = (e) => reject(e.target.error);
        });
    }

    function _vcDelete(db, key) {
        return new Promise((resolve) => {
            const tx = db.transaction(VC_STORE, 'readwrite');
            tx.objectStore(VC_STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror    = () => resolve();
        });
    }

    async function _vcGetManifest(db) {
        const rec = await _vcGet(db, VC_MANIFEST);
        return rec ? rec.data : { totalBytes: 0, entries: {} };
    }

    async function _vcEvict(db, manifest, key) {
        await _vcDelete(db, key);
        if (manifest.entries[key]) {
            manifest.totalBytes = Math.max(0, manifest.totalBytes - manifest.entries[key].size);
            delete manifest.entries[key];
        }
    }

    async function setCachedView(cacheKey, data) {
        try {
            const db = await _openVCDB();
            const manifest = await _vcGetManifest(db);
            const byteSize = new Blob([JSON.stringify(data)]).size;
            const now = Date.now();

            // 1. Evict expired entries
            for (const key of Object.keys(manifest.entries)) {
                if (now - manifest.entries[key].lastAccessed > VC_TTL) {
                    await _vcEvict(db, manifest, key);
                }
            }

            // 2. Subtract old size if re-caching same key
            if (manifest.entries[cacheKey]) {
                manifest.totalBytes = Math.max(0, manifest.totalBytes - manifest.entries[cacheKey].size);
            }

            // 3. Evict oldest until we have room
            while (manifest.totalBytes + byteSize > VC_MAX_BYTES) {
                const oldest = Object.entries(manifest.entries)
                    .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)[0];
                if (!oldest) break;
                await _vcEvict(db, manifest, oldest[0]);
            }

            // 4. Write data and update manifest
            await _vcPut(db, { key: cacheKey, data });
            manifest.entries[cacheKey] = { size: byteSize, lastAccessed: now };
            manifest.totalBytes += byteSize;
            await _vcPut(db, { key: VC_MANIFEST, data: manifest });
        } catch (e) {
            console.warn('[ViewCache] setCachedView failed', e);
        }
    }

    async function getCachedView(cacheKey) {
        try {
            const db = await _openVCDB();
            const manifest = await _vcGetManifest(db);
            const entry = manifest.entries[cacheKey];
            if (!entry) return null;

            // Expired?
            if (Date.now() - entry.lastAccessed > VC_TTL) {
                await _vcEvict(db, manifest, cacheKey);
                await _vcPut(db, { key: VC_MANIFEST, data: manifest });
                return null;
            }

            const rec = await _vcGet(db, cacheKey);
            if (!rec) return null;

            // Touch (LRU update) — fire and forget
            entry.lastAccessed = Date.now();
            _vcPut(db, { key: VC_MANIFEST, data: manifest });

            return rec.data;
        } catch (e) {
            console.warn('[ViewCache] getCachedView failed', e);
            return null;
        }
    }

    async function invalidateCachedView(cacheKey) {
        try {
            const db = await _openVCDB();
            const manifest = await _vcGetManifest(db);
            if (manifest.entries[cacheKey]) {
                await _vcEvict(db, manifest, cacheKey);
                await _vcPut(db, { key: VC_MANIFEST, data: manifest });
            }
        } catch (e) {
            console.warn('[ViewCache] invalidateCachedView failed', e);
        }
    }
    // ─────────────────────────────────────────────────────────────────────────

    function openAlbumView(albumInfo, push = true) {
        if (push) navigateTo('album', { albumInfo });
        switchToAlbumView(false);

        let coverHtml = `<div class="album-hero-cover" style="background: linear-gradient(135deg, var(--gradient-1), var(--gradient-2));"></div>`;
        if (albumInfo.coverTrackPath) {
            const pictureUrl = `${serverBaseUrl}/api/cover?path=${encodeURIComponent(albumInfo.coverTrackPath)}`;
            coverHtml = `<img src="${pictureUrl}" class="album-hero-cover" alt="Album Cover">`;
            if (albumView) albumView.style.setProperty('--view-bg-image', `url("${pictureUrl}")`);
        } else {
            if (albumView) albumView.style.setProperty('--view-bg-image', 'none');
        }

        let earliestYear = 9999;
        let totalDuration = 0;

        albumInfo.tracks.forEach(t => {
            if (t.metadata) {
                if (t.metadata.year && t.metadata.year < earliestYear) earliestYear = t.metadata.year;
                if (t.metadata.duration) totalDuration += t.metadata.duration;
            }
        });

        const yearStr = earliestYear === 9999 ? 'Unknown Year' : earliestYear;
        const durationStr = totalDuration > 0 ? `, ${formatHeroDuration(totalDuration)}` : '';
        const songCountStr = `${albumInfo.tracks.length} song${albumInfo.tracks.length !== 1 ? 's' : ''}`;

        const isAlbumOffline = albumInfo.tracks.every(t => downloadedTracksMap.has(t.url));
        const isAlbumDownloading = albumInfo.tracks.some(t => pendingDownloads.has(t.url));

        albumHeroDiv.innerHTML = `
            ${coverHtml}
            <div class="album-hero-info">
                <div class="album-hero-label">Album</div>
                <div class="album-hero-title" title="${albumInfo.name}">${albumInfo.name}</div>
                <div class="album-hero-meta">
                    <div class="artist-avatar album-hero-artist-avatar" style="display: inline-block; vertical-align: middle;"></div>
                    <strong class="artist-link" style="cursor: pointer;">${albumInfo.artist}</strong> • ${yearStr} • ${songCountStr}${durationStr}
                </div>
                <div class="album-hero-actions">
        `;

        // Fetch and apply artist image for the hero avatar
        const albumAvatarNode = albumHeroDiv.querySelector('.album-hero-artist-avatar');
        if (albumAvatarNode && typeof fetchAndApplyArtistImage === 'function') {
            fetchAndApplyArtistImage(albumInfo.artist, albumAvatarNode, false);
        }

        // Add actions back
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'album-hero-actions';
        actionsDiv.innerHTML = `
                    <button class="icon-button play-btn album-play-btn" title="Play All" style="width: 56px; height: 56px; box-shadow: 0 8px 16px rgba(0,0,0,0.4);">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
                    </button>
                    <button class="secondary-action-btn download-album-btn ${isAlbumOffline ? 'active' : ''}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${isAlbumOffline ? '<polyline points="20 6 9 17 4 12"></polyline>' : '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>'}
                        </svg>
                        <span>${isAlbumOffline ? 'Downloaded' : (isAlbumDownloading ? 'Downloading...' : 'Download Album')}</span>
                    </button>
                    <button class="secondary-action-btn edit-album-btn" title="Edit Album Info">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span>Edit Info</span>
                    </button>
        `;
        albumHeroDiv.querySelector('.album-hero-info').appendChild(actionsDiv);

        const albumPlayBtn = albumHeroDiv.querySelector('.album-play-btn');

        if (albumPlayBtn) {
            albumPlayBtn.addEventListener('click', () => {
                const firstIdx = albumInfo.tracks.findIndex(t => !isTrackUnsupported(t));
                if (firstIdx === -1) return;
                currentPlaylistContext = albumInfo.tracks;
                if (isShuffleActive) unplayedIndices = albumInfo.tracks.map((_, i) => i);
                commitTrackChange(firstIdx);
            });
        }

        const downloadAlbumBtn = albumHeroDiv.querySelector('.download-album-btn');
        const editAlbumBtn = albumHeroDiv.querySelector('.edit-album-btn');

        if (editAlbumBtn) {
            editAlbumBtn.addEventListener('click', () => openEditAlbumModal(albumInfo));
        }

        if (downloadAlbumBtn && !isAlbumOffline && !isAlbumDownloading) {
            downloadAlbumBtn.addEventListener('click', () => downloadAlbum(albumInfo));
        }

        const heroArtistLink = albumHeroDiv.querySelector('.artist-link');
        if (heroArtistLink) {
            heroArtistLink.addEventListener('click', () => openArtistView(albumInfo.artist));
        }

        renderTrackList(albumInfo.tracks, trackListElement, false, null, true, true);

        // Write to view cache (fire-and-forget)
        setCachedView(`album:${albumInfo.name}`, albumInfo);
    }

    function getQualityLabel(track) {
        if (!track.metadata) return null;
        const m = track.metadata;
        if (m.lossless) {
            if (m.bitsPerSample > 16 || (m.sampleRate && m.sampleRate > 44100)) return 'Hi-Res';
            return 'Lossless';
        }
        if (m.bitrate && m.bitrate >= 256000) return 'HQ';
        return null;
    }

    // ── Track List Rendering ──────────────────────────────────────────────────
    function renderTrackList(tracks, container = trackListElement, isPlaylistView = false, playlistId = null, canEdit = true, showTrackNumbers = false) {
        container.innerHTML = '';

        tracks.forEach((track, index) => {
            const trackItem = document.createElement('div');
            trackItem.className = 'track-item';
            trackItem.dataset.url = track.url;
            const isUnsupported = isTrackUnsupported(track);

            if (isUnsupported) trackItem.classList.add('unsupported-track');
            if (globalPlayingTrack && globalPlayingTrack.url === track.url) trackItem.classList.add('active');

            const title = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
            const artist = (track.metadata && track.metadata.artist) ? track.metadata.artist : 'Unknown Artist';

            // Drag handle (playlist view only)
            const dragHandleHtml = (isPlaylistView && canEdit) ? `
                <div class="drag-handle" draggable="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4h2v2H9zm4 0h2v2h-2zm-4 7h2v2H9zm4 0h2v2h-2zm-4 7h2v2H9zm4 0h2v2h-2z"/></svg>
                </div>` : '';

            // Remove button (playlist view) vs Add-to-playlist button (other views)
            const actionBtnHtml = (isPlaylistView && canEdit) ? `
                <button class="remove-from-playlist-btn" title="Remove from playlist">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>` : `
                <button class="add-to-playlist-btn" title="Add to playlist">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>`;

            const isDownloaded = downloadedTracksMap.has(track.url);
            const downloadProgress = pendingDownloads.get(track.url);
            const isDownloading = downloadProgress !== undefined;
            const isUploading = pendingUploads.has(track.url);

            // 4-state indicator logic
            let indicatorClass = '';
            let indicatorTitle = '';
            if (track.isBoth) {
                indicatorClass = 'is-both';
                indicatorTitle = 'Local & Server';
            } else if (isDownloading) {
                indicatorClass = 'downloading';
                indicatorTitle = `Downloading... ${Math.round(downloadProgress * 100)}%`;
            } else if (isUploading) {
                indicatorClass = 'is-uploading';
                indicatorTitle = 'Uploading to Server...';
            } else if (track.isLocal) {
                indicatorClass = 'is-local';
                indicatorTitle = 'Local File (Click to Push to Server)';
            } else if (isDownloaded) {
                indicatorClass = 'downloaded';
                indicatorTitle = 'Available Offline (Click to remove)';
            } else {
                indicatorTitle = 'Download for Offline';
            }

            const offlineIconHtml = `
                <button class="icon-button offline-status-circle track-offline-btn ${indicatorClass}" 
                        style="--progress: ${isDownloading ? Math.round(downloadProgress * 100) : (isDownloaded || track.isLocal || track.isBoth ? 100 : 0)}%"
                        title="${indicatorTitle}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path class="check-path" d="M8 12.5l3 3 5-6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>`;

            let coverHtml = '';
            if (track.metadata && track.metadata.coverUrl) {
                coverHtml = `<div class="track-item-cover"><img src="${track.metadata.coverUrl}" crossorigin="anonymous" alt="cover"></div>`;
            } else if (track.metadata && track.metadata.hasCover) {
                const pictureUrl = `${serverBaseUrl}/api/cover?path=${encodeURIComponent(track.relativePath)}`;
                coverHtml = `<div class="track-item-cover"><img src="${pictureUrl}" alt="cover"></div>`;
            } else {
                coverHtml = `<div class="track-item-cover"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg></div>`;
            }

            let trackNumberHtml = '';
            if (showTrackNumbers) {
                const trackNo = (track.metadata && track.metadata.track && track.metadata.track.no) ? track.metadata.track.no : (index + 1);
                trackNumberHtml = `<div class="track-index">${trackNo}</div>`;
            }

            const qualityLabel = getQualityLabel(track);
            const qualityTagHtml = qualityLabel ? `<div class="quality-tag ${qualityLabel.toLowerCase().replace('-', '')}">${qualityLabel}</div>` : '';

            trackItem.innerHTML = `
                ${trackNumberHtml}
                ${dragHandleHtml}
                ${coverHtml}
                <div class="track-item-info">
                    <div class="track-item-title">${title}</div>
                    <div class="track-item-artist"><span class="artist-link" style="cursor: pointer;">${artist}</span></div>
                </div>
                <div class="track-item-actions">
                    ${isUnsupported ? `
                    <div class="unsupported-alert" title="the file format is not supported">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    </div>` : ''}
                    ${qualityTagHtml}
                    ${isUnsupported ? '' : offlineIconHtml}
                    ${actionBtnHtml}
                    <button class="icon-button track-item-more-btn" title="More">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
                    </button>
                </div>
            `;

            // Context Menu Handler
            const moreBtn = trackItem.querySelector('.track-item-more-btn');
            if (moreBtn) {
                moreBtn.addEventListener('click', (e) => showContextMenu(e, track, moreBtn, canEdit, playlistId, trackItem));
            }

            // Contextual Button Handler
            const statusBtn = trackItem.querySelector('.track-offline-btn');
            if (statusBtn) {
                statusBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (track.isBoth) {
                        console.log('Track is already synced.');
                    } else if (isDownloaded) {
                        if (confirm('Remove this track from offline storage?')) {
                            removeOfflineTrack(track.url);
                        }
                    } else if (track.isLocal) {
                        initiateUpload(track);
                    } else if (!isDownloading) {
                        initiateDownload(track);
                    }
                });
            }

            // Add-to-playlist button handler
            const addBtn = trackItem.querySelector('.add-to-playlist-btn');
            if (addBtn) {
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showAddToPlaylistDropdown(track, addBtn);
                });
            }

            // Remove from playlist handler
            const removeBtn = trackItem.querySelector('.remove-from-playlist-btn');
            if (removeBtn && playlistId) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeTrackFromPlaylist(playlistId, track.url, trackItem);
                });
            }

            // Drag-to-reorder handlers (playlist view only, if owner)
            if (isPlaylistView && canEdit) {
                trackItem.setAttribute('draggable', 'true');
                trackItem.dataset.index = index;
                trackItem.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index);
                    setTimeout(() => trackItem.classList.add('dragging'), 0);
                });
                trackItem.addEventListener('dragend', () => trackItem.classList.remove('dragging'));
                trackItem.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    container.querySelectorAll('.track-item').forEach(el => el.classList.remove('drag-over'));
                    trackItem.classList.add('drag-over');
                });
                trackItem.addEventListener('dragleave', () => trackItem.classList.remove('drag-over'));
                trackItem.addEventListener('drop', (e) => {
                    e.preventDefault();
                    trackItem.classList.remove('drag-over');
                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    const toIndex = index;
                    if (fromIndex === toIndex) return;
                    const pl = allPlaylists.find(p => p.id === activePlaylistId);
                    if (!pl) return;
                    const reordered = [...pl.tracks];
                    const [moved] = reordered.splice(fromIndex, 1);
                    reordered.splice(toIndex, 0, moved);
                    updatePlaylistTracks(activePlaylistId, reordered);
                });
            }

            trackItem.addEventListener('click', (e) => {
                if (e.target.closest('.artist-link')) {
                    e.stopPropagation();
                    openArtistView(artist);
                    return;
                }
                if (e.target.closest('.add-to-playlist-btn') || e.target.closest('.remove-from-playlist-btn') || e.target.closest('.drag-handle')) return;

                if (isUnsupported) {
                    showDependencyModal();
                    return;
                }

                // If clicking a track inside the user queue, it should play that track but clear the user queue up to that point.
                if (container === queueUserList) {
                    const clickedTrack = tracks[index];
                    userQueue = userQueue.slice(index + 1); // Remove the clicked track and everything before it
                    const title = (clickedTrack.metadata && clickedTrack.metadata.title) ? clickedTrack.metadata.title : clickedTrack.filename;
                    const artist = (clickedTrack.metadata && clickedTrack.metadata.artist) ? clickedTrack.metadata.artist : 'Unknown Artist';
                    playTrack(clickedTrack, title, artist);
                    renderQueueView();
                    return;
                }

                // If clicking a track in the "Next From Context" queue, it skips directly to that index in the main context
                if (container === queueContextList) {
                    const clickedTrackUrl = tracks[index].url;
                    const targetIndex = currentPlaylistContext.findIndex(t => t.url === clickedTrackUrl);
                    if (targetIndex !== -1) {
                        userQueue = []; // Clear user queue if skipping ahead in normal context
                        commitTrackChange(targetIndex);
                        renderQueueView();
                    }
                    return;
                }

                if (currentPlaylistContext !== tracks && container !== queueNowPlaying) {
                    currentPlaylistContext = tracks;
                    if (isShuffleActive) unplayedIndices = tracks.map((_, i) => i);
                }

                if (container !== queueNowPlaying) {
                    commitTrackChange(index);
                }
            });

            container.appendChild(trackItem);
        });
    }

    function openArtistView(artistName, push = true) {
        if (push) navigateTo('artist', { artistName });
        switchToArtistView(false);

        artistHeroName.textContent = artistName;

        // Find all albums by this artist from the pre-processed albumsData
        const artistAlbums = [];
        for (const [albumName, albumInfo] of Object.entries(albumsData)) {
            if (albumInfo.artist === artistName) {
                artistAlbums.push(albumInfo);
            }
        }

        // Collect all tracks from those albums — reliable source, no metadata variance issues
        const seenUrls = new Set();
        const artistTracks = [];
        artistAlbums.forEach(albumInfo => {
            albumInfo.tracks.forEach(track => {
                if (!seenUrls.has(track.url)) {
                    seenUrls.add(track.url);
                    artistTracks.push(track);
                }
            });
        });

        artistHeroMeta.textContent = `${artistTracks.length} track${artistTracks.length !== 1 ? 's' : ''}, ${artistAlbums.length} album${artistAlbums.length !== 1 ? 's' : ''}`;

        // Render Hero Image securely using caching async wrapper
        const heroAvatarNode = document.querySelector('.artist-hero-avatar');
        if (heroAvatarNode) {
            heroAvatarNode.innerHTML = ''; // reset for new artist
            if (typeof fetchAndApplyArtistImage === 'function') {
                fetchAndApplyArtistImage(artistName, heroAvatarNode, true);
            }
        }

        // Render tracks
        renderTrackList(artistTracks, artistTrackList);

        // Render albums
        artistAlbumGrid.innerHTML = '';
        artistAlbums.forEach(albumInfo => {
            const card = document.createElement('div');
            card.className = 'album-card';
            let coverHtml = `<div class="album-card-art"></div>`;
            if (albumInfo.coverTrackPath) {
                const pictureUrl = `${serverBaseUrl}/api/cover?path=${encodeURIComponent(albumInfo.coverTrackPath)}`;
                coverHtml = `<img src="${pictureUrl}" class="album-card-art" alt="Album Cover">`;
            }
            card.innerHTML = `
                <div class="card-art-wrapper">
                    ${coverHtml}
                    ${CARD_PLAY_BTN_HTML}
                </div>
                <div class="album-card-title">${albumInfo.name}</div>
                <div class="album-card-artist">${albumInfo.artist}</div>
            `;
            card.querySelector('.card-play-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const firstIdx = albumInfo.tracks.findIndex(t => !isTrackUnsupported(t));
                if (firstIdx === -1) return;
                currentPlaylistContext = albumInfo.tracks;
                if (isShuffleActive) unplayedIndices = albumInfo.tracks.map((_, i) => i);
                commitTrackChange(firstIdx);
            });
            card.addEventListener('click', () => openAlbumView(albumInfo));
            artistAlbumGrid.appendChild(card);
        });

        // Write to view cache (fire-and-forget)
        setCachedView(`artist:${artistName}`, { artistAlbums, artistTracks });
    }

    function parseLrc(lrcString) {
        const lines = lrcString.split('\n');
        const parsed = [];
        const timeRegEx = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

        lines.forEach(line => {
            const match = timeRegEx.exec(line);
            if (match) {
                const min = parseInt(match[1]);
                const sec = parseInt(match[2]);
                const ms = parseInt(match[3]);
                const timeInSeconds = min * 60 + sec + (ms / (match[3].length === 3 ? 1000 : 100));
                const text = line.replace(timeRegEx, '').trim();

                if (text) {
                    parsed.push({ time: timeInSeconds, text: text, element: null });
                } else {
                    parsed.push({ time: timeInSeconds, text: '♪', element: null });
                }
            }
        });

        return parsed;
    }

    async function fetchLyrics(title, artist, album, duration) {
        lyricsContainer.classList.remove('editor-mode');
        lyricsContainer.innerHTML = '<div class="lyrics-placeholder">Loading lyrics...</div>';
        if (immersiveLyricsContainer) {
            immersiveLyricsContainer.classList.remove('editor-mode');
            immersiveLyricsContainer.innerHTML = '<div class="lyrics-placeholder" style="color:rgba(255,255,255,0.7);">Loading lyrics...</div>';
        }
        lyricsData = [];
        currentLyricIndex = -1;
        plainLyricsCache = '';
        lyricsTrackUrl = globalPlayingTrack ? globalPlayingTrack.url : '';
        currentLyricsTitle = title;
        currentLyricsArtist = artist;
        currentLyricsAlbum = album || '';
        currentLyricsDuration = duration || 0;
        renderLyricsActionBar(false, false);

        // 1. Check localStorage for user-created lyrics first
        if (lyricsTrackUrl) {
            const saved = localStorage.getItem(`lrc_${lyricsTrackUrl}`);
            if (saved) {
                lyricsData = parseLrc(saved);
                renderLyrics();
                renderLyricsActionBar(true, true);
                return;
            }
        }

        // 2. Try lrclib.net
        let url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
        if (album) url += `&album_name=${encodeURIComponent(album)}`;
        if (duration) url += `&duration=${Math.round(duration)}`;

        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.syncedLyrics) {
                    lyricsData = parseLrc(data.syncedLyrics);
                    renderLyrics();
                    renderLyricsActionBar(true, false);
                } else {
                    plainLyricsCache = data.plainLyrics || '';
                    showLyricsNoSyncState();
                }
            } else {
                showLyricsNoSyncState();
            }
        } catch (err) {
            console.error('Lyrics fetch error', err);
            lyricsContainer.innerHTML = '<div class="lyrics-placeholder">Error loading lyrics.</div>';
        }
    }

    function renderLyrics() {
        lyricsContainer.innerHTML = '';

        lyricsData.forEach((line, index) => {
            const imEl = document.createElement('div');
            imEl.className = 'lyric-line';
            imEl.textContent = line.text;

            imEl.addEventListener('click', () => { audioPlayer.currentTime = line.time; });

            line.immersiveElement = imEl;

            lyricsContainer.appendChild(imEl);
        });
    }

    function updateLyricsSync() {
        if (!lyricsData.length || !audioPlayer.src) return;

        const currentTime = audioPlayer.currentTime;
        let newIndex = -1;

        for (let i = 0; i < lyricsData.length; i++) {
            if (currentTime >= lyricsData[i].time) {
                newIndex = i;
            } else {
                break;
            }
        }

        if (newIndex !== currentLyricIndex && newIndex !== -1) {
            currentLyricIndex = newIndex;

            lyricsData.forEach((line, idx) => {
                if (idx < currentLyricIndex) {
                    if (line.immersiveElement) line.immersiveElement.className = 'lyric-line past';
                } else if (idx === currentLyricIndex) {
                    if (line.immersiveElement) line.immersiveElement.className = 'lyric-line active';

                    if (immersiveView && immersiveView.classList.contains('active') && line.immersiveElement) {
                        const containerHalfHeight = lyricsContainer.clientHeight / 2;
                        const offsetTop = line.immersiveElement.offsetTop;
                        const itemHalfHeight = line.immersiveElement.clientHeight / 2;
                        lyricsContainer.scrollTo({
                            top: Math.max(0, offsetTop - containerHalfHeight + itemHalfHeight),
                            behavior: 'smooth'
                        });
                    }
                } else {
                    if (line.immersiveElement) line.immersiveElement.className = 'lyric-line';
                }
            });
        }
    }

    // ── Lyrics Creation / Sync System ─────────────────────────────────────────

    function showLyricsNoSyncState() {
        lyricsContainer.classList.add('editor-mode');
        lyricsContainer.innerHTML = `
            <div class="lyrics-no-sync">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;">
                    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
                <div class="lyrics-no-sync-title">No synced lyrics found</div>
                <div class="lyrics-no-sync-sub">${plainLyricsCache ? 'Plain lyrics were found online — sync them to the music.' : 'No lyrics found. Paste them below and tap to sync.'}</div>
                <button id="create-lyrics-btn" class="lyrics-create-btn">${plainLyricsCache ? '♩ Sync lyrics' : '♩ Create synced lyrics'}</button>
            </div>
        `;
        document.getElementById('create-lyrics-btn').addEventListener('click', () => showLyricsEditor(plainLyricsCache));
        renderLyricsActionBar(false, false);
    }

    function renderLyricsActionBar(hasLyrics = false, isCustom = false) {
        const bar = document.getElementById('lyrics-action-bar');
        if (!bar) return;
        bar.innerHTML = '';
        if (!lyricsTrackUrl) return;
        if (!hasLyrics) {
            if (lyricsData.length === 0) {
                // subtle create link in bar
            }
            return;
        }
        const editBtn = document.createElement('button');
        editBtn.className = 'lyrics-action-btn';
        editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Re-sync`;
        editBtn.addEventListener('click', () => {
            const plainText = lyricsData.map(l => l.text).join('\n');
            showLyricsEditor(plainText);
        });
        bar.appendChild(editBtn);
        if (isCustom) {
            const sep = document.createElement('span');
            sep.className = 'lyrics-action-sep';
            bar.appendChild(sep);
            const delBtn = document.createElement('button');
            delBtn.className = 'lyrics-action-btn lyrics-action-danger';
            delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg> Delete custom`;
            delBtn.addEventListener('click', () => {
                if (confirm('Delete your custom synced lyrics for this track?')) {
                    localStorage.removeItem(`lrc_${lyricsTrackUrl}`);
                    fetchLyrics(currentLyricsTitle, currentLyricsArtist, currentLyricsAlbum, currentLyricsDuration);
                }
            });
            bar.appendChild(delBtn);
        }
    }

    function showLyricsEditor(initialText = '') {
        lyricsContainer.classList.add('editor-mode');
        lyricsContainer.innerHTML = `
            <div class="lyrics-editor">
                <div class="lyrics-editor-title">Lyrics Editor</div>
                <div class="lyrics-editor-sub">One lyric line per text line. Blank lines are ignored. Click <strong>Start Syncing</strong> — the song restarts and you tap when each line begins.</div>
                <textarea id="lyrics-textarea" class="lyrics-textarea" placeholder="Paste lyrics here, one line per lyric line...">${initialText}</textarea>
                <div class="lyrics-editor-actions">
                    <button id="lyrics-start-sync-btn" class="lyrics-create-btn">▶&nbsp; Start Syncing</button>
                    <button id="lyrics-editor-cancel-btn" class="lyrics-ghost-btn">Cancel</button>
                </div>
            </div>
        `;
        document.getElementById('lyrics-editor-cancel-btn').addEventListener('click', () => {
            if (lyricsData.length > 0) { lyricsContainer.classList.remove('editor-mode'); renderLyrics(); }
            else showLyricsNoSyncState();
        });
        document.getElementById('lyrics-start-sync-btn').addEventListener('click', () => {
            const raw = document.getElementById('lyrics-textarea').value.trim();
            if (!raw) return;
            const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length === 0) return;
            startSyncSession(lines);
        });
    }

    function startSyncSession(lines) {
        syncLines = lines;
        syncTimestamps = [];
        syncCurrentLineIdx = 0;
        audioPlayer.currentTime = 0;
        audioPlayer.play().catch(() => { });
        lyricsContainer.classList.add('editor-mode');
        renderSyncSessionUI();
        if (syncKeyHandler) document.removeEventListener('keydown', syncKeyHandler);
        syncKeyHandler = (e) => {
            if (!immersiveView.classList.contains('active')) return;
            if (e.code === 'Space' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                tapSync();
            }
        };
        document.addEventListener('keydown', syncKeyHandler);
    }

    function renderSyncSessionUI() {
        const done = syncCurrentLineIdx;
        const total = syncLines.length;
        const current = syncLines[done] || null;
        const next = syncLines[done + 1] || null;
        const progressPct = total > 0 ? (done / total) * 100 : 0;

        lyricsContainer.innerHTML = `
            <div class="sync-session">
                <div class="sync-progress-wrap">
                    <div class="sync-progress-fill" style="width:${progressPct}%"></div>
                </div>
                <div class="sync-progress-text">Line <strong>${Math.min(done + 1, total)}</strong> of <strong>${total}</strong></div>
                <div class="sync-stage">
                    ${current
                ? `<div class="sync-current-line">${current}</div>
                           <div class="sync-next-line">${next ? 'Next: ' + next : '— last line —'}</div>`
                : `<div class="sync-current-line" style="color:var(--accent);">All lines synced!</div>`
            }
                </div>
                <button id="sync-tap-btn" class="sync-tap-btn" ${!current ? 'disabled' : ''}>
                    <span>TAP</span>
                    <kbd>Space</kbd>
                </button>
                <div class="sync-controls">
                    <button id="sync-undo-btn" class="lyrics-ghost-btn" ${done === 0 ? 'disabled' : ''}>↩ Undo</button>
                    <button id="sync-done-btn" class="lyrics-ghost-btn">✓ Save${done > 0 && done < total ? ' partial' : ''}</button>
                    <button id="sync-cancel-btn" class="lyrics-ghost-btn">✕ Cancel</button>
                </div>
                <div class="sync-hint">Tap the button or press <em>Space</em> the moment each line begins</div>
            </div>
        `;

        document.getElementById('sync-tap-btn').addEventListener('click', tapSync);
        document.getElementById('sync-undo-btn').addEventListener('click', () => {
            if (syncCurrentLineIdx === 0) return;
            syncCurrentLineIdx--;
            syncTimestamps.pop();
            const prevTime = syncTimestamps.length > 0 ? Math.max(0, syncTimestamps[syncTimestamps.length - 1] - 0.5) : 0;
            audioPlayer.currentTime = prevTime;
            renderSyncSessionUI();
        });
        document.getElementById('sync-done-btn').addEventListener('click', finishSyncSession);
        document.getElementById('sync-cancel-btn').addEventListener('click', () => {
            exitSyncSession();
            if (lyricsData.length > 0) { lyricsContainer.classList.remove('editor-mode'); renderLyrics(); }
            else showLyricsNoSyncState();
        });

        if (syncCurrentLineIdx >= syncLines.length) {
            setTimeout(finishSyncSession, 900);
        }
    }

    function tapSync() {
        if (syncCurrentLineIdx >= syncLines.length) return;
        syncTimestamps.push(audioPlayer.currentTime);
        syncCurrentLineIdx++;
        renderSyncSessionUI();
    }

    function exitSyncSession() {
        if (syncKeyHandler) {
            document.removeEventListener('keydown', syncKeyHandler);
            syncKeyHandler = null;
        }
        lyricsContainer.classList.remove('editor-mode');
    }

    function finishSyncSession() {
        exitSyncSession();
        if (syncTimestamps.length === 0) { showLyricsNoSyncState(); return; }
        const synced = syncTimestamps.map((time, i) => ({ time, text: syncLines[i] }));
        const lrcString = generateLrc(synced);
        if (lyricsTrackUrl) localStorage.setItem(`lrc_${lyricsTrackUrl}`, lrcString);
        lyricsData = synced;
        renderLyrics();
        renderLyricsActionBar(true, true);
    }

    function generateLrc(arr) {
        return arr.map(({ time, text }) => {
            const mins = Math.floor(time / 60);
            const secs = Math.floor(time % 60);
            const cs = Math.round((time % 1) * 100);
            return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}]${text}`;
        }).join('\n');
    }

    // ── Playlist System ───────────────────────────────────────────────────────

    async function fetchPlaylists() {
        // Small delay to ensure any recent writes (like new playlist creation) have propagated
        await new Promise(r => setTimeout(r, 500));

        if (currentUser && window._fbFS) {
            try {
                // Fetch ONLY current user's playlists for the Home screen
                const snapshot = await window._fbFS.collection('playlists')
                    .where('userId', '==', currentUser.uid)
                    .orderBy('createdAt', 'desc')
                    .get();
                allPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderPlaylistsStrip();
                return;
            } catch (e) {
                console.error('[Cloud] Failed to fetch playlists from Firebase', e);
            }
        }

        // Fallback to local server (Guests or if Firebase is offline)
        try {
            const res = await fetch(`${serverBaseUrl}/api/playlists`);
            if (res.ok) {
                allPlaylists = await res.json();
            }
        } catch (e) {
            console.error('Failed to fetch playlists from local server', e);
        } finally {
            renderPlaylistsStrip();
        }
    }

    async function createPlaylist(name) {
        if (currentUser && window._fbFS) {
            try {
                const docRef = await window._fbFS.collection('playlists').add({
                    name,
                    name_lowercase: name.toLowerCase(),
                    userId: currentUser.uid,
                    userName: currentUser.displayName || 'Anonymous',
                    userPhotoURL: currentUser.photoURL || null,
                    tracks: [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                const newPl = { id: docRef.id, name, tracks: [], userId: currentUser.uid, userName: currentUser.displayName };
                allPlaylists.unshift(newPl);
                renderPlaylistsStrip();
                return newPl;
            } catch (e) {
                console.error('[Cloud] Failed to create playlist in Firebase', e);
            }
        }

        // Fallback to local
        try {
            const res = await fetch(`${serverBaseUrl}/api/playlists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (res.ok) {
                const newPl = await res.json();
                allPlaylists.push(newPl);
                renderPlaylistsStrip();
                return newPl;
            }
        } catch (e) { console.error('Failed to create playlist locally', e); }
        return null;
    }

    async function deletePlaylist(id) {
        if (currentUser && window._fbFS) {
            try {
                await window._fbFS.collection('playlists').doc(id).delete();
                allPlaylists = allPlaylists.filter(p => p.id !== id);
                renderPlaylistsStrip();
                switchToHomeView();
                return;
            } catch (e) {
                console.error('[Cloud] Failed to delete playlist from Firebase', e);
            }
        }

        // Fallback to local
        try {
            await fetch(`${serverBaseUrl}/api/playlists/${id}`, { method: 'DELETE' });
            allPlaylists = allPlaylists.filter(p => p.id !== id);
            renderPlaylistsStrip();
            switchToHomeView();
        } catch (e) { console.error('Failed to delete playlist locally', e); }
    }

    async function renamePlaylist(id, name) {
        if (currentUser && window._fbFS) {
            try {
                await window._fbFS.collection('playlists').doc(id).update({ name });
                const idx = allPlaylists.findIndex(p => p.id === id);
                if (idx !== -1) allPlaylists[idx].name = name;
                renderPlaylistsStrip();
                return;
            } catch (e) {
                console.error('[Cloud] Failed to rename playlist in Firebase', e);
            }
        }

        // Fallback to local
        try {
            const res = await fetch(`${serverBaseUrl}/api/playlists/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (res.ok) {
                const updated = await res.json();
                const idx = allPlaylists.findIndex(p => p.id === id);
                if (idx !== -1) allPlaylists[idx] = updated;
                renderPlaylistsStrip();
            }
        } catch (e) { console.error('Failed to rename playlist locally', e); }
    }

    async function addTrackToPlaylist(playlistId, track) {
        const pl = allPlaylists.find(p => p.id === playlistId);
        if (!pl) return;
        if (pl.tracks.find(t => t.url === track.url)) return; // already in list
        const trackData = {
            url: track.url,
            relativePath: track.relativePath,
            filename: track.filename,
            metadata: track.metadata ? {
                title: track.metadata.title,
                artist: track.metadata.artist,
                album: track.metadata.album,
                duration: track.metadata.duration,
                hasCover: track.metadata.hasCover
            } : null
        };
        const newTracks = [...pl.tracks, trackData];
        await updatePlaylistTracks(playlistId, newTracks);
    }

    async function removeTrackFromPlaylist(playlistId, trackUrl, rowEl) {
        const pl = allPlaylists.find(p => p.id === playlistId);
        if (!pl) return;
        const newTracks = pl.tracks.filter(t => t.url !== trackUrl);
        await updatePlaylistTracks(playlistId, newTracks);
        if (rowEl) rowEl.remove();
    }

    async function updatePlaylistTracks(playlistId, tracks) {
        if (currentUser && window._fbFS) {
            try {
                await window._fbFS.collection('playlists').doc(playlistId).update({ tracks });
                const idx = allPlaylists.findIndex(p => p.id === playlistId);
                if (idx !== -1) {
                    allPlaylists[idx].tracks = tracks;
                    renderPlaylistsStrip();
                    // Re-render playlist view if it's currently active
                    if (playlistView && playlistView.classList.contains('active') && activePlaylistId === playlistId) {
                        openPlaylistView(allPlaylists[idx], false);
                    }
                }
                return;
            } catch (e) {
                console.error('[Cloud] Failed to update tracks in Firebase', e);
            }
        }

        // Fallback to local server
        try {
            const res = await fetch(`${serverBaseUrl}/api/playlists/${playlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tracks })
            });
            if (res.ok) {
                const updated = await res.json();
                const idx = allPlaylists.findIndex(p => p.id === playlistId);
                if (idx !== -1) allPlaylists[idx] = updated;
                renderPlaylistsStrip();
                // Re-render playlist view if it's currently active
                if (playlistView && playlistView.classList.contains('active') && activePlaylistId === playlistId) {
                    openPlaylistView(allPlaylists[idx], false);
                }
            }
        } catch (e) { console.error('Failed to update playlist tracks locally', e); }
    }

    async function updatePlaylistCover(playlistId, base64) {
        if (currentUser && window._fbFS) {
            try {
                await window._fbFS.collection('playlists').doc(playlistId).update({ customCover: base64 });
                const idx = allPlaylists.findIndex(p => p.id === playlistId);
                if (idx !== -1) {
                    allPlaylists[idx].customCover = base64;
                    renderPlaylistsStrip();
                    if (activePlaylistId === playlistId) {
                        openPlaylistView(allPlaylists[idx], false);
                    }
                }
            } catch (e) {
                console.error('[Cloud] Failed to update cover in Firebase', e);
            }
        }
    }

    // Build a 2×2 collage from first 4 cover-bearing tracks in the playlist
    function buildCollageHtml(playlist) {
        if (playlist.customCover) {
            return `<div class="playlist-collage custom-cover"><img src="${playlist.customCover}" alt="" style="width:100%; height:100%; object-fit:cover;"></div>`;
        }
        const coverTracks = playlist.tracks.filter(t => t.metadata && t.metadata.hasCover).slice(0, 4);
        let cells = '';
        for (let i = 0; i < 4; i++) {
            if (coverTracks[i]) {
                const url = `${serverBaseUrl}/api/cover?path=${encodeURIComponent(coverTracks[i].relativePath)}`;
                cells += `<img src="${url}" alt="">`;
            } else {
                cells += `<div class="playlist-collage-cell"><svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg></div>`;
            }
        }
        return `<div class="playlist-collage">${cells}</div>`;
    }

    function renderPlaylistsStrip() {
        if (!playlistStrip) return;
        playlistStrip.innerHTML = '';

        // New playlist button
        const newCard = document.createElement('div');
        newCard.className = 'new-playlist-card';
        newCard.innerHTML = `
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>New Playlist</span>
        `;
        newCard.addEventListener('click', () => openCreatePlaylistModal(null));
        playlistStrip.appendChild(newCard);

        if (allPlaylists.length === 0) {
            // Empty state — shown inline after the New Playlist card
            const emptyState = document.createElement('div');
            emptyState.className = 'playlists-empty-state';
            emptyState.innerHTML = `
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.35;">
                    <path d="M9 18V5l12-2v13"/>
                    <circle cx="6" cy="18" r="3"/>
                    <circle cx="18" cy="16" r="3"/>
                </svg>
                <div class="playlists-empty-title">No playlists yet</div>
                <div class="playlists-empty-sub">Click the card to create your first one</div>
            `;
            playlistStrip.appendChild(emptyState);
            return;
        }

        allPlaylists.forEach(pl => {
            const card = document.createElement('div');
            card.className = 'playlist-card';
            const isOwn = currentUser && pl.userId === currentUser.uid;
            
            card.innerHTML = `
                <div class="card-art-wrapper">
                    ${buildCollageHtml(pl)}
                    ${!isOwn ? '<div class="community-badge">Community</div>' : ''}
                    ${CARD_PLAY_BTN_HTML}
                </div>
                <div class="playlist-card-title" title="${pl.name}">${pl.name}</div>
                <div class="playlist-card-label">${pl.tracks.length} track${pl.tracks.length !== 1 ? 's' : ''}</div>
            `;
            card.querySelector('.card-play-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (pl.tracks.length === 0) return;
                const firstIdx = pl.tracks.findIndex(t => !isTrackUnsupported(t));
                if (firstIdx === -1) return;
                currentPlaylistContext = pl.tracks;
                if (isShuffleActive) unplayedIndices = pl.tracks.map((_, i) => i);
                commitTrackChange(firstIdx);
            });
            card.addEventListener('click', () => openPlaylistView(pl));
            playlistStrip.appendChild(card);
        });
    }

    function openPlaylistView(playlist, push = true) {
        if (push) navigateTo('playlist', { playlist });
        activePlaylistId = playlist.id;
        switchToPlaylistView(false);

        const isOwnPlaylist = currentUser && playlist.userId === currentUser.uid;

        // Background logic: Custom cover takes priority, then first track cover
        let bgUrl = 'none';
        if (playlist.customCover) {
            bgUrl = `url("${playlist.customCover}")`;
        } else {
            const firstCoverTrack = playlist.tracks.find(t => t.metadata && t.metadata.hasCover);
            if (firstCoverTrack) {
                const url = `${serverBaseUrl}/api/cover?path=${encodeURIComponent(firstCoverTrack.relativePath)}`;
                bgUrl = `url("${url}")`;
            }
        }
        if (playlistView) playlistView.style.setProperty('--view-bg-image', bgUrl);

        const totalDuration = playlist.tracks.reduce((sum, t) => sum + (t.metadata && t.metadata.duration ? t.metadata.duration : 0), 0);
        const durationStr = totalDuration > 0 ? ` · ${formatHeroDuration(Math.round(totalDuration))}` : '';
        const songCountStr = `${playlist.tracks.length} track${playlist.tracks.length !== 1 ? 's' : ''}`;

        // Match Album View Structure
        let coverHtml = '';
        const coverTooltip = isOwnPlaylist ? 'title="Change Cover"' : '';
        const overlayHtml = isOwnPlaylist ? `
            <div class="edit-cover-overlay">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            </div>
        ` : '';

        if (playlist.customCover) {
            coverHtml = `
                <div class="playlist-art-interactive album-hero-cover" ${coverTooltip}>
                    <img src="${playlist.customCover}" style="width:100%; height:100%; object-fit:cover;">
                    ${overlayHtml}
                    ${!isOwnPlaylist ? '<div class="community-badge">Community</div>' : ''}
                </div>
            `;
        } else {
            const collage = buildCollageHtml(playlist);
            coverHtml = `
                <div class="playlist-art-interactive album-hero-cover" ${coverTooltip}>
                    ${collage}
                    ${overlayHtml}
                    ${!isOwnPlaylist ? '<div class="community-badge">Community</div>' : ''}
                </div>
            `;
        }

        playlistHeroDiv.innerHTML = `
            ${coverHtml}
            <div class="album-hero-info">
                <div class="album-hero-label">Playlist</div>
                ${isOwnPlaylist ? 
                    `<input class="playlist-title-editable album-hero-title" value="${playlist.name}" spellcheck="false">` :
                    `<div class="album-hero-title">${playlist.name}</div>`
                }
                <div class="album-hero-meta">
                    ${(playlist.userPhotoURL || (isOwnPlaylist && currentUser.photoURL)) ? 
                        `<img class="artist-avatar" src="${playlist.userPhotoURL || currentUser.photoURL}" alt="">` :
                        `<img class="artist-avatar" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIwIDIxdi0yYTRgMCAwIDAtNC00SDhhNCg0IDAgMCAwLTQgNHYyIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSI3IiByPSI0Ii8+PC9zdmc+" alt="">`
                    }
                    <strong>${playlist.userName || (isOwnPlaylist ? (currentUser.displayName || 'You') : 'Shared')}</strong> · ${songCountStr}${durationStr}
                </div>
                <div class="album-hero-actions">
                    <button class="icon-button play-btn playlist-play-btn" title="Play All" style="width:56px;height:56px;box-shadow:0 8px 16px rgba(0,0,0,0.4);">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
                    </button>
                    ${isOwnPlaylist ? `
                        <button class="secondary-action-btn delete-playlist-btn">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Delete
                        </button>
                    ` : `
                        <button class="secondary-action-btn save-to-library-btn">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                            Save to Library
                        </button>
                    `}
                </div>
            </div>
        `;

        if (isOwnPlaylist) {
            // Handle cover change
            playlistHeroDiv.querySelector('.playlist-art-interactive').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const reader = new FileReader();
                    reader.onload = async (re) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            let width = img.width;
                            let height = img.height;
                            const maxSide = 800;
                            if (width > height) {
                                if (width > maxSide) { height *= maxSide / width; width = maxSide; }
                            } else {
                                if (height > maxSide) { width *= maxSide / height; height = maxSide; }
                            }
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);
                            const base64 = canvas.toDataURL('image/jpeg', 0.8);
                            updatePlaylistCover(playlist.id, base64);
                        };
                        img.src = re.target.result;
                    };
                    reader.readAsDataURL(file);
                };
                input.click();
            });
        }

        if (isOwnPlaylist) {
            // Inline rename
            const titleInput = playlistHeroDiv.querySelector('.playlist-title-editable');
            titleInput.addEventListener('blur', () => {
                const newName = titleInput.value.trim();
                if (newName && newName !== playlist.name) {
                    playlist.name = newName;
                    renamePlaylist(playlist.id, newName);
                }
            });
            titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') titleInput.blur(); });
        }

        // Play all
        playlistHeroDiv.querySelector('.playlist-play-btn').addEventListener('click', () => {
            if (!playlist.tracks || playlist.tracks.length === 0) return;
            currentPlaylistContext = playlist.tracks;
            if (isShuffleActive) unplayedIndices = playlist.tracks.map((_, i) => i);
            commitTrackChange(0);
        });

        if (isOwnPlaylist) {
            // Delete
            playlistHeroDiv.querySelector('.delete-playlist-btn').addEventListener('click', () => {
                if (confirm(`Delete "${playlist.name}"?`)) {
                    deletePlaylist(playlist.id);
                    switchToHomeView();
                }
            });
        } else {
            // Save to Library
            const saveBtn = playlistHeroDiv.querySelector('.save-to-library-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', async () => {
                    if (!currentUser) {
                        alert('Please sign in to save playlists.');
                        return;
                    }
                    saveBtn.disabled = true;
                    saveBtn.textContent = 'Saving...';
                    
                    try {
                        const newName = `${playlist.name} (Shared)`;
                        const newPl = await createPlaylist(newName);
                        if (newPl && playlist.tracks) {
                            await updatePlaylistTracks(newPl.id, playlist.tracks);
                            if (playlist.customCover) {
                                await updatePlaylistCover(newPl.id, playlist.customCover);
                            }
                        }
                        saveBtn.textContent = 'Saved to Library!';
                        setTimeout(() => {
                            saveBtn.disabled = false;
                            saveBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg> Save to Library`;
                        }, 2000);
                    } catch (e) {
                        console.error('Failed to clone playlist', e);
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Error saving';
                    }
                });
            }
        }

        renderTrackList(playlist.tracks, playlistTrackList, true, playlist.id, isOwnPlaylist);

        // Write to view cache (fire-and-forget)
        setCachedView(`playlist:${playlist.id}`, playlist);
    }

    // ── Add-to-playlist dropdown ──────────────────────────────────────────────
    function showAddToPlaylistDropdown(track, anchorEl) {
        addToPlaylistDropdown.innerHTML = '';

        // Add to Queue Option
        const queueItem = document.createElement('div');
        queueItem.className = 'dropdown-item';
        queueItem.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg> Add to Queue`;
        queueItem.addEventListener('click', () => {
            addToQueue(track);
            addToPlaylistDropdown.classList.add('hidden');
        });
        addToPlaylistDropdown.appendChild(queueItem);

        const queueDiv = document.createElement('div');
        queueDiv.className = 'dropdown-divider';
        addToPlaylistDropdown.appendChild(queueDiv);

        const ownPlaylists = allPlaylists.filter(pl => currentUser && pl.userId === currentUser.uid);
        
        ownPlaylists.forEach(pl => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg> ${pl.name}`;
            item.addEventListener('click', () => {
                addTrackToPlaylist(pl.id, track);
                addToPlaylistDropdown.classList.add('hidden');
            });
            addToPlaylistDropdown.appendChild(item);
        });

        if (ownPlaylists.length > 0) {
            const divider = document.createElement('div');
            divider.className = 'dropdown-divider';
            addToPlaylistDropdown.appendChild(divider);
        }

        const newItem = document.createElement('div');
        newItem.className = 'dropdown-item new-pl';
        newItem.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New Playlist`;
        newItem.addEventListener('click', () => {
            addToPlaylistDropdown.classList.add('hidden');
            openCreatePlaylistModal(track);
        });
        addToPlaylistDropdown.appendChild(newItem);

        // Position near button
        const rect = anchorEl.getBoundingClientRect();
        addToPlaylistDropdown.style.top = `${rect.bottom + 6}px`;
        addToPlaylistDropdown.style.left = `${Math.min(rect.left, window.innerWidth - 270)}px`;
        addToPlaylistDropdown.classList.remove('hidden');
    }

    document.addEventListener('click', (e) => {
        if (!addToPlaylistDropdown.contains(e.target) && !e.target.closest('.add-to-playlist-btn')) {
            addToPlaylistDropdown.classList.add('hidden');
        }
    });

    // ── Create Playlist Modal ─────────────────────────────────────────────────
    function openCreatePlaylistModal(trackToAddAfter) {
        pendingAddTrack = trackToAddAfter;
        playlistNameInput.value = '';
        createPlaylistModal.classList.remove('hidden');
        setTimeout(() => playlistNameInput.focus(), 50);
    }

    function closeCreatePlaylistModal() {
        createPlaylistModal.classList.add('hidden');
        pendingAddTrack = null;
    }

    createPlaylistCancelBtn.addEventListener('click', closeCreatePlaylistModal);

    createPlaylistConfirmBtn.addEventListener('click', async () => {
        const name = playlistNameInput.value.trim();
        if (!name) return;
        const trackToAdd = pendingAddTrack; // capture before modal close nulls it
        closeCreatePlaylistModal();
        const newPl = await createPlaylist(name);
        
        // Small delay to ensure Firestore propagation before we navigate/fetch
        await new Promise(r => setTimeout(r, 800));

        if (newPl) {
            if (trackToAdd) {
                await addTrackToPlaylist(newPl.id, trackToAdd);
            }
            // Navigate to the newly created playlist
            const pl = allPlaylists.find(p => p.id === newPl.id) || newPl;
            openPlaylistView(pl);
        }
    });

    playlistNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') createPlaylistConfirmBtn.click();
        if (e.key === 'Escape') closeCreatePlaylistModal();
    });

    createPlaylistModal.addEventListener('click', (e) => {
        if (e.target === createPlaylistModal) closeCreatePlaylistModal();
    });

    // ─────────────────────────────────────────────────────────────────────────

    function renderRecentArtists() {

        const recentArtistList = document.getElementById('recent-artist-list');
        if (!recentArtistList || !allTracks) return;

        let recentNames = [];
        try {
            recentNames = JSON.parse(localStorage.getItem('recentArtists') || '[]');
        } catch (e) { }

        // Form a fallback if list is empty
        if (recentNames.length === 0 && allTracks.length > 0) {
            const unique = new Set();
            allTracks.forEach(t => {
                const rawName = (t.metadata && t.metadata.artist) ? t.metadata.artist : 'Unknown Artist';
                const aName = rawName.includes(';') ? rawName.split(';')[0].trim() : rawName;
                if (aName !== 'Unknown Artist') unique.add(aName);
            });
            recentNames = Array.from(unique);
        }

        recentArtistList.innerHTML = '';

        if (recentNames.length === 0) {
            recentArtistList.innerHTML = '<div style="color:var(--text-secondary); padding: 20px;">Play some music to see artists here.</div>';
            return;
        }

        const top8 = recentNames.slice(0, 8);
        top8.forEach(artistName => {
            const card = document.createElement('div');
            card.className = 'artist-card';
            card.innerHTML = `
                <div class="artist-card-art"></div>
                <div class="artist-card-title" title="${artistName}">${artistName}</div>
                <div class="artist-card-label">Artist</div>
            `;
            card.addEventListener('click', () => openArtistView(artistName));
            recentArtistList.appendChild(card);

            if (typeof fetchAndApplyArtistImage === 'function') {
                fetchAndApplyArtistImage(artistName, card, false);
            }
        });
    }



    async function playTrack(track, title, artist) {
        if (window.electronAPI) {
            window.electronAPI.updatePresence({ title, artist, startTime: Date.now(), isPaused: false });
        }
        globalPlayingTrack = track;
        if (currentActiveBlobUrl) {
            URL.revokeObjectURL(currentActiveBlobUrl);
            currentActiveBlobUrl = null;
        }

        const localPath = downloadedTracksMap.get(track.url);
        let fullAudioUrl = `${serverBaseUrl}${track.url}`;

        if (localPath) {
            if (window.electronAPI) {
                fullAudioUrl = `simon-offline://${encodeURIComponent(localPath)}`;
            } else if (localPath === 'indexeddb') {
                // PWA: Play from IndexedDB
                try {
                    const saved = await getTrackFromIDB(track.url);
                    if (saved && saved.blob) {
                        currentActiveBlobUrl = URL.createObjectURL(saved.blob);
                        fullAudioUrl = currentActiveBlobUrl;
                        console.log('[PWA] Playing from offline storage:', track.url);
                    }
                } catch (e) {
                    console.error('[PWA] IDB playback failed', e);
                }
            }
        }

        // Update Bottom Offline Icon
        if (bottomOfflineBtn) {
            bottomOfflineBtn.classList.toggle('downloaded', !!localPath);
            bottomOfflineBtn.classList.toggle('is-local', !!track.isLocal && !track.isBoth);
            bottomOfflineBtn.classList.toggle('is-both', !!track.isBoth);

            if (track.isBoth) {
                bottomOfflineBtn.title = 'Local & Server Synced';
            } else if (track.isLocal) {
                bottomOfflineBtn.title = 'Local File';
            } else if (localPath) {
                bottomOfflineBtn.title = 'Available Offline';
            } else {
                bottomOfflineBtn.title = 'Remote Source';
            }
        }

        bottomTitle.textContent = title;
        bottomArtist.textContent = artist;

        // Save to Recent Artists History
        try {
            if (artist && artist !== 'Unknown Artist') {
                const cleanArtist = artist.includes(';') ? artist.split(';')[0].trim() : artist;
                let recent = JSON.parse(localStorage.getItem('recentArtists') || '[]');
                recent = recent.filter(a => a !== cleanArtist);
                recent.unshift(cleanArtist);
                localStorage.setItem('recentArtists', JSON.stringify(recent.slice(0, 50)));
                renderRecentArtists();
            }
        } catch (e) { }

        if (track.metadata && track.metadata.hasCover) {
            const pictureUrl = `${serverBaseUrl}/api/cover?path=${encodeURIComponent(track.relativePath)}`;
            bottomArtWrapper.innerHTML = `<img src="${pictureUrl}" alt="Album Art">`;
            if (immersiveBg) immersiveBg.src = pictureUrl;
            if (immersiveArt) {
                immersiveArt.src = pictureUrl;
                immersiveArt.style.display = 'block';
            }
            // Trigger dynamic color for mobile
            updatePlayerBarDynamicColor(pictureUrl);
        } else {
            bottomArtWrapper.innerHTML = ''; // reset to empty dark block styling
            if (immersiveBg) immersiveBg.src = '';
            if (immersiveArt) immersiveArt.style.display = 'none'; // hide art if none available

            // Reset color for mobile
            const playerBar = document.querySelector('.player-bar');
            if (playerBar) {
                playerBar.style.removeProperty('--player-dynamic-bg');
                playerBar.style.removeProperty('--player-dynamic-rgb');
            }
        }

        if (immersiveTitle) immersiveTitle.textContent = title;
        if (immersiveArtist) immersiveArtist.textContent = artist;

        const album = track.metadata && track.metadata.album ? track.metadata.album : '';
        const duration = track.metadata && track.metadata.duration ? track.metadata.duration : 0;
        fetchLyrics(title, artist, album, duration);

        updateMediaSession(track);

        audioPlayer.src = fullAudioUrl;
        audioPlayer.play().catch(e => console.error("Auto-play blocked/failed", e));
    }

    function updateMediaSession(track) {
        if (!('mediaSession' in navigator)) return;

        const title = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
        const artist = (track.metadata && track.metadata.artist) ? track.metadata.artist : 'Unknown Artist';
        const album = (track.metadata && track.metadata.album) ? track.metadata.album : '';
        const artwork = (track.metadata && track.metadata.hasCover)
            ? [{ src: `${serverBaseUrl}/api/cover?path=${encodeURIComponent(track.relativePath)}`, sizes: '512x512', type: 'image/jpeg' }]
            : [{ src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml' }];

        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: artist,
            album: album,
            artwork: artwork
        });

        // Register Action Handlers
        navigator.mediaSession.setActionHandler('play', () => {
            audioPlayer.play();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            audioPlayer.pause();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            playPreviousTrack();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            playNextTrack(false);
        });
    }

    // ── Offline Helper Logic ────────────────────────────────────────────────
    async function initiatePWADownload(track) {
        if (track.isLocal) return;
        const url = `${serverBaseUrl}${track.url}`;

        pendingDownloads.set(track.url, 0.01); // show start
        refreshCurrentView();

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');

            const blob = await response.blob();
            await saveTrackToIDB(track.url, blob, track.metadata);
            
            // Mark as offline in the local map
            downloadedTracksMap.set(track.url, 'indexeddb');
            console.log('[PWA] Track saved to IndexedDB:', track.url);
        } catch (e) {
            console.error('[PWA] Download failed', e);
            alert('Failed to download track for offline use.');
        } finally {
            pendingDownloads.delete(track.url);
            refreshCurrentView();
        }
    }

    async function initiateDownload(track) {
        if (track.isLocal) return;

        if (!window.electronAPI) {
            return initiatePWADownload(track);
        }

        const url = `${serverBaseUrl}${track.url}`;

        pendingDownloads.set(track.url, 0);
        refreshCurrentView(); // Show loading state

        try {
            const result = await window.electronAPI.downloadTrack({
                url,
                metadata: track.metadata
            });

            if (result.success) {
                // We need to re-sync or manually update the map with the predicted localPath
                // Better to just call syncOfflineState() to get the actual path from main
                await syncOfflineState();
            }
        } catch (e) {
            console.error('Download failed', e);
        } finally {
            pendingDownloads.delete(track.url);
            refreshCurrentView();
        }
    }

    async function initiateUpload(track) {
        if (!window.electronAPI || !track.isLocal || track.isBoth) return;

        pendingUploads.add(track.url);
        refreshCurrentView(); // Show uploading state (purple fill)

        try {
            const result = await window.electronAPI.uploadTrack({
                localPath: track.relativePath,
                serverUrl: serverBaseUrl,
                metadata: track.metadata
            });

            if (result.success) {
                console.log('Upload successful:', track.filename);
                // Trigger a full library re-sync to get the new 'isBoth' state
                await initializeMusicLibrary();

                // If the track we just uploaded is the one currently playing, update the bar immediately
                if (globalPlayingTrack && getTrackDedupeKey(globalPlayingTrack) === getTrackDedupeKey(track)) {
                    const updatedTrack = allTracks.find(t => getTrackDedupeKey(t) === getTrackDedupeKey(track));
                    if (updatedTrack) {
                        globalPlayingTrack = updatedTrack;
                        updateBottomPlayerBar(updatedTrack);
                    }
                }
            } else if (result.error === 'Duplicate track found') {
                alert(`Duplicate detected: This song is already on the server in the album "${result.album}".`);
            } else {
                alert(`Upload failed: ${result.error}`);
            }
        } catch (e) {
            console.error('Upload error:', e);
            alert(`Upload error: ${e.message}`);
        } finally {
            pendingUploads.delete(track.url);
            refreshCurrentView();
        }
    }

    async function removeOfflineTrack(trackPath) {
        if (!window.electronAPI) {
            await deleteTrackFromIDB(trackPath);
            downloadedTracksMap.delete(trackPath);
            refreshCurrentView();
            return;
        }
        const fullUrl = `${serverBaseUrl}${trackPath}`;
        const success = await window.electronAPI.deleteOfflineTrack(fullUrl);
        if (success) {
            downloadedTracksMap.delete(trackPath);
            refreshCurrentView();
        }
    }

    function refreshCurrentView() {
        // Re-render whatever view is active to update download icons
        const activeView = document.querySelector('.view.active');
        if (!activeView) return;

        if (activeView.id === 'album-view') {
            const albumName = albumHeroDiv.querySelector('.album-hero-title')?.textContent;
            if (albumName && albumsData[albumName]) {
                const album = albumsData[albumName];
                renderTrackList(album.tracks, trackListElement, false, null, true, true);
                updateAlbumHeroOfflineStatus(album);
            }
        } else if (activeView.id === 'artist-view') {
            // Difficult to refresh artist view perfectly without data stored globally
            // But usually we just refresh the track list if it's there
            if (artistTrackList) {
                // We'd need to re-collect the tracks. For now, let's just trigger a re-render
                // if we have a way to track the current artist.
            }
        } else if (activeView.id === 'playlist-view') {
            const pl = allPlaylists.find(p => p.id === activePlaylistId);
            if (pl) {
                const isOwn = currentUser && pl.userId === currentUser.uid;
                renderTrackList(pl.tracks, playlistTrackList, true, pl.id, isOwn);
            }
        } else if (activeView.id === 'search-view') {
            const query = searchInput.value || (mobileSearchInput ? mobileSearchInput.value : '');
            if (query) renderSearchResults(query);
        }

        // Update Global Player Bar offline status if something is playing
        if (globalPlayingTrack && bottomOfflineBtn) {
            const isOffline = downloadedTracksMap.has(globalPlayingTrack.url);
            const downloadProgress = pendingDownloads.get(globalPlayingTrack.url);

            if (isOffline) {
                bottomOfflineBtn.classList.add('downloaded');
                bottomOfflineBtn.classList.remove('downloading');
                bottomOfflineBtn.title = 'Available Offline';
                bottomOfflineBtn.style.setProperty('--progress', '100%');
            } else if (downloadProgress !== undefined) {
                bottomOfflineBtn.classList.remove('downloaded');
                bottomOfflineBtn.classList.add('downloading');
                bottomOfflineBtn.title = `Downloading... ${Math.round(downloadProgress * 100)}%`;
                bottomOfflineBtn.style.setProperty('--progress', `${downloadProgress * 100}%`);
            } else {
                bottomOfflineBtn.classList.remove('downloaded', 'downloading');
                bottomOfflineBtn.title = 'Remote Source';
                bottomOfflineBtn.style.setProperty('--progress', '0%');
            }
        }

        // Update track list offline icons in currently active containers
        const containers = [trackListElement, playlistTrackList, searchTrackList, artistTrackList];
        containers.forEach(container => {
            if (!container) return;
            container.querySelectorAll('.track-item').forEach(trackItem => {
                const url = trackItem.dataset.url;
                if (!url) return;

                const offlineBtn = trackItem.querySelector('.track-offline-btn');
                if (!offlineBtn) return;

                const isOffline = downloadedTracksMap.has(url);
                const progress = pendingDownloads.get(url);

                if (isOffline) {
                    offlineBtn.classList.add('downloaded');
                    offlineBtn.classList.remove('downloading');
                    offlineBtn.style.setProperty('--progress', '100%');
                    offlineBtn.title = 'Available Offline (Click to remove)';
                } else if (progress !== undefined) {
                    offlineBtn.classList.remove('downloaded');
                    offlineBtn.classList.add('downloading');
                    offlineBtn.style.setProperty('--progress', `${Math.round(progress * 100)}%`);
                    offlineBtn.title = `Downloading... ${Math.round(progress * 100)}%`;
                } else {
                    offlineBtn.classList.remove('downloaded', 'downloading');
                    offlineBtn.style.setProperty('--progress', '0%');
                    offlineBtn.title = 'Download for Offline';
                }
            });
        });
    }

    if (window.electronAPI) {
        window.electronAPI.onDownloadProgress(({ url, progress }) => {
            // url in progress event is the full URL, we need the track path /api/audio/...
            const trackPath = url.replace(serverBaseUrl, '');
            pendingDownloads.set(trackPath, progress);
            // Throttle UI refreshes? For now just refresh
            refreshCurrentView();
        });
    }

    // Initialize offline list on start
    async function syncOfflineState() {
        if (window.electronAPI) {
            const meta = await window.electronAPI.getDownloadedList();
            downloadedTracksMap.clear();
            for (const [fullUrl, info] of Object.entries(meta)) {
                const trackPath = fullUrl.replace(serverBaseUrl, '');
                downloadedTracksMap.set(trackPath, info.localPath);
            }
        } else {
            // PWA Fallback: Sync from IndexedDB
            try {
                const tracks = await getAllDownloadedFromIDB();
                downloadedTracksMap.clear();
                tracks.forEach(t => {
                    downloadedTracksMap.set(t.trackUrl, 'indexeddb');
                });
                console.log('[PWA] Offline state synced from IndexedDB:', downloadedTracksMap.size, 'tracks.');
            } catch (e) {
                console.error('[PWA] Failed to sync offline state from IndexedDB', e);
            }
        }
        refreshCurrentView();
    }

    function updateAlbumHeroOfflineStatus(album) {
        const downloadAlbumBtn = albumHeroDiv.querySelector('.download-album-btn');
        if (!downloadAlbumBtn) return;

        const isAlbumOffline = album.tracks.every(t => downloadedTracksMap.has(t.url));
        const isAlbumDownloading = album.tracks.some(t => pendingDownloads.has(t.url));

        if (isAlbumOffline) {
            downloadAlbumBtn.classList.add('active');
            downloadAlbumBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Downloaded</span>
            `;
        } else if (isAlbumDownloading) {
            downloadAlbumBtn.innerHTML = `<span>Downloading...</span>`;
        } else {
            downloadAlbumBtn.classList.remove('active');
            downloadAlbumBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Download Album</span>
            `;
        }
    }

    async function downloadAlbum(album) {
        if (!album || !album.tracks) return;

        // Download all tracks sequentially
        for (const track of album.tracks) {
            if (isTrackUnsupported(track)) continue;
            if (downloadedTracksMap.has(track.url)) continue;
            await initiateDownload(track);
        }
    }

    syncOfflineState();

    // Bottom Bar Click Navigation
    bottomArtist.addEventListener('click', () => {
        if (!globalPlayingTrack) return;
        const artistName = (globalPlayingTrack.metadata && globalPlayingTrack.metadata.artist) ? globalPlayingTrack.metadata.artist : "Unknown Artist";
        openArtistView(artistName);
    });

    bottomTitle.addEventListener('click', () => {
        if (!globalPlayingTrack) return;

        const albumName = (globalPlayingTrack.metadata && globalPlayingTrack.metadata.album) ? globalPlayingTrack.metadata.album : "Unknown Album";
        const albumInfo = albumsData[albumName];

        if (albumInfo) {
            openAlbumView(albumInfo);

            // Find index of the playing track inside the newly rendered album view
            const playingIndex = albumInfo.tracks.findIndex(t => t.url === globalPlayingTrack.url);

            if (playingIndex !== -1) {
                const container = document.getElementById('track-list');
                const trackItems = container.querySelectorAll('.track-item');
                if (trackItems[playingIndex]) {
                    const item = trackItems[playingIndex];

                    // Calculate relative scroll position to avoid bubbling up to body
                    const relativeTop = item.getBoundingClientRect().top - container.getBoundingClientRect().top;
                    const scrollPosition = container.scrollTop + relativeTop - (container.clientHeight / 2) + (item.clientHeight / 2);

                    container.scrollTo({
                        top: Math.max(0, scrollPosition),
                        behavior: 'smooth'
                    });
                }
            }
        }
    });

    // ── Initial State Restoration ───────────────────────────────────────────
    try {
        await Promise.all([
            fetchPlaylists(),
            initializeMusicLibrary()
        ]);

        // Auto-rescan check (24-hour interval)
        const lastScanTime = parseInt(localStorage.getItem('lastScanTime') || '0');
        const now = Date.now();
        if (lastScanTime > 0 && (now - lastScanTime > 24 * 60 * 60 * 1000)) {
            console.log('Last scan was over 24 hours ago. Triggering automatic rescan...');
            // We run it as a floating promise so it doesn't block startup
            rescanLocalSources().catch(e => console.error('Auto-rescan failed', e));
        }

        // Always start at landing page (Home)
        switchToHomeView(false);
    } catch (err) {
        console.error("Initialization failed:", err);
        switchToHomeView(false); // fallback
    }
});
