import { reactive } from 'vue';

export const appState = reactive({
    settings: {
        skipDeleteConfirm: false,
        sidebarWidth: 335
    },
    isSettingsOpen: false,
    currentWorkspaceId: null,
    workspaces: []
});

// 默认设置
export const defaultSettings = {
    skipDeleteConfirm: false,
    sidebarWidth: 335
};