import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import './utils/apiHooks.js'; // 初始化网络请求劫持

console.log('[ChatTree] main.js 已加载, 开始布局初始化');

function initLayout() {
    if (document.getElementById('chat-tree-app')) return;

    console.log('[ChatTree] initLayout 开始创建 UI');
    const mountNode = document.createElement('div');
    mountNode.id = 'chat-tree-app';
    document.body.insertBefore(mountNode, document.body.firstChild);

    createApp(App).mount(mountNode);
    console.log('[ChatTree] Vue App 已挂载');
}

const observer = new MutationObserver((mutations, obs) => {
    if (document.body && (document.getElementById('root') || document.getElementById('__next'))) {
        initLayout();
        obs.disconnect();
    }
});

observer.observe(document, { childList: true, subtree: true });
