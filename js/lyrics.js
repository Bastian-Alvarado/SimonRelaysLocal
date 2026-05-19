/**
 * Lyrics Module
 * Handles fetching, parsing, rendering, and interactive synchronization of lyrics.
 */

const Lyrics = (function () {
    // --- State ---
    let lyricsData = [];
    let currentLyricIndex = -1;
    let plainLyricsCache = '';

    let currentLyricsTitle = '';
    let currentLyricsArtist = '';
    let currentLyricsAlbum = '';
    let currentLyricsDuration = 0;
    let lyricsTrackUrl = '';

    // Sync Session State
    let syncLines = [];
    let syncTimestamps = [];
    let syncCurrentLineIdx = 0;
    let syncKeyHandler = null;

    // DOM References (assigned in init)
    let container = null;
    let immersiveView = null;
    let actionBar = null;

    // Callbacks
    let callbacks = {};

    return {
        init: function (config) {
            container = config.container;
            immersiveView = config.immersiveView;
            actionBar = config.actionBar;
            callbacks = config.callbacks || {};

            console.log('[Lyrics] Module initialized');
        },

        get lyricsData() { return lyricsData; },
        get currentLyricIndex() { return currentLyricIndex; },

        fetch: async function (track) {
            if (!container) return;

            const title = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
            const artist = (track.metadata && track.metadata.artist) ? track.metadata.artist : 'Unknown Artist';
            const album = track.metadata?.album || '';
            const duration = track.metadata?.duration || 0;
            const cachedLyrics = track._cachedLyrics || null;

            lyricsTrackUrl = track.relativePath || '';

            // UI Reset
            container.classList.remove('editor-mode');
            container.innerHTML = '<div class="lyrics-placeholder" style="color:rgba(255,255,255,0.7);">Loading lyrics...</div>';

            lyricsData = [];
            currentLyricIndex = -1;
            plainLyricsCache = '';

            currentLyricsTitle = title;
            currentLyricsArtist = artist;
            currentLyricsAlbum = album;
            currentLyricsDuration = duration;

            this.renderActionBar(false, false);

            try {
                // 1. Try Cached / Passed lyrics
                if (cachedLyrics) {
                    if (cachedLyrics.syncedLyrics) {
                        lyricsData = this.parseLrc(cachedLyrics.syncedLyrics);
                        this.render();
                        this.renderActionBar(true, false);
                        return;
                    } else {
                        plainLyricsCache = cachedLyrics.plainLyrics || '';
                        this.showNoSyncState();
                        return;
                    }
                }

                // 2. Try LocalStorage (User Synced)
                const saved = localStorage.getItem(`lrc_${lyricsTrackUrl}`);
                if (saved) {
                    lyricsData = this.parseLrc(saved);
                    this.render();
                    this.renderActionBar(true, true);
                    return;
                }

                // 3. Fetch from API
                const data = await API.getLyrics(title, artist, album, duration);
                if (data && !data.error) {
                    if (data.syncedLyrics) {
                        lyricsData = this.parseLrc(data.syncedLyrics);
                        this.render();
                        this.renderActionBar(true, false);
                    } else {
                        plainLyricsCache = data.plainLyrics || '';
                        this.showNoSyncState();
                    }
                } else {
                    this.showNoSyncState();
                }
            } catch (err) {
                console.error('[Lyrics] Fetch error:', err);
                this.showNoSyncState();
            }
        },

        render: function () {
            if (!container) return;
            container.innerHTML = '';

            lyricsData.forEach((line, index) => {
                const imEl = document.createElement('div');
                imEl.className = 'lyric-line';
                imEl.textContent = line.text;

                imEl.addEventListener('click', () => {
                    if (window.Playback) window.Playback.seek(line.time);
                });

                line.immersiveElement = imEl;
                container.appendChild(imEl);
            });
        },

        sync: function () {
            if (!lyricsData.length || !window.Playback || !window.Playback.currentTrack) return;

            const currentTime = window.Playback.currentTime;
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
                            const containerHalfHeight = container.clientHeight / 2;
                            const offsetTop = line.immersiveElement.offsetTop;
                            const itemHalfHeight = line.immersiveElement.clientHeight / 2;
                            container.scrollTo({
                                top: Math.max(0, offsetTop - containerHalfHeight + itemHalfHeight),
                                behavior: 'smooth'
                            });
                        }
                    } else {
                        if (line.immersiveElement) line.immersiveElement.className = 'lyric-line';
                    }
                });
            }
        },

        showNoSyncState: function () {
            if (!container) return;
            container.classList.add('editor-mode');
            container.innerHTML = `
                <div class="lyrics-no-sync">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;">
                        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                    </svg>
                    <div class="lyrics-no-sync-title">No synced lyrics found</div>
                    <div class="lyrics-no-sync-sub">${plainLyricsCache ? 'Plain lyrics were found online — sync them to the music.' : 'No lyrics found. Paste them below and tap to sync.'}</div>
                    <button id="create-lyrics-btn" class="lyrics-create-btn">${plainLyricsCache ? '♩ Sync lyrics' : '♩ Create synced lyrics'}</button>
                </div>
            `;
            const btn = document.getElementById('create-lyrics-btn');
            if (btn) btn.addEventListener('click', () => this.showEditor(plainLyricsCache));
            this.renderActionBar(false, false);
        },

        renderActionBar: function (hasLyrics = false, isCustom = false) {
            if (!actionBar) return;
            actionBar.innerHTML = '';
            if (!lyricsTrackUrl) return;

            if (!hasLyrics) return;

            const editBtn = document.createElement('button');
            editBtn.className = 'lyrics-action-btn';
            editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Re-sync`;
            editBtn.addEventListener('click', () => {
                const plainText = lyricsData.map(l => l.text).join('\n');
                this.showEditor(plainText);
            });
            actionBar.appendChild(editBtn);

            if (isCustom) {
                const sep = document.createElement('span');
                sep.className = 'lyrics-action-sep';
                actionBar.appendChild(sep);

                const delBtn = document.createElement('button');
                delBtn.className = 'lyrics-action-btn lyrics-action-danger';
                delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg> Delete custom`;
                delBtn.addEventListener('click', () => {
                    if (confirm('Delete your custom synced lyrics for this track?')) {
                        localStorage.removeItem(`lrc_${lyricsTrackUrl}`);
                        // Re-fetch (track is not available here, but we have metadata)
                        this.fetch({
                            metadata: {
                                title: currentLyricsTitle,
                                artist: currentLyricsArtist,
                                album: currentLyricsAlbum,
                                duration: currentLyricsDuration
                            },
                            relativePath: lyricsTrackUrl
                        });
                    }
                });
                actionBar.appendChild(delBtn);
            }
        },

        showEditor: function (initialText = '') {
            if (!container) return;
            container.classList.add('editor-mode');
            container.innerHTML = `
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
                if (lyricsData.length > 0) {
                    container.classList.remove('editor-mode');
                    this.render();
                } else {
                    this.showNoSyncState();
                }
            });

            document.getElementById('lyrics-start-sync-btn').addEventListener('click', () => {
                const raw = document.getElementById('lyrics-textarea').value.trim();
                if (!raw) return;
                const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length === 0) return;
                this.startSyncSession(lines);
            });
        },

        startSyncSession: function (lines) {
            syncLines = lines;
            syncTimestamps = [];
            syncCurrentLineIdx = 0;

            if (window.Playback) {
                window.Playback.seek(0);
                window.Playback.resume();
            }

            container.classList.add('editor-mode');
            this.renderSyncSessionUI();

            if (syncKeyHandler) document.removeEventListener('keydown', syncKeyHandler);
            syncKeyHandler = (e) => {
                if (!immersiveView.classList.contains('active')) return;
                if (e.code === 'Space' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
                    e.preventDefault();
                    this.tapSync();
                }
            };
            document.addEventListener('keydown', syncKeyHandler);
        },

        renderSyncSessionUI: function () {
            const done = syncCurrentLineIdx;
            const total = syncLines.length;
            const current = syncLines[done] || null;
            const next = syncLines[done + 1] || null;
            const progressPct = total > 0 ? (done / total) * 100 : 0;

            container.innerHTML = `
                <div class="sync-session">
                    <div class="sync-progress-wrap">
                        <div class="sync-progress-fill" style="width:${progressPct}%"></div>
                    </div>
                    <div class="sync-progress-text">Line <strong>${Math.min(done + 1, total)}</strong> of <strong>${total}</strong></div>
                    <div class="sync-stage">
                        ${current ? `<div class="sync-current-line">${current}</div>
                               <div class="sync-next-line">${next ? 'Next: ' + next : '— last line —'}</div>`
                    : `<div class="sync-current-line" style="color:var(--accent);">All lines synced!</div>`}
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

            document.getElementById('sync-tap-btn').addEventListener('click', () => this.tapSync());
            document.getElementById('sync-undo-btn').addEventListener('click', () => {
                if (syncCurrentLineIdx === 0) return;
                syncCurrentLineIdx--;
                syncTimestamps.pop();
                const prevTime = syncTimestamps.length > 0 ? Math.max(0, syncTimestamps[syncTimestamps.length - 1] - 0.5) : 0;
                if (window.Playback) window.Playback.seek(prevTime);
                this.renderSyncSessionUI();
            });
            document.getElementById('sync-done-btn').addEventListener('click', () => this.finishSyncSession());
            document.getElementById('sync-cancel-btn').addEventListener('click', () => {
                this.exitSyncSession();
                if (lyricsData.length > 0) {
                    container.classList.remove('editor-mode');
                    this.render();
                } else {
                    this.showNoSyncState();
                }
            });

            if (syncCurrentLineIdx >= syncLines.length) {
                setTimeout(() => this.finishSyncSession(), 900);
            }
        },

        tapSync: function () {
            if (syncCurrentLineIdx >= syncLines.length) return;
            const currentTime = window.Playback ? window.Playback.currentTime : 0;
            syncTimestamps.push(currentTime);
            syncCurrentLineIdx++;
            this.renderSyncSessionUI();
        },

        finishSyncSession: function () {
            if (syncTimestamps.length === 0) return;

            let lrcText = '';
            syncTimestamps.forEach((ts, i) => {
                const mins = Math.floor(ts / 60);
                const secs = (ts % 60).toFixed(2);
                const timestamp = `[${String(mins).padStart(2, '0')}:${String(secs).padStart(5, '0')}]`;
                lrcText += `${timestamp}${syncLines[i]}\n`;
            });

            if (lyricsTrackUrl) {
                localStorage.setItem(`lrc_${lyricsTrackUrl}`, lrcText);
                console.log('[Lyrics] Saved custom lyrics to localStorage');
            }

            this.exitSyncSession();
            lyricsData = this.parseLrc(lrcText);
            container.classList.remove('editor-mode');
            this.render();
            this.renderActionBar(true, true);
        },

        exitSyncSession: function () {
            if (syncKeyHandler) document.removeEventListener('keydown', syncKeyHandler);
            syncKeyHandler = null;
        },

        parseLrc: function (lrc) {
            const lines = lrc.split('\n');
            const parsed = [];
            const timeRegEx = /\[(\d+):(\d+)\.(\d+)\]/;

            lines.forEach(line => {
                const match = timeRegEx.exec(line);
                if (match) {
                    const min = parseInt(match[1]);
                    const sec = parseInt(match[2]);
                    const ms = parseInt(match[3]);
                    const timeInSeconds = min * 60 + sec + (ms / (match[3].length === 3 ? 1000 : 100));
                    const text = line.replace(timeRegEx, '').trim();

                    if (text) {
                        parsed.push({ time: timeInSeconds, text: text });
                    } else {
                        parsed.push({ time: timeInSeconds, text: '' });
                    }
                }
            });
            return parsed.sort((a, b) => a.time - b.time);
        }
    };
})();
