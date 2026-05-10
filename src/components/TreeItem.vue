<script setup>
import { ref, computed, nextTick, onMounted } from 'vue';
import { TreeNode, FolderNode, ChatNode, state, findNodeByUrl, getAllParents } from '../models/TreeNode.js';
import { showNotify } from '../utils/notify.js';

const props = defineProps({
    model: {
        type: TreeNode,
        required: true
    },
    parentNode: {
        type: FolderNode,
        default: null
    }
});

const nameInput = ref(null);
const oldTitle = ref('');

const isFolder = computed(() => {
    return props.model instanceof FolderNode;
});

const finishEdit = (triggerType = 'blur') => {
    if (props.model.isEditing) {
        let title = props.model.title.trim();
        
        // 如果是新建文件夹且名字为空，则取消新建
        if (isFolder.value && !title) {
            if (props.parentNode) {
                props.parentNode.removeChild(props.model);
                if (state.focusedNode === props.model) {
                    state.focusedNode = null;
                }
            }
            return;
        }
        
        // 对话节点如果名字为空，则设置默认名字
        if (!title) {
            title = '未命名对话';
        }
        
        // 检查重名 (文件夹和对话)
        if (props.parentNode) {
            const isDuplicate = props.parentNode.children.some(
                child => child !== props.model && 
                        ((isFolder.value && child instanceof FolderNode) || (!isFolder.value && child instanceof ChatNode)) && 
                        child.title === title
            );
            if (isDuplicate) {
                if (triggerType === 'enter') {
                    showNotify(`${isFolder.value ? '文件夹' : '对话'} "${title}" 已存在，请重新命名。`, 'warning');
                    return; // 拒绝修改，保持编辑状态
                } else {
                    const isNewFolder = isFolder.value && oldTitle.value === '';
                    if (isNewFolder) {
                        showNotify(`文件夹 "${title}" 已存在，已取消新建。`, 'warning');
                        if (props.parentNode) {
                            props.parentNode.removeChild(props.model);
                            if (state.focusedNode === props.model) {
                                state.focusedNode = null;
                            }
                        }
                        return;
                    }
                    title = oldTitle.value || '未命名对话';
                }
            }
        }
        
        props.model.title = title;
        props.model.isEditing = false;
    }
};

const startEdit = async () => {
    oldTitle.value = props.model.title;
    props.model.isEditing = true;
    await nextTick();
    if (nameInput.value) {
        nameInput.value.focus();
        nameInput.value.select();
    }
};

onMounted(() => {
    if (props.model.isEditing) {
        oldTitle.value = props.model.title;
        nextTick(() => {
            if (nameInput.value) {
                nameInput.value.focus();
                nameInput.value.select();
            }
        });
    }
});

const toggle = () => {
    state.focusedNode = props.model;

    if (isFolder.value) {
        props.model.isOpen = !props.model.isOpen;
    } else if (props.model.url) {
        // 创建一个 a 标签并模拟点击，这样可以被 DeepSeek 本身的 SPA 路由捕获，实现无刷新跳转
        const a = document.createElement('a');
        a.href = props.model.url;
        a.click();
    }
};

const onDragStart = (event) => {
    // 阻止根节点被拖拖拽
    if (!props.parentNode) {
        event.preventDefault();
        return;
    }
    state.draggedNode = props.model;
    state.draggedParent = props.parentNode;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData('text/plain', 'internal-move');
    
    // 延迟添加类名，确保拖拽阴影不包含这个类带来的样式变化
    setTimeout(() => {
        document.body.classList.add('is-dragging-node');
    }, 0);
};

const onDragEnd = () => {
    state.draggedNode = null;
    state.draggedParent = null;
    document.body.classList.remove('is-dragging-node');
};

const dragPosition = ref(''); // 'before', 'into', 'after', ''

