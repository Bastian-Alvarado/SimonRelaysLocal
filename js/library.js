/**
 * Library Module
 * Handles IndexedDB storage, file scanning, and music collection organization.
 */

const Library = (function() {
    let config = {
        serverBaseUrl: '',
        selectors: {
            recentAlbums: 'recent-album-list',
            recentArtists: 'recent-artist-list'
        },
        callbacks: {
            onAlbumClick: null,  // (album) => { ... }
            onArtistClick: null, // (artistName) => { ... }
            onLibraryBuilt: null, // () => { ... }
            isTrackUnsupported: null // (track) => boolean
        }
    };

    // State
    let db = null;
    let vcDb = null;
    let allTracks = [];
    let albumsData = {};
    let artistsData = {};

    const DB_NAME = 'SimonRelaysOffline';
    const DB_VERSION = 1;
    const VC_DB_NAME = 'SimonRelaysViewCache';
    const VC_STORE = 'views';
    const VC_MANIFEST = '__manifest__';

    // --- IndexedDB Core ---

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

    async function initVCDB() {
        if (vcDb) return vcDb;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(VC_DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(VC_STORE)) {
                    db.createObjectStore(VC_STORE, { keyPath: 'key' });
                }
            };
            request.onsuccess = (e) => {
                vcDb = e.target.result;
                resolve(vcDb);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // --- View Cache Helpers ---
    async function vcGet(key) {
        const db = await initVCDB();
        return new Promise((resolve) => {
            const req = db.transaction(VC_STORE, 'readonly').objectStore(VC_STORE).get(key);
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror = () => resolve(null);
        });
    }
    async function vcPut(record) {
        const db = await initVCDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(VC_STORE, 'readwrite');
            tx.objectStore(VC_STORE).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }
    async function vcDelete(key) {
        const db = await initVCDB();
        return new Promise((resolve) => {
            const tx = db.transaction(VC_STORE, 'readwrite');
            tx.objectStore(VC_STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    // --- Module Methods ---

    return {
        init: function(options) {
            config = { 
                ...config, 
                ...options,
                selectors: { ...config.selectors, ...options.selectors },
                callbacks: { ...config.callbacks, ...options.callbacks }
            };

            // Export to window for PWA/renderer usage
            window.getTrackFromIDB = this.getTrackFromIDB.bind(this);
            window.saveTrackToIDB = this.saveTrackToIDB.bind(this);
            window.deleteTrackFromIDB = this.deleteTrackFromIDB.bind(this);
            window.getAllDownloadedFromIDB = this.getAllDownloadedTracks.bind(this);
        },

        // Storage API
        saveTrackToIDB: async function(trackUrl, blob, metadata, coverBlob = null, lyrics = null) {
            const db = await initDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['tracks'], 'readwrite');
                tx.objectStore('tracks').put({ trackUrl, blob, metadata, coverBlob, lyrics, savedAt: Date.now() });
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error);
            });
        },

        getTrackFromIDB: async function(trackUrl) {
            const db = await initDB();
            return new Promise((resolve, reject) => {
                const req = db.transaction(['tracks'], 'readonly').objectStore('tracks').get(trackUrl);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            });
        },

        deleteTrackFromIDB: async function(trackUrl) {
            const db = await initDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['tracks'], 'readwrite');
                tx.objectStore('tracks').delete(trackUrl);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            });
        },

        getAllDownloadedTracks: async function() {
            const db = await initDB();
            return new Promise((resolve, reject) => {
                const req = db.transaction(['tracks'], 'readonly').objectStore('tracks').getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve([]);
            });
        },

        // Library Management
        load: async function() {
            // 1. Clear stale view cache entries
            try {
                const rec = await vcGet(VC_MANIFEST);
                if (rec) {
                    const manifest = rec.data;
                    const albumAndArtistKeys = Object.keys(manifest.entries).filter(k => k.startsWith('album:') || k.startsWith('artist:'));
                    for (const key of albumAndArtistKeys) {
                        await vcDelete(key);
                        delete manifest.entries[key];
                    }
                    await vcPut({ key: VC_MANIFEST, data: manifest });
                }
            } catch (e) {}

            // 2. Fetch from server
            try {
                const response = await fetch(`${config.serverBaseUrl}/api/audio`);
                if (!response.ok) throw new Error('Server unreachable');
                const tracks = await response.json();

                if (tracks && tracks.length > 0) {
                    tracks.forEach(t => { t.isServer = true; t.isLocal = false; });
                    this.buildLibrary(tracks);
                } else {
                    console.warn('[Library] Server library is empty.');
                    this.buildLibrary([]);
                }
            } catch (e) {
                console.error('[Library] Load failed:', e);
                this.buildLibrary([]);
            }
        },

        buildLibrary: function(tracks) {
            allTracks = tracks;
            albumsData = {};
            artistsData = {};

            tracks.forEach(track => {
                if (!track.metadata) return;
                const albumName = track.metadata.album || "Unknown Album";
                const artistName = track.metadata.artist || "Unknown Artist";
                const addedAt = track.addedAt || 0;

                if (!albumsData[albumName]) {
                    albumsData[albumName] = {
                        name: albumName,
                        artist: artistName,
                        coverTrackPath: track.metadata.hasCover ? track.relativePath : null,
                        tracks: [],
                        addedAt: addedAt
                    };
                } else if (addedAt > albumsData[albumName].addedAt) {
                    albumsData[albumName].addedAt = addedAt;
                }
                albumsData[albumName].tracks.push(track);

                // Artists grouping
                if (!artistsData[artistName]) {
                    artistsData[artistName] = { name: artistName, trackCount: 0 };
                }
                artistsData[artistName].trackCount++;
            });

            // Sort tracks within albums
            Object.values(albumsData).forEach(album => {
                album.tracks.sort((a, b) => {
                    const aDisc = parseInt(a.metadata?.disk?.no || 1, 10);
                    const bDisc = parseInt(b.metadata?.disk?.no || 1, 10);
                    if (aDisc !== bDisc) return aDisc - bDisc;

                    const aNo = parseInt(a.metadata?.track?.no || 9999, 10);
                    const bNo = parseInt(b.metadata?.track?.no || 9999, 10);
                    if (aNo !== bNo) return aNo - bNo;

                    return (a.metadata?.title || a.filename).localeCompare(b.metadata?.title || b.filename);
                });
            });

            // Sync globals
            window.allTracks = allTracks;
            window.albumsData = albumsData;

            if (config.callbacks.onLibraryBuilt) config.callbacks.onLibraryBuilt();
            this.renderHomeStrips();
        },

        getAlbums: () => albumsData,
        getArtists: () => artistsData,
        getAllTracks: () => allTracks,

        renderHomeStrips: function() {
            this.renderRecentAlbums();
            this.renderRecentArtists();
            if (typeof Playlist !== 'undefined' && Playlist.renderDiscoverStrip) {
                Playlist.renderDiscoverStrip();
            }
        },

        renderRecentAlbums: function() {
            const container = document.getElementById(config.selectors.recentAlbums);
            if (!container) return;
            container.innerHTML = '';

            const albums = Object.values(albumsData);
            albums.sort((a, b) => b.addedAt - a.addedAt);

            // Use the same per-row calculation as the original renderer
            const count = (typeof window.calculateItemsPerRow === 'function') ? window.calculateItemsPerRow() : 8;
            
            albums.slice(0, count).forEach(album => {
                const card = document.createElement('div');
                card.className = 'album-card';
                
                let artHtml = `<div class="album-card-art"></div>`;
                if (album.coverTrackPath) {
                    const url = window.getSharedCoverUrl(album.coverTrackPath, album.artist, album.name);
                    artHtml = `<img src="${url}" class="album-card-art" alt="" loading="lazy">`;
                }

                const playBtnHtml = `<button class="card-play-btn" title="Play">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>`;

                card.innerHTML = `
                    <div class="card-art-wrapper">
                        ${artHtml}
                        ${playBtnHtml}
                    </div>
                    <div class="album-card-title">${album.name}</div>
                    <div class="album-card-artist">${this.formatArtists(album.artist)}</div>
                `;

                card.querySelector('.card-play-btn').onclick = (e) => {
                    e.stopPropagation();
                    const firstIdx = album.tracks.findIndex(t => config.callbacks.isTrackUnsupported ? !config.callbacks.isTrackUnsupported(t) : true);
                    if (firstIdx !== -1 && config.callbacks.onPlay) {
                        config.callbacks.onPlay(album.tracks[firstIdx], album.tracks, firstIdx);
                    }
                };

                card.onclick = () => {
                    if (config.callbacks.onAlbumClick) config.callbacks.onAlbumClick(album);
                };

                container.appendChild(card);
            });
        },

        renderRecentArtists: function() {
            // This will be connected to session history in the next phase
            const container = document.getElementById(config.selectors.recentArtists);
            if (!container) return;
            // Placeholder
        },

        formatArtists: function(raw) {
            if (typeof window.splitArtists !== 'function') return raw;
            return window.splitArtists(raw).map(a => `<span class="artist-link" data-artist="${a}">${a}</span>`).join('<span style="opacity:0.5">, </span>');
        }
    };
})();

window.Library = Library;
