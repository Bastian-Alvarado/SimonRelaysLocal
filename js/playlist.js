/**
 * Playlist Module
 * Handles User Playlists, Discover (Daily Mixes), and Community collections.
 */

const Playlist = (function() {
    let config = {
        serverBaseUrl: '',
        selectors: {
            userStrip: 'playlists-strip',
            discoverStrip: 'discover-strip',
            discoverSection: 'discover-section',
            view: 'playlist-view',
            hero: 'playlist-hero',
            trackList: 'playlist-track-list'
        },
        callbacks: {
            onNavigate: null, // (playlist) => { ... }
            onPlay: null,     // (track, list, index) => { ... }
            onDelete: null,   // (id) => { ... }
            onRenamed: null,  // (id, name) => { ... }
            onUpdated: null   // (playlist) => { ... }
        }
    };

    let allPlaylists = [];
    let currentUser = null;

    const CARD_PLAY_BTN_HTML = `<button class="card-play-btn" title="Play">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    </button>`;

    // --- Helpers ---
    function formatHeroDuration(seconds) {
        if (!seconds) return '0 min';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hrs > 0) return `${hrs} hr ${mins} min`;
        return `${mins} min`;
    }

    function getSharedCoverUrl(path, artist, album) {
        // This usually calls a function in renderer or API
        if (typeof window.getSharedCoverUrl === 'function') {
            return window.getSharedCoverUrl(path, artist, album);
        }
        return `https://localhost:3000/api/cover?path=${encodeURIComponent(path)}`;
    }

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

    return {
        init: function(options) {
            config = { 
                ...config, 
                ...options,
                selectors: { ...config.selectors, ...options.selectors },
                callbacks: { ...config.callbacks, ...options.callbacks }
            };
            currentUser = options.currentUser;
        },

        setPlaylists: function(playlists) {
            allPlaylists = playlists;
        },

        getPlaylists: function() {
            return allPlaylists;
        },

        setUser: function(user) {
            currentUser = user;
        },

        fetchUserPlaylists: async function() {
            // Firestore or Local Server
            if (currentUser && window._fbFS) {
                try {
                    const snap = await window._fbFS.collection('playlists')
                        .where('userId', '==', currentUser.uid)
                        .orderBy('createdAt', 'desc')
                        .get();
                    allPlaylists = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    return allPlaylists;
                } catch (e) {
                    console.error('[Playlist] Cloud fetch failed:', e);
                }
            }

            // Fallback to local API
            try {
                allPlaylists = await API.getPlaylists();
                return allPlaylists;
            } catch (e) {
                console.error('[Playlist] Local fetch failed:', e);
                return [];
            }
        },

        renderUserStrip: function() {
            const strip = document.getElementById(config.selectors.userStrip);
            if (!strip) return;

            strip.innerHTML = '';

            // New Playlist Card
            const newCard = document.createElement('div');
            newCard.className = 'new-playlist-card';
            newCard.innerHTML = `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span>New Playlist</span>
            `;
            newCard.onclick = () => {
                if (typeof window.openCreatePlaylistModal === 'function') window.openCreatePlaylistModal();
            };
            strip.appendChild(newCard);

            if (allPlaylists.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'playlists-empty-state';
                empty.innerHTML = `
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.35;">
                        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                    </svg>
                    <div class="playlists-empty-title">No playlists yet</div>
                    <div class="playlists-empty-sub">Click the card to create your first one</div>
                `;
                strip.appendChild(empty);
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

                card.querySelector('.card-play-btn').onclick = (e) => {
                    e.stopPropagation();
                    if (pl.tracks.length > 0 && config.callbacks.onPlay) {
                        config.callbacks.onPlay(pl.tracks[0], pl.tracks, 0);
                    }
                };

                card.onclick = () => {
                    if (config.callbacks.onNavigate) config.callbacks.onNavigate(pl);
                };

                strip.appendChild(card);
            });
        },

        renderDiscoverStrip: async function() {
            const section = document.getElementById(config.selectors.discoverSection);
            const strip = document.getElementById(config.selectors.discoverStrip);
            if (!section || !strip) return;

            try {
                const discoveries = await API.getDiscovery();
                if (!discoveries || discoveries.length === 0) {
                    section.style.display = 'none';
                    return;
                }

                section.style.display = 'block';
                strip.innerHTML = '';

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

                    card.querySelector('.card-play-btn').onclick = (e) => {
                        e.stopPropagation();
                        if (pl.tracks.length > 0 && config.callbacks.onPlay) {
                            config.callbacks.onPlay(pl.tracks[0], pl.tracks, 0);
                        }
                    };

                    card.onclick = () => {
                        if (config.callbacks.onNavigate) config.callbacks.onNavigate(pl);
                    };

                    strip.appendChild(card);
                });
            } catch (e) {
                console.error('[Playlist] Discover fetch failed:', e);
                section.style.display = 'none';
            }
        },

        renderPlaylistView: function(playlist) {
            const hero = document.getElementById(config.selectors.hero);
            const view = document.getElementById(config.selectors.view);
            if (!hero || !view) return;

            const isOwn = currentUser && playlist.userId === currentUser.uid;

            // Update View Background
            let bgUrl = 'none';
            if (playlist.customCover) {
                bgUrl = `url("${playlist.customCover}")`;
            } else {
                const tracks = playlist.tracks || [];
                const firstCover = tracks.find(t => t.metadata && t.metadata.hasCover);
                if (firstCover) {
                    bgUrl = `url("${getSharedCoverUrl(firstCover.relativePath, firstCover.metadata.artist, firstCover.metadata.album)}")`;
                }
            }
            view.style.setProperty('--view-bg-image', bgUrl);

            const tracks = playlist.tracks || [];
            const totalDuration = tracks.reduce((sum, t) => sum + (t.metadata?.duration || 0), 0);
            const durationStr = totalDuration > 0 ? ` · ${formatHeroDuration(Math.round(totalDuration))}` : '';
            const songCountStr = `${tracks.length} track${tracks.length !== 1 ? 's' : ''}`;

            const coverTooltip = isOwn ? 'title="Change Cover"' : '';
            const overlayHtml = isOwn ? `
                <div class="edit-cover-overlay">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                </div>
            ` : '';

            const artHtml = playlist.customCover 
                ? `<img src="${playlist.customCover}" style="width:100%; height:100%; object-fit:cover;">`
                : buildCollageHtml(playlist);

            hero.innerHTML = `
                <div class="playlist-art-interactive album-hero-cover" ${coverTooltip}>
                    ${artHtml}
                    ${overlayHtml}
                    ${!isOwn ? '<div class="community-badge">Community</div>' : ''}
                </div>
                <div class="album-hero-info">
                    <div class="album-hero-label">Playlist</div>
                    ${isOwn ? 
                        `<input class="playlist-title-editable album-hero-title" value="${playlist.name}" spellcheck="false">` :
                        `<div class="album-hero-title">${playlist.name}</div>`
                    }
                    <div class="album-hero-meta">
                        ${(playlist.userPhotoURL || (isOwn && currentUser.photoURL)) ?
                            `<img class="artist-avatar" src="${playlist.userPhotoURL || currentUser.photoURL}" alt="">` :
                            `<img class="artist-avatar" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIwIDIxdi0yYTRgMCAwIDAtNC00SDhhNCg0IDAgMCAwLTQgNHYyIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSI3IiByPSI0Ii8+PC9zdmc+" alt="">`
                        }
                        <strong>${playlist.userName || (isOwn ? (currentUser.displayName || 'You') : 'Shared')}</strong> · ${songCountStr}${durationStr}
                    </div>
                    <div class="album-hero-actions">
                        <button class="icon-button play-btn playlist-play-btn" title="Play All" style="width:56px;height:56px;box-shadow:0 8px 16px rgba(0,0,0,0.4);">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
                        </button>
                        ${isOwn ? `
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

            // Event Listeners
            const artEl = hero.querySelector('.playlist-art-interactive');
            if (isOwn && artEl) {
                artEl.onclick = () => {
                    if (typeof window.triggerPlaylistCoverChange === 'function') window.triggerPlaylistCoverChange(playlist.id);
                };
            }

            const playBtn = hero.querySelector('.playlist-play-btn');
            if (playBtn) {
                playBtn.onclick = () => {
                    if (playlist.tracks.length > 0 && config.callbacks.onPlay) {
                        config.callbacks.onPlay(playlist.tracks[0], playlist.tracks, 0);
                    }
                };
            }

            const deleteBtn = hero.querySelector('.delete-playlist-btn');
            if (deleteBtn) {
                deleteBtn.onclick = () => {
                    if (config.callbacks.onDelete) config.callbacks.onDelete(playlist.id);
                };
            }

            const titleInput = hero.querySelector('.playlist-title-editable');
            if (titleInput) {
                titleInput.onblur = (e) => {
                    const newName = e.target.value.trim();
                    if (newName && newName !== playlist.name && config.callbacks.onRenamed) {
                        config.callbacks.onRenamed(playlist.id, newName);
                    }
                };
                titleInput.onkeydown = (e) => {
                    if (e.key === 'Enter') titleInput.blur();
                };
            }
        }
    };
})();
