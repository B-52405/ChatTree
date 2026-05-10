<template>
    <div class="bct-header">
        <div class="bct-logo-container">
            <img src="../assets/polymer_24dp_000000.svg" alt="Light mode logo" class="bct-logo bct-logo-light" />
            <img src="../assets/polymer_24dp_E3E3E3.svg" alt="Dark mode logo" class="bct-logo bct-logo-dark" />
            <span class="bct-title">CHATTREE</span>
        </div>
        <button @click="handleAddFolder" class="bct-add-btn" title="新建文件夹">
            <span class="material-icons">create_new_folder</span>
        </button>
    </div>
</template>

<script setup>
const props = defineProps({
    onAddFolder: {
        type: Function,
        required: true
    }
});

const handleAddFolder = () => {
    props.onAddFolder();
};
</script>

<style scoped>
.bct-header {
    padding: 10px 16px;
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
}

.bct-logo-container {
    height: 22px;
    display: flex;
    align-items: center;
}

.bct-logo {
    height: 100%;
}

.bct-logo-dark {
    display: none;
}

.bct-title {
    margin-left: 8px;
    font-size: 18px;
    font-weight: 700;
    color: #1a1a1a;
    font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    letter-spacing: -0.5px;
}

.bct-add-btn {
    background: none;
    border: none;
    color: #1c64f2;
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: 4px;
    transition: background-color 0.2s;
}

.bct-add-btn:hover {
    background-color: rgba(28, 100, 242, 0.1);
}

.bct-add-btn .material-icons {
    font-size: 20px;
}

@media (prefers-color-scheme: dark) {
    .bct-logo-light {
        display: none;
    }

    .bct-logo-dark {
        display: block;
    }

    .bct-title {
        color: #eee;
    }

    .bct-header {
        border-bottom-color: #333;
    }
}
</style>