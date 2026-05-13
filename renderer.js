const DEFAULT_SERVER_URL = (window.location.protocol.startsWith('http') && window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.')) 
    ? window.location.origin 
    : 'http://localhost:3000';
const serverBaseUrl = API.getBaseUrl();

const deviceId = localStorage.getItem('deviceId') || crypto.randomUUID();
localStorage.setItem('deviceId', deviceId);

// Shared Global State (Phase 2 Modularization)
window.albumsData = {};
window.allTracks = [];
window.allPlaylists = [];
window.currentUser = null;

let albumCoverCache = new Map();

/**
 * Splits a raw artist string into individual artist names.
 * Handles common delimiters: ; , & feat. ft. Feat. Ft. featuring x (standalone)
 * Returns an array of trimmed, non-empty artist names.
 */
function splitArtists(raw) {
    if (!raw) return ['Unknown Artist'];
    // If raw is already an array, just return it (after trimming)
    if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(s => s.length > 0);

    const parts = String(raw).split(/\s*;\s*|\s*,\s*|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+|\s+&\s+|\s+x\s+/i);
    const cleaned = parts.map(s => s.trim()).filter(s => s.length > 0);
    return cleaned.length > 0 ? cleaned : ['Unknown Artist'];
}

function getSharedCoverUrl(relativePath, artist, album) {
    if (!relativePath) return null;
    const cleanArtist = artist || 'Unknown Artist';
    const cleanAlbum = album || 'Unknown Album';
    if (cleanArtist === 'Unknown Artist' && cleanAlbum === 'Unknown Album') {
        return API.getCoverUrl(relativePath);
    }
    const cacheKey = `${cleanArtist}|${cleanAlbum}`;
    if (albumCoverCache.has(cacheKey)) return albumCoverCache.get(cacheKey);
    const url = API.getCoverUrl(relativePath, cleanArtist, cleanAlbum);
    albumCoverCache.set(cacheKey, url);
    return url;
}

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


    // Global Player Bar Nodes
    const trackListElement = document.getElementById('track-list');


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
    let likedTracks = new Set();
    let allLikedTracksCache = [];
    let historyTracks = [];

    // ΓöÇΓöÇ Firebase Configuration ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
    // Fetch config from local backend (always use this in browser/PWA)
    try {
        firebaseConfig = await API.getFirebaseConfig();
        console.log('[Cloud] Firebase config fetched from server API.');
    } catch (e) {
        console.warn('[Cloud] Failed to fetch Firebase config from server API.', e);
    }

    try {
        if (firebaseConfig && firebaseConfig.apiKey) {
            firebase.initializeApp(firebaseConfig);
            window._fbAuth = firebase.auth();
            window._fbDB = firebase.database();
            window._fbFS = firebase.firestore();
            console.log('[Cloud] Firebase initialized via Secure Injection.');

            // ΓöÇΓöÇ Auth State Listener ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            window._fbAuth.onAuthStateChanged(user => {
                currentUser = user;
                window.currentUser = user;
                if (typeof Playlist !== 'undefined') Playlist.init({ currentUser });

                const likeTrackBtn = document.getElementById('like-track-btn');

                if (user) {
                    console.log('[Cloud] User logged in:', user.email);
                    if (loginOverlay) loginOverlay.classList.add('hidden');

                    if (likeTrackBtn) likeTrackBtn.style.display = '';

                    // Trigger fetch from Firebase
                    fetchPlaylists();
                    fetchLikes();
                    fetchHistory();

                    // Always update panels if they are currently visible
                    if (settingsView && settingsView.classList.contains('active')) renderSettingsPanel();
                    if (profileView && profileView.classList.contains('active')) renderProfilePanel();
                } else {
                    console.log('[Cloud] User logged out.');

                    if (likeTrackBtn) likeTrackBtn.style.display = 'none';

                    // Show login overlay if not skipped in session
                    if (loginOverlay && !sessionStorage.getItem('skipLogin')) {
                        loginOverlay.classList.remove('hidden');
                    }

                    // Clear playlists and likes on logout
                    allPlaylists = [];
                    likedTracks.clear();
                    allLikedTracksCache = [];
                    updateLikeButtonState();

                    Playlist.renderUserStrip();
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
    } catch (e) {
        console.error('[Cloud] Critical Firebase initialization error:', e);
    }

    // Mobile Bottom Nav Elements
    const mobileHomeBtn = document.getElementById('mobile-home-btn');
    const mobileSearchBtn = document.getElementById('mobile-search-btn');
    const mobileQueueBtn = document.getElementById('mobile-queue-btn');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileNavItems = [mobileHomeBtn, mobileSearchBtn, mobileQueueBtn, mobileMenuBtn];
    const mobileSearchInput = document.getElementById('mobile-search-input');

    // Metadata Edit Elements
    document.getElementById('check-progress-bar');

    // ΓöÇΓöÇ Auth Event Listeners ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
    let contextMenuTrack = null;
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

    function closeSidebar() {
        if (desktopSidebar) desktopSidebar.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        if (mobileMenuBtn) mobileMenuBtn.classList.remove('active');
    }

    // Window Controls (Disabled in Browser)
    const minBtn = document.getElementById('min-btn');
    const maxBtn = document.getElementById('max-btn');
    const closeBtn = document.getElementById('close-btn');
    if (minBtn) minBtn.style.display = 'none';
    if (maxBtn) maxBtn.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'none';


    allPlaylists = window.allPlaylists;
    let downloadedTracksMap = new Map(); // url -> localPath
    let pendingDownloads = new Map(); // url -> progress

    // ΓöÇΓöÇ Infinite Play State ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    let sessionHistory = [];   // up to 50 recently played URLs
    let sessionAffinity = { artists: {}, genres: {} };
    // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    let pendingUploads = new Set();  // url
    let currentActiveBlobUrl = null;
    let currentActiveCoverUrl = null;

    // ΓöÇΓöÇ IndexedDB Configuration (PWA Offline Support) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

    async function saveTrackToIDB(trackUrl, blob, metadata, coverBlob = null, lyrics = null) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['tracks'], 'readwrite');
            const store = transaction.objectStore('tracks');
            const request = store.put({ trackUrl, blob, metadata, coverBlob, lyrics, savedAt: Date.now() });
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

    // Up Next Badge (desktop immersive)
    const immersiveUpNext = document.getElementById('immersive-up-next');
    const immersiveUpNextArt = document.getElementById('immersive-up-next-art');
    const immersiveUpNextTitle = document.getElementById('immersive-up-next-title');
    const immersiveUpNextArtist = document.getElementById('immersive-up-next-artist');


    // ΓöÇΓöÇ Immersive UI logic ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    // ΓöÇΓöÇ Immersive UI logic ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    function toggleImmersiveView() {
        if (immersiveView.classList.contains('active')) {
            hideImmersiveOverlay();

            // Clean up the URL hash without triggering a 'back' event.
            // We return to 'home' to ensure the UI stays in a valid state.
            history.replaceState({ viewId: 'home', stateData: {} }, '', '#home');
            switchToHomeView(false);
        } else {
            // If we're entering immersive mode from an overlay (Settings, Profile, etc.),
            // replace the current history entry so that exiting immersive mode doesn't
            // re-open the overlay we just came from.
            const isOverlayActive = (settingsView && settingsView.classList.contains('active')) ||
                (profileView && profileView.classList.contains('active'));

            if (isOverlayActive) {
                history.replaceState({ viewId: 'immersive', stateData: {} }, '', '#immersive');
                renderState('immersive', {});
            } else {
                navigateTo('immersive');
            }
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

    const immersiveLikeBtn = document.getElementById('immersive-like-btn');
    if (immersiveLikeBtn) {
        immersiveLikeBtn.addEventListener('click', async () => {
            await toggleLike();
        });
    }

    const immersiveAddToPlaylistBtn = document.getElementById('immersive-add-to-playlist-btn');
    if (immersiveAddToPlaylistBtn) {
        immersiveAddToPlaylistBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (Playback.currentTrack) {
                showAddToPlaylistDropdown(Playback.currentTrack, immersiveAddToPlaylistBtn);
            }
        });
    }

    if (immersiveUpNext) {
        immersiveUpNext.addEventListener('click', (e) => {
            e.stopPropagation();
            Playback.next(); // Treat as a manual skip to the next track
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
        Lyrics.sync();

        // Populate Up Next badge
        updateImmersiveUpNext();
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

    // Auto-exit immersive if user exits fullscreen manually (e.g. Escape key)
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && immersiveView && immersiveView.classList.contains('active')) {
            // Only exit if the URL hash is still #immersive
            if (window.location.hash === '#immersive') {
                hideImmersiveOverlay();
                // Return to home state without triggering a 'back' event
                history.replaceState({ viewId: 'home', stateData: {} }, '', '#home');
                switchToHomeView(false);
            }
        }
    });

    // ΓöÇΓöÇ Up Next Badge ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    function updateImmersiveUpNext() {
        if (!immersiveUpNext || !immersiveView) return;

        // Centralized logic: user queue ΓåÆ shuffle queue ΓåÆ next in context ΓåÆ recommendation
        const upNext = Playback.upcomingTracks[0];

        if (!upNext) {
            immersiveUpNext.classList.add('hidden');
            immersiveView.classList.remove('has-up-next');
            return;
        }

        const title = (upNext.metadata && upNext.metadata.title) ? upNext.metadata.title : upNext.filename;
        const artist = (upNext.metadata && upNext.metadata.artist) ? upNext.metadata.artist : 'Unknown Artist';
        immersiveUpNextTitle.textContent = title;
        immersiveUpNextArtist.textContent = artist;

        if (upNext.metadata && upNext.metadata.hasCover && upNext.relativePath) {
            immersiveUpNextArt.src = getSharedCoverUrl(upNext.relativePath, upNext.metadata.artist, upNext.metadata.album);
            immersiveUpNextArt.style.display = 'block';
        } else {
            immersiveUpNextArt.style.display = 'none';
        }

        immersiveUpNext.classList.remove('hidden');
        immersiveView.classList.add('has-up-next');
    }
    // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ


    // ΓöÇΓöÇ Queue UI logic ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    function toggleQueueView() {
        if (queueView.classList.contains('active')) {
            hideQueueOverlay();
        } else {
            showQueueOverlay();
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
        Playback.clearQueue();
        renderQueueView();
    });

    function renderQueueView() {
        const currentTrack = Playback.currentTrack;
        if (!currentTrack) {
            queueNowPlaying.innerHTML = '<div class="search-empty-text" style="font-size:14px; opacity:0.5;">Nothing playing</div>';
            queueUserSection.style.display = 'none';
            queueContextList.innerHTML = '<div class="search-empty-text" style="font-size:14px; opacity:0.5;">No context</div>';
            return;
        }

        // Render Now Playing
        renderTrackList([currentTrack], queueNowPlaying);

        // Render User Queue
        const userQueue = Playback.queue;
        if (userQueue.length > 0) {
            queueUserSection.style.display = 'flex';
            renderTrackList(userQueue, queueUserList, false, null, true, false, true);
        } else {
            queueUserSection.style.display = 'none';
        }

        // Render Context Coming Up
        const upcoming = Playback.upcomingTracks;
        if (upcoming.length > 0) {
            renderTrackList(upcoming.slice(0, 50), queueContextList, false, null, true, false, true);
        } else {
            queueContextList.innerHTML = '<div class="search-empty-text" style="font-size:14px; opacity:0.5;">End of list</div>';
        }
    }

    function removeFromQueue(index, fromUserQueue) {
        Playback.removeFromQueue(index, fromUserQueue);

        _fillInfiniteBuffer();
        renderQueueView();
        updateImmersiveUpNext();
    }

    function addToQueue(track) {
        Playback.addToQueue(track);
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
    function openSettings(push = true, targetTab = 'all') {
        if (push) navigateTo('settings', { tab: targetTab });
        hideOverlays('settings'); // Close other overlays first
        renderSettingsPanel(targetTab);
        settingsView.classList.remove('hidden');
        settingsView.classList.add('active');
        if (settingsBtn) settingsBtn.classList.add('settings-btn-active');
    }

    function closeSettings() {
        settingsView.classList.remove('active');
        settingsView.classList.add('hidden');
        if (settingsBtn) settingsBtn.classList.remove('settings-btn-active');
    }

    function openProfile(push = true) {
        if (push) navigateTo('profile');
        hideOverlays();

        homeView.classList.remove('active'); homeView.classList.add('hidden');
        searchView.classList.remove('active'); searchView.classList.add('hidden');
        albumView.classList.remove('active'); albumView.classList.add('hidden');
        artistView.classList.remove('active'); artistView.classList.add('hidden');
        if (playlistView) { playlistView.classList.remove('active'); playlistView.classList.add('hidden'); }
        const glv = document.getElementById('likes-view'); if (glv) { glv.classList.remove('active'); glv.classList.add('hidden'); }
        const ghv = document.getElementById('history-view'); if (ghv) { ghv.classList.remove('active'); ghv.classList.add('hidden'); }
        const gdv = document.getElementById('downloads-view'); if (gdv) { gdv.classList.remove('active'); gdv.classList.add('hidden'); }
        const gsv = document.getElementById('stats-view'); if (gsv) { gsv.classList.remove('active'); gsv.classList.add('hidden'); }

        profileView.classList.remove('hidden');
        profileView.classList.add('active');
        renderProfilePanel();
    }

    function closeProfile() {
        switchToHomeView();
    }

    // ΓöÇΓöÇ Profile Panel Renderer ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    function renderProfilePanel() {
        if (!profileBody) return;

        profileBody.innerHTML = `
            <div class="settings-section" style="max-width: 800px;">
                <div class="settings-section-title" style="font-size: 20px; color: var(--accent); margin-bottom: 24px;">Account &amp; Sync</div>
                <div class="settings-row" style="cursor: default; background: rgba(255,255,255,0.03); padding: 32px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                    ${currentUser ? `
                        <div class="settings-profile-info" style="display: flex; align-items: center; gap: 24px; width: 100%;">
                            <div style="position: relative; width: 80px; height: 80px; flex-shrink: 0;">
                                <img src="${currentUser.photoURL || 'icon.svg'}" alt="" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 3px solid var(--accent); background: #1a1a20;">
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div class="settings-row-label" style="margin: 0 0 4px 0; font-size: 24px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentUser.displayName || 'User'}</div>
                                <div class="settings-row-sub" style="font-size: 16px; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentUser.email}</div>
                            </div>
                            <button id="profile-signout-btn" class="settings-reset-btn" style="padding: 12px 24px; font-weight: 600;">Sign Out</button>
                        </div>
                    ` : `
                        <div style="display: flex; flex-direction: column; gap: 16px; width: 100%;">
                            <div class="settings-row-sub" style="font-size: 15px;">Connect to Firebase to enable cross-device sync, cloud playlists, and remote control.</div>
                            <button id="profile-login-btn" class="settings-save-btn" style="align-self: flex-start; padding: 14px 28px;">Connect Cloud</button>
                        </div>
                    `}
                </div>
            </div>
            ${currentUser ? `
                <div class="settings-section" style="max-width: 800px; margin-top: 40px;">
                    <div class="settings-section-title" style="font-size: 20px; color: var(--accent); margin-bottom: 24px;">Edit Profile</div>
                    <div class="profile-edit-container" style="display: flex; flex-direction: column; gap: 32px; width: 100%; background: rgba(255,255,255,0.03); padding: 32px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; align-items: center; gap: 32px; width: 100%;">
                             <div class="profile-pic-editor" id="profile-pic-trigger" style="position: relative; width: 120px; height: 120px; cursor: pointer; flex-shrink: 0;">
                                <img id="profile-pic-preview" src="${currentUser.photoURL || 'icon.svg'}" alt="" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 4px solid var(--accent); background: #1a1a20;">
                                <div class="edit-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                </div>
                             </div>
                             <div style="flex: 1; min-width: 0;">
                                <div class="settings-row-label" style="margin-bottom: 12px; font-weight: 700;">Nickname</div>
                                <input id="profile-nickname-input" class="settings-text-input" type="text" value="${currentUser.displayName || ''}" placeholder="Choose a nickname..." style="width: 100%; margin: 0; padding: 14px 20px; font-size: 16px;">
                                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 12px; opacity: 0.5;">Email: ${currentUser.email}</div>
                             </div>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <div id="profile-status" style="font-size: 14px; font-weight: 500;"></div>
                            <button id="profile-save-btn" class="settings-save-btn" style="padding: 14px 32px; font-weight: 700;">Update Profile</button>
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

    // ΓöÇΓöÇ Metadata Editor Logic ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    function showContextMenu(e, track, sourceBtn, canEdit = true, playlistId = null, trackItem = null) {
        e.stopPropagation();
        contextMenuTrack = track;
        currentPlaylistId = playlistId;
        currentTrackItem = trackItem;

        const rect = sourceBtn.getBoundingClientRect();
        const scale = Theme.getZoomScale();
        trackContextMenu.style.top = `${(rect.bottom / scale) + 5}px`;
        trackContextMenu.style.left = `${(rect.right / scale) - 180}px`;

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
        if (contextMenuTrack) Metadata.openSongEditor(contextMenuTrack);
    });

    menuPlaylistBtn.addEventListener('click', (e) => {
        hideContextMenu();
        if (contextMenuTrack) showAddToPlaylistDropdown(contextMenuTrack, e.target);
    });

    menuRemovePlaylistBtn.addEventListener('click', () => {
        hideContextMenu();
        if (currentPlaylistId && contextMenuTrack && currentTrackItem) {
            removeTrackFromPlaylist(currentPlaylistId, contextMenuTrack.url, currentTrackItem);
        }
    });

    menuGoArtistBtn.addEventListener('click', () => {
        hideContextMenu();
        if (contextMenuTrack) {
            const artistName = (contextMenuTrack.metadata && contextMenuTrack.metadata.artist) ? contextMenuTrack.metadata.artist : 'Unknown Artist';
            const primaryArtist = splitArtists(artistName)[0];
            openArtistView(primaryArtist);
        }
    });

    menuGoAlbumBtn.addEventListener('click', () => {
        hideContextMenu();
        if (contextMenuTrack) {
            const albumName = (contextMenuTrack.metadata && contextMenuTrack.metadata.album) ? contextMenuTrack.metadata.album : 'Unknown Album';
            const albumInfo = Object.values(albumsData).find(a => a.name === albumName);
            if (albumInfo) {
                openAlbumView(albumInfo);
            } else {
                // Fallback: search for tracks with this album name if not in albumsData
                console.warn('Album info not found in albumsData, falling back to manual search');
            }
        }
    });



    // ΓöÇΓöÇ Settings Panel Renderer ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    function renderSettingsPanel(activeTab = null) {
        const body = settingsView.querySelector('.settings-body');
        const header = settingsView.querySelector('.settings-header');
        if (!body || !header) return;

        const currentCustomUrl = localStorage.getItem('serverUrl') || '';

        // Reset search and tabs on open if needed, or keep last state
        const searchInput = header.querySelector('#settings-search-input');
        const tabs = header.querySelectorAll('.settings-tab');
        
        // If a targetTab is passed, activate it
        if (activeTab) {
            tabs.forEach(t => {
                t.classList.toggle('active', t.dataset.tab === activeTab);
            });
            if (searchInput) searchInput.value = ''; // Clear search when switching specifically to a tab
        }

        let currentTab = header.querySelector('.settings-tab.active')?.dataset.tab || 'all';
        let searchQuery = searchInput?.value.toLowerCase() || '';

        body.innerHTML = `
            <div class="settings-section" data-category="appearance">
                <div class="settings-section-title">Themes</div>
                <div class="settings-themes-grid">
                    <!-- Simon Default Card -->
                    <div class="theme-card ${Theme.getProfile() === 'simon_default' ? 'active' : ''}" data-theme="simon_default">
                        <div class="theme-preview" style="background: #f43f5e;">
                            <span>Classic</span>
                        </div>
                        <div class="theme-info">
                            <h4>Simon Default</h4>
                            <p>The signature aesthetic with fixed rose-red accents.</p>
                        </div>
                    </div>
                    <!-- RGB Card -->
                    <div class="theme-card ${Theme.getProfile() === 'rgb' ? 'active' : ''}" data-theme="rgb">
                        <div class="theme-preview" style="background: linear-gradient(45deg, #ff0000, #00ff00, #0000ff);">
                            <span>RGB</span>
                        </div>
                        <div class="theme-info">
                            <h4>Dynamic Engine</h4>
                            <p>Reactive lighting that shifts with your music.</p>
                        </div>
                    </div>
                    <!-- Custom Card -->
                    <div class="theme-card ${Theme.getProfile() === 'custom' ? 'active' : ''}" data-theme="custom">
                        <div class="theme-preview custom-preview" style="background: ${localStorage.getItem('customAccentColor') || '#f43f5e'}; position: relative;">
                            <span>Custom</span>
                            <input type="color" id="custom-theme-picker" value="${localStorage.getItem('customAccentColor') || '#f43f5e'}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                        </div>
                        <div class="theme-info">
                            <h4>Personalized</h4>
                            <p>Manually select your favorite accent color.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="settings-section" data-category="appearance">
                <div class="settings-section-title">Interface</div>
                <div class="settings-row">
                    <div class="settings-row-info">
                        <div class="settings-row-label">UI Scaling</div>
                        <div class="settings-row-sub">Adjust the size of the interface. Current: <span id="setting-zoom-value" style="color:var(--accent); font-weight:600;">${localStorage.getItem('zoomLevel') || '100'}%</span></div>
                    </div>
                    <div class="settings-input-group zoom-slider-group">
                        <span class="zoom-min-label">50%</span>
                        <input id="setting-zoom-slider" type="range" min="50" max="150" step="5" value="${localStorage.getItem('zoomLevel') || '100'}" class="settings-range-input">
                        <span class="zoom-max-label">150%</span>
                    </div>
                </div>
            </div>

            <div class="settings-section" data-category="audio">
                <div class="settings-section-title">Audio Quality</div>
                <div class="settings-row" style="flex-direction: row; flex-wrap: wrap; gap: 24px;">
                    <div style="flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 12px;">
                        <div class="settings-row-info">
                            <div class="settings-row-label">Stream Quality</div>
                            <div class="settings-row-sub">Used when playing over the network.</div>
                        </div>
                        <div class="settings-input-group">
                            <div style="position: relative;">
                                <input type="text" id="setting-stream-quality" class="settings-text-input" readonly style="width: 100%; cursor: pointer; background-color: #1a1a20; color: white;">
                                <div id="setting-stream-quality-dropdown" style="position: absolute; top: 100%; left: 0; right: 0; background: #1a1a20; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; margin-top: 4px; max-height: 200px; overflow-y: auto; z-index: 1000; display: none; box-shadow: 0 4px 12px rgba(0,0,0,0.5);"></div>
                            </div>
                        </div>
                    </div>
                    <div style="flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 12px;">
                        <div class="settings-row-info">
                            <div class="settings-row-label">Download Quality</div>
                            <div class="settings-row-sub">Used when saving for offline play.</div>
                        </div>
                        <div class="settings-input-group">
                            <div style="position: relative;">
                                <input type="text" id="setting-download-quality" class="settings-text-input" readonly style="width: 100%; cursor: pointer; background-color: #1a1a20; color: white;">
                                <div id="setting-download-quality-dropdown" style="position: absolute; top: 100%; left: 0; right: 0; background: #1a1a20; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; margin-top: 4px; max-height: 200px; overflow-y: auto; z-index: 1000; display: none; box-shadow: 0 4px 12px rgba(0,0,0,0.5);"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="settings-section" data-category="network">
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


            <div class="settings-section" data-category="cloud">
                <div class="settings-section-title">Cloud Library</div>
                <div class="settings-row">
                    <div class="settings-row-info">
                        <div class="settings-row-label">Upload to Server</div>
                        <div class="settings-row-sub">Upload local MP3 files to your server so they are available on all your devices.</div>
                    </div>
                    <div class="settings-input-group">
                        <input type="file" id="cloud-upload-input" multiple accept="audio/*" style="display: none;">
                        <button id="cloud-upload-btn" class="settings-save-btn">Select Files</button>
                    </div>
                    <div id="cloud-upload-status" class="local-path-status"></div>
                </div>
            </div>

            <div class="settings-section" data-category="audio">
                <div class="settings-section-title">Playback</div>
                <div class="settings-row" style="flex-direction: row; justify-content: space-between; align-items: center;">
                    <div class="settings-row-info">
                        <div class="settings-row-label">Enable Crossfade</div>
                        <div class="settings-row-sub">Overlap songs for a seamless gapless transition.</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="setting-crossfade-toggle" ${Playback.isCrossfadeEnabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div id="crossfade-duration-row" class="settings-row" style="${Playback.isCrossfadeEnabled ? '' : 'opacity: 0.5; pointer-events: none;'}">
                    <div class="settings-row-info">
                        <div class="settings-row-label">Crossfade Duration</div>
                        <div class="settings-row-sub">Overlap time. Current: <span id="setting-crossfade-value" style="color:var(--accent); font-weight:600;">${Playback.crossfadeDuration / 1000}s</span></div>
                    </div>
                    <div class="settings-input-group zoom-slider-group">
                        <span class="zoom-min-label">0s</span>
                        <input id="setting-crossfade-duration" type="range" min="0" max="12" step="1" value="${Playback.crossfadeDuration / 1000}" class="settings-range-input">
                        <span class="zoom-max-label">12s</span>
                    </div>
                </div>
            </div>

            <div class="settings-section" data-category="account">
                <div class="settings-section-title">Account</div>
                <div class="settings-row">
                    <div class="settings-profile-info" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <div class="settings-row-info">
                            <div class="settings-row-label">Current Session</div>
                            <div class="settings-row-sub">You are currently using the local library.</div>
                        </div>
                        <button id="signout-btn" class="settings-reset-btn">Sign Out</button>
                    </div>
                </div>
            </div>

            <div id="settings-no-results" style="display: none; text-align: center; padding: 40px; color: var(--text-secondary);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px; opacity: 0.2;">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <div style="font-weight: 700; color: white; margin-bottom: 4px;">No settings found</div>
                <div style="font-size: 13px;">Try a different search term</div>
            </div>
        `;

        // Theme Handlers
        const themeCards = body.querySelectorAll('.theme-card');
        themeCards.forEach(card => {
            card.addEventListener('click', (e) => {
                // If clicked the picker input directly, let it happen
                if (e.target.id === 'custom-theme-picker') return;

                const themeId = card.dataset.theme;
                Theme.setProfile(themeId);
                
                // Update UI state
                themeCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');

                // If Custom, trigger picker
                if (themeId === 'custom') {
                    const picker = card.querySelector('#custom-theme-picker');
                    if (picker) picker.showPicker ? picker.showPicker() : picker.click();
                }

                // If RGB, trigger visual update
                if (themeId === 'rgb' && Playback.currentTrack) {
                    Theme.updateNowPlayingVisuals(Playback.currentTrack, currentActiveCoverUrl);
                }
            });
        });

        const customPicker = body.querySelector('#custom-theme-picker');
        const customPreview = body.querySelector('.custom-preview');
        if (customPicker) {
            customPicker.addEventListener('input', (e) => {
                const color = e.target.value;
                Theme.applyCustomColor(color);
                if (customPreview) customPreview.style.background = color;
            });
            // Also update on change to ensure final value is set
            customPicker.addEventListener('change', (e) => {
                Theme.applyCustomColor(e.target.value);
            });
        }

        // Appearance Handlers
        const zoomSlider = document.getElementById('setting-zoom-slider');
        const zoomValue = document.getElementById('setting-zoom-value');
        if (zoomSlider && zoomValue) {
            zoomSlider.addEventListener('input', (e) => {
                const val = e.target.value;
                zoomValue.textContent = val + '%';
                Theme.setZoom(val);
                
                // Debounced grid refresh
                setTimeout(() => {
                    if (typeof renderHomeGrid === 'function') renderHomeGrid();
                }, 100);
            });
        }
        const qualityOptions = [
            { value: 'original', label: 'Original' },
            { value: '320', label: '320kbps' },
            { value: '192', label: '192kbps' },
            { value: '128', label: '128kbps' }
        ];

        // Playback section handlers
        const crossfadeToggle = document.getElementById('setting-crossfade-toggle');
        const crossfadeRow = document.getElementById('crossfade-duration-row');
        const crossfadeSlider = document.getElementById('setting-crossfade-duration');
        const crossfadeValue = document.getElementById('setting-crossfade-value');

        if (crossfadeToggle) {
            crossfadeToggle.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                Playback.toggleCrossfade(enabled);
                if (crossfadeRow) {
                    crossfadeRow.style.opacity = enabled ? '1' : '0.5';
                    crossfadeRow.style.pointerEvents = enabled ? 'auto' : 'none';
                }
            });
        }

        if (crossfadeSlider && crossfadeValue) {
            crossfadeSlider.addEventListener('input', (e) => {
                const secs = parseInt(e.target.value);
                Playback.setCrossfadeDuration(secs * 1000);
                crossfadeValue.textContent = secs + 's';
            });
        }

        function setupCustomSelect(inputId, dropdownId, storageKey) {
            const input = document.getElementById(inputId);
            const dropdown = document.getElementById(dropdownId);
            if (!input || !dropdown) return;

            const updateInputVal = (val) => {
                const opt = qualityOptions.find(o => o.value === val);
                input.value = opt ? opt.label : 'Original';
                input.dataset.value = val;
            };

            const currentVal = localStorage.getItem(storageKey) || 'original';
            updateInputVal(currentVal);

            qualityOptions.forEach(opt => {
                const div = document.createElement('div');
                div.textContent = opt.label;
                div.style.padding = '10px 16px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                div.style.fontSize = '14px';
                div.addEventListener('mouseenter', () => div.style.background = 'rgba(255,255,255,0.05)');
                div.addEventListener('mouseleave', () => div.style.background = 'transparent');
                div.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    updateInputVal(opt.value);
                    localStorage.setItem(storageKey, opt.value);
                    dropdown.style.display = 'none';
                });
                dropdown.appendChild(div);
            });

            input.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent input from gaining actual text focus in a way that interferes
                dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
                input.focus(); // Ensure it gets blur events
            });
            input.addEventListener('blur', () => {
                dropdown.style.display = 'none';
            });
        }

        setupCustomSelect('setting-stream-quality', 'setting-stream-quality-dropdown', 'streamQuality');
        setupCustomSelect('setting-download-quality', 'setting-download-quality-dropdown', 'downloadQuality');

        // --- Tab and Search Logic ---
        const sections = body.querySelectorAll('.settings-section');
        const noResults = body.querySelector('#settings-no-results');

        function filterSettings() {
            let visibleCount = 0;
            const query = (searchInput?.value || '').toLowerCase().trim();
            const tab = header.querySelector('.settings-tab.active')?.dataset.tab || 'all';

            sections.forEach(section => {
                const category = section.dataset.category;
                const text = section.innerText.toLowerCase();
                
                const matchesTab = (tab === 'all' || tab === category);
                const matchesSearch = (!query || text.includes(query));

                if (matchesTab && matchesSearch) {
                    section.style.display = 'block';
                    visibleCount++;
                } else {
                    section.style.display = 'none';
                }
            });

            if (noResults) {
                noResults.style.display = visibleCount === 0 ? 'block' : 'none';
            }
        }

        if (searchInput) {
            searchInput.addEventListener('input', filterSettings);
        }

        tabs.forEach(tabBtn => {
            tabBtn.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tabBtn.classList.add('active');
                filterSettings();
            });
        });

        // Initialize view
        filterSettings();

        // Network section handlers
        const serverUrlInput = document.getElementById('server-url-input');
        const saveUrlBtn = document.getElementById('server-url-save-btn');
        const resetUrlBtn = document.getElementById('server-url-reset-btn');

        if (saveUrlBtn && serverUrlInput) {
            saveUrlBtn.addEventListener('click', () => {
                const val = serverUrlInput.value.trim().replace(/\/+$/, '');
                if (val && val !== DEFAULT_SERVER_URL) {
                    localStorage.setItem('serverUrl', val);
                } else {
                    localStorage.removeItem('serverUrl');
                }
                if (typeof albumCoverCache !== 'undefined') albumCoverCache.clear();
                location.reload();
            });
        }

        if (resetUrlBtn) {
            resetUrlBtn.addEventListener('click', () => {
                localStorage.removeItem('serverUrl');
                if (typeof albumCoverCache !== 'undefined') albumCoverCache.clear();
                location.reload();
            });
        }

        // Local sources: Add folder

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
    // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    modalCancelBtn.addEventListener('click', hideDependencyModal);
    dependencyModal.addEventListener('click', (e) => {
        if (e.target === dependencyModal) hideDependencyModal();
    });

    modalInstallBtn.addEventListener('click', async () => {
        hideDependencyModal();
    });

    // Playback Controls Logic
    repeatBtn.addEventListener('click', () => {
        const mode = (Playback.repeatMode + 1) % 3;
        Playback.setRepeatMode(mode);
        updateRepeatUI(mode);
    });

    function updateRepeatUI(mode) {
        if (mode === 0) {
            repeatBtn.classList.remove('toggle-active');
            repeatIcon.innerHTML = `
                <polyline points="17 1 21 5 17 9"></polyline>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <polyline points="7 23 3 19 7 15"></polyline>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            `;
        } else if (mode === 1) {
            repeatBtn.classList.add('toggle-active');
            repeatIcon.innerHTML = `
                <polyline points="17 1 21 5 17 9"></polyline>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <polyline points="7 23 3 19 7 15"></polyline>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            `;
        } else if (mode === 2) {
            repeatBtn.classList.add('toggle-active');
            repeatIcon.innerHTML = `
                <polyline points="17 1 21 5 17 9"></polyline>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <polyline points="7 23 3 19 7 15"></polyline>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                <text x="12" y="16.5" font-size="9" font-family="sans-serif" font-weight="bold" stroke="none" fill="currentColor" text-anchor="middle">1</text>
            `;
        }
    }

    shuffleBtn.addEventListener('click', () => {
        const active = Playback.toggleShuffle();
        shuffleBtn.classList.toggle('toggle-active', active);
        updateImmersiveUpNext();
        if (queueView && queueView.classList.contains('active')) renderQueueView();
    });

    if (bottomOfflineBtn) {
        bottomOfflineBtn.addEventListener('click', () => {
            if (!Playback.currentTrack) return;
            if (Playback.currentTrack.isLocal) {
                console.log('Local tracks are already offline.');
                return;
            }

            const isOffline = downloadedTracksMap.has(Playback.currentTrack.url);
            const isDownloading = pendingDownloads.has(Playback.currentTrack.url);

            if (!isOffline && !isDownloading) {
                initiateDownload(Playback.currentTrack);
            } else if (isOffline) {
                // Future idea: maybe clicking a downloaded song shows info or allows deletion?
                // For now, do nothing.
                console.log('Track is already available offline');
            }
        });
    }

    playPauseBtn.addEventListener('click', () => {
        if (Playback.isPlaying) {
            Playback.pause();
        } else {
            Playback.resume();
        }
    });


    function isTrackUnsupported(track) {
        if (!track || !track.filename) return false;
        const lower = track.filename.toLowerCase();

        // M4A/AAC are generally supported, UNLESS it's ALAC (Lossless M4A) 
        // which most browsers don't support natively.
        if (lower.endsWith('.m4a') && track.metadata && track.metadata.lossless) {
            return true;
        }

        // Block other strictly unsupported formats if any (none currently identified as critical)
        return false;
    }



    // ΓöÇΓöÇ Infinite Play Engine ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    function _updateSessionAffinity(track) {
        const artists = splitArtists(track.metadata?.artist || '');
        const rawGenre = track.metadata?.genre || '';
        const genres = (Array.isArray(rawGenre) ? rawGenre : String(rawGenre).split(/[,\/;]+/)).map(g => String(g).trim()).filter(g => g.length > 0);

        artists.forEach(a => {
            if (a !== 'Unknown Artist') {
                // Aggressive decay (0.3 instead of 0.75) to prevent sticky affinity
                sessionAffinity.artists[a] = ((sessionAffinity.artists[a] || 0) * 0.3) + 1.0;
            }
        });
        genres.forEach(g => {
            sessionAffinity.genres[g] = ((sessionAffinity.genres[g] || 0) * 0.6) + 1.0;
        });
    }

    function _isLastTrackInContext() {
        if (Playback.queue.length > 0 || Playback.repeatMode !== 0 || Playback.currentPlaylistContext.length === 0) return false;
        return Playback.upcomingTracks.length === 0;
    }

    function _pickRecommendedTrack(currentTrack, virtualHistory = null) {
        if (!allTracks || allTracks.length === 0) return null;
        const currentYear = parseInt(currentTrack?.metadata?.year) || 0;

        const candidates = allTracks.filter(t =>
            !isTrackUnsupported(t) && t.url !== currentTrack?.url
        );
        if (candidates.length === 0) return null;

        const historyToUse = virtualHistory || sessionHistory;

        const scored = candidates.map(track => {
            const trackArtists = splitArtists(track.metadata?.artist || '');
            const rawGenre = track.metadata?.genre || '';
            const trackGenres = (Array.isArray(rawGenre) ? rawGenre : String(rawGenre).split(/[,\/;]+/)).map(g => String(g).trim()).filter(g => g.length > 0);
            const year = parseInt(track.metadata?.year) || 0;
            let score = 0;

            // 1. Artist Affinity (Session) - Weight: 20
            let artistScore = 0;
            trackArtists.forEach(a => {
                if (a !== 'Unknown Artist') {
                    artistScore += (sessionAffinity.artists[a] || 0) * 10;
                }
            });
            score += Math.min(20, artistScore);

            // 2. Genre Synergy (The Mood Guard) - Weight: 40
            let genreScore = 0;
            trackGenres.forEach(g => {
                genreScore += (sessionAffinity.genres[g] || 0) * 20;
            });
            score += Math.min(40, genreScore);

            // 3. Global Preference (Likes) - Weight: 20
            if (likedTracks.has(track.url)) {
                score += 20;
            }

            // 4. Discovery Nudge - Weight: 15
            const hasPlayedBefore = historyTracks.some(h => h.url === track.url);
            if (!hasPlayedBefore) {
                score += 15;
            }

            // 5. Era Proximity - Weight: 5
            if (currentYear && year) {
                score += Math.max(0, 5 - Math.abs(currentYear - year));
            }

            // 6. Diversity Nudge (Artist Exhaustion)
            // -30 if in last 3, -10 if in last 10
            const recentHistory = historyToUse.slice(-10);
            const lastThree = recentHistory.slice(-3);

            if (lastThree.some(url => {
                const t = allTracks.find(x => x.url === url);
                const tArtists = splitArtists(t?.metadata?.artist || '');
                return tArtists.some(a => trackArtists.includes(a));
            })) {
                score -= 30;
            } else if (recentHistory.some(url => {
                const t = allTracks.find(x => x.url === url);
                const tArtists = splitArtists(t?.metadata?.artist || '');
                return tArtists.some(a => trackArtists.includes(a));
            })) {
                score -= 10;
            }

            // 7. Recency Penalty (Same Song)
            const histPos = historyToUse.lastIndexOf(track.url);
            if (histPos !== -1) {
                const distFromEnd = historyToUse.length - 1 - histPos;
                score -= 100 * Math.exp(-distFromEnd / 10);
            }

            // 8. Random Noise - Weight: 10
            score += Math.random() * 10;

            return { track, score };
        });

        // Normalize for weighted selection across ALL candidates
        const minScore = Math.min(...scored.map(s => s.score));
        const weighted = scored.map(s => ({ track: s.track, w: Math.max(0.1, s.score - minScore + 1) }));
        const total = weighted.reduce((sum, s) => sum + s.w, 0);
        let rand = Math.random() * total;
        for (const s of weighted) {
            rand -= s.w;
            if (rand <= 0) return s.track;
        }
        return scored[0].track;
    }

    function _fillInfiniteBuffer() {
        if (Playback.repeatMode !== 0 || !allTracks || allTracks.length === 0) return;

        const ctx = Playback.currentPlaylistContext;
        const idx = Playback.currentTrackIndex;
        const remaining = ctx.length - 1 - idx;
        if (remaining >= 10) return;

        const needed = 10 - remaining;
        let lastTrack = ctx[ctx.length - 1] || null;

        // Use a virtual history to ensure the 10-track batch is diverse
        let tempHistory = [...sessionHistory];
        // Add existing unplayed context to temp history
        if (idx !== -1) {
            ctx.slice(idx + 1).forEach(t => tempHistory.push(t.url));
        }

        let addedAny = false;
        for (let i = 0; i < needed; i++) {
            const pick = _pickRecommendedTrack(lastTrack, tempHistory);
            if (pick) {
                Playback.appendContext(pick);
                tempHistory.push(pick.url);
                lastTrack = pick;
                addedAny = true;
            } else {
                break;
            }
        }

        if (addedAny) {
            if (queueView && queueView.classList.contains('active')) renderQueueView();
            updateImmersiveUpNext();
        }
    }
    // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ







    nextBtn.addEventListener('click', () => Playback.next());
    prevBtn.addEventListener('click', () => Playback.prev());

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

            // Limit the slide to ┬▒40px for subtle feedback
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
                    Playback.next();
                } else {
                    Playback.prev();
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


    // Timing and Scrubber Logic
    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }



    let isDraggingScrubber = false;

    function updateScrubberVisuals(e) {
        if (!Playback.duration) return;
        const rect = progressBarContainer.getBoundingClientRect();
        let clickX = e.clientX - rect.left;

        // bound it
        if (clickX < 0) clickX = 0;
        if (clickX > rect.width) clickX = rect.width;

        const percent = clickX / rect.width;

        // update local visuals
        progressFill.style.width = `${percent * 100}%`;
        currentTimeEl.textContent = formatTime(percent * Playback.duration);
        return percent;
    }

    function isSeekingDisabled() {
        return false; // Browser-based player supports seeking for all formats
    }

    progressBarContainer.addEventListener('mousedown', (e) => {
        if (!Playback.currentTrack) return;
        if (isSeekingDisabled()) return;
        isDraggingScrubber = true;
        updateScrubberVisuals(e);
    });

    progressBarContainer.addEventListener('mousemove', (e) => {
        if (!Playback.duration) return;

        const rect = progressBarContainer.getBoundingClientRect();
        let hoverX = e.clientX - rect.left;

        if (hoverX < 0) hoverX = 0;
        if (hoverX > rect.width) hoverX = rect.width;

        const percent = hoverX / rect.width;

        hoverTooltip.style.left = `${percent * 100}%`;

        if (isSeekingDisabled()) {
            hoverTooltip.textContent = "Seeking disabled for M4A/AAC files";
        } else {
            hoverTooltip.textContent = formatTime(percent * Playback.duration);
        }
    });

    // Touch support for mobile rail
    const handleTouchScrub = (e) => {
        if (!Playback.currentTrack || isSeekingDisabled()) return;
        const touch = e.touches[0];
        if (!touch) return;
        const rect = progressBarContainer.getBoundingClientRect();
        let clickX = touch.clientX - rect.left;

        if (clickX < 0) clickX = 0;
        if (clickX > rect.width) clickX = rect.width;

        const percent = clickX / rect.width;
        progressFill.style.width = `${percent * 100}%`;

        if (Playback.duration) {
            hoverTooltip.style.opacity = '1';
            hoverTooltip.style.left = `${percent * 100}%`;
            hoverTooltip.textContent = formatTime(percent * Playback.duration);
        }

        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        return percent;
    };

    progressBarContainer.addEventListener('touchstart', (e) => {
        if (!Playback.currentTrack || isSeekingDisabled()) return;
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

                if (Playback.duration) {
                    Playback.seek(percent * Playback.duration);
                }
            }
            hoverTooltip.style.opacity = '0';
        }
        e.stopPropagation();
    });

    // Volume Drag and Toggle Logic
    let lastVolume = 0.7;
    Playback.setVolume(lastVolume);
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
        if (Playback.volume > 0) {
            lastVolume = Playback.volume;
            Playback.setVolume(0);
            volumeFill.style.width = '0%';
            setMuteIcon(true);
        } else {
            Playback.setVolume(lastVolume || 0.7);
            volumeFill.style.width = `${Playback.volume * 100}%`;
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
        Playback.setVolume(percent);

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
            if (Playback.duration) {
                Playback.seek(percent * Playback.duration);
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
    }

    // ΓöÇΓöÇ Navigation & Persistence Logic ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    function navigateTo(viewId, stateData = {}, push = true) {
        if (push) {
            history.pushState({ viewId, stateData }, '', '#' + viewId);
        }
        renderState(viewId, stateData);
    }

    function renderState(viewId, stateData = {}) {
        switch (viewId) {
            case 'home': switchToHomeView(false); break;
            case 'search':
                if (stateData.query !== undefined) {
                    if (searchInput) searchInput.value = stateData.query;
                    if (mobileSearchInput) mobileSearchInput.value = stateData.query;
                    Search.renderSearchResults(stateData.query);
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
            case 'settings': openSettings(false, stateData.tab || 'all'); break;
            case 'profile':
                renderProfilePanel();
                openProfile(false);
                break;
            case 'history': switchToHistoryView(false); break;
            case 'likes': switchToLikesView(false); break;
            case 'downloads': switchToDownloadsView(false); break;
            case 'queue': showQueueOverlay(); break;
            case 'immersive': showImmersiveOverlay(); break;
            case 'stats': switchToStatsView(false); break;
        }
    }

    window.addEventListener('popstate', (e) => {
        // Prevent popstate before app is fully initialized
        if (!window.isAppInitialized) return;

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
        hideAllViews();
        homeView.classList.remove('hidden'); homeView.classList.add('active');
    }

    function switchToHistoryView(push = true) {
        if (push) navigateTo('history');
        hideOverlays();
        hideAllViews();

        const historyView = document.getElementById('history-view');
        if (historyView) {
            historyView.classList.remove('hidden');
            historyView.classList.add('active');
            renderHistoryView();
        }
    }

    function switchToLikesView(push = true) {
        if (push) navigateTo('likes');
        hideOverlays();
        hideAllViews();

        const likesView = document.getElementById('likes-view');
        if (likesView) {
            likesView.classList.remove('hidden');
            likesView.classList.add('active');
            renderLikesView();
        }
    }
    function switchToDownloadsView(push = true) {
        if (push) navigateTo('downloads');
        hideOverlays();
        hideAllViews();

        const downloadsView = document.getElementById('downloads-view');
        if (downloadsView) {
            downloadsView.classList.remove('hidden');
            downloadsView.classList.add('active');
            fetchDownloads();
        }
    }


    function hideAllViews() {
        const views = ['home-view', 'search-view', 'artist-view', 'album-view', 'playlist-view', 'likes-view', 'history-view', 'downloads-view', 'stats-view', 'profile-view'];
        views.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('active');
                el.classList.add('hidden');
            }
        });
    }



    function switchToSearchView(push = true) {
        if (push) navigateTo('search', { query: searchInput.value || (mobileSearchInput ? mobileSearchInput.value : '') });
        hideOverlays();
        hideAllViews();
        searchView.classList.remove('hidden'); searchView.classList.add('active');
    }

    function switchToAlbumView(push = true) {
        // Note: stateData for album is usually handled by openAlbumView
        if (push) navigateTo('album');
        hideOverlays();
        hideAllViews();
        albumView.classList.remove('hidden'); albumView.classList.add('active');
    }

    function switchToArtistView(push = true) {
        if (push) navigateTo('artist');
        hideOverlays();
        hideAllViews();
        artistView.classList.remove('hidden'); artistView.classList.add('active');
    }

    function switchToPlaylistView(push = true) {
        if (push) navigateTo('playlist', { playlist: currentActivePlaylist });
        hideOverlays();
        hideAllViews();
        const pv = document.getElementById('playlist-view');
        if (pv) {
            pv.classList.remove('hidden');
            pv.classList.add('active');
        }
    }

    function switchToStatsView(push = true) {
        if (push) navigateTo('stats');
        hideOverlays();
        hideAllViews();

        const statsView = document.getElementById('stats-view');
        if (statsView) {
            statsView.classList.remove('hidden');
            statsView.classList.add('active');
            renderStatsView();
        }
    }

    // Handle initial state or refresh
    [homeView, searchView, queueView, settingsView].forEach(view => {
        if (view) {
            view.classList.add('hidden');
            view.classList.remove('active');
        }
    });

    // Refresh home grid on resize to adjust item counts

    // Refresh home grid on resize to adjust item counts
    window.addEventListener('resize', () => {
        if (homeView.classList.contains('active')) {
            renderHomeGrid();
        }
    });

    if (playlistBackBtn) {
        playlistBackBtn.addEventListener('click', () => history.back());
    }

    const statsBackBtn = document.getElementById('stats-back-btn');
    if (statsBackBtn) {
        statsBackBtn.addEventListener('click', () => history.back());
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



    if (mobileQueueBtn) {
        mobileQueueBtn.addEventListener('click', () => {
            toggleQueueView();
        });
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = desktopSidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active', isActive);
            mobileMenuBtn.classList.toggle('active', isActive);
        });
    }

    const profileCloseBtn = document.getElementById('profile-close-btn');
    if (profileCloseBtn) profileCloseBtn.addEventListener('click', closeProfile);

    // Update active states on view switches
    const mobileNavObserver = new MutationObserver(() => {
        if (queueView && queueView.classList.contains('active')) updateMobileNavActive(mobileQueueBtn);
        else if (searchView && searchView.classList.contains('active')) updateMobileNavActive(mobileSearchBtn);
        else if (homeView && homeView.classList.contains('active')) updateMobileNavActive(mobileHomeBtn);
        else updateMobileNavActive(null);
    });

    [homeView, searchView, queueView, settingsView].forEach(view => {
        if (view) mobileNavObserver.observe(view, { attributes: true, attributeFilter: ['class'] });
    });



    // Custom Genre Dropdown Logic
    const DEFAULT_GENRES = [
        "Acoustic", "Alternative", "Ambient", "Blues", "Classical", "Country", "Dance",
        "Electronic", "Folk", "Hip-Hop", "Indie", "Jazz", "Latin", "Lo-Fi", "Metal",
        "Pop", "R&B", "Rock", "Soul", "Soundtrack", "Trap"
    ];

    // Export necessary helpers for modules
    window.getSharedCoverUrl = getSharedCoverUrl;
    window.formatHeroDuration = formatHeroDuration;
    window.saveTrackToIDB = saveTrackToIDB;
    window.deleteTrackFromIDB = deleteTrackFromIDB;


    // ΓöÇΓöÇ Music Library Initialization ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    async function initializeMusicLibrary() {
        // Any reload means track metadata may have changed ΓÇö clear stale view cache entries
        _openVCDB().then(async (db) => {
            const manifest = await _vcGetManifest(db);
            const albumAndArtistKeys = Object.keys(manifest.entries).filter(k => k.startsWith('album:') || k.startsWith('artist:'));
            for (const key of albumAndArtistKeys) await _vcEvict(db, manifest, key);
            if (albumAndArtistKeys.length > 0) await _vcPut(db, { key: VC_MANIFEST, data: manifest });
        }).catch(() => { });

        try {
            const serverRes = await fetch(`${serverBaseUrl}/api/audio`);
            const serverTracks = serverRes.ok ? await serverRes.json() : [];

            if (serverTracks.length > 0) {
                // Mark all as server tracks
                serverTracks.forEach(st => {
                    st.isServer = true;
                    st.isLocal = false;
                });

                window.allTracks = serverTracks;
                processAlbums(serverTracks);
            } else {
                console.warn('Library is empty or server unreachable.');
                window.allTracks = [];
                renderHomeGrid(); // Clear loading placeholders
            }
        } catch (err) {
            console.error('Error loading music library:', err);
            renderHomeGrid(); // Clear loading placeholders even on error
        }
    }
    // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    function processAlbums(tracks) {
        window.albumsData = {};

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

        // Sort tracks within each album by Disc Number, then Track Number, then Alphabetically
        Object.values(albumsData).forEach(album => {
            album.tracks.sort((a, b) => {
                const aDiscRaw = (a.metadata && a.metadata.disk && a.metadata.disk.no) ? a.metadata.disk.no : 1;
                const bDiscRaw = (b.metadata && b.metadata.disk && b.metadata.disk.no) ? b.metadata.disk.no : 1;
                const aDisc = parseInt(aDiscRaw, 10) || 1;
                const bDisc = parseInt(bDiscRaw, 10) || 1;
                if (aDisc !== bDisc) return aDisc - bDisc;

                const aNoRaw = (a.metadata && a.metadata.track && a.metadata.track.no) ? a.metadata.track.no : 9999;
                const bNoRaw = (b.metadata && b.metadata.track && b.metadata.track.no) ? b.metadata.track.no : 9999;
                const aNo = parseInt(aNoRaw, 10) || 9999;
                const bNo = parseInt(bNoRaw, 10) || 9999;
                if (aNo !== bNo) return aNo - bNo;

                const aTitle = (a.metadata && a.metadata.title) ? a.metadata.title : a.filename;
                const bTitle = (b.metadata && b.metadata.title) ? b.metadata.title : b.filename;
                return aTitle.localeCompare(bTitle);
            });
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
            const pictureUrl = getSharedCoverUrl(albumInfo.coverTrackPath, albumInfo.artist, albumInfo.name);
            artHtml = `<img src="${pictureUrl}" class="album-card-art" alt="Album Cover">`;
        }

        card.innerHTML = `
            <div class="card-art-wrapper">
                ${artHtml}
                ${CARD_PLAY_BTN_HTML}
            </div>
            <div class="album-card-title">${albumInfo.name}</div>
            <div class="album-card-artist">${splitArtists(albumInfo.artist).map(a => `<span class="artist-link" data-artist="${a}">${a}</span>`).join('<span style="opacity:0.5">, </span>')}</div>
        `;

        card.querySelector('.card-play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const firstIdx = albumInfo.tracks.findIndex(t => !isTrackUnsupported(t));
            if (firstIdx === -1) return;
            Playback.playTrack(albumInfo.tracks[firstIdx], albumInfo.tracks, firstIdx);
        });

        card.addEventListener('click', (e) => {
            const artistLink = e.target.closest('.artist-link');
            if (artistLink) {
                e.stopPropagation();
                const targetArtist = artistLink.dataset.artist || splitArtists(albumInfo.artist)[0];
                openArtistView(targetArtist);
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

        // Calculate dynamic count based on screen width (min 8)
        const count = Theme.calculateItemsPerRow();
        const recentAlbums = albumsArray.slice(0, count);
        recentAlbums.forEach(albumInfo => {
            recentList.appendChild(createAlbumCard(albumInfo));
        });



        if (typeof renderRecentArtists === 'function') {
            renderRecentArtists();
        }

        if (typeof Playlist !== 'undefined') {
            Playlist.renderDiscoverStrip();
            Playlist.renderUserStrip();
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

    // Export helpers for modules
    window.getSharedCoverUrl = getSharedCoverUrl;
    window.formatHeroDuration = formatHeroDuration;

    // ΓöÇΓöÇ View Cache (IndexedDB, 15 MB budget, 12-hour TTL, LRU) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    const VC_DB_NAME = 'SimonRelaysViewCache';
    const VC_STORE = 'views';
    const VC_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
    const VC_TTL = 12 * 60 * 60 * 1000; // 12 hours
    const VC_MANIFEST = '__manifest__';
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
            req.onerror = (e) => reject(e.target.error);
        });
    }

    function _vcGet(db, key) {
        return new Promise((resolve) => {
            const req = db.transaction(VC_STORE, 'readonly').objectStore(VC_STORE).get(key);
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror = () => resolve(null);
        });
    }

    function _vcPut(db, record) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(VC_STORE, 'readwrite');
            tx.objectStore(VC_STORE).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    function _vcDelete(db, key) {
        return new Promise((resolve) => {
            const tx = db.transaction(VC_STORE, 'readwrite');
            tx.objectStore(VC_STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
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

            // Touch (LRU update) ΓÇö fire and forget
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
    // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    function openAlbumView(albumInfo, push = true) {
        if (push) navigateTo('album', { albumInfo });
        switchToAlbumView(false);

        let coverHtml = `<div class="album-hero-cover" style="background: linear-gradient(135deg, var(--gradient-1), var(--gradient-2));"></div>`;
        if (albumInfo.coverTrackPath) {
            const pictureUrl = getSharedCoverUrl(albumInfo.coverTrackPath, albumInfo.artist, albumInfo.name);
            coverHtml = `<img src="${pictureUrl}" class="album-hero-cover" alt="Album Cover">`;
            if (albumView) albumView.style.setProperty('--view-bg-image', `url("${pictureUrl}")`);
        } else {
            if (albumView) albumView.style.setProperty('--view-bg-image', 'none');
        }

        let earliestYear = 9999;
        let totalDuration = 0;
        let albumGenres = new Set();

        albumInfo.tracks.forEach(t => {
            if (t.metadata) {
                if (t.metadata.year && t.metadata.year < earliestYear) earliestYear = t.metadata.year;
                if (t.metadata.duration) totalDuration += t.metadata.duration;
                if (t.metadata.genre) {
                    const splitRegex = /[,/;\\]+/;
                    if (Array.isArray(t.metadata.genre)) {
                        t.metadata.genre.forEach(g => {
                            if (typeof g === 'string') {
                                g.split(splitRegex).map(s => s.trim()).filter(Boolean).forEach(innerG => albumGenres.add(innerG.toUpperCase()));
                            }
                        });
                    } else if (typeof t.metadata.genre === 'string') {
                        t.metadata.genre.split(splitRegex).map(s => s.trim()).filter(Boolean).forEach(g => albumGenres.add(g.toUpperCase()));
                    }
                }
            }
        });

        const yearStr = earliestYear === 9999 ? 'Unknown Year' : earliestYear;
        const durationStr = totalDuration > 0 ? `, ${formatHeroDuration(totalDuration)}` : '';
        const songCountStr = `${albumInfo.tracks.length} song${albumInfo.tracks.length !== 1 ? 's' : ''}`;

        let genresHtml = '';
        if (albumGenres.size > 0) {
            // Removed .slice(0, 3) to show all genres in the album banner
            genresHtml = Array.from(albumGenres).map(g =>
                `<span style="background: rgba(255,255,255,0.1); color: var(--text-secondary); padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 8px; border: 1px solid rgba(255,255,255,0.05); text-transform: uppercase; letter-spacing: 0.5px;">${g}</span>`
            ).join('');
        } else {
            genresHtml = `<span style="background: rgba(255,0,0,0.2); color: #ff8888; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 8px; border: 1px solid rgba(255,0,0,0.2); text-transform: uppercase; letter-spacing: 0.5px;">NO GENRE TAGS</span>`;
        }

        const isAlbumOffline = albumInfo.tracks.every(t => downloadedTracksMap.has(t.url));
        const isAlbumDownloading = albumInfo.tracks.some(t => pendingDownloads.has(t.url));

        albumHeroDiv.innerHTML = `
            ${coverHtml}
            <div class="album-hero-info">
                <div class="album-hero-label">Album</div>
                <div class="album-hero-title" title="${albumInfo.name}">${albumInfo.name}</div>
                <div class="album-hero-meta" style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                    <div class="artist-avatar album-hero-artist-avatar" style="display: inline-block; vertical-align: middle;"></div>
                    <div class="album-hero-artists" style="display: inline-block;">
                        ${splitArtists(albumInfo.artist).map(a => `<strong class="artist-link" data-artist="${a}" style="cursor: pointer;">${a}</strong>`).join('<span style="opacity:0.5">, </span>')}
                    </div>
                    <span style="opacity: 0.7;">\u2022 ${yearStr} \u2022 ${songCountStr}${durationStr}</span>
                    ${genresHtml}
                </div>
            </div>
        `;

        // Fetch and apply artist image for the hero avatar
        const albumAvatarNode = albumHeroDiv.querySelector('.album-hero-artist-avatar');
        if (albumAvatarNode) {
            Theme.applyArtistVisuals(albumInfo.artist, albumAvatarNode, false);
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
                    <button class="secondary-action-btn check-metadata-btn" title="Check Metadata Health">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        <span>Check Metadata</span>
                    </button>
        `;
        albumHeroDiv.querySelector('.album-hero-info').appendChild(actionsDiv);

        const albumPlayBtn = albumHeroDiv.querySelector('.album-play-btn');

        if (albumPlayBtn) {
            albumPlayBtn.addEventListener('click', () => {
                const firstIdx = albumInfo.tracks.findIndex(t => !isTrackUnsupported(t));
                if (firstIdx === -1) return;
                Playback.playTrack(albumInfo.tracks[firstIdx], albumInfo.tracks, firstIdx);
            });
        }

        const downloadAlbumBtn = albumHeroDiv.querySelector('.download-album-btn');
        const editAlbumBtn = albumHeroDiv.querySelector('.edit-album-btn');
        const checkMetadataBtn = albumHeroDiv.querySelector('.check-metadata-btn');

        if (editAlbumBtn) {
            editAlbumBtn.addEventListener('click', () => Metadata.openAlbumEditor(albumInfo));
        }

        if (checkMetadataBtn) {
            checkMetadataBtn.addEventListener('click', () => Metadata.openHealthCheck(albumInfo));
        }

        if (downloadAlbumBtn && !isAlbumOffline && !isAlbumDownloading) {
            downloadAlbumBtn.addEventListener('click', () => downloadAlbum(albumInfo));
        }

        const heroArtistContainer = albumHeroDiv.querySelector('.album-hero-artists');
        if (heroArtistContainer) {
            heroArtistContainer.addEventListener('click', (e) => {
                const link = e.target.closest('.artist-link');
                if (link) {
                    openArtistView(link.dataset.artist || splitArtists(albumInfo.artist)[0]);
                }
            });
        }

        const albumTrackList = albumView.querySelector('.track-list');
        renderTrackList(albumInfo.tracks, albumTrackList, false, null, true, true);

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

    // ΓöÇΓöÇ Track List Rendering ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    function renderTrackList(tracks, container = trackListElement, isPlaylistView = false, playlistId = null, canEdit = true, showTrackNumbers = false, isQueueView = false) {
        container.innerHTML = '';

        // Hydrate tracks with library data if metadata is sparse (common for cloud-synced or cached items)
        const tracksToRender = tracks.map(track => {
            // If it already has quality info, it's probably fully hydrated
            if (track.metadata && (track.metadata.lossless !== undefined || track.metadata.bitrate !== undefined)) {
                return track;
            }
            const libTrack = allTracks.find(t => t.url === track.url);
            if (libTrack) {
                return { ...track, ...libTrack, timestamp: track.timestamp, savedAt: track.savedAt };
            }
            return track;
        });

        const fragment = document.createDocumentFragment();
        tracksToRender.forEach((track, index) => {
            const trackItem = document.createElement('div');
            trackItem.className = 'track-item';
            trackItem.dataset.url = track.url;
            const isUnsupported = isTrackUnsupported(track);

            if (isUnsupported) trackItem.classList.add('unsupported-track');
            if (Playback.currentTrack && Playback.currentTrack.url === track.url) trackItem.classList.add('active');

            const title = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
            const artist = (track.metadata && track.metadata.artist) ? track.metadata.artist : 'Unknown Artist';

            // Drag handle (playlist view only)
            const dragHandleHtml = (isPlaylistView && canEdit) ? `
                <div class="drag-handle" draggable="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4h2v2H9zm4 0h2v2h-2zm-4 7h2v2H9zm4 0h2v2h-2zm-4 7h2v2H9zm4 0h2v2h-2z"/></svg>
                </div>` : '';

            // Action buttons: Remove (Playlist/Queue) and Add-to-playlist
            let actionBtnHtml = '';
            
            // ALWAYS show Add-to-playlist button (the +) unless it's a very specific case
            actionBtnHtml += `
                <button class="add-to-playlist-btn" title="Add to playlist">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>`;

            if (isPlaylistView && canEdit) {
                actionBtnHtml += `
                    <button class="remove-from-playlist-btn" title="Remove from playlist">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>`;
            } else if (isQueueView) {
                actionBtnHtml += `
                    <button class="remove-from-queue-btn" title="Remove from queue">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>`;
            }

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
            if (track.metadata && track.metadata.hasCover) {
                const pictureUrl = getSharedCoverUrl(track.relativePath, track.metadata.artist, track.metadata.album);
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

            // Like button (Heart)
            const isLiked = likedTracks.has(track.url);
            const likeBtnHtml = currentUser ? `
                <button class="icon-button track-like-btn ${isLiked ? 'active' : ''}" title="${isLiked ? 'Unlike' : 'Like'}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="${isLiked ? 'var(--accent)' : 'none'}" stroke="${isLiked ? 'var(--accent)' : 'currentColor'}" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>` : '';

            trackItem.innerHTML = `
                ${trackNumberHtml}
                ${dragHandleHtml}
                ${coverHtml}
                <div class="track-item-info">
                    <div class="track-item-title">${title}</div>
                    <div class="track-item-artist">${splitArtists(artist).map(a => `<span class="artist-link" data-artist="${a}" style="cursor: pointer;">${a}</span>`).join('<span style="opacity:0.5">, </span>')}</div>
                </div>
                <div class="track-item-actions">
                    ${isUnsupported ? `
                    <div class="unsupported-alert" title="This format (e.g. ALAC) is not natively supported by your browser">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    </div>` : ''}
                    ${qualityTagHtml}
                    ${likeBtnHtml}
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

            // Like Button Handler
            const trackLikeBtn = trackItem.querySelector('.track-like-btn');
            if (trackLikeBtn) {
                trackLikeBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await toggleLike(track);
                    const nowLiked = likedTracks.has(track.url);
                    trackLikeBtn.classList.toggle('active', nowLiked);
                    const svg = trackLikeBtn.querySelector('svg');
                    svg.style.fill = nowLiked ? 'var(--accent)' : 'none';
                    svg.style.stroke = nowLiked ? 'var(--accent)' : 'currentColor';
                });
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

            // Remove from queue handler
            const removeQueueBtn = trackItem.querySelector('.remove-from-queue-btn');
            if (removeQueueBtn) {
                removeQueueBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeFromQueue(index, container === queueUserList);
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
                    const clickedArtist = e.target.closest('.artist-link').dataset.artist || splitArtists(artist)[0];
                    openArtistView(clickedArtist);
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
                    Playback.clearQueue(); // audio.js handles queue clearing better
                    Playback.playTrack(clickedTrack);
                    renderQueueView();
                    return;
                }

                // If clicking a track in the "Next From Context" queue, it skips directly to that index in the main context
                if (container === queueContextList) {
                    const clickedTrackUrl = tracks[index].url;
                    const targetIndex = Playback.currentPlaylistContext.findIndex(t => t.url === clickedTrackUrl);
                    if (targetIndex !== -1) {
                        Playback.clearQueue();
                        Playback.playTrack(Playback.currentPlaylistContext[targetIndex], Playback.currentPlaylistContext, targetIndex);
                        renderQueueView();
                    }
                    return;
                }

                if (container !== queueNowPlaying) {
                    Playback.playTrack(tracks[index], tracks, index);
                }
            });

            fragment.appendChild(trackItem);
        });
        container.appendChild(fragment);
    }

    function openArtistView(artistName, push = true) {
        if (push) navigateTo('artist', { artistName });
        switchToArtistView(false);

        artistHeroName.textContent = artistName;

        // Find all albums by this artist from the pre-processed albumsData
        const artistAlbums = [];
        const lowerArtistName = artistName.toLowerCase();
        for (const [albumName, albumInfo] of Object.entries(albumsData)) {
            // Match if the album's artist field contains this artist name
            const albumArtists = splitArtists(albumInfo.artist).map(a => a.toLowerCase());
            if (albumArtists.includes(lowerArtistName) || albumInfo.artist.toLowerCase() === lowerArtistName) {
                artistAlbums.push(albumInfo);
            }
        }

        // Collect all tracks from those albums ΓÇö reliable source, no metadata variance issues
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
            Theme.applyArtistVisuals(artistName, heroAvatarNode, true);
        }

        // Render tracks
        renderTrackList(artistTracks, artistTrackList);

        // Render albums
        artistAlbumGrid.innerHTML = '';
        artistAlbums.forEach(albumInfo => {
            artistAlbumGrid.appendChild(createAlbumCard(albumInfo));
        });

        // Write to view cache (fire-and-forget)
        setCachedView(`artist:${artistName}`, { artistAlbums, artistTracks });
    }





    // ΓöÇΓöÇ Playlist System ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    // ΓöÇΓöÇ History System ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    async function fetchHistory() {
        if (currentUser && window._fbFS) {
            try {
                const snap = await window._fbFS.collection('users').doc(currentUser.uid).collection('history')
                    .orderBy('timestamp', 'desc').limit(100).get();
                const cloudTracks = snap.docs.map(doc => doc.data());

                // Hydrate cloud tracks with library data to ensure quality tags and relative paths are present
                historyTracks = cloudTracks.map(track => {
                    const libTrack = allTracks.find(t => t.url === track.url);
                    return libTrack ? { ...track, ...libTrack, timestamp: track.timestamp } : track;
                });
            } catch (error) {
                console.error('[History] Failed to fetch cloud history', error);
            }
        } else {
            // Guest mode: local storage
            const local = localStorage.getItem('SimonRelays_History');
            historyTracks = local ? JSON.parse(local) : [];
        }

        // Refresh history view if open
        const historyView = document.getElementById('history-view');
        if (historyView && !historyView.classList.contains('hidden')) {
            renderHistoryView();
        }
    }

    async function addToHistory(track) {
        if (!track) return;

        const historyData = {
            ...track,
            timestamp: Date.now()
        };

        // Update local state: remove if already exists (to move to top) and limit to 100
        historyTracks = historyTracks.filter(t => t.url !== track.url);
        historyTracks.unshift(historyData);
        if (historyTracks.length > 100) historyTracks.pop();

        if (currentUser && window._fbFS) {
            try {
                const encodedUrl = btoa(track.url).replace(/\//g, '_').replace(/\+/g, '-');
                await window._fbFS.collection('users').doc(currentUser.uid).collection('history').doc(encodedUrl).set(historyData);
            } catch (error) {
                console.error('[History] Failed to sync history to cloud', error);
            }
        } else {
            localStorage.setItem('SimonRelays_History', JSON.stringify(historyTracks));
        }

        const historyView = document.getElementById('history-view');
        if (historyView && !historyView.classList.contains('hidden')) {
            renderHistoryView();
        }
    }

    function renderHistoryView() {
        const container = document.getElementById('history-track-list');
        if (!container) return;
        renderTrackList(historyTracks, container);
    }

    // ΓöÇΓöÇ Downloads System ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    let downloadedTracks = [];

    async function fetchDownloads() {
        try {
            const results = await getAllDownloadedFromIDB();
            // Results are objects like { trackUrl, blob, metadata, savedAt }
            // We need to convert them to the standard track format used by renderTrackList
            let totalBytes = 0;
            downloadedTracks = results.map(item => {
                // Sum up blob sizes for storage calculation
                if (item.blob && item.blob.size) totalBytes += item.blob.size;
                if (item.coverBlob && item.coverBlob.size) totalBytes += item.coverBlob.size;

                const track = {
                    url: item.trackUrl,
                    metadata: item.metadata,
                    isLocal: true, // Mark as local since it's from IDB
                    savedAt: item.savedAt
                };

                // Hydrate with library data to ensure quality tags and relative paths are present
                const libTrack = allTracks.find(t => t.url === item.trackUrl);
                if (libTrack) {
                    Object.assign(track, libTrack);
                    // Ensure the IDB-specific properties are preserved
                    track.isLocal = true;
                    track.savedAt = item.savedAt;
                }

                // Restore relativePath specifically if saved in metadata (new downloads)
                if (item.metadata && item.metadata.relativePath) {
                    track.relativePath = item.metadata.relativePath;
                }

                return track;
            }).sort((a, b) => b.savedAt - a.savedAt); // Newest first

            // Update storage info display
            const storageText = document.getElementById('downloads-storage-text');
            if (storageText) {
                const count = downloadedTracks.length;
                storageText.textContent = `${count} track${count !== 1 ? 's' : ''} ┬╖ ${formatBytes(totalBytes)}`;
            }

            const downloadsView = document.getElementById('downloads-view');
            if (downloadsView && !downloadsView.classList.contains('hidden')) {
                renderDownloadsView();
            }
        } catch (error) {
            console.error('[Downloads] Failed to fetch downloaded tracks', error);
        }
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0) + ' ' + units[i];
    }

    function renderDownloadsView() {
        const container = document.getElementById('downloads-track-list');
        if (!container) return;
        renderTrackList(downloadedTracks, container);
    }

    // ΓöÇΓöÇ Likes System ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    async function fetchLikes() {
        if (!currentUser || !window._fbFS) return;
        try {
            const snap = await window._fbFS.collection('users').doc(currentUser.uid).collection('likes').orderBy('timestamp', 'desc').get();
            likedTracks.clear();
            allLikedTracksCache = [];

            snap.forEach(doc => {
                const data = doc.data();
                likedTracks.add(data.url);
                allLikedTracksCache.push(data);
            });

            updateLikeButtonState();

            // If likes view is currently open, refresh it
            const likesView = document.getElementById('likes-view');
            if (likesView && !likesView.classList.contains('hidden')) {
                renderLikesView();
            }
        } catch (error) {
            console.error('[Likes] Failed to fetch likes', error);
        }
    }

    async function toggleLike(trackToToggle = null) {
        const track = trackToToggle || Playback.currentTrack;
        if (!currentUser || !window._fbFS || !track) return;

        const trackUrl = track.url;
        // Firebase paths cannot contain ".", so we encode the URL
        const safeUrlId = encodeURIComponent(trackUrl).replace(/\./g, '%2E');
        const likeRef = window._fbFS.collection('users').doc(currentUser.uid).collection('likes').doc(safeUrlId);

        const isLiked = likedTracks.has(trackUrl);

        try {
            if (isLiked) {
                likedTracks.delete(trackUrl);
                allLikedTracksCache = allLikedTracksCache.filter(t => t.url !== trackUrl);
                updateLikeButtonState();
                await likeRef.delete();
            } else {
                likedTracks.add(trackUrl);

                const trackData = {
                    ...track,
                    timestamp: Date.now()
                };
                allLikedTracksCache.unshift(trackData); // Add to top
                updateLikeButtonState();
                await likeRef.set(trackData);
            }

            // If likes view is currently open, refresh it
            const likesView = document.getElementById('likes-view');
            if (likesView && !likesView.classList.contains('hidden')) {
                renderLikesView();
            }

        } catch (error) {
            console.error('[Likes] Failed to toggle like', error);
            // Revert state on failure
            if (isLiked) likedTracks.add(trackUrl); else likedTracks.delete(trackUrl);
            updateLikeButtonState();
        }
    }

    function updateLikeButtonState() {
        const likeTrackBtn = document.getElementById('like-track-btn');
        const immersiveLikeBtn = document.getElementById('immersive-like-btn');

        const isLiked = currentUser && Playback.currentTrack && likedTracks.has(Playback.currentTrack.url);

        if (likeTrackBtn) {
            if (!currentUser || !Playback.currentTrack) {
                likeTrackBtn.classList.remove('active');
            } else {
                likeTrackBtn.classList.toggle('active', isLiked);
            }
        }

        if (immersiveLikeBtn) {
            if (!currentUser || !Playback.currentTrack) {
                immersiveLikeBtn.style.display = 'none';
            } else {
                immersiveLikeBtn.style.display = '';
                immersiveLikeBtn.classList.toggle('active', isLiked);
                const svg = immersiveLikeBtn.querySelector('svg');
                if (svg) {
                    svg.style.fill = isLiked ? 'var(--accent)' : 'none';
                    svg.style.stroke = isLiked ? 'var(--accent)' : 'currentColor';
                }
            }
        }
    }

    function renderLikesView() {
        const container = document.getElementById('likes-track-list');
        if (!container) return;

        container.innerHTML = '';

        if (allLikedTracksCache.length === 0) {
            container.innerHTML = `
                <div class="search-empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <div class="search-empty-text">No liked tracks yet</div>
                    <div class="search-empty-sub">Tap the heart on any playing song to add it here</div>
                </div>
            `;
            return;
        }

        // Use standard renderer for track lists to retain cover art, context menus, and proper layout
        renderTrackList(allLikedTracksCache, container, false, null, false, true);
    }

    async function renderStatsView() {
        return Stats.render();
    }

    // --- Playlist Logic (Moved to js/playlist.js) ---
    async function fetchPlaylists() {
        const playlists = await Playlist.fetchUserPlaylists();
        window.allPlaylists = playlists;
        Playlist.renderUserStrip();
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
                Playlist.renderUserStrip();
                return newPl;
            } catch (e) { console.error('[Cloud] Failed to create playlist', e); }
        }
        try {
            const newPl = await API.createPlaylist(name);
            allPlaylists.push(newPl);
            Playlist.renderUserStrip();
            return newPl;
        } catch (e) { console.error('Failed to create playlist locally', e); }
        return null;
    }

    async function deletePlaylist(id) {
        if (currentUser && window._fbFS) {
            try { await window._fbFS.collection('playlists').doc(id).delete(); }
            catch (e) { console.error('[Cloud] Delete failed', e); }
        } else {
            try { await API.deletePlaylist(id); }
            catch (e) { console.error('Local delete failed', e); }
        }
        allPlaylists = allPlaylists.filter(p => p.id !== id);
        Playlist.renderUserStrip();
        switchToHomeView();
    }

    async function renamePlaylist(id, name) {
        if (currentUser && window._fbFS) {
            try { await window._fbFS.collection('playlists').doc(id).update({ name }); }
            catch (e) { console.error('[Cloud] Rename failed', e); }
        } else {
            try { await API.renamePlaylist(id, name); }
            catch (e) { console.error('Local rename failed', e); }
        }
        const idx = allPlaylists.findIndex(p => p.id === id);
        if (idx !== -1) allPlaylists[idx].name = name;
        Playlist.renderUserStrip();
    }

    async function updatePlaylistTracks(playlistId, tracks) {
        if (currentUser && window._fbFS) {
            try { await window._fbFS.collection('playlists').doc(playlistId).update({ tracks }); }
            catch (e) { console.error('[Cloud] Update tracks failed', e); }
        } else {
            try { await API.updatePlaylistTracks(playlistId, tracks); }
            catch (e) { console.error('Local update tracks failed', e); }
        }
        const idx = allPlaylists.findIndex(p => p.id === playlistId);
        if (idx !== -1) {
            allPlaylists[idx].tracks = tracks;
            Playlist.renderUserStrip();
            if (activePlaylistId === playlistId) openPlaylistView(allPlaylists[idx], false);
        }
    }

    async function updatePlaylistCover(playlistId, base64) {
        if (currentUser && window._fbFS) {
            try { await window._fbFS.collection('playlists').doc(playlistId).update({ customCover: base64 }); }
            catch (e) { console.error('[Cloud] Update cover failed', e); }
        }
        const idx = allPlaylists.findIndex(p => p.id === playlistId);
        if (idx !== -1) {
            allPlaylists[idx].customCover = base64;
            Playlist.renderUserStrip();
            if (activePlaylistId === playlistId) openPlaylistView(allPlaylists[idx], false);
        }
    }

    async function addTrackToPlaylist(playlistId, track) {
        const pl = allPlaylists.find(p => p.id === playlistId);
        if (!pl) return;

        // Ensure we don't duplicate tracks by URL if that's preferred, 
        // though usually playlists allow duplicates. We'll just add it.
        const updatedTracks = [...(pl.tracks || []), track];
        await updatePlaylistTracks(playlistId, updatedTracks);
    }

    async function removeTrackFromPlaylist(playlistId, trackUrl, trackItemEl) {
        const pl = allPlaylists.find(p => p.id === playlistId);
        if (!pl) return;

        if (!confirm(`Remove this track from "${pl.name}"?`)) return;

        const updatedTracks = (pl.tracks || []).filter(t => t.url !== trackUrl);
        await updatePlaylistTracks(playlistId, updatedTracks);

        if (trackItemEl) {
            trackItemEl.remove();
        }
    }

    function openPlaylistView(playlist, push = true) {
        Playlist.renderPlaylistView(playlist);
        if (push) navigateTo('playlist', { playlist });
        activePlaylistId = playlist.id;
        switchToPlaylistView(false);

        // Use the passed playlist object if it has tracks (Search/Discover results)
        // or find in allPlaylists for the most up-to-date local version.
        const pl = allPlaylists.find(p => p.id === playlist.id) || playlist;

        if (pl && pl.tracks) {
            const isOwn = currentUser && pl.userId === currentUser.uid;
            renderTrackList(pl.tracks, playlistTrackList, true, pl.id, isOwn);
        }
    }



    // ΓöÇΓöÇ Add-to-playlist dropdown ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
        const scale = Theme.getZoomScale();
        addToPlaylistDropdown.style.top = `${(rect.bottom / scale) + 6}px`;
        addToPlaylistDropdown.style.left = `${Math.min(rect.left / scale, (window.innerWidth / scale) - 270)}px`;
        addToPlaylistDropdown.classList.remove('hidden');
    }

    document.addEventListener('click', (e) => {
        if (!addToPlaylistDropdown.contains(e.target) && !e.target.closest('.add-to-playlist-btn')) {
            addToPlaylistDropdown.classList.add('hidden');
        }
    });

    // ΓöÇΓöÇ Create Playlist Modal ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

    // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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
                splitArtists(rawName).forEach(aName => {
                    if (aName !== 'Unknown Artist') unique.add(aName);
                });
            });
            recentNames = Array.from(unique);
        }

        recentArtistList.innerHTML = '';

        if (recentNames.length === 0) {
            recentArtistList.innerHTML = '<div style="color:var(--text-secondary); padding: 20px;">Play some music to see artists here.</div>';
            return;
        }

        const count = Theme.calculateItemsPerRow();
        const topArtists = recentNames.slice(0, count);
        topArtists.forEach(artistName => {
            const card = document.createElement('div');
            card.className = 'artist-card';
            card.innerHTML = `
                <div class="artist-card-art"></div>
                <div class="artist-card-title" title="${artistName}">${artistName}</div>
                <div class="artist-card-label">Artist</div>
            `;
            card.addEventListener('click', () => openArtistView(artistName));
            recentArtistList.appendChild(card);

            Theme.applyArtistVisuals(artistName, card, false);
        });
    }



    function getTrackUrlForQuality(track, type = 'stream') {
        const qualityPref = type === 'stream'
            ? (localStorage.getItem('streamQuality') || 'original')
            : (localStorage.getItem('downloadQuality') || 'original');

        if (track.qualities && track.qualities[qualityPref]) {
            // track.qualities urls are already absolute paths or /api paths relative to serverBaseUrl
            const qualityUrl = track.qualities[qualityPref].url;
            return qualityUrl.startsWith('http') ? qualityUrl : `${serverBaseUrl}${qualityUrl}`;
        }
        return `${serverBaseUrl}${track.url}`;
    }

    function getPlaybackFormat(track, type = 'stream') {
        const qualityPref = type === 'stream'
            ? (localStorage.getItem('streamQuality') || 'original')
            : (localStorage.getItem('downloadQuality') || 'original');

        if (track.qualities && track.qualities[qualityPref]) {
            const rawFormat = track.qualities[qualityPref].format;
            if (rawFormat) {
                const f = rawFormat.toLowerCase();
                if (f.includes('mpeg') || f.includes('mp3')) return 'mp3';
                if (f.includes('flac')) return 'flac';
                if (f.includes('aac')) return 'aac';
                if (f.includes('m4a')) return 'm4a';
                return f;
            }
        }
        // Fallback to extension from filename or url
        const source = track.relativePath || track.url || track.filename || '';
        const ext = source.split('.').pop().toLowerCase();
        return ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'].includes(ext) ? ext : null;
    }

    async function updateNowPlayingUI(track) {
        if (!track) return;
        const title = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
        const artist = (track.metadata && track.metadata.artist) ? track.metadata.artist : 'Unknown Artist';

        addToHistory(track);

        // Offline / Source UI
        const isDownloaded = downloadedTracksMap.has(track.url);
        if (bottomOfflineBtn) {
            bottomOfflineBtn.classList.toggle('downloaded', !!isDownloaded);
            bottomOfflineBtn.classList.toggle('is-local', !!track.isLocal && !track.isBoth);
            bottomOfflineBtn.classList.toggle('is-both', !!track.isBoth);
            bottomOfflineBtn.title = track.isBoth ? 'Local & Server Synced' : (track.isLocal ? 'Local File' : (isDownloaded ? 'Available Offline' : 'Remote Source'));
        }

        updateLikeButtonState();
        bottomTitle.textContent = title;
        bottomArtist.innerHTML = splitArtists(artist).map(a => `<span class="bottom-artist-link" data-artist="${a}" style="cursor: pointer;">${a}</span>`).join('<span style="opacity:0.5">, </span>');

        // Recent Artists
        try {
            if (artist && artist !== 'Unknown Artist') {
                const artistNames = splitArtists(artist);
                let recent = JSON.parse(localStorage.getItem('recentArtists') || '[]');
                artistNames.forEach(name => {
                    recent = recent.filter(a => a !== name);
                    recent.unshift(name);
                });
                localStorage.setItem('recentArtists', JSON.stringify(recent.slice(0, 50)));
                renderRecentArtists();
            }
        } catch (e) { }

        // Album Art
        if (currentActiveCoverUrl) URL.revokeObjectURL(currentActiveCoverUrl);
        currentActiveCoverUrl = null;

        let pictureUrl = '';
        if (track._cachedCover) {
            currentActiveCoverUrl = URL.createObjectURL(track._cachedCover);
            pictureUrl = currentActiveCoverUrl;
        } else if (track.metadata && track.metadata.hasCover) {
            pictureUrl = getSharedCoverUrl(track.relativePath, track.metadata.artist, track.metadata.album);
        }

        if (pictureUrl) {
            bottomArtWrapper.innerHTML = `<img src="${pictureUrl}" alt="Album Art">`;
            if (immersiveArt) {
                immersiveArt.src = pictureUrl;
                immersiveArt.style.display = 'block';
            }
            Theme.updateNowPlayingVisuals(track, pictureUrl);
        } else {
            bottomArtWrapper.innerHTML = '';
            Theme.updateNowPlayingVisuals(track, null);
            if (immersiveArt) immersiveArt.style.display = 'none';
        }

        // Immersive Info
        if (immersiveTitle) {
            immersiveTitle.textContent = title;
            immersiveTitle.onclick = () => {
                const albumName = track.metadata?.album;
                if (albumName && albumsData[albumName]) {
                    hideImmersiveOverlay();
                    openAlbumView(albumsData[albumName]);
                }
            };
        }
        if (immersiveArtist) {
            const artists = splitArtists(artist);
            immersiveArtist.innerHTML = artists.map(a => `<span class="immersive-artist-link" data-artist="${a}" style="cursor:pointer;">${a}</span>`).join('<span style="opacity:0.5">, </span>');
        }

        // Lyrics
        Lyrics.fetch(track);

        updateImmersiveUpNext();
    }



    // ΓöÇΓöÇ Offline Helper Logic ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    async function initiateDownload(track) {
        if (track.isLocal) return;
        const url = getTrackUrlForQuality(track, 'download');

        pendingDownloads.set(track.url, 0.01); // show start
        refreshCurrentView();

        try {
            // 1. Fetch Audio
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();

            // 2. Fetch Cover (if applicable)
            let coverBlob = null;
            if (track.metadata && track.metadata.hasCover) {
                try {
                    const coverUrl = getSharedCoverUrl(track.relativePath, track.metadata.artist, track.metadata.album);
                    const cRes = await fetch(coverUrl);
                    if (cRes.ok) coverBlob = await cRes.blob();
                } catch (e) { console.error('[PWA] Cover download failed', e); }
            }

            // 3. Fetch Lyrics
            let lyrics = null;
            try {
                const title = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
                const artist = (track.metadata && track.metadata.artist) ? track.metadata.artist : 'Unknown Artist';
                const album = (track.metadata && track.metadata.album) ? track.metadata.album : '';
                const duration = (track.metadata && track.metadata.duration) ? track.metadata.duration : 0;

                let lUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
                if (album) lUrl += `&album_name=${encodeURIComponent(album)}`;
                if (duration) lUrl += `&duration=${Math.round(duration)}`;

                const lRes = await fetch(lUrl);
                if (lRes.ok) lyrics = await lRes.json();
            } catch (e) { console.error('[PWA] Lyrics download failed', e); }

            // 4. Save to IDB
            // Include relativePath in metadata so we can show covers even if library isn't loaded
            const saveMetadata = { ...track.metadata, relativePath: track.relativePath };
            await saveTrackToIDB(track.url, blob, saveMetadata, coverBlob, lyrics);

            // Mark as offline in the local map
            downloadedTracksMap.set(track.url, 'indexeddb');
            console.log('[PWA] Track saved to IndexedDB (with assets):', track.url);
        } catch (e) {
            console.error('[PWA] Download failed', e);
            alert('Failed to download track for offline use.');
        } finally {
            pendingDownloads.delete(track.url);
            refreshCurrentView();
        }
    }

    async function removeOfflineTrack(trackPath) {
        await deleteTrackFromIDB(trackPath);
        downloadedTracksMap.delete(trackPath);
        refreshCurrentView();
    }

    function refreshCurrentView() {
        // Re-render whatever view is active to update download icons
        const activeView = document.querySelector('.view.active');
        if (!activeView) return;

        if (activeView.id === 'album-view') {
            const albumName = albumHeroDiv.querySelector('.album-hero-title')?.textContent;
            if (albumName && albumsData[albumName]) {
                const album = albumsData[albumName];
                const albumTrackList = activeView.querySelector('.track-list');
                renderTrackList(album.tracks, albumTrackList, false, null, true, true);
                updateAlbumHeroOfflineStatus(album);
            }
        } else if (activeView.id === 'artist-view') {
            // Difficult to refresh artist view perfectly without data stored globally
        } else if (activeView.id === 'playlist-view') {
            const pl = allPlaylists.find(p => p.id === activePlaylistId);
            if (pl) {
                const isOwn = currentUser && pl.userId === currentUser.uid;
                renderTrackList(pl.tracks, playlistTrackList, true, pl.id, isOwn);
            }
        } else if (activeView.id === 'search-view') {
            const query = searchInput.value || (mobileSearchInput ? mobileSearchInput.value : '');
            if (query) Search.renderSearchResults(query);
        }

        // Update Global Player Bar offline status if something is playing
        if (Playback.currentTrack && bottomOfflineBtn) {
            const isOffline = downloadedTracksMap.has(Playback.currentTrack.url);
            const downloadProgress = pendingDownloads.get(Playback.currentTrack.url);

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

    // Initialize offline list on start
    async function syncOfflineState() {
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
    bottomArtist.addEventListener('click', (e) => {
        if (!Playback.currentTrack) return;
        const link = e.target.closest('.bottom-artist-link');
        if (link) {
            openArtistView(link.dataset.artist);
        } else {
            const artistName = (Playback.currentTrack.metadata && Playback.currentTrack.metadata.artist) ? Playback.currentTrack.metadata.artist : "Unknown Artist";
            openArtistView(splitArtists(artistName)[0]);
        }
    });

    bottomTitle.addEventListener('click', () => {
        if (!Playback.currentTrack) return;

        const albumName = (Playback.currentTrack.metadata && Playback.currentTrack.metadata.album) ? Playback.currentTrack.metadata.album : "Unknown Album";
        const albumInfo = albumsData[albumName];

        if (albumInfo) {
            openAlbumView(albumInfo);

            // Find index of the playing track inside the newly rendered album view
            const playingIndex = albumInfo.tracks.findIndex(t => t.url === Playback.currentTrack.url);

            if (playingIndex !== -1) {
                const container = document.getElementById('track-list');
                const trackItems = container.querySelectorAll('.track-item');
                if (trackItems[playingIndex]) {
                    const item = trackItems[playingIndex];

                    // Calculate relative scroll position to avoid bubbling up to body
                    const scale = Theme.getZoomScale();
                    const relativeTop = (item.getBoundingClientRect().top - container.getBoundingClientRect().top) / scale;
                    const scrollPosition = container.scrollTop + relativeTop - (container.clientHeight / 2) + (item.clientHeight / 2);

                    container.scrollTo({
                        top: Math.max(0, scrollPosition),
                        behavior: 'smooth'
                    });
                }
            }
        }
    });

    // Desktop Sidebar Toggle
    const desktopSidebarToggle = document.getElementById('desktop-sidebar-toggle');
    const desktopSidebar = document.getElementById('desktop-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (desktopSidebarToggle && desktopSidebar && sidebarOverlay) {
        desktopSidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = desktopSidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active', isActive);
            if (mobileMenuBtn) mobileMenuBtn.classList.toggle('active', isActive);
        });

        // Close sidebar if clicking outside
        document.addEventListener('click', (e) => {
            if (desktopSidebar.classList.contains('active') &&
                !desktopSidebar.contains(e.target) &&
                e.target !== desktopSidebarToggle &&
                !desktopSidebarToggle.contains(e.target)) {
                closeSidebar();
            }
        });
    }


    // Likes System Listeners
    const likeTrackBtn = document.getElementById('like-track-btn');
    if (likeTrackBtn) {
        likeTrackBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLike();
        });
    }

    const sidebarLikesBtn = document.getElementById('sidebar-likes-btn');
    if (sidebarLikesBtn) {
        sidebarLikesBtn.addEventListener('click', () => {
            if (!currentUser) {
                // Must be logged in to view likes
                if (loginOverlay) loginOverlay.classList.remove('hidden');
                return;
            }
            switchToLikesView();
            closeSidebar();
        });
    }

    const sidebarStatsBtn = document.getElementById('sidebar-stats-btn');
    if (sidebarStatsBtn) {
        sidebarStatsBtn.addEventListener('click', () => {
            switchToStatsView();
            closeSidebar();
        });
    }

    const sidebarDownloadsBtn = document.getElementById('sidebar-downloads-btn');
    if (sidebarDownloadsBtn) {
        sidebarDownloadsBtn.addEventListener('click', () => {
            switchToDownloadsView();
            closeSidebar();
        });
    }


    const sidebarHistoryBtn = document.getElementById('sidebar-history-btn');
    if (sidebarHistoryBtn) {
        sidebarHistoryBtn.addEventListener('click', () => {
            switchToHistoryView();
            closeSidebar();
        });
    }

    const sidebarProfileBtn = document.getElementById('sidebar-profile-btn');
    if (sidebarProfileBtn) {
        sidebarProfileBtn.addEventListener('click', () => {
            renderProfilePanel();
            openProfile();
            closeSidebar();
        });
    }

    const sidebarSettingsBtn = document.getElementById('sidebar-settings-btn');
    if (sidebarSettingsBtn) {
        sidebarSettingsBtn.addEventListener('click', () => {
            renderSettingsPanel();
            openSettings();
            closeSidebar();
        });
    }

    // --- Module Initializations (Must happen before first render) ---
    Search.init();
    Theme.init({ serverBaseUrl });
    Stats.init({ serverBaseUrl });
    
    Metadata.init({
        serverBaseUrl,
        selectors: {
            healthCheck: {
                container: 'check-progress-container',
                status: 'check-progress-status',
                start: 'check-metadata-start-btn'
            }
        },
        callbacks: {
            onLibraryRefresh: async () => await initializeMusicLibrary(),
            onAlbumRefresh: async (albumName) => {
                const album = albumsData[albumName];
                if (album) openAlbumView(album, false);
            },
            getSharedCoverUrl: (path, artist, album) => getSharedCoverUrl(path, artist, album)
        }
    });

    Playlist.init({
        serverBaseUrl,
        currentUser,
        selectors: {
            hero: 'playlist-hero'
        },
        callbacks: {
            onNavigate: (playlist) => openPlaylistView(playlist),
            onPlay: (track, list, index) => Playback.playTrack(track, list, index),
            onDelete: (id) => deletePlaylist(id),
            onRenamed: (id, name) => renamePlaylist(id, name)
        }
    });

    Lyrics.init({
        container: lyricsContainer,
        immersiveView: immersiveView,
        actionBar: document.getElementById('lyrics-action-bar')
    });

    Playback.init({
        onTrackChange: (track) => {
            updateNowPlayingUI(track);
            if (typeof updateImmersiveUpNext === 'function') updateImmersiveUpNext();
            _fillInfiniteBuffer();
        },
        onPlayStateChange: (isPlaying) => {
            const icon = document.getElementById('play-icon');
            const btn = document.getElementById('play-pause-btn');

            if (isPlaying) {
                if (icon) icon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
                if (btn) btn.title = 'Pause';
            } else {
                if (icon) icon.setAttribute('d', 'M8 5v14l11-7z');
                if (btn) btn.title = 'Play';
            }

            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
            }
        },
        onProgress: (seek, duration) => {
            if (!isDraggingScrubber) {
                const percent = (seek / duration) * 100;
                progressFill.style.width = `${isFinite(percent) ? percent : 0}%`;
                currentTimeEl.textContent = formatTime(seek);
                totalTimeEl.textContent = formatTime(duration);

                // Sync Lyrics
                Lyrics.sync();

                // Update mobile player bar progress
                const playerBar = document.querySelector('.player-bar');
                if (playerBar && window.innerWidth <= 768) {
                    playerBar.style.setProperty('--player-progress', `${percent}%`);
                }
            }
        },
        onQueueUpdate: () => {
            if (queueView && queueView.classList.contains('active')) renderQueueView();
            updateImmersiveUpNext();
        },
        onQueueEnd: () => {
            _fillInfiniteBuffer();
        }
    });

    // --- Initial State Restoration ---
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
        // Expose UI functions for modular access (js/search.js, etc)
        window.switchToSearchView = switchToSearchView;
        window.switchToHomeView = switchToHomeView;
        window.openArtistView = openArtistView;
        window.openPlaylistView = openPlaylistView;
        window.renderTrackList = renderTrackList;
        window.openCreatePlaylistModal = openCreatePlaylistModal;
        window.triggerPlaylistCoverChange = (id) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (re) => {
                    const img = new Image();
                    img.onload = async () => {
                        const canvas = document.createElement('canvas');
                        const MAX_WIDTH = 500;
                        let width = img.width;
                        let height = img.height;
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        const base64 = canvas.toDataURL('image/jpeg', 0.8);
                        await updatePlaylistCover(id, base64);
                    };
                    img.src = re.target.result;
                };
                reader.readAsDataURL(file);
            };
            input.click();
        };
        window.fetchAndApplyArtistImage = (name, node, xl) => Theme.applyArtistVisuals(name, node, xl);
        window.splitArtists = splitArtists;
        window.getSharedCoverUrl = getSharedCoverUrl;

        // Initialize UI states from module
        shuffleBtn.classList.toggle('toggle-active', Playback.isShuffleActive);
        updateRepeatUI(Playback.repeatMode);

        switchToHomeView(false);
        window.isAppInitialized = true;

        // Check for initial hash and navigate if needed (after initialization)
        const initialHash = window.location.hash.substring(1);
        if (initialHash && initialHash !== 'home') {
            renderState(initialHash);
        }
    } catch (err) {
        console.error("Initialization failed:", err);
        switchToHomeView(false); // fallback
        window.isAppInitialized = true;
    }
});
