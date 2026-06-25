<script setup>
import { ref, computed, nextTick, watch } from 'vue';
import TreeItem from './TreeItem.vue';
import { FolderNode, ChatNode, state, findParent, findNodeByUrl, getAllParents, setFocus } from '../models/TreeNode.js';
import { showNotify } from '../utils/notify.js';
import { appState } from '../models/AppState.js';

const props = defineProps({
    model: {
        type: FolderNode,
        required: true
    }
});

const isRootDragOver = ref(false);
const treeContainerRef = ref(null);

// 分离"未分类"文件夹和"历史"文件夹及其他子节点
const uncategorizedNode = computed(() => {
    return props.model.children.find(child => child instanceof FolderNode && child.title === '未分类');
});

const historyNode = computed(() => {
    return props.model.children.find(child => child instanceof FolderNode && child.title === '历史');
});

const otherChildren = computed(() => {
    return props.model.children.filter(child => child !== uncategorizedNode.value && child !== historyNode.value);
});

const clearFocus = () => {
    setFocus(null);
};

const scrollFocusedNodeIntoView = () => {
    const node = state.focusedNode;
    if (!node) return;
    nextTick(() => {
        const el = treeContainerRef.value?.querySelector(`.tree-item[data-id="${node.id}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
};

watch(() => state.focusVersion, scrollFocusedNodeIntoView);

const createNewFolder = () => {
    let targetFolder = props.model;
    if (state.focusedNode) {
        if (state.focusedNode instanceof FolderNode) {
            targetFolder = state.focusedNode;
        } else {
            const parent = findParent(props.model, state.focusedNode);
            if (parent) {
                targetFolder = parent;
            }
        }
    }

    const newFolder = new FolderNode({ title: '', isEditing: true });
    // 在根目录新建时插入到目录栏顶部（未分类和历史文件夹之后）
    if (targetFolder === props.model) {
        let insertIdx = 0;
        if (uncategorizedNode.value) insertIdx++;
        if (historyNode.value) insertIdx++;
        targetFolder.children.splice(insertIdx, 0, newFolder);
    } else {
        // 在子文件夹中新建时插入到该文件夹顶部
        targetFolder.children.splice(0, 0, newFolder);
    }
    targetFolder.isOpen = true;
    state.focusedNode = newFolder;
    state.focusedNodeDetachedFromUrl = false;
};

defineExpose({ createNewFolder });

const onRootDrop = (event) => {
    event.preventDefault();
    isRootDragOver.value = false;

    let newNode = null;

    if (state.draggedNode) {
        const isDescendant = (node, target) => {
            if (node === target) return true;
            if (node instanceof FolderNode) {
                return node.children.some(child => isDescendant(child, target));
            }
            return false;
        };

        if (isDescendant(state.draggedNode, props.model)) {
            state.draggedNode = null;
            state.draggedParent = null;
            return;
        }

        newNode = state.draggedNode;
        if (state.draggedParent) {
            state.draggedParent.removeChild(state.draggedNode);
        }
        
        state.draggedNode = null;
        state.draggedParent = null;
    } else {
        const url = event.dataTransfer.getData('text/plain');
        const html = event.dataTransfer.getData('text/html');

        const regex = /^https:\/\/chat\.deepseek\.com\/a\/chat\/s\/[a-f0-9-]+$/;
        if (regex.test(url)) {
            const existingNode = state.rootNode ? findNodeByUrl(state.rootNode, url) : null;
            if (existingNode) {
                showNotify('整个文件树中已存在相同的对话', 'warning');
                
                // 展开所有父节点
                const parents = getAllParents(state.rootNode, existingNode);
                parents.forEach(p => p.isOpen = true);
                
                // 仅滚动并闪烁，不改变 state.focusedNode
                nextTick(() => {
                    const el = document.querySelector(`.tree-item[data-id="${existingNode.id}"]`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // 重置动画
                        el.classList.remove('flash-highlight');
                        void el.offsetWidth; // 触发重绘
                        el.classList.add('flash-highlight');
                        
                        if (el._flashTimeout) clearTimeout(el._flashTimeout);
                        el._flashTimeout = setTimeout(() => {
                            el.classList.remove('flash-highlight');
                            el._flashTimeout = null;
                        }, 1000);
                    }
                });
                return;
            }
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const titleDiv = doc.querySelector('.c08e6e93');
            const title = titleDiv ? titleDiv.textContent.trim() : '未命名对话';
            const now = Math.floor(Date.now() / 1000);
            newNode = new ChatNode({ title, url, insertedAt: now, updatedAt: now });
        }
    }

    if (newNode) {
        // 插入到目录栏顶部（未分类和历史文件夹之后）
        let insertIdx = 0;
        if (uncategorizedNode.value) insertIdx++;
        if (historyNode.value) insertIdx++;
        props.model.children.splice(insertIdx, 0, newNode);
        // 只有新创建的节点才改变焦点，拖拽的节点不改变焦点
        if (!state.draggedNode) {
            setFocus(newNode);
        }
    }
};
</script>

<template>
    <!-- 文件树组件 -->
    <div style="flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;" @click="clearFocus">
        <div class="file-tree-container"
             ref="treeContainerRef"
             @dragover.prevent="isRootDragOver = true"
             @dragleave="isRootDragOver = false"
             @drop="onRootDrop">
             
            <!-- Skeleton Loader -->
            <div v-if="appState.isLoading" class="skeleton-container">
                <div class="skeleton-item" v-for="i in 8" :key="i" :style="{ paddingLeft: `${(i % 3 === 0 ? 0 : i % 3 === 1 ? 16 : 32)}px` }">
                    <div class="skeleton-icon"></div>
                    <div class="skeleton-text" :style="{ width: `${Math.random() * 30 + 40}%` }"></div>
                </div>
            </div>

            <!-- 实际内容 -->
            <template v-else>
                <!-- 置顶栏：未分类 -->
                <ul v-if="uncategorizedNode" class="root-tree uncategorized-section">
                    <TreeItem :model="uncategorizedNode" :parentNode="model" :isUncategorized="true" :isHistory="false" />
                </ul>
                <!-- 置顶栏：历史 -->
                <ul v-if="historyNode" class="root-tree history-section">
                    <TreeItem :model="historyNode" :parentNode="model" :isUncategorized="false" :isHistory="true" />
                </ul>
                <!-- 分割线 -->
                <div v-if="uncategorizedNode || historyNode" class="divider"></div>
                <!-- 目录栏 -->
                <ul class="root-tree" :class="{ 'drag-after': isRootDragOver }" v-if="otherChildren.length > 0">
                    <TreeItem v-for="child in otherChildren" :key="child.id" :model="child" :parentNode="model" />
                </ul>
                <div v-else class="empty-hint" :class="{ 'drag-into': isRootDragOver }" @click="createNewFolder">
                    数据为空，拖拽到此以创建内容
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped>
.file-tree-container {
    padding: 8px 6px 64px;
    overflow-y: auto;
    flex-grow: 1;
}

.file-tree-container::-webkit-scrollbar {
    width: 8px;
}

.file-tree-container::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.5);
    border-radius: 999px;
}

.root-tree {
    list-style-type: none;
    padding: 0;
    margin: 0;
}

.uncategorized-section {
    margin-bottom: 4px;
}

.history-section {
    margin-bottom: 4px;
}

.divider {
    height: 1px;
    background: #e2e8f0;
    margin: 6px 4px 10px 4px;
}

.drag-after {
    position: relative;
}

.drag-after::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: #007acc;
    pointer-events: none;
    z-index: 1;
}

.drag-into {
    background-color: #d0e8ff !important;
    border-color: #1c64f2 !important;
    color: #1c64f2 !important;
}

.empty-hint {
    padding: 20px;
    text-align: center;
    color: #999;
    font-size: 14px;
    cursor: pointer;
    border: 2px dashed #ddd;
    border-radius: 6px;
    margin-top: 10px;
    user-select: none;
    transition: all 0.2s;
}

.empty-hint:hover {
    border-color: #1c64f2;
    color: #1c64f2;
    background-color: #f0f8ff;
}

/* Skeleton Styles */
.skeleton-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
}

.skeleton-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px;
}

.skeleton-icon {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: #e2e8f0;
    animation: pulse 1.5s infinite ease-in-out;
}

.skeleton-text {
    height: 14px;
    border-radius: 4px;
    background: #e2e8f0;
    animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
    0% { opacity: 0.6; }
    50% { opacity: 0.3; }
    100% { opacity: 0.6; }
}

@media (prefers-color-scheme: dark) {
    .file-tree-container.root-drag-over {
        background-color: rgba(59, 130, 246, 0.15);
    }

    .empty-hint {
        color: #aaa;
        border-color: #444;
    }

    .empty-hint:hover {
        border-color: #3b82f6;
        color: #3b82f6;
        background-color: rgba(59, 130, 246, 0.15);
    }
    
    .skeleton-icon, .skeleton-text {
        background: #333;
    }

    .divider {
        background: #3e3e3e;
    }
}
</style>
