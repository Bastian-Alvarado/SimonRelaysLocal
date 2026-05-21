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
            audioElement.crossOrigin = "anonymous";
            const sourceNode = audioCtx.createMediaElementSource(audioElement);
            sourceNode.connect(analyser);
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

        // Initialize display nodes
        if (mode === 'bars' || mode === 'ring') {
            setupCanvas();
        } else if (mode === 'custom') {
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

    function setupIframe() {
        if (!container) return;
        const customHtml = localStorage.getItem('customVisualizerHtml');
        if (!customHtml) {
            container.innerHTML = `
                <div style="color: rgba(255,255,255,0.4); display: flex; align-items: center; justify-content: center; height:100%; font-size:14px; font-weight:600;">
                    No custom visualizer file uploaded. Please upload a self-contained .html file in Settings.
                </div>
            `;
            return;
        }

        try {
            const blob = new Blob([customHtml], { type: 'text/html' });
            activeBlobUrl = URL.createObjectURL(blob);

            iframe = document.createElement('iframe');
            iframe.src = activeBlobUrl;
            iframe.setAttribute('sandbox', 'allow-scripts');
            iframe.style.pointerEvents = 'none';

            iframe.onload = () => {
                iframeLoaded = true;
            };

            container.appendChild(iframe);
        } catch (e) {
            console.error('[Visualizer] Failed to initialize custom iframe:', e);
        }
    }

    function handleCustomUpload(fileText) {
        localStorage.setItem('customVisualizerHtml', fileText);
        if (currentMode === 'custom') {
            setMode('custom'); // Reload visualizer
        }
    }

    function start() {
        if (currentMode === 'none') return;
        if (!ensureAnalyser()) {
            // Howler context not ready yet. Retry when audio starts playing.
            return;
        }

        // Cancel previous animation loops to avoid duplicate ticking
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
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
        } else if (currentMode === 'custom' && iframe && iframeLoaded) {
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

        // Base circular properties
        const baseRadius = Math.min(width, height) * 0.16 + (bassIntensity * 32);
        
        // Draw Soft Glow Backdrop
        ctx.beginPath();
        const radialGrad = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.6, centerX, centerY, baseRadius * 2);
        radialGrad.addColorStop(0, `rgba(${hexToRgb(accent)}, 0.1)`);
        radialGrad.addColorStop(0.5, `rgba(${hexToRgb(color2)}, 0.05)`);
        radialGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = radialGrad;
        ctx.arc(centerX, centerY, baseRadius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Waveform Circular Ring (draw points around circle matching time data)
        ctx.beginPath();
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = accent;
        ctx.shadowBlur = 20;
        ctx.shadowColor = accent;

        const points = 120;
        for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2;
            
            // Map frequencies around the circle symmetrically
            const dataIndex = Math.floor((i < points / 2 ? i : points - i) * (dataArray.length / (points / 2)));
            const waveOffset = (dataArray[dataIndex] / 255) * 45;

            const r = baseRadius + waveOffset;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Particle System: Emit pulsing particles from boundary of base ring
        const now = Date.now();
        if (bassIntensity > 0.45 && now - lastBeatTime > 90 && particles.length < 80) {
            lastBeatTime = now;
            const emitCount = Math.floor(bassIntensity * 4);
            for (let k = 0; k < emitCount; k++) {
                const angle = Math.random() * Math.PI * 2;
                particles.push({
                    x: centerX + Math.cos(angle) * baseRadius,
                    y: centerY + Math.sin(angle) * baseRadius,
                    vx: Math.cos(angle) * (1.5 + Math.random() * 3) * (bassIntensity * 1.5),
                    vy: Math.sin(angle) * (1.5 + Math.random() * 3) * (bassIntensity * 1.5),
                    radius: 2 + Math.random() * 5,
                    alpha: 0.85,
                    color: Math.random() > 0.4 ? accent : color2
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
            ctx.fillStyle = `rgba(${hexToRgb(p.color)}, ${p.alpha})`;
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // ── Broadcaster to sandboxed custom iframe ─────────────────────────────────
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

        const currentTrack = window.State && typeof window.State.get === 'function'
            ? window.State.get('currentTrack')
            : (window.globalPlayingTrack || {});

        const msg = {
            type: 'audio-data',
            frequency: Array.from(dataArray),
            timeDomain: Array.from(timeDataArray),
            volume: volume / 255,
            bass: avgBass / 255,
            track: currentTrack,
            colors: {
                accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e11d48',
                gradient1: getComputedStyle(document.documentElement).getPropertyValue('--immersive-gradient-1').trim() || '#f43f5e',
                gradient2: getComputedStyle(document.documentElement).getPropertyValue('--immersive-gradient-2').trim() || '#f43f5e'
            }
        };

        iframe.contentWindow.postMessage(msg, '*');
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
