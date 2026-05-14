<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import TreeRoot from './components/TreeRoot.vue';
import Notification from './components/Notification.vue';
import Header from './components/Header.vue';
import Footer from './components/Footer.vue';
import SettingsModal from './components/SettingsModal.vue';
import WorkspaceManager from './components/WorkspaceManager.vue';
import { FolderNode, ChatNode, state, findNodeByUrl, getAllParents, setFocus } from './models/TreeNode.js';
import { appState } from './models/AppState.js';
import { loadPersistedData, savePersistedData, reviveWorkspace } from './utils/persistence.js';
import { getWorkspaces, updateWorkspaces, getTree, updateTree } from './utils/syncApi.js';
import { showNotify } from './utils/notify.js';
import { getSessionIdFromUrl, fetchChatHistory, updateChatTitleOnServer } from './utils/apiHooks.js';

const isDragging = ref(false);
const treeRootRef = ref(null);
const workspaceManagerOpen = ref(false);

// 加载持久化数据
const loadPersistedDataLocal = () => {
    const data = loadPersistedData();
    appState.workspaces = data.workspaces;
    appState.currentWorkspaceId = data.currentWorkspaceId;
    Object.assign(appState.settings, data.settings);
    appState.settings.sidebarWidth = Math.max(335, data.sidebarWidth);
    return data.tree;
};

const treeData = ref(loadPersistedDataLocal());
state.rootNode = treeData.value;

const currentWorkspaceName = computed(() => {
    const workspace = appState.workspaces.find(ws => ws.id === appState.currentWorkspaceId);
    return workspace ? workspace.name : '默认工作区';
});

const getCurrentWorkspace = () => appState.workspaces.find(ws => ws.id === appState.currentWorkspaceId) || appState.workspaces[0];

const loadWorkspace = async () => {
    const currentWorkspace = getCurrentWorkspace();
    if (!currentWorkspace) return;
    
    // 每次打开一个工作区时，调用“获取文件树数据”
    try {
        const treeDataRes = await getTree(currentWorkspace.id);
        if (treeDataRes) {
            currentWorkspace.tree = reviveWorkspace({ tree: treeDataRes }).tree;
        }
    } catch (e) {
        console.error('获取文件树数据失败:', e);
    }

    treeData.value = currentWorkspace.tree;
    state.rootNode = treeData.value;
};

const persistCurrentWorkspace = () => {
    const currentWorkspace = getCurrentWorkspace();
    if (!currentWorkspace) return;
    currentWorkspace.tree = treeData.value;
    savePersistedData(appState.workspaces, appState.currentWorkspaceId, appState.settings);
    // 每次当前工作区文件树更新时，调用“更新文件树数据”
    if (appState.currentWorkspaceId && treeData.value) {
        updateTree(appState.currentWorkspaceId, treeData.value).catch(console.error);
    }
};

watch([treeData, () => appState.settings], () => {
    state.rootNode = treeData.value;
    persistCurrentWorkspace();
}, { deep: true });

const switchWorkspace = (workspaceId) => {
    if (workspaceId === appState.currentWorkspaceId) return;
    persistCurrentWorkspace();
    appState.currentWorkspaceId = workspaceId;
    loadWorkspace();
};

const fetchAndApplyWorkspaces = async () => {
    try {
        const serverData = await getWorkspaces();
        if (serverData && Array.isArray(serverData.workspaces)) {
            // 保留本地的 tree，更新工作区属性
            const oldWorkspacesTree = new Map(appState.workspaces.map(ws => [ws.id, ws.tree]));
            appState.workspaces = serverData.workspaces.map(ws => reviveWorkspace({
                ...ws,
                tree: oldWorkspacesTree.has(ws.id) ? oldWorkspacesTree.get(ws.id) : undefined
            }));
            
            if (!appState.workspaces.find(ws => ws.id === appState.currentWorkspaceId)) {
                appState.currentWorkspaceId = appState.workspaces[0]?.id;
            }
        }
    } catch (e) {
        console.error('获取工作区数据失败:', e);
    }
};

