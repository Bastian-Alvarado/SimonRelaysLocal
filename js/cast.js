/**
 * SimonRelays Chromecast Integration Module
 * Manages Google Cast API initialization, session state, remote playback,
 * and dynamic URL domain resolving for Chromecast devices.
 */
const CastManager = (() => {
    let castContext = null;
    let player = null;
    let playerController = null;
    let localServerIpBaseUrl = null;

    /**
     * Resolves the LAN network IP from the server in development mode.
     */
    async function getResolvedNetworkIp(baseUrl) {
        if (localServerIpBaseUrl) return localServerIpBaseUrl;
        try {
            const res = await fetch(`${baseUrl}/api/server-info`);
            const info = await res.json();
            if (info && info.baseUrl) {
                localServerIpBaseUrl = info.baseUrl;
                console.log(`[Cast] Resolved local developer LAN URL: ${localServerIpBaseUrl}`);
                return localServerIpBaseUrl;
            }
        } catch (e) {
            console.error('[Cast] Failed to resolve server-info:', e);
        }
        return baseUrl; // Fallback to current URL origin
    }

    /**
     * Translates local/loopback URLs to network-reachable IP URLs.
     */
    async function translateUrlForCast(trackUrl) {
        const originBaseUrl = window.API ? window.API.getBaseUrl() : window.location.origin;
        let finalUrl = trackUrl.startsWith('http') ? trackUrl : `${originBaseUrl}${trackUrl}`;

        // If the URL contains localhost or 127.0.0.1, we must translate it to the resolved LAN IP
        if (finalUrl.includes('://localhost') || finalUrl.includes('://127.0.0.1')) {
            const networkBase = await getResolvedNetworkIp(originBaseUrl);
            finalUrl = finalUrl
                .replace(/:\/\/localhost(:\d+)?/, networkBase.substring(networkBase.indexOf('://')))
                .replace(/:\/\/127\.0\.0\.1(:\d+)?/, networkBase.substring(networkBase.indexOf('://')));
        }
        return finalUrl;
    }

    return {
        /**
         * Bootstrap/initialize Google Cast Framework.
         */
        init() {
            try {
                console.log('[Cast] Initializing Google Cast SDK Context...');
                castContext = cast.framework.CastContext.getInstance();
                
                const appId = (window.chrome && window.chrome.cast && window.chrome.cast.media)
                    ? (window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID || 'CC1AD845')
                    : 'CC1AD845';

                castContext.setOptions({
                    receiverApplicationId: appId,
                    autoJoinPolicy: (window.chrome && window.chrome.cast)
                        ? window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
                        : 'origin_scoped'
                });

                // Bind remote players
                player = new cast.framework.RemotePlayer();
                playerController = new cast.framework.RemotePlayerController(player);

                // Listen for session connectivity changes
                playerController.addEventListener(
                    cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
                    async () => {
                        const isConnected = player.isConnected;
                        console.log(`[Cast] Connection status changed. Connected: ${isConnected}`);
                        
                        if (isConnected) {
                            // Connected to Cast device!
                            State.set('isCasting', true);
                            
                            // Visual indication helper (active casting styling)
                            const castBtn = document.getElementById('cast-btn');
                            if (castBtn) castBtn.classList.add('active-cast');

                            // Seamless handover: play current track on Chromecast
                            const currentTrack = Playback.currentTrack;
                            if (currentTrack) {
                                const seekPos = Playback.currentTime;
                                const wasPlaying = Playback.isPlaying;
                                
                                console.log(`[Cast] Seamless handover: casting "${currentTrack.filename}" at ${seekPos}s`);
                                
                                // Mute/pause local playback instantly
                                if (Playback.currentHowl) {
                                    Playback.currentHowl.pause();
                                }
                                
                                // Stream to Chromecast
                                await this.playTrack(currentTrack, seekPos);
                                
                                if (!wasPlaying) {
                                    this.pause();
                                }
                            }
                        } else {
                            // Disconnected from Cast device
                            State.set('isCasting', false);
                            
                            const castBtn = document.getElementById('cast-btn');
                            if (castBtn) castBtn.classList.remove('active-cast');

                            // Seamless resumption: play locally on browser speaker
                            const currentTrack = Playback.currentTrack;
                            if (currentTrack) {
                                const seekPos = player.currentTime || 0;
                                const wasPlaying = player.playerState === chrome.cast.media.PlayerState.PLAYING;
                                
                                console.log(`[Cast] Session disconnected. Resuming locally at ${seekPos}s`);
                                
                                await Playback.playTrack(currentTrack);
                                Playback.seek(seekPos);
                                if (!wasPlaying) {
                                    Playback.pause();
                                }
                            }
                        }
                    }
                );

                console.log('[Cast] Google Cast SDK successfully initialized.');
            } catch (err) {
                console.error('[Cast] Initialization failed:', err);
            }
        },

        /**
         * Returns whether casting is currently active.
         */
        get isCasting() {
            return State.get('isCasting') === true;
        },

        /**
         * Returns whether media is playing on Chromecast.
         */
        get isPlaying() {
            return player && player.playerState === chrome.cast.media.PlayerState.PLAYING;
        },

        /**
         * Returns current cast playback time in seconds.
         */
        get currentTime() {
            return player ? player.currentTime : 0;
        },

        /**
         * Returns cast total media duration in seconds.
         */
        get duration() {
            return player ? player.duration : 0;
        },

        /**
         * Returns remote Chromecast volume (0.0 to 1.0).
         */
        get volume() {
            return player ? player.volumeLevel : 0.7;
        },

        /**
         * Adjust remote Chromecast volume.
         */
        setVolume(level) {
            if (!player || !playerController) return;
            player.volumeLevel = level;
            playerController.setVolumeLevel();
        },

        /**
         * Remote Play/Resume.
         */
        resume() {
            if (playerController && player.isPaused) {
                playerController.playOrPause();
            }
        },

        /**
         * Remote Pause.
         */
        pause() {
            if (playerController && !player.isPaused) {
                playerController.playOrPause();
            }
        },

        /**
         * Remote Seek to seconds.
         */
        seek(seconds) {
            if (!player || !playerController) return;
            player.currentTime = seconds;
            playerController.seek();
        },

        /**
         * Load and play a track on Chromecast.
         */
        async playTrack(track, startSeconds = 0) {
            const session = castContext?.getCurrentSession();
            if (!session) {
                console.warn('[Cast] No active session available to stream.');
                return;
            }

            try {
                console.log(`[Cast] Preparing track URL for casting: ${track.filename}`);
                const castableStreamUrl = await translateUrlForCast(track.url);
                console.log(`[Cast] Chromecast resolved media stream URL: ${castableStreamUrl}`);

                const mediaInfo = new chrome.cast.media.MediaInfo(castableStreamUrl, 'audio/mpeg');
                mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
                mediaInfo.metadata.metadataType = chrome.cast.media.MetadataType.MUSIC_TRACK;
                
                mediaInfo.metadata.title = track.metadata?.title || track.filename;
                mediaInfo.metadata.artist = track.metadata?.artist || 'Unknown Artist';
                mediaInfo.metadata.albumName = track.metadata?.album || '';

                // Handle Cover Image translation for local setup
                const originBaseUrl = window.API ? window.API.getBaseUrl() : window.location.origin;
                const coverPath = track.metadata?.hasCover 
                    ? `${originBaseUrl}/api/cover?path=${encodeURIComponent(track.relativePath)}`
                    : `${originBaseUrl}/logo.svg`;
                
                const castableCoverUrl = await translateUrlForCast(coverPath);
                mediaInfo.metadata.images = [new chrome.cast.Image(castableCoverUrl)];

                const request = new chrome.cast.media.LoadRequest(mediaInfo);
                request.autoplay = true;
                request.currentTime = startSeconds;

                console.log(`[Cast] Sending LoadRequest to receiver device...`);
                await session.loadMedia(request);
                console.log('[Cast] Media successfully loaded on Chromecast.');
            } catch (err) {
                console.error('[Cast] Failed to cast media:', err);
            }
        }
    };
})();

// Define global callback expected by Google Cast SDK script
window.__onGCastApiAvailable = function(isAvailable) {
    if (isAvailable) {
        CastManager.init();
    }
};

window.CastManager = CastManager;
