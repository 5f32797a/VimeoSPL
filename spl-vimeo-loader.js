﻿// ==UserScript==
// @name         SPL (SimplePatreonLoader)
// @namespace    https://github.com/5f32797a
// @version      1.4
// @description  Simple Vimeo video loader
// @match        https://vimeo.com/*
// @grant        GM_xmlhttpRequest
// @source       https://github.com/5f32797a/VimeoSPL
// @supportURL   https://github.com/5f32797a/VimeoSPL/issues
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Extracts Vimeo video ID from URL using optimized regex pattern
     * Format: Matches /123456789 or 123456789 from any Vimeo URL variant
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
     * Main function to handle video loading process
     * - Checks if current page is a restricted video
     * - Creates loading overlay with spinner
     * - Initiates video request with Patreon referrer
     * @throws {Error} If video loading fails
     */
    function loadVimeoVideo() {
        try {
            const videoPlayerElement = document.querySelector('.exception_title.iris_header');
            if (!videoPlayerElement) {
                console.debug('Not a restricted video page, script not needed');
                return;
            }

            const videoId = extractVimeoVideoId(window.location.href);
            
            // Add black overlay and loading indicator with spinner animation
            const overlayElement = document.createElement('div');
            overlayElement.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: black; z-index: 9998;';
            document.body.appendChild(overlayElement);

            const loadingElement = document.createElement('div');
            loadingElement.innerHTML = `
                <div style="text-align: center;">
                    <div style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; margin: 0 auto 10px; animation: spin 1s linear infinite;"></div>
                    Loading video...
                </div>
            `;
            loadingElement.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; z-index: 9999; font-family: Arial, sans-serif;';
            
            // Add the spinner animation
            const styleSheet = document.createElement('style');
            styleSheet.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(styleSheet);
            document.body.appendChild(loadingElement);

            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://player.vimeo.com/video/${videoId}`,
                headers: {
                    'Referer': 'https://www.patreon.com',
                    'Cache-Control': 'no-cache'
                },
                responseType: 'blob',
                onload: function(response) {
                    const videoUrl = URL.createObjectURL(response.response);
                    setupVideoPlayer(videoUrl);
                },
                onerror: handleError
            });
        } catch (error) {
            handleError(error);
        }
    }

    /**
     * Sets up the video player interface
     * - Clears existing page content
     * - Creates full-screen iframe player
     * - Applies dark theme styling
     * @param {string} videoUrl - Blob URL of the video content
     */
    function setupVideoPlayer(videoUrl) {
        document.body.innerHTML = '';
        document.documentElement.style.cssText = 'background-color: #212121; color: #ffffff;';

        const videoElement = document.createElement('iframe');
        videoElement.src = videoUrl;
        videoElement.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; border: none;';
        
        document.body.appendChild(videoElement);
    }

    /**
     * Centralized error handler for all video loading failures
     * @param {Error} error - The error object or message
     */
    function handleError(error) {
        console.error('Error loading video:', error);
        alert('Failed to load video. Please check the URL or try again later.');
    }

    /**
     * Script initialization point
     */
    function init() {
        loadVimeoVideo();
    }

    // Bootstrap the script
    init();
})();