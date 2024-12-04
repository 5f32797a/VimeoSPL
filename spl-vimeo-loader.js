// ==UserScript==
// @name         SPL (SimplePatreonLoader)
// @namespace    https://github.com/5f32797a
// @version      1.2
// @description  Simple Vimeo video loader
// @match        https://vimeo.com/*
// @grant        GM_xmlhttpRequest
// @source       https://github.com/5f32797a/VimeoSPL
// @supportURL   https://github.com/5f32797a/VimeoSPL/issues
// ==/UserScript==

(function() {
    'use strict';

    // Extract video ID from Vimeo URL
    function extractVimeoVideoId(url) {
        const match = url.match(/\/(\d+)(?:\?|$)/);
        return match ? match[1] : url.slice(-9);
    }

    // Main video loading function
    function loadVimeoVideo() {
        // Check if we're on a video page
        const videoPlayerElement = document.getElementsByClassName('exception_title iris_header')[0];
        if (!videoPlayerElement) return;

        const currentUrl = window.location.href;
        const videoId = extractVimeoVideoId(currentUrl);

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://player.vimeo.com/video/${videoId}`,
            headers: {
                'Referer': 'https://www.patreon.com'
            },
            responseType: 'blob',
            onload: function(response) {
                const videoBlob = response.response;
                const videoUrl = URL.createObjectURL(videoBlob);

                // Reset page
                document.body.innerHTML = '';
                document.documentElement.style.backgroundColor = '#212121';
                document.documentElement.style.color = '#ffffff';

                // Create video element
                const videoElement = document.createElement('iframe');
                videoElement.src = videoUrl;

                // Style the video
                Object.assign(videoElement.style, {
                    position: 'fixed',
                    top: '0',
                    left: '0',
                    width: '100%',
                    height: '100%',
                    border: 'none'
                });

                document.body.appendChild(videoElement);
            },
            onerror: function(error) {
                console.error('Error loading video:', error);
                alert('Failed to load video. Please check the URL or try again later.');
            }
        });
    }

    // Initialize script
    function init() {
        loadVimeoVideo();
    }

    // Run on page load
    init();
})();