const onDragOver = (event) => {
    // 内部拖拽时，如果悬浮在自己或自己的子节点上，则拒绝拖放，并且不显示任何提示线
    if (state.draggedNode) {
        const isDescendant = (node, target) => {
            if (node === target) return true;
            if (node instanceof FolderNode) {
                return node.children.some(child => isDescendant(child, target));
            }
            return false;
        };

        if (isDescendant(state.draggedNode, props.model)) {
            dragPosition.value = '';
            event.dataTransfer.dropEffect = 'none';
            return;
        }
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const dropRatio = (event.clientY - rect.top) / rect.height;
    
    let pos = 'into';
    if (isFolder.value) {
        // 如果是文件夹，分上部(插入前)，中部(放入内部)，下部且闭合时(插入后)
        if (dropRatio < 0.25 && props.parentNode) pos = 'before';
        else if (dropRatio > 0.75 && props.parentNode && !props.model.isOpen) pos = 'after';
        else pos = 'into';
    } else {
        // 如果是对话节点，仅允许插入到前面或后面
        if (dropRatio < 0.5 && props.parentNode) pos = 'before';
        else if (props.parentNode) pos = 'after';
    }
    dragPosition.value = pos;
};

const onDragLeave = () => {
    dragPosition.value = '';
};

const onDrop = (event) => {
    event.preventDefault();
    const pos = dragPosition.value || (isFolder.value ? 'into' : 'after');
    dragPosition.value = '';
    
    let newNode = null;

    // 处理内部拖拽移动
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
        // 处理外部拖拽新建
        const url = event.dataTransfer.getData('text/plain');
        const html = event.dataTransfer.getData('text/html');

        const regex = /^https:\/\/chat\.deepseek\.com\/a\/chat\/s\/[a-f0-9-]+$/;
        if (!regex.test(url)) {
            alert('请拖动对话列表中的链接到这里。');
            return;
        }
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const titleDiv = doc.querySelector('.c08e6e93');
        const title = titleDiv ? titleDiv.textContent.trim() : '未命名对话';

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
                    // 先强制移除 class 以重置动画
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

        newNode = new ChatNode({ title, url });
    }

    // 根据计算出的位置进行插入
    if (pos === 'into' && isFolder.value) {
        props.model.addChild(newNode);
        props.model.isOpen = true;
    } else if (props.parentNode) {
        const index = props.parentNode.children.indexOf(props.model);
        const insertIndex = pos === 'before' ? index : index + 1;
        props.parentNode.children.splice(insertIndex, 0, newNode);
    }
    
    // 拖拽完成后不改变焦点
};

const showMenu = computed(() => state.activeMenuNodeId === props.model.id);
const menuX = ref(0);
const menuY = ref(0);

const newFolder = () => {
    state.activeMenuNodeId = null;
    const newF = new FolderNode({ title: '', isEditing: true });
    
    let targetFolder = props.model; // 默认在当前文件夹
    if (!(props.model instanceof FolderNode) && props.parentNode) {
        targetFolder = props.parentNode; // 如果当前是对话，在其父文件夹下创建
    }
    
    targetFolder.addChild(newF);
    targetFolder.isOpen = true;
    state.focusedNode = newF;
};

const renameItem = () => {
    state.activeMenuNodeId = null;
    startEdit();
};

const onMenuButtonClick = (event) => {
    event.stopPropagation();
    state.focusedNode = props.model;
    
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    menuX.value = rect.right + 5; // 菜单显示在按钮右侧
    menuY.value = rect.top;
    state.activeMenuNodeId = props.model.id;

    const closeMenu = () => {
        state.activeMenuNodeId = null;
        document.removeEventListener('click', closeMenu);
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 0);
};

const deleteItem = () => {
    state.activeMenuNodeId = null;
    if (props.parentNode) {
        props.parentNode.removeChild(props.model);
        if (state.focusedNode === props.model) {
            state.focusedNode = null;
        }
    }
};
</script>

<template>
    <li>
        <div :class="{ 
                 bold: isFolder,
                 'drag-before': dragPosition === 'before',
                 'drag-into': dragPosition === 'into',
                 'drag-after': dragPosition === 'after',
                 'is-focused': state.focusedNode === model
             }" 
             :data-id="model.id"
             :draggable="!!parentNode"
             @dragstart.stop="onDragStart"
             @dragend.stop="onDragEnd"
             @click.stop="toggle" 
             @dragover.stop.prevent="onDragOver" 
             @dragleave.stop="onDragLeave"
             @drop.stop.prevent="onDrop" 
             class="tree-item">
            <span v-if="isFolder" class="toggle-icon material-icons">
                {{ model.isOpen ? 'expand_more' : 'chevron_right' }}
            </span>
            <span v-else class="toggle-icon"></span>
            <span class="icon material-icons">{{ isFolder ? 'folder' : 'chat_bubble_outline' }}</span>
            <span v-if="!model.isEditing" class="node-title">{{ model.title }}</span>
            <input v-else
                   ref="nameInput"
                   type="text" 
                   v-model="model.title" 
                   @blur="finishEdit('blur')" 
                   @keyup.enter="finishEdit('enter')" 
                   @click.stop
                   class="node-input" />
            <button v-if="!model.isEditing" class="menu-button" @click.stop="onMenuButtonClick" title="菜单">
                <span class="menu-icon material-icons">more_horiz</span>
            </button>
        </div>

        <ul v-show="model.isOpen" v-if="isFolder" class="tree-list">
            <!-- 递归调用自身 -->
            <TreeItem v-for="(child, index) in model.children" :key="index" :model="child" :parentNode="model" />
        </ul>

        <!-- 右键菜单 -->
        <Teleport to="body">
            <ul v-if="showMenu" class="context-menu" :style="{ top: menuY + 'px', left: menuX + 'px' }">
                <template v-if="isFolder">
                    <li @click.stop="newFolder">新建文件夹</li>
                </template>
                <li @click.stop="renameItem">重命名</li>
                <li @click.stop="deleteItem">删除</li>
            </ul>
        </Teleport>
    </li>
