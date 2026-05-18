/**
 * SimonRelays UI Module
 * Handles HTML templating and DOM component creation.
 */

const Templates = (() => {
    return {
        TrackItem(track, index, options = {}) {
            const { 
                isPlaylistView, canEdit, isQueueView, showTrackNumbers, 
                isDownloaded, isDownloading, downloadProgress, isLiked, 
                currentUser, isUnsupported, isTrackActive, getSharedCoverUrl,
                getQualityLabel, splitArtists 
            } = options;

            const title = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
            const artist = (track.metadata && track.metadata.artist) ? track.metadata.artist : 'Unknown Artist';

            const dragHandleHtml = (isPlaylistView && canEdit) ? `
                <div class="drag-handle" draggable="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4h2v2H9zm4 0h2v2h-2zm-4 7h2v2H9zm4 0h2v2h-2zm-4 7h2v2H9zm4 0h2v2h-2z"/></svg>
                </div>` : '';

            let actionBtnHtml = `
                <button class="add-to-playlist-btn" title="Add to playlist">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>`;

            if (isPlaylistView && canEdit) {
                actionBtnHtml += `
                    <button class="remove-from-playlist-btn" title="Remove from playlist">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>`;
            } else if (isQueueView) {
                actionBtnHtml += `
                    <button class="remove-from-queue-btn" title="Remove from queue">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>`;
            }

            let indicatorClass = '';
            let indicatorTitle = '';
            if (isDownloading) {
                indicatorClass = 'downloading';
                indicatorTitle = `Downloading... ${Math.round(downloadProgress * 100)}%`;
            } else if (isDownloaded) {
                indicatorClass = 'downloaded';
                indicatorTitle = 'Available Offline (Click to remove)';
            } else {
                indicatorTitle = 'Download for Offline';
            }

            const offlineIconHtml = `
                <button class="icon-button offline-status-circle track-offline-btn ${indicatorClass}" 
                        data-track-url="${track.url}"
                        data-is-local="${track.isLocal ? 'true' : 'false'}"
                        data-is-both="${track.isBoth ? 'true' : 'false'}"
                        style="--progress: ${isDownloading ? Math.round(downloadProgress * 100) : (isDownloaded || track.isLocal || track.isBoth ? 100 : 0)}%"
                        title="${indicatorTitle}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path class="check-path" d="M8 12.5l3 3 5-6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>`;

            let coverHtml = '';
            if (track.metadata && track.metadata.hasCover) {
                const pictureUrl = getSharedCoverUrl(track.relativePath, track.metadata.artist, track.metadata.album);
                coverHtml = `<div class="track-item-cover"><img src="${pictureUrl}" alt="cover"></div>`;
            } else {
                coverHtml = `<div class="track-item-cover"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg></div>`;
            }

            let trackNumberHtml = '';
            if (showTrackNumbers) {
                const trackNo = (track.metadata && track.metadata.track && track.metadata.track.no) ? track.metadata.track.no : (index + 1);
                trackNumberHtml = `<div class="track-index">${trackNo}</div>`;
            }

            const qualityLabel = getQualityLabel(track);
            const qualityTagHtml = qualityLabel ? `<div class="quality-tag ${qualityLabel.toLowerCase().replace('-', '')}">${qualityLabel}</div>` : '';

            const likeBtnHtml = currentUser ? `
                <button class="icon-button track-like-btn ${isLiked ? 'active' : ''}" title="${isLiked ? 'Unlike' : 'Like'}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="${isLiked ? 'var(--accent)' : 'none'}" stroke="${isLiked ? 'var(--accent)' : 'currentColor'}" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>` : '';

            return `
                ${trackNumberHtml}
                ${dragHandleHtml}
                ${coverHtml}
                <div class="track-item-info">
                    <div class="track-item-title">${title}</div>
                    <div class="track-item-artist">${splitArtists(artist).map(a => `<span class="artist-link" data-artist="${a}" style="cursor: pointer;">${a}</span>`).join('<span style="opacity:0.5">, </span>')}</div>
                </div>
                <div class="track-item-actions">
                    ${isUnsupported ? `
                    <div class="unsupported-alert" title="This format (e.g. ALAC) is not natively supported by your browser">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    </div>` : ''}
                    ${qualityTagHtml}
                    ${likeBtnHtml}
                    ${isUnsupported ? '' : offlineIconHtml}
                    ${actionBtnHtml}
                    <button class="icon-button track-item-more-btn" title="More">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
                    </button>
                </div>
            `;
        },

        AlbumHero(albumInfo, options = {}) {
            const { coverHtml, yearStr, songCountStr, durationStr, genresHtml, splitArtists } = options;
            return `
                ${coverHtml}
                <div class="album-hero-info">
                    <div class="album-hero-label">Album</div>
                    <div class="album-hero-title" title="${albumInfo.name}">${albumInfo.name}</div>
                    <div class="album-hero-meta" style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                        <div class="artist-avatar album-hero-artist-avatar" style="display: inline-block; vertical-align: middle;"></div>
                        <div class="album-hero-artists" style="display: inline-block;">
                            ${splitArtists(albumInfo.artist).map(a => `<strong class="artist-link" data-artist="${a}" style="cursor: pointer;">${a}</strong>`).join('<span style="opacity:0.5">, </span>')}
                        </div>
                        <span style="opacity: 0.7;">\u2022 ${yearStr} \u2022 ${songCountStr}${durationStr}</span>
                        ${genresHtml}
                    </div>
                </div>
            `;
        },

        AlbumHeroActions(isAlbumOffline, isAlbumDownloading) {
            return `
                <button class="icon-button play-btn album-play-btn" title="Play All" style="width: 56px; height: 56px; box-shadow: 0 8px 16px rgba(0,0,0,0.4);">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
                </button>
                <button class="secondary-action-btn download-album-btn ${isAlbumOffline ? 'active' : ''}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${isAlbumOffline ? '<polyline points="20 6 9 17 4 12"></polyline>' : '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>'}
                    </svg>
                    <span>${isAlbumOffline ? 'Downloaded' : (isAlbumDownloading ? 'Downloading...' : 'Download Album')}</span>
                </button>
                <button class="secondary-action-btn edit-album-btn" title="Edit Album Info">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    <span>Edit Info</span>
                </button>
                <button class="secondary-action-btn check-metadata-btn" title="Check Metadata Health">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    <span>Check Metadata</span>
                </button>
            `;
        },

        AlbumCard(albumInfo, options = {}) {
            const { artHtml, splitArtists, cardPlayBtnHtml } = options;
            return `
                <div class="card-art-wrapper">
                    ${artHtml}
                    ${cardPlayBtnHtml}
                </div>
                <div class="album-card-title">${albumInfo.name}</div>
                <div class="album-card-artist">${splitArtists(albumInfo.artist).map(a => `<span class="artist-link" data-artist="${a}">${a}</span>`).join('<span style="opacity:0.5">, </span>')}</div>
            `;
        },

        SettingsPanel(data) {
            const { 
                Theme, Animations, Playback, currentCustomUrl, DEFAULT_SERVER_URL 
            } = data;
            
            return `
                <div class="settings-section" data-category="appearance">
                    <div class="settings-section-title">Themes</div>
                    <div class="settings-themes-grid">
                        <div class="theme-card ${Theme.getProfile() === 'simon_default' ? 'active' : ''}" data-theme="simon_default">
                            <div class="theme-preview" style="background: #f43f5e;"><span>Classic</span></div>
                            <div class="theme-info"><h4>Simon Default</h4><p>The signature aesthetic with fixed rose-red accents.</p></div>
                        </div>
                        <div class="theme-card ${Theme.getProfile() === 'rgb' ? 'active' : ''}" data-theme="rgb">
                            <div class="theme-preview" style="background: linear-gradient(45deg, #ff0000, #00ff00, #0000ff);"><span>RGB</span></div>
                            <div class="theme-info"><h4>Dynamic Engine</h4><p>Reactive lighting that shifts with your music.</p></div>
                        </div>
                        <div class="theme-card ${Theme.getProfile() === 'custom' ? 'active' : ''}" data-theme="custom">
                            <div class="theme-preview custom-preview" style="background: ${localStorage.getItem('customAccentColor') || '#f43f5e'}; position: relative;">
                                <span>Custom</span>
                                <input type="color" id="custom-theme-picker" value="${localStorage.getItem('customAccentColor') || '#f43f5e'}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                            </div>
                            <div class="theme-info"><h4>Personalized</h4><p>Manually select your favorite accent color.</p></div>
                        </div>
                    </div>
                </div>

                <div class="settings-section" data-category="appearance">
                    <div class="settings-section-title">Interface</div>
                    <div class="settings-row" style="flex-direction: row; justify-content: space-between; align-items: center;">
                        <div class="settings-row-info">
                            <div class="settings-row-label">Show App Icon</div>
                            <div class="settings-row-sub">Display the SimonRelays logo icon in the top header.</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="setting-app-icon-toggle" ${localStorage.getItem('hideAppIcon') === 'true' ? '' : 'checked'}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="settings-row">
                        <div class="settings-row-info">
                            <div class="settings-row-label">UI Scaling</div>
                            <div class="settings-row-sub">Adjust the size of the interface. Current: <span id="setting-zoom-value" style="color:var(--accent); font-weight:600;">${localStorage.getItem('zoomLevel') || '100'}%</span></div>
                        </div>
                        <div class="settings-input-group zoom-slider-group">
                            <span class="zoom-min-label">50%</span>
                            <input id="setting-zoom-slider" type="range" min="50" max="150" step="5" value="${localStorage.getItem('zoomLevel') || '100'}" class="settings-range-input">
                            <span class="zoom-max-label">150%</span>
                        </div>
                    </div>
                    <div class="settings-row" style="flex-direction: row; justify-content: space-between; align-items: center;">
                        <div class="settings-row-info">
                            <div class="settings-row-label">Enable Animations</div>
                            <div class="settings-row-sub">Smooth transitions and staggered entries. Disable for better performance on slower devices.</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="setting-animations-toggle" ${Animations.isEnabled() ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>

                <div class="settings-section" data-category="audio">
                    <div class="settings-section-title">Audio Quality</div>
                    <div class="settings-row" style="flex-direction: row; flex-wrap: wrap; gap: 24px;">
                        <div style="flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 12px;">
                            <div class="settings-row-info">
                                <div class="settings-row-label">Stream Quality</div>
                                <div class="settings-row-sub">Used when playing over the network.</div>
                            </div>
                            <div class="settings-input-group">
                                <div style="position: relative;">
                                    <input type="text" id="setting-stream-quality" class="settings-text-input" readonly style="width: 100%; cursor: pointer; background-color: #1a1a20; color: white;">
                                    <div id="setting-stream-quality-dropdown" style="position: absolute; top: 100%; left: 0; right: 0; background: #1a1a20; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; margin-top: 4px; max-height: 200px; overflow-y: auto; z-index: 1000; display: none; box-shadow: 0 4px 12px rgba(0,0,0,0.5);"></div>
                                </div>
                            </div>
                        </div>
                        <div style="flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 12px;">
                            <div class="settings-row-info">
                                <div class="settings-row-label">Download Quality</div>
                                <div class="settings-row-sub">Used when saving for offline play.</div>
                            </div>
                            <div class="settings-input-group">
                                <div style="position: relative;">
                                    <input type="text" id="setting-download-quality" class="settings-text-input" readonly style="width: 100%; cursor: pointer; background-color: #1a1a20; color: white;">
                                    <div id="setting-download-quality-dropdown" style="position: absolute; top: 100%; left: 0; right: 0; background: #1a1a20; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; margin-top: 4px; max-height: 200px; overflow-y: auto; z-index: 1000; display: none; box-shadow: 0 4px 12px rgba(0,0,0,0.5);"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="settings-section" data-category="network">
                    <div class="settings-section-title">Network</div>
                    <div class="settings-row">
                        <div class="settings-row-info">
                            <div class="settings-row-label">Backend Server Address</div>
                            <div class="settings-row-sub">Override the default address (${DEFAULT_SERVER_URL}). Useful for connecting via Tailscale or a remote machine.</div>
                        </div>
                        <div class="settings-input-group">
                            <input id="server-url-input" class="settings-text-input" type="text" placeholder="${DEFAULT_SERVER_URL}" value="${currentCustomUrl}" spellcheck="false" autocomplete="off">
                            <button id="server-url-save-btn" class="settings-save-btn">Save & Restart</button>
                            ${currentCustomUrl ? `<button id="server-url-reset-btn" class="settings-reset-btn">Reset to Default</button>` : ''}
                        </div>
                        ${currentCustomUrl ? `<div class="settings-active-url">Currently using: <span>${currentCustomUrl}</span></div>` : `<div class="settings-active-url">Currently using: <span>${DEFAULT_SERVER_URL} (default)</span></div>`}
                    </div>
                </div>

                <div class="settings-section" data-category="cloud">
                    <div class="settings-section-title">Cloud Library</div>
                    <div class="settings-row">
                        <div class="settings-row-info">
                            <div class="settings-row-label">Upload to Server</div>
                            <div class="settings-row-sub">Upload local MP3 files to your server so they are available on all your devices.</div>
                        </div>
                        <div class="settings-input-group">
                            <input type="file" id="cloud-upload-input" multiple accept="audio/*" style="display: none;">
                            <button id="cloud-upload-btn" class="settings-save-btn">Select Files</button>
                        </div>
                        <div id="cloud-upload-status" class="local-path-status">${data.uploadState?.statusText || ''}</div>
                        
                        <div id="cloud-upload-progress-container" class="upload-progress-container ${data.uploadState?.isUploading ? '' : 'hidden'}">
                            <div class="upload-progress-row">
                                <span class="upload-progress-label">Overall Progress</span>
                                <span id="upload-overall-text">${data.uploadState?.isUploading ? `${data.uploadState.successCount + data.uploadState.errorCount}/${data.uploadState.totalFiles} files` : '0/0 files'}</span>
                            </div>
                            <div class="upload-progress-bar-bg">
                                <div id="upload-overall-fill" class="upload-progress-bar-fill" style="width: ${data.uploadState?.overallPercent || 0}%;"></div>
                            </div>
                            
                            <div class="upload-progress-row" style="margin-top: 4px;">
                                <span class="upload-progress-label">Current File</span>
                                <span id="upload-current-text">${data.uploadState?.currentFilePercent || 0}%</span>
                            </div>
                            <div class="upload-progress-bar-bg">
                                <div id="upload-current-fill" class="upload-progress-bar-fill current" style="width: ${data.uploadState?.currentFilePercent || 0}%;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-row-info">
                            <div class="settings-row-label">Transcode Double Check</div>
                            <div class="settings-row-sub">Scan for lossless tracks and ensure all MP3 qualities are ready for mobile streaming.</div>
                        </div>
                        <div class="settings-input-group">
                            <button id="trigger-transcoder-btn" class="settings-save-btn">Start Scan</button>
                        </div>
                        <div id="transcoder-status" class="local-path-status"></div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-row-info">
                            <div class="settings-row-label">Refresh Music Library</div>
                            <div class="settings-row-sub">Scan the server's audio directory for newly added or modified music files.</div>
                        </div>
                        <div class="settings-input-group">
                            <button id="refresh-library-btn" class="settings-save-btn">Scan for New Songs</button>
                        </div>
                        <div id="refresh-library-status" class="local-path-status"></div>
                    </div>
                </div>


                <div class="settings-section" data-category="audio">
                    <div class="settings-section-title">Playback</div>
                    <div class="settings-row" style="flex-direction: row; justify-content: space-between; align-items: center;">
                        <div class="settings-row-info">
                            <div class="settings-row-label">Enable Crossfade</div>
                            <div class="settings-row-sub">Overlap songs for a seamless gapless transition.</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="setting-crossfade-toggle" ${Playback.isCrossfadeEnabled ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div id="crossfade-duration-row" class="settings-row" style="${Playback.isCrossfadeEnabled ? '' : 'opacity: 0.5; pointer-events: none;'}">
                        <div class="settings-row-info">
                            <div class="settings-row-label">Crossfade Duration</div>
                            <div class="settings-row-sub">Overlap time. Current: <span id="setting-crossfade-value" style="color:var(--accent); font-weight:600;">${Playback.crossfadeDuration / 1000}s</span></div>
                        </div>
                        <div class="settings-input-group zoom-slider-group">
                            <span class="zoom-min-label">0s</span>
                            <input id="setting-crossfade-duration" type="range" min="0" max="12" step="1" value="${Playback.crossfadeDuration / 1000}" class="settings-range-input">
                            <span class="zoom-max-label">12s</span>
                        </div>
                    </div>
                </div>

                <div class="settings-section" data-category="account">
                    <div class="settings-section-title">Account</div>
                    <div class="settings-row">
                        <div class="settings-profile-info" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <div class="settings-row-info">
                                <div class="settings-row-label">Current Session</div>
                                <div class="settings-row-sub">You are currently using the local library.</div>
                            </div>
                            <button id="signout-btn" class="settings-reset-btn">Sign Out</button>
                        </div>
                    </div>
                </div>

                <div id="settings-no-results" style="display: none; text-align: center; padding: 40px; color: var(--text-secondary);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px; opacity: 0.2;">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <div style="font-weight: 700; color: white; margin-bottom: 4px;">No settings found</div>
                    <div style="font-size: 13px;">Try a different search term</div>
                </div>
            `;
        },

        ProfilePanel(data) {
            const { currentUser, photoURL, displayName, email } = data;
            return `
                <div class="settings-section" style="max-width: 800px;">
                    <div class="settings-section-title" style="font-size: 20px; color: var(--accent); margin-bottom: 24px;">Account & Sync</div>
                    <div class="settings-row" style="cursor: default; background: rgba(255,255,255,0.03); padding: 32px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                        ${currentUser ? `
                            <div class="settings-profile-info" style="display: flex; align-items: center; gap: 24px; width: 100%;">
                                <div style="position: relative; width: 80px; height: 80px; flex-shrink: 0;">
                                    <img src="${photoURL || 'icon.svg'}" alt="" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 3px solid var(--accent); background: #1a1a20;">
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div class="settings-row-label" style="margin: 0 0 4px 0; font-size: 24px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayName || 'User'}</div>
                                    <div class="settings-row-sub" style="font-size: 16px; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${email}</div>
                                </div>
                                <button id="profile-signout-btn" class="settings-reset-btn" style="padding: 12px 24px; font-weight: 600;">Sign Out</button>
                            </div>
                        ` : `
                            <div style="display: flex; flex-direction: column; gap: 16px; width: 100%;">
                                <div class="settings-row-sub" style="font-size: 15px;">Connect to Firebase to enable cross-device sync, cloud playlists, and remote control.</div>
                                <button id="profile-login-btn" class="settings-save-btn" style="align-self: flex-start; padding: 14px 28px;">Connect Cloud</button>
                            </div>
                        `}
                    </div>
                </div>
                ${currentUser ? `
                    <div class="settings-section" style="max-width: 800px; margin-top: 40px;">
                        <div class="settings-section-title" style="font-size: 20px; color: var(--accent); margin-bottom: 24px;">Edit Profile</div>
                        <div class="profile-edit-container" style="display: flex; flex-direction: column; gap: 32px; width: 100%; background: rgba(255,255,255,0.03); padding: 32px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                            <div style="display: flex; align-items: center; gap: 32px; width: 100%;">
                                 <div class="profile-pic-editor" id="profile-pic-trigger" style="position: relative; width: 120px; height: 120px; cursor: pointer; flex-shrink: 0;">
                                    <img id="profile-pic-preview" src="${photoURL || 'icon.svg'}" alt="" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 4px solid var(--accent); background: #1a1a20;">
                                    <div class="edit-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;">
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                    </div>
                                 </div>
                                 <div style="flex: 1; min-width: 0;">
                                    <div class="settings-row-label" style="margin-bottom: 12px; font-weight: 700;">Nickname</div>
                                    <input id="profile-nickname-input" class="settings-text-input" type="text" value="${displayName || ''}" placeholder="Choose a nickname..." style="width: 100%; margin: 0; padding: 14px 20px; font-size: 16px;">
                                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 12px; opacity: 0.5;">Email: ${email}</div>
                                 </div>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                                <div id="profile-status" style="font-size: 14px; font-weight: 500;"></div>
                                <button id="profile-save-btn" class="settings-save-btn" style="padding: 14px 32px; font-weight: 700;">Update Profile</button>
                            </div>
                        </div>
                    </div>
                ` : ''}
            `;
        },

        SearchResultRow(data) {
            const { type, name, subtext, coverHtml, avatarHtml } = data;
            
            let mediaHtml = '';
            // If it's an artist, we always want the avatar container (circle)
            if (type === 'Artist' || avatarHtml !== undefined) {
                mediaHtml = `<div class="artist-card-art search-row-avatar">${avatarHtml || ''}</div>`;
            } else {
                // For playlists and albums, we use the cover container (rounded square)
                mediaHtml = `<div class="search-row-cover">${coverHtml || ''}</div>`;
            }
            
            return `
                ${mediaHtml}
                <div class="search-row-info">
                    <div class="search-row-name">${name || ''}</div>
                    <div class="search-row-type">${subtext || type || ''}</div>
                </div>
                <svg class="search-row-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            `;
        },

        AddToPlaylistDropdownItem(data) {
            const { icon, label, className = '' } = data;
            return `
                <div class="dropdown-item ${className}">
                    ${icon} ${label}
                </div>
            `;
        },

        ImmersiveUpNext(data) {
            const { nextTrack, nextArtUrl } = data;
            const title = nextTrack.metadata?.title || nextTrack.filename;
            const artist = nextTrack.metadata?.artist || 'Unknown Artist';
            
            return `
                <div class="immersive-up-next-label">Up Next</div>
                <div class="immersive-up-next-row">
                    <img id="immersive-up-next-art" class="immersive-up-next-art" src="${nextArtUrl || 'icon.svg'}" alt="">
                    <div class="immersive-up-next-info">
                        <div id="immersive-up-next-title" class="immersive-up-next-title">${title}</div>
                        <div id="immersive-up-next-artist" class="immersive-up-next-artist">${artist}</div>
                    </div>
                </div>
            `;
        },

        ContextMenu() {
            return `
                <button id="menu-edit-btn" class="menu-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Edit Info
                </button>
                <button id="menu-playlist-btn" class="menu-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Add to Playlist
                </button>
                <button id="menu-remove-playlist-btn" class="menu-item hidden">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    Remove from Playlist
                </button>
                <div class="menu-divider"></div>
                <button id="menu-go-artist-btn" class="menu-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Go to Artist
                </button>
                <button id="menu-go-album-btn" class="menu-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                        <line x1="7" y1="2" x2="7" y2="22"></line>
                        <line x1="17" y1="2" x2="17" y2="22"></line>
                        <line x1="2" y1="12" x2="22" y2="12"></line>
                        <line x1="2" y1="7" x2="7" y2="7"></line>
                        <line x1="2" y1="17" x2="7" y2="17"></line>
                        <line x1="17" y1="17" x2="22" y2="17"></line>
                        <line x1="17" y1="7" x2="22" y2="7"></line>
                    </svg>
                    Go to Album
                </button>
            `;
        },

        EditMetadataModal(track) {
            const title = (track.metadata && track.metadata.title) ? track.metadata.title : track.filename;
            const artist = (track.metadata && track.metadata.artist) ? track.metadata.artist : '';
            const album = (track.metadata && track.metadata.album) ? track.metadata.album : '';
            const year = (track.metadata && track.metadata.year) ? track.metadata.year : '';
            const genre = (track.metadata && track.metadata.genre)
                ? (Array.isArray(track.metadata.genre) ? track.metadata.genre.join(', ') : track.metadata.genre)
                : '';

            return `
                <div class="modal-content glass-panel metadata-modal" style="overflow: visible;">
                    <h2 id="metadata-modal-title" class="modal-title">Edit Song Info</h2>
                    <div class="metadata-editor-layout">
                        <div class="metadata-editor-left">
                            <div id="metadata-art-dropzone" class="metadata-art-dropzone">
                                <img id="metadata-art-preview" src="" alt="" style="display: none;">
                                <div class="dropzone-overlay">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="17 8 12 3 7 8"></polyline>
                                        <line x1="12" y1="3" x2="12" y2="15"></line>
                                    </svg>
                                    <span>Change Cover</span>
                                </div>
                                <input type="file" id="metadata-art-input" hidden accept="image/*">
                            </div>
                            <button id="metadata-restore-btn" class="modal-btn ghost-btn restore-btn hidden" title="Restore from backup">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 2v6h6"></path>
                                    <path d="M3 13a9 9 0 1 0 3-7.7L3 8"></path>
                                </svg>
                                Restore Original
                            </button>
                        </div>
                        <div class="metadata-editor-right">
                            <div class="input-group">
                                <label>Title</label>
                                <input type="text" id="metadata-title-input" placeholder="Title" value="${title}">
                            </div>
                            <div class="input-group">
                                <label>Artist</label>
                                <input type="text" id="metadata-artist-input" placeholder="Artist" value="${artist}">
                            </div>
                            <div class="input-group">
                                <label>Album</label>
                                <input type="text" id="metadata-album-input" placeholder="Album" value="${album}">
                            </div>
                            <div class="input-group">
                                <label>Year</label>
                                <input type="number" id="metadata-year-input" placeholder="Year" value="${year}">
                            </div>
                            <div class="input-group" style="position: relative;">
                                <label>Genre</label>
                                <input type="text" id="metadata-genre-input" placeholder="Search or select genre" autocomplete="off" style="width: 100%; background-color: #212128; color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 12px 16px; font-family: 'Outfit', sans-serif; font-size: 14px; outline: none;" value="${genre}">
                                <div id="metadata-genre-dropdown" style="position: absolute; top: 100%; left: 0; right: 0; background: #212128; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; margin-top: 4px; max-height: 200px; overflow-y: auto; z-index: 1000; display: none; box-shadow: 0 4px 12px rgba(0,0,0,0.5);"></div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button id="metadata-cancel-btn" class="modal-btn ghost-btn">Cancel</button>
                        <button id="metadata-save-btn" class="modal-btn primary-btn">Save Changes</button>
                    </div>
                </div>
            `;
        },

        CreatePlaylistModal() {
            return `
                <div class="modal-content glass-panel">
                    <h2 class="modal-title">New Playlist</h2>
                    <input id="playlist-name-input" class="playlist-name-input" type="text" placeholder="Give it a name..." maxlength="60">
                    <div class="modal-actions">
                        <button id="create-playlist-cancel-btn" class="modal-btn ghost-btn">Cancel</button>
                        <button id="create-playlist-confirm-btn" class="modal-btn primary-btn">Create</button>
                    </div>
                </div>
            `;
        },

        CheckMetadataModal() {
            return `
                <div class="modal-content glass-panel" style="max-width: 450px; padding: 32px;">
                    <h2 class="modal-title" style="margin-bottom: 8px;">Check Metadata</h2>
                    <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 24px;">Automatically scan and correct track metadata using external databases.</p>

                    <div class="check-options" style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px;">
                        <label class="check-option" style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                            <input type="checkbox" id="check-cover-art" checked style="width: 20px; height: 20px; accent-color: var(--accent);">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; font-size: 15px;">Cover Art</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">Update to high-resolution official covers</div>
                            </div>
                        </label>
                        <label class="check-option" style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                            <input type="checkbox" id="check-artists" checked style="width: 20px; height: 20px; accent-color: var(--accent);">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; font-size: 15px;">Artists</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">Fix multi-artist tags and formatting</div>
                            </div>
                        </label>
                        <label class="check-option" style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                            <input type="checkbox" id="check-song-names" checked style="width: 20px; height: 20px; accent-color: var(--accent);">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; font-size: 15px;">Fix Song Titles</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">Standardize capitalization and remove junk</div>
                            </div>
                        </label>
                        <label class="check-option" style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                            <input type="checkbox" id="check-genres" checked style="width: 20px; height: 20px; accent-color: var(--accent);">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; font-size: 15px;">Genres</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">Tag tracks with genres from MusicBrainz/Last.fm</div>
                            </div>
                        </label>
                    </div>

                    <div id="check-progress-container" class="check-progress-container hidden">
                        <div class="progress-info">
                            <span id="check-progress-status">Analyzing tracks...</span>
                            <span id="check-progress-percent">0%</span>
                        </div>
                        <div class="progress-track">
                            <div id="check-progress-bar"></div>
                        </div>
                    </div>

                    <div class="modal-actions">
                        <button id="check-metadata-cancel-btn" class="modal-btn ghost-btn">Cancel</button>
                        <button id="check-metadata-start-btn" class="modal-btn primary-btn">Start Health Check</button>
                    </div>
                </div>
            `;
        },

        ImmersiveContent(data) {
            const { title, artist, pictureUrl } = data;
            return `
                <div class="immersive-left">
                    <img id="immersive-art" src="${pictureUrl || ''}" alt="Album Art" class="immersive-art">
                    <div class="immersive-info">
                        <div id="immersive-title" class="immersive-title">${title || ''}</div>
                        <div id="immersive-artist" class="immersive-artist"></div>
                    </div>
                </div>
                <div class="immersive-right">
                    <div id="lyrics-action-bar" class="lyrics-action-bar"></div>
                    <div id="immersive-lyrics-container" class="lyrics-container immersive-lyrics">
                        <!-- Lyrics populate here -->
                    </div>
                </div>
            `;
        },

        DependencyModal() {
            return `
                <div class="modal-content glass-panel">
                    <h2 class="modal-title">Unsupported Format</h2>
                    <p class="modal-text">This audio format is not natively supported by your browser for direct playback. Please consider using a compatible format or quality setting.</p>
                    <div class="modal-actions">
                        <button id="modal-cancel-btn" class="modal-btn primary-btn" style="width: 100%;">Close</button>
                        <button id="modal-install-btn" class="modal-btn primary-btn hidden">Install</button>
                    </div>
                </div>
            `;
        },

        LoginModal() {
            return `
                <div class="modal-content glass-panel login-panel">
                    <h1 class="logo" style="font-size: 32px; margin-bottom: 8px; justify-content: center;">
                        <img src="logo.svg" alt="Logo" class="app-logo-icon">
                        <span>Simon<span class="logo-accent">Relays</span></span>
                    </h1>
                    <p class="modal-text" style="margin-bottom: 24px; opacity: 0.7;">Sign in to sync your music and control playback across all your devices.</p>

                    <button id="google-signin-btn" class="modal-btn primary-btn" style="padding: 14px 28px; font-weight: 700; display: flex; align-items: center; gap: 12px; border-radius: 30px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Sign in with Google
                    </button>
                    <button id="skip-login-btn" class="modal-btn ghost-btn" style="margin-top: 12px; font-size: 13px; opacity: 0.6;">Continue Offline</button>
                </div>
            `;
        }
    };
})();

