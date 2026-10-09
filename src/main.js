/* ==========================================================================
   我的备忘录 · 应用入口
   ========================================================================== */
import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import './styles/index.css';

createApp(App).use(createPinia()).mount('#app');
