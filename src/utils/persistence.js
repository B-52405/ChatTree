import { FolderNode, ChatNode } from '../models/TreeNode.js';

// 反序列化辅助函数
function reviveNode(data) {
    if (data.children !== undefined) {
        const folder = new FolderNode({ id: data.id, title: data.title, isEditing: false, isOpen: data.isOpen });
        folder.children = data.children.map(child => reviveNode(child));
        return folder;
    } else {
        return new ChatNode({ id: data.id, title: data.title, url: data.url, isEditing: false });
    }
}

function createDefaultWorkspace() {
    return {
        id: `workspace_${Date.now()}`,
        name: '默认工作区',
        tree: new FolderNode({ title: 'root', children: [] }),
        settings: { skipDeleteConfirm: false },
        sidebarWidth: 335
    };
}

// 加载持久化数据
export function loadPersistedData() {
    try {
        const saved = GM_getValue('chattree_data', null);
        if (saved && Array.isArray(saved.workspaces) && saved.workspaces.length > 0) {
            const workspaces = saved.workspaces.map(item => ({
                id: item.id || `workspace_${Date.now()}`,
                name: item.name || '工作区',
                tree: item.tree ? reviveNode(item.tree) : new FolderNode({ title: 'root', children: [] }),
                folderPath: item.folderPath || null
            }));

            const currentWorkspaceId = saved.currentWorkspaceId || workspaces[0].id;
            const currentWorkspace = workspaces.find(workspace => workspace.id === currentWorkspaceId) || workspaces[0];

            return {
                workspaces,
                currentWorkspaceId: currentWorkspace.id,
                tree: currentWorkspace.tree,
                settings: saved.settings || { skipDeleteConfirm: false, sidebarWidth: 335 },
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
                settings: saved.settings || { skipDeleteConfirm: false, sidebarWidth: 335 },
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
        settings: { skipDeleteConfirm: false, sidebarWidth: 335 },
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
