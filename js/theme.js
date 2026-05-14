/**
 * Theme Module
 * Handles dynamic color extraction, artist visuals, and visual state management.
 * Supports Profiles: 'simon_default' and 'rgb'.
 */

const Theme = (function () {
    // --- State ---
    const artistImageCache = {};
    let currentProfile = localStorage.getItem('themeProfile') || 'simon_default';

    let config = {
        serverBaseUrl: '',
        defaultAccent: '#f43f5e',
        defaultBlob1: '#e11d48',
        defaultBlob2: '#f43f5e',
        customAccent: localStorage.getItem('customAccentColor') || '#f43f5e'
    };

    // DOM Refs for crossfade
    let bgLayer1 = null;
    let bgLayer2 = null;
    let isLayer1Active = true;

    function boostColor(r, g, b, sOffset = 0) {
        // Simple RGB -> HSL -> RGB boost
        let rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
        let max = Math.max(rNorm, gNorm, bNorm), min = Math.min(rNorm, gNorm, bNorm);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === rNorm) h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
            else if (max === gNorm) h = (bNorm - rNorm) / d + 2;
            else h = (rNorm - gNorm) / d + 4;
            h /= 6;
        }

        // Apply Aggressive Boosts for "RGB" feel
        let finalS = Math.max(0.6, Math.min(1, s * 1.4 + 0.15));
        let finalL = Math.max(0.45, Math.min(0.75, l * 1.1 + 0.05));

        // Apply custom offset (used for blobs)
        if (sOffset !== 0) {
            finalS = Math.max(0.1, Math.min(1, finalS + sOffset));
        }

        return `hsl(${Math.round(h * 360)}, ${Math.round(finalS * 100)}%, ${Math.round(finalL * 100)}%)`;
    }

    return {
        init: function (options) {
            config = { ...config, ...options };

            bgLayer1 = document.getElementById('immersive-bg');
            bgLayer2 = document.getElementById('immersive-bg-alt');

            this.applySavedSettings();
            this.setProfile(currentProfile);

            console.log(`[Theme] Module initialized with profile: ${currentProfile}`);
        },

        setProfile: function (profile) {
            currentProfile = profile;
            localStorage.setItem('themeProfile', profile);

            if (profile === 'simon_default') {
                this.resetToDefaults();
            } else if (profile === 'custom') {
                this.applyCustomColor(config.customAccent);
            } else {
                // If RGB is selected, it will update on the next track change or manually
                console.log('[Theme] Switched to RGB mode');
            }
        },

        applyCustomColor: function (hex) {
            if (!hex) return;
            config.customAccent = hex;
            localStorage.setItem('customAccentColor', hex);
            
            const root = document.documentElement;
            root.style.setProperty('--accent', hex);
            root.style.setProperty('--blob-1-color', hex);
            root.style.setProperty('--blob-2-color', hex);
            root.style.setProperty('--gradient-1', hex);
            root.style.setProperty('--gradient-2', hex);
        },

        getProfile: () => currentProfile,

        resetToDefaults: function () {
            const root = document.documentElement;
            root.style.setProperty('--accent', config.defaultAccent);
            root.style.setProperty('--blob-1-color', config.defaultBlob1);
            root.style.setProperty('--blob-2-color', config.defaultBlob2);
            root.style.setProperty('--gradient-1', config.defaultBlob1);
            root.style.setProperty('--gradient-2', config.defaultBlob2);

            const playerBar = document.querySelector('.player-bar');
            if (playerBar) {
                playerBar.style.removeProperty('--player-dynamic-rgb');
                playerBar.style.removeProperty('--player-dynamic-bg');
                playerBar.style.removeProperty('--player-dynamic-fill');
            }
        },

        /**
         * Centralized update for all visuals when a track changes.
         */
        updateNowPlayingVisuals: async function (track, pictureUrl) {
            if (!track) return;

            // 1. Crossfade Immersive Background
            this.crossfadeImmersiveBg(pictureUrl);

            // 2. Update Dynamic Colors (Profile dependent)
            this.updateDynamicColor(pictureUrl);

            // 3. Update Media Session
            this.updateMediaSession(track, pictureUrl);
        },

        updateDynamicColor: async function (imgUrl) {
            if (!imgUrl) return;

            const playerBar = document.querySelector('.player-bar');
            const root = document.documentElement;

            const absoluteImageUrl = (imgUrl.startsWith('/') && !imgUrl.startsWith('//'))
                ? `${config.serverBaseUrl}${imgUrl}`
                : imgUrl;

            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = absoluteImageUrl;

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 10;
                canvas.height = 10;
                ctx.drawImage(img, 0, 0, 10, 10);

                // Sample center for dominant
                const data = ctx.getImageData(5, 5, 1, 1).data;
                const [r, g, b] = data;

                // Sample corners for palette
                const dataTop = ctx.getImageData(1, 1, 1, 1).data;
                const dataBottom = ctx.getImageData(8, 8, 1, 1).data;

                // 1. Always update Player Bar Tint (as per Simon Default requirement)
                if (playerBar) {
                    const dimR = Math.floor(r * 0.7);
                    const dimG = Math.floor(g * 0.7);
                    const dimB = Math.floor(b * 0.7);
                    playerBar.style.setProperty('--player-dynamic-rgb', `${dimR}, ${dimG}, ${dimB}`);
                    playerBar.style.setProperty('--player-dynamic-bg', `rgba(${dimR}, ${dimG}, ${dimB}, 0.75)`);
                    playerBar.style.setProperty('--player-dynamic-fill', `rgba(${r}, ${g}, ${b}, 0.85)`);
                }

                // 2. If RGB Profile, update global accents and blobs
                if (currentProfile === 'rgb') {
                    const accentColor = boostColor(r, g, b);
                    const blobColor = boostColor(r, g, b, -0.2); // Same color, 20% less saturation

                    root.style.setProperty('--accent', accentColor);
                    root.style.setProperty('--blob-1-color', blobColor);
                    root.style.setProperty('--blob-2-color', blobColor);
                    root.style.setProperty('--gradient-1', blobColor);
                    root.style.setProperty('--gradient-2', accentColor);
                } else if (currentProfile === 'custom') {
                    // In custom mode, we keep the user's color but still update player bar
                    // applyCustomColor was already called or is handled by the color picker
                }
            };
        },

        crossfadeImmersiveBg: function (imgUrl) {
            if (!bgLayer1 || !bgLayer2) return;

            const nextImg = imgUrl || '';

            if (isLayer1Active) {
                // Layer 1 is visible, load into Layer 2 and fade it in
                bgLayer2.src = nextImg;
                bgLayer2.onload = () => {
                    bgLayer2.style.opacity = '0.6';
                    bgLayer1.style.opacity = '0';
                    isLayer1Active = false;
                };
            } else {
                // Layer 2 is visible, load into Layer 1 and fade it in
                bgLayer1.src = nextImg;
                bgLayer1.onload = () => {
                    bgLayer1.style.opacity = '0.6';
                    bgLayer2.style.opacity = '0';
                    isLayer1Active = true;
                };
            }
        },

        getZoomScale: function () {
            return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-zoom')) || 1;
        },

        calculateItemsPerRow: function (itemWidth = 200, gap = 24, padding = 80) {
            const scale = this.getZoomScale();
            const availableWidth = (window.innerWidth / scale) - padding;
            const count = Math.ceil((availableWidth + gap) / (itemWidth + gap)) + 1;
            return Math.max(8, count);
        },

        setZoom: function (level) {
            const zoomScale = parseFloat(level) / 100;
            document.documentElement.style.setProperty('--app-zoom', zoomScale);
            localStorage.setItem('zoomLevel', level);
        },

        applySavedSettings: function () {
            const savedZoom = localStorage.getItem('zoomLevel') || '100';
            this.setZoom(savedZoom);
        },

        updateMediaSession: function (track, pictureUrl) {
            if (!('mediaSession' in navigator)) return;

            const title = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
            const artist = (track.metadata && track.metadata.artist) ? track.metadata.artist : 'Unknown Artist';
            const album = (track.metadata && track.metadata.album) ? track.metadata.album : '';

            const artwork = pictureUrl
                ? [{ src: pictureUrl, sizes: '512x512', type: 'image/jpeg' }]
                : [{ src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml' }];

            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: album,
                artwork: artwork
            });
        },

        applyArtistVisuals: async function (artistName, elementNode, useXL = false) {
            if (!artistName || artistName === 'Unknown Artist') return;

            let targetEl = null;
            if (elementNode.classList && (
                elementNode.classList.contains('artist-card-art') ||
                elementNode.classList.contains('artist-hero-avatar') ||
                elementNode.classList.contains('artist-avatar') ||
                elementNode.classList.contains('artist-grid-avatar')
            )) {
                targetEl = elementNode;
            } else {
                targetEl = elementNode.querySelector('.artist-card-art') || 
                           elementNode.querySelector('.artist-avatar') ||
                           elementNode.querySelector('.artist-grid-avatar');
            }

            if (!targetEl) return;

            const applyImgToNode = (url, target, node) => {
                if (!url || target.innerHTML.includes('<img')) return;
                target.innerHTML = `<img src="${url}" crossorigin="anonymous" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; animation: fadeIn 0.5s;">`;

                if (node.classList && node.classList.contains('artist-hero-avatar')) {
                    const artistView = document.getElementById('artist-view');
                    if (artistView) artistView.style.setProperty('--view-bg-image', `url("${url}")`);
                }
            };

            if (!artistImageCache[artistName]) {
                artistImageCache[artistName] = { resolved: false, pending: false, waiters: [] };
            }

            const state = artistImageCache[artistName];

            if (state.resolved) {
                applyImgToNode(useXL ? state.xl : state.medium, targetEl, elementNode);
                return;
            }

            state.waiters.push({ targetEl, elementNode, useXL });
            if (state.pending) return;

            state.pending = true;
            try {
                const metadata = await window.API.getDeezerMetadata(artistName);
                if (metadata.data && metadata.data.length > 0) {
                    const obj = metadata.data[0];
                    state.resolved = true;
                    state.medium = obj.picture_medium || obj.picture;
                    state.xl = obj.picture_xl || obj.picture_big || obj.picture;
                }
            } catch (e) {
                console.error('[Theme] Deezer fetch error:', e);
            } finally {
                state.pending = false;
                const finalWaiters = state.waiters;
                state.waiters = [];
                finalWaiters.forEach(w => {
                    if (state.resolved) {
                        applyImgToNode(w.useXL ? state.xl : state.medium, w.targetEl, w.elementNode);
                    }
                });
            }
        }
    };
})();

window.Theme = Theme;