const pushWorkspacesUpdate = () => {
    const dataToSave = {
        workspaces: appState.workspaces.map(ws => ({ id: ws.id, name: ws.name, folderPath: ws.folderPath }))
    };
    updateWorkspaces(dataToSave).catch(e => console.error('更新工作区数据失败:', e));
};

const openWorkspaceManager = () => {
    fetchAndApplyWorkspaces();
    workspaceManagerOpen.value = true;
};

const closeWorkspaceManager = () => {
    workspaceManagerOpen.value = false;
};

const createWorkspace = ({ name, folderPath = null }) => {
    const newWorkspace = {
        id: `workspace_${Date.now()}`,
        name,
        tree: new FolderNode({ title: 'root', children: [] }),
        folderPath
    };
    appState.workspaces.push(newWorkspace);
    appState.currentWorkspaceId = newWorkspace.id;
    treeData.value = newWorkspace.tree;
    savePersistedData(appState.workspaces, appState.currentWorkspaceId, appState.settings);
    pushWorkspacesUpdate();
};

const bindWorkspaceFolder = ({ id, folderPath }) => {
    const workspace = appState.workspaces.find(ws => ws.id === id);
    if (!workspace) return;
    workspace.folderPath = folderPath || null;
    savePersistedData(appState.workspaces, appState.currentWorkspaceId, appState.settings);
    pushWorkspacesUpdate();
};

const renameWorkspace = ({ id, name }) => {
    const workspace = appState.workspaces.find(ws => ws.id === id);
    if (!workspace) return;
    workspace.name = name;
    savePersistedData(appState.workspaces, appState.currentWorkspaceId, appState.settings);
    pushWorkspacesUpdate();
};

const deleteWorkspace = (workspaceId) => {
    if (appState.workspaces.length === 1) return;
    const index = appState.workspaces.findIndex(ws => ws.id === workspaceId);
    if (index === -1) return;
    appState.workspaces.splice(index, 1);
    if (appState.currentWorkspaceId === workspaceId) {
        const nextWorkspace = appState.workspaces[0];
        appState.currentWorkspaceId = nextWorkspace.id;
        loadWorkspace();
    }
    savePersistedData(appState.workspaces, appState.currentWorkspaceId, appState.settings);
    pushWorkspacesUpdate();
};

