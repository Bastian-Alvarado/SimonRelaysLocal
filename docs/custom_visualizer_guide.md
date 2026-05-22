# Developer Guide: Building Custom Audio Visualizers

This guide details the architectural requirements, data schemas, best practices, and common pitfalls for building custom audio visualizers designed to run within the sandboxed iframe visualizer engine of the audio player.

---

## 1. Architecture Overview

Custom visualizers are fully self-contained HTML files uploaded by the user. 
To prevent security leaks, the parent application compiles these files into standard Object URLs (`blob:http://localhost:...`) and mounts them inside a restricted `<iframe>` with strict sandboxing:

```html
<iframe sandbox="allow-scripts" src="blob:..."></iframe>
```

### The Communication Bridge
Because the iframe is fully sandboxed, it has no direct access to parent APIs, DOM nodes, or audio buffers. Instead, the parent app communicates real-time audio analysis and track metadata by posting JSON payloads to the iframe at **60 FPS** using the `window.postMessage` API.

---

## 2. Dynamic Real-Time Data Schema

Your visualizer must register an event listener for `message` events. The payload received is structured as follows:

```javascript
window.addEventListener('message', (e) => {
    // SECURITY: Always verify payload structure
    if (!e.data || e.data.type !== 'audio-data') return;

    const {
        frequency,    // Array(128) - FFT byte frequency data (values 0-255)
        timeDomain,   // Array(128) - Time-domain waveform data (values 0-255)
        volume,       // Number     - Normalized overall amplitude (0.0 to 1.0)
        bass,         // Number     - Normalized sub-bass frequency average (0.0 to 1.0)
        track,        // Object     - Currently playing track metadata
        lyrics,       // Array      - Sync-parsed lyrics array [{time: sec, text: ""}, ...]
        activeLyricIndex // Number  - Array index of currently active lyric line (-1 if none)
    } = e.data;
    
    // ... update visualizer state ...
});
```

### Track Metadata Schema
```json
{
  "filename": "song.mp3",
  "relativePath": "/Music/song.mp3",
  "url": "http://localhost:3000/audio/...",
  "metadata": {
    "title": "Slow Dancing in the Dark",
    "artist": "Joji",
    "album": "BALLADS 1",
    "genre": ["R&B"],
    "duration": 209.0,
    "hasCover": true
  }
}
```

---

## 3. DO's — Best Practices for Visualizer Design

### ✅ DO: Use Responsive Coordinates & Scale
Never use hardcoded pixel values (e.g., `y = 70` or `y = 800`) to position key textual or structural elements. Visualizer frames are scaled by parent wrappers and can be displayed on screens ranging from standard 1080p monitors to 4K widescreen displays:
* Use proportions of the canvas boundaries: `const topY = Math.floor(canvas.height * 0.12);`
* Position elements dynamically relative to the center or edges: `const cy = canvas.height * 0.48;`

### ✅ DO: Enforce High Contrast Against Dark Backdrops
Visualizer backdrops are generally dark, saturated, or highly energetic. 
* Use **white-hot core colors** (e.g., `rgb(255, 252, 245)`) for critical reading text (track titles, active lyrics).
* Pair white text with intense glowing drop shadows:
  ```javascript
  ctx.shadowColor = 'rgba(255, 50, 0, 0.9)';
  ctx.shadowBlur = 10 + bass * 15; // Pulse glow radius with the music's bass
  ```
* Fade passive elements (past/future lyrics) into dim warm colors (amber, crimson, or grey) to direct visual focus to the active line.

### ✅ DO: Protect Canvas Context State (Save / Restore)
If drawing multiple independent components (e.g. background layers, particles, text overlays, floating hands), **always** wrap transformation-heavy or aesthetic-heavy drawing sections in `save()` and `restore()` calls:
```javascript
ctx.save();
ctx.translate(x, y);
ctx.rotate(angle);
// Draw component
ctx.restore(); // Restores original scale, translation, fillStyle, and shadow settings
```

### ✅ DO: Implement Robust Error Handling in Render Loop
Wrap the main rendering frame step inside a `try/catch` block. A single uncaught exception inside a `requestAnimationFrame` callback will halt the entire render loop permanently, freezing the visualizer:
```javascript
function render() {
    try {
        const time = performance.now();
        // Drawing code...
    } catch (err) {
        console.error('[Visualizer Render Error]', err.message);
    }
    requestAnimationFrame(render);
}
```

---

## 4. DON'Ts — Pitfalls to Avoid

