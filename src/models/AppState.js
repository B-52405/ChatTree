import { reactive } from 'vue';

// 默认设置
export const defaultSettings = {
    skipDeleteConfirm: false,
    sidebarWidth: 335,
    syncServerPort: 8800
};

export const appState = reactive({
    settings: { ...defaultSettings },
    isSettingsOpen: false,
    currentWorkspaceId: null,
    workspaces: []
});
