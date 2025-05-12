// ==UserScript==
// @name         SPL (SimplePatreonLoader)
// @namespace    https://github.com/5f32797a
// @version      2.2
// @description  Enhanced Vimeo video loader with direct HLS download and better UI
// @match        https://vimeo.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_download
// @connect      vimeo.com
// @connect      *.vimeocdn.com
// @source       https://github.com/5f32797a/VimeoSPL
// @supportURL   https://github.com/5f32797a/VimeoSPL/issues
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Configuration options with defaults
    const CONFIG = {
        preferredQuality: GM_getValue('preferredQuality', 'auto'),
        darkMode: GM_getValue('darkMode', true),
        loadTimeout: 60000, // 60 seconds timeout
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        downloadFormats: ['mp4', 'hls'],
        hlsChunkSize: 4 * 1024 * 1024, // 4MB per chunk when downloading
        maxConcurrentDownloads: 3, // Maximum number of concurrent segment downloads
    };

    // CSS styles for UI elements
    const STYLES = {
        overlay: 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.9); z-index: 9998;',
        loadingContainer: 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; z-index: 9999; font-family: Arial, sans-serif; text-align: center;',
        spinner: 'border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; margin: 0 auto 15px; animation: spin 1s linear infinite;',
        loadingText: 'font-size: 16px; margin-bottom: 10px;',
        playerContainer: 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; background-color: #1a1a1a;',
        controlBar: 'display: flex; justify-content: space-between; align-items: center; padding: 10px; background-color: #2a2a2a; color: white;',
        button: 'background-color: #3498db; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin: 0 5px;',
        select: 'background-color: #2a2a2a; color: white; border: 1px solid #444; padding: 5px; border-radius: 3px;',
        video: 'flex: 1; width: 100%; height: calc(100% - 50px); border: none;',
        errorContainer: 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: #2a2a2a; color: white; padding: 20px; border-radius: 5px; text-align: center; max-width: 80%;',
        dropdown: 'position: absolute; background-color: #333; border-radius: 3px; box-shadow: 0 4px 8px rgba(0,0,0,0.5); z-index: 9999; overflow: hidden; transition: height 0.3s ease-in-out;',
        dropdownItem: 'padding: 8px 15px; cursor: pointer; transition: background-color 0.2s; color: white; text-align: left;',
        tooltip: 'position: absolute; background-color: #333; color: white; padding: 5px 10px; border-radius: 3px; font-size: 12px; z-index: 10000; pointer-events: none; opacity: 0; transition: opacity 0.3s; white-space: nowrap;'
    };

    // Video formats and their priorities
    const VIDEO_FORMATS = {
        hls: {
            priority: 1,
            name: 'HLS Stream (m3u8)',
            extension: 'm3u8'
        }
    };

    /**
     * Extracts Vimeo video ID from URL using optimized regex pattern
     * @param {string} url - The Vimeo URL to parse
     * @returns {string} The extracted video ID
     * @throws {Error} If URL format is invalid
     */
    const VIMEO_ID_REGEX = /(?:\/|^)(\d+)(?:[/?#]|$)/;
    function extractVimeoVideoId(url) {
        const match = url.match(VIMEO_ID_REGEX);
        if (!match) {
            throw new Error('Invalid Vimeo URL format');
        }
        return match[1];
    }

    /**
     * Creates and injects CSS styles into the document
     */
    function injectStyles() {
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .spl-fade-in {
                animation: fadeIn 0.5s ease-in-out;
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .spl-button:hover {
                background-color: #2980b9 !important;
            }
            .spl-quality-option {
                padding: 8px;
                background-color: #333;
                color: white;
                border-radius: 3px;
                margin: 5px;
                cursor: pointer;
                text-align: center;
                transition: background-color 0.2s;
            }
            .spl-quality-option:hover {
                background-color: #3498db;
            }
            .spl-dropdown-item:hover {
                background-color: #3498db;
            }
            .spl-dropdown {
                display: none;
            }
            .spl-dropdown.active {
                display: block;
            }
        `;
        document.head.appendChild(styleSheet);
    }

    /**
     * Check if current page has a restricted video
     * @returns {boolean} True if the page contains a restricted video
     */
    function isRestrictedVideo() {
        // Multiple detection methods for better reliability
        const errorTitle = document.querySelector('.exception_title.iris_header');
        const privateContent = document.querySelector('.private-content-banner');
        const errorMessages = document.querySelectorAll('.iris_p');
        
        // Look for specific error text in page content
        const pageText = document.body.textContent || '';
        const restrictedPhrases = [
            'This video is private',
            'because of its privacy settings',
            'content is available with',
            'Page not found',
            'Due to privacy settings'
        ];
        
        const hasRestrictedPhrase = restrictedPhrases.some(phrase => 
            pageText.includes(phrase)
        );
        
        return !!errorTitle || !!privateContent || hasRestrictedPhrase || 
               (errorMessages.length > 0 && pageText.includes('private'));
    }

    /**
     * Shows a loading screen with progress information
     * @param {string} videoId - The Vimeo video ID
     * @returns {Object} The created UI elements
     */
    function showLoadingUI(videoId) {
        const overlay = document.createElement('div');
        overlay.style.cssText = STYLES.overlay;
        
        const loadingContainer = document.createElement('div');
        loadingContainer.style.cssText = STYLES.loadingContainer;
        loadingContainer.className = 'spl-fade-in';
        
        const spinner = document.createElement('div');
        spinner.style.cssText = STYLES.spinner;
        
        const loadingText = document.createElement('div');
        loadingText.style.cssText = STYLES.loadingText;
        loadingText.textContent = `Loading video ${videoId}...`;
        
        const progressText = document.createElement('div');
        progressText.textContent = 'Connecting to Vimeo...';
        
        loadingContainer.appendChild(spinner);
        loadingContainer.appendChild(loadingText);
        loadingContainer.appendChild(progressText);
        
        document.body.appendChild(overlay);
        document.body.appendChild(loadingContainer);
        
        return { overlay, loadingContainer, progressText };
    }

    /**
     * Extract video sources from HTML content
     * @param {string} htmlContent - The HTML content to parse
     * @returns {Object|null} Object with video sources or null if not found
     */
    function extractVideoSources(htmlContent) {
        try {
            // Store extracted data
            const sources = {
                hls: null,
                title: "Vimeo Video",
                quality: {}
            };
            
            // Method 1: Try to find config JSON in the HTML
            const configPatterns = [
                /var\s+config\s*=\s*({.+?});/s,
                /window\.playerConfig\s*=\s*({.+?});/s,
                /playerConfig\s*[:=]\s*({.+?})[,;]/s,
                /player_config\s*[:=]\s*({.+?})[,;]/s,
                /"url":"(https:\/\/[^"]+\.m3u8[^"]*)"/  // Direct m3u8 URL
            ];
            
            let config = null;
            for (const pattern of configPatterns) {
                try {
                    const match = htmlContent.match(pattern);
                    if (!match) continue;
                    
                    // Special handling for direct m3u8 URL pattern
                    if (pattern.toString().includes('m3u8')) {
                        if (match[1]) {
                            sources.hls = match[1].replace(/\\u0026/g, '&');
                            console.log('Found direct HLS URL match:', sources.hls);
                        }
                        continue;
                    }
                    
                    // Standard config object parsing
                    if (match[1]) {
                        try {
                            // First, fix any common JSON parsing issues
                            let jsonStr = match[1]
                                .replace(/(\w+):/g, '"$1":')  // Convert unquoted keys to quoted
                                .replace(/'/g, '"');          // Convert single quotes to double quotes
                                
                            const parsedConfig = JSON.parse(jsonStr);
                            if (parsedConfig && (parsedConfig.request || parsedConfig.video)) {
                                config = parsedConfig;
                                console.log('Found player config');
                                break;
                            }
                        } catch (e) {
                            console.log('Failed to parse config with pattern:', pattern, e.message);
                        }
                    }
                } catch (e) {
                    console.warn('Error with pattern:', e);
                    // Continue with next pattern
                }
            }
            
            // If config was found, extract sources
            if (config) {
                // Set title if available
                if (config.video && config.video.title) {
                    sources.title = config.video.title;
                }
                
                // Extract HLS (m3u8) source
                if (config.request && config.request.files && config.request.files.hls) {
                    const hlsConfig = config.request.files.hls;
                    
                    // Try multiple paths to find the HLS URL
                    let hlsUrl = null;
                    
                    // Path 1: Direct CDN URL
                    if (hlsConfig.cdns && hlsConfig.cdns.akfire_interconnect_quic && hlsConfig.cdns.akfire_interconnect_quic.url) {
                        hlsUrl = hlsConfig.cdns.akfire_interconnect_quic.url;
                    } 
                    // Path 2: Default CDN
                    else if (hlsConfig.default_cdn && hlsConfig.cdns && hlsConfig.cdns[hlsConfig.default_cdn] && hlsConfig.cdns[hlsConfig.default_cdn].url) {
                        hlsUrl = hlsConfig.cdns[hlsConfig.default_cdn].url;
                    }
                    // Path 3: Direct URL
                    else if (hlsConfig.url) {
                        hlsUrl = hlsConfig.url;
                    }
                    
                    if (hlsUrl) {
                        sources.hls = hlsUrl;
                        console.log('Found HLS source:', hlsUrl);
                    }
                }
                
                // Return early if we found sources
                if (sources.hls) {
                    return sources;
                }
            }
            
            // Method 2: Try to extract sources from master.json
            const masterJsonMatch = htmlContent.match(/(?:master\.json|player\.vimeo\.com\/video\/[0-9]+\/config)[^"']+/);
            if (masterJsonMatch && masterJsonMatch[0]) {
                console.log('Found potential master.json URL:', masterJsonMatch[0]);
                // Extract video ID for title if not set
                if (sources.title === "Vimeo Video") {
                    const idMatch = masterJsonMatch[0].match(/\/video\/([0-9]+)/);
                    if (idMatch && idMatch[1]) {
                        sources.title = `Vimeo Video #${idMatch[1]}`;
                    }
                }
                
                // Include in the sources to allow manual extraction
                sources.configUrl = 'https://' + masterJsonMatch[0].replace(/^\/\//, '');
            }
            
            // Method 3: Look for direct video links in the HTML
            const directVideoMatches = htmlContent.match(/https:\/\/[^"']+\.vimeocdn\.com\/[^"']+\.mp4[^"']*/g);
            if (directVideoMatches && directVideoMatches.length > 0) {
                console.log('Found direct video links but ignoring as MP4 is disabled');
            }
            
            // Method 4: Look for m3u8 links
            const m3u8Matches = htmlContent.match(/https:\/\/[^"']+\.m3u8[^"']*/g);
            if (m3u8Matches && m3u8Matches.length > 0) {
                sources.hls = m3u8Matches[0].replace(/\\u0026/g, '&');
                console.log('Found direct HLS source:', sources.hls);
            }
            
            // If we have at least one source, return the results
            if (sources.hls || sources.configUrl) {
                return sources;
            }
            
            // Method 5: Try to extract iframe src as last resort
            const iframeSrcMatch = htmlContent.match(/src=["']([^"']+player\.vimeo\.com\/video\/[^"']+)["']/);
            if (iframeSrcMatch && iframeSrcMatch[1]) {
                sources.iframeSrc = iframeSrcMatch[1];
                console.log('Found iframe src as fallback:', sources.iframeSrc);
                return sources;
            }
            
            return null;
        } catch (error) {
            console.error('Error extracting video sources:', error);
            return null;
        }
    }

    /**
     * Main function to handle video loading process
     * @throws {Error} If video loading fails
     */
    function loadVimeoVideo() {
        try {
            if (!isRestrictedVideo()) {
                console.debug('Not a restricted video page, script not needed');
                return;
            }

            const videoId = extractVimeoVideoId(window.location.href);
            const { progressText } = showLoadingUI(videoId);
            
            // Set up timeout to prevent hanging
            const timeoutId = setTimeout(() => {
                handleError(new Error('Request timed out. The server might be down or blocking the request.'));
            }, CONFIG.loadTimeout);
            
            progressText.textContent = 'Fetching video data...';
            
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://player.vimeo.com/video/${videoId}`,
                headers: {
                    'Referer': 'https://www.patreon.com',
                    'User-Agent': CONFIG.userAgent,
                    'Cache-Control': 'no-cache'
                },
                onload: function(response) {
                    clearTimeout(timeoutId);
                    if (response.status >= 400) {
                        handleError(new Error(`Server returned error code: ${response.status}`));
                        return;
                    }
                    
                    progressText.textContent = 'Processing video...';
                    
                    // Extract video sources from the HTML content
                    const htmlContent = response.responseText;
                    const videoSources = extractVideoSources(htmlContent);
                    
                    if (!videoSources) {
                        handleError(new Error('Failed to extract any video sources from the response'));
                        return;
                    }
                    
                    // Check if we need to fetch the config URL
                    if (!videoSources.hls && videoSources.configUrl) {
                        progressText.textContent = 'Fetching additional video data...';
                        
                        // Fetch the config JSON
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: videoSources.configUrl,
                            headers: {
                                'Referer': 'https://www.patreon.com',
                                'User-Agent': CONFIG.userAgent,
                                'Accept': 'application/json'
                            },
                            onload: function(configResponse) {
                                try {
                                    if (configResponse.status >= 400) {
                                        throw new Error(`Config request failed with status: ${configResponse.status}`);
                                    }
                                    
                                    const configData = JSON.parse(configResponse.responseText);
                                    console.log('Fetched config data:', configData);
                                    
                                    // Extract sources from config
                                    if (configData.request && configData.request.files) {
                                        // Extract HLS source
                                        if (configData.request.files.hls) {
                                            const hlsConfig = configData.request.files.hls;
                                            
                                            if (hlsConfig.cdns && hlsConfig.cdns.akfire_interconnect_quic) {
                                                videoSources.hls = hlsConfig.cdns.akfire_interconnect_quic.url;
                                            } else if (hlsConfig.default_cdn && hlsConfig.cdns[hlsConfig.default_cdn]) {
                                                videoSources.hls = hlsConfig.cdns[hlsConfig.default_cdn].url;
                                            }
                                        }
                                        
                                        // Extract MP4 sources
                                        if (configData.request.files.progressive && configData.request.files.progressive.length > 0) {
                                            const mp4Sources = configData.request.files.progressive;
                                            mp4Sources.sort((a, b) => b.height - a.height);
                                            
                                            videoSources.mp4 = mp4Sources[0].url;
                                            
                                            // Store quality options
                                            mp4Sources.forEach(source => {
                                                videoSources.quality[`${source.height}p`] = {
                                                    url: source.url,
                                                    quality: `${source.height}p`,
                                                    format: 'mp4',
                                                    width: source.width,
                                                    height: source.height
                                                };
                                            });
                                        }
                                        
                                        // Set title if available
                                        if (configData.video && configData.video.title) {
                                            videoSources.title = configData.video.title;
                                        }
                                    }
                                    
                                    if (!videoSources.hls) {
                                        throw new Error('No playable sources found in config');
                                    }
                                    
                                    // Create blob URL for video playback
                                    const videoUrl = URL.createObjectURL(new Blob([htmlContent], {type: 'text/html'}));
                                    setupVideoPlayer(videoUrl, videoId, videoSources);
                                    
                                } catch (configError) {
                                    console.error('Config parsing error:', configError);
                                    
                                    // Try to continue with iframe if sources are still not available
                                    if (videoSources.iframeSrc) {
                                        setupVideoPlayer(videoSources.iframeSrc, videoId, videoSources);
                                    } else {
                                        // Create blob URL for video playback as a last resort
                                        const videoUrl = URL.createObjectURL(new Blob([htmlContent], {type: 'text/html'}));
                                        setupVideoPlayer(videoUrl, videoId, videoSources);
                                    }
                                }
                            },
                            onerror: function() {
                                console.error('Failed to fetch config URL');
                                
                                // Try to continue with iframe if sources are still not available
                                if (videoSources.iframeSrc) {
                                    setupVideoPlayer(videoSources.iframeSrc, videoId, videoSources);
                                } else {
                                    // Create blob URL for video playback as a last resort
                                    const videoUrl = URL.createObjectURL(new Blob([htmlContent], {type: 'text/html'}));
                                    setupVideoPlayer(videoUrl, videoId, videoSources);
                                }
                            }
                        });
                    } else {
                        // Create blob URL for video playback
                        const videoUrl = videoSources.iframeSrc || URL.createObjectURL(new Blob([htmlContent], {type: 'text/html'}));
                        setupVideoPlayer(videoUrl, videoId, videoSources);
                    }
                },
                onprogress: function(progress) {
                    if (progress.total > 0) {
                        const percent = Math.round((progress.loaded / progress.total) * 100);
                        progressText.textContent = `Loading: ${percent}% (${formatBytes(progress.loaded)} / ${formatBytes(progress.total)})`;
                    } else {
                        progressText.textContent = `Loading: ${formatBytes(progress.loaded)} received...`;
                    }
                },
                onerror: function(error) {
                    clearTimeout(timeoutId);
                    handleError(error || new Error('Failed to connect to Vimeo server'));
                }
            });
        } catch (error) {
            handleError(error);
        }
    }

    /**
     * Format bytes to human-readable format
     * @param {number} bytes - The bytes to format
     * @returns {string} Formatted size string
     */
    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Create tooltip element
     * @param {string} text - Tooltip text
     * @returns {HTMLElement} Tooltip element
     */
    function createTooltip(text) {
        const tooltip = document.createElement('div');
        tooltip.style.cssText = STYLES.tooltip;
        tooltip.textContent = text;
        document.body.appendChild(tooltip);
        return tooltip;
    }

    /**
     * Show tooltip near an element
     * @param {HTMLElement} element - The element to show tooltip for
     * @param {HTMLElement} tooltip - The tooltip element
     */
    function showTooltip(element, tooltip) {
        const rect = element.getBoundingClientRect();
        tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
        tooltip.style.top = `${rect.bottom + 5}px`;
        tooltip.style.opacity = '1';
    }

    /**
     * Hide tooltip
     * @param {HTMLElement} tooltip - The tooltip element
     */
    function hideTooltip(tooltip) {
        tooltip.style.opacity = '0';
    }

    /**
     * Download file with error handling and progress
     * @param {string} url - File URL
     * @param {string} filename - Download filename
     */
    function downloadFile(url, filename) {
        // Create a notification for the download
        const notification = document.createElement('div');
        notification.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background-color: #2a2a2a; color: white; padding: 15px; border-radius: 5px; z-index: 10000; max-width: 300px; box-shadow: 0 4px 8px rgba(0,0,0,0.3);';
        notification.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: bold;">Downloading ${filename}</div>
            <div class="download-progress" style="width: 100%; height: 5px; background-color: #444; border-radius: 3px; overflow: hidden;">
                <div class="progress-bar" style="width: 0%; height: 100%; background-color: #3498db; transition: width 0.3s;"></div>
            </div>
            <div class="download-status" style="margin-top: 5px; font-size: 12px;">Starting download...</div>
        `;
        document.body.appendChild(notification);
        
        const progressBar = notification.querySelector('.progress-bar');
        const statusText = notification.querySelector('.download-status');
        
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'blob';
            
            xhr.onprogress = function(e) {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 100);
                    progressBar.style.width = `${percentComplete}%`;
                    statusText.textContent = `Downloaded: ${formatBytes(e.loaded)} of ${formatBytes(e.total)} (${percentComplete}%)`;
                } else {
                    statusText.textContent = `Downloaded: ${formatBytes(e.loaded)}`;
                }
            };
            
            xhr.onload = function() {
                if (this.status === 200) {
                    const blob = new Blob([this.response], {type: 'application/octet-stream'});
                    const blobUrl = URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = filename;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    
                    // Clean up
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(blobUrl);
                    }, 100);
                    
                    progressBar.style.width = '100%';
                    statusText.textContent = 'Download complete!';
                    notification.style.backgroundColor = '#27ae60';
                    
                    // Remove notification after a delay
                    setTimeout(() => {
                        notification.style.opacity = '0';
                        notification.style.transition = 'opacity 0.5s';
                        setTimeout(() => {
                            if (notification.parentNode) {
                                document.body.removeChild(notification);
                            }
                        }, 500);
                    }, 3000);
                } else {
                    throw new Error(`Download failed with status: ${this.status}`);
                }
            };
            
            xhr.onerror = function() {
                throw new Error('Network error occurred during download');
            };
            
            xhr.send();
        } catch (error) {
            statusText.textContent = `Error: ${error.message}`;
            notification.style.backgroundColor = '#e74c3c';
            console.error('Download error:', error);
            
            // Remove notification after a delay
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 5000);
        }
    }

    /**
     * Save M3U8 stream URL to a file for external players
     * @param {string} m3u8Url - The M3U8 URL
     * @param {string} filename - The filename to save
     */
    function saveM3U8File(m3u8Url, filename) {
        const content = `#EXTM3U
#EXT-X-STREAM-INF:PROGRAM-ID=1
${m3u8Url}`;
        
        const blob = new Blob([content], {type: 'application/x-mpegurl'});
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        // Show help notification
        const helpNotification = document.createElement('div');
        helpNotification.style.cssText = 'position: fixed; bottom: 20px; left: 20px; background-color: #2a2a2a; color: white; padding: 15px; border-radius: 5px; z-index: 10000; max-width: 400px; box-shadow: 0 4px 8px rgba(0,0,0,0.3);';
        helpNotification.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: bold;">HLS Stream File Saved</div>
            <div>For full audio and video playback:</div>
            <ol style="margin-top: 5px; padding-left: 20px;">
                <li>Use <strong>VLC Media Player</strong> (recommended)
                    <ul style="margin-top: 3px; padding-left: 20px;">
                        <li>Go to <em>Media → Open File</em> and select the m3u8 file</li>
                        <li>Or drag and drop the file into VLC</li>
                    </ul>
                </li>
                <li>For Download with audio + video: 
                    <ul style="margin-top: 3px; padding-left: 20px;">
                        <li>In VLC: <em>Media → Convert/Save</em> after opening</li>
                        <li>Or use FFmpeg: <code>ffmpeg -i "${filename}" -c copy output.mp4</code></li>
                    </ul>
                </li>
            </ol>
            <div style="margin-top: 8px; font-size: 12px; text-align: center;">Click to dismiss</div>
        `;
        
        helpNotification.onclick = () => {
            document.body.removeChild(helpNotification);
        };
        
        document.body.appendChild(helpNotification);
        
        setTimeout(() => {
            if (helpNotification.parentNode) {
                document.body.removeChild(helpNotification);
            }
        }, 20000);
    }

    /**
     * Sets up the enhanced video player interface
     * @param {string} videoUrl - Blob URL of the video content
     * @param {string} videoId - The Vimeo video ID
     * @param {Object} videoSources - Object containing video sources and metadata
     */
    function setupVideoPlayer(videoUrl, videoId, videoSources) {
        // Clear existing content
        document.body.innerHTML = '';
        if (CONFIG.darkMode) {
            document.documentElement.style.cssText = 'background-color: #1a1a1a; color: #ffffff;';
        }
        
        // Create player container
        const playerContainer = document.createElement('div');
        playerContainer.style.cssText = STYLES.playerContainer;
        
        // Create control bar
        const controlBar = document.createElement('div');
        controlBar.style.cssText = STYLES.controlBar;
        
        // Title element
        const titleElement = document.createElement('div');
        titleElement.textContent = videoSources.title || `Vimeo Video #${videoId}`;
        titleElement.style.overflow = 'hidden';
        titleElement.style.textOverflow = 'ellipsis';
        titleElement.style.whiteSpace = 'nowrap';
        titleElement.style.maxWidth = '60%';
        
        // Control buttons
        const controlsRight = document.createElement('div');
        
        // Full screen button
        const fullScreenButton = document.createElement('button');
        fullScreenButton.textContent = 'Full Screen';
        fullScreenButton.style.cssText = STYLES.button;
        fullScreenButton.className = 'spl-button';
        fullScreenButton.onclick = () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                playerContainer.requestFullscreen();
            }
        };
        
        // Create tooltip
        const tooltip = createTooltip('');
        
        // Download button with dropdown
        const downloadButton = document.createElement('button');
        downloadButton.textContent = 'Download';
        downloadButton.style.cssText = STYLES.button;
        downloadButton.className = 'spl-button';
        downloadButton.style.position = 'relative';
        
        // Create download options for the dropdown
        const downloadOptions = [];
        
        // Create dropdown first
        const downloadDropdown = document.createElement('div');
        downloadDropdown.style.cssText = STYLES.dropdown;
        downloadDropdown.className = 'spl-dropdown';
        downloadButton.appendChild(downloadDropdown);
        
        // Add HLS (m3u8) option if available
        if (videoSources.hls) {
            // Add direct HLS download option
            const hlsDirectItem = document.createElement('div');
            hlsDirectItem.style.cssText = STYLES.dropdownItem;
            hlsDirectItem.className = 'spl-dropdown-item';
            hlsDirectItem.textContent = 'Download HLS as MP4';
            hlsDirectItem.onclick = () => {
                showHlsQualityDialog(videoSources.hls, videoId, videoSources.title);
                downloadDropdown.classList.remove('active');
            };
            downloadDropdown.appendChild(hlsDirectItem);
            downloadOptions.push(hlsDirectItem);
            
            // Save HLS file option (legacy)
            const hlsItem = document.createElement('div');
            hlsItem.style.cssText = STYLES.dropdownItem;
            hlsItem.className = 'spl-dropdown-item';
            hlsItem.textContent = 'Save HLS Stream (m3u8)';
            hlsItem.onclick = () => {
                const filename = `${videoSources.title || `vimeo-${videoId}`}.m3u8`;
                saveM3U8File(videoSources.hls, filename);
                downloadDropdown.classList.remove('active');
            };
            downloadDropdown.appendChild(hlsItem);
            downloadOptions.push(hlsItem);
            
            // Add option to copy HLS URL
            const copyHlsItem = document.createElement('div');
            copyHlsItem.style.cssText = STYLES.dropdownItem;
            copyHlsItem.className = 'spl-dropdown-item';
            copyHlsItem.textContent = 'Copy HLS Stream URL';
            copyHlsItem.onclick = () => {
                try {
                    navigator.clipboard.writeText(videoSources.hls).then(() => {
                        tooltip.textContent = 'URL copied to clipboard!';
                        showTooltip(downloadButton, tooltip);
                        setTimeout(() => hideTooltip(tooltip), 2000);
                    }).catch(err => {
                        console.error('Could not copy text: ', err);
                        // Fallback for clipboard API failures
                        const textArea = document.createElement('textarea');
                        textArea.value = videoSources.hls;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        tooltip.textContent = 'URL copied to clipboard!';
                        showTooltip(downloadButton, tooltip);
                        setTimeout(() => hideTooltip(tooltip), 2000);
                    });
                } catch (e) {
                    console.error('Copy failed:', e);
                    alert('Copy failed. Right-click and copy this URL: ' + videoSources.hls);
                }
                downloadDropdown.classList.remove('active');
            };
            downloadDropdown.appendChild(copyHlsItem);
            downloadOptions.push(copyHlsItem);
        }
        
        // Add config URL copy option if available but no direct sources
        if (videoSources.configUrl && !videoSources.hls) {
            const configUrlItem = document.createElement('div');
            configUrlItem.style.cssText = STYLES.dropdownItem;
            configUrlItem.className = 'spl-dropdown-item';
            configUrlItem.textContent = 'Copy Config URL (Advanced)';
            configUrlItem.onclick = () => {
                try {
                    navigator.clipboard.writeText(videoSources.configUrl).then(() => {
                        tooltip.textContent = 'Config URL copied to clipboard!';
                        showTooltip(downloadButton, tooltip);
                        setTimeout(() => hideTooltip(tooltip), 2000);
                    }).catch(err => {
                        // Fallback for clipboard API failures
                        const textArea = document.createElement('textarea');
                        textArea.value = videoSources.configUrl;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        tooltip.textContent = 'Config URL copied to clipboard!';
                        showTooltip(downloadButton, tooltip);
                        setTimeout(() => hideTooltip(tooltip), 2000);
                    });
                } catch (e) {
                    console.error('Copy failed:', e);
                    alert('Copy failed. Right-click and copy this URL: ' + videoSources.configUrl);
                }
                downloadDropdown.classList.remove('active');
            };
            downloadDropdown.appendChild(configUrlItem);
            downloadOptions.push(configUrlItem);
            
            // Add help option
            const helpItem = document.createElement('div');
            helpItem.style.cssText = STYLES.dropdownItem;
            helpItem.className = 'spl-dropdown-item';
            helpItem.textContent = 'Show Download Help';
            helpItem.onclick = () => {
                showDownloadHelp(videoId);
                downloadDropdown.classList.remove('active');
            };
            downloadDropdown.appendChild(helpItem);
            downloadOptions.push(helpItem);
        }
        
        // Add default download option for main button
        if (downloadOptions.length > 0) {
            downloadButton.onclick = (e) => {
                e.stopPropagation();
                downloadDropdown.classList.toggle('active');
            };
        } else {
            // Fallback to help dialog if no sources were extracted
            downloadButton.onclick = () => {
                showDownloadHelp(videoId);
            };
            
            // Add at least one option to avoid empty dropdown
            const helpItem = document.createElement('div');
            helpItem.style.cssText = STYLES.dropdownItem;
            helpItem.className = 'spl-dropdown-item';
            helpItem.textContent = 'Download Help';
            helpItem.onclick = () => {
                showDownloadHelp(videoId);
                downloadDropdown.classList.remove('active');
            };
            downloadDropdown.appendChild(helpItem);
        }
        
        // Close dropdown when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!downloadButton.contains(e.target)) {
                downloadDropdown.classList.remove('active');
            }
        });
        
        // Add reload/refresh button
        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'Refresh';
        refreshButton.style.cssText = STYLES.button;
        refreshButton.className = 'spl-button';
        refreshButton.onclick = () => {
            location.reload();
        };
        
        // Add control elements
        controlsRight.appendChild(fullScreenButton);
        controlsRight.appendChild(downloadButton);
        controlsRight.appendChild(refreshButton);
        
        controlBar.appendChild(titleElement);
        controlBar.appendChild(controlsRight);
        
        // Video iframe
        const videoElement = document.createElement('iframe');
        videoElement.src = videoUrl;
        videoElement.style.cssText = STYLES.video;
        videoElement.allowFullscreen = true;
        
        // Handle errors from iframe (like blocked resources)
        videoElement.addEventListener('error', (e) => {
            console.warn('Video iframe encountered an error:', e);
            // We don't need to do anything here, just prevent unhandled errors
        });
        
        // Assemble player
        playerContainer.appendChild(controlBar);
        playerContainer.appendChild(videoElement);
        
        // Add to page
        document.body.appendChild(playerContainer);
    }
    
    /**
     * Shows download help information for users
     * @param {string} videoId - The Vimeo video ID
     */
    function showDownloadHelp(videoId) {
        const helpOverlay = document.createElement('div');
        helpOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.8); z-index: 10000; display: flex; justify-content: center; align-items: center;';
        
        const helpContent = document.createElement('div');
        helpContent.style.cssText = 'background-color: #2a2a2a; color: white; padding: 20px; border-radius: 5px; max-width: 600px; max-height: 80vh; overflow-y: auto;';
        
        helpContent.innerHTML = `
            <h3 style="color: #3498db; margin-top: 0;">Download Help</h3>
            <p>This video uses a format that couldn't be automatically downloaded. Try these methods:</p>
            
            <h4>Method 1: Browser Tools</h4>
            <ol>
                <li>Open browser Developer Tools (F12 or Ctrl+Shift+I)</li>
                <li>Go to the Network tab</li>
                <li>Refresh the page and look for files ending in .mp4 or .m3u8</li>
                <li>Right-click on these files and select "Save as" or "Copy URL"</li>
            </ol>
            
            <h4>Method 2: External Tools</h4>
            <ol>
                <li>Install a browser extension: "Video DownloadHelper" or "Stream Recorder"</li>
                <li>Or use youtube-dl command line tool: <code>youtube-dl https://vimeo.com/${videoId}</code></li>
            </ol>
            
            <h4>Method 3: Alternative Sources</h4>
            <p>Try opening the video with the Referer control extension:</p>
            <ol>
                <li>Install "Referer Control" extension</li>
                <li>Configure it to use "https://www.patreon.com" as referer for vimeo.com</li>
                <li>Try accessing: <code>https://player.vimeo.com/video/${videoId}</code></li>
            </ol>
            
            <button id="close-help" style="background-color: #3498db; color: white; border: none; padding: 8px 15px; border-radius: 3px; cursor: pointer; margin-top: 15px;">Close</button>
        `;
        
        helpOverlay.appendChild(helpContent);
        document.body.appendChild(helpOverlay);
        
        document.getElementById('close-help').onclick = () => {
            document.body.removeChild(helpOverlay);
        };
    }

    /**
     * Enhanced error handler with more descriptive messages
     * @param {Error} error - The error object or message
     */
    function handleError(error) {
        console.error('SPL Error:', error);
        
        // Clear any existing loading UI
        document.querySelectorAll('.spl-fade-in').forEach(el => el.remove());
        
        // Create error container
        const errorContainer = document.createElement('div');
        errorContainer.style.cssText = STYLES.errorContainer;
        errorContainer.className = 'spl-fade-in';
        
        let errorMessage, errorHelp;
        
        // Determine error type and provide helpful message
        if (error.message.includes('URL format')) {
            errorMessage = 'Invalid Vimeo URL detected';
            errorHelp = 'Please check that you\'re on a valid Vimeo video page.';
        } else if (error.message.includes('timed out')) {
            errorMessage = 'Request Timeout';
            errorHelp = 'The server took too long to respond. This may be due to network issues or Vimeo blocking the request.';
        } else if (error.message.includes('403')) {
            errorMessage = 'Access Forbidden';
            errorHelp = 'Vimeo has blocked access to this video. The content provider may have implemented additional restrictions.';
        } else if (error.message.includes('404')) {
            errorMessage = 'Video Not Found';
            errorHelp = 'The requested video doesn\'t exist or has been removed.';
        } else if (error.message.includes('sources')) {
            errorMessage = 'Video Extraction Failed';
            errorHelp = 'Could not extract video source information. Vimeo may have changed their player format.';
        } else {
            errorMessage = 'Failed to Load Video';
            errorHelp = 'An unexpected error occurred. Please try again later or report this issue.';
        }
        
        // Build error UI
        const errorTitle = document.createElement('h3');
        errorTitle.textContent = errorMessage;
        errorTitle.style.color = '#ff6b6b';
        
        const errorDetails = document.createElement('p');
        errorDetails.textContent = errorHelp;
        
        const errorTechnical = document.createElement('p');
        errorTechnical.textContent = `Technical details: ${error.message || 'Unknown error'}`;
        errorTechnical.style.fontSize = '12px';
        errorTechnical.style.color = '#999';
        
        const retryButton = document.createElement('button');
        retryButton.textContent = 'Try Again';
        retryButton.style.cssText = STYLES.button;
        retryButton.style.marginTop = '15px';
        retryButton.className = 'spl-button';
        retryButton.onclick = () => {
            location.reload();
        };
        
        errorContainer.appendChild(errorTitle);
        errorContainer.appendChild(errorDetails);
        errorContainer.appendChild(errorTechnical);
        errorContainer.appendChild(retryButton);
        
        document.body.appendChild(errorContainer);
    }

    /**
     * Parse an HLS playlist and extract stream details
     * @param {string} m3u8Content - The M3U8 playlist content
     * @param {string} baseUrl - Base URL for resolving relative URLs
     * @returns {Object} Object with streams and segments
     */
    function parseHlsPlaylist(m3u8Content, baseUrl) {
        // Check if this is a master playlist
        if (m3u8Content.includes('#EXT-X-STREAM-INF')) {
            console.log('Parsing master playlist');
            const streams = [];
            const audioStreams = [];
            const lines = m3u8Content.split('\n');
            
            let currentStream = null;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (line.startsWith('#EXT-X-STREAM-INF:')) {
                    currentStream = { attributes: {}, url: '', type: 'video' };
                    
                    // Parse attributes
                    const attributesStr = line.substring(18);
                    const attributes = attributesStr.split(',');
                    
                    attributes.forEach(attr => {
                        const [key, value] = attr.split('=');
                        if (key && value) {
                            currentStream.attributes[key.trim()] = value.trim().replace(/"/g, '');
                        }
                    });
                    
                    // Extract resolution and bandwidth
                    if (currentStream.attributes.RESOLUTION) {
                        currentStream.resolution = currentStream.attributes.RESOLUTION;
                    }
                    if (currentStream.attributes.BANDWIDTH) {
                        currentStream.bandwidth = parseInt(currentStream.attributes.BANDWIDTH);
                    }
                    if (currentStream.attributes['FRAME-RATE']) {
                        currentStream.frameRate = parseFloat(currentStream.attributes['FRAME-RATE']);
                    }
                    if (currentStream.attributes.CODECS) {
                        currentStream.codecs = currentStream.attributes.CODECS;
                    }
                    if (currentStream.attributes.AUDIO) {
                        currentStream.audioGroup = currentStream.attributes.AUDIO;
                    }
                    
                    // Check if this stream has audio
                    const codecs = currentStream.attributes.CODECS || '';
                    currentStream.hasAudio = codecs.includes('mp4a') || codecs.includes('aac') || !codecs.includes('avc1');
                    
                } else if (line && !line.startsWith('#') && currentStream) {
                    // This is a URL
                    currentStream.url = resolveUrl(line, baseUrl);
                    streams.push(currentStream);
                    currentStream = null;
                } else if (line.startsWith('#EXT-X-MEDIA:') && line.includes('TYPE=AUDIO')) {
                    // Parse audio-only stream
                    const audioStream = { attributes: {}, type: 'AUDIO', url: '' };
                    
                    // Extract attributes
                    const attrRegex = /([A-Z0-9-]+)=("([^"]*)"|([^,]*))/g;
                    let match;
                    
                    while ((match = attrRegex.exec(line)) !== null) {
                        const key = match[1];
                        const value = match[3] || match[4];
                        audioStream.attributes[key] = value;
                    }
                    
                    // If this audio stream has a URI, add it
                    if (audioStream.attributes.URI) {
                        audioStream.url = resolveUrl(audioStream.attributes.URI, baseUrl);
                        audioStream.groupId = audioStream.attributes['GROUP-ID'];
                        audioStream.name = audioStream.attributes.NAME || 'Audio Track';
                        audioStream.isAudioOnly = true;
                        audioStreams.push(audioStream);
                    }
                }
            }
            
            // Sort streams by bandwidth (highest first)
            streams.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
            
            return {
                type: 'master',
                streams: streams,
                audioStreams: audioStreams
            };
        } else {
            // This is a media playlist
            console.log('Parsing media playlist');
            const segments = [];
            const lines = m3u8Content.split('\n');
            
            let currentSegment = null;
            let baseSegmentUrl = baseUrl;
            
            // Extract playlist attributes
            const playlistAttributes = {};
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (line.startsWith('#EXT-X-')) {
                    // Extract playlist attribute
                    const attributeLine = line.substring(7);
                    const colonIndex = attributeLine.indexOf(':');
                    
                    if (colonIndex !== -1) {
                        const key = attributeLine.substring(0, colonIndex);
                        const value = attributeLine.substring(colonIndex + 1);
                        playlistAttributes[key] = value;
                    }
                } else if (line.startsWith('#EXTINF:')) {
                    // Duration info
                    currentSegment = { 
                        duration: parseFloat(line.substring(8).split(',')[0]),
                        url: ''
                    };
                } else if (line && !line.startsWith('#') && currentSegment) {
                    // This is a segment URL
                    currentSegment.url = resolveUrl(line, baseSegmentUrl);
                    segments.push(currentSegment);
                    currentSegment = null;
                }
            }
            
            return {
                type: 'media',
                segments: segments,
                attributes: playlistAttributes
            };
        }
    }
    
    /**
     * Resolve relative URL against a base URL
     * @param {string} url - The URL to resolve
     * @param {string} base - The base URL
     * @returns {string} Resolved URL
     */
    function resolveUrl(url, base) {
        if (url.startsWith('http')) {
            return url;
        }
        
        // Handle relative paths
        if (url.startsWith('/')) {
            const baseUrl = new URL(base);
            return `${baseUrl.protocol}//${baseUrl.host}${url}`;
        }
        
        // Handle parent directory paths
        if (url.startsWith('../')) {
            const baseDir = base.substring(0, base.lastIndexOf('/'));
            return resolveUrl(url.substring(3), baseDir.substring(0, baseDir.lastIndexOf('/') + 1));
        }
        
        // Regular relative path
        const lastSlash = base.lastIndexOf('/');
        return base.substring(0, lastSlash + 1) + url;
    }
    
    /**
     * Fetch and parse HLS stream data to extract quality options
     * @param {string} m3u8Url - The M3U8 URL
     * @param {Function} callback - Callback function with results
     */
    function fetchHlsStreamData(m3u8Url, callback) {
        console.log('Fetching HLS stream data from:', m3u8Url);
        
        GM_xmlhttpRequest({
            method: 'GET',
            url: m3u8Url,
            headers: {
                'Referer': 'https://www.patreon.com',
                'User-Agent': CONFIG.userAgent
            },
            onload: function(response) {
                if (response.status !== 200) {
                    callback(new Error(`Failed to fetch HLS data: ${response.status}`), null);
                    return;
                }
                
                try {
                    const playlistData = parseHlsPlaylist(response.responseText, m3u8Url);
                    
                    if (playlistData.type === 'master') {
                        // Process streams
                        const qualityOptions = [];
                        
                        // Process video streams
                        playlistData.streams.forEach(stream => {
                            let label = 'Unknown';
                            
                            if (stream.resolution) {
                                label = stream.resolution;
                                // Extract height from resolution (like 1920x1080)
                                const heightMatch = stream.resolution.match(/\d+x(\d+)/);
                                if (heightMatch) {
                                    label = `${heightMatch[1]}p`;
                                    if (stream.frameRate && stream.frameRate >= 50) {
                                        label += ` ${Math.round(stream.frameRate)}fps`;
                                    }
                                }
                            }
                            
                            qualityOptions.push({
                                label: label,
                                bandwidth: stream.bandwidth,
                                url: stream.url,
                                codecs: stream.codecs,
                                resolution: stream.resolution,
                                audioGroup: stream.audioGroup,
                                attributes: stream.attributes
                            });
                        });
                        
                        // Process audio-only streams
                        playlistData.audioStreams.forEach(audioStream => {
                            qualityOptions.push({
                                label: audioStream.name || 'Audio Track',
                                url: audioStream.url,
                                isAudioOnly: true,
                                groupId: audioStream.groupId,
                                name: audioStream.name,
                                attributes: audioStream.attributes,
                                language: audioStream.attributes.LANGUAGE || 'Unknown'
                            });
                        });
                        
                        callback(null, {
                            type: 'master',
                            qualities: qualityOptions
                        });
                    } else {
                        // This is a media playlist
                        callback(null, {
                            type: 'media',
                            segments: playlistData.segments,
                            attributes: playlistData.attributes
                        });
                    }
                } catch (e) {
                    console.error('Error parsing M3U8:', e);
                    callback(e, null);
                }
            },
            onerror: function(error) {
                console.error('Error fetching M3U8:', error);
                callback(error, null);
            }
        });
    }
    
    /**
     * Download HLS segments and merge into a complete file
     * @param {string} m3u8Url - The HLS stream URL
     * @param {string} filename - Target filename
     * @param {Function} progressCallback - Callback for progress updates
     */
    function downloadHlsStream(m3u8Url, filename, progressCallback) {
        console.log('Starting HLS download:', m3u8Url);
        
        fetchHlsStreamData(m3u8Url, (error, data) => {
            if (error) {
                progressCallback(0, 'error', error);
                return;
            }
            
            // Check if this is an audio-only stream
            const isAudioOnly = m3u8Url.includes('st=audio') || m3u8Url.includes('media.m3u8') && filename.includes('audio');
            
            if (data.type === 'master') {
                // This is a master playlist, get the highest quality
                if (data.qualities.length === 0) {
                    progressCallback(0, 'error', new Error('No playable streams found in HLS master playlist'));
                    return;
                }
                
                // Check if we're explicitly trying to download an audio stream
                if (isAudioOnly) {
                    // Find audio-only streams
                    const audioStreams = data.qualities.filter(q => q.isAudioOnly);
                    if (audioStreams.length > 0) {
                        progressCallback(0, 'info', `Selected audio track: ${audioStreams[0].name || 'Audio Track'}`);
                        
                        // Fetch the media playlist for this audio
                        fetchHlsStreamData(audioStreams[0].url, (mediaError, mediaData) => {
                            if (mediaError) {
                                progressCallback(0, 'error', mediaError);
                                return;
                            }
                            
                            if (mediaData.type !== 'media' || !mediaData.segments || mediaData.segments.length === 0) {
                                progressCallback(0, 'error', new Error('Invalid media playlist or no segments found'));
                                return;
                            }
                            
                            // Download audio segments
                            progressCallback(0, 'info', 'Downloading audio track...');
                            downloadSegments(mediaData.segments, filename.replace('.mp4', '.m4a'), progressCallback);
                        });
                        return;
                    }
                }
                
                // Select the highest quality stream WITH AUDIO if possible
                let selectedQuality = data.qualities[0];
                
                // First try to find a stream that has audio included
                for (const quality of data.qualities) {
                    if (!quality.isAudioOnly && quality.codecs && quality.codecs.includes('mp4a')) {
                        selectedQuality = quality;
                        break;
                    }
                }
                
                progressCallback(0, 'info', `Selected quality: ${selectedQuality.label}`);
                
                // Fetch the media playlist for this quality
                fetchHlsStreamData(selectedQuality.url, (mediaError, mediaData) => {
                    if (mediaError) {
                        progressCallback(0, 'error', mediaError);
                        return;
                    }
                    
                    if (mediaData.type !== 'media' || !mediaData.segments || mediaData.segments.length === 0) {
                        progressCallback(0, 'error', new Error('Invalid media playlist or no segments found'));
                        return;
                    }
                    
                    // Check if the media stream has audio, if not try to find separate audio stream
                    if (selectedQuality.codecs && !selectedQuality.codecs.includes('mp4a') && selectedQuality.audioGroup) {
                        progressCallback(0, 'info', 'Video has no embedded audio, checking for separate audio stream...');
                        
                        // Try to find an audio stream that matches
                        const audioStreams = data.qualities.filter(q => 
                            q.isAudioOnly && q.groupId === selectedQuality.audioGroup
                        );
                        
                        if (audioStreams.length > 0) {
                            progressCallback(0, 'info', `Found matching audio stream: ${audioStreams[0].name || 'Audio Track'}`);
                            
                            // Fetch the audio stream and then combine
                            fetchHlsStreamData(audioStreams[0].url, (audioError, audioData) => {
                                if (audioError) {
                                    // Continue with video only if audio fails
                                    progressCallback(0, 'info', 'Audio stream failed, continuing with video only');
                                    downloadSegments(mediaData.segments, filename, progressCallback);
                                    return;
                                }
                                
                                if (audioData.type === 'media' && audioData.segments && audioData.segments.length > 0) {
                                    // Download both video and audio segments and combine them
                                    downloadVideoAndAudioSegments(
                                        mediaData.segments,
                                        audioData.segments,
                                        filename,
                                        progressCallback
                                    );
                                } else {
                                    // Continue with video only
                                    progressCallback(0, 'info', 'Audio stream data invalid, continuing with video only');
                                    downloadSegments(mediaData.segments, filename, progressCallback);
                                }
                            });
                            return;
                        } else {
                            progressCallback(0, 'info', 'No matching audio stream found, continuing with video only');
                        }
                    }
                    
                    // No separate audio stream found or not needed, download video segments only
                    downloadSegments(mediaData.segments, filename, progressCallback);
                });
            } else if (data.type === 'media') {
                // This is already a media playlist
                if (!data.segments || data.segments.length === 0) {
                    progressCallback(0, 'error', new Error('No segments found in HLS media playlist'));
                    return;
                }
                
                // Check if this is likely an audio stream based on the URL
                if (isAudioOnly) {
                    progressCallback(0, 'info', 'Detected audio-only stream');
                    downloadSegments(data.segments, filename.replace('.mp4', '.m4a'), progressCallback);
                } else {
                    downloadSegments(data.segments, filename, progressCallback);
                }
            }
        });
    }
    
    /**
     * Download and combine both video and audio HLS segments
     * @param {Array} videoSegments - Array of video segment objects
     * @param {Array} audioSegments - Array of audio segment objects
     * @param {string} filename - Target filename
     * @param {Function} progressCallback - Callback for progress updates
     */
    function downloadVideoAndAudioSegments(videoSegments, audioSegments, filename, progressCallback) {
        const totalSegments = videoSegments.length + audioSegments.length;
        let downloadedSegments = 0;
        let downloadedBytes = 0;
        
        let videoChunks = new Array(videoSegments.length);
        let audioChunks = new Array(audioSegments.length);
        
        let activeDownloads = 0;
        let errorOccurred = false;
        
        progressCallback(0, 'info', `Starting download of ${videoSegments.length} video and ${audioSegments.length} audio segments`);
        
        // Function to check if all downloads are complete
        const checkAllComplete = () => {
            if (downloadedSegments === totalSegments) {
                progressCallback(1, 'info', 'All segments downloaded, merging video and audio...');
                
                // Combine segments and save file using external tool like FFmpeg (would need server-side process)
                // For now, we'll just concatenate video segments since we don't have access to ffmpeg in the browser
                // In the future, could use Media Source Extensions or WebAssembly version of FFmpeg
                
                // Combine video segments
                let combinedVideoSize = 0;
                videoChunks.forEach(chunk => {
                    if (chunk) combinedVideoSize += chunk.byteLength;
                });
                
                const combinedVideo = new Uint8Array(combinedVideoSize);
                let videoOffset = 0;
                
                videoChunks.forEach(chunk => {
                    if (chunk) {
                        combinedVideo.set(new Uint8Array(chunk), videoOffset);
                        videoOffset += chunk.byteLength;
                    }
                });
                
                // For now, save the video without audio
                // In a complete solution, we would use FFmpeg to properly mux the audio and video
                const blob = new Blob([combinedVideo], { type: 'video/mp4' });
                const url = URL.createObjectURL(blob);
                
                // Inform user about the limitation
                progressCallback(1, 'info', 'Note: For full audio support, use the "Save HLS Stream" option');
                
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                
                // Clean up
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 100);
                
                progressCallback(1, 'complete', { size: combinedVideoSize });
            }
        };
        
        // Download function for a single segment
        const downloadSegment = (url, isVideo, index, callback) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                headers: {
                    'Referer': 'https://www.patreon.com',
                    'User-Agent': CONFIG.userAgent
                },
                onload: function(response) {
                    if (response.status !== 200) {
                        callback(new Error(`HTTP ${response.status}`), null);
                        return;
                    }
                    
                    callback(null, response.response);
                },
                onerror: function(error) {
                    callback(error || new Error('Network error'), null);
                }
            });
        };
        
        // Start downloading video segments
        const downloadNextVideoBatch = (startIndex) => {
            if (errorOccurred) return;
            
            const endIndex = Math.min(startIndex + CONFIG.maxConcurrentDownloads, videoSegments.length);
            
            for (let i = startIndex; i < endIndex; i++) {
                if (errorOccurred) break;
                
                activeDownloads++;
                const segment = videoSegments[i];
                
                downloadSegment(segment.url, true, i, (error, data) => {
                    if (errorOccurred) return;
                    
                    activeDownloads--;
                    
                    if (error) {
                        console.error(`Error downloading video segment ${i}:`, error);
                        progressCallback(0, 'info', `Error on video segment ${i}, continuing...`);
                    } else {
                        videoChunks[i] = data;
                        downloadedBytes += data.byteLength;
                    }
                    
                    downloadedSegments++;
                    
                    const progress = downloadedSegments / totalSegments;
                    progressCallback(progress, 'progress', {
                        segment: downloadedSegments,
                        totalSegments: totalSegments,
                        bytes: downloadedBytes
                    });
                    
                    if (activeDownloads < CONFIG.maxConcurrentDownloads && endIndex < videoSegments.length) {
                        downloadNextVideoBatch(endIndex);
                    }
                    
                    // Check if we should start audio downloads
                    if (downloadedSegments >= videoSegments.length * 0.5 && 
                        !audioDownloadsStarted && activeDownloads < CONFIG.maxConcurrentDownloads) {
                        startAudioDownloads();
                    }
                    
                    checkAllComplete();
                });
            }
        };
        
        // Flag to track if audio downloads have started
        let audioDownloadsStarted = false;
        
        // Start downloading audio segments
        const startAudioDownloads = () => {
            if (audioDownloadsStarted) return;
            audioDownloadsStarted = true;
            
            progressCallback(downloadedSegments / totalSegments, 'info', 'Starting audio download...');
            
            let audioIndex = 0;
            
            const downloadNextAudioBatch = () => {
                if (errorOccurred) return;
                
                const endIndex = Math.min(audioIndex + CONFIG.maxConcurrentDownloads, audioSegments.length);
                
                for (let i = audioIndex; i < endIndex; i++) {
                    if (errorOccurred) break;
                    
                    activeDownloads++;
                    const segment = audioSegments[i];
                    
                    downloadSegment(segment.url, false, i, (error, data) => {
                        if (errorOccurred) return;
                        
                        activeDownloads--;
                        
                        if (error) {
                            console.error(`Error downloading audio segment ${i}:`, error);
                            progressCallback(0, 'info', `Error on audio segment ${i}, continuing...`);
                        } else {
                            audioChunks[i] = data;
                            downloadedBytes += data.byteLength;
                        }
                        
                        downloadedSegments++;
                        
                        const progress = downloadedSegments / totalSegments;
                        progressCallback(progress, 'progress', {
                            segment: downloadedSegments,
                            totalSegments: totalSegments,
                            bytes: downloadedBytes
                        });
                        
                        if (activeDownloads < CONFIG.maxConcurrentDownloads && audioIndex < audioSegments.length) {
                            audioIndex = endIndex;
                            downloadNextAudioBatch();
                        }
                        
                        checkAllComplete();
                    });
                }
                
                audioIndex = endIndex;
            };
            
            downloadNextAudioBatch();
        };
        
        // Start with video downloads
        downloadNextVideoBatch(0);
    }

    /**
     * Download and combine HLS segments
     * @param {Array} segments - Array of segment objects with URLs
     * @param {string} filename - Target filename
     * @param {Function} progressCallback - Callback for progress updates
     */
    function downloadSegments(segments, filename, progressCallback) {
        const totalSegments = segments.length;
        let downloadedSegments = 0;
        let downloadedBytes = 0;
        let segmentChunks = [];
        let activeDownloads = 0;
        let errorOccurred = false;
        
        progressCallback(0, 'info', `Starting download of ${totalSegments} segments`);
        
        // Download segments in manageable chunks
        const downloadNextBatch = (startIndex) => {
            if (errorOccurred) return;
            
            const endIndex = Math.min(startIndex + CONFIG.maxConcurrentDownloads, totalSegments);
            
            for (let i = startIndex; i < endIndex; i++) {
                if (errorOccurred) break;
                
                activeDownloads++;
                const segment = segments[i];
                const segmentIndex = i;
                
                downloadSegment(segment.url, segmentIndex, (error, data) => {
                    if (errorOccurred) return;
                    
                    activeDownloads--;
                    
                    if (error) {
                        console.error(`Error downloading segment ${segmentIndex}:`, error);
                        errorOccurred = true;
                        progressCallback(0, 'error', new Error(`Failed to download segment ${segmentIndex}: ${error.message}`));
                        return;
                    }
                    
                    segmentChunks[segmentIndex] = data;
                    downloadedSegments++;
                    downloadedBytes += data.byteLength;
                    
                    const progress = downloadedSegments / totalSegments;
                    progressCallback(progress, 'progress', {
                        segment: downloadedSegments,
                        totalSegments: totalSegments,
                        bytes: downloadedBytes
                    });
                    
                    // Check if we need to start more downloads
                    if (activeDownloads < CONFIG.maxConcurrentDownloads && endIndex < totalSegments) {
                        downloadNextBatch(endIndex);
                    }
                    
                    // Check if all segments are downloaded
                    if (downloadedSegments === totalSegments) {
                        // All segments downloaded, combine them
                        progressCallback(1, 'info', 'All segments downloaded, merging...');
                        combineSegments(segmentChunks, filename, progressCallback);
                    }
                });
            }
        };
        
        // Start downloading the first batch
        downloadNextBatch(0);
    }

    /**
     * Download a single HLS segment
     * @param {string} url - The segment URL
     * @param {number} index - Segment index for ordering
     * @param {Function} callback - Callback function with result
     */
    function downloadSegment(url, index, callback) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            headers: {
                'Referer': 'https://www.patreon.com',
                'User-Agent': CONFIG.userAgent
            },
            onload: function(response) {
                if (response.status !== 200) {
                    callback(new Error(`HTTP ${response.status}`), null);
                    return;
                }
                
                callback(null, response.response);
            },
            onerror: function(error) {
                callback(error || new Error('Network error'), null);
            }
        });
    }

    /**
     * Combine segment ArrayBuffers into a single file and save
     * @param {Array} segmentChunks - Array of ArrayBuffers
     * @param {string} filename - Target filename
     * @param {Function} progressCallback - Callback for progress updates
     */
    function combineSegments(segmentChunks, filename, progressCallback) {
        try {
            // Calculate total size
            let totalSize = 0;
            segmentChunks.forEach(chunk => {
                if (chunk) {
                    totalSize += chunk.byteLength;
                }
            });
            
            // Create combined buffer
            const combined = new Uint8Array(totalSize);
            let offset = 0;
            
            segmentChunks.forEach(chunk => {
                if (chunk) {
                    combined.set(new Uint8Array(chunk), offset);
                    offset += chunk.byteLength;
                }
            });
            
            // Create blob and download
            const blob = new Blob([combined], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            
            // Clean up
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            
            progressCallback(1, 'complete', { size: totalSize });
        } catch (e) {
            console.error('Error combining segments:', e);
            progressCallback(1, 'error', e);
        }
    }

    /**
     * Shows HLS quality selection dialog
     * @param {string} m3u8Url - The HLS master playlist URL
     * @param {string} videoId - The video ID
     * @param {string} title - The video title
     */
    function showHlsQualityDialog(m3u8Url, videoId, title) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.8); z-index: 10000; display: flex; justify-content: center; align-items: center;';
        
        const dialogContainer = document.createElement('div');
        dialogContainer.style.cssText = 'background-color: #2a2a2a; color: white; padding: 20px; border-radius: 5px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;';
        
        dialogContainer.innerHTML = `
            <h3 style="color: #3498db; margin-top: 0;">HLS Stream Download</h3>
            <p>Analyzing available video qualities...</p>
            <div class="hls-spinner" style="border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; width: 30px; height: 30px; margin: 10px auto; animation: spin 1s linear infinite;"></div>
            <div class="quality-options" style="margin-top: 15px;"></div>
            <div class="audio-options" style="margin-top: 15px; border-top: 1px solid #444; padding-top: 10px; display: none;">
                <h4 style="margin-top: 0; color: #3498db;">Audio Tracks</h4>
                <div class="audio-tracks"></div>
            </div>
            <div style="margin-top: 15px; display: flex; justify-content: space-between;">
                <button id="close-hls-dialog" style="background-color: #95a5a6; color: white; border: none; padding: 8px 15px; border-radius: 3px; cursor: pointer;">Close</button>
                <button id="download-highest" style="background-color: #3498db; color: white; border: none; padding: 8px 15px; border-radius: 3px; cursor: pointer;">Download Highest Quality</button>
            </div>
            <div style="margin-top: 15px; font-size: 12px; color: #95a5a6;">
                <p>Note: For guaranteed audio+video playback, use the "Save HLS Stream (m3u8)" option and open in VLC or other media player.</p>
            </div>
        `;
        
        overlay.appendChild(dialogContainer);
        document.body.appendChild(overlay);
        
        // Close dialog
        document.getElementById('close-hls-dialog').onclick = () => {
            document.body.removeChild(overlay);
        };
        
        // Download highest quality
        document.getElementById('download-highest').onclick = () => {
            startHlsDownload(m3u8Url, title || `vimeo-${videoId}.mp4`);
            document.body.removeChild(overlay);
        };
        
        // Fetch stream data
        fetchHlsStreamData(m3u8Url, (error, data) => {
            if (error) {
                dialogContainer.innerHTML = `
                    <h3 style="color: #e74c3c; margin-top: 0;">Error</h3>
                    <p>Failed to analyze HLS stream: ${error.message}</p>
                    <button id="close-hls-dialog" style="background-color: #95a5a6; color: white; border: none; padding: 8px 15px; border-radius: 3px; cursor: pointer; margin-top: 15px;">Close</button>
                `;
                document.getElementById('close-hls-dialog').onclick = () => {
                    document.body.removeChild(overlay);
                };
                return;
            }
            
            if (data.type === 'master' && data.qualities && data.qualities.length > 0) {
                // Update dialog with quality options
                const qualityContainer = dialogContainer.querySelector('.quality-options');
                qualityContainer.innerHTML = '<p>Select video quality to download:</p>';
                
                // Remove spinner
                const spinner = dialogContainer.querySelector('.hls-spinner');
                if (spinner) spinner.remove();
                
                // Check if any quality has audio
                const hasQualityWithAudio = data.qualities.some(q => q.codecs && q.codecs.includes('mp4a'));
                
                // Display audio tracks section if available
                const audioContainer = dialogContainer.querySelector('.audio-options');
                const audioTracksContainer = dialogContainer.querySelector('.audio-tracks');
                
                // Filter out audio-only streams from the data
                const audioOnlyStreams = data.qualities.filter(q => q.isAudioOnly);
                
                // If we have separate audio-only streams, display them separately
                if (audioOnlyStreams.length > 0) {
                    audioContainer.style.display = 'block';
                    
                    audioOnlyStreams.forEach(audioStream => {
                        const audioOption = document.createElement('div');
                        audioOption.style.cssText = 'padding: 10px; background-color: #333; margin: 5px 0; border-radius: 3px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
                        
                        const audioName = audioStream.name || 'Audio Track';
                        const audioBitrate = audioStream.bandwidth ? formatBitrate(audioStream.bandwidth) : 'Unknown bitrate';
                        
                        audioOption.innerHTML = `
                            <div>
                                <span>🔊 ${audioName}</span>
                                <span style="color: #2ecc71; margin-left: 10px;">Audio Only</span>
                            </div>
                            <span>${audioBitrate}</span>
                        `;
                        
                        audioOption.onmouseover = () => {
                            audioOption.style.backgroundColor = '#3498db';
                        };
                        
                        audioOption.onmouseout = () => {
                            audioOption.style.backgroundColor = '#333';
                        };
                        
                        audioOption.onclick = () => {
                            startHlsDownload(audioStream.url, `${title || `vimeo-${videoId}`}_audio.mp4`);
                            document.body.removeChild(overlay);
                        };
                        
                        audioTracksContainer.appendChild(audioOption);
                    });
                }
                
                if (!hasQualityWithAudio && !audioOnlyStreams.length) {
                    // Warning about audio
                    const audioWarning = document.createElement('div');
                    audioWarning.style.cssText = 'background-color: #e74c3c; padding: 10px; border-radius: 3px; margin: 10px 0;';
                    audioWarning.innerHTML = `
                        <strong>Audio Warning:</strong> No streams with embedded audio detected. For best results:
                        <ol style="margin-top: 5px; margin-bottom: 5px;">
                            <li>Use the "Save HLS Stream (m3u8)" option in the Download menu</li>
                            <li>Open the saved file with VLC or other HLS-compatible player</li>
                        </ol>
                    `;
                    qualityContainer.appendChild(audioWarning);
                }
                
                // Filter out video streams (non-audio-only)
                const videoStreams = data.qualities.filter(q => !q.isAudioOnly);
                
                // Create quality options for video streams
                videoStreams.forEach((quality, index) => {
                    const qualityOption = document.createElement('div');
                    qualityOption.style.cssText = 'padding: 10px; background-color: #333; margin: 5px 0; border-radius: 3px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
                    
                    // Check if this quality has audio
                    const hasAudio = quality.codecs && quality.codecs.includes('mp4a');
                    const audioIndicator = hasAudio 
                        ? `<span style="color: #2ecc71; margin-left: 10px;">✓ Audio</span>` 
                        : `<span style="color: #e74c3c; margin-left: 10px;">❌ No Audio</span>`;
                    
                    qualityOption.innerHTML = `
                        <div>
                            <span>${quality.label || (quality.resolution || 'Unknown')}</span>
                            ${audioIndicator}
                        </div>
                        <span>${formatBitrate(quality.bandwidth)}</span>
                    `;
                    
                    qualityOption.onmouseover = () => {
                        qualityOption.style.backgroundColor = '#3498db';
                    };
                    
                    qualityOption.onmouseout = () => {
                        qualityOption.style.backgroundColor = '#333';
                    };
                    
                    qualityOption.onclick = () => {
                        startHlsDownload(quality.url, `${title || `vimeo-${videoId}`}_${quality.label || (quality.resolution || 'unknown')}.mp4`);
                        document.body.removeChild(overlay);
                    };
                    
                    qualityContainer.appendChild(qualityOption);
                });
                
                // Add VLC recommendation
                const vlcRecommendation = document.createElement('div');
                vlcRecommendation.style.cssText = 'margin-top: 15px; font-size: 12px; color: #95a5a6;';
                vlcRecommendation.innerHTML = `
                    <p><strong>Recommended:</strong> For best quality with audio, save the m3u8 file and open in VLC player.</p>
                `;
                qualityContainer.appendChild(vlcRecommendation);
            } else if (data.type === 'media') {
                dialogContainer.innerHTML = `
                    <h3 style="color: #3498db; margin-top: 0;">HLS Stream Download</h3>
                    <p>No quality options found, but you can download as a single file</p>
                    <div style="margin-top: 15px; display: flex; justify-content: space-between;">
                        <button id="close-hls-dialog" style="background-color: #95a5a6; color: white; border: none; padding: 8px 15px; border-radius: 3px; cursor: pointer;">Close</button>
                        <button id="download-direct" style="background-color: #3498db; color: white; border: none; padding: 8px 15px; border-radius: 3px; cursor: pointer;">Download</button>
                    </div>
                    <div style="margin-top: 15px; font-size: 12px; color: #95a5a6;">
                        <p>Note: If downloaded video has no audio, use the "Save HLS Stream (m3u8)" option and open in VLC or other media player.</p>
                    </div>
                `;
                
                document.getElementById('close-hls-dialog').onclick = () => {
                    document.body.removeChild(overlay);
                };
                
                document.getElementById('download-direct').onclick = () => {
                    startHlsDownload(m3u8Url, title || `vimeo-${videoId}.mp4`);
                    document.body.removeChild(overlay);
                };
            } else {
                dialogContainer.innerHTML = `
                    <h3 style="color: #e74c3c; margin-top: 0;">Error</h3>
                    <p>No downloadable HLS stream data found</p>
                    <button id="close-hls-dialog" style="background-color: #95a5a6; color: white; border: none; padding: 8px 15px; border-radius: 3px; cursor: pointer; margin-top: 15px;">Close</button>
                `;
                document.getElementById('close-hls-dialog').onclick = () => {
                    document.body.removeChild(overlay);
                };
            }
        });
    }
    
    /**
     * Format bitrate to human-readable string
     * @param {number} bitrate - Bitrate in bits per second
     * @returns {string} Formatted bitrate string
     */
    function formatBitrate(bitrate) {
        if (!bitrate) return '';
        
        if (bitrate >= 1000000) {
            return `${(bitrate / 1000000).toFixed(1)} Mbps`;
        } else {
            return `${(bitrate / 1000).toFixed(0)} Kbps`;
        }
    }
    
    /**
     * Start HLS download process with progress notification
     * @param {string} url - HLS stream URL
     * @param {string} filename - Target filename
     */
    function startHlsDownload(url, filename) {
        // Create download progress UI
        const notification = document.createElement('div');
        notification.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background-color: #2a2a2a; color: white; padding: 15px; border-radius: 5px; z-index: 10000; width: 300px; box-shadow: 0 4px 8px rgba(0,0,0,0.3);';
        notification.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: bold;">Downloading ${filename}</div>
            <div class="download-progress" style="width: 100%; height: 5px; background-color: #444; border-radius: 3px; overflow: hidden; margin-bottom: 10px;">
                <div class="progress-bar" style="width: 0%; height: 100%; background-color: #3498db; transition: width 0.3s;"></div>
            </div>
            <div class="download-status" style="font-size: 12px;">Preparing download...</div>
            <div class="segment-info" style="font-size: 12px; margin-top: 5px;"></div>
            <button class="cancel-button" style="background-color: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-top: 10px; font-size: 12px;">Cancel</button>
        `;
        
        document.body.appendChild(notification);
        
        const progressBar = notification.querySelector('.progress-bar');
        const statusText = notification.querySelector('.download-status');
        const segmentInfo = notification.querySelector('.segment-info');
        const cancelButton = notification.querySelector('.cancel-button');
        
        // Set cancel flag (for aborting download)
        let isCancelled = false;
        cancelButton.onclick = () => {
            isCancelled = true;
            statusText.textContent = 'Cancelling...';
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transition = 'opacity 0.5s';
                setTimeout(() => {
                    if (notification.parentNode) {
                        document.body.removeChild(notification);
                    }
                }, 500);
            }, 1500);
        };
        
        // Start download with progress updates
        downloadHlsStream(url, filename, (progress, status, data) => {
            if (isCancelled) return;
            
            switch (status) {
                case 'progress':
                    progressBar.style.width = `${Math.round(progress * 100)}%`;
                    statusText.textContent = `Downloading: ${Math.round(progress * 100)}%`;
                    if (data.segment && data.totalSegments) {
                        segmentInfo.textContent = `Downloading segment ${data.segment} of ${data.totalSegments} (${formatBytes(data.bytes)})`;
                    }
                    break;
                    
                case 'info':
                    statusText.textContent = data;
                    break;
                    
                case 'error':
                    statusText.textContent = `Error: ${data.message || 'Unknown error'}`;
                    notification.style.backgroundColor = '#e74c3c';
                    
                    // Remove notification after a delay
                    setTimeout(() => {
                        notification.style.opacity = '0';
                        notification.style.transition = 'opacity 0.5s';
                        setTimeout(() => {
                            if (notification.parentNode) {
                                document.body.removeChild(notification);
                            }
                        }, 500);
                    }, 5000);
                    break;
                    
                case 'complete':
                    progressBar.style.width = '100%';
                    statusText.textContent = 'Download complete!';
                    segmentInfo.textContent = `File size: ${formatBytes(data.size)}`;
                    notification.style.backgroundColor = '#27ae60';
                    
                    // Remove notification after a delay
                    setTimeout(() => {
                        notification.style.opacity = '0';
                        notification.style.transition = 'opacity 0.5s';
                        setTimeout(() => {
                            if (notification.parentNode) {
                                document.body.removeChild(notification);
                            }
                        }, 500);
                    }, 3000);
                    break;
            }
        });
    }

    /**
     * Script initialization point - now with more robust checking and retries
     */
    function init() {
        injectStyles();
        
        // If page is still loading, wait a bit for restricted content detection
        if (document.readyState !== 'complete') {
            window.addEventListener('load', () => {
                setTimeout(loadVimeoVideo, 500);
            });
        } else {
            // Small delay even if page is loaded to allow any dynamic content to settle
            setTimeout(loadVimeoVideo, 300);
        }
    }

    // Bootstrap the script
    init();
})();