/**
 * Metadata Module
 * Handles song/album information editing, genre management, and metadata health checks.
 */

const Metadata = (function() {
    let config = {
        serverBaseUrl: '',
        selectors: {
            modal: 'edit-metadata-modal',
            title: 'metadata-modal-title',
            fields: {
                title: 'metadata-title-input',
                artist: 'metadata-artist-input',
                album: 'metadata-album-input',
                year: 'metadata-year-input',
                genre: 'metadata-genre-input'
            },
            dropdown: 'metadata-genre-dropdown',
            art: {
                preview: 'metadata-art-preview',
                input: 'metadata-art-input',
                dropzone: 'metadata-art-dropzone'
            },
            buttons: {
                save: 'metadata-save-btn',
                cancel: 'metadata-cancel-btn',
                restore: 'metadata-restore-btn'
            },
            healthCheck: {
                modal: 'check-metadata-modal',
                start: 'check-metadata-start-btn',
                cancel: 'check-metadata-cancel-btn',
                status: 'check-progress-status',
                container: 'check-progress-container',
                percent: 'check-progress-percent',
                bar: 'check-progress-bar'
            }
        },
        callbacks: {
            onLibraryRefresh: null, // async () => { ... }
            getSharedCoverUrl: null  // (path, artist, album) => url
        }
    };

    // State
    let currentTrack = null;
    let currentAlbum = null;
    let isAlbumMode = false;
    let newCoverArtBase64 = null;

    // --- Private Helpers ---

    function getEl(id) { return document.getElementById(id); }

    function closeEditors() {
        const modal = getEl(config.selectors.modal);
        if (modal) modal.classList.add('hidden');
        const dropdown = getEl(config.selectors.dropdown);
        if (dropdown) dropdown.style.display = 'none';
        
        const healthModal = getEl(config.selectors.healthCheck.modal);
        if (healthModal) healthModal.classList.add('hidden');
    }

    async function handleSave() {
        const saveBtn = getEl(config.selectors.buttons.save);
        if (!saveBtn) return;

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            if (isAlbumMode) {
                if (!currentAlbum) return;
                await saveAlbumMetadata();
            } else {
                if (!currentTrack) return;
                await saveTrackMetadata();
            }

            closeEditors();
            if (config.callbacks.onLibraryRefresh) {
                await config.callbacks.onLibraryRefresh();
            }
        } catch (e) {
            console.error('[Metadata] Save failed:', e);
            alert('Save failed: ' + e.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }

    async function saveAlbumMetadata() {
        const artist = getEl(config.selectors.fields.artist).value.trim();
        const album = getEl(config.selectors.fields.album).value.trim();

        const res = await fetch(`${config.serverBaseUrl}/api/update-album-metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tracks: currentAlbum.tracks.map(t => ({ relativePath: t.relativePath, isLocal: !!t.isLocal })),
                metadata: { artist, album },
                coverArt: newCoverArtBase64
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Unknown error');
        }
    }

    async function saveTrackMetadata() {
        const genreInput = getEl(config.selectors.fields.genre);
        const payload = {
            relativePath: currentTrack.relativePath,
            isLocal: !!currentTrack.isLocal,
            metadata: {
                title: getEl(config.selectors.fields.title).value.trim(),
                artist: getEl(config.selectors.fields.artist).value.trim(),
                album: getEl(config.selectors.fields.album).value.trim(),
                year: getEl(config.selectors.fields.year).value,
                genre: genreInput.value.trim().split(',').map(s => 
                    s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
                ).filter(Boolean).join(', ')
            },
            coverArt: null
        };

        const res = await fetch(`${config.serverBaseUrl}/api/update-metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Unknown error');
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

    async function runHealthCheck() {
        if (!currentAlbum) return;

        const startBtn = getEl(config.selectors.healthCheck.start);
        const statusEl = getEl(config.selectors.healthCheck.status);
        const container = getEl(config.selectors.healthCheck.container);
        const percentEl = getEl(config.selectors.healthCheck.percent);
        const barEl = getEl(config.selectors.healthCheck.bar);

        const checkCover = document.getElementById('check-cover-art')?.checked;
        const checkArtists = document.getElementById('check-artists')?.checked;
        const checkNames = document.getElementById('check-song-names')?.checked;
        const checkGenres = document.getElementById('check-genres')?.checked;

        if (!checkCover && !checkArtists && !checkNames && !checkGenres) {
            alert("Please select at least one category to check.");
            return;
        }

        startBtn.disabled = true;
        startBtn.textContent = "Running...";
        if (container) container.classList.remove('hidden');

        try {
            // 1. Pre-fetch Album-Level Genres
            let albumLevelGenres = [];
            if (checkGenres) {
                statusEl.textContent = "Harvesting Album Genres...";
                try {
                    const mbAlbPath = `release-group?query=releasegroup:"${encodeURIComponent(currentAlbum.name)}" AND artist:"${encodeURIComponent(currentAlbum.artist)}"&fmt=json`;
                    const mbAlbRes = await fetch(`${config.serverBaseUrl}/api/musicbrainz-proxy?path=${encodeURIComponent(mbAlbPath)}`);
                    const mbAlbData = await mbAlbRes.json();

                    if (mbAlbData['release-groups'] && mbAlbData['release-groups'].length > 0) {
                        const releaseGroupId = mbAlbData['release-groups'][0].id;
                        const mbDetailRes = await fetch(`${config.serverBaseUrl}/api/musicbrainz-proxy?path=${encodeURIComponent(`release-group/${releaseGroupId}?inc=genres+tags&fmt=json`)}`);
                        const mbDetailData = await mbDetailRes.json();
                        if (mbDetailData.genres) albumLevelGenres.push(...mbDetailData.genres.map(g => g.name));
                        if (mbDetailData.tags) albumLevelGenres.push(...mbDetailData.tags.map(t => t.name));
                    }

                    const lfmAlbRes = await fetch(`${config.serverBaseUrl}/api/lastfm-proxy?method=album.getInfo&artist=${encodeURIComponent(currentAlbum.artist)}&album=${encodeURIComponent(currentAlbum.name)}`);
                    const lfmAlbData = await lfmAlbRes.json();
                    if (lfmAlbData.album && lfmAlbData.album.toptags && lfmAlbData.album.toptags.tag) {
                        const tags = Array.isArray(lfmAlbData.album.toptags.tag) ? lfmAlbData.album.toptags.tag : [lfmAlbData.album.toptags.tag];
                        albumLevelGenres.push(...tags.slice(0, 5).map(t => t.name));
                    }
                } catch (e) { console.warn("Album genre harvest failed", e); }
                albumLevelGenres = [...new Set(albumLevelGenres)];
            }

            // 2. Search Deezer
            let deezerTracks = [];
            let deezerCoverUrl = null;
            try {
                statusEl.textContent = "Searching Deezer...";
                const searchRes = await fetch(`${config.serverBaseUrl}/api/deezer-search?type=album&q=${encodeURIComponent(currentAlbum.artist + ' ' + currentAlbum.name)}`);
                const searchData = await searchRes.json();
                if (searchData.data && searchData.data.length > 0) {
                    const deezerAlbum = searchData.data[0];
                    deezerCoverUrl = deezerAlbum.cover_xl || deezerAlbum.cover_big;
                    const tracksRes = await fetch(`${config.serverBaseUrl}/api/deezer-proxy?path=album/${deezerAlbum.id}`);
                    const albumData = await tracksRes.json();
                    deezerTracks = albumData.tracks.data || [];
                }
            } catch (e) { console.warn("Deezer lookup failed", e); }

            let corrections = [];
            const total = currentAlbum.tracks.length;

            for (let i = 0; i < total; i++) {
                const local = currentAlbum.tracks[i];
                const localTitle = (local.metadata && local.metadata.title) ? local.metadata.title : local.filename;
                const localArtist = (local.metadata && local.metadata.artist) ? local.metadata.artist : currentAlbum.artist;

                statusEl.textContent = `Checking ${i + 1}/${total}: ${localTitle}`;
                
                // Update Progress Bar
                const progress = Math.round(((i + 1) / total) * 100);
                if (percentEl) percentEl.textContent = `${progress}%`;
                if (barEl) barEl.style.width = `${progress}%`;
                
                const match = deezerTracks.find(dt => fuzzyMatch(dt.title, localTitle));
                const update = { relativePath: local.relativePath, isLocal: !!local.isLocal, metadata: {} };
                let changed = false;

                if (match) {
                    if (checkNames && match.title && match.title !== localTitle) {
                        update.metadata.title = match.title;
                        changed = true;
                    }
                    if (checkArtists) {
                        const dzArtist = match.artist?.name || '';
                        if (dzArtist && dzArtist !== localArtist) {
                            update.metadata.artist = dzArtist;
                            changed = true;
                        }
                    }
                    if (checkCover && deezerCoverUrl) {
                        try {
                            const imgRes = await fetch(deezerCoverUrl);
                            const blob = await imgRes.blob();
                            update.coverArt = await new Promise(resolve => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result);
                                reader.readAsDataURL(blob);
                            });
                            changed = true;
                        } catch (e) { console.warn("Cover fetch failed", e); }
                    }
                }

                if (checkGenres) {
                    let trackTags = [];
                    try {
                        const mbPath = `recording?query=recording:"${encodeURIComponent(localTitle)}" AND artist:"${encodeURIComponent(localArtist)}"&fmt=json`;
                        const mbRes = await fetch(`${config.serverBaseUrl}/api/musicbrainz-proxy?path=${encodeURIComponent(mbPath)}`);
                        const mbData = await mbRes.json();
                        if (mbData.recordings && mbData.recordings.length > 0) {
                            const recId = mbData.recordings[0].id;
                            const detailRes = await fetch(`${config.serverBaseUrl}/api/musicbrainz-proxy?path=${encodeURIComponent(`recording/${recId}?inc=genres+tags&fmt=json`)}`);
                            const detailData = await detailRes.json();
                            if (detailData.genres) trackTags.push(...detailData.genres.map(g => g.name));
                            if (detailData.tags) trackTags.push(...detailData.tags.map(t => t.name));
                        }
                    } catch (e) { console.warn("Track genre harvest failed", e); }

                    let finalGenres = trackTags.length > 0 ? trackTags : albumLevelGenres;
                    if (finalGenres.length > 0) {
                        const blacklist = ['reissue', 'remaster', 'remastered', 'deluxe', 'bonus', 'edition', 'limited', 'lp', 'cd', 'vinyl'];
                        const filtered = finalGenres.filter(g => !blacklist.some(b => g.toLowerCase().includes(b)));
                        const genreStr = [...new Set(filtered)].slice(0, 5).join(', ');
                        const localGenre = (local.metadata && local.metadata.genre) ? (Array.isArray(local.metadata.genre) ? local.metadata.genre.join(', ') : local.metadata.genre) : '';
                        if (genreStr && genreStr !== localGenre) {
                            update.metadata.genre = genreStr;
                            changed = true;
                        }
                    }
                }

                if (changed) corrections.push(update);
            }

            if (corrections.length > 0) {
                statusEl.textContent = `Applying ${corrections.length} corrections...`;
                for (let i = 0; i < corrections.length; i++) {
                    const corr = corrections[i];
                    
                    // Update Progress Bar
                    const progress = Math.round(((i + 1) / corrections.length) * 100);
                    if (percentEl) percentEl.textContent = `${progress}%`;
                    if (barEl) barEl.style.width = `${progress}%`;

                    await fetch(`${config.serverBaseUrl}/api/update-metadata`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(corr)
                    });
                }
                statusEl.textContent = "Done! Refreshing library...";
                if (config.callbacks.onLibraryRefresh) await config.callbacks.onLibraryRefresh();
                if (config.callbacks.onAlbumRefresh && currentAlbum) await config.callbacks.onAlbumRefresh(currentAlbum.name);
                alert(`Health Check Complete! Applied ${corrections.length} corrections.`);
            } else {
                alert("Health Check Complete! Everything looks good.");
            }
            closeEditors();
        } catch (e) {
            console.error('[Metadata] Health check failed:', e);
            alert('Health check failed: ' + e.message);
        } finally {
            startBtn.disabled = false;
            startBtn.textContent = "Start Health Check";
        }
    }

    // --- Public API ---

    return {
        init: function(options) {
            config = { 
                ...config, 
                ...options,
                selectors: { 
                    ...config.selectors, 
                    ...options.selectors,
                    fields: { ...config.selectors.fields, ...(options.selectors?.fields || {}) },
                    art: { ...config.selectors.art, ...(options.selectors?.art || {}) },
                    buttons: { ...config.selectors.buttons, ...(options.selectors?.buttons || {}) },
                    healthCheck: { ...config.selectors.healthCheck, ...(options.selectors?.healthCheck || {}) }
                },
                callbacks: { ...config.callbacks, ...options.callbacks }
            };

            this.setupEventListeners();
        },

        setupEventListeners: function() {
            const cancelBtn = getEl(config.selectors.buttons.cancel);
            if (cancelBtn) cancelBtn.addEventListener('click', closeEditors);

            const saveBtn = getEl(config.selectors.buttons.save);
            if (saveBtn) saveBtn.addEventListener('click', handleSave);

            const artDropzone = getEl(config.selectors.art.dropzone);
            const artInput = getEl(config.selectors.art.input);
            if (artDropzone && artInput) {
                artDropzone.addEventListener('click', () => artInput.click());
                artInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        newCoverArtBase64 = event.target.result;
                        const preview = getEl(config.selectors.art.preview);
                        if (preview) {
                            preview.src = newCoverArtBase64;
                            preview.style.display = 'block';
                        }
                    };
                    reader.readAsDataURL(file);
                });
            }

            const restoreBtn = getEl(config.selectors.buttons.restore);
            if (restoreBtn) {
                restoreBtn.addEventListener('click', async () => {
                    if (!currentTrack || !confirm('Restore this track to its original metadata?')) return;
                    try {
                        const res = await fetch(`${config.serverBaseUrl}/api/restore-metadata`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ relativePath: currentTrack.relativePath, isLocal: !!currentTrack.isLocal })
                        });
                        if (res.ok) {
                            closeEditors();
                            if (config.callbacks.onLibraryRefresh) await config.callbacks.onLibraryRefresh();
                            alert('Track restored successfully!');
                        } else {
                            alert('Restore failed.');
                        }
                    } catch (e) {
                        alert('Error: ' + e.message);
                    }
                });
            }

            const genreInput = getEl(config.selectors.fields.genre);
            const dropdown = getEl(config.selectors.dropdown);
            if (genreInput && dropdown) {
                genreInput.addEventListener('focus', () => this.renderGenreDropdown(''));
                genreInput.addEventListener('input', () => this.renderGenreDropdown(genreInput.value));
                genreInput.addEventListener('blur', () => {
                    setTimeout(() => { dropdown.style.display = 'none'; }, 200);
                });
            }

            const checkStartBtn = getEl(config.selectors.healthCheck.start);
            if (checkStartBtn) checkStartBtn.addEventListener('click', runHealthCheck);
            
            const checkCancelBtn = getEl(config.selectors.healthCheck.cancel);
            if (checkCancelBtn) checkCancelBtn.addEventListener('click', closeEditors);
        },

        openSongEditor: function(track) {
            isAlbumMode = false;
            currentTrack = track;
            newCoverArtBase64 = null;

            const modal = getEl(config.selectors.modal);
            if (modal) {
                UI.renderEditMetadataModal(modal, track);
                // After rendering, we MUST re-setup listeners for the new buttons/inputs
                this.setupEventListeners();
            }

            getEl(config.selectors.title).textContent = "Edit Song Information";
            
            // Toggle visibility
            const titleGroup = getEl(config.selectors.fields.title).closest('.input-group');
            const yearGroup = getEl(config.selectors.fields.year).closest('.input-group');
            const genreGroup = getEl(config.selectors.fields.genre).closest('.input-group');
            const dropzoneGroup = getEl(config.selectors.art.dropzone).closest('.metadata-editor-left');

            if (titleGroup) titleGroup.style.display = 'flex';
            if (yearGroup) yearGroup.style.display = 'flex';
            if (genreGroup) genreGroup.style.display = 'flex';
            if (dropzoneGroup) dropzoneGroup.style.display = 'flex'; // Song mode still needs art sometimes or we hide it?
            
            const restoreBtn = getEl(config.selectors.buttons.restore);
            if (restoreBtn) {
                restoreBtn.style.display = 'block';
                if (track.hasBackup) restoreBtn.classList.remove('hidden');
                else restoreBtn.classList.add('hidden');
            }

            getEl(config.selectors.modal).classList.remove('hidden');
        },

        openAlbumEditor: function(albumInfo) {
            isAlbumMode = true;
            currentAlbum = albumInfo;
            newCoverArtBase64 = null;

            const modal = getEl(config.selectors.modal);
            if (modal) {
                // We use a dummy track object for the template
                UI.renderEditMetadataModal(modal, { metadata: { artist: albumInfo.artist, album: albumInfo.name } });
                this.setupEventListeners();
            }

            getEl(config.selectors.title).textContent = "Edit Album Information";

            // Toggle visibility
            const titleGroup = getEl(config.selectors.fields.title).closest('.input-group');
            const yearGroup = getEl(config.selectors.fields.year).closest('.input-group');
            const genreGroup = getEl(config.selectors.fields.genre).closest('.input-group');
            const dropzoneGroup = getEl(config.selectors.art.dropzone).closest('.metadata-editor-left');

            if (titleGroup) titleGroup.style.display = 'none';
            if (yearGroup) yearGroup.style.display = 'none';
            if (genreGroup) genreGroup.style.display = 'none';
            if (dropzoneGroup) dropzoneGroup.style.display = 'flex';
            
            const restoreBtn = getEl(config.selectors.buttons.restore);
            if (restoreBtn) restoreBtn.style.display = 'none';

            // Show current album cover
            const preview = getEl(config.selectors.art.preview);
            if (preview) {
                if (albumInfo.coverTrackPath && config.callbacks.getSharedCoverUrl) {
                    preview.src = config.callbacks.getSharedCoverUrl(albumInfo.coverTrackPath, albumInfo.artist, albumInfo.name);
                    preview.style.display = 'block';
                } else {
                    preview.src = '';
                    preview.style.display = 'none';
                }
            }

            getEl(config.selectors.modal).classList.remove('hidden');
        },

        openHealthCheck: function(albumInfo) {
            currentAlbum = albumInfo;
            const modal = getEl(config.selectors.healthCheck.modal);
            const container = getEl(config.selectors.healthCheck.container);
            if (modal) modal.classList.remove('hidden');
            if (container) container.classList.add('hidden');
        },

        renderGenreDropdown: function(filter) {
            const dropdown = getEl(config.selectors.dropdown);
            if (!dropdown) return;

            const genres = ["Lo-Fi", "Hip Hop", "Chill", "Electronic", "Jazz", "Ambient", "Pop", "Rock", "R&B", "Soul"];
            const filtered = genres.filter(g => g.toLowerCase().includes(filter.toLowerCase()));

            if (filtered.length === 0) {
                dropdown.style.display = 'none';
                return;
            }

            dropdown.innerHTML = '';
            filtered.forEach(g => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.textContent = g;
                item.onclick = () => {
                    const input = getEl(config.selectors.fields.genre);
                    input.value = g;
                    dropdown.style.display = 'none';
                };
                dropdown.appendChild(item);
            });

            dropdown.style.display = 'block';
        }
    };
})();

window.Metadata = Metadata;
