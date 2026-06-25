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
import { loadPersistedData, savePersistedData, reviveWorkspace, getUniqueWorkspaceId, getUniqueWorkspaceName } from './utils/persistence.js';
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
    if (!currentWorkspace) {
        appState.isLoading = false;
        return;
    }
    
    appState.isLoading = true;
    // 每次打开一个工作区时，调用“获取文件树数据”
    try {
        const treeDataRes = await getTree(currentWorkspace.id);
        if (treeDataRes) {
            currentWorkspace.tree = reviveWorkspace({ tree: treeDataRes }).tree;
        }
    } catch (e) {
        console.error('获取文件树数据失败:', e);
    } finally {
        appState.isLoading = false;
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
    const uncategorized = new FolderNode({ title: '未分类', isEditing: false, isOpen: true });
    const history = new FolderNode({ title: '历史', isEditing: false, isOpen: false });
    const newWorkspace = {
        id: `workspace_${Date.now()}`,
        name,
        tree: new FolderNode({ title: 'root', children: [uncategorized, history] }),
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

// 监听 DeepSeek 对话生成完成事件，如果未加入目录，自动加入未分类文件夹
const handleChatCompleted = async (event) => {
    const { chatSessionId } = event.detail;
    if (!chatSessionId) return;

    const chatUrl = `https://chat.deepseek.com/a/chat/s/${chatSessionId}`;

    // 在所有工作区中检查是否已经存在该对话
    let exists = false;
    for (const workspace of appState.workspaces) {
        if (workspace.tree && findNodeByUrl(workspace.tree, chatUrl)) {
            exists = true;
            break;
        }
    }

    if (!exists && treeData.value) {
        // 在当前工作区查找或创建“未分类”文件夹
        let uncategorizedFolder = treeData.value.children.find(child => child instanceof FolderNode && child.title === '未分类');
        if (!uncategorizedFolder) {
            uncategorizedFolder = new FolderNode({ title: '未分类', isEditing: false, isOpen: true });
            treeData.value.children.unshift(uncategorizedFolder); // 添加到顶部
        }

        // 获取当天日期，在"未分类"下查找或创建日期文件夹
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        let dateFolder = uncategorizedFolder.children.find(child => child instanceof FolderNode && child.title === dateStr);
        if (!dateFolder) {
            dateFolder = new FolderNode({ title: dateStr, isEditing: false, isOpen: true });
            // 按日期降序插入（新日期靠前）
            let insertIdx = 0;
            while (insertIdx < uncategorizedFolder.children.length &&
                   uncategorizedFolder.children[insertIdx] instanceof FolderNode &&
                   uncategorizedFolder.children[insertIdx].title > dateStr) {
                insertIdx++;
            }
            uncategorizedFolder.children.splice(insertIdx, 0, dateFolder);
        }

        // 创建新的 ChatNode，加入日期文件夹
        const newNode = new ChatNode({ title: '未命名对话', url: chatUrl });
        dateFolder.addChild(newNode);
        uncategorizedFolder.isOpen = true; // 确保展开
        dateFolder.isOpen = true;

        showNotify(`对话已自动归档至"未分类 / ${dateStr}"`, 'success');
        
        // 确保新加入目录后立即保存
        persistCurrentWorkspace();
        
        // 异步尝试获取最新标题，不阻塞当前逻辑
        setTimeout(async () => {
            try {
                const response = await fetchChatHistory(chatSessionId);
                const session = response?.data?.biz_data?.chat_session;
                if (session) {
                    // 获取响应式的节点对象更新以触发UI变化
                    const reactiveNode = findNodeByUrl(treeData.value, chatUrl);
                    if (reactiveNode) {
                        if (session.title) {
                            reactiveNode.title = session.title;
                            updateChatTitleOnServer(chatSessionId, session.title);
                        }
                        reactiveNode.insertedAt = session.inserted_at ?? reactiveNode.insertedAt;
                        reactiveNode.updatedAt = session.updated_at ?? reactiveNode.updatedAt;
                        persistCurrentWorkspace();
                    }
                }
                console.log('对话标题更新完成:', session?.title);
            } catch (e) {
                console.warn('[ChatTree] 获取自动归档的对话标题失败:', e);
            }
        }, 0);
    }
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

// 递归收集树中所有可见的 ChatNode（仅遍历已展开的文件夹）
const collectVisibleChatNodes = (node, result) => {
    if (node instanceof ChatNode) {
        result.push(node);
    } else if (node instanceof FolderNode) {
        for (const child of node.children) {
            if (child instanceof ChatNode) {
                result.push(child);
            } else if (child instanceof FolderNode && child.isOpen) {
                collectVisibleChatNodes(child, result);
            }
        }
    }
};

// 异步更新当前可见的所有对话节点的标题
const updateAllChatTitles = async () => {
    const chatNodes = [];
    for (const workspace of appState.workspaces) {
        if (!workspace.tree) continue;
        collectVisibleChatNodes(workspace.tree, chatNodes);
    }

    if (chatNodes.length === 0) return;

    // 逐个请求，避免对服务器造成压力
    for (const node of chatNodes) {
        const sessionId = getSessionIdFromUrl(node.url);
        if (!sessionId) continue;
        try {
            const response = await fetchChatHistory(sessionId);
            const session = response?.data?.biz_data?.chat_session;
            if (session) {
                if (session.title && node.title !== session.title) {
                    node.title = session.title;
                    updateChatTitleOnServer(sessionId, session.title);
                }
                node.insertedAt = session.inserted_at ?? node.insertedAt;
                node.updatedAt = session.updated_at ?? node.updatedAt;
            }
        } catch (e) {
            // 单个对话获取失败时静默跳过
        }
    }
};

// 整理对话树：将过期日期文件夹从未分类迁移到历史，并聚合历史中的日期文件夹
const organizeChatTree = () => {
    // 解析 YYYY-MM-DD 格式的日期文件夹标题
    const parseDateFolder = (folder) => {
        if (!(folder instanceof FolderNode)) return null;
        const match = folder.title.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        return {
            year: parseInt(match[1], 10),
            month: parseInt(match[2], 10),
            day: parseInt(match[3], 10),
            folder
        };
    };

    // 按标题字符串降序插入：越新的日期/年份/月份越靠上
    const insertSortedDesc = (parent, child) => {
        let i = 0;
        while (i < parent.children.length && parent.children[i].title > child.title) {
            i++;
        }
        parent.children.splice(i, 0, child);
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    for (const workspace of appState.workspaces) {
        const tree = workspace.tree;
        if (!(tree instanceof FolderNode)) continue;

        const uncategorized = tree.children.find(
            child => child instanceof FolderNode && child.title === '未分类'
        );
        let history = tree.children.find(
            child => child instanceof FolderNode && child.title === '历史'
        );
        if (!uncategorized && !history) continue;
        if (!history) {
            history = new FolderNode({ title: '历史', isEditing: false, isOpen: false });
            const uIdx = tree.children.indexOf(uncategorized);
            tree.children.splice(uIdx >= 0 ? uIdx + 1 : 0, 0, history);
        }

        // 1. 将未分类中超过3天的日期文件夹移入历史，空文件夹直接删除
        if (uncategorized) {
            const toMove = [];
            for (const child of uncategorized.children) {
                const parsed = parseDateFolder(child);
                if (parsed) {
                    const folderDate = new Date(parsed.year, parsed.month - 1, parsed.day);
                    if (folderDate < threeDaysAgo) {
                        toMove.push(child);
                    }
                }
            }
            for (const child of toMove) {
                uncategorized.removeChild(child);
                if (child.children.length === 0) {
                    // 空日期文件夹直接丢弃
                    continue;
                }
                child.isOpen = false;
                insertSortedDesc(history, child);
            }
        }

        // 2. 历史中：去年的日期文件夹移入年份文件夹，上个月的移入月份文件夹
        //    先从历史直接子节点中收集日期文件夹（排除已有的月份/年份聚合文件夹）
        const processHistoryLevel = (parentFolder, yearThreshold, monthThreshold) => {
            const dateFolders = [];
            const otherFolders = [];
            for (const child of parentFolder.children) {
                const parsed = parseDateFolder(child);
                if (parsed) {
                    dateFolders.push(parsed);
                } else if (child instanceof FolderNode) {
                    otherFolders.push(child);
                }
            }

            // 先处理去年的：按年份聚合
            const lastYearFolders = dateFolders.filter(p => p.year < yearThreshold);
            const yearGroups = {};
            for (const parsed of lastYearFolders) {
                const yearKey = String(parsed.year);
                if (!yearGroups[yearKey]) yearGroups[yearKey] = [];
                yearGroups[yearKey].push(parsed.folder);
            }
            for (const [yearKey, folders] of Object.entries(yearGroups)) {
                let yearFolder = parentFolder.children.find(
                    child => child instanceof FolderNode && child.title === yearKey
                );
                if (!yearFolder) {
                    yearFolder = new FolderNode({ title: yearKey, isEditing: false, isOpen: false });
                    insertSortedDesc(parentFolder, yearFolder);
                }
                for (const f of folders) {
                    f.isOpen = false;
                    parentFolder.removeChild(f);
                    insertSortedDesc(yearFolder, f);
                }
            }

            // 再处理上个月的（但不是去年的）：按月份聚合
            const lastMonthFolders = dateFolders.filter(p =>
                p.year === yearThreshold && p.month < monthThreshold &&
                !lastYearFolders.includes(p)
            );
            // 还要处理去年的上个月份
            const prevYearMonthFolders = dateFolders.filter(p =>
                p.year === yearThreshold - 1 && !lastYearFolders.includes(p)
            );
            const monthCandidates = [...lastMonthFolders, ...prevYearMonthFolders];
            const monthGroups = {};
            for (const parsed of monthCandidates) {
                const monthKey = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
                if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
                monthGroups[monthKey].push(parsed.folder);
            }
            for (const [monthKey, folders] of Object.entries(monthGroups)) {
                let monthFolder = parentFolder.children.find(
                    child => child instanceof FolderNode && child.title === monthKey
                );
                if (!monthFolder) {
                    monthFolder = new FolderNode({ title: monthKey, isEditing: false, isOpen: false });
                    insertSortedDesc(parentFolder, monthFolder);
                }
                for (const f of folders) {
                    f.isOpen = false;
                    parentFolder.removeChild(f);
                    insertSortedDesc(monthFolder, f);
                }
            }

            // 递归处理已有的月份聚合文件夹：如果它的日期子文件夹现在属于更早的年份，不用动（已经在年份聚合中处理了）
            // 但需要检查去年月份文件夹是否应该归入年份文件夹
            for (const child of parentFolder.children) {
                if (!(child instanceof FolderNode)) continue;
                const monthMatch = child.title.match(/^(\d{4})-(\d{2})$/);
                if (monthMatch) {
                    const mYear = parseInt(monthMatch[1], 10);
                    if (mYear < currentYear) {
                        // 去年的月份文件夹，归入年份文件夹
                        let yearFolder = parentFolder.children.find(
                            c => c instanceof FolderNode && c.title === monthMatch[1]
                        );
                        if (!yearFolder) {
                            yearFolder = new FolderNode({ title: monthMatch[1], isEditing: false, isOpen: false });
                            insertSortedDesc(parentFolder, yearFolder);
                        }
                        child.isOpen = false;
                        parentFolder.removeChild(child);
                        insertSortedDesc(yearFolder, child);
                    }
                }
            }
        };

        processHistoryLevel(history, currentYear, currentMonth);

        // 3. 对历史中的年份文件夹，递归处理其内部的月份聚合
        for (const child of history.children) {
            if (!(child instanceof FolderNode)) continue;
            const yearMatch = child.title.match(/^(\d{4})$/);
            if (yearMatch) {
                processHistoryLevel(child, currentYear, currentMonth);
            }
        }
    }
};

onMounted(() => {
    // 每次打开网页时，先获取远端工作区并应用，然后再加载
    fetchAndApplyWorkspaces().then(() => {
        loadWorkspace();
        // 整理对话树：迁移过期日期文件夹
        organizeChatTree();
        // 异步更新所有对话节点的标题
        updateAllChatTitles();
    });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // 监听 DeepSeek completion 流中的标题事件
    window.addEventListener('deepseek-title-detected', handleTitleDetected);
    
    // 监听 DeepSeek 对话生成完成事件
    window.addEventListener('deepseek-chat-completed', handleChatCompleted);

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
    window.removeEventListener('deepseek-chat-completed', handleChatCompleted);
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
        @workspace-changed="newTree => treeData = newTree"
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
