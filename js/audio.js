/**
 * SimonRelays Audio Engine Module
 * Encapsulates Howler.js logic, queue management, and playback state.
 */
const Playback = (() => {
    // --- Core State ---
    let currentHowl = null;
    let nextHowl = null;
    let globalPlayingTrack = null;
    let isPlayingState = false;
    let crossfadeTimeout = null;
    let _lastSeekTime = 0;
    let CROSSFADE_DURATION = parseInt(localStorage.getItem('crossfadeDuration')) || 5000;
    let lastVolume = parseFloat(localStorage.getItem('volume')) || 0.7;

    // --- Queue State ---
    let userQueue = [];
    let currentPlaylistContext = [];
    let currentTrackIndex = -1;
    let isShuffleActive = (localStorage.getItem('shuffleActive') === 'true');
    let shuffledIndices = [];
    let currentShufflePointer = -1;
    let repeatMode = parseInt(localStorage.getItem('repeatMode')) || 0; // 0: off, 1: all, 2: one

    // --- Callback Hooks ---
    const callbacks = {
        onTrackChange: null,
        onPlayStateChange: null,
        onProgress: null,
        onQueueUpdate: null,
        onMetadataUpdate: null,
        onQueueEnd: null
    };

    // --- Initialization ---
    Howler.autoUnlock = true;
    Howler.volume(lastVolume);

    // Emulate timeupdate event for UI
    setInterval(() => {
        if (currentHowl && currentHowl.playing()) {
            const seek = Playback.currentTime;
            const duration = Playback.duration;

            if (callbacks.onProgress) {
                callbacks.onProgress(seek, duration);
            }

            // Crossfade & Pre-resolve Check
            const remain = duration - seek;

            // 1. If we're midway through, pre-resolve the next track's URL
            if (duration > 20 && seek > 10 && seek < (duration - 15) && !Playback._isPreResolving) {
                Playback._preResolveNext();
            }

            // 2. Crossfade trigger
            if (CROSSFADE_DURATION > 0 && duration > 10 && seek > 10 && remain > 0 && remain <= (CROSSFADE_DURATION / 1000) && !crossfadeTimeout) {
                console.log('[Audio] Crossfade threshold reached. Pre-starting next track...');
                crossfadeTimeout = true;
                Playback.next(true); // true = auto-advance
            }
        }
    }, 500); // Relaxed interval for background efficiency

    // --- Internal Helpers ---

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function generateShuffleQueue(startIndex = -1) {
        const indices = currentPlaylistContext.map((_, i) => i);
        // Filter out unsupported here if needed, but for now we assume they are valid
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

    function updateMediaSession(track) {
        if (!('mediaSession' in navigator)) return;

        const title = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
        const artist = (track.metadata && track.metadata.artist) ? track.metadata.artist : 'Unknown Artist';
        const album = (track.metadata && track.metadata.album) ? track.metadata.album : '';
        const serverBaseUrl = window.API.getBaseUrl();
        
        const artwork = (track.metadata && track.metadata.hasCover)
            ? [{ src: `${serverBaseUrl}/api/cover?path=${encodeURIComponent(track.relativePath)}`, sizes: '512x512', type: 'image/jpeg' }]
            : [{ src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml' }];

        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: artist,
            album: album,
            artwork: artwork
        });

        navigator.mediaSession.setActionHandler('play', () => Playback.resume());
        navigator.mediaSession.setActionHandler('pause', () => Playback.pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => Playback.prev());
        navigator.mediaSession.setActionHandler('nexttrack', () => Playback.next());
    }

    async function resolveTrackUrl(track) {
        const serverBaseUrl = window.API.getBaseUrl();
        const qualityPref = localStorage.getItem('streamQuality') || 'original';
        
        // Reconcile track with master list if qualities are missing (handles stale objects from Likes/History)
        let masterTrack = track;
        if (!track.qualities && window.allTracks) {
            const found = window.allTracks.find(t => t.url === track.url);
            if (found) masterTrack = found;
        }

        let url = (masterTrack.qualities && masterTrack.qualities[qualityPref]) 
            ? masterTrack.qualities[qualityPref].url 
            : masterTrack.url;
        
        if (!url.startsWith('http')) url = `${serverBaseUrl}${url}`;

        // Check Offline Storage (if available via window.getTrackFromIDB)
        if (window.getTrackFromIDB) {
            try {
                const saved = await window.getTrackFromIDB(track.url);
                if (saved && saved.blob) {
                    console.log('[Audio] Playing from offline storage:', track.url);
                    track._cachedCover = saved.coverBlob;
                    track._cachedLyrics = saved.lyrics;
                    return URL.createObjectURL(saved.blob);
                }
            } catch (e) { console.error('[Audio] IDB check failed', e); }
        }

        return url;
    }

    // --- Public API ---
    return {
        init(hooks) {
            Object.assign(callbacks, hooks);
        },

        // --- State Getters ---
        get isPlaying() { return isPlayingState; },
        get currentTrack() { return globalPlayingTrack; },
        get duration() {
            let howlDur = currentHowl ? currentHowl.duration() : 0;
            if (howlDur && isFinite(howlDur) && howlDur > 0) return howlDur;
            return (globalPlayingTrack && globalPlayingTrack.metadata && globalPlayingTrack.metadata.duration) 
                ? globalPlayingTrack.metadata.duration : 0;
        },
        get currentTime() {
            if (!currentHowl) return 0;
            const pos = currentHowl.seek();
            return (typeof pos === 'number' && isFinite(pos)) ? pos : 0;
        },
        get volume() { return Howler.volume(); },
        get isShuffleActive() { return isShuffleActive; },
        get repeatMode() { return repeatMode; },
        get crossfadeDuration() { return CROSSFADE_DURATION; },
        get upcomingTracks() {
            const upcoming = [];
            if (isShuffleActive) {
                for (let i = currentShufflePointer + 1; i < shuffledIndices.length; i++) {
                    upcoming.push(currentPlaylistContext[shuffledIndices[i]]);
                }
            } else {
                for (let i = currentTrackIndex + 1; i < currentPlaylistContext.length; i++) {
                    upcoming.push(currentPlaylistContext[i]);
                }
            }
            return upcoming;
        },
        get currentTrackIndex() { return currentTrackIndex; },
        get queue() { return userQueue; },

        // --- Actions ---
        setVolume(val) { 
            Howler.volume(val); 
            localStorage.setItem('volume', val);
        },
        seek(val) {
            if (currentHowl && isFinite(val)) {
                _lastSeekTime = Date.now();
                currentHowl.seek(val);
            }
        },

        async playTrack(track, context = null, index = -1) {
            if (context) {
                currentPlaylistContext = context;
                currentTrackIndex = index;
                if (isShuffleActive) generateShuffleQueue(index);
            } else if (index !== -1) {
                currentTrackIndex = index;
            }

            // --- Synchronous Handover Logic ---
            // On mobile background, we MUST call play() without any preceding 'await' 
            // if we want to keep the audio-transition privilege.
            
            const attemptSyncPlay = (url) => {
                if (currentHowl) {
                    // Resume if same track
                    if (globalPlayingTrack && globalPlayingTrack.url === track.url && !currentHowl.playing()) {
                        this.resume();
                        return true;
                    }
                    
                    // Crossfade out existing
                    const oldHowl = currentHowl;
                    const fadeDuration = CROSSFADE_DURATION;
                    oldHowl.fade(oldHowl.volume(), 0, fadeDuration);
                    setTimeout(() => { if (oldHowl !== currentHowl) oldHowl.unload(); }, fadeDuration + 500);
                }

                globalPlayingTrack = track;
                crossfadeTimeout = false;

                if (nextHowl && nextHowl._trackRef && nextHowl._trackRef.url === track.url) {
                    console.log('[Audio] Using preloaded nextHowl for synchronous handover.');
                    currentHowl = nextHowl;
                    nextHowl = null;
                    currentHowl.off('play').off('pause').off('end');
                } else {
                    currentHowl = new Howl({
                        src: [url],
                        html5: true,
                        format: ['mp3', 'flac', 'm4a', 'wav'],
                        autoplay: false,
                        volume: 0
                    });
                }

                currentHowl.on('play', function() {
                    if (this !== currentHowl) return;
                    isPlayingState = true;
                    callbacks.onPlayStateChange?.(true);
                    if (this._needsFadeIn) {
                        this.fade(0, lastVolume, CROSSFADE_DURATION);
                        this._needsFadeIn = false;
                    }
                });
                
                currentHowl.on('pause', () => { if (currentHowl && !currentHowl.playing()) { isPlayingState = false; callbacks.onPlayStateChange?.(false); } });
                currentHowl.on('end', () => { if (currentHowl && !currentHowl.playing()) Playback.next(true); });

                currentHowl._needsFadeIn = true;
                
                // CRITICAL: Call play() synchronously to maintain background audio privileges on mobile.
                currentHowl.play();
                
                updateMediaSession(track);
                callbacks.onTrackChange?.(track);
                
                // Also trigger pre-resolve for the track AFTER this one
                setTimeout(() => this._preResolveNext(), 2000);
                
                return true;
            };

            // 1. Try playing immediately if already resolved
            if (track._resolvedUrl) {
                return attemptSyncPlay(track._resolvedUrl);
            }

            // 2. Fallback to async resolution (only happens on manual clicks or if pre-resolve failed/missed)
            console.log('[Audio] URL not pre-resolved. Performing async resolution...');
            const finalUrl = await resolveTrackUrl(track);
            track._resolvedUrl = finalUrl; // Cache it
            return attemptSyncPlay(finalUrl);
        },

        // Internal helper to look ahead
        async _preResolveNext() {
            if (this._isPreResolving) return;
            this._isPreResolving = true;
            
            try {
                let nextTrack = null;
                if (userQueue.length > 0) {
                    nextTrack = userQueue[0];
                } else if (currentTrackIndex !== -1) {
                    let nextIdx = -1;
                    if (isShuffleActive) {
                        if (currentShufflePointer < shuffledIndices.length - 1) nextIdx = shuffledIndices[currentShufflePointer + 1];
                    } else {
                        if (currentTrackIndex < currentPlaylistContext.length - 1) nextIdx = currentTrackIndex + 1;
                    }
                    if (nextIdx !== -1) nextTrack = currentPlaylistContext[nextIdx];
                }

                if (nextTrack && !nextTrack._resolvedUrl) {
                    console.log('[Audio] Pre-resolving next track:', nextTrack.filename || nextTrack.url);
                    const url = await resolveTrackUrl(nextTrack);
                    nextTrack._resolvedUrl = url;
                    
                    if (nextHowl) {
                        nextHowl.unload();
                        nextHowl = null;
                    }
                    
                    nextHowl = new Howl({
                        src: [url],
                        html5: true,
                        format: ['mp3', 'flac', 'm4a', 'wav'],
                        autoplay: false,
                        volume: 0,
                        preload: false // CRITICAL: Disable preloading in HTML5 mode to prevent browser suspension
                    });
                    nextHowl._trackRef = nextTrack;
                }
            } catch (e) {
                console.warn('[Audio] Pre-resolve failed', e);
            } finally {
                this._isPreResolving = false;
            }
        },

        pause() { 
            if (currentHowl) {
                currentHowl.pause();
                // Force state update in case Howler event is delayed or suppressed
                isPlayingState = false;
                callbacks.onPlayStateChange?.(false);
            }
        },
        resume() { 
            if (currentHowl) {
                currentHowl.play();
                isPlayingState = true;
                callbacks.onPlayStateChange?.(true);
            }
        },

        next(isAuto = false) {
            if (userQueue.length > 0) {
                const nextTrack = userQueue.shift();
                this.playTrack(nextTrack);
                callbacks.onQueueUpdate?.(userQueue);
                return;
            }

            if (currentTrackIndex === -1) return;

            let nextIdx = -1;
            if (isShuffleActive) {
                if (currentShufflePointer < shuffledIndices.length - 1) {
                    currentShufflePointer++;
                    nextIdx = shuffledIndices[currentShufflePointer];
                } else if (repeatMode === 1) { // Repeat All
                    generateShuffleQueue();
                    nextIdx = shuffledIndices[0];
                }
            } else {
                if (currentTrackIndex < currentPlaylistContext.length - 1) {
                    nextIdx = currentTrackIndex + 1;
                } else if (repeatMode === 1) { // Repeat All
                    nextIdx = 0;
                }
            }

            if (nextIdx !== -1) {
                this.playTrack(currentPlaylistContext[nextIdx], null, nextIdx);
            } else if (isAuto) {
                if (callbacks.onQueueEnd) {
                    callbacks.onQueueEnd();
                } else {
                    this.pause();
                }
            }
        },

        prev() {
            if (this.currentTime > 3) {
                this.seek(0);
                return;
            }

            let prevIdx = -1;
            if (isShuffleActive) {
                if (currentShufflePointer > 0) {
                    currentShufflePointer--;
                    prevIdx = shuffledIndices[currentShufflePointer];
                } else if (repeatMode === 1) { // Repeat All
                    currentShufflePointer = shuffledIndices.length - 1;
                    prevIdx = shuffledIndices[currentShufflePointer];
                }
            } else {
                if (currentTrackIndex > 0) {
                    prevIdx = currentTrackIndex - 1;
                } else if (repeatMode === 1) { // Repeat All
                    prevIdx = currentPlaylistContext.length - 1;
                }
            }

            if (prevIdx !== -1) {
                this.playTrack(currentPlaylistContext[prevIdx], null, prevIdx);
            } else {
                this.seek(0);
            }
        },

        toggleShuffle() {
            isShuffleActive = !isShuffleActive;
            localStorage.setItem('shuffleActive', isShuffleActive);
            if (isShuffleActive && currentTrackIndex !== -1) {
                generateShuffleQueue(currentTrackIndex);
            }
            return isShuffleActive;
        },

        setRepeatMode(mode) {
            repeatMode = mode;
            localStorage.setItem('repeatMode', mode);
            return repeatMode;
        },

        setCrossfadeDuration(ms) {
            CROSSFADE_DURATION = ms;
            localStorage.setItem('crossfadeDuration', ms);
        },

        addToQueue(track) {
            userQueue.push(track);
            callbacks.onQueueUpdate?.(userQueue);
        },

        removeFromQueue(index, fromUserQueue) {
            if (fromUserQueue) {
                userQueue.splice(index, 1);
            } else {
                const upcoming = this.upcomingTracks;
                if (index < upcoming.length) {
                    const trackToRemove = upcoming[index];
                    const realIdx = currentPlaylistContext.indexOf(trackToRemove);
                    if (realIdx !== -1) {
                        currentPlaylistContext.splice(realIdx, 1);
                        
                        // If we removed a track before the current one (shouldn't happen with upcoming but just in case)
                        if (realIdx < currentTrackIndex) currentTrackIndex--;

                        if (isShuffleActive) {
                            const sIdx = shuffledIndices.indexOf(realIdx);
                            if (sIdx !== -1) shuffledIndices.splice(sIdx, 1);
                            shuffledIndices = shuffledIndices.map(i => i > realIdx ? i - 1 : i);
                            // If we removed the current shuffle item (shouldn't happen), currentShufflePointer stays same
                        }
                    }
                }
            }
            callbacks.onQueueUpdate?.(userQueue);
        },

        clearQueue() {
            userQueue = [];
            callbacks.onQueueUpdate?.(userQueue);
        },

        appendContext(track) {
            currentPlaylistContext.push(track);
            if (isShuffleActive) {
                shuffledIndices.push(currentPlaylistContext.length - 1);
            }
            callbacks.onQueueUpdate?.();
        },

        setCrossfadeDuration(ms) {
            CROSSFADE_DURATION = ms;
            console.log(`[Audio] Crossfade duration set to ${ms}ms`);
        },

        get currentPlaylistContext() { return currentPlaylistContext; },
        get repeatMode() { return repeatMode; },
        get isShuffleActive() { return isShuffleActive; },
        get crossfadeDuration() { return CROSSFADE_DURATION; }
    };
})();

window.Playback = Playback;
