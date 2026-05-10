<template>
    <Teleport to="body">
        <div v-if="isOpen" class="bct-modal-overlay" @click.self="handleClose">
            <div class="bct-modal-content">
                <div class="bct-modal-header">
                    <h3>设置</h3>
                    <button class="bct-close-btn" @click="handleClose">×</button>
                </div>
                <div class="bct-modal-body">
                    <div class="bct-setting-item">
                        <span>删除内容时不再二次确认</span>
                        <label class="bct-switch">
                            <input type="checkbox" v-model="settings.skipDeleteConfirm">
                            <span class="bct-slider"></span>
                        </label>
                    </div>
                    <div class="bct-setting-item">
                        <label class="bct-setting-label" for="bct-sync-server-port">同步服务器端口</label>
                        <input
                            id="bct-sync-server-port"
                            class="bct-port-input"
                            type="number"
                            min="1"
                            max="65535"
                            step="1"
                            v-model.number="settings.syncServerPort"
                            @blur="normalizeSyncServerPort"
                        />
                    </div>
                    <div class="bct-setting-divider"></div>
                    <div class="bct-export-section">
                        <button class="bct-export-btn" @click="handleExport">
                            <span class="material-icons">download</span>
                            导出数据
                        </button>
                        <p class="bct-export-tips">将所有数据和设置导出为JSON文件</p>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';
import { exportPersistedData } from '../utils/persistence.js';
import { defaultSettings } from '../models/AppState.js';

const props = defineProps({
    isOpen: Boolean,
    settings: {
        type: Object,
        required: true
    },
    treeData: {
        type: Object,
        required: true
    },
    workspaces: {
        type: Array,
        required: true
    },
    currentWorkspaceId: {
        type: String,
        required: true
    }
});

const emit = defineEmits(['close', 'export']);

const handleClose = () => {
    normalizeSyncServerPort();
    emit('close');
};

const normalizeSyncServerPort = () => {
    const port = Number(props.settings.syncServerPort);
    props.settings.syncServerPort = Number.isInteger(port) && port >= 1 && port <= 65535
        ? port
        : defaultSettings.syncServerPort;
};

const handleExport = () => {
    normalizeSyncServerPort();
    const dataToExport = exportPersistedData(props.workspaces, props.currentWorkspaceId, props.settings);
    
    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chattree_data_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    emit('export');
};
</script>

<style scoped>
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
    gap: 16px;
    padding: 8px 0;
    font-size: 14px;
}

.bct-setting-label {
    cursor: pointer;
}

.bct-port-input {
    width: 104px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 7px 10px;
    color: #333;
    background: #fff;
    font-size: 14px;
    text-align: center;
    box-sizing: border-box;
    appearance: textfield;
    -moz-appearance: textfield;
}

.bct-port-input::-webkit-outer-spin-button,
.bct-port-input::-webkit-inner-spin-button {
    margin: 0;
    appearance: none;
    -webkit-appearance: none;
}

.bct-port-input:focus {
    border-color: #1c64f2;
    outline: none;
    box-shadow: 0 0 0 2px rgba(28, 100, 242, 0.16);
}

.bct-setting-divider {
    height: 1px;
    background-color: #e5e5e5;
    margin: 12px 0;
}

.bct-export-section {
    padding-top: 8px;
}

.bct-export-btn {
    width: 100%;
    padding: 10px;
    background-color: #1c64f2;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: background-color 0.2s;
}

.bct-export-btn:hover {
    background-color: #1554d0;
}

.bct-export-btn .material-icons {
    font-size: 18px;
}

.bct-export-tips {
    margin: 8px 0 0 0;
    font-size: 12px;
    color: #999;
    text-align: center;
}

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

    .bct-setting-divider {
        background-color: #444;
    }

    .bct-port-input {
        background: #222;
        border-color: #444;
        color: #eee;
    }

    .bct-export-tips {
        color: #aaa;
    }
}
</style>
