/**
 * SimonRelays State Management Module
 * Centralizes all shared application state to decouple modules.
 */
const State = (() => {
    // Internal private state
    const _state = {
        albumsData: {},
        allTracks: [],
        allPlaylists: [],
        currentUser: null,
        likedTracks: new Set(),
        allLikedTracksCache: [],
        historyTracks: [],
        downloadedTracks: [],
        downloadedTracksMap: new Map(), // url -> localPath
        pendingDownloads: new Map(),   // url -> progress (0-1)
        sessionHistory: [],            // recently played URLs
        sessionAffinity: { artists: {}, genres: {} },
        currentActiveCoverUrl: null
    };

    // Callback registry for state changes
    const _listeners = new Set();

    return {
        /**
         * Get a piece of state by key.
         */
        get(key) {
            if (!(key in _state)) {
                console.warn(`[State] Key "${key}" does not exist in global state.`);
                return undefined;
            }
            return _state[key];
        },

        /**
         * Set a piece of state and notify subscribers.
         * @param {string} key 
         * @param {any} value 
         */
        set(key, value) {
            if (!(key in _state)) {
                console.warn(`[State] Creating new state key: "${key}"`);
            }
            _state[key] = value;
            this.notify(key, value);
        },

        /**
         * Update an object or map partially.
         */
        update(key, fn) {
            if (typeof fn !== 'function') return;
            const current = _state[key];
            const next = fn(current);
            this.set(key, next !== undefined ? next : current);
        },

        /**
         * Register a callback to be notified of state changes.
         */
        subscribe(callback) {
            if (typeof callback === 'function') {
                _listeners.add(callback);
            }
            return () => _listeners.delete(callback);
        },

        /**
         * Notify all listeners of a change.
         */
        notify(key, value) {
            _listeners.forEach(callback => {
                try {
                    callback(key, value, _state);
                } catch (e) {
                    console.error('[State] Listener error:', e);
                }
            });
        },

        /**
         * Shortcut to check if a track is liked.
         */
        isLiked(trackUrl) {
            return _state.likedTracks.has(trackUrl);
        },

        /**
         * Shortcut to check if a track is downloaded.
         */
        isDownloaded(trackUrl) {
            return _state.downloadedTracksMap.has(trackUrl);
        }
    };
})();

// Attach to window for legacy access during transition
window.State = State;
