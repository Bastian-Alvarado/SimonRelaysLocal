const DEFAULT_SERVER_URL = (window.location.protocol.startsWith('http') && window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.'))
    ? window.location.origin
    : 'http://localhost:3000';
const serverBaseUrl = API.getBaseUrl();

const libraryLoadingOverlay = document.getElementById('library-loading-overlay');
const CARD_PLAY_BTN_HTML = `<button class="card-play-btn" title="Play">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
</button>`;

const deviceId = localStorage.getItem('deviceId') || crypto.randomUUID();
localStorage.setItem('deviceId', deviceId);

// Shared Global State (Phase 4 Modularization - Centralized State)
// All state is now managed via the State module (js/state.js)
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
    // Expose core functions to window for modular access
    window.splitArtists = splitArtists;
    window.getSharedCoverUrl = getSharedCoverUrl;
    window.CARD_PLAY_BTN_HTML = CARD_PLAY_BTN_HTML;
    window.formatHeroDuration = formatHeroDuration;
    window.isTrackUnsupported = isTrackUnsupported;
    window.isSameTrack = isSameTrack;
    window.getQualityLabel = getQualityLabel;
    window.openAlbumView = openAlbumView;
    window.openArtistView = openArtistView;
    window.openPlaylistView = openPlaylistView;
    window.openCreatePlaylistModal = openCreatePlaylistModal;
    window.hideQueueOverlay = hideQueueOverlay;
    window.hideImmersiveOverlay = hideImmersiveOverlay;
    window.hideContextMenu = hideContextMenu;
    window.closeSettings = closeSettings;
    window.renderTrackList = (...args) => UI.renderTrackList(...args);
    window.setupTrackListeners = setupTrackListeners;
    window.setupAlbumCardListeners = setupAlbumCardListeners;
    window.setupAlbumHeroListeners = setupAlbumHeroListeners;
    window.renderRecentArtists = renderRecentArtists;
    window.fetchAndApplyArtistImage = (name, node, xl) => Theme.applyArtistVisuals(name, node, xl);
    window.switchToSearchView = () => Router.switchToView('search');

    // Initialize Modules
    Theme.init({ serverBaseUrl });
    Stats.init({ serverBaseUrl });
    Animations.init();

    // Populate Dynamic Shared UI
    if (window.UI) {
        UI.populateSharedContainers();
        const immersiveContainer = document.getElementById('immersive-content');
        if (immersiveContainer) UI.renderImmersiveContent(immersiveContainer, {});
    }

    // Apply Appearance Preferences
    if (localStorage.getItem('hideAppIcon') === 'true') {
        document.querySelectorAll('.app-logo-icon').forEach(icon => {
            icon.style.display = 'none';
        });
    }

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

    // Global State managed via State module (js/state.js)


    // Router Initialization
    Router.init({
        views: {
            home: homeView,
            search: searchView,
            artist: artistView,
            album: albumView,
            playlist: playlistView,
            likes: document.getElementById('likes-view'),
            history: document.getElementById('history-view'),
            downloads: document.getElementById('downloads-view'),
            stats: document.getElementById('stats-view'),
            profile: profileView
        },
        onRouteChanged: (viewId, stateData, push) => {
            switch (viewId) {
                case 'home': Router.switchToView('home'); break;
                case 'search':
                    if (stateData.query !== undefined) {
                        if (searchInput) searchInput.value = stateData.query;
                        if (mobileSearchInput) mobileSearchInput.value = stateData.query;
                        Search.renderSearchResults(stateData.query);
                    }
                    Router.switchToView('search');
                    break;
                case 'album':
                    if (stateData.albumInfo) openAlbumView(stateData.albumInfo, false);
                    else Router.switchToView('album');
                    break;
                case 'artist':
                    if (stateData.artistName) openArtistView(stateData.artistName, false);
                    else Router.switchToView('artist');
                    break;
                case 'playlist':
                    if (stateData.playlist) openPlaylistView(stateData.playlist, false);
                    else Router.switchToView('playlist');
                    break;
                case 'settings': openSettings(false, stateData.tab || 'appearance'); break;
                case 'profile':
                    renderProfilePanel();
                    openProfile(false);
                    break;
                case 'history':
                    Router.switchToView('history');
                    renderHistoryView();
                    break;
                case 'likes':
                    Router.switchToView('likes');
                    renderLikesView();
                    break;
                case 'downloads':
                    Router.switchToView('downloads');
                    fetchDownloads();
                    break;
                case 'queue': showQueueOverlay(); break;
                case 'immersive': showImmersiveOverlay(); break;
                case 'stats':
                    Router.switchToView('stats');
                    renderStatsView();
                    break;
            }
        }
    });

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
                State.set('currentUser', user);
                if (typeof Playlist !== 'undefined') Playlist.init({ currentUser: user });

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
                    State.set('allPlaylists', []);

                    State.get('likedTracks').clear();

                    State.set('allLikedTracksCache', []);
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
    let currentPlaylistId = null;
    let currentTrackItem = null;
    let pendingAddTrack = null;
    let activePlaylistId = null;

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


    // State managed via State module

    // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
    const immersiveLyrics = document.getElementById('immersive-lyrics-container');
    const lyricsActionBar = document.getElementById('lyrics-action-bar');

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
            Router.navigate('home', {}, false);
        } else {
            // If we're entering immersive mode from an overlay (Settings, Profile, etc.),
            // replace the current history entry so that exiting immersive mode doesn't
            // re-open the overlay we just came from.
            const isOverlayActive = (settingsView && settingsView.classList.contains('active')) ||
                (profileView && profileView.classList.contains('active'));

            if (isOverlayActive) {
                Router.navigate('immersive', {}, false);
            } else {
                Router.navigate('immersive');
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
    const toggleLyricsBtn = document.getElementById('toggle-lyrics-btn');
    if (toggleLyricsBtn) {
        toggleLyricsBtn.addEventListener('click', () => {
            const isHidden = immersiveView.classList.toggle('hide-lyrics');
            toggleLyricsBtn.classList.toggle('active-toggled', isHidden);
        });
    }

    const toggleArtBtn = document.getElementById('toggle-art-btn');
    if (toggleArtBtn) {
        toggleArtBtn.addEventListener('click', () => {
            const isHidden = immersiveView.classList.toggle('hide-art');
            toggleArtBtn.classList.toggle('active-toggled', isHidden);
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

        // Initialize immersive aurora background state
        const glowEnabled = localStorage.getItem('immersiveBgGlowEnabled') !== 'false';
        const immersiveBgWrapper = document.querySelector('.immersive-bg-wrapper');
        if (immersiveBgWrapper) {
            immersiveBgWrapper.classList.toggle('aurora-enabled', glowEnabled);
        }

        // instantly scroll to active lyric if any
        Lyrics.sync();

        // Populate Up Next badge
        updateImmersiveUpNext();

        // Start immersive audio visualizer
        if (window.Visualizer) {
            Visualizer.init();
            Visualizer.start();
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

            // Stop immersive audio visualizer
            if (window.Visualizer) {
                Visualizer.stop();
            }
        }
    }

    // Auto-exit immersive if user exits fullscreen manually (e.g. Escape key)
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && immersiveView && immersiveView.classList.contains('active')) {
            // Only exit if the URL hash is still #immersive
            if (window.location.hash === '#immersive') {
                hideImmersiveOverlay();
                // Return to home state without triggering a 'back' event
                Router.navigate('home', {}, false);
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

        let nextArtUrl = '';
        if (upNext.metadata && upNext.metadata.hasCover && upNext.relativePath) {
            nextArtUrl = getSharedCoverUrl(upNext.relativePath, upNext.metadata.artist, upNext.metadata.album);
        }

        immersiveUpNext.innerHTML = Templates.ImmersiveUpNext({
            nextTrack: upNext,
            nextArtUrl: nextArtUrl
        });

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
        UI.renderQueueView();
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
    function openSettings(push = true, targetTab = 'appearance') {
        if (push) Router.navigate('settings', { tab: targetTab });
        hideOverlays('settings'); // Close other overlays first
        renderSettingsPanel(targetTab);
        Router.openViewAnimated(settingsView);
        if (settingsBtn) settingsBtn.classList.add('settings-btn-active');
    }

    function closeSettings() {
        settingsView.classList.remove('active');
        setTimeout(() => {
            if (!settingsView.classList.contains('active')) {
                settingsView.classList.add('hidden');
            }
        }, 300);
        if (settingsBtn) settingsBtn.classList.remove('settings-btn-active');
    }

    function openProfile(push = true) {
        if (push) Router.navigate('profile');
        hideOverlays();

        Router.switchToView('profile');
        renderProfilePanel();
    }

    function closeProfile() {
        Router.navigate('home');
    }

    // ΓöÇΓöÇ Profile Panel Renderer ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    window.setupProfileListeners = (profileBody) => {
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
    };

    function renderProfilePanel() {
        UI.renderProfilePanel(State.get('currentUser'));
    }


    async function updateProfileData(displayName, photoBase64) {
        if (!State.get('currentUser')) return;
        const statusEl = document.getElementById('profile-status');
        if (statusEl) {
            statusEl.textContent = 'Saving...';
            statusEl.style.color = 'var(--accent)';
        }

        try {
            const updates = {};
            if (displayName !== undefined) updates.displayName = displayName;
            if (photoBase64 !== undefined) updates.photoURL = photoBase64;

            await State.get('currentUser').updateProfile(updates);

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
            const albumInfo = Object.values(State.get('albumsData')).find(a => a.name === albumName);
            if (albumInfo) {
                openAlbumView(albumInfo);
            } else {
                // Fallback: search for tracks with this album name if not in State.get('albumsData')
                console.warn(`Album info not found in State.get('albumsData'), falling back to manual search`);
            }
        }
    });



    // ΓöÇΓöÇ Settings Panel Renderer ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    window.setupSettingsListeners = (body, header) => {
        // Theme Handlers
        const themeCards = body.querySelectorAll('.theme-card');
        themeCards.forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.id === 'custom-theme-picker') return;
                const themeId = card.dataset.theme;
                Theme.setProfile(themeId);
                themeCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                if (themeId === 'custom') {
                    const picker = card.querySelector('#custom-theme-picker');
                    if (picker) picker.showPicker ? picker.showPicker() : picker.click();
                }
                if (themeId === 'rgb' && Playback.currentTrack) {
                    Theme.updateNowPlayingVisuals(Playback.currentTrack, State.get('currentActiveCoverUrl'));
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
            customPicker.addEventListener('change', (e) => Theme.applyCustomColor(e.target.value));
        }

        // Appearance Handlers
        const zoomSlider = document.getElementById('setting-zoom-slider');
        const zoomValue = document.getElementById('setting-zoom-value');
        if (zoomSlider && zoomValue) {
            zoomSlider.addEventListener('input', (e) => {
                const val = e.target.value;
                zoomValue.textContent = val + '%';
                Theme.setZoom(val);
                setTimeout(() => { if (typeof renderHomeGrid === 'function') renderHomeGrid(); }, 100);
            });
        }

        const appIconToggle = document.getElementById('setting-app-icon-toggle');
        if (appIconToggle) {
            appIconToggle.addEventListener('change', (e) => {
                const show = e.target.checked;
                localStorage.setItem('hideAppIcon', show ? 'false' : 'true');
                document.querySelectorAll('.app-logo-icon').forEach(icon => {
                    icon.style.display = show ? '' : 'none';
                });
            });
        }

        const immersiveBgToggle = document.getElementById('setting-immersive-bg-toggle');
        if (immersiveBgToggle) {
            immersiveBgToggle.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                localStorage.setItem('immersiveBgGlowEnabled', enabled ? 'true' : 'false');
                const immersiveBgWrapper = document.querySelector('.immersive-bg-wrapper');
                if (immersiveBgWrapper) {
                    immersiveBgWrapper.classList.toggle('aurora-enabled', enabled);
                }
            });
        }

        const visualizerCards = body.querySelectorAll('.visualizer-card');
        const visualizerUploadRow = body.querySelector('#visualizer-upload-row');
        const visualizerFileInput = body.querySelector('#setting-visualizer-file');
        const visualizerUploadBtn = body.querySelector('#setting-visualizer-upload-btn');
        const visualizerFileName = body.querySelector('#setting-visualizer-file-name');

        if (visualizerCards.length > 0) {
            visualizerCards.forEach(card => {
                card.addEventListener('click', () => {
                    const mode = card.getAttribute('data-mode');
                    
                    // Update active card highlight
                    visualizerCards.forEach(c => c.classList.remove('active'));
                    card.classList.add('active');

                    if (window.Visualizer) {
                        Visualizer.setMode(mode);
                    }

                    if (visualizerUploadRow) {
                        if (mode === 'custom') {
                            visualizerUploadRow.classList.remove('hidden');
                        } else {
                            visualizerUploadRow.classList.add('hidden');
                        }
                    }
                });
            });
        }

        if (visualizerUploadBtn && visualizerFileInput) {
            visualizerUploadBtn.addEventListener('click', () => {
                visualizerFileInput.click();
            });
        }

        if (visualizerFileInput) {
            visualizerFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (visualizerFileName) {
                    visualizerFileName.textContent = file.name;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    if (window.Visualizer) {
                        Visualizer.handleCustomUpload(event.target.result);
                        console.log('[Visualizer] Custom HTML uploaded, bytes:', event.target.result.length);
                    }
                };
                reader.readAsText(file);

                // Reset the input so re-selecting the same file triggers the change event
                e.target.value = '';
            });
        }

        const animToggle = document.getElementById('setting-animations-toggle');
        if (animToggle) {
            animToggle.addEventListener('change', (e) => {
                Animations.toggle(e.target.checked);
            });
        }

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

        const setupCustomSelect = (inputId, dropdownId, storageKey) => {
            const input = document.getElementById(inputId);
            const dropdown = document.getElementById(dropdownId);
            if (!input || !dropdown) return;
            const qualityOptions = [
                { value: 'original', label: 'Original' },
                { value: '320', label: '320kbps' },
                { value: '192', label: '192kbps' },
                { value: '128', label: '128kbps' }
            ];
            const updateInputVal = (val) => {
                const opt = qualityOptions.find(o => o.value === val);
                input.value = opt ? opt.label : 'Original';
                input.dataset.value = val;
            };
            const currentVal = localStorage.getItem(storageKey) || 'original';
            updateInputVal(currentVal);
            dropdown.innerHTML = '';
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
                e.preventDefault();
                dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
                input.focus();
            });
            input.addEventListener('blur', () => dropdown.style.display = 'none');
        };

        setupCustomSelect('setting-stream-quality', 'setting-stream-quality-dropdown', 'streamQuality');
        setupCustomSelect('setting-download-quality', 'setting-download-quality-dropdown', 'downloadQuality');

        const sections = body.querySelectorAll('.settings-section');
        const noResults = body.querySelector('#settings-no-results');
        const searchInput = header.querySelector('#settings-search-input');
        const tabs = header.querySelectorAll('.settings-tab');

        const filterSettings = () => {
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
            if (noResults) noResults.style.display = visibleCount === 0 ? 'block' : 'none';
        };

        if (searchInput) searchInput.addEventListener('input', filterSettings);
        tabs.forEach(tabBtn => {
            tabBtn.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tabBtn.classList.add('active');
                filterSettings();
            });
        });

        // Cloud Upload handlers
        const uploadBtn = body.querySelector('#cloud-upload-btn');
        const uploadInput = body.querySelector('#cloud-upload-input');

        if (uploadBtn && uploadInput) {
            uploadBtn.addEventListener('click', () => uploadInput.click());
            // Initial UI sync
            updateUploadUI();
            uploadInput.addEventListener('change', async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;

                const uploadState = {
                    isUploading: true,
                    successCount: 0,
                    errorCount: 0,
                    totalFiles: files.length,
                    currentFileName: '',
                    overallPercent: 0,
                    currentFilePercent: 0,
                    statusText: 'Preparing uploads...'
                };
                State.set('uploadState', { ...uploadState });

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];

                    uploadState.currentFileName = file.name;
                    uploadState.overallPercent = (i / files.length) * 100;
                    uploadState.currentFilePercent = 0;
                    uploadState.statusText = `Uploading ${file.name}...`;
                    State.set('uploadState', { ...uploadState });

                    try {
                        await new Promise((resolve, reject) => {
                            const xhr = new XMLHttpRequest();
                            xhr.open('POST', `${serverBaseUrl}/api/upload`);
                            xhr.setRequestHeader('x-filename', file.name);
                            xhr.setRequestHeader('Content-Type', file.type || 'audio/mpeg');

                            xhr.upload.onprogress = (event) => {
                                if (event.lengthComputable) {
                                    uploadState.currentFilePercent = (event.loaded / event.total) * 100;
                                    State.set('uploadState', { ...uploadState });
                                }
                            };

                            xhr.onload = () => {
                                if (xhr.status >= 200 && xhr.status < 300) {
                                    uploadState.successCount++;
                                    resolve();
                                } else {
                                    uploadState.errorCount++;
                                    reject(new Error(`Upload failed with status ${xhr.status}`));
                                }
                                State.set('uploadState', { ...uploadState });
                            };

                            xhr.onerror = () => {
                                uploadState.errorCount++;
                                State.set('uploadState', { ...uploadState });
                                reject(new Error('Network error during upload'));
                            };

                            xhr.send(file);
                        });
                    } catch (err) {
                        console.error('Upload error for', file.name, err);
                    }
                }

                // Final state
                uploadState.isUploading = false;
                uploadState.overallPercent = 100;
                uploadState.currentFilePercent = 100;
                uploadState.statusText = `Done! ${uploadState.successCount} uploaded, ${uploadState.errorCount} failed.`;
                State.set('uploadState', { ...uploadState });

                if (uploadState.successCount > 0) {
                    if (typeof initializeMusicLibrary === 'function') await initializeMusicLibrary(true);
                }

                setTimeout(() => {
                    const current = State.get('uploadState');
                    if (!current.isUploading) {
                        State.set('uploadState', { ...current, statusText: '' });
                    }
                }, 5000);
            });
        }

        // Transcode Double Check handler
        const triggerBtn = body.querySelector('#trigger-transcoder-btn');
        const triggerStatus = body.querySelector('#transcoder-status');
        if (triggerBtn) {
            triggerBtn.addEventListener('click', async () => {
                triggerBtn.disabled = true;
                const originalText = triggerBtn.textContent;
                triggerBtn.textContent = 'Triggering...';
                if (triggerStatus) {
                    triggerStatus.textContent = 'Contacting server...';
                    triggerStatus.style.color = 'var(--text-secondary)';
                }

                try {
                    const result = await API.triggerTranscoder();
                    if (triggerStatus) {
                        if (result.alreadyRunning) {
                            triggerStatus.textContent = 'Transcoder is already running.';
                            triggerStatus.style.color = 'var(--accent)';
                        } else {
                            triggerStatus.textContent = 'Background scan started successfully.';
                            triggerStatus.style.color = '#4caf50';
                        }
                    }
                } catch (e) {
                    console.error('Failed to trigger transcoder', e);
                    if (triggerStatus) {
                        triggerStatus.textContent = 'Failed to trigger scan: ' + e.message;
                        triggerStatus.style.color = '#f44336';
                    }
                } finally {
                    triggerBtn.textContent = originalText;
                    triggerBtn.disabled = false;
                    setTimeout(() => {
                        if (triggerStatus) triggerStatus.textContent = '';
                    }, 5000);
                }
            });
        }

        // Refresh Music Library handler
        const refreshBtn = body.querySelector('#refresh-library-btn');
        const refreshStatus = body.querySelector('#refresh-library-status');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                const originalText = refreshBtn.textContent;
                refreshBtn.textContent = 'Scanning...';
                if (refreshStatus) {
                    refreshStatus.textContent = 'Scanning server directory and updating cache...';
                    refreshStatus.style.color = 'var(--text-secondary)';
                }

                try {
                    const result = await API.refreshLibrary();
                    if (refreshStatus) {
                        refreshStatus.textContent = `Library scanned successfully! Total songs: ${result.trackCount}`;
                        refreshStatus.style.color = '#4caf50';
                    }
                    if (typeof initializeMusicLibrary === 'function') {
                        await initializeMusicLibrary(true);
                    }
                } catch (e) {
                    console.error('Failed to refresh library', e);
                    if (refreshStatus) {
                        refreshStatus.textContent = 'Failed to scan: ' + e.message;
                        refreshStatus.style.color = '#f44336';
                    }
                } finally {
                    refreshBtn.textContent = originalText;
                    refreshBtn.disabled = false;
                    setTimeout(() => {
                        if (refreshStatus) refreshStatus.textContent = '';
                    }, 5000);
                }
            });
        }

        filterSettings();

    };

    function renderSettingsPanel(activeTab = null) {
        const header = settingsView.querySelector('.settings-header');
        const tabs = header?.querySelectorAll('.settings-tab');
        if (activeTab && tabs) {
            tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
        }

        UI.renderSettingsPanel({
            activeTab: activeTab || 'appearance',
            Theme,
            Animations,
            Playback,
            currentCustomUrl: localStorage.getItem('serverUrl') || '',
            DEFAULT_SERVER_URL,
            uploadState: State.get('uploadState')
        });
    }

    // Global Cloud Upload UI Synchronizer
    const updateUploadUI = () => {
        const state = State.get('uploadState');
        if (!state) return;

        const uploadStatus = document.getElementById('cloud-upload-status');
        const progressContainer = document.getElementById('cloud-upload-progress-container');
        const overallFill = document.getElementById('upload-overall-fill');
        const overallText = document.getElementById('upload-overall-text');
        const currentFill = document.getElementById('upload-current-fill');
        const currentText = document.getElementById('upload-current-text');
        const btn = document.getElementById('cloud-upload-btn');

        // Only show progress if uploading OR showing a "Done" status
        if (progressContainer) {
            const isVisible = state.isUploading || (state.statusText && state.statusText.includes('Done'));
            progressContainer.classList.toggle('hidden', !isVisible);
        }

        if (uploadStatus) {
            uploadStatus.textContent = state.statusText;
            if (state.statusText.includes('Done')) {
                uploadStatus.style.color = state.errorCount > 0 ? '#f44336' : '#4caf50';
            } else {
                uploadStatus.style.color = 'var(--text-secondary)';
            }
        }
        if (overallFill) overallFill.style.width = `${state.overallPercent}%`;
        if (overallText) overallText.textContent = `${state.successCount + state.errorCount}/${state.totalFiles} files`;
        if (currentFill) currentFill.style.width = `${state.currentFilePercent}%`;
        if (currentText) currentText.textContent = `${Math.round(state.currentFilePercent)}%`;
        if (btn) {
            btn.disabled = state.isUploading;
            btn.textContent = state.isUploading ? 'Uploading...' : 'Select Files';
        }
    };

    // Global subscription to sync upload UI across re-renders
    State.subscribe((key) => {
        if (key === 'uploadState') updateUploadUI();
    });

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

            const isOffline = State.get('downloadedTracksMap').has(Playback.currentTrack.url);
            const isDownloading = State.get('pendingDownloads').has(Playback.currentTrack.url);

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
        const sessionAffinity = State.get('sessionAffinity');
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
        State.notify('sessionAffinity', sessionAffinity);
    }

    function _isLastTrackInContext() {
        if (Playback.queue.length > 0 || Playback.repeatMode !== 0 || Playback.currentPlaylistContext.length === 0) return false;
        return Playback.upcomingTracks.length === 0;
    }

    function _pickRecommendedTrack(currentTrack, virtualHistory = null) {
        if (!State.get('allTracks') || State.get('allTracks').length === 0) return null;
        const currentYear = parseInt(currentTrack?.metadata?.year) || 0;

        const candidates = State.get('allTracks').filter(t =>
            !isTrackUnsupported(t) && t.url !== currentTrack?.url
        );
        if (candidates.length === 0) return null;

        const historyToUse = virtualHistory || State.get('sessionHistory');
        const sessionAffinity = State.get('sessionAffinity');

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
            if (State.get('likedTracks').has(track.url)) {
                score += 20;
            }

            // 4. Discovery Nudge - Weight: 15
            const hasPlayedBefore = State.get('historyTracks').some(h => h.url === track.url);
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
                const t = State.get('allTracks').find(x => x.url === url);
                const tArtists = splitArtists(t?.metadata?.artist || '');
                return tArtists.some(a => trackArtists.includes(a));
            })) {
                score -= 30;
            } else if (recentHistory.some(url => {
                const t = State.get('allTracks').find(x => x.url === url);
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
        if (Playback.repeatMode !== 0 || !State.get('allTracks') || State.get('allTracks').length === 0) return;

        const ctx = Playback.currentPlaylistContext;
        const idx = Playback.currentTrackIndex;

        // Only trigger if we actually need tracks to maintain the rolling buffer of 10
        // (Lockout condition removed to allow seamless transition for large albums/playlists)

        const remaining = Playback.remainingContextCount;
        const needed = 10 - remaining;
        if (needed <= 0) return;

        let lastTrack = ctx[ctx.length - 1] || null;

        // Use a virtual history to ensure the 10-track batch is diverse
        let tempHistory = [...State.get('sessionHistory')];
        // Add existing unplayed context to temp history
        if (idx !== -1) {
            ctx.slice(idx + 1).forEach(t => tempHistory.push(t.url));
        }

        let addedAny = false;
        for (let i = 0; i < needed; i++) {
            const pick = _pickRecommendedTrack(lastTrack, tempHistory);
            if (pick) {
                Playback.appendContext(pick);
                ctx._isInfinite = true; // "Lock in" the infinite state for this selection
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
    let lastVolume = Playback.volume > 0 ? Playback.volume : 0.7;
    let isDraggingVolume = false;

    function setMuteIcon(isMuted) {
        if (isMuted) {
            muteIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>`;
        } else {
            muteIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>`;
        }
    }

    volumeFill.style.width = `${Playback.volume * 100}%`;
    if (Playback.volume === 0) setMuteIcon(true);

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
        Router.navigate('home');
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
            Router.navigate('home');
        });
    }

    if (mobileSearchBtn) {
        mobileSearchBtn.addEventListener('click', () => {
            Router.navigate('search', { query: '' });
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



    // Export necessary helpers for modules
    window.saveTrackToIDB = saveTrackToIDB;
    window.deleteTrackFromIDB = deleteTrackFromIDB;


    // ΓöÇΓöÇ Music Library Initialization ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    async function initializeMusicLibrary(force = false) {
        if (window.isAppInitialized && !force) return;

        try {
            if (libraryLoadingOverlay) libraryLoadingOverlay.classList.remove('hidden');

            // Delegate to the modular Library system
            await Library.load();

            // Synchronize modular state with global State
            State.set('allTracks', window.allTracks);
            State.set('albumsData', window.albumsData);

            await fetchLikes();
            renderHomeGrid();

            // Dynamically refresh the currently active view if force-reloaded
            if (force && history.state && history.state.viewId) {
                const { viewId, stateData } = history.state;
                if (viewId === 'album' && stateData && stateData.albumInfo) {
                    const freshAlbums = State.get('albumsData');
                    const freshAlbum = freshAlbums[stateData.albumInfo.name];
                    if (freshAlbum) {
                        openAlbumView(freshAlbum, false);
                    }
                } else if (viewId === 'artist' && stateData && stateData.artistName) {
                    openArtistView(stateData.artistName, false);
                } else if (viewId === 'playlist' && stateData && stateData.playlist) {
                    openPlaylistView(stateData.playlist, false);
                } else if (viewId === 'likes') {
                    renderLikesView();
                } else if (viewId === 'history') {
                    renderHistoryView();
                } else if (viewId === 'downloads') {
                    fetchDownloads();
                } else if (viewId === 'search' && stateData && stateData.query !== undefined) {
                    Search.renderSearchResults(stateData.query);
                }
            }

            if (libraryLoadingOverlay) libraryLoadingOverlay.classList.add('hidden');
        } catch (error) {
            console.error('[Library] Initialization failed:', error);
            if (libraryLoadingOverlay) libraryLoadingOverlay.classList.add('hidden');
            renderHomeGrid();
        }
    }
    // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ



    function renderHomeGrid() {
        UI.renderHomeGrid();
    }

    function setupAlbumCardListeners(card, albumInfo) {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.artist-link')) return;
            openAlbumView(albumInfo);
        });
        const playBtn = card.querySelector('.card-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tracks = albumInfo.tracks;
                if (tracks && tracks.length > 0) {
                    Playback.playTrack(tracks[0], tracks, 0);
                }
            });
        }
    }

    function setupAlbumHeroListeners(heroEl, albumInfo, isOffline, isDownloading) {
        // Play All
        const playBtn = heroEl.querySelector('.album-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                const tracks = albumInfo.tracks;
                if (tracks && tracks.length > 0) {
                    Playback.playTrack(tracks[0], tracks, 0);
                }
            });
        }

        // Download Album
        const downloadBtn = heroEl.querySelector('.download-album-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                if (isOffline || isDownloading) return;
                downloadAlbum(albumInfo);
            });
        }

        // Edit Info
        const editBtn = heroEl.querySelector('.edit-album-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                Metadata.openAlbumEditor(albumInfo);
            });
        }

        // Check Metadata
        const checkBtn = heroEl.querySelector('.check-metadata-btn');
        if (checkBtn) {
            checkBtn.addEventListener('click', () => {
                Metadata.openHealthCheck(albumInfo);
            });
        }

        const backBtn = heroEl.querySelector('.playlist-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => history.back());
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
        if (push) {
            Router.navigate('album', { albumInfo });
            return;
        }
        Router.switchToView('album');
        UI.renderAlbumView(albumInfo);
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
    /**
     * Robust comparison for track objects to determine if they are the same song.
     * Handles relative paths vs absolute URLs and URL encoding discrepancies.
     */
    function isSameTrack(t1, t2) {
        if (!t1 || !t2) return false;
        if (t1 === t2) return true; // Identity match

        let u1 = t1.url || '';
        let u2 = t2.url || '';

        if (!u1 || !u2) return false;

        // Strip server base URL to compare relative paths if possible
        const normalize = (url) => {
            let path = url;
            if (path.includes('/audio/')) {
                path = path.substring(path.indexOf('/audio/'));
            }
            try {
                return decodeURIComponent(path).toLowerCase();
            } catch (e) {
                return path.toLowerCase();
            }
        };

        return normalize(u1) === normalize(u2);
    }

    function setupTrackListeners(trackItem, track, index, container, playlistId, canEdit, contextTracks = null) {
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
                const nowLiked = State.get('likedTracks').has(track.url);
                trackLikeBtn.classList.toggle('active', nowLiked);
                const svg = trackLikeBtn.querySelector('svg');
                if (svg) {
                    svg.style.fill = nowLiked ? 'var(--accent)' : 'none';
                    svg.style.stroke = nowLiked ? 'var(--accent)' : 'currentColor';
                }
            });
        }

        // Offline Status / Download Handler
        const statusBtn = trackItem.querySelector('.track-offline-btn');
        if (statusBtn) {
            statusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const currentIsDownloaded = State.get('downloadedTracksMap').has(track.url);
                const currentIsDownloading = State.get('pendingDownloads').has(track.url);

                if (currentIsDownloaded) {
                    if (confirm('Remove this track from offline storage?')) {
                        removeOfflineTrack(track.url);
                    }
                } else if (!currentIsDownloading) {
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
                removeFromQueue(index, container.id === 'queue-user-list');
            });
        }

        // Drag-to-reorder handlers (playlist view only, if owner)
        if (canEdit && playlistId) {
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
                const pl = State.get('allPlaylists').find(p => p.id === playlistId);
                if (!pl) return;
                const reordered = [...pl.tracks];
                const [moved] = reordered.splice(fromIndex, 1);
                reordered.splice(toIndex, 0, moved);
                updatePlaylistTracks(playlistId, reordered);
            });
        }

        trackItem.addEventListener('click', (e) => {
            // Artist links are now handled by a global delegated listener to ensure consistency across all views
            if (e.target.closest('.add-to-playlist-btn') || e.target.closest('.remove-from-playlist-btn') || e.target.closest('.drag-handle') || e.target.closest('.track-offline-btn')) return;

            if (isTrackUnsupported(track)) {
                showDependencyModal();
                return;
            }

            if (container.id === 'queue-user-list') {
                Playback.clearQueue();
                Playback.playTrack(track);
                renderQueueView();
                return;
            }

            if (container.id === 'queue-context-list') {
                const targetIndex = Playback.currentPlaylistContext.findIndex(t => t.url === track.url);
                if (targetIndex !== -1) {
                    Playback.clearQueue();
                    Playback.playTrack(Playback.currentPlaylistContext[targetIndex], Playback.currentPlaylistContext, targetIndex);
                    renderQueueView();
                }
                return;
            }

            if (container.id !== 'queue-now-playing') {
                if (contextTracks && contextTracks.length > 0) {
                    Playback.playTrack(track, contextTracks, index);
                } else {
                    Playback.playTrack(track);
                }
            }
        });
    }


    function openArtistView(artistName, push = true) {
        if (push) {
            Router.navigate('artist', { artistName });
            return;
        }
        Router.switchToView('artist');

        // Find all albums by this artist from the pre-processed State.get('albumsData')
        const artistAlbums = [];
        const lowerArtistName = artistName.toLowerCase();
        for (const [albumName, albumInfo] of Object.entries(State.get('albumsData'))) {
            const albumArtists = splitArtists(albumInfo.artist).map(a => a.toLowerCase());
            if (albumArtists.includes(lowerArtistName) || albumInfo.artist.toLowerCase() === lowerArtistName) {
                artistAlbums.push(albumInfo);
            }
        }

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

        UI.renderArtistView(artistName, artistAlbums, artistTracks);
        setCachedView(`artist:${artistName}`, { artistAlbums, artistTracks });
    }






    // ΓöÇΓöÇ Playlist System ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    // ΓöÇΓöÇ History System ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    async function fetchHistory() {
        const currentUser = State.get('currentUser');

        if (State.get('currentUser') && window._fbFS) {
            try {
                const snap = await window._fbFS.collection('users').doc(State.get('currentUser').uid).collection('history')
                    .orderBy('timestamp', 'desc').limit(100).get();
                const cloudTracks = snap.docs.map(doc => doc.data());

                // Hydrate cloud tracks with library data to ensure quality tags and relative paths are present
                const historyTracks = cloudTracks.map(track => {
                    const libTrack = State.get('allTracks').find(t => t.url === track.url);
                    return libTrack ? { ...track, ...libTrack, timestamp: track.timestamp } : track;
                });
                State.set('historyTracks', historyTracks);
            } catch (error) {
                console.error('[History] Failed to fetch cloud history', error);
            }
        } else {
            // Guest mode: local storage
            const local = localStorage.getItem('SimonRelays_History');
            State.set('historyTracks', local ? JSON.parse(local) : []);

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
        let nextHistory = State.get('historyTracks').filter(t => t.url !== track.url);
        nextHistory.unshift(historyData);
        if (nextHistory.length > 100) nextHistory.pop();
        State.set('historyTracks', nextHistory);

        if (State.get('currentUser') && window._fbFS) {
            try {
                const encodedUrl = btoa(track.url).replace(/\//g, '_').replace(/\+/g, '-');
                await window._fbFS.collection('users').doc(State.get('currentUser').uid).collection('history').doc(encodedUrl).set(historyData);
            } catch (error) {
                console.error('[History] Failed to sync history to cloud', error);
            }
        } else {
            localStorage.setItem('SimonRelays_History', JSON.stringify(State.get('historyTracks')));
        }

        const historyView = document.getElementById('history-view');
        if (historyView && !historyView.classList.contains('hidden')) {
            renderHistoryView();
        }
    }

    function renderHistoryView() {
        UI.renderHistoryView();
    }


    // ΓöÇΓöÇ Downloads System ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    async function fetchDownloads() {
        try {
            const results = await getAllDownloadedFromIDB();
            let totalBytes = 0;
            const downloadedTracks = results.map(item => {
                if (item.blob && item.blob.size) totalBytes += item.blob.size;
                if (item.coverBlob && item.coverBlob.size) totalBytes += item.coverBlob.size;

                const track = {
                    url: item.trackUrl,
                    metadata: item.metadata,
                    isLocal: true,
                    savedAt: item.savedAt
                };

                const libTrack = State.get('allTracks').find(t => t.url === item.trackUrl);
                if (libTrack) {
                    Object.assign(track, libTrack);
                    track.isLocal = true;
                    track.savedAt = item.savedAt;
                }

                if (item.metadata && item.metadata.relativePath) {
                    track.relativePath = item.metadata.relativePath;
                }

                return track;
            }).sort((a, b) => b.savedAt - a.savedAt);

            State.set('downloadedTracks', downloadedTracks);

            const storageText = document.getElementById('downloads-storage-text');
            if (storageText) {
                const count = downloadedTracks.length;
                storageText.textContent = `${count} track${count !== 1 ? 's' : ''} • ${formatBytes(totalBytes)}`;
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
        UI.renderDownloadsView();
    }


    // ΓöÇΓöÇ Likes System ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

    async function fetchLikes() {
        const currentUser = State.get('currentUser');
        if (!currentUser || !window._fbFS) return;
        try {
            const snap = await window._fbFS.collection('users').doc(currentUser.uid).collection('likes').orderBy('timestamp', 'desc').get();
            const likedTracks = State.get('likedTracks');

            State.get('likedTracks').clear();

            const allLikedTracksCache = [];

            snap.forEach(doc => {
                const data = doc.data();
                State.get('likedTracks').add(data.url);
                allLikedTracksCache.push(data);
            });

            State.set('allLikedTracksCache', allLikedTracksCache);
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
        const currentUser = State.get('currentUser');
        if (!currentUser || !window._fbFS || !track) return;

        const trackUrl = track.url;
        // Firebase paths cannot contain ".", so we encode the URL
        const safeUrlId = encodeURIComponent(trackUrl).replace(/\./g, '%2E');
        const likeRef = window._fbFS.collection('users').doc(currentUser.uid).collection('likes').doc(safeUrlId);

        const likedTracks = State.get('likedTracks');
        const isLiked = likedTracks.has(trackUrl);

        try {
            if (isLiked) {
                likedTracks.delete(trackUrl);
                const nextCache = State.get('allLikedTracksCache').filter(t => t.url !== trackUrl);
                State.set('allLikedTracksCache', nextCache);
                updateLikeButtonState();
                await likeRef.delete();
            } else {
                likedTracks.add(trackUrl);

                const trackData = {
                    ...track,
                    timestamp: Date.now()
                };
                const nextCache = [trackData, ...State.get('allLikedTracksCache')];
                State.set('allLikedTracksCache', nextCache);
                updateLikeButtonState();

                // Bounce the like buttons
                const likeBtn = document.getElementById('like-track-btn');
                const immersiveLike = document.getElementById('immersive-like-btn');
                if (likeBtn) Animations.oneShot(likeBtn, 'like-bounce');
                if (immersiveLike) Animations.oneShot(immersiveLike, 'like-bounce');

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
        const currentUser = State.get('currentUser');
        const likedTracks = State.get('likedTracks');

        const isLiked = currentUser && Playback.currentTrack && likedTracks.has(Playback.currentTrack.url);

        if (likeTrackBtn) {
            if (!State.get('currentUser') || !Playback.currentTrack) {
                likeTrackBtn.classList.remove('active');
            } else {
                likeTrackBtn.classList.toggle('active', isLiked);
            }
        }

        if (immersiveLikeBtn) {
            if (!State.get('currentUser') || !Playback.currentTrack) {
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
        UI.renderLikesView();
    }


    async function renderStatsView() {
        return Stats.render();
    }

    // --- Playlist Logic (Moved to js/playlist.js) ---
    async function fetchPlaylists() {
        const playlists = await Playlist.fetchUserPlaylists();
        State.set('allPlaylists', playlists);

        Playlist.renderUserStrip();
    }


    async function createPlaylist(name) {
        if (State.get('currentUser') && window._fbFS) {
            try {
                const docRef = await window._fbFS.collection('playlists').add({
                    name,
                    name_lowercase: name.toLowerCase(),
                    userId: State.get('currentUser').uid,
                    userName: State.get('currentUser').displayName || 'Anonymous',
                    userPhotoURL: State.get('currentUser').photoURL || null,
                    tracks: [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                const newPl = { id: docRef.id, name, tracks: [], userId: State.get('currentUser').uid, userName: State.get('currentUser').displayName };
                State.get('allPlaylists').unshift(newPl);
                Playlist.renderUserStrip();
                return newPl;
            } catch (e) { console.error('[Cloud] Failed to create playlist', e); }
        }
        try {
            const newPl = await API.createPlaylist(name);
            State.get('allPlaylists').push(newPl);

            Playlist.renderUserStrip();
            return newPl;
        } catch (e) { console.error('Failed to create playlist locally', e); }
        return null;
    }

    async function deletePlaylist(id) {
        if (State.get('currentUser') && window._fbFS) {
            try { await window._fbFS.collection('playlists').doc(id).delete(); }
            catch (e) { console.error('[Cloud] Delete failed', e); }
        } else {
            try { await API.deletePlaylist(id); }
            catch (e) { console.error('Local delete failed', e); }
        }
        State.set('allPlaylists', State.get('allPlaylists').filter(p => p.id !== id));
        Playlist.renderUserStrip();
        Router.navigate('home');
    }

    async function renamePlaylist(id, name) {
        if (State.get('currentUser') && window._fbFS) {
            try { await window._fbFS.collection('playlists').doc(id).update({ name }); }
            catch (e) { console.error('[Cloud] Rename failed', e); }
        } else {
            try { await API.renamePlaylist(id, name); }
            catch (e) { console.error('Local rename failed', e); }
        }
        const idx = State.get('allPlaylists').findIndex(p => p.id === id);
        if (idx !== -1) State.get('allPlaylists')[idx].name = name;
        Playlist.renderUserStrip();
    }

    async function updatePlaylistTracks(playlistId, tracks) {
        if (State.get('currentUser') && window._fbFS) {
            try { await window._fbFS.collection('playlists').doc(playlistId).update({ tracks }); }
            catch (e) { console.error('[Cloud] Update tracks failed', e); }
        } else {
            try { await API.updatePlaylistTracks(playlistId, tracks); }
            catch (e) { console.error('Local update tracks failed', e); }
        }
        const idx = State.get('allPlaylists').findIndex(p => p.id === playlistId);
        if (idx !== -1) {
            State.get('allPlaylists')[idx].tracks = tracks;
            Playlist.renderUserStrip();
            if (activePlaylistId === playlistId) openPlaylistView(State.get('allPlaylists')[idx], false);
        }
    }

    async function updatePlaylistCover(playlistId, base64) {
        if (State.get('currentUser') && window._fbFS) {
            try { await window._fbFS.collection('playlists').doc(playlistId).update({ customCover: base64 }); }
            catch (e) { console.error('[Cloud] Update cover failed', e); }
        }
        const idx = State.get('allPlaylists').findIndex(p => p.id === playlistId);
        if (idx !== -1) {
            State.get('allPlaylists')[idx].customCover = base64;
            Playlist.renderUserStrip();
            if (activePlaylistId === playlistId) openPlaylistView(State.get('allPlaylists')[idx], false);
        }
    }

    async function addTrackToPlaylist(playlistId, track) {
        const pl = State.get('allPlaylists').find(p => p.id === playlistId);
        if (!pl) return;

        // Ensure we don't duplicate tracks by URL if that's preferred, 
        // though usually playlists allow duplicates. We'll just add it.
        const updatedTracks = [...(pl.tracks || []), track];
        await updatePlaylistTracks(playlistId, updatedTracks);
    }

    async function removeTrackFromPlaylist(playlistId, trackUrl, trackItemEl) {
        const pl = State.get('allPlaylists').find(p => p.id === playlistId);
        if (!pl) return;

        if (!confirm(`Remove this track from "${pl.name}"?`)) return;

        const updatedTracks = (pl.tracks || []).filter(t => t.url !== trackUrl);
        await updatePlaylistTracks(playlistId, updatedTracks);

        if (trackItemEl) {
            trackItemEl.remove();
        }
    }

    function openPlaylistView(playlist, push = true) {
        if (push) {
            Router.navigate('playlist', { playlist });
            return;
        }
        Router.switchToView('playlist');
        Playlist.renderPlaylistView(playlist);
        activePlaylistId = playlist.id;

        // Use the passed playlist object if it has tracks (Search/Discover results)
        // or find in State.get('allPlaylists') for the most up-to-date local version.
        const pl = State.get('allPlaylists').find(p => p.id === playlist.id) || playlist;

        if (pl && pl.tracks) {
            const isOwn = State.get('currentUser') && pl.userId === State.get('currentUser').uid;
            UI.renderTrackList(pl.tracks, playlistTrackList, true, pl.id, isOwn);
        }
    }



    // ΓöÇΓöÇ Add-to-playlist dropdown ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    function showAddToPlaylistDropdown(track, anchorEl) {
        addToPlaylistDropdown.innerHTML = '';

        // Add to Queue Option
        const queueItem = UI.createDropdownItem({
            icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
            label: 'Add to Queue'
        });
        queueItem.addEventListener('click', () => {
            addToQueue(track);
            addToPlaylistDropdown.classList.add('hidden');
        });
        addToPlaylistDropdown.appendChild(queueItem);

        const queueDiv = document.createElement('div');
        queueDiv.className = 'dropdown-divider';
        addToPlaylistDropdown.appendChild(queueDiv);

        const ownPlaylists = State.get('allPlaylists').filter(pl => State.get('currentUser') && pl.userId === State.get('currentUser').uid);

        ownPlaylists.forEach(pl => {
            const item = UI.createDropdownItem({
                icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg>`,
                label: pl.name
            });
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

        const newItem = UI.createDropdownItem({
            className: 'new-pl',
            icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
            label: 'New Playlist'
        });
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
            const pl = State.get('allPlaylists').find(p => p.id === newPl.id) || newPl;
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
        UI.renderRecentArtists();
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
        const isDownloaded = State.get('downloadedTracksMap').has(track.url);
        if (bottomOfflineBtn) {
            bottomOfflineBtn.classList.toggle('downloaded', !!isDownloaded);
            bottomOfflineBtn.classList.toggle('is-local', !!track.isLocal && !track.isBoth);
            bottomOfflineBtn.classList.toggle('is-both', !!track.isBoth);
            bottomOfflineBtn.title = track.isBoth ? 'Local & Server Synced' : (track.isLocal ? 'Local File' : (isDownloaded ? 'Available Offline' : 'Remote Source'));
        }

        updateLikeButtonState();
        bottomTitle.textContent = title;
        bottomArtist.innerHTML = splitArtists(artist).map(a => `<span class="artist-link" data-artist="${a}" style="cursor: pointer;">${a}</span>`).join('<span style="opacity:0.5">, </span>');

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
                if (albumName && State.get('albumsData')[albumName]) {
                    hideImmersiveOverlay();
                    openAlbumView(State.get('albumsData')[albumName]);
                }
            };
        }
        if (immersiveArtist) {
            const artists = splitArtists(artist);
            immersiveArtist.innerHTML = artists.map(a => `<span class="artist-link" data-artist="${a}" style="cursor:pointer;">${a}</span>`).join('<span style="opacity:0.5">, </span>');
        }

        // Lyrics
        Lyrics.fetch(track);

        updateImmersiveUpNext();
    }



    // ΓöÇΓöÇ Offline Helper Logic ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    async function initiateDownload(track) {
        if (track.isLocal) return;
        const url = getTrackUrlForQuality(track, 'download');

        State.get('pendingDownloads').set(track.url, 0.01); // show start

        refreshCurrentView();

        try {
            // 1. Fetch Audio
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');

            const contentLength = response.headers.get('content-length');
            const total = parseInt(contentLength, 10);
            let loaded = 0;

            const reader = response.body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                loaded += value.length;
                if (total) {
                    State.get('pendingDownloads').set(track.url, loaded / total);

                    refreshCurrentView();
                }
            }

            const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'audio/mpeg' });

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
            State.get('downloadedTracksMap').set(track.url, 'indexeddb');

            console.log('[PWA] Track saved to IndexedDB (with assets):', track.url);
        } catch (e) {
            console.error('[PWA] Download failed', e);
            UI.showNotification('Download Failed', 'Failed to download track for offline use.');
        } finally {
            State.get('pendingDownloads').delete(track.url);

            refreshCurrentView();
        }
    }

    async function removeOfflineTrack(trackPath) {
        await deleteTrackFromIDB(trackPath);
        State.get('downloadedTracksMap').delete(trackPath);

        refreshCurrentView();
    }

    function refreshCurrentView() {
        // Optimize: instead of fully re-rendering track lists, we update just the icons and active states directly in the DOM.
        const currentView = document.querySelector('.view:not(.hidden)');
        if (!currentView) return;

        // 1. Update Active Highlights
        const allTrackItems = currentView.querySelectorAll('.track-item');
        allTrackItems.forEach(item => {
            const trackUrl = item.dataset.url;
            const isNowPlaying = isSameTrack(Playback.currentTrack, { url: trackUrl });
            item.classList.toggle('active', isNowPlaying);
        });

        // 2. Update all track list buttons (Downloads/Offline)
        const offlineBtns = currentView.querySelectorAll('.track-offline-btn');
        offlineBtns.forEach(btn => {
            const url = btn.getAttribute('data-track-url');
            if (!url) return;

            const isLocal = btn.getAttribute('data-is-local') === 'true';
            const isBoth = btn.getAttribute('data-is-both') === 'true';

            const isDownloaded = State.get('downloadedTracksMap').has(url);
            const downloadProgress = State.get('pendingDownloads').get(url);
            const isDownloading = downloadProgress !== undefined;

            let indicatorClass = '';
            let indicatorTitle = '';
            let progress = 0;

            if (isDownloading) {
                indicatorClass = 'downloading';
                progress = Math.round(downloadProgress * 100);
                indicatorTitle = `Downloading... ${progress}%`;
            } else if (isDownloaded) {
                indicatorClass = 'downloaded';
                indicatorTitle = 'Available Offline (Click to remove)';
                progress = 100;
            } else {
                indicatorTitle = 'Download for Offline';
            }

            btn.className = `icon-button offline-status-circle track-offline-btn ${indicatorClass}`;
            btn.title = indicatorTitle;
            btn.style.setProperty('--progress', `${progress}%`);
        });

        // 2. Update album hero download button if album view is active
        const activeView = document.querySelector('.view.active');
        if (activeView && activeView.id === 'album-view') {
            const albumName = albumHeroDiv.querySelector('.album-hero-title')?.textContent;
            if (albumName && State.get('albumsData')[albumName]) {
                updateAlbumHeroOfflineStatus(State.get('albumsData')[albumName]);
            }
        }

        // Update Global Player Bar offline status if something is playing
        if (Playback.currentTrack && bottomOfflineBtn) {
            const isOffline = State.get('downloadedTracksMap').has(Playback.currentTrack.url);
            const downloadProgress = State.get('pendingDownloads').get(Playback.currentTrack.url);

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

                const isOffline = State.get('downloadedTracksMap').has(url);
                const progress = State.get('pendingDownloads').get(url);

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
            State.get('downloadedTracksMap').clear();

            tracks.forEach(t => {
                State.get('downloadedTracksMap').set(t.trackUrl, 'indexeddb');

            });
            console.log('[PWA] Offline state synced from IndexedDB:', State.get('downloadedTracksMap').size, 'tracks.');
        } catch (e) {
            console.error('[PWA] Failed to sync offline state from IndexedDB', e);
        }
        refreshCurrentView();
    }

    function updateAlbumHeroOfflineStatus(album) {
        const downloadAlbumBtn = albumHeroDiv.querySelector('.download-album-btn');
        if (!downloadAlbumBtn) return;

        const isAlbumOffline = album.tracks.every(t => State.get('downloadedTracksMap').has(t.url));
        const isAlbumDownloading = album.tracks.some(t => State.get('pendingDownloads').has(t.url));

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
            if (State.get('downloadedTracksMap').has(track.url)) continue;
            await initiateDownload(track);
        }
    }

    syncOfflineState();

    // Bottom Bar Click Navigation
    bottomArtist.addEventListener('click', (e) => {
        if (!Playback.currentTrack) return;
        // Navigation is now handled by the global delegated .artist-link listener
    });

    // Global Delegated Artist Link Handler
    document.addEventListener('click', (e) => {
        const artistLink = e.target.closest('.artist-link');
        if (artistLink) {
            e.preventDefault();
            e.stopPropagation();
            const artistName = artistLink.dataset.artist;
            if (artistName) {
                // If in immersive view, hide it first
                if (document.getElementById('immersive-view').classList.contains('active')) {
                    hideImmersiveOverlay();
                }
                openArtistView(artistName);
            }
        }
    }, true);

    bottomTitle.addEventListener('click', () => {
        if (!Playback.currentTrack) return;

        const albumName = (Playback.currentTrack.metadata && Playback.currentTrack.metadata.album) ? Playback.currentTrack.metadata.album : "Unknown Album";
        const albumInfo = State.get('albumsData')[albumName];

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
            if (!State.get('currentUser')) {
                // Must be logged in to view likes
                if (loginOverlay) loginOverlay.classList.remove('hidden');
                return;
            }
            Router.navigate('likes');
            closeSidebar();
        });
    }

    const sidebarStatsBtn = document.getElementById('sidebar-stats-btn');
    if (sidebarStatsBtn) {
        sidebarStatsBtn.addEventListener('click', () => {
            Router.navigate('stats');
            closeSidebar();
        });
    }

    const sidebarDownloadsBtn = document.getElementById('sidebar-downloads-btn');
    if (sidebarDownloadsBtn) {
        sidebarDownloadsBtn.addEventListener('click', () => {
            Router.navigate('downloads');
            closeSidebar();
        });
    }


    const sidebarHistoryBtn = document.getElementById('sidebar-history-btn');
    if (sidebarHistoryBtn) {
        sidebarHistoryBtn.addEventListener('click', () => {
            Router.navigate('history');
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
    Library.init({
        serverBaseUrl,
        callbacks: {
            onAlbumClick: (album) => openAlbumView(album),
            onPlay: (track, list, index) => Playback.playTrack(track, list, index),
            isTrackUnsupported: (t) => isTrackUnsupported(t)
        }
    });
    Search.init();
    // Modules that depend on DOM elements should still init here
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
            onLibraryRefresh: async () => await initializeMusicLibrary(true),
            onAlbumRefresh: async (albumName) => {
                const album = State.get('albumsData')[albumName];
                if (album) openAlbumView(album, false);
            },
            getSharedCoverUrl: (path, artist, album) => getSharedCoverUrl(path, artist, album)
        }
    });

    Playlist.init({
        serverBaseUrl,
        currentUser: State.get('currentUser'),
        selectors: {
            hero: 'playlist-hero'
        },
        callbacks: {
            onNavigate: (playlist) => openPlaylistView(playlist),
            onPlay: (track, list, index) => Playback.playTrack(track, list, index),
            onDelete: (id) => deletePlaylist(id),
            onRenamed: (id, name) => renamePlaylist(id, name),
            onSave: async (playlist) => {
                const currentUser = State.get('currentUser');
                if (!currentUser) {
                    UI.showNotification('Sign In Required', 'Please sign in to save playlists.');
                    return;
                }

                try {
                    const newName = `${playlist.name} (Shared)`;
                    const newPl = await createPlaylist(newName);
                    if (newPl && playlist.tracks) {
                        await updatePlaylistTracks(newPl.id, playlist.tracks);
                        if (playlist.customCover) {
                            await updatePlaylistCover(newPl.id, playlist.customCover);
                        }
                        UI.showNotification('Success', 'Playlist saved to your library!');
                        await fetchPlaylists();
                    }
                } catch (e) {
                    console.error('Failed to save playlist', e);
                    UI.showNotification('Error', 'Failed to save playlist: ' + e.message);
                }
            }
        }
    });

    Lyrics.init({
        container: lyricsContainer,
        immersiveView: immersiveView,
        actionBar: document.getElementById('lyrics-action-bar')
    });

    if (window.Visualizer) {
        Visualizer.init();
    }

    Playback.init({
        onTrackChange: (track) => {
            updateNowPlayingUI(track);
            if (typeof updateImmersiveUpNext === 'function') updateImmersiveUpNext();
            if (queueView && queueView.classList.contains('active')) renderQueueView();
            refreshCurrentView(); // Update active highlights in albums/playlists
            _fillInfiniteBuffer();
            if (window.Visualizer) {
                Visualizer.start();
            }
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
            if (btn) Animations.oneShot(btn, 'play-pop');

            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
            }

            if (window.Visualizer) {
                const immersiveView = document.getElementById('immersive-view');
                const isImmersiveOpen = immersiveView && !immersiveView.classList.contains('hidden');
                if (isPlaying || isImmersiveOpen) {
                    Visualizer.start();
                } else {
                    Visualizer.stop();
                }
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


        // Always start at landing page (Home)
        // Expose UI functions for modular access (js/search.js, etc)
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

        // Initialize UI states from module
        shuffleBtn.classList.toggle('toggle-active', Playback.isShuffleActive);
        updateRepeatUI(Playback.repeatMode);

        // Chromecast Click Handler and State Subscriber
        const castBtn = document.getElementById('cast-btn');
        if (castBtn) {
            castBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof cast !== 'undefined' && cast.framework) {
                    cast.framework.CastContext.getInstance().requestSession()
                        .then(() => console.log('[Cast] Session request dialog opened.'))
                        .catch(err => console.error('[Cast] Session request failed:', err));
                } else {
                    console.warn('[Cast] Cast SDK is not loaded or available yet.');
                    if (window.UI) {
                        UI.showNotification('Chromecast Unavailable', 'Google Cast is not supported or loaded in this browser/device.');
                    }
                }
            });
        }

        State.subscribe((key, value) => {
            if (key === 'isCasting') {
                const btn = document.getElementById('cast-btn');
                if (btn) {
                    if (value) {
                        btn.classList.add('active-cast');
                        btn.title = 'Disconnect Cast';
                    } else {
                        btn.classList.remove('active-cast');
                        btn.title = 'Cast to TV / Speaker';
                    }
                }
            }
        });

        Router.navigate('home', {}, false);
        window.isAppInitialized = true;

        // Check for initial hash and navigate if needed (after initialization)
        const initialHash = window.location.hash.substring(1);
        if (initialHash && initialHash !== 'home' && initialHash !== '') {
            Router.navigate(initialHash, {}, false);
        }
    } catch (err) {
        console.error("Initialization failed:", err);
        Router.switchToView('home'); // fallback
        window.isAppInitialized = true;
    }
});
