<template>
    <!-- 工作区管理菜单 -->
    <Teleport to="body">
        <div v-if="isOpen" class="bct-modal-overlay" @click.self="handleClose">
            <div class="bct-modal-content" @click="closeActionMenu">
                <div class="bct-modal-header">
                    <h3>工作区管理</h3>
                    <button class="bct-close-btn" @click="handleClose">×</button>
                </div>
                <div class="bct-modal-body">
                    <div class="bct-workspace-list">
                        <div v-for="workspace in workspaces" :key="workspace.id" class="bct-workspace-entry">
                            <button class="workspace-select-btn" @click="handleSelect(workspace.id)">
                                <div class="workspace-title-group">
                                    <span class="workspace-name-text">{{ workspace.name }}</span>
                                    <span v-if="workspace.folderPath" class="workspace-folder-hint">绑定：{{ truncatePath(workspace.folderPath) }}</span>
                                </div>
                                <span v-if="workspace.id === currentWorkspaceId" class="workspace-current">当前</span>
                            </button>
                            <div class="workspace-actions" @click.stop>
                                <button
                                    class="workspace-more-btn"
                                    title="更多操作"
                                    aria-haspopup="menu"
                                    :aria-expanded="openActionMenuId === workspace.id"
                                    @click="toggleActionMenu(workspace.id)"
                                >
                                    <span class="material-icons">more_vert</span>
                                </button>
                                <div v-if="openActionMenuId === workspace.id" class="workspace-action-menu" role="menu">
                                    <button class="workspace-action-menu-item" role="menuitem" @click="handleBindFolderFromMenu(workspace)">
                                        <span class="material-icons">folder_open</span>
                                        <span>编辑绑定文件夹</span>
                                    </button>
                                    <button class="workspace-action-menu-item" role="menuitem" @click="handleRenameFromMenu(workspace)">
                                        <span class="material-icons">edit</span>
                                        <span>重命名</span>
                                    </button>
                                    <button
                                        class="workspace-action-menu-item workspace-action-menu-delete"
                                        role="menuitem"
                                        @click="handleDeleteFromMenu(workspace)"
                                        :disabled="workspaces.length === 1"
                                    >
                                        <span class="material-icons">delete</span>
                                        <span>删除</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <input
                        ref="folderInputRef"
                        type="file"
                        webkitdirectory
                        directory
                        multiple
                        hidden
                        @change="handleFolderInputChange"
                    />
                </div>
                <div class="bct-workspace-create">
                    <input v-model="newWorkspaceName" placeholder="新工作区名称" />
                    <button class="bct-create-btn" @click="handleCreate">新建工作区</button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { ref } from 'vue';
import { defineProps, defineEmits } from 'vue';
import { showNotify } from '../utils/notify.js';

const props = defineProps({
    isOpen: Boolean,
    workspaces: {
        type: Array,
        required: true
    },
    currentWorkspaceId: {
        type: String,
        required: true
    }
});

const emit = defineEmits(['close', 'select', 'create', 'bind-folder', 'rename', 'delete']);

const newWorkspaceName = ref('');
const folderInputRef = ref(null);
const pendingBindWorkspaceId = ref(null);
const openActionMenuId = ref(null);

const truncatePath = (path, maxLength = 30) => {
    if (!path || path.length <= maxLength) return path;
    const half = Math.floor((maxLength - 3) / 2);
    return path.slice(0, half) + '...' + path.slice(-half);
};

const handleClose = () => {
    closeActionMenu();
    emit('close');
};

const handleSelect = (workspaceId) => {
    closeActionMenu();
    emit('select', workspaceId);
    emit('close');
};

const toggleActionMenu = (workspaceId) => {
    openActionMenuId.value = openActionMenuId.value === workspaceId ? null : workspaceId;
};

const closeActionMenu = () => {
    openActionMenuId.value = null;
};

const handleCreate = () => {
    const name = newWorkspaceName.value.trim();
    if (!name) {
        showNotify('工作区名称不能为空。', 'warning');
        return;
    }
    if (props.workspaces.some(ws => ws.name.trim() === name)) {
        showNotify('工作区名称已存在，请修改后再试。', 'warning');
        return;
    }
    emit('create', { name, folderPath: null });
    newWorkspaceName.value = '';
};

const handleBindFolder = async (workspace) => {
    pendingBindWorkspaceId.value = workspace.id;
    if (window.showDirectoryPicker) {
        try {
            const handle = await window.showDirectoryPicker();
            emit('bind-folder', { id: workspace.id, folderPath: handle.name });
            pendingBindWorkspaceId.value = null;
            return;
        } catch (e) {
            if (e.name === 'AbortError') {
                pendingBindWorkspaceId.value = null;
                return;
            }
            console.error('选择目录失败：', e);
        }
    }
    if (folderInputRef.value) {
        folderInputRef.value.value = null;
        folderInputRef.value.click();
    }
};

const handleBindFolderFromMenu = async (workspace) => {
    closeActionMenu();
    await handleBindFolder(workspace);
};