const UI = (() => {
    return {
        createTrackNode(track, index, options) {
            const div = document.createElement('div');
            div.className = 'track-item' + (options.isTrackActive ? ' active' : '');
            div.dataset.url = track.url;
            div.innerHTML = Templates.TrackItem(track, index, options);
            return div;
        },

        createAlbumCard(albumInfo, options) {
            const card = document.createElement('div');
            card.className = 'album-card';
            card.dataset.name = albumInfo.name;
            card.innerHTML = Templates.AlbumCard(albumInfo, options);
            return card;
        },

        renderContextMenu(container) {
            if (!container) return;
            container.innerHTML = Templates.ContextMenu();
        },

        renderCreatePlaylistModal(container) {
            if (!container) return;
            container.innerHTML = Templates.CreatePlaylistModal();
        },

        renderCheckMetadataModal(container) {
            if (!container) return;
            container.innerHTML = Templates.CheckMetadataModal();
        },

        renderImmersiveContent(container, data) {
            if (!container) return;
            container.innerHTML = Templates.ImmersiveContent(data);
        },

        createSearchResultRow(data) {
            const div = document.createElement('div');
            div.className = 'search-result-row';
            div.innerHTML = Templates.SearchResultRow(data);
            return div;
        },

        createDropdownItem(data) {
            const div = document.createElement('div');
            div.className = 'dropdown-item ' + (data.className || '');
            div.innerHTML = Templates.AddToPlaylistDropdownItem(data);
            return div;
        },

        renderEditMetadataModal(container, track) {
            if (!container) return;
            container.innerHTML = Templates.EditMetadataModal(track);
        },

        renderTrackList(tracks, container, isPlaylistView = false, playlistId = null, canEdit = false, showTrackNumbers = false) {
            if (!container) return;
            container.innerHTML = '';
            
            const tracksToRender = tracks.map((track, index) => {
                if (track.isServer) return track;
                const libTrack = State.get('allTracks').find(t => t.url === track.url);
                if (libTrack) return { ...track, ...libTrack, timestamp: track.timestamp, savedAt: track.savedAt };
                return track;
            });

            const fragment = document.createDocumentFragment();
            tracksToRender.forEach((track, index) => {
                const trackItem = this.createTrackNode(track, index, {
                    isPlaylistView,
                    canEdit,
                    isQueueView: container.id === 'queue-user-list' || container.id === 'queue-context-list',
                    showTrackNumbers: showTrackNumbers && !(container.id === 'queue-user-list' || container.id === 'queue-context-list'),
                    isDownloaded: State.get('downloadedTracksMap').has(track.url),
                    isDownloading: State.get('pendingDownloads').get(track.url) !== undefined,
                    downloadProgress: State.get('pendingDownloads').get(track.url),
                    isLiked: State.get('likedTracks').has(track.url),
                    currentUser: State.get('currentUser'),
                    isUnsupported: window.isTrackUnsupported ? window.isTrackUnsupported(track) : false,
                    isTrackActive: window.isSameTrack ? window.isSameTrack(Playback.currentTrack, track) : false,
                    getSharedCoverUrl: window.getSharedCoverUrl,
                    getQualityLabel: window.getQualityLabel,
                    splitArtists: window.splitArtists
                });

                // Re-wire event listeners that need the track/index
                if (window.setupTrackListeners) window.setupTrackListeners(trackItem, track, index, container, playlistId, canEdit, tracksToRender);

                fragment.appendChild(trackItem);
            });
            container.appendChild(fragment);

            if (!(container.id === 'queue-user-list' || container.id === 'queue-context-list')) {
                Animations.stagger(container, '.track-item', 25);
            }
        },

        renderHomeGrid() {
            const recentList = document.getElementById('recent-album-list');
            if (!recentList) return;
            recentList.innerHTML = '';

            const albumsArray = Object.values(State.get('albumsData'));
            albumsArray.sort((a, b) => b.addedAt - a.addedAt);

            const count = Theme.calculateItemsPerRow();
            const recentAlbums = albumsArray.slice(0, count);
            
            recentAlbums.forEach(albumInfo => {
                const card = this.createAlbumCard(albumInfo, {
                    artHtml: this.getAlbumArtHtml(albumInfo),
                    splitArtists: window.splitArtists,
                    cardPlayBtnHtml: window.CARD_PLAY_BTN_HTML
                });
                if (window.setupAlbumCardListeners) window.setupAlbumCardListeners(card, albumInfo);
                recentList.appendChild(card);
            });

            Animations.stagger(recentList, '.album-card', 40);

            if (window.renderRecentArtists) window.renderRecentArtists();
            if (window.Playlist) {
                Playlist.renderDiscoverStrip();
                Playlist.renderUserStrip();
            }
        },

        getAlbumArtHtml(albumInfo) {
            if (albumInfo.coverTrackPath) {
                const pictureUrl = window.getSharedCoverUrl(albumInfo.coverTrackPath, albumInfo.artist, albumInfo.name);
                return `<img src="${pictureUrl}" class="album-card-art" alt="Album Cover">`;
            }
            return `<div class="album-card-art"></div>`;
        },

        renderAlbumView(albumInfo) {
            const albumView = document.getElementById('album-view');
            const albumHeroDiv = document.getElementById('album-hero');
            if (!albumView || !albumHeroDiv) return;

            let pictureUrl = null;
            let coverHtml = `<div class="album-hero-cover" style="background: linear-gradient(135deg, var(--gradient-1), var(--gradient-2));"></div>`;
            
            if (albumInfo.coverTrackPath) {
                pictureUrl = window.getSharedCoverUrl(albumInfo.coverTrackPath, albumInfo.artist, albumInfo.name);
                coverHtml = `<img src="${pictureUrl}" class="album-hero-cover" alt="Album Cover">`;
                albumView.style.setProperty('--view-bg-image', `url("${pictureUrl}")`);
            } else {
                albumView.style.setProperty('--view-bg-image', 'none');
            }

            let earliestYear = 9999;
            let totalDuration = 0;
            let albumGenres = new Set();

            albumInfo.tracks.forEach(t => {
                if (t.metadata) {
                    if (t.metadata.year && t.metadata.year < earliestYear) earliestYear = t.metadata.year;
                    if (t.metadata.duration) totalDuration += t.metadata.duration;
                    if (t.metadata.genre) {
                        const splitRegex = /[,/;\\]+/;
                        const genres = Array.isArray(t.metadata.genre) ? t.metadata.genre : [t.metadata.genre];
                        genres.forEach(g => {
                            if (typeof g === 'string') {
                                g.split(splitRegex).map(s => s.trim()).filter(Boolean).forEach(innerG => albumGenres.add(innerG.toUpperCase()));
                            }
                        });
                    }
                }
            });

            const yearStr = earliestYear === 9999 ? 'Unknown Year' : earliestYear;
            const durationStr = totalDuration > 0 ? `, ${window.formatHeroDuration(totalDuration)}` : '';
            const songCountStr = `${albumInfo.tracks.length} song${albumInfo.tracks.length !== 1 ? 's' : ''}`;
            
            let genresHtml = albumGenres.size > 0 
                ? Array.from(albumGenres).map(g => `<span class="genre-tag">${g}</span>`).join('')
                : `<span class="genre-tag no-genre">NO GENRE TAGS</span>`;

            const isAlbumOffline = albumInfo.tracks.every(t => State.get('downloadedTracksMap').has(t.url));
            const isAlbumDownloading = albumInfo.tracks.some(t => State.get('pendingDownloads').has(t.url));

            albumHeroDiv.innerHTML = Templates.AlbumHero(albumInfo, {
                coverHtml, yearStr, songCountStr, durationStr, genresHtml, splitArtists: window.splitArtists
            });

            const avatarNode = albumHeroDiv.querySelector('.album-hero-artist-avatar');
            if (avatarNode) Theme.applyArtistVisuals(albumInfo.artist, avatarNode, false);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'album-hero-actions';
            actionsDiv.innerHTML = Templates.AlbumHeroActions(isAlbumOffline, isAlbumDownloading);
            albumHeroDiv.querySelector('.album-hero-info').appendChild(actionsDiv);

            if (window.setupAlbumHeroListeners) window.setupAlbumHeroListeners(albumHeroDiv, albumInfo, isAlbumOffline, isAlbumDownloading);

            const albumTrackList = albumView.querySelector('.track-list');
            this.renderTrackList(albumInfo.tracks, albumTrackList, false, null, true, true);
        },

        renderArtistView(artistName, artistAlbums, artistTracks) {
            const artistView = document.getElementById('artist-view');
            const artistHeroName = document.getElementById('artist-hero-name');
            const artistHeroMeta = document.getElementById('artist-hero-meta');
            const artistTrackList = document.getElementById('artist-track-list');
            const artistAlbumGrid = document.getElementById('artist-album-grid');
            if (!artistView) return;

            artistHeroName.textContent = artistName;
            artistHeroMeta.textContent = `${artistTracks.length} track${artistTracks.length !== 1 ? 's' : ''}, ${artistAlbums.length} album${artistAlbums.length !== 1 ? 's' : ''}`;

            const heroAvatarNode = document.querySelector('.artist-hero-avatar');
            if (heroAvatarNode) {
                heroAvatarNode.innerHTML = '';
                Theme.applyArtistVisuals(artistName, heroAvatarNode, true);
            }

            this.renderTrackList(artistTracks, artistTrackList);

            artistAlbumGrid.innerHTML = '';
            artistAlbums.forEach(albumInfo => {
                const card = this.createAlbumCard(albumInfo, {
                    artHtml: this.getAlbumArtHtml(albumInfo),
                    splitArtists: window.splitArtists,
                    cardPlayBtnHtml: window.CARD_PLAY_BTN_HTML
                });
                if (window.setupAlbumCardListeners) window.setupAlbumCardListeners(card, albumInfo);
                artistAlbumGrid.appendChild(card);
            });
        },

        renderHistoryView() {
            const container = document.getElementById('history-track-list');
            this.renderTrackList(State.get('historyTracks'), container);
        },

        renderDownloadsView() {
            const container = document.getElementById('downloads-track-list');
            if (!container) return;
            this.renderTrackList(State.get('downloadedTracks'), container);
        },

        renderRecentArtists() {
            const recentArtistList = document.getElementById('recent-artist-list');
            if (!recentArtistList) return;

            let recentNames = [];
            try {
                recentNames = JSON.parse(localStorage.getItem('recentArtists') || '[]');
            } catch (e) { }

            if (recentNames.length === 0 && State.get('allTracks').length > 0) {
                const unique = new Set();
                State.get('allTracks').forEach(t => {
                    const rawName = (t.metadata && t.metadata.artist) ? t.metadata.artist : 'Unknown Artist';
                    window.splitArtists(rawName).forEach(aName => {
                        if (aName !== 'Unknown Artist') unique.add(aName);
                    });
                });
                recentNames = Array.from(unique);
            }

            recentArtistList.innerHTML = '';
            if (recentNames.length === 0) {
                recentArtistList.innerHTML = '<div style="color:var(--text-secondary); padding: 20px;">Play some music to see artists here.</div>';
                return;
            }

            const count = Theme.calculateItemsPerRow(160, 24, 80);
            const topArtists = recentNames.slice(0, count);
            topArtists.forEach(artistName => {
                const card = document.createElement('div');
                card.className = 'artist-grid-item';
                card.innerHTML = `
                    <div class="artist-grid-avatar"></div>
                    <div class="artist-grid-name">${artistName}</div>
                `;
                const avatar = card.querySelector('.artist-grid-avatar');
                Theme.applyArtistVisuals(artistName, avatar, true);
                
                card.addEventListener('click', () => window.openArtistView(artistName));
                recentArtistList.appendChild(card);
            });
            Animations.stagger(recentArtistList, '.artist-grid-item', 40);
        },

        renderProfilePanel(currentUser) {
            const profileBody = document.getElementById('profile-body');
            if (!profileBody) return;

            profileBody.innerHTML = Templates.ProfilePanel({
                currentUser,
                photoURL: currentUser?.photoURL,
                displayName: currentUser?.displayName,
                email: currentUser?.email
            });

            if (window.setupProfileListeners) window.setupProfileListeners(profileBody);
        },

        renderSettingsPanel(options = {}) {
            const settingsView = document.getElementById('settings-view');
            const body = settingsView?.querySelector('.settings-body');
            const header = settingsView?.querySelector('.settings-header');
            if (!body || !header) return;

            body.innerHTML = Templates.SettingsPanel(options);

            if (window.setupSettingsListeners) window.setupSettingsListeners(body, header);
        },

        renderLikesView() {


            const container = document.getElementById('likes-track-list');
            if (!container) return;
            container.innerHTML = '';

            const likedTracksCache = State.get('allLikedTracksCache');
            if (likedTracksCache.length === 0) {
                container.innerHTML = `
                    <div class="search-empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                        <div class="search-empty-text">No liked tracks yet</div>
                        <div class="search-empty-sub">Tap the heart on any playing song to add it here</div>
                    </div>
                `;
                return;
            }
            this.renderTrackList(likedTracksCache, container, false, null, false, true);
        },

        renderQueueView() {
            const queueUserList = document.getElementById('queue-user-list');
            const queueContextList = document.getElementById('queue-context-list');
            const queueNowPlaying = document.getElementById('queue-now-playing');
            
            if (queueNowPlaying && Playback.currentTrack) {
                this.renderTrackList([Playback.currentTrack], queueNowPlaying, false, null, false, false);
            }
            if (queueUserList) {
                this.renderTrackList(Playback.queue, queueUserList, false, null, false, false);
            }
            if (queueContextList) {
                const upcoming = Playback.upcomingTracks;
                this.renderTrackList(upcoming, queueContextList, false, null, false, false);
            }
        },

        populateSharedContainers() {

            this.renderContextMenu(document.getElementById('track-context-menu'));
            this.renderCreatePlaylistModal(document.getElementById('create-playlist-modal'));
            this.renderCheckMetadataModal(document.getElementById('check-metadata-modal'));
            
            const depModal = document.getElementById('dependency-modal');
            if (depModal) depModal.innerHTML = Templates.DependencyModal();

            const loginOverlay = document.getElementById('login-overlay');
            if (loginOverlay) loginOverlay.innerHTML = Templates.LoginModal();
            // Note: EditMetadataModal is populated dynamically when opened as it needs track data
        },

        showNotification(title, message) {
            const modal = document.getElementById('notification-modal');
            const titleEl = document.getElementById('notification-title');
            const messageEl = document.getElementById('notification-message');
            const okBtn = document.getElementById('notification-ok-btn');

            if (!modal || !titleEl || !messageEl || !okBtn) {
                console.error('Notification modal elements not found');
                return;
            }

            titleEl.textContent = title;
            messageEl.textContent = message;
            modal.classList.remove('hidden');

            const hide = () => {
                modal.classList.add('hidden');
                okBtn.removeEventListener('click', hide);
            };
            okBtn.onclick = hide;
            
            modal.onclick = (e) => {
                if (e.target === modal) hide();
            };
        }
    };
})();

window.Templates = Templates;
window.UI = UI;
