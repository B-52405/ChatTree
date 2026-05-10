<template>
    <div class="bct-footer">
        <div class="bct-gradient-overlay"></div>
        <div class="bct-bottom-bar">
            <div class="bct-bar-content" :class="{ 'is-dragging': draggedNode }">
                <div class="bct-settings-mode">
                    <div class="workspace-dropdown" ref="dropdownRef">
                        <button class="workspace-toggle-btn" type="button" @click.stop="toggleMenu">
                            <span class="material-icons">folder</span>
                            <span class="workspace-name-text">{{ currentWorkspaceName }}</span>
                            <span class="material-icons dropdown-icon">expand_more</span>
                        </button>
                        <button
                            class="workspace-bind-btn"
                            type="button"
                            :title="currentWorkspace?.folderPath ? '修改绑定文件夹' : '绑定工作区文件夹'"
                            @click.stop="handleBindFolder"
                        >
                            <span class="material-icons">folder_open</span>
                        </button>
                        <input
                            ref="folderInputRef"
                            type="file"
                            webkitdirectory
                            directory
                            hidden
                            @change="handleFolderInputChange"
                        />
                    </div>
                    <button class="bct-icon-btn" title="设置" @click="handleSettingsClick">
                        <span class="material-icons">settings</span>
                    </button>
                </div>
                <div class="bct-delete-mode">
                    <div class="bct-delete-zone" @dragover.prevent @drop="handleDropDelete">
                        <span class="material-icons">delete</span>
                        <span>拖到此处删除</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <!-- 工作区选择菜单 -->
    <div v-if="menuOpen" class="workspace-menu-window" :style="menuStyle">
        <div class="workspace-menu-list" :class="{ 'is-scrollable': workspaces.length > 10 }">
            <button
                v-for="workspace in workspaces"
                :key="workspace.id"
                class="workspace-menu-item"
                @click.stop="selectWorkspace(workspace.id)">
                <div class="workspace-menu-item-inner">
                    <span class="workspace-name-text">{{ workspace.name }}</span>
                    <span v-if="workspace.folderPath" class="workspace-folder-hint">绑定：{{ truncatePath(workspace.folderPath) }}</span>
                </div>
                <span v-if="workspace.id === currentWorkspaceId" class="workspace-current-label">当前</span>
            </button>
        </div>
        <div class="workspace-menu-divider"></div>
        <button class="workspace-menu-action" type="button" @click.stop="handleManage">
            <span class="material-icons">manage_accounts</span>
            管理工作区
        </button>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, reactive, watch } from 'vue';

const props = defineProps({
    draggedNode: {
        type: Object,
        default: null
    },
    currentWorkspaceName: {
        type: String,
        required: true
    },
    currentWorkspaceId: {
        type: String,
        required: true
    },
    workspaces: {
        type: Array,
        required: true
    }
});

const emit = defineEmits(['settings', 'workspace-select', 'manage-workspace', 'bind-folder', 'drop-delete']);

const menuOpen = ref(false);
const dropdownRef = ref(null);
const folderInputRef = ref(null);
const menuStyle = reactive({
    top: 'auto',
    bottom: '72px',
    left: '0px'
});

const handleSettingsClick = () => {
    emit('settings');
};

const handleDropDelete = (e) => {
    emit('drop-delete', e);
};

const updateMenuPosition = () => {
    if (!dropdownRef.value) return;
    
    const button = dropdownRef.value.querySelector('.workspace-toggle-btn');
    const buttonRect = button.getBoundingClientRect();
    
    // 菜单显示在底部栏上方，按钮水平对齐
    menuStyle.top = 'auto';
    menuStyle.bottom = '72px'; // 底部栏高度 62px + 10px 间距
    menuStyle.left = buttonRect.left + 'px';
};

const toggleMenu = () => {
    menuOpen.value = !menuOpen.value;
    if (menuOpen.value) {
        // 菜单打开时，下一帧更新位置
        setTimeout(updateMenuPosition, 0);
    }
};

