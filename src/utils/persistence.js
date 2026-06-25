import { FolderNode, ChatNode, findNodeByUrl } from '../models/TreeNode.js';
import { defaultSettings } from '../models/AppState.js';

// 反序列化辅助函数
function reviveNode(data) {
    if (data.children !== undefined) {
        const folder = new FolderNode({ id: data.id, title: data.title, isEditing: false, isOpen: data.isOpen, insertedAt: data.insertedAt ?? null, updatedAt: data.updatedAt ?? null });
        folder.children = data.children.map(child => reviveNode(child));
        return folder;
    } else {
        return new ChatNode({ id: data.id, title: data.title, url: data.url, isEditing: false, insertedAt: data.insertedAt ?? null, updatedAt: data.updatedAt ?? null });
    }
}

function createDefaultWorkspace() {
    const uncategorized = new FolderNode({ title: '未分类', isEditing: false, isOpen: true });
    const history = new FolderNode({ title: '历史', isEditing: false, isOpen: false });
    return {
        id: `workspace_${Date.now()}`,
        name: '默认工作区',
        tree: new FolderNode({ title: 'root', children: [uncategorized, history] }),
        settings: { skipDeleteConfirm: false },
        sidebarWidth: 335
    };
}

function normalizeSettings(settings = {}, legacySidebarWidth = 335) {
    const syncServerPort = Number(settings.syncServerPort);
    return {
        ...defaultSettings,
        ...settings,
        sidebarWidth: Math.max(335, Number(settings.sidebarWidth || legacySidebarWidth || defaultSettings.sidebarWidth)),
        syncServerPort: Number.isInteger(syncServerPort) && syncServerPort >= 1 && syncServerPort <= 65535
            ? syncServerPort
            : defaultSettings.syncServerPort
    };
}

function ensureUncategorized(tree) {
    if (!(tree instanceof FolderNode)) return tree;
    const hasUncategorized = tree.children.some(
        child => child instanceof FolderNode && child.title === '未分类'
    );
    if (!hasUncategorized) {
        tree.children.splice(0, 0, new FolderNode({ title: '未分类', isEditing: false, isOpen: true }));
    }
    const hasHistory = tree.children.some(
        child => child instanceof FolderNode && child.title === '历史'
    );
    if (!hasHistory) {
        // 历史排在未分类之后
        const uncategorizedIdx = tree.children.findIndex(child => child instanceof FolderNode && child.title === '未分类');
        const insertIdx = uncategorizedIdx >= 0 ? uncategorizedIdx + 1 : 0;
        tree.children.splice(insertIdx, 0, new FolderNode({ title: '历史', isEditing: false, isOpen: false }));
    }
    return tree;
}

/** 递归折叠历史文件夹内的所有子文件夹 */
function collapseHistoryFolders(tree) {
    const historyNode = tree.children.find(
        child => child instanceof FolderNode && child.title === '历史'
    );
    if (!historyNode) return;

    const collapseRecursive = (node) => {
        if (!(node instanceof FolderNode)) return;
        node.isOpen = false;
        for (const child of node.children) {
            collapseRecursive(child);
        }
    };

    for (const child of historyNode.children) {
        collapseRecursive(child);
    }
}

export function reviveWorkspace(item, fallbackName = '工作区') {
    const tree = item.tree ? reviveNode(item.tree) : new FolderNode({ title: 'root', children: [] });
    ensureUncategorized(tree);
    collapseHistoryFolders(tree);
    return {
        id: item.id || `workspace_${Date.now()}`,
        name: item.name || fallbackName,
        tree,
        folderPath: item.folderPath || null
    };
}