</template>

<style scoped>
.tree-item {
    cursor: pointer;
    user-select: none;
    padding: 4px 6px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    font-size: 14px;
    position: relative;
    transition: background-color 0.15s;
}

.tree-item.is-focused {
    background-color: #dbeafe; /* 高亮色 */
}

.tree-item:hover {
    background-color: #e5e5e5;
}

.tree-item.is-focused:hover {
    background-color: #bfdbfe;
}

@keyframes flash-border {
    0% { box-shadow: 0 0 0 0 rgba(28, 100, 242, 0.7); }
    50% { box-shadow: 0 0 0 4px rgba(28, 100, 242, 0.4); }
    100% { box-shadow: 0 0 0 0 rgba(28, 100, 242, 0); }
}

.flash-highlight {
    animation: flash-border 0.6s ease-in-out 1;
    z-index: 10;
    position: relative;
}

.toggle-icon {
    width: 18px;
    display: inline-block;
    font-size: 18px;
    color: #999;
    flex-shrink: 0;
    text-align: center;
}

.icon {
    margin-right: 4px;
    font-size: 18px;
    flex-shrink: 0;
    color: #666;
}

.tree-item:hover .icon,
.tree-item.is-focused .icon {
    color: #1c64f2;
}

.node-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
}

.node-input {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0px 4px;
    font-size: 14px;
    min-height: 25px;
    font-family: inherit;
    border: 1px solid #007acc;
    border-radius: 3px;
    outline: none;
    box-sizing: border-box;
}

.bold {
    font-weight: bold;
}

.drag-before {
    border-top: 2px solid #007acc;
    padding-top: 4px;
}

.drag-after {
    border-bottom: 2px solid #007acc;
    padding-bottom: 4px;
}

.drag-into {
    background-color: #d0e8ff !important;
}

.tree-list {
    list-style-type: none;
    padding-left: 14px;
    margin: 0 0 0 14px;
    border-left: 1px dashed #dcdcdc;
}

li {
    margin: 0;
    padding: 0;
}

/* 菜单按钮相关样式 */
.menu-button {
    display: none;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    margin-left: 4px;
    flex-shrink: 0;
    position: relative;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s;
}

.menu-button:hover {
    background-color: rgba(0, 0, 0, 0.1);
}

.tree-item:hover .menu-button {
    display: flex;
}

.menu-icon {
    font-size: 18px;
    color: #666;
    display: flex;
    align-items: center;
    justify-content: center;
}

.menu-button:hover .menu-icon {
    color: #1c64f2;
}

.context-menu {
    position: fixed;
    z-index: 1000000;
    pointer-events: auto;
    background: white;
    border: 1px solid #ccc;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
    list-style: none;
    padding: 4px 0;
    margin: 0;
    min-width: 130px;
    border-radius: 6px;
    font-size: 13px;
    color: #333;
}

.context-menu li {
    padding: 8px 16px;
    cursor: pointer;
    margin: 0;
    transition: background-color 0.1s;
}

.context-menu li:hover {
    background: #f0f0f0;
}

@media (prefers-color-scheme: dark) {
    .tree-item.is-focused {
        background-color: rgba(59, 130, 246, 0.4);
    }
    
    .tree-item:hover {
        background-color: #333;
    }

    .tree-item.is-focused:hover {
        background-color: rgba(59, 130, 246, 0.6);
    }

    .toggle-icon {
        color: #aaa;
    }

    .tree-list {
        border-left-color: #555;
    }

    .drag-before, .drag-after {
        border-color: #3b82f6;
    }

    .drag-into {
        background-color: rgba(59, 130, 246, 0.3) !important;
    }

    .node-input {
        background: #222;
        color: #eee;
        border-color: #3b82f6;
    }

    @keyframes flash-border-dark {
        0% { box-shadow: 0 0 0 0 rgba(147, 197, 253, 0.7); }
        50% { box-shadow: 0 0 0 4px rgba(147, 197, 253, 0.4); }
        100% { box-shadow: 0 0 0 0 rgba(147, 197, 253, 0); }
    }

    .flash-highlight {
        animation: flash-border-dark 0.6s ease-in-out 1;
    }

    .menu-button:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }

    .menu-icon {
        color: #aaa;
    }

    .menu-button:hover .menu-icon {
        color: #3b82f6;
    }

    .context-menu {
        background: #2d2d2d;
        border-color: #444;
        color: #eee;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
    }

    .context-menu li:hover {
        background: #3d3d3d;
    }
}
</style>