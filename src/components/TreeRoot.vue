<script setup>
import { ref, nextTick, watch } from 'vue';
import TreeItem from './TreeItem.vue';
import { FolderNode, ChatNode, state, findParent, findNodeByUrl, getAllParents } from '../models/TreeNode.js';
import { showNotify } from '../utils/notify.js';

const props = defineProps({
    model: {
        type: FolderNode,
        required: true
    }
});

const isRootDragOver = ref(false);
const treeContainerRef = ref(null);

const clearFocus = () => {
    state.focusedNode = null;
    state.focusedNodeDetachedFromUrl = false;
};

const scrollFocusedNodeIntoView = async (node) => {
    if (!node) return;
    await nextTick();
    const el = treeContainerRef.value?.querySelector(`.tree-item[data-id="${node.id}"]`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

watch(() => state.focusedNode, scrollFocusedNodeIntoView);

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
    targetFolder.addChild(newFolder);
    targetFolder.isOpen = true; // 确保父文件夹展开
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
            newNode = new ChatNode({ title, url });
        }
    }

    if (newNode) {
        props.model.addChild(newNode);
        // 只有新创建的节点才改变焦点，拖拽的节点不改变焦点
        if (!state.draggedNode) {
            state.focusedNode = newNode;
            state.focusedNodeDetachedFromUrl = false;
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
            <ul class="root-tree" :class="{ 'drag-after': isRootDragOver }" v-if="model.children && model.children.length > 0">
                <TreeItem v-for="child in model.children" :key="child.id" :model="child" :parentNode="model" />
            </ul>
            <div v-else class="empty-hint" :class="{ 'drag-into': isRootDragOver }" @click="createNewFolder">
                数据为空，点击或在此拖拽以创建内容
            </div>
        </div>
    </div>
</template>

<style scoped>
.file-tree-container {
    padding: 12px 8px 64px;
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

.drag-after {
    border-bottom: 2px solid #007acc;
    padding-bottom: 4px;
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
}
</style>
