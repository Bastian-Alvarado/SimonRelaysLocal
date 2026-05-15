/**
 * SimonRelays API Module
 * Encapsulates all server communication logic.
 */
const API = (() => {
    const DEFAULT_SERVER_URL = 'http://localhost:3000';
    
    // Initialization logic for serverBaseUrl
    const isServedFromServer = (window.location.protocol.startsWith('http')) &&
        (window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.'));
    
    const isSelfHosted = isServedFromServer ||
        (window.location.protocol.startsWith('http') && window.location.port);

    let serverBaseUrl = (localStorage.getItem('serverUrl') || (isSelfHosted ? '' : DEFAULT_SERVER_URL)).replace(/\/+$/, '');

    /**
     * Helper for fetch with base URL
     */
    async function request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${serverBaseUrl}${endpoint}`;
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        return response;
    }

    return {
        getBaseUrl: () => {
            if (!serverBaseUrl && isSelfHosted) {
                return window.location.origin;
            }
            return serverBaseUrl;
        },
        setBaseUrl: (url) => {
            serverBaseUrl = url.replace(/\/+$/, '');
            localStorage.setItem('serverUrl', serverBaseUrl);
        },

        // --- Core Endpoints ---

        async getDiscovery() {
            const res = await request('/api/discovery');
            return res.json();
        },

        async getFirebaseConfig() {
            const res = await request('/api/firebase-config');
            return res.json();
        },

        async search(query) {
            const res = await request(`/api/search?q=${encodeURIComponent(query)}`);
            return res.json();
        },

        async getLyrics(title, artist, album, duration) {
            let url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
            if (album) url += `&album_name=${encodeURIComponent(album)}`;
            if (duration) url += `&duration=${Math.round(duration)}`;
            
            const res = await fetch(url);
            if (!res.ok) return null;
            return res.json();
        },

        async getDeezerMetadata(artistName) {
            const res = await request(`/api/deezer-artist?q=${encodeURIComponent(artistName)}`);
            return res.json();
        },

        async getMusicBrainzData(path) {
            const res = await request(`/api/musicbrainz-proxy?path=${encodeURIComponent(path)}`);
            return res.json();
        },

        getCoverUrl(relativePath, artist, album) {
            if (!relativePath) return null;
            return `${serverBaseUrl}/api/cover?path=${encodeURIComponent(relativePath)}`;
        },

        // --- Playlist Management ---

        async getPlaylists() {
            const res = await request('/api/playlists');
            return res.json();
        },

        async createPlaylist(name) {
            const res = await request('/api/playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            return res.json();
        },

        async deletePlaylist(id) {
            await request(`/api/playlists/${id}`, { method: 'DELETE' });
        },

        async updatePlaylistTracks(id, tracks) {
            const res = await request(`/api/playlists/${id}/tracks`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tracks })
            });
            return res.json();
        },

        // --- Social/Likes ---

        async toggleLike(trackUrl, liked) {
            const res = await request('/api/likes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: trackUrl, liked })
            });
            return res.json();
        },

        async renamePlaylist(id, name) {
            const res = await request(`/api/playlists/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            return res.json();
        },
        
        async triggerTranscoder() {
            const res = await request('/api/trigger-transcoder', { method: 'POST' });
            return res.json();
        }
    };
})();

// Export globally for non-module usage (Phase 1)
window.API = API;