const handleFolderInputChange = (event) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !pendingBindWorkspaceId.value) return;
    const firstFile = files[0];
    const relativePath = firstFile.webkitRelativePath || firstFile.name;
    const folderName = relativePath.split('/')[0];
    emit('bind-folder', { id: pendingBindWorkspaceId.value, folderPath: folderName });
    pendingBindWorkspaceId.value = null;
};

const handleRename = (workspace) => {
    const newName = prompt('请输入新的工作区名称：', workspace.name);
    if (newName && newName.trim()) {
        emit('rename', { id: workspace.id, name: newName.trim() });
    }
};

const handleRenameFromMenu = (workspace) => {
    closeActionMenu();
    handleRename(workspace);
};

const handleDelete = (workspace) => {
    if (props.workspaces.length === 1) return;
    const confirmed = confirm(`确定删除工作区 “${workspace.name}” 吗？此操作将删除该工作区的数据。`);
    if (confirmed) {
        emit('delete', workspace.id);
    }
};

const handleDeleteFromMenu = (workspace) => {
    closeActionMenu();
    handleDelete(workspace);
};
</script>

<style scoped>
.bct-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000000;
}

.bct-modal-content {
    background: #fff;
    width: 520px;
    max-height: 80vh;
    border-radius: 14px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    color: #333;
}

.bct-modal-header {
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e5e7eb;
}

.bct-modal-header h3 {
    margin: 0;
    font-size: 18px;
}

.bct-close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #888;
}

.bct-modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-height: calc(80vh - 72px);
}

.bct-workspace-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    min-height: 0;
    max-height: 360px;
    overflow-y: auto;
    padding-right: 4px;
}

.bct-workspace-list::-webkit-scrollbar {
    width: 8px;
}

.bct-workspace-list::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.5);
    border-radius: 999px;
}


.workspace-current {
    color: #1c64f2;
    font-size: 12px;
    background: rgba(59, 130, 246, 0.12);
    padding: 2px 8px;
    border-radius: 999px;
    line-height: 1.4;
}

.workspace-title-group {
    min-width: 0;
}

.workspace-name-text {
    display: block;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.bct-workspace-entry {
    background: #f8fafc;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.workspace-select-btn {
    width: auto;
    flex: 1;
    text-align: left;
    padding: 8px 12px;
    border: none;
    border-radius: 10px;
    background: #fff;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
}

.workspace-actions {
    display: flex;
    gap: 8px;
    position: relative;
}

.workspace-title-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
}

.workspace-folder-hint {
    color: #6b7280;
    font-size: 12px;
}

.workspace-more-btn {
    width: 36px;
    height: 36px;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    background: #fff;
    color: #374151;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s, border-color 0.2s;
}

.workspace-more-btn:hover {
    background: #f3f4f6;
}

.workspace-more-btn .material-icons {
    font-size: 18px;
}

.workspace-action-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 2;
    min-width: 168px;
    padding: 6px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.16);
}

.workspace-action-menu-item {
    width: 100%;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #374151;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 10px;
    font-size: 13px;
    text-align: left;
}

.workspace-action-menu-item:hover:not(:disabled) {
    background: #f3f4f6;
}

.workspace-action-menu-item .material-icons {
    font-size: 18px;
}

.workspace-action-menu-delete {
    color: #b91c1c;
}

.workspace-action-menu-item:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.bct-workspace-create {
    display: flex;
    gap: 10px;
    padding: 20px 20px 20px;
    border-radius: 0 0 14px 14px;
}

.bct-workspace-create input {
    flex: 1;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 14px;
}

.bct-create-btn {
    border: none;
    border-radius: 10px;
    padding: 10px 16px;
    background-color: #1c64f2;
    color: #fff;
    cursor: pointer;
    font-size: 14px;
}

@media (prefers-color-scheme: dark) {
    .bct-modal-content {
        background: #1e1e1e;
        color: #eee;
    }

    .bct-modal-header {
        border-bottom-color: #333;
    }

    .bct-modal-body {
        background: #1e1e1e;
    }

    .bct-workspace-entry,
    .workspace-select-btn,
    .bct-workspace-create input {
        background: #2d2d2d;
        border-color: #333;
        color: #eee;
    }

    .workspace-current {
        color: #dbeafe;
        background: rgba(148, 163, 184, 0.16);
    }

    .workspace-more-btn {
        background: #262626;
        border-color: #333;
        color: #ddd;
    }

    .workspace-more-btn:hover {
        background: #383838;
    }

    .workspace-action-menu {
        background: #262626;
        border-color: #333;
        box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
    }

    .workspace-action-menu-item {
        color: #ddd;
    }

    .workspace-action-menu-item:hover:not(:disabled) {
        background: #383838;
    }

    .workspace-action-menu-delete {
        color: #fecaca;
    }

    .bct-create-btn {
        background-color: #2563eb;
    }

    .bct-workspace-create {
        border-top-color: #374151;
        background: #262626;
    }
}
</style>
