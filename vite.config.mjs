import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // 子路径部署：必须与 Nginx 的 location 前缀一致，否则所有资源 404
  base: '/my-memo/',
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  },
  server: {
    // 本地开发：前端仍用相对路径请求 api/...，这里转发给 node 服务（ALLOW_ANON=1 node server.js）
    proxy: {
      '/my-memo/api': {
        target: 'http://127.0.0.1:5058',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/my-memo/, '')
      }
    }
  }
});
