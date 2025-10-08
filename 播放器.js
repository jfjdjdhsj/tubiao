// ==UserScript==
// @name         浮动视频播放器 V3.5 (播放按钮移至右下角版) - 横屏裁剪带黑边 & 左右铺满修复版
// @namespace    http://tampermonkey.net/
// @version      3.5.2
// @description  修复了 V3.3 版本中播放按钮不显示的错误，并保留所有性能和智能适配功能。将浮动播放按钮移动到右下角，靠近底部导航栏。现在竖屏视频会自动裁剪成横屏并带黑边，且播放器会左右铺满屏幕。
// @author       AI Assistant
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @require      https://cdn.jsdelivr.net/npm/hls.js@1.5.0/dist/hls.min.js
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const PLAYER_ID = 'gm-floating-video-player';
    const TOGGLE_ID = 'gm-video-toggle-button';
    const DRAG_BUTTON_ID = 'gm-drag-handle-btn'; 
    const LONG_PRESS_DELAY = 300; 

    // 默认播放器尺寸（横屏时使用，现在主要用于计算宽高比，宽度由 window.innerWidth 决定）
    const DEFAULT_WIDTH = 600; 
    const MAX_HEIGHT_RATIO = 0.8; // 竖屏最大高度限制为视口高度的 80%

    let videoUrlCache = null; 
    let isFetching = false; 
    let currentPos = { x: 0, y: 0 }; 

    // ----------------------------------------------------
    // 1. CSS 样式 (核心修改区域)
    // ----------------------------------------------------
    GM_addStyle(`
        /* 播放器主体样式 (修改 width 和 max-width 以实现左右铺满) */
        #${PLAYER_ID} {
            position: fixed;
            top: 8%; 
            left: 50%; 
            transform: translate(-50%, 0); 
            
            width: 100vw; /* 修改：确保播放器宽度铺满整个视口 */
            height: auto;
            max-width: 100vw; /* 修改：确保播放器最大宽度也是整个视口 */
            max-height: 90vh; 

            background: rgba(0, 0, 0, 0.9); 
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08); 
            backdrop-filter: blur(5px); 
            -webkit-backdrop-filter: blur(5px);
            z-index: 99999;
            overflow: hidden;
            border-radius: 12px; 
            transition: box-shadow 0.2s, width 0.3s, height 0.3s; 
            will-change: transform, width, height; 
            
            display: none; 
            flex-direction: column;
        }
        #${PLAYER_ID}.active {
             display: flex; 
        }

        /* 视频容器样式 (保持不变) */
        #${PLAYER_ID} .video-container {
             flex-grow: 1; 
             display: flex;
             justify-content: center;
             align-items: center;
             min-height: 250px; 
             background-color: black; 
        }

        /* 视频元素适配样式 (保持不变) */
        #${PLAYER_ID} video {
            display: block;
            width: 100%;
            height: 100%;
            max-width: 100%;
            max-height: 100%;
            object-fit: contain; 
            background-color: black; 
        }
        
        /* 其他顶部控制按钮样式 (保持不变) */
        #${PLAYER_ID} .header {
            flex-shrink: 0; 
            padding: 8px 15px; 
            background: linear-gradient(180deg, rgba(30, 30, 30, 0.95), rgba(0, 0, 0, 0.95)); 
            color: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
            user-select: none;
            font-size: 14px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3); 
        }
        #${PLAYER_ID} .control-group {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        #${DRAG_BUTTON_ID} {
            cursor: default;
            font-size: 18px;
            padding: 0 8px;
            font-weight: 900;
            color: #9E9E9E; 
            user-select: none;
            transition: color 0.1s;
        }
        #${DRAG_BUTTON_ID}:hover {
            color: #FBC02D;
        }
        #${DRAG_BUTTON_ID}.active-drag {
             cursor: grabbing !important;
             color: #FFEB3B; 
        }
        #${PLAYER_ID} .custom-btn {
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
            padding: 4px 8px; 
            border-radius: 6px; 
            transition: background 0.2s, transform 0.1s;
            white-space: nowrap;
            border: none;
            background-color: rgba(255, 255, 255, 0.1);
            color: white;
            text-align: center;
        }
        #${PLAYER_ID} .custom-btn:hover {
            background-color: rgba(255, 255, 255, 0.2);
            transform: scale(1.02);
        }
        #${PLAYER_ID} #copy-btn {
            background-color: #00A86B; 
            color: white;
        }
        #${PLAYER_ID} .close-btn {
            font-size: 20px;
            font-weight: lighter;
            color: #FF5722; 
            cursor: pointer;
            padding: 2px 8px;
            border-radius: 4px;
            transition: color 0.1s, background-color 0.1s;
        }

        /* 浮动播放按钮 (保持不变) */
        #${TOGGLE_ID} {
            position: fixed;
            bottom: 20px;   /* 距离底部 20px */
            right: 80px;    /* 距离右侧 80px，靠近菜单按钮左侧 */
            left: auto;     /* 禁用左侧定位 */
            
            width: 40px;
            height: 40px;
            background-color: #E64A19; 
            color: white;
            border-radius: 50%;
            text-align: center;
            line-height: 40px;
            font-size: 20px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 8px rgba(0,0,0,0.5); 
            z-index: 99998;
            transition: transform 0.3s, background-color 0.3s;
        }
        #${TOGGLE_ID}.hidden {
            display: none;
        }
        .rotating {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `);

    // ----------------------------------------------------
    // 2. 增强链接搜索 & 3. GM_XHR (保持不变)
    // ----------------------------------------------------
    
    const VIDEO_FILE_REGEX = /(https?:\/\/[^\s"'<]*\.(m3u8|mp4|flv|webm|ogg)\b)/gi;
    const EXCLUDE_KEYWORDS = /(thumb|preview|vtt|sprite|subtitle)/i;

    function extractLinksFromNode(node, potentialLinks) { 
        if (!node) return;
        if (node.outerHTML) {
            let match;
            while ((match = VIDEO_FILE_REGEX.exec(node.outerHTML)) !== null) {
                if (match[0].length > 20) potentialLinks.push(match[0]);
            }
        }
        if (node.attributes) {
            for (let i = 0; i < node.attributes.length; i++) {
                const attr = node.attributes[i];
                if (attr.value && attr.value.match(VIDEO_FILE_REGEX)) {
                    let match;
                    while ((match = VIDEO_FILE_REGEX.exec(attr.value)) !== null) {
                        if (match[0].length > 20) potentialLinks.push(match[0]);
                    }
                }
            }
        }
        node.querySelectorAll('video, source').forEach(el => {
            if (el.src && el.src.startsWith('http')) {
                potentialLinks.push(el.src);
            }
        });
        node.querySelectorAll('script').forEach(script => {
            if (script.textContent) {
                 let match;
                 while ((match = VIDEO_FILE_REGEX.exec(script.textContent)) !== null) {
                    if (match[0].length > 20) potentialLinks.push(match[0]);
                }
            }
        });
        node.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) {
                extractLinksFromNode(el.shadowRoot, potentialLinks);
            }
        });
    }

    function findFirstFakeVideoLink() {
        let potentialLinks = [];
        extractLinksFromNode(document.body || document.documentElement, potentialLinks);
        const uniqueLinks = [...new Set(potentialLinks)];
        if (uniqueLinks.length === 0) return null;
        const filteredLinks = uniqueLinks.filter(link => {
            if (link.match(EXCLUDE_KEYWORDS)) {
                return false;
            }
            if (link.endsWith('.ts') && !link.includes('.m3u8')) {
                 return false;
            }
            if (link.length <= 50) {
                return false;
            }
            return true;
        });

        if (filteredLinks.length === 0) {
             return null;
        }

        return filteredLinks.sort((a, b) => b.length - a.length)[0];
    }

    function fetchRealVideoUrl(fakeUrl, callback) {
        if (isFetching) return;
        isFetching = true;

        if (fakeUrl.endsWith('.m3u8') || fakeUrl.includes('?st=') || fakeUrl.includes('?secure=')) {
            isFetching = false;
            return callback(fakeUrl);
        }

        GM_xmlhttpRequest({
            method: 'HEAD', 
            url: fakeUrl,
            headers: { 'Referer': null },
            onload: function(response) {
                isFetching = false;
                const finalUrl = response.finalUrl || fakeUrl;
                
                if (response.status === 200 || response.finalUrl) {
                    callback(finalUrl);
                } else {
                    callback(fakeUrl);
                }
            },
            onerror: function(error) {
                isFetching = false;
                callback(fakeUrl);
            }
        });
    }

    // ----------------------------------------------------
    // 4. 播放、复制、拖动功能 (核心修改区域)
    // ----------------------------------------------------

    function pauseOtherVideos(currentVideoElement) { 
        const allVideos = [];
        function findVideosRecursively(root) {
             root.querySelectorAll('video').forEach(v => allVideos.push(v));
             root.querySelectorAll('*').forEach(el => {
                if (el.shadowRoot) {
                    findVideosRecursively(el.shadowRoot);
                }
            });
        }
        findVideosRecursively(document.body || document.documentElement);
        allVideos.forEach(v => {
            if (v !== currentVideoElement && !v.paused) {
                try { v.pause(); } catch(e) {}
            }
        });
    }

    // !!! 以下是修改后的 adjustPlayerSize 函数，以实现左右铺满 !!!
    function adjustPlayerSize(videoElement) {
        const player = document.getElementById(PLAYER_ID);
        if (!player || player.dataset.sizeAdjusted) return;

        // videoWidth 和 videoHeight 在这里不再用于决定播放器本身的尺寸，
        // 而是由 CSS 的 object-fit: contain 来处理视频在容器内的适配。
        // 所以这里可以移除对它们的检查，或者保留用于未来的逻辑扩展。
        // 为了简化和聚焦于“左右铺满”的需求，我们暂时不依赖它们来决定播放器容器尺寸。
        // if (!videoElement.videoWidth || !videoElement.videoHeight) return;

        const headerHeight = player.querySelector('.header').offsetHeight || 40;

        // 视频播放器内容区域（.video-container）的期望目标宽高比。
        // 这确保了视频播放器始终是横向的。
        const TARGET_VIDEO_CONTAINER_ASPECT_RATIO = 16 / 9; // 常见的横向宽高比

        let targetPlayerWidth;
        let targetPlayerHeight;
        let targetVideoContainerHeight;

        // --- 步骤 1：播放器宽度始终铺满整个窗口 ---
        targetPlayerWidth = window.innerWidth;
        
        // 根据目标宽高比和全宽计算视频容器的理想高度
        targetVideoContainerHeight = targetPlayerWidth / TARGET_VIDEO_CONTAINER_ASPECT_RATIO;
        targetPlayerHeight = targetVideoContainerHeight + headerHeight;

        // --- 步骤 2：将播放器总高度限制在屏幕范围内 (90% 视口高度) ---
        const maxPlayerHeight = window.innerHeight * 0.9; // 播放器总体的最大高度

        if (targetPlayerHeight > maxPlayerHeight) {
            targetPlayerHeight = maxPlayerHeight;
            // 重新计算视频容器高度，以适应新的播放器总高度
            targetVideoContainerHeight = maxPlayerHeight - headerHeight;
            // 注意：targetPlayerWidth 保持为 window.innerWidth，不因高度限制而收缩宽度。
        }
        
        // --- 步骤 3：确保视频内容高度不超过窗口高度的某个比例 (MAX_HEIGHT_RATIO) ---
        const maxVideoContentHeightByWindow = window.innerHeight * MAX_HEIGHT_RATIO;
        if (targetVideoContainerHeight > maxVideoContentHeightByWindow) {
             targetVideoContainerHeight = maxVideoContentHeightByWindow;
             targetPlayerHeight = targetVideoContainerHeight + headerHeight;
             // targetPlayerWidth 保持为 window.innerWidth。
        }

        // --- 步骤 4：应用计算出的尺寸到播放器及其视频容器 ---
        player.style.width = `${targetPlayerWidth.toFixed(0)}px`;
        player.style.height = `${targetPlayerHeight.toFixed(0)}px`;
        player.querySelector('.video-container').style.minHeight = `${targetVideoContainerHeight.toFixed(0)}px`;

        player.dataset.sizeAdjusted = 'true';
    }


    function setupVideoPlayer(videoElement, videoUrl) {
        // 核心：监听视频元数据加载完成事件
        const oldListener = videoElement.onloadedmetadata;
        if (oldListener) {
            videoElement.removeEventListener('loadedmetadata', oldListener);
        }
        
        videoElement.addEventListener('loadedmetadata', function listener() {
             adjustPlayerSize(videoElement);
             videoElement.removeEventListener('loadedmetadata', listener);
        });

        if (typeof Hls !== 'undefined' && Hls.isSupported() && videoUrl.endsWith('.m3u8')) {
            const hls = new Hls();
            hls.loadSource(videoUrl);
            hls.attachMedia(videoElement);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                videoElement.play().then(() => {
                    pauseOtherVideos(videoElement);
                }).catch(error => { console.error("M3U8 自动播放失败 (请手动点击播放)。", error); });
            });
        } else {
            videoElement.src = videoUrl;
            videoElement.load();
            videoElement.play().then(() => {
                pauseOtherVideos(videoElement);
            }).catch(error => {
                 console.error("MP4 自动播放失败 (请手动点击播放)。", error);
            });
        }
        videoElement.addEventListener('play', () => {
             pauseOtherVideos(videoElement);
        });
    }
    
    function copyVideoUrl(url, button) { 
        const copyFn = typeof GM_setClipboard !== 'undefined' 
            ? GM_setClipboard 
            : (text) => navigator.clipboard.writeText(text);

        copyFn(url);
        button.textContent = '已复制!';
        
        setTimeout(() => {
            button.textContent = '复制链接';
        }, 2000);
    }

    function createAndPlayVideo() {
        if (!videoUrlCache) {
            alert("未找到有效的视频链接。请点击解析按钮重新解析。");
            return;
        }

        let player = document.getElementById(PLAYER_ID);
        const videoElement = document.getElementById('gm-actual-video');
        
        // 1. 如果播放器已存在，则处理显示/隐藏逻辑
        if (player) {
             if (player.classList.contains('active')) {
                 // 隐藏并暂停
                 if (videoElement) {
                     videoElement.pause();
                 }
                 player.classList.remove('active');
                 updateToggleButton('found'); 
             } else {
                 // 显示并尝试播放
                 player.classList.add('active');
                 updateToggleButton('close'); 
                 if (videoElement && videoElement.paused) {
                      videoElement.play().catch(e => console.log("尝试恢复播放失败"));
                 }
             }
             return;
        }

        // 2. 如果播放器不存在，则创建
        player = document.createElement('div');
        player.id = PLAYER_ID;
        player.removeAttribute('data-size-adjusted'); 
        document.body.appendChild(player);

        currentPos = { x: 0, y: 0 }; 

        // 默认先激活显示
        player.classList.add('active'); 
        updateToggleButton('close');

        // UI 结构
        player.innerHTML = `
            <div class="header">
                <div class="control-group">
                    <span id="reparse-btn" class="custom-btn" title="重新解析当前页面视频链接">🔄 解析</span>
                </div>
                <span id="${DRAG_BUTTON_ID}" title="长按拖动播放器">≡</span> 
                <div class="control-group">
                    <span id="speed-btn" class="custom-btn" title="点击切换播放速度">x1.0</span>
                    <span id="like-btn" class="custom-btn" style="font-size: 16px;" title="点赞/收藏">🤍</span>
                    <span id="copy-btn" class="custom-btn" title="复制视频链接">复制链接</span>
                    <span class="close-btn" title="关闭并暂停视频">✕</span>
                </div>
            </div>
            <div class="video-container">
                <video id="gm-actual-video" controls autoplay></video>
            </div>
        `;

        const newVideoElement = document.getElementById('gm-actual-video');
        
        // 设置所有事件监听器
        player.querySelector('.close-btn').onclick = () => {
             if (newVideoElement) {
                 newVideoElement.pause();
             }
             player.classList.remove('active');
             updateToggleButton('found'); 
        };
        
        enableDragging(player, document.getElementById(DRAG_BUTTON_ID)); 

        const reparseBtn = document.getElementById('reparse-btn');
        const speedBtn = document.getElementById('speed-btn');
        const likeBtn = document.getElementById('like-btn');
        const copyBtn = document.getElementById('copy-btn');
        let currentSpeed = 1.0;
        let isLiked = false;

        reparseBtn.addEventListener('click', () => {
             reparseBtn.classList.add('rotating');
             reparseBtn.textContent = '⌛ 解析中'; 
             
             videoUrlCache = null;
             attemptToFindAndSetupVideo('reparse').then(() => {
                 reparseBtn.classList.remove('rotating');
                 reparseBtn.textContent = '🔄 解析'; 
                 if (videoUrlCache) {
                     player.removeAttribute('data-size-adjusted');
                     setupVideoPlayer(newVideoElement, videoUrlCache);
                 } else {
                     alert("重新解析失败，未找到新视频链接。");
                 }
             });
        });

        speedBtn.addEventListener('click', () => {
            currentSpeed = currentSpeed === 1.0 ? 1.5 : (currentSpeed === 1.5 ? 2.0 : 1.0);
            newVideoElement.playbackRate = currentSpeed;
            speedBtn.textContent = `x${currentSpeed.toFixed(1)}`;
        });
        likeBtn.addEventListener('click', () => {
            isLiked = !isLiked;
            likeBtn.innerHTML = isLiked ? '❤️' : '🤍';
        });
        copyBtn.addEventListener('click', () => {
            copyVideoUrl(videoUrlCache, copyBtn);
        });

        // 最后播放视频
        setupVideoPlayer(newVideoElement, videoUrlCache);
    }

    // 拖动逻辑 (保持不变)
    function enableDragging(playerElement, dragHandle) { 
        let isDragging = false;
        let pressTimer = null;
        let offset = { x: 0, y: 0 }; 
        let rafId = null;

        if (!dragHandle) return;

        const startDrag = (clientX, clientY) => {
             const rect = playerElement.getBoundingClientRect();
             offset.x = clientX - (rect.left - currentPos.x);
             offset.y = clientY - (rect.top - currentPos.y);

             isDragging = true;
             dragHandle.classList.add('active-drag');
             
             if (playerElement.style.transform.includes('translate')) {
                  const initialTop = playerElement.offsetTop;
                  const initialLeft = playerElement.offsetLeft;

                  playerElement.style.top = `${initialTop + currentPos.y}px`;
                  playerElement.style.left = `${initialLeft + currentPos.x}px`;
                  playerElement.style.transform = 'none';
                  
                  currentPos = { x: 0, y: 0 };
             }
        };

        const updatePosition = (deltaX, deltaY) => {
             if (isDragging) {
                 currentPos.x = deltaX;
                 currentPos.y = deltaY;
                 playerElement.style.transform = `translate(${currentPos.x}px, ${currentPos.y}px)`;
                 rafId = null;
            }
        };

        const moveDrag = (clientX, clientY) => {
             if (isDragging && !rafId) {
                 const deltaX = clientX - offset.x - playerElement.offsetLeft; 
                 const deltaY = clientY - offset.y - playerElement.offsetTop;

                 rafId = requestAnimationFrame(() => updatePosition(deltaX, deltaY));
            }
        };

        const endDrag = () => {
            if (isDragging) {
                isDragging = false;
                dragHandle.classList.remove('active-drag');
            }
            if (rafId) {
                 cancelAnimationFrame(rafId);
                 rafId = null;
            }
            document.onmousemove = null;
            document.onmouseup = null;
            document.ontouchmove = null;
            document.ontouchend = null;
        };

        const startPress = (e, clientX, clientY) => {
            e.preventDefault(); 
            endDrag(); 
            
            pressTimer = setTimeout(() => {
                pressTimer = null;
                startDrag(clientX, clientY);
                document.onmousemove = (e) => moveDrag(e.clientX, e.clientY);
                document.onmouseup = endPress; 
                document.ontouchmove = (e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY);
                document.ontouchend = endPress; 
            }, LONG_PRESS_DELAY);
        };
        
        const endPress = (e) => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
            endDrag();
        };

        dragHandle.onmousedown = function(e) { startPress(e, e.clientX, e.clientY); };
        dragHandle.onmouseup = endPress;
        dragHandle.onmouseleave = endPress; 
        dragHandle.ontouchstart = function(e) { startPress(e, e.touches[0].clientX, e.touches[0].clientY); };
        dragHandle.ontouchend = endPress;
        dragHandle.ontouchcancel = endPress;
    }

    // ----------------------------------------------------
    // 5. 初始化和 DOM 监听 (保持不变)
    // ----------------------------------------------------

    function updateToggleButton(status) { 
        const toggleButton = document.getElementById(TOGGLE_ID);
        if (!toggleButton) return;
        
        toggleButton.removeEventListener('click', createAndPlayVideo);
        toggleButton.setAttribute('data-status', status); 
        
        if (status === 'fetching') {
             toggleButton.textContent = '⌛'; 
             toggleButton.classList.remove('hidden');
             toggleButton.style.pointerEvents = 'none';
        } else if (status === 'found') {
             toggleButton.textContent = '▶️';
             toggleButton.classList.remove('hidden');
             toggleButton.style.pointerEvents = 'auto';
             toggleButton.addEventListener('click', createAndPlayVideo);
        } else if (status === 'close') {
             toggleButton.textContent = '❌'; 
             toggleButton.classList.remove('hidden');
             toggleButton.style.pointerEvents = 'auto';
             toggleButton.addEventListener('click', createAndPlayVideo); 
        } else if (status === 'not_found') {
             toggleButton.textContent = '🔍'; 
             toggleButton.classList.add('hidden');
             toggleButton.style.pointerEvents = 'none';
        }
    }
    
    function attemptToFindAndSetupVideo(mode) { 
        return new Promise(resolve => {
            if (isFetching) {
                resolve();
                return;
            }
            
            if (document.getElementById(PLAYER_ID) && document.getElementById(PLAYER_ID).classList.contains('active') && mode !== 'reparse') {
                resolve();
                return;
            }

            videoUrlCache = null; 
            
            const fakeUrl = findFirstFakeVideoLink();
            
            if (fakeUrl) {
                 if (!document.getElementById(PLAYER_ID) && mode !== 'reparse') updateToggleButton('fetching');
                 
                 fetchRealVideoUrl(fakeUrl, (realUrl) => {
                     if (realUrl) {
                         videoUrlCache = realUrl;
                         if (!document.getElementById(PLAYER_ID) && mode !== 'reparse') updateToggleButton('found');
                         resolve();
                     } else {
                         videoUrlCache = fakeUrl; 
                         if (!document.getElementById(PLAYER_ID) && mode !== 'reparse') updateToggleButton('found');
                         resolve();
                     }
                 });

            } else {
                if (!document.getElementById(PLAYER_ID) && mode !== 'reparse') updateToggleButton('not_found');
                resolve();
            }
        });
    }

    function init() { 
        let toggleButton = document.getElementById(TOGGLE_ID);
        if (!toggleButton) {
            toggleButton = document.createElement('div');
            toggleButton.id = TOGGLE_ID;
            document.body.appendChild(toggleButton);
        }
        
        const player = document.getElementById(PLAYER_ID);
        if (player && player.classList.contains('active')) {
            updateToggleButton('close');
        } else {
            updateToggleButton('not_found');
        }

        setTimeout(() => attemptToFindAndSetupVideo('init'), 500); 

        const observer = new MutationObserver((mutationsList, observer) => {
            if (!document.getElementById(PLAYER_ID) || !document.getElementById(PLAYER_ID).classList.contains('active')) {
                 if (!videoUrlCache) {
                     setTimeout(() => attemptToFindAndSetupVideo('dom_change'), 200); 
                 }
            } 
        });

        observer.observe(document.body || document.documentElement, { 
            childList: true, 
            subtree: true, 
            attributes: false, 
            characterData: false 
        });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();