const currentWorkspace = computed(() => props.workspaces.find(ws => ws.id === props.currentWorkspaceId));

const truncatePath = (path, maxLength = 30) => {
    if (!path || path.length <= maxLength) return path;
    const half = Math.floor((maxLength - 3) / 2);
    return path.slice(0, half) + '...' + path.slice(-half);
};

const selectWorkspace = (workspaceId) => {
    emit('workspace-select', workspaceId);
    menuOpen.value = false;
};

const handleBindFolder = async () => {
    if (!currentWorkspace.value) return;

    if (window.showDirectoryPicker) {
        try {
            const handle = await window.showDirectoryPicker();
            emit('bind-folder', { id: currentWorkspace.value.id, folderPath: handle.name });
            return;
        } catch (e) {
            if (e.name === 'AbortError') {
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

const handleFolderInputChange = (event) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !currentWorkspace.value) return;
    const firstFile = files[0];
    const relativePath = firstFile.webkitRelativePath || firstFile.name;
    const folderName = relativePath.split('/')[0];
    emit('bind-folder', { id: currentWorkspace.value.id, folderPath: folderName });
};

const handleManage = () => {
    emit('manage-workspace');
    menuOpen.value = false;
};

const handleDocumentClick = (event) => {
    if (menuOpen.value && dropdownRef.value && !dropdownRef.value.contains(event.target)) {
        // 检查点击是否在菜单上
        const menuWindow = document.querySelector('.workspace-menu-window');
        if (menuWindow && !menuWindow.contains(event.target)) {
            menuOpen.value = false;
        }
    }
};

// 监听菜单打开状态，更新位置
watch(menuOpen, (newVal) => {
    if (newVal) {
        setTimeout(updateMenuPosition, 0);
    }
});

onMounted(() => {
    document.addEventListener('click', handleDocumentClick);
});

onUnmounted(() => {
    document.removeEventListener('click', handleDocumentClick);
});
</script>

<style scoped>
.bct-footer {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    pointer-events: none;
    display: flex;
    flex-direction: column;
}

.bct-gradient-overlay {
    height: 60px;
    background: linear-gradient(to bottom, transparent, #f9f9f9);
}

.bct-bottom-bar {
    background-color: #f9f9f9;
    height: 62px;
    pointer-events: auto;
    overflow: hidden;
    border-top: 1px solid #eee;
}

.bct-bar-content {
    display: flex;
    width: 200%;
    height: 100%;
    transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1);
}

.bct-bar-content.is-dragging {
    transform: translateX(-50%);
}

.bct-settings-mode {
    width: 50%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 15px;
    gap: 10px;
}

.bct-delete-mode {
    width: 50%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
}

.bct-icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #666;
    padding: 8px;
    border-radius: 50%;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.bct-icon-btn:hover {
    background-color: rgba(0, 0, 0, 0.05);
    color: #1c64f2;
}

.bct-icon-btn .material-icons {
    font-size: 24px;
}

.workspace-dropdown {
    position: relative;
}

.workspace-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid #d1d5db;
    border-radius: 999px;
    background: #fff;
    color: inherit;
    padding: 8px 12px;
    font-size: 13px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s, color 0.2s;
}

.workspace-toggle-btn:hover {
    border-color: #a5b4fc;
}

.workspace-toggle-btn .material-icons {
    font-size: 18px;
}

.workspace-name-text {
    display: inline-block;
    min-width: 0;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
}

.workspace-menu-item-inner {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
}

.workspace-menu-item-inner .workspace-name-text {
    width: 100%;
}

.workspace-bind-btn {
    margin-left: 10px;
    width: 38px;
    height: 38px;
    border: 1px solid #d1d5db;
    border-radius: 50%;
    background: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s, color 0.2s;
}

.workspace-bind-btn:hover {
    border-color: #a5b4fc;
    background: #f3f4ff;
}

.workspace-bind-btn .material-icons {
    font-size: 18px;
    color: #374151;
}

.workspace-bind-btn:hover .material-icons {
    color: #1c64f2;
}

.workspace-menu-action .material-icons {
    font-size: 18px;
    margin-right: 6px;
    vertical-align: middle;
}

@media (prefers-color-scheme: dark) {
    .workspace-toggle-btn {
        background: #1e1e1e;
        border-color: #333;
        color: #e5e7eb;
    }

    .workspace-menu-window,
    .workspace-menu-item,
    .workspace-menu-action {
        background: #1e1e1e;
        color: #e5e7eb;
    }

    .workspace-menu-item:hover,
    .workspace-menu-action:hover {
        background: #2c2c2c;
    }
}

.dropdown-icon {
    font-size: 18px;
}

.workspace-menu-window {
    position: fixed;
    min-width: 220px;
    background: #fff;
    box-shadow: 0 14px 30px rgba(0, 0, 0, 0.12);
    border-radius: 14px;
    overflow: hidden;
    z-index: 10000;
    animation: slideUp 0.15s ease-out;
}

.workspace-menu-list.is-scrollable {
    max-height: 460px;
    overflow-y: auto;
}

.workspace-menu-list.is-scrollable::-webkit-scrollbar {
    width: 8px;
}

.workspace-menu-list.is-scrollable::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.5);
    border-radius: 999px;
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.workspace-menu-item {
    width: 100%;
    border: none;
    background: transparent;
    text-align: left;
    padding: 10px 14px;
    color: #333;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.workspace-menu-action {
    width: 100%;
    border: none;
    background: transparent;
    text-align: left;
    padding: 10px 14px;
    color: #333;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
}

