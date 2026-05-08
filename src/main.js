import { createApp } from 'vue';
import './style.css';
import App from './App.vue';

function initLayout() {
    if (document.getElementById('chat-tree-app')) return;

    const mountNode = document.createElement('div');
    mountNode.id = 'chat-tree-app';
    document.body.insertBefore(mountNode, document.body.firstChild);

    createApp(App).mount(mountNode);
}

const observer = new MutationObserver((mutations, obs) => {
    if (document.body && (document.getElementById('root') || document.getElementById('__next'))) {
        initLayout();
        obs.disconnect();
    }
});

observer.observe(document, { childList: true, subtree: true });
