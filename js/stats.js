/**
 * Stats Module
 * Handles library metrics and statistics rendering
 */

const Stats = (function() {
    let config = {
        serverBaseUrl: '',
        containerId: 'stats-content'
    };

    return {
        init: function(options) {
            config = { ...config, ...options };
        },

        render: async function() {
            const statsContent = document.getElementById(config.containerId);
            if (!statsContent) return;

            statsContent.innerHTML = '<div class="loading">Loading library metrics...</div>';

            try {
                // Use the passed serverBaseUrl or fallback
                const baseUrl = config.serverBaseUrl || (typeof API !== 'undefined' ? API.getBaseUrl() : '');
                const res = await fetch(`${baseUrl}/api/stats`);
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                
                const stats = await res.json();

                statsContent.innerHTML = `
                    <div class="stats-card">
                        <div class="stats-value">${stats.totalTracks.toLocaleString()}</div>
                        <div class="stats-label">Total Tracks</div>
                    </div>
                    <div class="stats-card">
                        <div class="stats-value">${stats.totalAlbums.toLocaleString()}</div>
                        <div class="stats-label">Albums</div>
                    </div>
                    <div class="stats-card">
                        <div class="stats-value">${stats.totalArtists.toLocaleString()}</div>
                        <div class="stats-label">Artists</div>
                    </div>
                    <div class="stats-card">
                        <div class="stats-value">${stats.totalDurationFormatted}</div>
                        <div class="stats-label">Playtime</div>
                    </div>
                    <div class="stats-card">
                        <div class="stats-value">${stats.losslessCount.toLocaleString()}</div>
                        <div class="stats-label">Lossless Tracks</div>
                    </div>
                    <div class="stats-card">
                        <div class="stats-value">${stats.hiResCount.toLocaleString()}</div>
                        <div class="stats-label">Hi-Res Tracks</div>
                    </div>
                `;

                // Add format breakdown if available
                if (stats.formats) {
                    const formatList = Object.entries(stats.formats)
                        .sort((a, b) => b[1] - a[1])
                        .map(([fmt, count]) => `
                            <li style="display: flex; justify-content: space-between;">
                                <span>${fmt}</span> 
                                <span style="color: var(--accent); font-weight: 700;">${count}</span>
                            </li>`)
                        .join('');

                    const formatCard = document.createElement('div');
                    formatCard.className = 'stats-card';
                    formatCard.innerHTML = `
                        <div class="stats-label">Format Breakdown</div>
                        <ul style="list-style: none; padding: 0; margin-top: 16px; opacity: 0.8; font-size: 14px; display: flex; flex-direction: column; gap: 8px;">
                            ${formatList}
                        </ul>
                    `;
                    statsContent.appendChild(formatCard);
                }

            } catch (e) {
                console.error('[Stats] Render failed:', e);
                statsContent.innerHTML = `<div class="error">Failed to load statistics: ${e.message}</div>`;
            }
        }
    };
})();
