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
                                    <span v-if="editingWorkspaceId !== workspace.id" class="workspace-name-text">{{ workspace.name }}</span>
                                    <input v-else
                                           ref="editInputRef"
                                           type="text"
                                           v-model="editWorkspaceName"
                                           @blur="finishEditWorkspace('blur', workspace)"
                                           @keyup.enter="finishEditWorkspace('enter', workspace)"
                                           @click.stop
                                           class="workspace-name-input" />
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
                                    @click="toggleActionMenu(workspace.id, $event)"
                                >
                                    <span class="material-icons">more_vert</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <!-- 子菜单通过 Teleport 传送到 body，避免被 overflow 裁剪 -->
                    <Teleport to="body">
                        <div
                            v-if="openActionMenuId"
                            class="workspace-action-menu"
                            role="menu"
                            :style="{ position: 'fixed', top: actionMenuPos.y + 'px', left: actionMenuPos.x + 'px' }"
                            @click.stop
                        >
                            <button class="workspace-action-menu-item" role="menuitem" @click="handleBindFolderFromMenu(activeActionWorkspace)">
                                <span class="material-icons">folder_open</span>
                                <span>编辑绑定文件夹</span>
                            </button>
                            <button class="workspace-action-menu-item" role="menuitem" @click="handleRenameFromMenu(activeActionWorkspace)">
                                <span class="material-icons">edit</span>
                                <span>重命名</span>
                            </button>
                            <button
                                class="workspace-action-menu-item workspace-action-menu-delete"
                                role="menuitem"
                                @click="handleDeleteFromMenu(activeActionWorkspace)"
                                :disabled="workspaces.length === 1"
                            >
                                <span class="material-icons">delete</span>
                                <span>删除</span>
                            </button>
                        </div>
                    </Teleport>
                    <input
                        ref="folderInputRef"
                        type="file"
                        webkitdirectory
                        directory
                        multiple
                        hidden
                        @change="handleFolderInputChange"
                    />
                    <div class="bct-workspace-create">
                        <div class="bct-workspace-create-row">
                            <input v-model="newWorkspaceName" placeholder="新工作区名称" />
                            <button class="bct-create-btn" @click="handleCreate">新建工作区</button>
                        </div>
                        <button class="bct-import-btn" @click="handleImportWorkspace">
                            <span class="material-icons">upload_file</span>
                            <span>导入工作区</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { ref, nextTick } from 'vue';
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

const emit = defineEmits(['close', 'select', 'create', 'import-workspace', 'bind-folder', 'rename', 'delete']);

const newWorkspaceName = ref('');
const folderInputRef = ref(null);
const pendingBindWorkspaceId = ref(null);
const openActionMenuId = ref(null);
const actionMenuPos = ref({ x: 0, y: 0 });
const activeActionWorkspace = ref(null);

// 内联编辑工作区名称
const editingWorkspaceId = ref(null);
const editWorkspaceName = ref('');
const editInputRef = ref(null);
const oldWorkspaceName = ref('');

const truncatePath = (path, maxLength = 30) => {
    if (!path || path.length <= maxLength) return path;
    const half = Math.floor((maxLength - 3) / 2);
    return path.slice(0, half) + '...' + path.slice(-half);
};

const handleClose = () => {
    closeActionMenu();
    // blur 事件会自然触发 finishEditWorkspace，这里只需清理状态
    editingWorkspaceId.value = null;
    emit('close');
};

const handleSelect = (workspaceId) => {
    if (editingWorkspaceId.value) return; // 编辑中不允许切换
    closeActionMenu();
    emit('select', workspaceId);
    emit('close');
};

const toggleActionMenu = (workspaceId, event) => {
    if (openActionMenuId.value === workspaceId) {
        closeActionMenu();
        return;
    }
    const btn = event.currentTarget;
    const rect = btn.getBoundingClientRect();
    // 菜单显示在按钮右下方，优先靠右对齐
    actionMenuPos.value = {
        x: rect.right - 168, // 菜单 min-width 为 168px，右边缘与按钮右边缘对齐
        y: rect.bottom + 6
    };
    openActionMenuId.value = workspaceId;
    activeActionWorkspace.value = props.workspaces.find(ws => ws.id === workspaceId) || null;
};

