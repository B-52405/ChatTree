<script setup>
import { notifications } from '../utils/notify.js';
</script>

<template>
    <div class="notify-container">
        <transition-group name="notify-list" tag="div" class="notify-wrapper">
            <div v-for="item in notifications" :key="item.id" class="notify-item" :class="`notify-${item.type}`">
                {{ item.message }}
            </div>
        </transition-group>
    </div>
</template>

<style scoped>
.notify-container {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000001;
    pointer-events: none;
    /* 让鼠标事件能够穿透到下层页面 */
}

.notify-wrapper {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    position: relative;
}

.notify-item {
    padding: 10px 20px;
    border-radius: 6px;
    color: white;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
    min-width: 200px;
    width: max-content;
    max-width: 80vw;
    text-align: center;
    pointer-events: auto;
    /* 但是通知自身可以阻挡或接受事件 */
}

/* 通知颜色 */
.notify-info {
    background-color: #3b82f6;
}

.notify-success {
    background-color: #10b981;
}

.notify-warning {
    background-color: #f59e0b;
}

.notify-error {
    background-color: #ef4444;
}

/* 出现、下滑动画 */
.notify-list-enter-from {
    opacity: 0;
    transform: translateY(-30px);
}

.notify-list-enter-to {
    opacity: 1;
    transform: translateY(0);
}

/* 原地消失动画 */
.notify-list-leave-from {
    opacity: 1;
    transform: translateY(0) scale(1);
}

.notify-list-leave-to {
    opacity: 0;
    transform: translateY(0) scale(0.9);
}

/* 当元素离开时，将其从文档流中拔出(absolute)，以便旧元素平滑向上/下移 */
.notify-list-leave-active {
    position: absolute;
    transition: all 0.3s ease;
}
</style>
