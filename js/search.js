/**
 * SimonRelays Search Module
 * Handles local library filtering and search UI.
 */
const Search = (() => {
    let searchDebounceTimer = null;

    return {
        init() {
            const searchInput = document.getElementById('search-input');
            const mobileSearchInput = document.getElementById('mobile-search-input');
            const clearSearchHistoryBtn = document.getElementById('clear-search-history-btn');

            if (searchInput) {
                searchInput.addEventListener('input', (e) => this.handleSearchInput(e));
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this.handleSearchInput(e);
                });
            }
            if (mobileSearchInput) {
                mobileSearchInput.addEventListener('input', (e) => this.handleSearchInput(e));
                mobileSearchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this.handleSearchInput(e);
                });
            }

            if (clearSearchHistoryBtn) {
                clearSearchHistoryBtn.addEventListener('click', () => {
                    localStorage.removeItem('searchHistory');
                    this.renderSearchHistory();
                });
            }

            this.renderSearchHistory();
        },

        handleSearchInput(e) {
            const searchInput = document.getElementById('search-input');
            const mobileSearchInput = document.getElementById('mobile-search-input');
            const query = e.target.value.toLowerCase().trim();

            // Sync both inputs
            if (searchInput) searchInput.value = e.target.value;
            if (mobileSearchInput) mobileSearchInput.value = e.target.value;

            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

            if (e.key === 'Enter' && query) {
                this.saveSearchQuery(query);
                this.renderSearchHistory();
            }

            if (!query) {
                this.renderSearchResults('');
                this.renderSearchHistory();
                return;
            }

            searchDebounceTimer = setTimeout(() => {
                // Only switch to search view if there's an actual query
                if (query.length > 0 && window.switchToSearchView) {
                    window.switchToSearchView();
                }
                this.renderSearchResults(query);
            }, 500);
        },

        saveSearchQuery(query) {
            if (!query) return;
            try {
                let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
                history = history.filter(q => q.toLowerCase() !== query.toLowerCase());
                history.unshift(query);
                localStorage.setItem('searchHistory', JSON.stringify(history.slice(0, 15)));
            } catch (e) { }
        },

        renderSearchHistory() {
            const searchHistorySection = document.getElementById('search-history-section');
            const searchHistoryList = document.getElementById('search-history-list');
            const searchInput = document.getElementById('search-input');
            const mobileSearchInput = document.getElementById('mobile-search-input');

            if (!searchHistorySection || !searchHistoryList) return;

            const query = (searchInput ? searchInput.value : '') || (mobileSearchInput ? mobileSearchInput.value : '');
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
                    if (window.switchToSearchView) window.switchToSearchView();
                    this.renderSearchResults(queryText);
                });
                searchHistoryList.appendChild(pill);
            });
        },

        async renderSearchResults(query) {
            const searchEmptyState = document.getElementById('search-empty-state');
            const albumsData = window.albumsData || {};
            const allPlaylists = window.allPlaylists || [];
            const allTracks = window.allTracks || [];

            // Collect unique artists
            const seenArtists = new Set();
            Object.values(albumsData).forEach(album => {
                if (album.artist && album.artist !== 'Unknown Artist') {
                    if (window.splitArtists) {
                        window.splitArtists(album.artist).forEach(a => seenArtists.add(a));
                    } else {
                        seenArtists.add(album.artist);
                    }
                }
            });
            const matchingArtists = Array.from(seenArtists).filter(a => a.toLowerCase().includes(query));

            // Filter local/own playlists + Discovery playlists
            const discoveryPlaylists = (typeof Playlist !== 'undefined') ? Playlist.getDiscoveryPlaylists() : [];
            
            const combinedPlaylists = [
                ...allPlaylists.map(p => ({ ...p, source: 'personal' })),
                ...discoveryPlaylists.map(p => ({ ...p, source: 'discovery' }))
            ];

            const matchingPlaylists = combinedPlaylists.filter(p => p.name.toLowerCase().includes(query));

            // Filter tracks
            const matchingTracks = allTracks.filter(track => {
                const title = ((track.metadata && track.metadata.title) || track.filename).toLowerCase();
                const artist = ((track.metadata && track.metadata.artist) || '').toLowerCase();
                const album = ((track.metadata && track.metadata.album) || '').toLowerCase();
                return title.includes(query) || artist.includes(query) || album.includes(query) || track.filename.toLowerCase().includes(query);
            });

            this.renderSearchArtists(matchingArtists.slice(0, 5));
            this.renderSearchPlaylists(matchingPlaylists.slice(0, 10));
            this.renderSearchTracks(matchingTracks.slice(0, 20));

            const hasResults = matchingArtists.length > 0 || matchingPlaylists.length > 0 || matchingTracks.length > 0;
            if (searchEmptyState) searchEmptyState.classList.toggle('hidden', hasResults);

            // Global Cloud Search
            if (window._fbFS && query.length >= 2) {
                const lowerQuery = query.toLowerCase();
                try {
                    const snapshot = await window._fbFS.collection('playlists')
                        .where('name_lowercase', '>=', lowerQuery)
                        .where('name_lowercase', '<=', lowerQuery + '\uf8ff')
                        .limit(15)
                        .get();

                    const globalPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    const ownIds = new Set(allPlaylists.map(p => p.id));
                    const uniqueGlobal = globalPlaylists.filter(p => !ownIds.has(p.id));

                    if (uniqueGlobal.length > 0) {
                        this.appendGlobalSearchPlaylists(uniqueGlobal);
                        if (searchEmptyState) searchEmptyState.classList.add('hidden');
                    }
                } catch (err) {
                    console.error('[Search] Global search failed:', err);
                }
            }
        },

        renderSearchArtists(artists) {
            const searchArtistsSection = document.getElementById('search-artists-section');
            const searchArtistList = document.getElementById('search-artist-list');
            const searchInput = document.getElementById('search-input');

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
                Theme.applyArtistVisuals(artistName, row.querySelector('.search-row-avatar'), false);
                row.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    if (window.switchToHomeView) window.switchToHomeView();
                    if (window.openArtistView) window.openArtistView(artistName);
                });
                searchArtistList.appendChild(row);
            });
        },

        renderSearchPlaylists(playlists) {
            const searchPlaylistsSection = document.getElementById('search-playlists-section');
            const searchPlaylistList = document.getElementById('search-playlist-list');
            const searchInput = document.getElementById('search-input');

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
                    if (coverTrack && window.getSharedCoverUrl) {
                        coverHtml = `<img src="${window.getSharedCoverUrl(coverTrack.relativePath, coverTrack.metadata.artist, coverTrack.metadata.album)}" class="search-row-cover-img" alt="">`;
                    } else {
                        coverHtml = `<div class="search-row-cover-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg></div>`;
                    }
                }

                const typeLabel = pl.source === 'discovery' ? 'Discover' : 'Playlist';
                row.innerHTML = `
                    <div class="search-row-cover">${coverHtml}</div>
                    <div class="search-row-info">
                        <div class="search-row-name">${pl.name}</div>
                        <div class="search-row-type">${typeLabel} &middot; ${pl.tracks ? pl.tracks.length : 0} track${(pl.tracks && pl.tracks.length !== 1) ? 's' : ''}</div>
                    </div>
                    <svg class="search-row-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                `;
                row.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    if (window.switchToHomeView) window.switchToHomeView();
                    if (window.openPlaylistView) window.openPlaylistView(pl);
                });
                searchPlaylistList.appendChild(row);
            });
        },

        renderSearchTracks(tracks) {
            const searchTracksSection = document.getElementById('search-tracks-section');
            const searchTrackList = document.getElementById('search-track-list');
            if (!searchTracksSection || !searchTrackList) return;
            if (tracks.length === 0) { searchTracksSection.classList.add('hidden'); return; }
            searchTracksSection.classList.remove('hidden');
            if (window.renderTrackList) window.renderTrackList(tracks, searchTrackList);
        },

        appendGlobalSearchPlaylists(playlists) {
            const searchPlaylistList = document.getElementById('search-playlist-list');
            const searchPlaylistsSection = document.getElementById('search-playlists-section');
            const searchInput = document.getElementById('search-input');

            if (!searchPlaylistList || !searchPlaylistsSection) return;

            const existingGlobals = searchPlaylistList.querySelectorAll('[data-global="true"]');
            existingGlobals.forEach(el => el.remove());

            searchPlaylistsSection.classList.remove('hidden');

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
                row.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    if (window.switchToHomeView) window.switchToHomeView();
                    if (window.openPlaylistView) window.openPlaylistView(pl);
                });
                searchPlaylistList.appendChild(row);
            });
        }
    };
})();

window.Search = Search;