const closeActionMenu = () => {
    openActionMenuId.value = null;
    activeActionWorkspace.value = null;
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

const handleImportWorkspace = () => {
    emit('import-workspace');
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

const startEditWorkspace = (workspace) => {
    oldWorkspaceName.value = workspace.name;
    editWorkspaceName.value = workspace.name;
    editingWorkspaceId.value = workspace.id;
    nextTick(() => {
        const input = document.querySelector('.workspace-name-input');
        if (input) {
            input.focus();
            input.select();
        }
    });
};

const finishEditWorkspace = (triggerType, workspace) => {
    if (editingWorkspaceId.value !== workspace.id) return;
    const newName = editWorkspaceName.value.trim();

    if (!newName) {
        // 空名称：取消重命名，恢复原名
        showNotify('工作区名称不能为空。', 'warning');
        editWorkspaceName.value = oldWorkspaceName.value;
        editingWorkspaceId.value = null;
        return;
    }

    if (newName !== oldWorkspaceName.value) {
        // 检查重名
        if (props.workspaces.some(ws => ws.id !== workspace.id && ws.name.trim() === newName)) {
            if (triggerType === 'enter') {
                showNotify('工作区名称已存在，请重新命名。', 'warning');
                return; // 保持编辑状态
            }
            // blur 时：恢复原名并通知
            showNotify('工作区名称已存在，已恢复原名。', 'warning');
            editWorkspaceName.value = oldWorkspaceName.value;
            editingWorkspaceId.value = null;
            return;
        }
        emit('rename', { id: workspace.id, name: newName });
    }
    editingWorkspaceId.value = null;
};

const handleRenameFromMenu = (workspace) => {
    closeActionMenu();
    startEditWorkspace(workspace);
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
    width: 720px;
    max-width: calc(100vw - 32px);
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
    padding: 0;
    display: flex;
    align-items: stretch;
    max-height: calc(80vh - 72px);
}

.bct-workspace-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1.35 1 0;
    min-height: 0;
    max-height: 360px;
    overflow-y: auto;
    padding: 20px;
    box-sizing: border-box;
    background: #fbfdff;
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

.workspace-name-input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #1c64f2;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 14px;
    background: #fff;
    color: #333;
    outline: none;
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
    z-index: 1000001;
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
    width: 100%;
    flex: 0.9 1 0;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    min-width: 0;
    padding: 20px;
    box-sizing: border-box;
    border-left: 1px solid #e5e7eb;
    background: #fff;
}

.bct-workspace-create-row {
    display: flex;
    gap: 10px;
}

.bct-workspace-create input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 14px;
}

.bct-create-btn {
    border: none;
    border-radius: 10px;
    padding: 10px 14px;
    background-color: #1c64f2;
    color: #fff;
    cursor: pointer;
    font-size: 14px;
    white-space: nowrap;
}

.bct-import-btn {
    width: 100%;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 10px 12px;
    background: #fff;
    color: #374151;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 14px;
}

.bct-import-btn:hover {
    background: #f3f4f6;
}

.bct-import-btn .material-icons {
    font-size: 18px;
}

@media (max-width: 640px) {
    .bct-modal-body {
        flex-direction: column;
    }

    .bct-workspace-list,
    .bct-workspace-create {
        width: 100%;
    }

    .bct-workspace-create {
        flex-basis: auto;
        border-left: none;
        border-top: 1px solid #e5e7eb;
    }
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

    .bct-workspace-list {
        background: #202020;
    }

    .bct-workspace-create {
        border-left-color: #333;
        background: #1e1e1e;
    }

    .bct-import-btn {
        background: #262626;
        border-color: #333;
        color: #ddd;
    }

    .bct-import-btn:hover {
        background: #383838;
    }

    .workspace-name-text {
        color: #eee;
    }

    .workspace-name-input {
        background: #2d2d2d;
        color: #eee;
        border-color: #2563eb;
    }
}
</style>