.workspace-menu-item-inner {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
}

.workspace-folder-hint {
    font-size: 12px;
    color: #6b7280;
}

.workspace-menu-item:hover,
.workspace-menu-action:hover {
    background: #f3f4f6;
}

.workspace-current-label {
    color: #1c64f2;
    font-size: 12px;
    margin-left: 8px;
    background: rgba(59, 130, 246, 0.12);
    padding: 2px 8px;
    border-radius: 999px;
}

.workspace-menu-divider {
    border-top: 1px solid #e5e7eb;
}

.bct-delete-zone {
    width: 90%;
    height: 32px;
    background-color: #fff1f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #e11d48;
    font-size: 13px;
    gap: 6px;
    transition: all 0.2s;
}

.bct-delete-zone .material-icons {
    font-size: 18px;
}

@media (prefers-color-scheme: dark) {
    .bct-gradient-overlay {
        background: linear-gradient(to bottom, transparent, #1e1e1e);
    }

    .bct-bottom-bar {
        background-color: #1e1e1e;
        border-top-color: #333;
    }

    .bct-delete-zone {
        background-color: rgba(220, 38, 38, 0.2);
        border-color: #ef4444;
        color: #fca5a5;
    }

    .bct-icon-btn:hover {
        background-color: rgba(255, 255, 255, 0.05);
    }

    .workspace-menu-window {
        background: #2d2d2d;
    }

    .workspace-menu-item,
    .workspace-menu-action {
        color: #e0e0e0;
    }

    .workspace-menu-item:hover,
    .workspace-menu-action:hover {
        background: #3d3d3d;
    }

    .workspace-current-label {
        color: #bfdbfe;
        background: rgba(96, 165, 250, 0.16);
    }

    .workspace-menu-divider {
        border-top-color: #444;
    }

    .workspace-bind-btn {
        background: #1e1e1e;
        border-color: #333;
    }

    .workspace-bind-btn:hover {
        border-color: #666;
        background: #2d2d2d;
    }

    .workspace-bind-btn .material-icons {
        color: #a0a0a0;
    }

    .workspace-bind-btn:hover .material-icons {
        color: #60a5fa;
    }
}
</style>
