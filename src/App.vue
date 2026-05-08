<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import TreeRoot from './components/TreeRoot.vue';
import Notification from './components/Notification.vue';
import { FolderNode, ChatNode, state, findNodeByUrl } from './models/TreeNode.js';

const width = ref(300); // 默认宽度 300px
const isDragging = ref(false);

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

// 加载持久化数据
const loadTreeData = () => {
    try {
        let saved = null;
        if (typeof GM_getValue !== 'undefined') {
            saved = GM_getValue('chattree_data', null);
        } else {
            saved = localStorage.getItem('chattree_data');
        }
        
        if (saved) {
            const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
            // 加载设置
            if (parsed.settings) {
                Object.assign(state.settings, parsed.settings);
            }
            return reviveNode(parsed.tree || parsed);
        }
    } catch (e) {
        console.error('加载树节点数据失败:', e);
    }
    // 默认空根节点
    return new FolderNode({ title: 'root', children: [] });
};

// 当前的树形数据
const treeData = ref(loadTreeData());
state.rootNode = treeData.value;

// 监听变动并持久化
watch([treeData, () => state.settings], () => {
    state.rootNode = treeData.value;
    const dataToSave = {
        tree: treeData.value,
        settings: state.settings
    };
    const rawData = JSON.stringify(dataToSave);
    if (typeof GM_setValue !== 'undefined') {
        GM_setValue('chattree_data', rawData);
    } else {
        localStorage.setItem('chattree_data', rawData);
    }
}, { deep: true });

// ... 后续代码不变
const onMouseDown = () => {
    isDragging.value = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none'; // 防止拖拽时选中文本
};

const onMouseMove = (e) => {
    if (!isDragging.value) return;
    // 限制拖拽最小 150px，最大为屏幕宽度减去 300px
    const newWidth = Math.max(150, Math.min(e.clientX, window.innerWidth - 300));
    width.value = newWidth;
};

const onMouseUp = () => {
    if (isDragging.value) {
        isDragging.value = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
};

const onDropDelete = (e) => {
    if (state.draggedNode && state.draggedParent) {
        let shouldDelete = true;
        if (!state.settings.skipDeleteConfirm) {
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

onMounted(() => {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    // 监听 URL 变化自动聚焦
    const updateFocusByUrl = () => {
        const url = location.href;
        const node = findNodeByUrl(treeData.value, url);
        if (node) {
            state.focusedNode = node;
        }
    };

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
        originalPushState.apply(this, args);
        updateFocusByUrl();
    };
    history.replaceState = function(...args) {
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
});

</script>

<template>
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    <Notification />
    
    <!-- 设置弹窗 -->
    <Teleport to="body">
        <div v-if="state.isSettingsOpen" class="bct-modal-overlay" @click.self="state.isSettingsOpen = false">
            <div class="bct-modal-content">
                <div class="bct-modal-header">
                    <h3>设置</h3>
                    <button class="bct-close-btn" @click="state.isSettingsOpen = false">×</button>
                </div>
                <div class="bct-modal-body">
                    <div class="bct-setting-item">
                        <span>删除内容时不再二次确认</span>
                        <label class="bct-switch">
                            <input type="checkbox" v-model="state.settings.skipDeleteConfirm">
                            <span class="bct-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>

    <div class="bct-wrapper" :style="{ width: `${width}px` }">
        <div class="bct-left-panel">
            <TreeRoot :model="treeData" />

            <!-- 底部阴影和工具栏 -->
            <div class="bct-footer">
                <div class="bct-gradient-overlay"></div>
                <div class="bct-bottom-bar">
                    <div class="bct-bar-content" :class="{ 'is-dragging': state.draggedNode }">
                        <div class="bct-settings-mode">
                                <button class="bct-icon-btn" title="设置" @click="state.isSettingsOpen = true">
                                    <span class="material-icons">settings</span>
                                </button>
                        </div>
                        <div class="bct-delete-mode">
                                <div class="bct-delete-zone" @dragover.prevent @drop="onDropDelete">
                                    <span class="material-icons">delete</span>
                                    <span>拖到此处删除</span>
                                </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 拖拽缩放手柄 -->
        <div class="bct-resizer" :class="{ resizing: isDragging }" @mousedown="onMouseDown"></div>
    </div>
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
    padding-bottom: 60px; /* 为底部 bar 留出空间 */
    font-family: quote-cjk-patch, Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
}

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
    height: 60px; /* 加高渐变阴影 */
    background: linear-gradient(to bottom, transparent, #f9f9f9);
}

.bct-bottom-bar {
    background-color: #f9f9f9;
    height: 62px; /* 48px * 1.3 ≈ 62px，加高 30% */
    pointer-events: auto;
    overflow: hidden;
    border-top: 1px solid #eee;
}

.bct-bar-content {
    display: flex;
    width: 200%;
    height: 100%;
    transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1); /* 加快动画速度从 0.3s -> 0.2s */
}

.bct-bar-content.is-dragging {
    transform: translateX(-50%);
}

.bct-settings-mode, .bct-delete-mode {
    width: 50%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
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

.bct-delete-zone {
    width: 90%;
    height: 40px;
    background-color: #fff1f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #e11d48;
    font-size: 13px;
    gap: 8px;
    transition: all 0.2s;
}

.bct-delete-zone .material-icons {
    font-size: 20px;
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
/* Modal 样式 */
.bct-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000000;
}

.bct-modal-content {
    background: #fff;
    width: 350px;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    color: #333;
}

.bct-modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
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
    color: #999;
}

.bct-modal-body {
    padding: 20px;
}

.bct-setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    font-size: 14px;
}

/* Toggle Switch 样式 */
.bct-switch {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 22px;
}

.bct-switch input {
    opacity: 0;
    width: 0;
    height: 0;
}

.bct-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: .3s;
    border-radius: 22px;
}

.bct-slider:before {
    position: absolute;
    content: "";
    height: 16px;
    width: 16px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .3s;
    border-radius: 50%;
}

input:checked + .bct-slider {
    background-color: #1c64f2;
}

input:checked + .bct-slider:before {
    transform: translateX(18px);
}

@media (prefers-color-scheme: dark) {
    .bct-modal-content {
        background: #2d2d2d;
        color: #eee;
    }
    
    .bct-modal-header {
        border-bottom-color: #444;
    }
    
    .bct-close-btn {
        color: #aaa;
    }
}
@media (prefers-color-scheme: dark) {
    .bct-left-panel {
        background-color: #1e1e1e;
        color: #eee;
    }

    .bct-gradient-overlay {
        background: linear-gradient(to bottom, transparent, #1e1e1e);
        height: 60px;
    }

    .bct-bottom-bar {
        background-color: #1e1e1e;
        border-top-color: #333;
        height: 62px;
    }

    .bct-delete-zone {
        background-color: rgba(220, 38, 38, 0.2);
        border-color: #ef4444;
        color: #fca5a5;
    }

    .bct-icon-btn:hover {
        background-color: rgba(255, 255, 255, 0.05);
    }
    
    .bct-left-panel > div:first-child {
        border-bottom-color: #333 !important;
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
