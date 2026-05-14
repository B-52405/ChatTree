import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import monkey, { cdn } from 'vite-plugin-monkey';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        vue(),
        monkey({
            entry: 'src/main.js',
            userscript: {
                name: 'Chat Tree',
                namespace: 'http://tampermonkey.net/',
                version: '0.1',
                description: '更好的网页端AI对话。',
                author: 'B',
                match: ['*://chat.deepseek.com/*'],
                // 如果插件未能自动检测到（一般都能检测到），可以强制添加 grant 
                grant: ['GM_setValue', 'GM_getValue', 'GM_addStyle'],
            },
            build: {
                externalGlobals: {
                    vue: cdn.jsdelivr('Vue', 'dist/vue.global.prod.js'),
                },
            },
        }),
    ],
});