// 加载持久化数据
export function loadPersistedData() {
    try {
        const saved = GM_getValue('chattree_data', null);
        if (saved && Array.isArray(saved.workspaces) && saved.workspaces.length > 0) {
            const workspaces = saved.workspaces.map(item => reviveWorkspace(item));

            const currentWorkspaceId = saved.currentWorkspaceId || workspaces[0].id;
            const currentWorkspace = workspaces.find(workspace => workspace.id === currentWorkspaceId) || workspaces[0];

            return {
                workspaces,
                currentWorkspaceId: currentWorkspace.id,
                tree: currentWorkspace.tree,
                settings: normalizeSettings(saved.settings),
                sidebarWidth: Math.max(335, (saved.settings && saved.settings.sidebarWidth) || 335)
            };
        }

        if (saved && saved.tree) {
            const legacyWorkspace = createDefaultWorkspace();
            legacyWorkspace.tree = reviveNode(saved.tree);
            return {
                workspaces: [legacyWorkspace],
                currentWorkspaceId: legacyWorkspace.id,
                tree: legacyWorkspace.tree,
                settings: normalizeSettings(saved.settings, saved.sidebarWidth),
                sidebarWidth: Math.max(335, (saved.settings && saved.settings.sidebarWidth) || saved.sidebarWidth || 335)
            };
        }
    } catch (e) {
        console.error('加载持久化数据失败:', e);
    }

    const defaultWorkspace = createDefaultWorkspace();
    return {
        workspaces: [defaultWorkspace],
        currentWorkspaceId: defaultWorkspace.id,
        tree: defaultWorkspace.tree,
        settings: { ...defaultSettings },
        sidebarWidth: 335
    };
}

// 保存持久化数据
export function savePersistedData(workspaces, currentWorkspaceId, settings) {
    const dataToSave = {
        workspaces: workspaces.map(workspace => ({
            id: workspace.id,
            name: workspace.name,
            tree: workspace.tree,
            folderPath: workspace.folderPath || null
        })),
        currentWorkspaceId,
        settings
    };
    GM_setValue('chattree_data', dataToSave);
}

// 导出数据（用于导出功能）
export function exportPersistedData(workspaces, currentWorkspaceId, settings) {
    return {
        workspaces: workspaces.map(workspace => ({
            id: workspace.id,
            name: workspace.name,
            tree: workspace.tree,
            folderPath: workspace.folderPath || null
        })),
        currentWorkspaceId,
        settings,
        exportTime: new Date().toISOString()
    };
}

/**
 * 将 sourceTree 的节点合并到 targetTree 中。
 * 规则：
 *   - 同名文件夹递归合并
 *   - ChatNode 按 url 去重（已存在则跳过）
 *   - 不存在的文件夹和对话直接追加
 */
export function mergeTrees(targetTree, sourceTree) {
    if (!(targetTree instanceof FolderNode) || !(sourceTree instanceof FolderNode)) return;
    for (const sourceChild of sourceTree.children) {
        if (sourceChild instanceof ChatNode) {
            if (!findNodeByUrl(targetTree, sourceChild.url)) {
                targetTree.addChild(sourceChild);
            }
        } else if (sourceChild instanceof FolderNode) {
            const existingFolder = targetTree.children.find(
                child => child instanceof FolderNode && child.title === sourceChild.title
            );
            if (existingFolder) {
                mergeTrees(existingFolder, sourceChild);
            } else {
                targetTree.addChild(sourceChild);
            }
        }
    }
}

/** 从导入数据中提取工作区数组（兼容新旧导出格式） */
export function extractWorkspacesFromImport(data) {
    let source = data;
    if (data.data && data.data.chattree_data) {
        source = data.data.chattree_data;
    }
    return Array.isArray(source.workspaces) ? source.workspaces : [source];
}

/** 生成不重复的工作区 ID */
export function getUniqueWorkspaceId(baseId, existingIds) {
    let id = baseId || `workspace_${Date.now()}`;
    while (existingIds.has(id)) {
        id = `workspace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    }
    return id;
}

/** 生成不重复的工作区名称 */
export function getUniqueWorkspaceName(baseName, existingNames) {
    const name = baseName || '导入工作区';
    if (!existingNames.has(name)) return name;
    let index = 2;
    let nextName = `${name} (${index})`;
    while (existingNames.has(nextName)) {
        index += 1;
        nextName = `${name} (${index})`;
    }
    return nextName;
}
