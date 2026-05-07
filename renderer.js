const DEFAULT_SERVER_URL = 'https://localhost:3000';
const CURRENT_SERVER_URL = localStorage.getItem('serverUrl');
// Keep HTTP if it's explicitly set to localhost for development
if (CURRENT_SERVER_URL === 'http://localhost:3000' && window.location.hostname !== 'localhost') {
    localStorage.removeItem('serverUrl'); 
}

const isServedFromServer = (window.location.protocol.startsWith('http')) &&
    (window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.'));
// Also treat localhost as self-hosted when the page itself is served from the server (not file:// or Electron)
const isSelfHosted = isServedFromServer ||
    (window.location.protocol.startsWith('http') && window.location.port);

let serverBaseUrl = (localStorage.getItem('serverUrl') || (isSelfHosted ? '' : DEFAULT_SERVER_URL)).replace(/\/+$/, '');

const deviceId = localStorage.getItem('deviceId') || crypto.randomUUID();
localStorage.setItem('deviceId', deviceId);

let albumCoverCache = new Map();

/**
 * Splits a raw artist string into individual artist names.
 * Handles common delimiters: ; , & feat. ft. Feat. Ft. featuring x (standalone)
 * Returns an array of trimmed, non-empty artist names.
 */
function splitArtists(raw) {
    if (!raw) return ['Unknown Artist'];
    // Split on: semicolons, feat./ft./featuring (with optional dot), ampersand, or comma
    // The " x " pattern requires spaces to avoid splitting "Dax" into "Da" + ""
    const parts = raw.split(/\s*;\s*|\s*,\s*|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+|\s+&\s+|\s+x\s+/i);
    const cleaned = parts.map(s => s.trim()).filter(s => s.length > 0);
    return cleaned.length > 0 ? cleaned : ['Unknown Artist'];
}

function getSharedCoverUrl(relativePath, artist, album) {
    if (!relativePath) return null;
    const cleanArtist = artist || 'Unknown Artist';
    const cleanAlbum = album || 'Unknown Album';
    if (cleanArtist === 'Unknown Artist' && cleanAlbum === 'Unknown Album') {
        return `${serverBaseUrl}/api/cover?path=${encodeURIComponent(relativePath)}`;
    }
    const cacheKey = `${cleanArtist}|${cleanAlbum}`;
    if (albumCoverCache.has(cacheKey)) return albumCoverCache.get(cacheKey);
    const url = `${serverBaseUrl}/api/cover?path=${encodeURIComponent(relativePath)}`;
    albumCoverCache.set(cacheKey, url);
    return url;
}

document.addEventListener('DOMContentLoaded', async () => {
    // Apply saved zoom level using CSS variable for transform scaling
    const savedZoom = localStorage.getItem('zoomLevel') || '100';
    const zoomScale = parseFloat(savedZoom) / 100;
    document.documentElement.style.setProperty('--app-zoom', zoomScale);
    // Explicitly reset native zoom to prevent interference
    document.documentElement.style.zoom = '1';

    function getZoomScale() {
        // Retrieve scale from CSS variable
        return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-zoom')) || 1;
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
    const searchHistorySection = document.getElementById('search-history-section');
    const searchHistoryList = document.getElementById('search-history-list');
    const clearSearchHistoryBtn = document.getElementById('clear-search-history-btn');

    // Global Player Bar Nodes
    const trackListElement = document.getElementById('track-list');
    
    // ── Howler.js Audio Engine Wrapper (Hybrid Proxy) ───────────────────────────
    Howler.autoUnlock = true;
    let currentHowl = null;
    let nextHowl = null;
    let nextTrackData = null;
    let crossfadeTimeout = null;
    let _lastSeekTime = 0;
    let CROSSFADE_DURATION = parseInt(localStorage.getItem('crossfadeDuration')) || 5000;

    const audioPlayer = document.getElementById('audio-player');
    
    // Override methods/properties to redirect to Howler
    audioPlayer._originalPlay = audioPlayer.play;
    audioPlayer._originalPause = audioPlayer.pause;
    
    audioPlayer.play = function() {
        if (currentHowl) {
            currentHowl.play();
            return Promise.resolve();
        }
        return Promise.reject('No track loaded');
    };
    
    audioPlayer.pause = function() {
        if (currentHowl) currentHowl.pause();
    };

    Object.defineProperties(audioPlayer, {
        paused: {
            get: () => {
                if (!currentHowl) return true;
                return !currentHowl.playing();
            }
        },
        duration: {
            get: () => {
                let howlDur = currentHowl ? currentHowl.duration() : 0;
                if (howlDur && isFinite(howlDur) && howlDur > 0) return howlDur;
                const metaDur = (globalPlayingTrack && globalPlayingTrack.metadata && globalPlayingTrack.metadata.duration) ? globalPlayingTrack.metadata.duration : 0;
                return isFinite(metaDur) ? metaDur : 0;
            }
        },
        currentTime: {
            get: () => {
                if (!currentHowl) return 0;
                const pos = currentHowl.seek();
                return (typeof pos === 'number' && isFinite(pos)) ? pos : 0;
            },
            set: (val) => {
                if (currentHowl && isFinite(val)) {
                    _lastSeekTime = Date.now();
                    currentHowl.seek(val);
                }
            }
        },
        volume: {
            get: () => Howler.volume(),
            set: (val) => Howler.volume(val)
        }
    });

    // Helper for triggering standard DOM events
    audioPlayer._trigger = function(eventName) {
        this.dispatchEvent(new Event(eventName));
    };

    function fadeHowl(howl, targetVolume, duration, onComplete) {
        if (!howl) return;
        howl.fade(howl.volume(), targetVolume, duration);
        if (onComplete) {
            setTimeout(onComplete, duration);
        }
    }

    // Emulate timeupdate event (Howler doesn't have one)
    setInterval(() => {
        if (currentHowl && currentHowl.playing()) {
            // Only trigger if we aren't dragging and aren't in a seek cooldown
            if (!isDraggingScrubber && (Date.now() - _lastSeekTime > 800)) {
                audioPlayer._trigger('timeupdate');
            }

            // Crossfade Check: Only if we are at least 10s into the song and near the end
            const duration = audioPlayer.duration;
            const seek = audioPlayer.currentTime;
            const remain = duration - seek;
            
            if (duration > 10 && seek > 10 && remain > 0 && remain <= (CROSSFADE_DURATION / 1000) && !crossfadeTimeout) {
                console.log('[Audio] Crossfade threshold reached. Pre-starting next track...');
                crossfadeTimeout = true; // prevent double trigger
                playNextTrack(true);
            }
        }
    }, 250);
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
    // Fetch config from local backend (always use this in browser/PWA)
    try {
        const res = await fetch(`${serverBaseUrl}/api/firebase-config`);
        if (res.ok) {
            firebaseConfig = await res.json();
            console.log('[Cloud] Firebase config fetched from server API.');
        }
    } catch (e) {
        console.warn('[Cloud] Failed to fetch Firebase config from server API.', e);
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
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileNavItems = [mobileHomeBtn, mobileSearchBtn, mobileQueueBtn, mobileMenuBtn];
    const mobileSearchInput = document.getElementById('mobile-search-input');

    // Metadata Edit Elements
    const editMetadataModal = document.getElementById('edit-metadata-modal');
    const metadataModalTitle = document.getElementById('metadata-modal-title');
    const metadataTitleInput = document.getElementById('metadata-title-input');
    const metadataArtistInput = document.getElementById('metadata-artist-input');
    const metadataAlbumInput = document.getElementById('metadata-album-input');
    const metadataYearInput = document.getElementById('metadata-year-input');
    const metadataGenreInput = document.getElementById('metadata-genre-input');
    const metadataGenreDropdown = document.getElementById('metadata-genre-dropdown');
    const metadataArtPreview = document.getElementById('metadata-art-preview');
    const metadataArtInput = document.getElementById('metadata-art-input');
    const metadataArtDropzone = document.getElementById('metadata-art-dropzone');
    const metadataSaveBtn = document.getElementById('metadata-save-btn');
    const metadataCancelBtn = document.getElementById('metadata-cancel-btn');
    const metadataRestoreBtn = document.getElementById('metadata-restore-btn');

    // Check Metadata Modal Elements
    const checkMetadataModal = document.getElementById('check-metadata-modal');
    const checkStartBtn = document.getElementById('check-metadata-start-btn');
    const checkCancelBtn = document.getElementById('check-metadata-cancel-btn');
    const checkCoverArtToggle = document.getElementById('check-cover-art');
    const checkArtistsToggle = document.getElementById('check-artists');
    const checkSongNamesToggle = document.getElementById('check-song-names');
    const checkGenresToggle = document.getElementById('check-genres');
    const checkProgressContainer = document.getElementById('check-progress-container');
    const checkProgressStatus = document.getElementById('check-progress-status');
    const checkProgressPercent = document.getElementById('check-progress-percent');
    const checkProgressBar = document.getElementById('check-progress-bar');

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
    let shuffledIndices = [];
    let currentShufflePointer = -1;

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function generateShuffleQueue(startIndex = -1) {
        const indices = currentPlaylistContext.map((_, i) => i)
            .filter(i => !isTrackUnsupported(currentPlaylistContext[i]));
        
        const shuffled = shuffleArray(indices);
        
        if (startIndex !== -1) {
            const pos = shuffled.indexOf(startIndex);
            if (pos !== -1) {
                shuffled.splice(pos, 1);
                shuffled.unshift(startIndex);
            }
        }
        
        shuffledIndices = shuffled;
        currentShufflePointer = 0;
    }
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
    let sessionHistory = [];   // up to 50 recently played URLs
    let sessionAffinity = { artists: {}, genres: {} };
    let pendingRecommendedTrack = null; // pre-computed next pick
    // ─────────────────────────────────────────────────────────────────────────
    let pendingUploads = new Set();  // url
    let currentActiveBlobUrl = null;
    let currentActiveCoverUrl = null;

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

    // Up Next Badge (desktop immersive)
    const immersiveUpNext = document.getElementById('immersive-up-next');
    const immersiveUpNextArt = document.getElementById('immersive-up-next-art');
    const immersiveUpNextTitle = document.getElementById('immersive-up-next-title');
    const immersiveUpNextArtist = document.getElementById('immersive-up-next-artist');

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
            if (globalPlayingTrack) {
                showAddToPlaylistDropdown(globalPlayingTrack, immersiveAddToPlaylistBtn);
            }
        });
    }

    if (immersiveUpNext) {
        immersiveUpNext.addEventListener('click', (e) => {
            e.stopPropagation();
            playNextTrack(true); // Treat as a manual skip to the next track
        });
    }

    function showImmersiveOverlay() {
        hideOverlays('immersive'); // Close settings/queue before opening immersive
        openViewAnimated(immersiveView);
        if (expandImmersiveBtn) expandImmersiveBtn.classList.add('active-icon');

        // Toggle Browser Fullscreen
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn(`[UI] Fullscreen request failed: ${err.message}`);
            });
        }

        // Global state initialization
        document.body.classList.add('immersive-active');
        const playerBar = document.querySelector('.player-bar');
        if (playerBar) playerBar.classList.add('fullscreen-active');

        // instantly scroll to active lyric if any
        if (currentLyricIndex !== -1 && lyricsData[currentLyricIndex]) {
            updateLyricsSync();
        }

        // Populate Up Next badge
        updateImmersiveUpNext();
    }

    function hideImmersiveOverlay() {
        if (immersiveView && immersiveView.classList.contains('active')) {
            closeViewAnimated(immersiveView, 500);
            if (expandImmersiveBtn) expandImmersiveBtn.classList.remove('active-icon');

            // Exit Browser Fullscreen
            if (document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen().catch(err => {
                    console.warn(`[UI] Exit fullscreen failed: ${err.message}`);
                });
            }

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

    // ── Up Next Badge ─────────────────────────────────────────────────────────
    function updateImmersiveUpNext() {
        if (!immersiveUpNext || !immersiveView) return;

        // Centralized logic: user queue → shuffle queue → next in context → recommendation
        const upNext = getNextTrack();

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
    // ─────────────────────────────────────────────────────────────────────────


    // ── Queue UI logic ────────────────────────────────────────────────────────
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
        if (isShuffleActive && shuffledIndices.length > 0) {
            // Show upcoming tracks in the shuffled queue
            for (let i = currentShufflePointer + 1; i < shuffledIndices.length; i++) {
                const idx = shuffledIndices[i];
                if (currentPlaylistContext[idx] && !isTrackUnsupported(currentPlaylistContext[idx])) {
                    contextRemaining.push(currentPlaylistContext[idx]);
                }
            }
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
        renderSettingsPanel();
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

    // ── Profile Panel Renderer ────────────────────────────────────────────────
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

    // ── Metadata Editor Logic ────────────────────────────────────────────────

    function showContextMenu(e, track, sourceBtn, canEdit = true, playlistId = null, trackItem = null) {
        e.stopPropagation();
        currentEditingTrack = track;
        currentPlaylistId = playlistId;
        currentTrackItem = trackItem;

        const rect = sourceBtn.getBoundingClientRect();
        const scale = getZoomScale();
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
            const primaryArtist = splitArtists(artistName)[0];
            openArtistView(primaryArtist);
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
        metadataGenreInput.closest('.input-group').style.display = 'none';

        // Show cover editor for album level
        metadataArtDropzone.closest('.metadata-editor-left').style.display = 'flex';
        metadataRestoreBtn.style.display = 'none';

        metadataArtistInput.value = albumInfo.artist;
        metadataAlbumInput.value = albumInfo.name;

        // Show current album cover
        if (albumInfo.coverTrackPath) {
            metadataArtPreview.src = getSharedCoverUrl(albumInfo.coverTrackPath, albumInfo.artist, albumInfo.name);
            metadataArtPreview.style.display = 'block';
        } else {
            metadataArtPreview.src = '';
            metadataArtPreview.style.display = 'none';
        }

        editMetadataModal.classList.remove('hidden');
    }

    function openCheckMetadataModal(albumInfo) {
        currentEditingAlbum = albumInfo;
        checkProgressContainer.classList.add('hidden');
        checkMetadataModal.classList.remove('hidden');
        checkStartBtn.disabled = false;
        checkStartBtn.textContent = "Start Health Check";
        checkProgressBar.style.width = '0%';
        checkProgressPercent.textContent = '0%';
    }

    if (checkCancelBtn) {
        checkCancelBtn.addEventListener('click', () => {
            checkMetadataModal.classList.add('hidden');
        });
    }

    if (checkStartBtn) {
        checkStartBtn.addEventListener('click', () => runMetadataHealthCheck());
    }

    async function runMetadataHealthCheck() {
        if (!currentEditingAlbum) return;
        
        const checkCover = checkCoverArtToggle.checked;
        const checkArtists = checkArtistsToggle.checked;
        const checkNames = checkSongNamesToggle.checked;
        const checkGenres = checkGenresToggle ? checkGenresToggle.checked : false;
        
        if (!checkCover && !checkArtists && !checkNames && !checkGenres) {
            alert("Please select at least one category to check.");
            return;
        }

        // 1. Pre-fetch Album-Level Genres from MusicBrainz and Last.fm
        let albumLevelGenres = [];
        if (checkGenres) {
            checkProgressStatus.textContent = "Harvesting Album Genres...";
            try {
                // MusicBrainz Release Group Search (The "Album Concept" level where tags live)
                const mbAlbPath = `release-group?query=releasegroup:"${encodeURIComponent(currentEditingAlbum.name)}" AND artist:"${encodeURIComponent(currentEditingAlbum.artist)}"&fmt=json`;
                const mbAlbRes = await fetch(`${serverBaseUrl}/api/musicbrainz-proxy?path=${encodeURIComponent(mbAlbPath)}`);
                const mbAlbData = await mbAlbRes.json();
                
                if (mbAlbData['release-groups'] && mbAlbData['release-groups'].length > 0) {
                    const releaseGroupId = mbAlbData['release-groups'][0].id;
                    const mbDetailRes = await fetch(`${serverBaseUrl}/api/musicbrainz-proxy?path=${encodeURIComponent(`release-group/${releaseGroupId}?inc=genres+tags&fmt=json`)}`);
                    const mbDetailData = await mbDetailRes.json();
                    
                    if (mbDetailData.genres) albumLevelGenres.push(...mbDetailData.genres.map(g => g.name));
                    if (mbDetailData.tags) {
                        // Only take tags with count > 0 if available
                        albumLevelGenres.push(...mbDetailData.tags.map(t => t.name));
                    }
                }
                
                // Last.fm Album Search (Already works well, keep as backup)
                const lfmAlbRes = await fetch(`${serverBaseUrl}/api/lastfm-proxy?method=album.getInfo&artist=${encodeURIComponent(currentEditingAlbum.artist)}&album=${encodeURIComponent(currentEditingAlbum.name)}`);
                const lfmAlbData = await lfmAlbRes.json();
                if (lfmAlbData.album && lfmAlbData.album.toptags && lfmAlbData.album.toptags.tag) {
                    const tags = Array.isArray(lfmAlbData.album.toptags.tag) ? lfmAlbData.album.toptags.tag : [lfmAlbData.album.toptags.tag];
                    albumLevelGenres.push(...tags.slice(0, 5).map(t => t.name));
                }
            } catch (e) { console.error("Album genre harvest failed", e); }
            albumLevelGenres = [...new Set(albumLevelGenres)];
        }

        checkStartBtn.disabled = true;
        checkStartBtn.textContent = "Checking...";
        checkProgressContainer.classList.remove('hidden');
        
        try {
            // 1. Search for the album on Deezer (Optional source)
            let deezerTracks = [];
            let deezerAlbumId = null;
            let deezerCoverUrl = null;

            try {
                checkProgressStatus.textContent = "Searching Deezer...";
                const searchRes = await fetch(`${serverBaseUrl}/api/deezer-search?type=album&q=${encodeURIComponent(currentEditingAlbum.artist + ' ' + currentEditingAlbum.name)}`);
                const searchData = await searchRes.json();
                
                if (searchData.data && searchData.data.length > 0) {
                    const deezerAlbum = searchData.data[0];
                    deezerAlbumId = deezerAlbum.id;
                    deezerCoverUrl = deezerAlbum.cover_xl || deezerAlbum.cover_big;

                    checkProgressStatus.textContent = "Fetching tracklist...";
                    const tracksRes = await fetch(`${serverBaseUrl}/api/deezer-proxy?path=album/${deezerAlbumId}`);
                    const albumData = await tracksRes.json();
                    deezerTracks = albumData.tracks.data || [];
                } else {
                    console.warn("Album not found on Deezer. Proceeding with community lookups.");
                }
            } catch (e) {
                console.warn("Deezer lookup failed. Proceeding with community lookups.", e);
            }

            let corrections = [];
            let totalTracks = currentEditingAlbum.tracks.length;

            // 3. Process each local track
            for (let i = 0; i < totalTracks; i++) {
                const localTrack = currentEditingAlbum.tracks[i];
                const localTitle = (localTrack.metadata && localTrack.metadata.title) ? localTrack.metadata.title : localTrack.filename;
                const localArtist = (localTrack.metadata && localTrack.metadata.artist) ? localTrack.metadata.artist : currentEditingAlbum.artist;
                
                checkProgressStatus.textContent = `Checking ${i + 1}/${totalTracks}: ${localTitle}`;
                const progress = Math.round(((i + 1) / totalTracks) * 100);
                checkProgressBar.style.width = progress + '%';
                checkProgressPercent.textContent = progress + '%';

                // Find matching track on Deezer if available
                const match = deezerTracks.find(dt => fuzzyMatch(dt.title, localTitle));
                
                const update = {
                    relativePath: localTrack.relativePath,
                    isLocal: !!localTrack.isLocal,
                    metadata: {}
                };
                let changed = false;


                // --- DEEZER-ONLY CHECKS ---
                let trackFullArtists = null;
                if (match) {
                    if (checkArtists) {
                        try {
                            const tRes = await fetch(`${serverBaseUrl}/api/deezer-proxy?path=track/${match.id}`);
                            const tData = await tRes.json();
                            if (tData.contributors) {
                                trackFullArtists = tData.contributors.map(c => c.name).join(', ');
                            }
                        } catch (e) { console.error("Failed deep lookup for track artists", e); }
                    }

                    if (checkNames && match.title && match.title !== localTitle) {
                        update.metadata.title = match.title;
                        changed = true;
                    }

                    if (checkArtists) {
                        const dzArtist = trackFullArtists || (match.artist && match.artist.name ? match.artist.name : '');
                        const localArtistStr = (localTrack.metadata && localTrack.metadata.artist) ? localTrack.metadata.artist : '';
                        
                        const localArtists = localArtistStr.split(',').map(a => a.trim()).filter(a => a);
                        const newArtists = dzArtist.split(',').map(a => a.trim()).filter(a => a);
                        
                        const mergedArtists = [...new Set([...localArtists, ...newArtists])];
                        const mergedArtistStr = mergedArtists.join(', ');

                        if (mergedArtistStr && mergedArtistStr !== localArtistStr) {
                            update.metadata.artist = mergedArtistStr;
                            changed = true;
                        }
                    }

                    if (checkCover && deezerCoverUrl) {
                        const localCover = (localTrack.metadata && localTrack.metadata.picture) ? true : false;
                        if (!localCover || checkCover) {
                            try {
                                const imgRes = await fetch(deezerCoverUrl);
                                const blob = await imgRes.blob();
                                update.coverArt = await new Promise(resolve => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve(reader.result);
                                    reader.readAsDataURL(blob);
                                });
                                changed = true;
                            } catch (e) { console.error("Failed to fetch cover art from Deezer", e); }
                        }
                    }
                }

                // --- COMMUNITY LOOKUPS (GENRES) - Supports unofficial tracks ---
                if (checkGenres) {
                    let trackSpecificGenre = null;
                    try {
                        let trackTags = [];
                        const searchTitle = match ? match.title : localTitle;
                        const searchArtist = match ? match.artist.name : localArtist;

                        // 1. Track-specific MusicBrainz Lookup
                        try {
                            const mbPath = `recording?query=recording:"${encodeURIComponent(searchTitle)}" AND artist:"${encodeURIComponent(searchArtist)}"&fmt=json`;
                            const mbSearchRes = await fetch(`${serverBaseUrl}/api/musicbrainz-proxy?path=${encodeURIComponent(mbPath)}`);
                            const mbSearchData = await mbSearchRes.json();
                            
                            if (mbSearchData.recordings && mbSearchData.recordings.length > 0) {
                                const mbRecording = mbSearchData.recordings[0];
                                const mbid = mbRecording.id;
                                const mbDetailPath = `recording/${mbid}?inc=genres+tags&fmt=json`;
                                const mbDetailRes = await fetch(`${serverBaseUrl}/api/musicbrainz-proxy?path=${encodeURIComponent(mbDetailPath)}`);
                                const mbDetailData = await mbDetailRes.json();
                                
                                if (mbDetailData.genres) trackTags.push(...mbDetailData.genres.map(g => g.name));
                                if (mbDetailData.tags) {
                                    trackTags.push(...mbDetailData.tags.filter(t => t.count > 0).map(t => t.name));
                                }
                            }
                        } catch (e) { console.error("MusicBrainz lookup failed", e); }

                        // 2. Track-specific Last.fm Lookup
                        try {
                            const lfmRes = await fetch(`${serverBaseUrl}/api/lastfm-proxy?method=track.getInfo&artist=${encodeURIComponent(searchArtist)}&track=${encodeURIComponent(searchTitle)}`);
                            const lfmData = await lfmRes.json();
                            if (lfmData.track && lfmData.track.toptags && lfmData.track.toptags.tag) {
                                const tags = Array.isArray(lfmData.track.toptags.tag) ? lfmData.track.toptags.tag : [lfmData.track.toptags.tag];
                                trackTags.push(...tags.slice(0, 5).map(t => t.name));
                            }
                        } catch (e) { console.error("Last.fm lookup failed", e); }
                        
                        // 3. Smart Fallback Logic
                        let finalTrackGenres = [];
                        if (trackTags.length > 0) {
                            finalTrackGenres = trackTags;
                        } else {
                            finalTrackGenres = albumLevelGenres;
                        }

                        if (finalTrackGenres.length > 0) {
                            const blacklist = ['reissue', 'remaster', 'remastered', 'deluxe', 'bonus', 'edition', 'limited', 'lp', 'cd', 'vinyl'];
                            const filteredGenres = finalTrackGenres.filter(g => {
                                const lower = g.toLowerCase();
                                return !blacklist.some(b => lower.includes(b));
                            });
                            trackSpecificGenre = [...new Set(filteredGenres)].slice(0, 5).join(', ');
                        }

                        if (trackSpecificGenre) {
                            const localGenreStr = (localTrack.metadata && localTrack.metadata.genre) 
                                ? (Array.isArray(localTrack.metadata.genre) ? localTrack.metadata.genre.join(', ') : localTrack.metadata.genre) 
                                : '';
                            
                            const splitRegex = /[,/;\\]+/;
                            const localGenres = localGenreStr.split(splitRegex).map(g => g.trim()).filter(g => g);
                            const newGenres = trackSpecificGenre.split(splitRegex).map(g => g.trim()).filter(g => g);
                            
                            const mergedGenres = [...new Set([...localGenres, ...newGenres])];
                            const mergedGenreStr = mergedGenres.join(', ');

                            if (mergedGenreStr !== localGenreStr) {
                                update.metadata.genre = mergedGenreStr;
                                changed = true;
                            }
                        }
                    } catch (e) { console.error("Genre lookup failed", e); }
                }

                if (changed) {
                    corrections.push(update);
                }
            }

            // 4. Apply corrections
            if (corrections.length > 0) {
                checkProgressStatus.textContent = `Applying ${corrections.length} corrections...`;
                
                for (const corr of corrections) {
                    await fetch(`${serverBaseUrl}/api/update-metadata`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(corr)
                    });
                }
                
                checkProgressStatus.textContent = "Done! Library refreshing...";
                await initializeMusicLibrary();
                
                // CRITICAL: Refresh the current view to show the new merged data
                if (currentEditingAlbum && typeof albumsData !== 'undefined') {
                    const refreshedAlbum = albumsData[currentEditingAlbum.name];
                    if (refreshedAlbum) {
                        openAlbumView(refreshedAlbum, false);
                    }
                }
                
                alert(`Health Check Complete!\nApplied ${corrections.length} corrections.`);
            } else {
                alert("Health Check Complete! All metadata appears to be correct.");
            }

        } catch (err) {
            console.error("Health Check Error:", err);
            alert("Health Check Failed: " + err.message);
        } finally {
            checkMetadataModal.classList.add('hidden');
            checkStartBtn.disabled = false;
            checkStartBtn.textContent = "Start Health Check";
        }
    }

    function fuzzyMatch(s1, s2) {
        if (!s1 || !s2) return false;
        const clean = s => s.toString().toLowerCase()
            .replace(/\(.*\)/g, '') 
            .replace(/\[.*\]/g, '')
            .replace(/[^a-z0-9]/g, '')
            .trim();
        const c1 = clean(s1);
        const c2 = clean(s2);
        return c1 === c2 || c1.includes(c2) || c2.includes(c1);
    }

    function openEditMetadataModal(track) {
        isAlbumMode = false;
        currentEditingTrack = track;
        newCoverArtBase64 = null;

        metadataModalTitle.textContent = "Edit Song Information";

        // Ensure all fields are visible
        metadataTitleInput.closest('.input-group').style.display = 'flex';
        metadataYearInput.closest('.input-group').style.display = 'flex';
        metadataGenreInput.closest('.input-group').style.display = 'flex';

        // Hide cover editor for individual songs
        metadataArtDropzone.closest('.metadata-editor-left').style.display = 'none';
        metadataRestoreBtn.style.display = 'block';

        metadataTitleInput.value = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
        metadataArtistInput.value = (track.metadata && track.metadata.artist) ? track.metadata.artist : '';
        metadataAlbumInput.value = (track.metadata && track.metadata.album) ? track.metadata.album : '';
        metadataYearInput.value = (track.metadata && track.metadata.year) ? track.metadata.year : '';
        const currentGenre = (track.metadata && track.metadata.genre) 
            ? (Array.isArray(track.metadata.genre) ? track.metadata.genre.join(', ') : track.metadata.genre) 
            : '';
        metadataGenreInput.value = currentGenre;

        if (track.hasBackup) {
            metadataRestoreBtn.classList.remove('hidden');
        } else {
            metadataRestoreBtn.classList.add('hidden');
        }

        editMetadataModal.classList.remove('hidden');
    }

    metadataCancelBtn.addEventListener('click', () => {
        editMetadataModal.classList.add('hidden');
        if (metadataGenreDropdown) metadataGenreDropdown.style.display = 'none';
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
                year: metadataYearInput.value,
                genre: metadataGenreInput.value.trim().split(',').map(s => s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')).filter(Boolean).join(', ')
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

        body.innerHTML = `
            <div class="settings-section">
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

            <div class="settings-section">
                <div class="settings-section-title">Playback</div>
                <div class="settings-row">
                    <div class="settings-row-info">
                        <div class="settings-row-label">Crossfade Duration</div>
                        <div class="settings-row-sub">Seamlessly transition between tracks. Current: <span id="setting-crossfade-value" style="color:var(--accent); font-weight:600;">${CROSSFADE_DURATION / 1000}s</span></div>
                    </div>
                    <div class="settings-input-group zoom-slider-group">
                        <span class="zoom-min-label">0s</span>
                        <input id="setting-crossfade-duration" type="range" min="0" max="12" step="1" value="${CROSSFADE_DURATION / 1000}" class="settings-range-input">
                        <span class="zoom-max-label">12s</span>
                    </div>
                </div>
            </div>

            <div class="settings-section">
                <div class="settings-section-title">Display</div>
                <div class="settings-row">
                    <div class="settings-row-info">
                        <div class="settings-row-label">Zoom Level</div>
                        <div class="settings-row-sub">Adjust the interface scale. Current: <span id="zoom-value-label">${localStorage.getItem('zoomLevel') || '100'}%</span></div>
                    </div>
                    <div class="settings-input-group zoom-slider-group">
                        <span class="zoom-min-label">70%</span>
                        <input id="zoom-range-input" type="range" min="70" max="130" step="5" value="${localStorage.getItem('zoomLevel') || '100'}" class="settings-range-input">
                        <span class="zoom-max-label">130%</span>
                        <button id="zoom-reset-btn" class="zoom-reset-btn">Reset</button>
                    </div>
                </div>
            </div>
        `;

        // Audio Quality Handlers
        const qualityOptions = [
            { value: 'original', label: 'Original' },
            { value: '320', label: '320kbps' },
            { value: '192', label: '192kbps' },
            { value: '128', label: '128kbps' }
        ];

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

        // Network section handlers
        const zoomInput = document.getElementById('zoom-range-input');
        const zoomLabel = document.getElementById('zoom-value-label');
        if (zoomInput && zoomLabel) {
            zoomInput.addEventListener('input', (e) => {
                const val = e.target.value;
                zoomLabel.textContent = `${val}%`;
                const scale = parseFloat(val) / 100;
                document.documentElement.style.setProperty('--app-zoom', scale);
                localStorage.setItem('zoomLevel', val);
            });
            document.getElementById('zoom-reset-btn').addEventListener('click', () => {
                zoomInput.value = 100;
                zoomLabel.textContent = '100%';
                document.documentElement.style.setProperty('--app-zoom', '1');
                localStorage.setItem('zoomLevel', '100');
            });
        }

        // Crossfade Handler
        const crossfadeSlider = document.getElementById('setting-crossfade-duration');
        const crossfadeValue = document.getElementById('setting-crossfade-value');
        if (crossfadeSlider && crossfadeValue) {
            crossfadeSlider.addEventListener('input', (e) => {
                const secs = parseInt(e.target.value);
                CROSSFADE_DURATION = secs * 1000;
                crossfadeValue.textContent = secs + 's';
                localStorage.setItem('crossfadeDuration', CROSSFADE_DURATION);
            });
        }

        document.getElementById('server-url-save-btn').addEventListener('click', () => {
            const val = document.getElementById('server-url-input').value.trim().replace(/\/+$/, '');
            if (val && val !== DEFAULT_SERVER_URL) localStorage.setItem('serverUrl', val);
            else localStorage.removeItem('serverUrl');
            albumCoverCache.clear();
            location.reload();
        });
        const resetBtn = document.getElementById('server-url-reset-btn');
        if (resetBtn) resetBtn.addEventListener('click', () => { localStorage.removeItem('serverUrl'); albumCoverCache.clear(); location.reload(); });

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
    // ─────────────────────────────────────────────────────────────────────────

    modalCancelBtn.addEventListener('click', hideDependencyModal);
    dependencyModal.addEventListener('click', (e) => {
        if (e.target === dependencyModal) hideDependencyModal();
    });

    modalInstallBtn.addEventListener('click', async () => {
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
            generateShuffleQueue(currentTrackIndex);
        } else {
            shuffleBtn.classList.remove('toggle-active');
            shuffledIndices = [];
            currentShufflePointer = -1;
        }
        
        // Refresh UI and preloader for the new sequence
        updateImmersiveUpNext();
        if (queueView && queueView.classList.contains('active')) renderQueueView();
        preloadNextTrack();
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

    });

    audioPlayer.addEventListener('pause', () => {
        playIcon.setAttribute('d', 'M8 5v14l11-7z');

        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
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
        const genre = track.metadata?.genre || '';
        if (artist) sessionAffinity.artists[artist] = ((sessionAffinity.artists[artist] || 0) * 0.75) + 1.0;
        if (genre) sessionAffinity.genres[genre] = ((sessionAffinity.genres[genre] || 0) * 0.75) + 1.0;
    }

    function _isLastTrackInContext() {
        if (userQueue.length > 0 || repeatMode !== 0 || currentPlaylistContext.length === 0) return false;
        if (isShuffleActive) return currentShufflePointer >= shuffledIndices.length - 1;
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
            const genre = track.metadata?.genre || '';
            const year = parseInt(track.metadata?.year) || 0;
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
        const total = weighted.reduce((sum, s) => sum + s.w, 0);
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
                updateImmersiveUpNext();
            }
        }, 0);
    }
    // ─────────────────────────────────────────────────────────────────────────

    function commitTrackChange(index) {
        if (index < 0 || index >= currentPlaylistContext.length) return;
        if (isTrackUnsupported(currentPlaylistContext[index])) return;
        if (index < 0 || index >= currentPlaylistContext.length) return;

        currentTrackIndex = index;
        
        // Sync shuffle pointer if active
        if (isShuffleActive && shuffledIndices.length > 0) {
            const pos = shuffledIndices.indexOf(index);
            if (pos !== -1) currentShufflePointer = pos;
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
        // Refresh Up Next badge in immersive view
        updateImmersiveUpNext();
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
            if (currentShufflePointer >= shuffledIndices.length - 1) {
                if (repeatMode === 0) {
                    if (pendingRecommendedTrack) {
                        const rec = pendingRecommendedTrack;
                        pendingRecommendedTrack = null;
                        currentPlaylistContext = [rec];
                        shuffledIndices = [];
                        commitTrackChange(0);
                    } else {
                        audioPlayer.pause();
                    }
                    return;
                }
                generateShuffleQueue();
                commitTrackChange(shuffledIndices[currentShufflePointer]);
            } else {
                currentShufflePointer++;
                commitTrackChange(shuffledIndices[currentShufflePointer]);
            }
        } else {
            const nextIdx = getNextPlayableIndex(currentTrackIndex + 1, 1, isAutoEnded);
            if (nextIdx !== -1) {
                commitTrackChange(nextIdx);
            } else if (pendingRecommendedTrack) {
                const rec = pendingRecommendedTrack;
                pendingRecommendedTrack = null;
                        currentPlaylistContext = [rec];
                        shuffledIndices = [];
                        currentShufflePointer = -1;
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

        if (isShuffleActive && shuffledIndices.length > 0) {
            if (currentShufflePointer > 0) {
                currentShufflePointer--;
                commitTrackChange(shuffledIndices[currentShufflePointer]);
            } else {
                audioPlayer.currentTime = 0;
                audioPlayer.play();
            }
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
        return false; // Browser-based player supports seeking for all formats
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

    // Settings Listeners (Playback & Audio)
    const crossfadeSlider = document.getElementById('setting-crossfade-duration');
    const crossfadeValue = document.getElementById('setting-crossfade-value');
    
    if (crossfadeSlider) {
        // Initialize from persistent storage or default
        const initialSecs = CROSSFADE_DURATION / 1000;
        crossfadeSlider.value = initialSecs;
        crossfadeValue.textContent = initialSecs + 's';
        
        crossfadeSlider.addEventListener('input', (e) => {
            const secs = parseInt(e.target.value);
            CROSSFADE_DURATION = secs * 1000;
            crossfadeValue.textContent = secs + 's';
            localStorage.setItem('crossfadeDuration', CROSSFADE_DURATION);
        });
    }

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
            case 'history': switchToHistoryView(false); break;
            case 'likes': switchToLikesView(false); break;
            case 'downloads': switchToDownloadsView(false); break;
            case 'queue': showQueueOverlay(); break;
            case 'immersive': showImmersiveOverlay(); break;
            case 'stats': switchToStatsView(false); break;
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
        const glv1 = document.getElementById('likes-view'); if (glv1) { glv1.classList.remove('active'); glv1.classList.add('hidden'); }
        const ghv1 = document.getElementById('history-view'); if (ghv1) { ghv1.classList.remove('active'); ghv1.classList.add('hidden'); }
        const gdv1 = document.getElementById('downloads-view'); if (gdv1) { gdv1.classList.remove('active'); gdv1.classList.add('hidden'); }
        const gsv1 = document.getElementById('stats-view'); if (gsv1) { gsv1.classList.remove('active'); gsv1.classList.add('hidden'); }
        const gpv1 = document.getElementById('profile-view'); if (gpv1) { gpv1.classList.remove('active'); gpv1.classList.add('hidden'); }

        homeView.classList.remove('hidden'); homeView.classList.add('active');
    }

    function switchToHistoryView(push = true) {
        if (push) navigateTo('history');
        hideOverlays();
        
        homeView.classList.remove('active'); homeView.classList.add('hidden');
        searchView.classList.remove('active'); searchView.classList.add('hidden');
        albumView.classList.remove('active'); albumView.classList.add('hidden');
        artistView.classList.remove('active'); artistView.classList.add('hidden');
        if (playlistView) { playlistView.classList.remove('active'); playlistView.classList.add('hidden'); }
        const glv1 = document.getElementById('likes-view'); if (glv1) { glv1.classList.remove('active'); glv1.classList.add('hidden'); }
        const gdv1 = document.getElementById('downloads-view'); if (gdv1) { gdv1.classList.remove('active'); gdv1.classList.add('hidden'); }
        const gsv1 = document.getElementById('stats-view'); if (gsv1) { gsv1.classList.remove('active'); gsv1.classList.add('hidden'); }
        const gpv1 = document.getElementById('profile-view'); if (gpv1) { gpv1.classList.remove('active'); gpv1.classList.add('hidden'); }
        
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
        
        homeView.classList.remove('active'); homeView.classList.add('hidden');
        searchView.classList.remove('active'); searchView.classList.add('hidden');
        albumView.classList.remove('active'); albumView.classList.add('hidden');
        artistView.classList.remove('active'); artistView.classList.add('hidden');
        if (playlistView) { playlistView.classList.remove('active'); playlistView.classList.add('hidden'); }
        const ghv1 = document.getElementById('history-view'); if (ghv1) { ghv1.classList.remove('active'); ghv1.classList.add('hidden'); }
        const gdv1 = document.getElementById('downloads-view'); if (gdv1) { gdv1.classList.remove('active'); gdv1.classList.add('hidden'); }
        const gsv1 = document.getElementById('stats-view'); if (gsv1) { gsv1.classList.remove('active'); gsv1.classList.add('hidden'); }
        const gpv1 = document.getElementById('profile-view'); if (gpv1) { gpv1.classList.remove('active'); gpv1.classList.add('hidden'); }
        
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
        
        homeView.classList.remove('active'); homeView.classList.add('hidden');
        searchView.classList.remove('active'); searchView.classList.add('hidden');
        albumView.classList.remove('active'); albumView.classList.add('hidden');
        artistView.classList.remove('active'); artistView.classList.add('hidden');
        if (playlistView) { playlistView.classList.remove('active'); playlistView.classList.add('hidden'); }
        const glv1 = document.getElementById('likes-view'); if (glv1) { glv1.classList.remove('active'); glv1.classList.add('hidden'); }
        const ghv1 = document.getElementById('history-view'); if (ghv1) { ghv1.classList.remove('active'); ghv1.classList.add('hidden'); }
        const gsv1 = document.getElementById('stats-view'); if (gsv1) { gsv1.classList.remove('active'); gsv1.classList.add('hidden'); }
        const gpv1 = document.getElementById('profile-view'); if (gpv1) { gpv1.classList.remove('active'); gpv1.classList.add('hidden'); }
        
        const downloadsView = document.getElementById('downloads-view');
        if (downloadsView) {
            downloadsView.classList.remove('hidden');
            downloadsView.classList.add('active');
            fetchDownloads();
        }
    }


    function switchToSearchView(push = true) {
        if (push) navigateTo('search', { query: searchInput.value || (mobileSearchInput ? mobileSearchInput.value : '') });
        hideOverlays();
        albumView.classList.remove('active'); albumView.classList.add('hidden');
        homeView.classList.remove('active'); homeView.classList.add('hidden');
        artistView.classList.remove('active'); artistView.classList.add('hidden');
        if (playlistView) { playlistView.classList.remove('active'); playlistView.classList.add('hidden'); }
        const glv2 = document.getElementById('likes-view'); if (glv2) { glv2.classList.remove('active'); glv2.classList.add('hidden'); }
        const ghv2 = document.getElementById('history-view'); if (ghv2) { ghv2.classList.remove('active'); ghv2.classList.add('hidden'); }
        const gdv2 = document.getElementById('downloads-view'); if (gdv2) { gdv2.classList.remove('active'); gdv2.classList.add('hidden'); }
        const gsv2 = document.getElementById('stats-view'); if (gsv2) { gsv2.classList.remove('active'); gsv2.classList.add('hidden'); }
        const gpv2 = document.getElementById('profile-view'); if (gpv2) { gpv2.classList.remove('active'); gpv2.classList.add('hidden'); }


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
        const glv3 = document.getElementById('likes-view'); if (glv3) { glv3.classList.remove('active'); glv3.classList.add('hidden'); }
        const ghv3 = document.getElementById('history-view'); if (ghv3) { ghv3.classList.remove('active'); ghv3.classList.add('hidden'); }
        const gdv3 = document.getElementById('downloads-view'); if (gdv3) { gdv3.classList.remove('active'); gdv3.classList.add('hidden'); }
        const gsv3 = document.getElementById('stats-view'); if (gsv3) { gsv3.classList.remove('active'); gsv3.classList.add('hidden'); }
        const gpv3 = document.getElementById('profile-view'); if (gpv3) { gpv3.classList.remove('active'); gpv3.classList.add('hidden'); }


        albumView.classList.remove('hidden'); albumView.classList.add('active');
    }

    function switchToArtistView(push = true) {
        if (push) navigateTo('artist');
        hideOverlays();
        searchView.classList.remove('active'); searchView.classList.add('hidden');
        homeView.classList.remove('active'); homeView.classList.add('hidden');
        albumView.classList.remove('active'); albumView.classList.add('hidden');
        if (playlistView) { playlistView.classList.remove('active'); playlistView.classList.add('hidden'); }
        const glv4 = document.getElementById('likes-view'); if (glv4) { glv4.classList.remove('active'); glv4.classList.add('hidden'); }
        const ghv4 = document.getElementById('history-view'); if (ghv4) { ghv4.classList.remove('active'); ghv4.classList.add('hidden'); }
        const gdv4 = document.getElementById('downloads-view'); if (gdv4) { gdv4.classList.remove('active'); gdv4.classList.add('hidden'); }
        const gsv4 = document.getElementById('stats-view'); if (gsv4) { gsv4.classList.remove('active'); gsv4.classList.add('hidden'); }
        const gpv4 = document.getElementById('profile-view'); if (gpv4) { gpv4.classList.remove('active'); gpv4.classList.add('hidden'); }

        artistView.classList.remove('hidden'); artistView.classList.add('active');
    }

    function switchToPlaylistView(push = true) {
        if (push) navigateTo('playlist');
        hideOverlays();
        searchView.classList.remove('active'); searchView.classList.add('hidden');
        homeView.classList.remove('active'); homeView.classList.add('hidden');
        albumView.classList.remove('active'); albumView.classList.add('hidden');
        artistView.classList.remove('active'); artistView.classList.add('hidden');
        const glv5 = document.getElementById('likes-view'); if (glv5) { glv5.classList.remove('active'); glv5.classList.add('hidden'); }
        const gsv5 = document.getElementById('stats-view'); if (gsv5) { gsv5.classList.remove('active'); gsv5.classList.add('hidden'); }
        const gpv5 = document.getElementById('profile-view'); if (gpv5) { gpv5.classList.remove('active'); gpv5.classList.add('hidden'); }

        playlistView.classList.remove('hidden'); playlistView.classList.add('active');
    }

    function switchToStatsView(push = true) {
        if (push) navigateTo('stats');
        hideOverlays();
        
        homeView.classList.remove('active'); homeView.classList.add('hidden');
        searchView.classList.remove('active'); searchView.classList.add('hidden');
        albumView.classList.remove('active'); albumView.classList.add('hidden');
        artistView.classList.remove('active'); artistView.classList.add('hidden');
        if (playlistView) { playlistView.classList.remove('active'); playlistView.classList.add('hidden'); }
        const glv6 = document.getElementById('likes-view'); if (glv6) { glv6.classList.remove('active'); glv6.classList.add('hidden'); }
        const ghv6 = document.getElementById('history-view'); if (ghv6) { ghv6.classList.remove('active'); ghv6.classList.add('hidden'); }
        const gdv6 = document.getElementById('downloads-view'); if (gdv6) { gdv6.classList.remove('active'); gdv6.classList.add('hidden'); }
        const gpv6 = document.getElementById('profile-view'); if (gpv6) { gpv6.classList.remove('active'); gpv6.classList.add('hidden'); }
        
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

    // Helper to calculate how many items fit in a horizontal row
    function calculateItemsPerRow(itemWidth = 200, gap = 24, padding = 80) {
        const scale = typeof getZoomScale === 'function' ? getZoomScale() : 1;
        // Adjust the available width based on the internal application zoom
        const availableWidth = (window.innerWidth / scale) - padding;
        // Use ceil and add 1 to ensure we always overflow slightly into the right-side fade mask
        const count = Math.ceil((availableWidth + gap) / (itemWidth + gap)) + 1;
        return Math.max(8, count); 
    }

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

    // Custom Genre Dropdown Logic
    const DEFAULT_GENRES = [
        "Acoustic", "Alternative", "Ambient", "Blues", "Classical", "Country", "Dance", 
        "Electronic", "Folk", "Hip-Hop", "Indie", "Jazz", "Latin", "Lo-Fi", "Metal", 
        "Pop", "R&B", "Rock", "Soul", "Soundtrack", "Trap"
    ];

    function renderGenreDropdown(filter = '') {
        if (!metadataGenreDropdown) return;
        metadataGenreDropdown.innerHTML = '';
        const lowerFilter = filter.toLowerCase();
        
        let options = [...DEFAULT_GENRES];
        const currentVal = metadataGenreInput.value.trim();
        if (currentVal && !options.some(o => o.toLowerCase() === currentVal.toLowerCase())) {
            options.unshift(currentVal);
        }

        options = options.filter(g => g.toLowerCase().includes(lowerFilter));

        if (options.length === 0) {
            metadataGenreDropdown.style.display = 'none';
            return;
        }

        options.forEach(g => {
            const div = document.createElement('div');
            div.textContent = g;
            div.style.padding = '10px 16px';
            div.style.cursor = 'pointer';
            div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            div.style.fontSize = '14px';
            div.addEventListener('mouseenter', () => div.style.background = 'rgba(255,255,255,0.05)');
            div.addEventListener('mouseleave', () => div.style.background = 'transparent');
            div.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent blur
                metadataGenreInput.value = g;
                metadataGenreDropdown.style.display = 'none';
            });
            metadataGenreDropdown.appendChild(div);
        });

        metadataGenreDropdown.style.display = 'block';
    }

    if (metadataGenreInput && metadataGenreDropdown) {
        metadataGenreInput.addEventListener('focus', () => renderGenreDropdown(''));
        metadataGenreInput.addEventListener('input', () => renderGenreDropdown(metadataGenreInput.value));
        metadataGenreInput.addEventListener('blur', () => {
            metadataGenreDropdown.style.display = 'none';
        });
    }

    async function renderSearchResults(query) {
        // Collect unique artists that actually have albums/tracks
        const seenArtists = new Set();
        Object.values(albumsData).forEach(album => {
            if (album.artist && album.artist !== 'Unknown Artist') {
                splitArtists(album.artist).forEach(a => seenArtists.add(a));
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
                    ? `<img src="${getSharedCoverUrl(coverTrack.relativePath, coverTrack.metadata.artist, coverTrack.metadata.album)}" class="search-row-cover-img" alt="">`
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

    async function initializeMusicLibrary() {
        // Any reload means track metadata may have changed — clear stale view cache entries
        _openVCDB().then(async (db) => {
            const manifest = await _vcGetManifest(db);
            const albumAndArtistKeys = Object.keys(manifest.entries).filter(k => k.startsWith('album:') || k.startsWith('artist:'));
            for (const key of albumAndArtistKeys) await _vcEvict(db, manifest, key);
            if (albumAndArtistKeys.length > 0) await _vcPut(db, { key: VC_MANIFEST, data: manifest });
        }).catch(() => { });

        try {
            const serverRes = await fetch(`${serverBaseUrl}/api/audio`);
            const serverTracks = serverRes.ok ? await serverRes.json() : [];

            if (serverTracks.length === 0) return;

            // Mark all as server tracks
            serverTracks.forEach(st => {
                st.isServer = true;
                st.isLocal = false;
            });

            allTracks = serverTracks;
            processAlbums(serverTracks);
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
            currentPlaylistContext = albumInfo.tracks;
            if (isShuffleActive) generateShuffleQueue();
            commitTrackChange(firstIdx);
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
        const count = calculateItemsPerRow();
        const recentAlbums = albumsArray.slice(0, count);
        recentAlbums.forEach(albumInfo => {
            recentList.appendChild(createAlbumCard(albumInfo));
        });



        if (typeof renderRecentArtists === 'function') {
            renderRecentArtists();
        }

        if (typeof renderDiscoveryStrip === 'function') {
            renderDiscoveryStrip();
        }

        if (typeof renderPlaylistsStrip === 'function') {
            renderPlaylistsStrip();
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
                    <span style="opacity: 0.7;">• ${yearStr} • ${songCountStr}${durationStr}</span>
                    ${genresHtml}
                </div>
            </div>
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
                currentPlaylistContext = albumInfo.tracks;
                if (isShuffleActive) generateShuffleQueue();
                commitTrackChange(firstIdx);
            });
        }

        const downloadAlbumBtn = albumHeroDiv.querySelector('.download-album-btn');
        const editAlbumBtn = albumHeroDiv.querySelector('.edit-album-btn');
        const checkMetadataBtn = albumHeroDiv.querySelector('.check-metadata-btn');

        if (editAlbumBtn) {
            editAlbumBtn.addEventListener('click', () => openEditAlbumModal(albumInfo));
        }

        if (checkMetadataBtn) {
            checkMetadataBtn.addEventListener('click', () => openCheckMetadataModal(albumInfo));
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

    // ── Track List Rendering ──────────────────────────────────────────────────
    function renderTrackList(tracks, container = trackListElement, isPlaylistView = false, playlistId = null, canEdit = true, showTrackNumbers = false) {
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

        tracksToRender.forEach((track, index) => {
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
                    if (isShuffleActive) generateShuffleQueue();
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
        const lowerArtistName = artistName.toLowerCase();
        for (const [albumName, albumInfo] of Object.entries(albumsData)) {
            // Match if the album's artist field contains this artist name
            const albumArtists = splitArtists(albumInfo.artist).map(a => a.toLowerCase());
            if (albumArtists.includes(lowerArtistName) || albumInfo.artist.toLowerCase() === lowerArtistName) {
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
            artistAlbumGrid.appendChild(createAlbumCard(albumInfo));
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

    async function fetchLyrics(title, artist, album, duration, cachedLyrics = null) {
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

        // 0. Check cached lyrics from IDB (passed in)
        if (cachedLyrics) {
            if (cachedLyrics.syncedLyrics) {
                lyricsData = parseLrc(cachedLyrics.syncedLyrics);
                renderLyrics();
                renderLyricsActionBar(true, false);
            } else {
                plainLyricsCache = cachedLyrics.plainLyrics || '';
                showLyricsNoSyncState();
            }
            return;
        }

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

    // ── History System ────────────────────────────────────────────────────────
    
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

    // ── Downloads System ──────────────────────────────────────────────────────

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
                storageText.textContent = `${count} track${count !== 1 ? 's' : ''} · ${formatBytes(totalBytes)}`;
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

    // ── Likes System ──────────────────────────────────────────────────────────

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
        const track = trackToToggle || globalPlayingTrack;
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
        
        const isLiked = currentUser && globalPlayingTrack && likedTracks.has(globalPlayingTrack.url);
        
        if (likeTrackBtn) {
            if (!currentUser || !globalPlayingTrack) {
                likeTrackBtn.classList.remove('active');
            } else {
                likeTrackBtn.classList.toggle('active', isLiked);
            }
        }
        
        if (immersiveLikeBtn) {
            if (!currentUser || !globalPlayingTrack) {
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
        const statsContent = document.getElementById('stats-content');
        if (!statsContent) return;

        statsContent.innerHTML = '<div class="loading">Loading library metrics...</div>';

        try {
            const res = await fetch(`${serverBaseUrl}/api/stats`);
            const stats = await res.json();

            statsContent.innerHTML = `
                <div class="stats-card">
                    <div class="stats-value">${stats.totalTracks.toLocaleString()}</div>
                    <div class="stats-label">Total Tracks</div>
                </div>
                <div class="stats-card">
                    <div class="stats-value">${stats.totalAlbums.toLocaleString()}</div>
                    <div class="stats-label">Albums</div>
                </div>
                <div class="stats-card">
                    <div class="stats-value">${stats.totalArtists.toLocaleString()}</div>
                    <div class="stats-label">Artists</div>
                </div>
                <div class="stats-card">
                    <div class="stats-value">${stats.totalDurationFormatted}</div>
                    <div class="stats-label">Playtime</div>
                </div>
                <div class="stats-card">
                    <div class="stats-value">${stats.losslessCount.toLocaleString()}</div>
                    <div class="stats-label">Lossless Tracks</div>
                </div>
                <div class="stats-card">
                    <div class="stats-value">${stats.hiResCount.toLocaleString()}</div>
                    <div class="stats-label">Hi-Res Tracks</div>
                </div>
            `;
            
            // Add format breakdown if available
            if (stats.formats) {
                const formatList = Object.entries(stats.formats)
                    .sort((a, b) => b[1] - a[1])
                    .map(([fmt, count]) => `<li style="display: flex; justify-content: space-between;"><span>${fmt}</span> <span style="color: var(--accent); font-weight: 700;">${count}</span></li>`)
                    .join('');
                
                const formatCard = document.createElement('div');
                formatCard.className = 'stats-card';
                formatCard.innerHTML = `
                    <div class="stats-label">Format Breakdown</div>
                    <ul style="list-style: none; padding: 0; margin-top: 16px; opacity: 0.8; font-size: 14px; display: flex; flex-direction: column; gap: 8px;">
                        ${formatList}
                    </ul>
                `;
                statsContent.appendChild(formatCard);
            }

        } catch (e) {
            statsContent.innerHTML = `<div class="error">Failed to load statistics: ${e.message}</div>`;
        }
    }

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
                const url = getSharedCoverUrl(coverTracks[i].relativePath, coverTracks[i].metadata.artist, coverTracks[i].metadata.album);
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
                if (isShuffleActive) generateShuffleQueue();
                commitTrackChange(firstIdx);
            });
            card.addEventListener('click', () => openPlaylistView(pl));
            playlistStrip.appendChild(card);
        });
    }

    async function renderDiscoveryStrip() {
        const discoverSection = document.getElementById('discover-section');
        const discoverStrip = document.getElementById('discover-strip');
        if (!discoverStrip || !discoverSection) return;

        try {
            const res = await fetch(`${serverBaseUrl}/api/discovery`);
            if (!res.ok) throw new Error('Discovery fetch failed');
            const discoveries = await res.json();

            if (!discoveries || discoveries.length === 0) {
                discoverSection.style.display = 'none';
                return;
            }

            discoverSection.style.display = 'block';
            discoverStrip.innerHTML = '';

            discoveries.forEach(pl => {
                const card = document.createElement('div');
                card.className = 'playlist-card';

                card.innerHTML = `
                    <div class="card-art-wrapper">
                        ${buildCollageHtml(pl)}
                        <div class="community-badge">Discover</div>
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
                    if (isShuffleActive) generateShuffleQueue();
                    commitTrackChange(firstIdx);
                });

                card.addEventListener('click', () => {
                    openPlaylistView(pl);
                });

                discoverStrip.appendChild(card);
            });
        } catch (e) {
            console.error('[Discover] Failed to fetch discoveries:', e);
            discoverSection.style.display = 'none';
        }
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
                const url = getSharedCoverUrl(firstCoverTrack.relativePath, firstCoverTrack.metadata.artist, firstCoverTrack.metadata.album);
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
            if (isShuffleActive) generateShuffleQueue();
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
        const scale = getZoomScale();
        addToPlaylistDropdown.style.top = `${(rect.bottom / scale) + 6}px`;
        addToPlaylistDropdown.style.left = `${Math.min(rect.left / scale, (window.innerWidth / scale) - 270)}px`;
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

        const count = calculateItemsPerRow();
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

            if (typeof fetchAndApplyArtistImage === 'function') {
                fetchAndApplyArtistImage(artistName, card, false);
            }
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

    async function playTrack(track, title, artist) {
        addToHistory(track);
        globalPlayingTrack = track;
        if (currentActiveBlobUrl) {
            URL.revokeObjectURL(currentActiveBlobUrl);
            currentActiveBlobUrl = null;
        }

        const isDownloaded = downloadedTracksMap.has(track.url);
        let fullAudioUrl = getTrackUrlForQuality(track, 'stream');

        if (isDownloaded) {
            // PWA: Play from IndexedDB
            try {
                const saved = await getTrackFromIDB(track.url);
                if (saved && saved.blob) {
                    currentActiveBlobUrl = URL.createObjectURL(saved.blob);
                    fullAudioUrl = currentActiveBlobUrl;

                    // Pass cached data forward for UI display and lyrics
                    track._cachedCover = saved.coverBlob;
                    track._cachedLyrics = saved.lyrics;

                    console.log('[PWA] Playing from offline storage:', track.url);
                }
            } catch (e) {
                console.error('[PWA] IDB playback failed', e);
            }
        }

        // Update Bottom Offline Icon
        if (bottomOfflineBtn) {
            bottomOfflineBtn.classList.toggle('downloaded', !!isDownloaded);
            bottomOfflineBtn.classList.toggle('is-local', !!track.isLocal && !track.isBoth);
            bottomOfflineBtn.classList.toggle('is-both', !!track.isBoth);

            if (track.isBoth) {
                bottomOfflineBtn.title = 'Local & Server Synced';
            } else if (track.isLocal) {
                bottomOfflineBtn.title = 'Local File';
            } else if (isDownloaded) {
                bottomOfflineBtn.title = 'Available Offline';
            } else {
                bottomOfflineBtn.title = 'Remote Source';
            }
        }
        
        updateLikeButtonState();

        bottomTitle.textContent = title;
        bottomArtist.innerHTML = splitArtists(artist).map(a => `<span class="bottom-artist-link" data-artist="${a}" style="cursor: pointer;">${a}</span>`).join('<span style="opacity:0.5">, </span>');

        // Save to Recent Artists History
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

        if (currentActiveCoverUrl) {
            URL.revokeObjectURL(currentActiveCoverUrl);
            currentActiveCoverUrl = null;
        }

        if (track._cachedCover) {
            currentActiveCoverUrl = URL.createObjectURL(track._cachedCover);
            const pictureUrl = currentActiveCoverUrl;
            bottomArtWrapper.innerHTML = `<img src="${pictureUrl}" alt="Album Art">`;
            if (immersiveBg) immersiveBg.src = pictureUrl;
            if (immersiveArt) {
                immersiveArt.src = pictureUrl;
                immersiveArt.style.display = 'block';
            }
            updatePlayerBarDynamicColor(pictureUrl);
        } else if (track.metadata && track.metadata.hasCover) {
            const pictureUrl = getSharedCoverUrl(track.relativePath, track.metadata.artist, track.metadata.album);
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

        if (immersiveTitle) {
            immersiveTitle.textContent = title;
            immersiveTitle.onclick = () => {
                const albumName = track.metadata && track.metadata.album ? track.metadata.album : null;
                if (albumName && albumsData[albumName]) {
                    hideImmersiveOverlay();
                    openAlbumView(albumsData[albumName]);
                }
            };
        }
        if (immersiveArtist) {
            const artists = splitArtists(artist);
            immersiveArtist.innerHTML = artists.map(a => `<span class="immersive-artist-link" data-artist="${a}" style="cursor:pointer;">${a}</span>`).join('<span style="opacity:0.5">, </span>');
            immersiveArtist.onclick = (e) => {
                const link = e.target.closest('.immersive-artist-link');
                const targetArtist = link ? link.dataset.artist : artists[0];
                if (targetArtist && targetArtist !== 'Unknown Artist') {
                    hideImmersiveOverlay();
                    openArtistView(targetArtist);
                }
            };
        }

        const album = track.metadata && track.metadata.album ? track.metadata.album : '';
        const duration = track.metadata && track.metadata.duration ? track.metadata.duration : 0;
        fetchLyrics(title, artist, album, duration, track._cachedLyrics);

        updateMediaSession(track);
        
        // Restore standard src property so UI checks pass
        audioPlayer.src = fullAudioUrl;

        // Reset crossfade lockout
        crossfadeTimeout = false;

        const url = fullAudioUrl;
        
        if (nextHowl && nextTrackData && nextTrackData.url === track.url) {
            console.log('[Audio] Using preloaded track:', title);
            const oldHowl = currentHowl;
            currentHowl = nextHowl;
            nextHowl = null;
            nextTrackData = null;

            if (oldHowl && oldHowl.playing()) {
                // IMPORTANT: Unbind the 'end' event so it doesn't trigger another skip when it finishes fading
                oldHowl.off('end');
                fadeHowl(oldHowl, 0, CROSSFADE_DURATION, () => oldHowl.unload());
            }

            // Ensure preloaded track has correct triggers connected
            currentHowl.off('play').on('play', () => audioPlayer._trigger('play'));
            currentHowl.off('pause').on('pause', () => audioPlayer._trigger('pause'));
            currentHowl.off('load').on('load', () => audioPlayer._trigger('loadedmetadata'));

            currentHowl.volume(0);
            currentHowl.play();
            fadeHowl(currentHowl, lastVolume || 0.7, CROSSFADE_DURATION);
            
            // Manual trigger in case it was already loaded
            audioPlayer._trigger('loadedmetadata');
        } else {
            if (currentHowl) {
                // If we are playing, fade out, otherwise just unload
                if (currentHowl.playing()) {
                    const old = currentHowl;
                    old.off('end'); // Silence alarms for the old track
                    fadeHowl(old, 0, 1000, () => old.unload());
                } else {
                    currentHowl.unload();
                }
            }

            const format = getPlaybackFormat(track, 'stream');
            currentHowl = new Howl({
                src: [url],
                format: format ? [format] : undefined,
                html5: false, // Switch to Web Audio for precision and seeking
                autoplay: false,
                onplay: () => audioPlayer._trigger('play'),
                onpause: () => audioPlayer._trigger('pause'),
                onend: () => {
                    if (repeatMode === 2) {
                        currentHowl.seek(0);
                        currentHowl.play();
                    } else {
                        playNextTrack(true);
                    }
                },
                onload: () => audioPlayer._trigger('loadedmetadata'),
                onloaderror: (id, err) => {
                    console.error('[Audio] Howl load error:', err, 'URL:', url, 'Format:', format);
                }
            });
            currentHowl.volume(lastVolume || 0.7);
            currentHowl.play();
        }

        // Schedule next preload
        setTimeout(preloadNextTrack, 5000);
    }

    function getNextTrack() {
        if (userQueue.length > 0) return userQueue[0];
        if (currentTrackIndex === -1) return null;

        if (isShuffleActive && shuffledIndices.length > 0) {
            if (currentShufflePointer < shuffledIndices.length - 1) {
                return currentPlaylistContext[shuffledIndices[currentShufflePointer + 1]];
            }
        } else {
            const nextIdx = getNextPlayableIndex(currentTrackIndex + 1, 1, true);
            if (nextIdx !== -1) return currentPlaylistContext[nextIdx];
        }
        return pendingRecommendedTrack;
    }

    async function preloadNextTrack() {
        const next = getNextTrack();
        if (!next || (nextTrackData && nextTrackData.url === next.url)) return;

        console.log('[Audio] Preloading next track:', next.filename);
        
        const isDownloaded = downloadedTracksMap.has(next.url);
        let url = getTrackUrlForQuality(next, 'stream');

        if (isDownloaded) {
            try {
                const saved = await getTrackFromIDB(next.url);
                if (saved && saved.blob) {
                    url = URL.createObjectURL(saved.blob);
                }
            } catch (e) {}
        }

        if (nextHowl) nextHowl.unload();

        nextTrackData = next;
        const format = getPlaybackFormat(next, 'stream');
        nextHowl = new Howl({
            src: [url],
            format: format ? [format] : undefined,
            html5: false, // Web Audio mode
            preload: true,
            autoplay: false,
            onplay: () => audioPlayer._trigger('play'),
            onpause: () => audioPlayer._trigger('pause'),
            onend: () => {
                if (repeatMode === 2) {
                    currentHowl.seek(0);
                    currentHowl.play();
                } else {
                    playNextTrack(true);
                }
            },
            onload: () => {
                console.log('[Audio] Preload complete:', next.filename);
                if (currentHowl === nextHowl) audioPlayer._trigger('loadedmetadata');
            },
            onloaderror: (id, err) => {
                console.error('[Audio] Howl preload error:', err, 'URL:', url, 'Format:', format);
            }
        });
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
        if (!globalPlayingTrack) return;
        const link = e.target.closest('.bottom-artist-link');
        if (link) {
            openArtistView(link.dataset.artist);
        } else {
            const artistName = (globalPlayingTrack.metadata && globalPlayingTrack.metadata.artist) ? globalPlayingTrack.metadata.artist : "Unknown Artist";
            openArtistView(splitArtists(artistName)[0]);
        }
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
                    const scale = getZoomScale();
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