const getUniqueWorkspaceId = (baseId, existingIds = new Set(appState.workspaces.map(workspace => workspace.id))) => {
    let id = baseId || `workspace_${Date.now()}`;
    while (existingIds.has(id)) {
        id = `workspace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    }
    return id;
};

const getUniqueWorkspaceName = (baseName, existingNames = new Set(appState.workspaces.map(workspace => workspace.name.trim()))) => {
    const name = baseName || '导入工作区';
    if (!existingNames.has(name)) return name;
    let index = 2;
    let nextName = `${name} (${index})`;
    while (existingNames.has(nextName)) {
        index += 1;
        nextName = `${name} (${index})`;
    }
    return nextName;
};

const readFileAsText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
});

const importWorkspace = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
            const text = await readFileAsText(file);
            const data = JSON.parse(text);
            const sourceWorkspaces = Array.isArray(data.workspaces) ? data.workspaces : [data];
            const existingIds = new Set(appState.workspaces.map(workspace => workspace.id));
            const existingNames = new Set(appState.workspaces.map(workspace => workspace.name.trim()));
            const importedWorkspaces = sourceWorkspaces
                .filter(item => item && typeof item === 'object')
                .map((item, index) => {
                    const workspace = reviveWorkspace(item, `导入工作区 ${index + 1}`);
                    workspace.id = getUniqueWorkspaceId(workspace.id, existingIds);
                    existingIds.add(workspace.id);
                    workspace.name = getUniqueWorkspaceName(workspace.name, existingNames);
                    existingNames.add(workspace.name.trim());
                    return workspace;
                });

            if (importedWorkspaces.length === 0) {
                showNotify('未找到可导入的工作区。', 'warning');
                return;
            }

            persistCurrentWorkspace();
            appState.workspaces.push(...importedWorkspaces);
            const firstImportedWorkspace = importedWorkspaces[0];
            appState.currentWorkspaceId = firstImportedWorkspace.id;
            treeData.value = firstImportedWorkspace.tree;
            savePersistedData(appState.workspaces, appState.currentWorkspaceId, appState.settings);
            pushWorkspacesUpdate();
            showNotify(`已导入 ${importedWorkspaces.length} 个工作区。`, 'success');
        } catch (e) {
            console.error('导入工作区失败：', e);
            showNotify('导入失败，请确认文件格式正确。', 'error');
        }
    };
    input.click();
};

const onMouseDown = () => {
    isDragging.value = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none'; // 防止拖拽时选中文本
};

const onMouseMove = (e) => {
    if (!isDragging.value) return;
    // 限制拖拽最小 335px，最大为屏幕宽度减去 300px
    const newWidth = Math.max(335, Math.min(e.clientX, window.innerWidth - 300));
    appState.settings.sidebarWidth = newWidth;
};

const onMouseUp = () => {
    if (isDragging.value) {
        isDragging.value = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
};

const createNewFolderHandler = () => {
    if (treeRootRef.value) {
        treeRootRef.value.createNewFolder();
    }
};

const onDropDelete = (e) => {
    if (state.draggedNode && state.draggedParent) {
        let shouldDelete = true;
        if (!appState.settings.skipDeleteConfirm) {
            shouldDelete = confirm(`确定要删除 "${state.draggedNode.title}" 吗？`);
        }

        if (shouldDelete) {
            state.draggedParent.removeChild(state.draggedNode);
        }
    }
    // 无论是否删除，都要清理全局拖拽状态
    state.draggedNode = null;
    state.draggedParent = null;
    document.body.classList.remove('is-dragging-node');
};

// 监听 DeepSeek completion 流中检测到的标题事件，自动更新树节点标题
const handleTitleDetected = (event) => {
    const { chatSessionId, title } = event.detail;
    if (!chatSessionId || !title) return;

    const chatUrl = `https://chat.deepseek.com/a/chat/s/${chatSessionId}`;

    // 在所有工作区中搜索匹配的 ChatNode
    for (const workspace of appState.workspaces) {
        const tree = workspace.tree;
        if (!tree) continue;
        const node = findNodeByUrl(tree, chatUrl);
        if (node && node instanceof ChatNode && node.title !== title) {
            node.title = title;
            updateChatTitleOnServer(chatSessionId, title);
            return;
        }
    }
};

// 递归收集树中所有 ChatNode
const collectChatNodes = (node, result) => {
    if (node instanceof ChatNode) {
        result.push(node);
    } else if (node instanceof FolderNode) {
        for (const child of node.children) {
            collectChatNodes(child, result);
        }
    }
};

// 异步更新所有工作区中所有对话节点的标题
const updateAllChatTitles = async () => {
    const chatNodes = [];
    for (const workspace of appState.workspaces) {
        if (!workspace.tree) continue;
        collectChatNodes(workspace.tree, chatNodes);
    }

    if (chatNodes.length === 0) return;

    // 逐个请求，避免对服务器造成压力
    for (const node of chatNodes) {
        const sessionId = getSessionIdFromUrl(node.url);
        if (!sessionId) continue;
        try {
            const response = await fetchChatHistory(sessionId);
            const title = response?.data?.biz_data?.chat_session?.title;
            if (title && node.title !== title) {
                node.title = title;
                updateChatTitleOnServer(sessionId, title);
            }
        } catch (e) {
            // 单个对话获取失败时静默跳过
        }
    }
};

onMounted(() => {
    // 每次打开网页时，先获取远端工作区并应用，然后再加载
    fetchAndApplyWorkspaces().then(() => {
        loadWorkspace();
        // 异步更新所有对话节点的标题
        updateAllChatTitles();
    });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // 监听 DeepSeek completion 流中的标题事件
    window.addEventListener('deepseek-title-detected', handleTitleDetected);

    // 监听 URL 变化自动聚焦
    const updateFocusByUrl = () => {
        const url = location.href;
        const node = findNodeByUrl(treeData.value, url);
        if (node) {
            const parents = getAllParents(treeData.value, node);
            parents.forEach(parent => parent.isOpen = true);
            setFocus(node);
        } else if (state.focusedNode) {
            state.focusedNodeDetachedFromUrl = true;
        }
    };

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
        originalPushState.apply(this, args);
        updateFocusByUrl();
    };
    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        updateFocusByUrl();
    };
    window.addEventListener('popstate', updateFocusByUrl);

    // 初始化时执行一次
    setTimeout(updateFocusByUrl, 100);
});

