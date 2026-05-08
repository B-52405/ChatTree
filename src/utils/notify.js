import { ref } from 'vue';

export const notifications = ref([]);
let idCounter = 0;

export const showNotify = (message, type = 'info', duration = 3000) => {
    const id = idCounter++;
    const notif = { id, message, type };

    // 新通知从头部压入
    notifications.value.unshift(notif);

    // 最多保留2个通知，超出则移除最老的（列表尾部）
    if (notifications.value.length > 2) {
        notifications.value.pop();
    }

    // 定时消失
    setTimeout(() => {
        const index = notifications.value.findIndex(n => n.id === id);
        if (index !== -1) {
            notifications.value.splice(index, 1);
        }
    }, duration);
};