### ❌ DON'T: Rely on ES6 Block Scope for Global IFrame Variables
When defining global modules, helpers, or visualizer variables, remember that ES6 browser semantics treat top-level block-scoped variables (`const`/`let`) differently than `var`. They do **not** bind to the global `window` object:
* **Anti-Pattern:** `const Lyrics = (function() { ... })();` inside an external file will remain invisible to your main script because `window.Lyrics` resolves to `undefined`.
* **Correct:** Explicitly bind to the window object:
  ```javascript
  const Lyrics = (function() { ... })();
  window.Lyrics = Lyrics; // Expose globally
  ```

### ❌ DON'T: Overwrite Loaded Metadata with Empty Updates
Metadata parsing in the parent application can resolve asynchronously after a track starts playing. When the track changes, early messages may carry empty strings or default properties:
* **Anti-Pattern:** Overwriting a valid track title with an empty string when an intermediate update message arrives without a metadata payload.
* **Correct:** Only update title/artist states if they are truthy:
  ```javascript
  if (e.data.track) {
      const md = e.data.track.metadata || e.data.track;
      if (md.title) trackTitle = md.title;
      if (md.artist) trackArtist = md.artist;
  }
  ```

### ❌ DON'T: Mutate Shared Canvas Properties Without Restoration
Modifying global properties of the 2D Context (like `ctx.globalCompositeOperation`, `ctx.globalAlpha`, or `ctx.fillStyle`) without resetting them will corrupt all subsequent draw commands (e.g. making all following text draw with `0` opacity or black background blending).

---

## 5. Quick-Start Custom Visualizer Boilerplate

Below is a complete, minimal, production-ready template that you can copy to build a new custom visualizer. It handles resize, real-time message binding, and robust canvas context management:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Custom Visualizer Boilerplate</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: #0b0b0f; }
        canvas { display: block; width: 100%; height: 100%; }
    </style>
</head>
<body>
<canvas id="visualizer-canvas"></canvas>
<script>
    const canvas = document.getElementById('visualizer-canvas');
    const ctx = canvas.getContext('2d');

    // --- Visualizer State ---
    let frequency = new Array(128).fill(0);
    let volume = 0;
    let bass = 0;
    let trackTitle = '';
    let trackArtist = '';
    let lyrics = [];
    let activeLyricIndex = -1;

    // --- Resize Canvas ---
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    // --- Message Receiver ---
    window.addEventListener('message', (e) => {
        if (!e.data || e.data.type !== 'audio-data') return;

        frequency = e.data.frequency || frequency;
        volume = e.data.volume || 0;
        bass = e.data.bass || 0;

        if (e.data.track) {
            const md = e.data.track.metadata || e.data.track;
            if (md.title) trackTitle = md.title;
            if (md.artist) trackArtist = md.artist;
        }

        if (e.data.lyrics) lyrics = e.data.lyrics;
        if (typeof e.data.activeLyricIndex === 'number') {
            activeLyricIndex = e.data.activeLyricIndex;
        }
    });

    // --- Main Loop ---
    function render() {
        try {
            const w = canvas.width;
            const h = canvas.height;
            const time = performance.now();

            // 1. Clear background
            ctx.fillStyle = '#0b0b0f';
            ctx.fillRect(0, 0, w, h);

            // 2. Draw reactive elements (Example: Pulsing center ring)
            ctx.save();
            ctx.beginPath();
            ctx.arc(w / 2, h / 2, 100 + bass * 50, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 60, 0, ${0.4 + volume * 0.6})`;
            ctx.lineWidth = 4;
            ctx.shadowColor = '#ff3c00';
            ctx.shadowBlur = 15;
            ctx.stroke();
            ctx.restore();

            // 3. Draw Track Metadata (Dynamic centering & scaling)
            if (trackTitle || trackArtist) {
                ctx.save();
                const topY = Math.floor(h * 0.12);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // Title
                ctx.shadowColor = 'rgba(255, 60, 0, 0.9)';
                ctx.shadowBlur = 10 + bass * 10;
                ctx.font = 'bold 24px sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(trackTitle.toUpperCase(), w / 2, topY);

                // Artist
                ctx.shadowBlur = 6;
                ctx.font = '600 15px sans-serif';
                ctx.fillStyle = 'rgba(255, 200, 150, 0.9)';
                ctx.fillText(trackArtist.toUpperCase(), w / 2, topY + 30);
                ctx.restore();
            }

            // 4. Draw Active Sync Lyric
            if (lyrics.length > 0 && activeLyricIndex >= 0) {
                const activeLine = lyrics[activeLyricIndex];
                if (activeLine && activeLine.text) {
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 20px sans-serif';
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = 'rgba(255, 40, 0, 0.9)';
                    ctx.shadowBlur = 8 + bass * 12;
                    ctx.fillText(activeLine.text.toUpperCase(), w / 2, h * 0.48);
                    ctx.restore();
                }
            }

        } catch (err) {
            console.error('[Render Error]', err.message);
        }

        requestAnimationFrame(render);
    }

    render();
</script>
</body>
</html>
```
