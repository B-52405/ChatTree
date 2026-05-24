import { appState } from '../models/AppState.js';
import { showNotify } from './notify.js';

function getBaseUrl() {
    const port = appState.settings.syncServerPort || 8800;
    return `http://127.0.0.1:${port}`;
}

async function request(endpoint, options = {}) {
    if (!appState.settings.syncEnabled) {
        return null;
    }
    const url = `${getBaseUrl()}${endpoint}`;
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        if (!response.ok) {
            throw new Error(`请求失败: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`请求异常 ${endpoint}:`, error);
        throw error;
    }
}

// 1. 获取工作区数据
export async function getWorkspaces() {
    return request('/workspaces', { method: 'GET' });
}

// 2. 更新工作区数据
export async function updateWorkspaces(data) {
    return request('/workspaces', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

// 3. 获取文件树数据
export async function getTree(workspaceId) {
    return request(`/tree?workspace=${encodeURIComponent(workspaceId)}`, { method: 'GET' });
}

// 4. 更新文件树数据
export async function updateTree(workspaceId, treeData) {
    return request(`/tree?workspace=${encodeURIComponent(workspaceId)}`, {
        method: 'POST',
        body: JSON.stringify(treeData)
    });
}

// 5. 更新对话内容
export async function updateChat(workspaceId, chatId, chatData) {
    return request(`/chat?workspace=${encodeURIComponent(workspaceId)}&chat=${encodeURIComponent(chatId)}`, {
        method: 'POST',
        body: JSON.stringify(chatData)
    });
}

// 6. 打开本地项目
export async function openProject(workspaceId, folderId) {
    return request(`/project?workspace=${encodeURIComponent(workspaceId)}&folder=${encodeURIComponent(folderId)}`, {
        method: 'GET'
    });
}
