export let capturedToken = null;

// 解析当前 URL 获取 session_id
export function getSessionIdFromUrl(url) {
    const match = url.match(/\/a\/chat\/s\/([a-f0-9-]+)/);
    return match ? match[1] : null;
}

// 调用接口获取对话内容
export async function fetchChatHistory(sessionId) {
    if (!capturedToken) {
        throw new Error('请先捕获 Token (尝试刷新页面或发送消息)');
    }

    const response = await fetch(`https://chat.deepseek.com/api/v0/chat/history_messages?chat_session_id=${sessionId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${capturedToken}`,
            'Accept': 'application/json'
        }
    });

    if (response.status === 200) {
        return await response.json();
    } else {
        throw new Error(`请求失败: ${response.status}`);
    }
}

// 将 JSON 数据转换为 Markdown
export function convertToMarkdown(data, sessionId) {
    const bizData = data?.data?.biz_data;
    if (!bizData) return '';

    const messages = bizData.chat_messages || [];

    let md = `> From: https://chat.deepseek.com/a/chat/s/${sessionId}\n\n`;

    messages.forEach(msg => {
        if (msg.role === 'USER') {
            md += `# you asked\n\n`;
            
            const date = new Date(msg.inserted_at * 1000);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            const timeStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            
            md += `message time: ${timeStr}\n\n`;
            if (msg.content) {
                md += `${msg.content}\n\n`;
            }
            md += `---\n\n`;
        } else if (msg.role === 'ASSISTANT') {
            md += `# deepseek response\n\n`;
            
            if (msg.thinking_content) {
                md += `> **思考过程**:\n> ${msg.thinking_content.replace(/\n/g, '\n> ')}\n\n`;
            }
            
            if (msg.content) {
                md += `${msg.content}\n\n`;
            }
            
            md += `---\n\n`;
        }
    });

    md = md.replace(/---\n\n$/, '');
    return md;
}

// 下载文件
export function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 调用原生接口更新对话标题
export async function updateChatTitleOnServer(chatSessionId, title) {
    if (!capturedToken) return;

    try {
        const response = await fetch('https://chat.deepseek.com/api/v0/chat_session/update_title', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${capturedToken}`,
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'x-app-version': '2.0.0',
                'x-client-locale': 'zh_CN',
                'x-client-platform': 'web',
                'x-client-version': '2.0.0'
            },
            body: JSON.stringify({ chat_session_id: chatSessionId, title }),
            credentials: 'include'
        });

        if (!response.ok) {
            console.warn('[ChatTree] 更新标题失败:', response.status);
        }
    } catch (e) {
        console.warn('[ChatTree] 更新标题异常:', e);
    }
}

// 劫持 XMLHttpRequest
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url) {
    this._requestUrl = url || '';
    return originalOpen.apply(this, arguments);
};

const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    if (header.toLowerCase() === 'authorization' && value.startsWith('Bearer ')) {
        const token = value.substring(7);
        if (token && token !== capturedToken) {
            capturedToken = token;
        }
    }
    originalSetRequestHeader.apply(this, arguments);
};

// 劫持 XHR send 以捕获 /chat/completion 的 EventStream 响应
const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function(...args) {
    if (this._requestUrl && this._requestUrl.includes('/chat/completion')) {
        let chatSessionId = null;
        try {
            const body = args[0];
            if (typeof body === 'string') {
                const parsed = JSON.parse(body);
                chatSessionId = parsed.chat_session_id || null;
            }
        } catch (e) { /* 忽略解析错误 */ }

        if (chatSessionId) {
            let lastIndex = 0;

            const onReadyStateChange = function() {
                if (this.readyState === 3 || this.readyState === 4) {
                    try {
                        const responseText = this.responseText;
                        if (responseText != null) {
                            const newChunk = responseText.substring(lastIndex);
                            if (newChunk) {
                                lastIndex = responseText.length;
                                // 只在新到达的 chunk 中搜索 title 事件，避免重复匹配
                                parseTitleEvent(newChunk, chatSessionId);
                            }
                        }
                    } catch (e) { /* 忽略 responseType 不兼容的错误 */ }
                }
            };

            this.addEventListener('readystatechange', onReadyStateChange);
        }
    }
    return originalSend.apply(this, args);
};

/**
 * 解析 EventStream chunk，查找 "event: title" 和 "event: close" 事件
 */
function parseTitleEvent(chunk, chatSessionId) {
    // 匹配 "event: title" 后紧跟的 "data: {...}" JSON 行（兼容 \n 和 \r\n）
    const regex = /event:\s*title\s*\r?\n\s*data:\s*(\{[^\r\n]*\})/g;
    let match;
    while ((match = regex.exec(chunk)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            if (data.content && typeof data.content === 'string') {
                window.dispatchEvent(new CustomEvent('deepseek-title-detected', {
                    detail: {
                        chatSessionId: chatSessionId,
                        title: data.content.trim()
                    }
                }));
                console.log(
                    '%c[ChatTree] 📝 检测到对话标题:',
                    'color: #00bfa5; font-weight: bold;',
                    data.content,
                    '\n  chat_session_id:', chatSessionId
                );
            }
        } catch (e) { /* 忽略 JSON 解析错误 */ }
    }

    // 匹配 "event: close"
    const closeRegex = /event:\s*close/g;
    if (closeRegex.test(chunk)) {
        window.dispatchEvent(new CustomEvent('deepseek-chat-completed', {
            detail: {
                chatSessionId: chatSessionId
            }
        }));
        console.log(
            '%c[ChatTree] ✅ 检测到对话生成完成:',
            'color: #00e676; font-weight: bold;',
            chatSessionId
        );
    }
}

// 劫持 fetch
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    const [resource, config] = args;
    if (config && config.headers) {
        let authHeader = null;
        if (config.headers instanceof Headers) {
            authHeader = config.headers.get('authorization');
        } else if (Array.isArray(config.headers)) {
            const found = config.headers.find(([h]) => h.toLowerCase() === 'authorization');
            authHeader = found ? found[1] : null;
        } else {
            authHeader = config.headers['Authorization'] || config.headers['authorization'];
        }

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            if (token && token !== capturedToken) {
                capturedToken = token;
                console.log('%c[DeepSeek Token Getter] Captured Token:', 'color: #00ff00; font-weight: bold;', capturedToken);
            }
        }
    }
    return originalFetch.apply(this, args);
};
