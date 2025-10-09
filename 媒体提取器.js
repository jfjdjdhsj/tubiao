// ==UserScript==
// @name         Via 实用工具：按大小排序的媒体提取器 (v1.5.2 - M3U8 增强版)
// @namespace    http://tampermonkey.net/
// @version      1.5.2
// @description  提取所有媒体链接，并按文件大小排序，方便识别主视频/大图。增强 M3U8 链接的提取能力。
// @author       ChatGPT
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setClipboard 
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    let isLoggerVisible = false;
    let extractedMedia = [];
    let isFetchingSize = false;
    
    // --- 辅助函数：格式化文件大小 ---
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0 || bytes === null || bytes === undefined) return '未知';
        if (bytes === -1) return '无法获取';
        if (bytes === -2) return '加载中...'; 

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // --- 调用浮动播放器的方法 ---
    function launchFloatingPlayer(videoUrl) {
        // 创建一个自定义事件，包含视频 URL
        const event = new CustomEvent('GM_START_FLOATING_VIDEO', { 
            detail: { url: videoUrl } 
        });
        // 派发事件，让浮动播放器脚本监听并接收
        window.dispatchEvent(event);
        
        // 可选：如果提取器已打开，则关闭它
        const logger = document.getElementById('mediaExtractorV1');
        if (logger) {
            logger.classList.remove('visible');
            isLoggerVisible = false;
        }
    }
    
    // --- 1. 样式与 UI 结构 ---
    GM_addStyle(`
        /* 独立浮动按钮样式 */
        #floatingToggleBtnV1 {
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 100000; 
            width: 30px; 
            height: 30px; 
            line-height: 30px;
            background: #ff5555; 
            color: #fff;
            border-radius: 50%; 
            text-align: center;
            font-weight: bold;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
        }
        
        /* 主记录器面板样式 */
        #mediaExtractorV1 {
            position: fixed;
            top: 50px; 
            right: 10px;
            z-index: 99999;
            width: 350px;
            max-height: 80vh; 
            background: #2e2e2e;
            color: #f0f0f0;
            border: 1px solid #ff5555;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            font-family: monospace;
            font-size: 12px;
            border-radius: 4px;
            display: flex;
            flex-direction: column;
            opacity: 0;
            visibility: hidden; 
            transition: opacity 0.2s, visibility 0.2s;
        }
        #mediaExtractorV1.visible {
            visibility: visible;
            opacity: 1;
        }
        
        #extractorHeader {
            padding: 5px 10px;
            background: #ff5555;
            color: #fff;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        /* 刷新按钮和标题的容器 */
        #header-controls {
            display: flex;
            align-items: center;
        }

        /* 刷新按钮样式 */
        #reparse-media-btn {
            background: #00A86B; /* 绿色 */
            color: white;
            border: none;
            padding: 3px 8px;
            font-size: 11px;
            cursor: pointer;
            border-radius: 3px;
            margin-left: 10px;
            transition: background 0.2s;
        }
        #reparse-media-btn:hover {
            background: #008f5d;
        }
        .rotating {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        
        #mediaContentV1 {
            flex-grow: 1;
            padding: 5px;
            overflow-y: auto; 
            max-height: calc(80vh - 30px); 
        }
        .mediaEntry {
            border-bottom: 1px dotted #444;
            padding: 5px 0;
            display: flex;
            align-items: center;
        }
        .mediaEntry a {
            color: #66ccff;
            text-decoration: none;
            cursor: pointer;
            flex-grow: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-right: 5px;
        }
        .mediaEntry .info-box {
            display: flex;
            align-items: center;
            min-width: 140px; 
            justify-content: flex-end;
        }
        .mediaEntry .type {
            color: #ffff00;
            margin-right: 5px;
            font-size: 10px;
            min-width: 30px;
            text-align: right;
        }
        .mediaEntry .size {
            color: #00ff00;
            margin-right: 8px;
            font-size: 10px;
            min-width: 60px; 
            text-align: right;
        }
        .mediaEntry .copy-btn, .mediaEntry .play-btn {
            background: #555;
            color: #fff;
            border: none;
            padding: 2px 5px;
            font-size: 10px;
            cursor: pointer;
            border-radius: 3px;
            margin-left: 5px; 
        }
        .mediaEntry .play-btn {
            background: #1E88E5; 
        }
    `);

    // --- 2. 媒体提取和大小获取逻辑 ---

    function getLargestSrcset(srcset) {
        if (!srcset) return null;
        let bestUrl = null;
        let bestValue = -1;

        srcset.split(',').forEach(part => {
            const [url, desc] = part.trim().split(/\s+/);
            if (!url) return;

            const match = desc ? desc.match(/(\d+)([wx])/) : null;
            if (match) {
                const value = parseInt(match[1]);
                if (value > bestValue) {
                    bestValue = value;
                    bestUrl = url;
                }
            } else if (bestUrl === null) {
                bestUrl = url;
            }
        });
        return bestUrl;
    }

    /**
     * 从当前页面提取媒体资源链接
     */
    function extractMedia() {
        const mediaSet = new Set();
        
        const addMedia = (url, type) => {
            if (url && url.length > 5 && !url.startsWith('data:') && !url.includes('spacer')) {
                // 排除常见格式
                if (type.startsWith('Image') && (url.endsWith('.svg') || url.includes('.ico'))) return;
                
                let absoluteUrl;
                try {
                    absoluteUrl = new URL(url, document.baseURI).href;
                } catch (e) {
                    return;
                }
                
                let initialSize = -2; // 默认值：加载中...
                
                // M3U8 和其他未知大小的流媒体直接标记为 0 (未知)，跳过 HEAD 请求
                if (type.includes('M3U8') || absoluteUrl.match(/\.(m3u8|mpd)\b/i)) {
                    initialSize = 0; 
                    type = 'Video:M3U8'; // 规范类型
                }

                mediaSet.add({ url: absoluteUrl, type: type, size: initialSize }); 
            }
        };

        // 1. 标准图片、视频和音频标签
        document.querySelectorAll('img, video, audio, source').forEach(el => {
            const tagName = el.tagName.toUpperCase();
            
            // 提取图片srcset
            if (tagName === 'IMG') {
                const srcsetLink = getLargestSrcset(el.srcset);
                addMedia(srcsetLink, 'Image:SRCSET');
            }

            // 提取 src
            const url = el.src || el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-original');
            
            if (url) {
                let type = tagName;
                if (tagName === 'SOURCE') {
                    const mime = el.type || '';
                    if (mime.includes('mp4')) type = 'Video:MP4';
                    else if (mime.includes('webm')) type = 'Video:WEBM';
                    else type = `Video:${el.parentElement.tagName}`;
                } else if (tagName === 'VIDEO' || tagName === 'AUDIO') {
                    type = `Video`;
                } else if (tagName === 'IMG') {
                    type = 'Image';
                }
                
                addMedia(url, type);
            }
        });
        
        // 2. 背景图片 (内联 CSS style)
        document.querySelectorAll('[style*="background-image"]').forEach(el => {
            const style = el.getAttribute('style');
            const match = style.match(/url\(['"]?([^)'"]+)['"]?\)/i);
            if (match && match[1]) {
                 addMedia(match[1].replace(/['"]/g, ''), 'BG Image');
            }
        });

        // --- 3. 增强 M3U8 查找 (扫描全部 HTML) ---
        // 匹配 HTTP/HTTPS 开头的 M3U8/MP4/WEBM 链接
        const videoRegex = /(https?:\/\/[^'"\s\\]*\.(m3u8|mp4|webm|mpd)[^'"\s\\]*)/ig;
        
        // 扫描 body 的 innerHTML (包含隐藏在脚本或其它元素属性中的链接)
        let match;
        const htmlContent = document.body ? document.body.outerHTML : document.documentElement.outerHTML;
        while ((match = videoRegex.exec(htmlContent)) !== null) {
             const url = match[1];
             if (url.match(/\.m3u8\b/i) || url.match(/\.mpd\b/i)) {
                addMedia(url, 'Video:M3U8');
             } else {
                 addMedia(url, 'Video:LINK');
             }
        }

        return Array.from(mediaSet);
    }
    
    /**
     * 异步获取 Content-Length 并实时更新列表
     */
    function fetchAndSortBySize(mediaList) {
        if (isFetchingSize) return;
        isFetchingSize = true;
        
        // 立即对列表进行初始渲染，显示“加载中...”
        renderMediaList(mediaList); 

        const fetchPromises = mediaList.map(item => {
            // M3U8 (0) 或已处理的项 (-1, >0) 跳过
            if (item.size > -2) {
                return Promise.resolve();
            }

            // 使用 fetch 而非 GM_xmlhttpRequest，因为 fetch 更适合并发 HEAD 请求
            return fetch(item.url, { method: 'HEAD', mode: 'cors' })
                .then(response => {
                    if (!response.ok) {
                        item.size = -1; // 标记失败
                    } else {
                        const length = response.headers.get('Content-Length');
                        item.size = length ? parseInt(length, 10) : 0; // 0 表示大小未知但成功连接
                    }
                })
                .catch(() => {
                    item.size = -1; // 标记请求失败
                })
                .finally(() => {
                    // 核心优化点：每完成一个请求就重新排序和渲染
                    mediaList.sort((a, b) => {
                        // 正在加载的项 (-2) 放在最后
                        const sizeA = a.size > 0 ? a.size : (a.size === -2 ? -3 : -2); 
                        const sizeB = b.size > 0 ? b.size : (b.size === -2 ? -3 : -2);
                        return sizeB - sizeA;
                    });
                    renderMediaList(mediaList);
                });
        });

        // 等待所有请求完成，然后标记获取结束
        Promise.all(fetchPromises).finally(() => {
            isFetchingSize = false;
        });
    }


    // --- 3. UI 渲染和操作逻辑 ---

    function renderMediaList(mediaList) {
        const content = document.getElementById('mediaContentV1');
        content.innerHTML = ''; 

        if (mediaList.length === 0) {
            content.innerHTML = '<div style="color: #aaa; padding: 10px;">未找到可提取的媒体资源。</div>';
            return;
        }

        const isLoading = mediaList.some(m => m.size === -2);
        
        // 如果仍在加载，显示提示信息
        if (isLoading) {
             const loadingIndicator = document.createElement('div');
             loadingIndicator.style.cssText = 'color: #ffff00; padding: 10px; text-align: center; border-bottom: 1px solid #444;';
             loadingIndicator.textContent = '文件大小正在加载和排序中...';
             content.appendChild(loadingIndicator);
        }

        mediaList.forEach(media => {
            const entry = document.createElement('div');
            entry.className = 'mediaEntry';
            
            // 链接
            const link = document.createElement('a');
            link.href = media.url;
            link.target = '_blank'; 
            link.title = media.url;
            link.textContent = media.url;
            
            // 信息盒子
            const infoBox = document.createElement('div');
            infoBox.className = 'info-box';

            // 文件大小
            const sizeSpan = document.createElement('span');
            sizeSpan.className = 'size';
            sizeSpan.textContent = formatBytes(media.size); 

            // 资源类型
            const typeSpan = document.createElement('span');
            typeSpan.className = 'type';
            typeSpan.textContent = `[${media.type}]`;
            
            // 复制按钮
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.textContent = '复制';
            copyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                GM_setClipboard(media.url);
                copyBtn.textContent = '已复制!';
                setTimeout(() => { copyBtn.textContent = '复制'; }, 1000);
            });
            
            infoBox.appendChild(sizeSpan);
            infoBox.appendChild(typeSpan);
            
            // 如果是视频，则添加“播放”按钮
            if (media.type.startsWith('Video')) {
                const playBtn = document.createElement('button');
                playBtn.className = 'play-btn';
                playBtn.textContent = '▶️ 播放';
                playBtn.title = '调用浮动播放器播放此视频';
                playBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    launchFloatingPlayer(media.url);
                });
                infoBox.appendChild(playBtn);
            }

            infoBox.appendChild(copyBtn);
            
            entry.appendChild(link);
            entry.appendChild(infoBox);
            content.appendChild(entry);
        });
    }

    /**
     * 重新解析、渲染和加载大小的核心函数
     */
    function refreshAndParseMedia() {
        // 清空旧数据
        extractedMedia = [];
        document.getElementById('mediaContentV1').innerHTML = '';

        // 提取新数据
        extractedMedia = extractMedia();
        
        // 启动快速加载和排序
        fetchAndSortBySize(extractedMedia);
    }

    // --- 4. DOM 元素的创建与注入 ---
    
    const floatingBtn = document.createElement('div');
    floatingBtn.id = 'floatingToggleBtnV1';
    floatingBtn.textContent = 'RES'; 
    
    const logger = document.createElement('div');
    logger.id = 'mediaExtractorV1';
    
    const header = document.createElement('div');
    header.id = 'extractorHeader';
    
    // 头部控制容器
    const headerControls = document.createElement('div');
    headerControls.id = 'header-controls';
    headerControls.innerHTML = '媒体资源提取器 (v1.5.2)';

    // 刷新按钮
    const refreshBtn = document.createElement('span');
    refreshBtn.id = 'reparse-media-btn';
    refreshBtn.textContent = '🔄 刷新';
    refreshBtn.title = '重新解析当前页面中的所有媒体资源';
    
    headerControls.appendChild(refreshBtn);
    header.appendChild(headerControls);
    
    const content = document.createElement('div');
    content.id = 'mediaContentV1';

    logger.appendChild(header);
    logger.appendChild(content); 

    function toggleLoggerVisibility() {
        isLoggerVisible = !isLoggerVisible;
        if (isLoggerVisible) {
            // 如果是第一次打开，或者数据为空，则执行刷新
            if (extractedMedia.length === 0 || !extractedMedia.some(m => m.size > -2)) {
                 refreshAndParseMedia();
            } else {
                 // 否则只显示已缓存的数据
                 renderMediaList(extractedMedia);
            }
            logger.classList.add('visible');
        } else {
            logger.classList.remove('visible');
        }
    }

    function injectUI() {
        if (document.body) {
            document.body.appendChild(floatingBtn); 
            document.body.appendChild(logger);
            
            // 绑定刷新按钮事件
            refreshBtn.addEventListener('click', () => {
                refreshBtn.classList.add('rotating');
                refreshBtn.textContent = '⌛ 解析中';

                // 刷新核心逻辑
                refreshAndParseMedia(); 
                
                // 延迟移除旋转动画和恢复文本，给用户视觉反馈
                setTimeout(() => {
                    refreshBtn.classList.remove('rotating');
                    refreshBtn.textContent = '🔄 刷新';
                }, 1000); 
            });

        } else {
            setTimeout(injectUI, 50); 
        }
    }
    
    floatingBtn.addEventListener('click', toggleLoggerVisibility);

    injectUI();

})();
