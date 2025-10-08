// ==UserScript==
// @name         Jable TV 视频控制 V3.6 (修复倍率显示不全)
// @namespace    http://tampermonkey.net/
// @version      3.6
// @description  修复了菜单UI缩小后，加速倍率文本显示不全的问题。
// @author       AI Assistant
// @match        *://*.91porn.com/*
// @match        *://*.jable.tv/*
// @match        *://*.hanime1.me/*
// @allFrames    true 
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle 
// ==/UserScript==

(function() {
    'use strict';

    // --- 配置与默认设置 ---
    const DEFAULT_SKIP_TIME = 10; 
    const DEFAULT_HOLD_SPEED = 2.0; 
    const LONG_PRESS_DELAY = 150; 
    const MAX_CHECKS = 100; 
    const INTERVAL_TIME = 200; 
    const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 2.0, 3.0]; 

    // 用于查找浮动播放器视频的关键ID
    const FLOATING_VIDEO_ID = 'gm-actual-video';

    // --- 工具函数 (保持不变) ---
    const gm_get = (key, defaultVal) => {
        try { return GM_getValue(key, defaultVal); } catch(e) { return defaultVal; }
    };

    const gm_set = (key, value) => {
        try { GM_setValue(key, value); return true; } catch(e) { return false; }
    };

    const getSettings = () => ({
        backward: parseInt(gm_get('skipBackwardTime', DEFAULT_SKIP_TIME), 10),
        forward: parseInt(gm_get('skipForwardTime', DEFAULT_SKIP_TIME), 10),
        holdSpeed: parseFloat(gm_get('holdSpeedRate', DEFAULT_HOLD_SPEED))
    });

    // --- 核心修复：增强播放器查找函数 (ID 优先 + Shadow DOM 穿透) ---

    // 递归查找 Shadow DOM 内部的 <video>
    function findVideoRecursively(root) {
        if (!root) return null;

        // 1. 查找当前的 <video> 元素
        let video = root.querySelector('video');
        if (video) return video;

        // 2. 遍历所有元素，查找并进入 Shadow DOM
        const allElements = root.querySelectorAll('*');
        for (const element of allElements) {
            if (element.shadowRoot) {
                video = findVideoRecursively(element.shadowRoot);
                if (video) return video;
            }
        }
        
        // 3. 检查 root 本身是否是 Shadow Root (用于递归调用)
        if (root.host) {
             video = root.querySelector('video');
             if (video) return video;
        }

        return null;
    }

    // 暴露给外部使用的查找函数
    function findVideo() {
        // **最高优先级：查找浮动播放器创建的视频**
        let floatingVideo = document.getElementById(FLOATING_VIDEO_ID);
        if (floatingVideo) return floatingVideo;

        // 次级优先级：查找页面上其他任何视频 (包括 Shadow DOM 内的)
        return findVideoRecursively(document);
    }
    
    // --- 核心播放控制函数 (关键修改 1：简化倍率显示文本) ---
    let currentSpeed = 1.0; 
    
    function setSpeed(video, newRate) {
        if (!video) return;
        const clampedRate = Math.min(16, Math.max(0.1, newRate)); 
        video.playbackRate = clampedRate;
        updateSpeedDisplay(); 
    }

    function updateSpeedDisplay() {
        const playbackSpeedButton = document.getElementById('playback-speed-btn'); 
        const video = findVideo();

        if (playbackSpeedButton && video) {
            const rate = video.playbackRate.toFixed(2);
            const { holdSpeed } = getSettings();
            
            if (parseFloat(rate) === holdSpeed) {
                // **修正：简化文本，适应更窄的按钮**
                playbackSpeedButton.textContent = `长按 ${rate}x`;
                playbackSpeedButton.style.backgroundColor = 'rgba(255, 193, 7, 0.95)';
                playbackSpeedButton.style.color = '#333';
            } else {
                // 保持原样，只显示倍率或“倍率”文字
                playbackSpeedButton.textContent = rate === '1.00' ? '倍率' : `${rate}x`; 
                playbackSpeedButton.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                playbackSpeedButton.style.color = '#333';
                currentSpeed = parseFloat(rate); 
            }
        }
    }

    // --- UI 辅助函数 (保持 V3.5 的缩小样式) ---
    function createMenuButton(text, clickAction, id) {
        const button = document.createElement('button');
        button.textContent = text;
        button.id = id;
        
        button.style.cssText = `
            width: 100%;
            height: 30px; 
            margin-bottom: 5px; 
            border-radius: 4px; 
            color: white; 
            border: none;
            cursor: pointer; 
            font-size: 13px; 
            font-weight: bold;
            background-color: rgba(255, 255, 255, 0.15); 
            transition: background-color 0.15s, transform 0.05s;
        `;
        
        const activeColor = 'rgba(255, 255, 255, 0.35)'; 

        const setBg = (color) => button.style.backgroundColor = color;
        const toggleScale = (scale) => button.style.transform = `scale(${scale})`;

        const startAction = (e) => {
            e.stopPropagation();
            toggleScale('0.98');
            setBg(activeColor);
        };
        const endAction = () => {
            toggleScale('1');
            setBg('rgba(255, 255, 255, 0.15)');
        };

        button.addEventListener('touchstart', startAction);
        button.addEventListener('touchend', endAction);
        button.onmousedown = startAction;
        button.onmouseup = endAction;
        
        button.onmouseover = () => setBg(activeColor);
        button.onmouseout = () => setBg('rgba(255, 255, 255, 0.15)');
        
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            clickAction();
        });

        return button;
    }
    
    function createLongPressSpeedButton() {
        const longPressButton = document.createElement('button');
        longPressButton.id = 'long-press-speed-btn';
        longPressButton.textContent = '长按倍速';
        
        longPressButton.style.cssText = `
            width: 100%;
            height: 30px; 
            margin-bottom: 5px; 
            border-radius: 4px; 
            color: white; 
            border: none;
            cursor: pointer; 
            font-size: 13px; 
            font-weight: bold;
            background-color: rgba(255, 255, 255, 0.15); 
            transition: background-color 0.15s, transform 0.05s;
        `;

        const activeColor = 'rgba(255, 255, 255, 0.35)';
        const longPressActiveColor = 'rgba(255, 193, 7, 0.95)'; 

        let pressTimer = null; 
        let isLongPress = false; 
        
        const startHold = (e) => {
            e.preventDefault(); 
            const video = findVideo();
            if (!video) return;
            
            isLongPress = false;
            longPressButton.style.transform = 'scale(0.98)';
            longPressButton.style.backgroundColor = activeColor;

            pressTimer = setTimeout(() => {
                const { holdSpeed } = getSettings();
                setSpeed(video, holdSpeed);
                isLongPress = true;
                pressTimer = null;
                longPressButton.style.backgroundColor = longPressActiveColor;
                longPressButton.style.color = '#333';
            }, LONG_PRESS_DELAY);
        };

        const endHold = (e) => {
            const video = findVideo();
            if (!video) return;

            longPressButton.style.transform = 'scale(1)';
            longPressButton.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'; 
            longPressButton.style.color = 'white';

            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            } 
            else if (isLongPress) {
                setSpeed(video, currentSpeed);
                isLongPress = false;
            }
        };

        const leaveHold = () => {
            if (isLongPress) {
                const video = findVideo();
                if (video) setSpeed(video, currentSpeed);
                isLongPress = false;
            }
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
            longPressButton.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
            longPressButton.style.color = 'white';
            longPressButton.style.transform = 'scale(1)';
        };

        longPressButton.addEventListener('touchstart', startHold);
        longPressButton.addEventListener('touchend', endHold);
        longPressButton.addEventListener('mousedown', startHold);
        longPressButton.addEventListener('mouseup', endHold);
        longPressButton.addEventListener('mouseleave', leaveHold);
        longPressButton.addEventListener('touchcancel', leaveHold);
        
        return longPressButton;
    }

    function createPlaybackSpeedMenuButton() {
        const playbackSpeedButton = document.createElement('button');
        playbackSpeedButton.id = 'playback-speed-btn';
        playbackSpeedButton.textContent = '倍率';
        
        playbackSpeedButton.style.cssText = `
            width: 100%;
            height: 30px; 
            margin-bottom: 5px; 
            border-radius: 4px; 
            color: #333; 
            border: none;
            cursor: pointer; 
            font-size: 13px; 
            font-weight: bold;
            background-color: rgba(255, 255, 255, 0.95);
            transition: background-color 0.15s, transform 0.05s;
            position: relative;
        `;
        
        let speedMenu = document.getElementById('speed-selection-menu');
        if (!speedMenu) {
            speedMenu = document.createElement('div');
            speedMenu.id = 'speed-selection-menu';
            speedMenu.style.cssText = `
                position: absolute;
                background-color: white;
                border-radius: 6px; 
                box-shadow: 0 3px 9px rgba(0, 0, 0, 0.3); 
                padding: 3px 0; 
                display: none;
                min-width: 80px; 
                z-index: 100001; 
                transition: opacity 0.15s;
            `;
            
            SPEED_OPTIONS.forEach(rate => {
                const option = document.createElement('div');
                const rateText = rate.toFixed(2) === '1.00' ? '正常' : `${rate.toFixed(2)}x`;
                option.textContent = rateText;
                option.style.cssText = `
                    padding: 6px 10px; 
                    font-size: 13px; 
                    color: #333;
                    cursor: pointer;
                    transition: background-color 0.1s;
                    text-align: right;
                `;
                
                option.onmouseover = () => option.style.backgroundColor = '#f0f0f0';
                option.onmouseout = () => option.style.backgroundColor = 'white';
                
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const video = findVideo();
                    if (video) setSpeed(video, rate);
                    speedMenu.style.display = 'none';
                });
                speedMenu.appendChild(option);
            });
            
            document.body.appendChild(speedMenu);
        }

        playbackSpeedButton.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const currentDisplay = speedMenu.style.display;
            
            if (currentDisplay === 'none') {
                const rect = playbackSpeedButton.getBoundingClientRect();
                
                speedMenu.style.display = 'block'; 
                speedMenu.style.opacity = '0';
                
                speedMenu.style.top = `${rect.top - speedMenu.offsetHeight - 5}px`; 
                speedMenu.style.left = `${rect.right - speedMenu.offsetWidth}px`; 
                
                speedMenu.style.opacity = '1';
            } else {
                speedMenu.style.display = 'none';
            }
        });

        if (!document.body.__speedMenuListenerAdded) {
            document.addEventListener('click', (e) => {
                const menu = document.getElementById('speed-selection-menu');
                const btn = document.getElementById('playback-speed-btn');
                
                if (menu && menu.style.display === 'block' && 
                    !(btn && btn.contains(e.target)) && 
                    !menu.contains(e.target)) {
                    menu.style.display = 'none';
                }
            });
            document.body.__speedMenuListenerAdded = true;
        }

        return playbackSpeedButton;
    }


    // --- 核心函数：初始化控制按钮 (右下角悬浮) ---
    function initControls() {
        if (document.getElementById('floating-menu-container')) {
             updateSpeedDisplay();
             return true;
        }
        
        const video = findVideo();
        if (video && document.body) {
            
            const container = document.createElement('div');
            container.id = 'floating-menu-container';
            container.style.cssText = `
                position: fixed;
                bottom: 20px; 
                right: 20px;
                z-index: 100000;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                font-family: Arial, sans-serif;
            `;

            const menu = document.createElement('div');
            menu.id = 'video-control-menu';
            menu.style.cssText = `
                display: none;
                flex-direction: column;
                width: 90px; 
                padding: 8px; 
                border-radius: 10px; 
                background-color: rgba(0, 0, 0, 0.75);
                box-shadow: 0 3px 9px rgba(0, 0, 0, 0.3); 
                margin-bottom: 10px; 
            `;
            
            const toggleButton = document.createElement('button');
            toggleButton.id = 'menu-toggle-btn';
            toggleButton.textContent = '☰';

            toggleButton.style.cssText = `
                width: 40px; 
                height: 40px; 
                border-radius: 50%;
                background-color: #f7931e;
                color: white;
                border: none;
                font-size: 20px; 
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 3px 6px rgba(0, 0, 0, 0.2); 
                transition: background-color 0.2s;
            `;
            
            toggleButton.onclick = (e) => {
                e.stopPropagation();
                const isHidden = menu.style.display === 'none';
                menu.style.display = isHidden ? 'flex' : 'none';
                toggleButton.textContent = isHidden ? 'X' : '☰';
                toggleButton.style.backgroundColor = isHidden ? '#dc3545' : '#f7931e';

                if (!isHidden) {
                    const speedMenu = document.getElementById('speed-selection-menu');
                    if(speedMenu) speedMenu.style.display = 'none';
                }
            };
            
            const { backward, forward } = getSettings();
            
            menu.appendChild(createMenuButton(`后退 ${backward}s`, () => {
                const v = findVideo();
                const { backward } = getSettings(); 
                if (v) v.currentTime -= backward;
            }, 'back-btn'));
            
            menu.appendChild(createMenuButton(`快进 ${forward}s`, () => {
                const v = findVideo();
                const { forward } = getSettings(); 
                if (v) v.currentTime += forward;
            }, 'forward-btn'));

            menu.appendChild(createLongPressSpeedButton());
            menu.appendChild(createPlaybackSpeedMenuButton());
            
            const settingsBtn = createMenuButton('⚙️ 设置', showSettingsPanel, 'settings-btn');
            settingsBtn.style.marginBottom = '0px'; 
            menu.appendChild(settingsBtn);
            
            container.appendChild(menu);
            container.appendChild(toggleButton);
            
            if (window.self === window.top) {
                document.body.appendChild(container); 
            }
            
            updateSpeedDisplay(); 
            return true;
        }
        return false;
    }

    // --- 设置面板逻辑 (保持不变) ---
    function showSettingsPanel() {
        const { backward, forward, holdSpeed } = getSettings();
        
        const promptText = 
            `【脚本功能设置】】\n` +
            `请按顺序设置以下三个值，并用逗号分隔（例如：10,30,2.5）：\n\n` +
            
            `1. 后退时间 (秒): 当前: ${backward}s\n` +
            `2. 快进时间 (秒): 当前: ${forward}s\n` +
            `3. 长按加速倍率 (X): 当前: ${holdSpeed}x\n`;
            
        const input = prompt(promptText, `${backward},${forward},${holdSpeed}`);
        
        if (input === null) {
            return; 
        }

        const parts = input.split(',').map(p => p.trim());
        
        if (parts.length === 3) {
            const newBackward = parseInt(parts[0], 10);
            const newForward = parseInt(parts[1], 10);
            const newHoldSpeed = parseFloat(parts[2]);

            let changesMade = false;
            
            if (!isNaN(newBackward) && newBackward > 0) {
                gm_set('skipBackwardTime', newBackward);
                changesMade = true;
            } 
            
            if (!isNaN(newForward) && newForward > 0) {
                gm_set('skipForwardTime', newForward);
                changesMade = true;
            } 
            
            if (!isNaN(newHoldSpeed) && newHoldSpeed > 0.1) {
                gm_set('holdSpeedRate', newHoldSpeed);
                changesMade = true;
            } 
            
            if (changesMade) {
                const backBtn = document.getElementById('back-btn');
                const forwardBtn = document.getElementById('forward-btn');

                if (backBtn && newBackward) {
                     backBtn.textContent = `后退 ${newBackward}s`;
                }
                if (forwardBtn && newForward) {
                     forwardBtn.textContent = `快进 ${newForward}s`;
                }
                
                alert("设置成功！已立即应用新设置。");
                
            } else {
                 alert("输入值无效，设置失败。请确保输入大于0的数字。");
            }
        } else {
            alert("输入格式不正确。请确保您输入了三个用逗号分隔的值。");
        }
    }
    
    // 油猴菜单中的设置命令
    GM_registerMenuCommand("⚙️ 脚本功能设置", showSettingsPanel);


    // --- 触发检查逻辑 (保证加载) ---
    let checks = 0;
    const checkInterval = setInterval(() => {
        const video = findVideo();

        if (video) {
            if (initControls()) {
                 clearInterval(checkInterval);
                 return;
            }
        }
        
        if (checks >= MAX_CHECKS) {
            clearInterval(checkInterval);
        }
        checks++;
    }, INTERVAL_TIME);

})();
