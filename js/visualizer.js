/**
 * SimonRelays Audio Visualizer Module
 * Encapsulates the Web Audio Analyser, built-in Canvas visualizers,
 * and the sandboxed iframe postMessage bridge.
 */
const Visualizer = (() => {
    let audioCtx = null;
    let analyser = null;
    let dataArray = null;
    let timeDataArray = null;
    let animationFrameId = null;
    let currentMode = localStorage.getItem('activeVisualizer') || 'none';
    let container = null;

    // Built-in Canvas State
    let canvas = null;
    let ctx = null;
    let particles = [];
    let lastBeatTime = 0;

    // Custom Iframe State
    let iframe = null;
    let iframeLoaded = false;
    let activeBlobUrl = null;

    function init() {
        container = document.getElementById('immersive-visualizer-container');
        if (!container) return;

        // Apply visualizer setting on init
        setMode(currentMode);
    }

    const mediaElementSources = new WeakMap();

    function hookHtml5AudioElement(audioElement) {
        if (!ensureAnalyser()) return;

        // Prevent duplicate connection of the same HTMLAudioElement
        if (mediaElementSources.has(audioElement)) {
            return;
        }

        try {
            const sourceNode = audioCtx.createMediaElementSource(audioElement);
            // Connect to BOTH the analyser (for FFT data) AND destination (so audio is still heard)
            sourceNode.connect(analyser);
            sourceNode.connect(audioCtx.destination);
            mediaElementSources.set(audioElement, sourceNode);
            console.log('[Visualizer] Connected HTML5 audio element source.');
        } catch (e) {
            console.warn('[Visualizer] Failed to connect HTML5 audio element source:', e);
        }
    }

    function ensureAnalyser() {
        if (analyser) return true;

        if (window.Howler && Howler.ctx && Howler.masterGain) {
            try {
                audioCtx = Howler.ctx;
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 256; // 128 bars/samples
                
                const bufferLength = analyser.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);
                timeDataArray = new Uint8Array(bufferLength);

                // Insert our analyser node into the Howler master chain
                Howler.masterGain.disconnect();
                Howler.masterGain.connect(analyser);
                analyser.connect(audioCtx.destination);

                // If the AudioContext is ever closed (e.g. browser optimisation), clear so we reconnect cleanly
                audioCtx.addEventListener('statechange', () => {
                    if (audioCtx.state === 'closed') {
                        analyser = null;
                        audioCtx = null;
                        dataArray = null;
                        timeDataArray = null;
                    }
                });

                console.log('[Visualizer] Connected to global Howler master output.');
                return true;
            } catch (e) {
                console.error('[Visualizer] Failed to connect Web Audio Analyser:', e);
                return false;
            }
        }
        return false;
    }

    function setMode(mode) {
        currentMode = mode;
        localStorage.setItem('activeVisualizer', mode);

        // Terminate any active rendering loop
        stop();
        clearContainer();

        if (mode === 'none') {
            return;
        }

        if (mode === 'bars' || mode === 'ring') {
            setupCanvas();
        } else if (mode === 'custom' || mode === 'hellfire' || mode === 'simple_example') {
            setupIframe();
        }

        // Auto-start loop if immersive overlay is open and playing
        const immersiveView = document.getElementById('immersive-view');
        const isImmersiveOpen = immersiveView && !immersiveView.classList.contains('hidden');
        
        // Access playback state dynamically
        const isPlaying = window.Playback && typeof window.Playback.playing === 'function' 
            ? window.Playback.playing() 
            : false;

        if (isImmersiveOpen && isPlaying) {
            start();
        }
    }

    function clearContainer() {
        if (!container) return;
        
        if (activeBlobUrl) {
            URL.revokeObjectURL(activeBlobUrl);
            activeBlobUrl = null;
        }
        
        container.innerHTML = '';
        canvas = null;
        ctx = null;
        iframe = null;
        iframeLoaded = false;
    }

    function setupCanvas() {
        if (!container) return;
        canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d');
        container.appendChild(canvas);
        resizeCanvas();
        
        window.addEventListener('resize', resizeCanvas);
    }

    function resizeCanvas() {
        if (!canvas) return;
        canvas.width = canvas.clientWidth * window.devicePixelRatio;
        canvas.height = canvas.clientHeight * window.devicePixelRatio;
        if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    async function setupIframe() {
        if (!container) return;
        
        let customHtml = '';
        if (currentMode === 'custom') {
            customHtml = localStorage.getItem('customVisualizerHtml');
            if (!customHtml) {
                container.innerHTML = `
                    <div style="color: rgba(255,255,255,0.4); display: flex; align-items: center; justify-content: center; height:100%; font-size:14px; font-weight:600;">
                        No custom visualizer file uploaded. Please upload a self-contained .html file in Settings.
                    </div>
                `;
                return;
            }
            createAndInjectIframe(customHtml);
        } else if (currentMode === 'hellfire' || currentMode === 'simple_example') {
            try {
                const response = await fetch(`/visualizers/${currentMode}.html`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch /visualizers/${currentMode}.html (status ${response.status})`);
                }
                customHtml = await response.text();
                createAndInjectIframe(customHtml);
            } catch (err) {
                console.error('[Visualizer] Error loading built-in HTML visualizer:', err);
                container.innerHTML = `
                    <div style="color: rgba(255,255,255,0.4); display: flex; align-items: center; justify-content: center; height:100%; font-size:14px; font-weight:600; text-align: center; padding: 20px;">
                        Failed to load built-in theme ${currentMode}. Ensure server is running.
                    </div>
                `;
            }
        }
    }

    function createAndInjectIframe(customHtml) {
        try {
            if (activeBlobUrl) {
                URL.revokeObjectURL(activeBlobUrl);
                activeBlobUrl = null;
            }

            // Inject a debug script at the end of the HTML to trace message reception
            const debugScript = `<script>
                let __dbgCount = 0;
                window.addEventListener('message', (e) => {
                    if (e.data && e.data.type === 'audio-data') {
                        __dbgCount++;
                        if (__dbgCount <= 3) {
                            console.log('[IFRAME DEBUG] msg #' + __dbgCount + ' track:', JSON.stringify(e.data.track && e.data.track.metadata));
                            console.log('[IFRAME DEBUG] lyrics count:', (e.data.lyrics || []).length, 'activeIdx:', e.data.activeLyricIndex);
                        }
                    }
                });
            <\/script>`;

            const injectedHtml = customHtml.includes('</body>')
                ? customHtml.replace('</body>', debugScript + '</body>')
                : customHtml + debugScript;

            const blob = new Blob([injectedHtml], { type: 'text/html' });
            activeBlobUrl = URL.createObjectURL(blob);

            iframe = document.createElement('iframe');
            iframe.src = activeBlobUrl;
            iframe.setAttribute('sandbox', 'allow-scripts');
            iframe.style.pointerEvents = 'none';

            iframe.onload = () => {
                iframeLoaded = true;
                console.log('[Visualizer] Custom/Built-in iframe loaded successfully.');
            };

            container.appendChild(iframe);
        } catch (e) {
            console.error('[Visualizer] Failed to initialize custom/built-in iframe:', e);
        }
    }

    function handleCustomUpload(fileText) {
        localStorage.setItem('customVisualizerHtml', fileText);
        console.log('[Visualizer] Stored custom HTML, length:', fileText.length, 'first 80 chars:', fileText.substring(0, 80));
        if (currentMode === 'custom') {
            setMode('custom'); // Reload visualizer
        }
    }

    function start() {
        if (currentMode === 'none') return;

        // Cancel any existing loop first
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        if (!ensureAnalyser()) {
            // Howler AudioContext not ready yet — retry on next frame until it is
            animationFrameId = requestAnimationFrame(start);
            return;
        }

        // Resume AudioContext if suspended (browser security)
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        animationFrameId = requestAnimationFrame(renderLoop);
    }

    function stop() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    function renderLoop() {
        if (window.Playback && Playback.currentHowl) {
            const howl = Playback.currentHowl;
            if (howl && howl._sounds && howl._sounds[0] && howl._sounds[0]._node) {
                const node = howl._sounds[0]._node;
                if (node instanceof HTMLAudioElement) {
                    hookHtml5AudioElement(node);
                }
            }
        }

        if (!analyser || currentMode === 'none') return;

        analyser.getByteFrequencyData(dataArray);
        analyser.getByteTimeDomainData(timeDataArray);

        if (currentMode === 'bars' || currentMode === 'ring') {
            if (canvas && ctx) {
                const width = canvas.width / window.devicePixelRatio;
                const height = canvas.height / window.devicePixelRatio;
                ctx.clearRect(0, 0, width, height);

                if (currentMode === 'bars') {
                    drawRetroBars(width, height);
                } else if (currentMode === 'ring') {
                    drawPulseRing(width, height);
                }
            }
        } else if ((currentMode === 'custom' || currentMode === 'hellfire' || currentMode === 'simple_example') && iframe && iframeLoaded) {
            broadcastToIframe();
        }

        animationFrameId = requestAnimationFrame(renderLoop);
    }

    // ── Built-in Visualizer: Retro Bars ──────────────────────────────────────
    function drawRetroBars(width, height) {
        const barWidth = (width / dataArray.length) * 1.4;
        let barHeight;
        let x = 0;

        // Fetch dynamic theme color gradients
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e11d48';
        const color2 = getComputedStyle(document.documentElement).getPropertyValue('--immersive-gradient-1').trim() || '#f43f5e';

        ctx.shadowBlur = 12;
        ctx.shadowColor = accent;

        for (let i = 0; i < dataArray.length; i++) {
            // Apply exponential attenuation to low frequencies, boost high frequencies
            const factor = i < 15 ? 0.95 : (1.1 + (i / dataArray.length) * 0.5);
            barHeight = (dataArray[i] / 255) * height * 0.45 * factor;
            
            // Limit minimum height for sleek idling waves
            if (barHeight < 3) barHeight = 3;

            const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
            gradient.addColorStop(0, accent);
            gradient.addColorStop(0.6, color2);
            gradient.addColorStop(1, 'rgba(10, 10, 15, 0)');

            ctx.fillStyle = gradient;
            
            // Rounded corners on bars
            ctx.beginPath();
            ctx.roundRect(x, height - barHeight, barWidth - 3, barHeight, [4, 4, 0, 0]);
            ctx.fill();

            // Symmetrical Reflection bar
            ctx.shadowBlur = 0; // Disable shadow for reflection to save GPU cycles
            ctx.fillStyle = `rgba(${hexToRgb(accent)}, 0.12)`;
            ctx.beginPath();
            ctx.roundRect(x, height, barWidth - 3, barHeight * 0.4, [0, 0, 4, 4]);
            ctx.fill();
            
            ctx.shadowBlur = 12; // Re-enable for main bar
            x += barWidth;
        }
        ctx.shadowBlur = 0;
    }

    // ── Built-in Visualizer: Pulse Ring ──────────────────────────────────────
    function drawPulseRing(width, height) {
        const centerX = width / 2;
        const centerY = height / 2;

        // Fetch dynamic theme colors
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e11d48';
        const color2 = getComputedStyle(document.documentElement).getPropertyValue('--immersive-gradient-1').trim() || '#f43f5e';

        // Calculate average bass frequency (first 8 index values represent bass)
        let bassSum = 0;
        for (let i = 0; i < 8; i++) {
            bassSum += dataArray[i];
        }
        const bassAvg = bassSum / 8;
        const bassIntensity = bassAvg / 255; // 0.0 to 1.0

        // Create an organic, slow idle breath wave (breathing cycle of 2.4 seconds)
        const idlePulse = Math.sin(Date.now() / 1200) * 0.5 + 0.5;
        
        // Blend bass hits with a premium idle breathing floor when silent or paused
        const effectiveIntensity = Math.max(bassIntensity, idlePulse * 0.06);

        // Responsive, audio-reactive radii matching the proportions of the preview card
        const maxDimension = Math.min(width, height);
        const innerRadius = maxDimension * 0.04 + (effectiveIntensity * 12);
        const middleRadius = maxDimension * 0.08 + (effectiveIntensity * 24);
        const outerRadius = maxDimension * 0.12 + (effectiveIntensity * 36);
        
        // 1. Draw Soft Glow Backdrop (Breathes with bass intensity)
        ctx.beginPath();
        const radialGrad = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius * 1.6);
        radialGrad.addColorStop(0, `rgba(${hexToRgb(accent)}, 0.15)`);
        radialGrad.addColorStop(0.4, `rgba(${hexToRgb(color2)}, 0.06)`);
        radialGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = radialGrad;
        ctx.arc(centerX, centerY, outerRadius * 1.6, 0, Math.PI * 2);
        ctx.fill();

        // 2. Draw Solid White Center Circle (Pulsing size and glow)
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 3. Draw Middle Solid Accent Ring (Glows intensely, expanding with audio)
        ctx.save();
        ctx.shadowBlur = 24;
        ctx.shadowColor = accent;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(centerX, centerY, middleRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // 4. Draw Outer Dashed Ring (Rotates smoothly over time, expands with bass)
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.2)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([8, 14]);
        
        // Translate to center to apply rotation transform
        ctx.translate(centerX, centerY);
        const rotationAngle = (Date.now() / 2500) % (Math.PI * 2);
        ctx.rotate(rotationAngle);
        ctx.beginPath();
        ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // 5. Particle System: Emit pulsing particles from boundary of middle ring shooting outward
        const now = Date.now();
        if (bassIntensity > 0.4 && now - lastBeatTime > 80 && particles.length < 80) {
            lastBeatTime = now;
            const emitCount = Math.min(6, Math.floor(bassIntensity * 6));
            for (let k = 0; k < emitCount; k++) {
                const angle = Math.random() * Math.PI * 2;
                particles.push({
                    x: centerX + Math.cos(angle) * middleRadius,
                    y: centerY + Math.sin(angle) * middleRadius,
                    vx: Math.cos(angle) * (1.2 + Math.random() * 2.8) * (bassIntensity * 1.4),
                    vy: Math.sin(angle) * (1.2 + Math.random() * 2.8) * (bassIntensity * 1.4),
                    radius: 1.5 + Math.random() * 3,
                    alpha: 0.8,
                    color: Math.random() > 0.4 ? accent : '#ffffff'
                });
            }
        }

        // Draw and update particle buffer
        particles.forEach((p, idx) => {
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.015; // Slow fade out
            
            if (p.alpha <= 0) {
                particles.splice(idx, 1);
                return;
            }

            ctx.beginPath();
            ctx.fillStyle = `rgba(${p.color === '#ffffff' ? '255,255,255' : hexToRgb(p.color)}, ${p.alpha})`;
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // ── Broadcaster to sandboxed custom iframe ─────────────────────────────────
    let _broadcastLoggedOnce = false;
    function broadcastToIframe() {
        if (!iframe || !iframeLoaded) return;

        let total = 0;
        let bass = 0;
        for (let i = 0; i < dataArray.length; i++) {
            total += dataArray[i];
            if (i < 10) bass += dataArray[i];
        }

        const volume = total / dataArray.length;
        const avgBass = bass / 10;

        const rawTrack = (window.Playback && window.Playback.currentTrack) || {};

        // Build a clean, serializable track object — raw track may have Blobs, DOM refs,
        // or other non-cloneable properties that would cause postMessage to throw silently.
        const md = rawTrack.metadata || {};
        const track = {
            filename: rawTrack.filename || '',
            relativePath: rawTrack.relativePath || '',
            url: rawTrack.url || '',
            metadata: {
                title: md.title || '',
                artist: md.artist || '',
                album: md.album || '',
                genre: md.genre || '',
                duration: md.duration || 0,
                hasCover: !!md.hasCover
            }
        };

        // Build cover art URL from track relativePath + server base URL
        let coverArtUrl = null;
        if (track.relativePath && window.API && typeof window.API.getBaseUrl === 'function') {
            const serverBase = window.API.getBaseUrl();
            coverArtUrl = `${serverBase}/api/cover?path=${encodeURIComponent(track.relativePath)}`;
        }

        // Pull lyrics data from the Lyrics module (safe no-op if unavailable or not loaded)
        let lyrics = [];
        let activeLyricIndex = -1;
        if (window.Lyrics) {
            const raw = window.Lyrics.lyricsData;
            if (Array.isArray(raw)) {
                lyrics = raw.map(line => ({ time: line.time, text: line.text }));
            }
            activeLyricIndex = window.Lyrics.currentLyricIndex;
        }

        const msg = {
            type: 'audio-data',
            frequency: Array.from(dataArray),
            timeDomain: Array.from(timeDataArray),
            volume: volume / 255,
            bass: avgBass / 255,
            track,
            coverArtUrl,
            lyrics,
            activeLyricIndex,
            colors: {
                accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e11d48',
                gradient1: getComputedStyle(document.documentElement).getPropertyValue('--immersive-gradient-1').trim() || '#f43f5e',
                gradient2: getComputedStyle(document.documentElement).getPropertyValue('--immersive-gradient-2').trim() || '#f43f5e'
            }
        };

        if (!_broadcastLoggedOnce) {
            _broadcastLoggedOnce = true;
            console.log('[Visualizer] First broadcast to iframe. Track title:', track.metadata.title, '| Lyrics:', lyrics.length, '| ActiveIdx:', activeLyricIndex);
        }

        try {
            iframe.contentWindow.postMessage(msg, '*');
        } catch (e) {
            console.warn('[Visualizer] postMessage failed:', e);
        }
    }

    // ── Helper Utility: Hex -> RGB ───────────────────────────────────────────
    function hexToRgb(hex) {
        // Strip # if present
        let cleanHex = hex.trim().replace(/^#/, '');
        
        // Handle shorthand hex values like "fff"
        if (cleanHex.length === 3) {
            cleanHex = cleanHex.split('').map(char => char + char).join('');
        }
        
        // In case HSL or other color format is injected, fall back gracefully
        if (cleanHex.length !== 6) {
            return '225, 29, 72'; // RGB representation of default #e11d48
        }
        
        const num = parseInt(cleanHex, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        
        return `${r}, ${g}, ${b}`;
    }

    return {
        init,
        start,
        stop,
        setMode,
        handleCustomUpload
    };
})();

// Auto-register to window for global namespace access
window.Visualizer = Visualizer;