onUnmounted(() => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('deepseek-title-detected', handleTitleDetected);
});

</script>

<template>
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    <Notification />
    <SettingsModal
        :isOpen="appState.isSettingsOpen"
        :settings="appState.settings"
        :treeData="treeData"
        :workspaces="appState.workspaces"
        :currentWorkspaceId="appState.currentWorkspaceId"
        @close="appState.isSettingsOpen = false"
        @export="() => {}"
    />

    <div class="bct-wrapper" :style="{ width: `${appState.settings.sidebarWidth}px` }">
        <div class="bct-left-panel">
            <Header :onAddFolder="createNewFolderHandler" />
            <TreeRoot ref="treeRootRef" :model="treeData" />
            <Footer
                :draggedNode="state.draggedNode"
                :currentWorkspaceName="currentWorkspaceName"
                :currentWorkspaceId="appState.currentWorkspaceId"
                :workspaces="appState.workspaces"
                @settings="() => appState.isSettingsOpen = true"
                @workspace-select="switchWorkspace"
                @manage-workspace="openWorkspaceManager"
                @bind-folder="bindWorkspaceFolder"
                @drop-delete="onDropDelete"
            />
        </div>

        <!-- 拖拽缩放手柄 -->
        <div class="bct-resizer" :class="{ resizing: isDragging }" @mousedown="onMouseDown"></div>
    </div>

    <WorkspaceManager
        :isOpen="workspaceManagerOpen"
        :workspaces="appState.workspaces"
        :currentWorkspaceId="appState.currentWorkspaceId"
        @close="closeWorkspaceManager"
        @select="switchWorkspace"
        @create="createWorkspace"
        @import-workspace="importWorkspace"
        @bind-folder="bindWorkspaceFolder"
        @rename="renameWorkspace"
        @delete="deleteWorkspace"
    />
</template>

<style scoped>
.bct-wrapper {
    height: 100vh;
    display: flex;
    flex-shrink: 0;
    /* 确保自身在flex容器中不被挤压 */
    z-index: 99999;
}

.bct-left-panel {
    flex: 1;
    height: 100%;
    background-color: #f9f9f9;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #333;
    position: relative;
    padding-bottom: 52px;
    /* 为底部 bar 留出空间 */
    font-family: quote-cjk-patch, Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
}

.bct-resizer {
    width: 5px;
    height: 100%;
    background-color: #e5e5e5;
    cursor: col-resize;
    flex-shrink: 0;
    transition: background-color 0.2s;
}

.bct-resizer:hover,
.bct-resizer.resizing {
    background-color: #1c64f2;
}

@media (prefers-color-scheme: dark) {
    .bct-left-panel {
        background-color: #1e1e1e;
        color: #eee;
    }

    .bct-resizer {
        background-color: #333;
    }

    .bct-resizer:hover,
    .bct-resizer.resizing {
        background-color: #3b82f6;
    }
}
</style>
