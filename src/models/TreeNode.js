import { reactive } from 'vue';

export const state = reactive({
    rootNode: null,
    draggedNode: null,
    draggedParent: null,
    focusedNode: null,
    activeMenuNodeId: null,
    settings: {
        skipDeleteConfirm: false
    },
    isSettingsOpen: false
});

export function findNodeByUrl(node, url) {
    if (node instanceof ChatNode && node.url === url) return node;
    if (node instanceof FolderNode) {
        for (let child of node.children) {
            const found = findNodeByUrl(child, url);
            if (found) return found;
        }
    }
    return null;
}

export function findParent(node, target) {
    if (!(node instanceof FolderNode)) return null;
    if (node.children.includes(target)) return node;
    for (let child of node.children) {
        const parent = findParent(child, target);
        if (parent) return parent;
    }
    return null;
}

export function getAllParents(root, target) {
    const parents = [];
    let current = target;
    while (current) {
        const parent = findParent(root, current);
        if (parent) {
            parents.push(parent);
            current = parent;
        } else {
            break;
        }
    }
    return parents;
}

export class TreeNode {
    constructor(options) {
        this.id = options.id || Math.random().toString(36).substring(2, 9);
        this.title = options.title || '';
        this.isEditing = options.isEditing || false;
    }
}

export class FolderNode extends TreeNode {
    constructor(options) {
        super(options);
        this.children = options.children || [];
        this.isOpen = options.isOpen !== undefined ? options.isOpen : true;
    }

    addChild(node) {
        this.children.push(node);
    }
    
    removeChild(node) {
        const index = this.children.indexOf(node);
        if (index !== -1) {
            this.children.splice(index, 1);
        }
    }
}

export class ChatNode extends TreeNode {
    constructor(options) {
        super(options);
        this.url = options.url || '';
    }
}