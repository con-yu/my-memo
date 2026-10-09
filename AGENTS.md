# AGENTS.md

给 AI 编码代理的工作说明。

项目是什么、有哪些功能、怎么部署，见 [README.md](./README.md)；数据结构与演进路线见 [STORAGE.md](./STORAGE.md)；
Vue 3 重构的方案与取舍见 [MIGRATION.md](./MIGRATION.md)。

**本文件只写「在这个仓库里干活必须遵守的事」**，不重复上面几份文档的内容。

---

## 一句话

零依赖 Node 服务（`server.js`，CommonJS，线上直接 `node server.js`）+ Vue 3 + Vite 构建的前端（源码 `src/`，产物 `dist/`），JSON 文件持久化，单进程单实例。

---

## 运行与验证

```bash
# 1) 接口服务（零依赖、免鉴权，数据落在 anonymous 空间）
ALLOW_ANON=1 node server.js        # → http://127.0.0.1:5058/

# 2) 前端开发（Vite 热更新，api 自动代理到 5058）
npm install
npm run dev                        # → http://localhost:5173/my-memo/

# 3) 构建产物（部署用）
npm run build                      # → dist/
```

- 改 `src/`：开发模式热更新；要验证线上形态就 `npm run build` 后刷新 `/my-memo/`
- 改 `server.js`：**必须重启进程**
- 语法自检：`node --check server.js`
- `server.js` 的静态托管顺序：**优先 `dist/`**，找不到时回退 `legacy/`（重构前的零构建版本，仅作回退用，**不要改**）
- **没有测试框架、没有 lint、没有 CI**：改完必须自己起服务，用真实浏览器走一遍改动路径，并确认「操作成功 → 刷新页面后数据仍在」
- 浏览器看不到改动时：先确认 `dist/` 已重新构建

---

## 硬约束

违反其中任何一条，都会破坏项目卖点或线上数据：

1. **`server.js` 保持零依赖 + CommonJS**：只用 Node 内置模块；**不要**给 `package.json` 加 `type: module`（会让 `require` 直接报错），也不要把它改成 ESM
2. **前端必须构建后上传**：改完 `src/` 要 `npm run build`，只把 `dist/` 传上服务器；不要上传 `src/` 或 `node_modules/`
3. **单进程单实例**：不要同时起多个 `server.js`，数据在内存持有，多进程会互相覆盖
4. **不要提交 `data/`，部署时也不要上传它** —— 会覆盖线上数据
5. **手工改 `data/store.json` 前必须先停服务** —— SIGTERM 处理会把内存状态写回
6. **这是公开仓库**：不要写入日期、时间线、个人信息
7. 前端一律用**相对路径**请求 `api/...`，不要写 `/api/...` —— 要兼容 `/my-memo/` 之类的子路径（Vite 的 `base` 同样是 `/my-memo/`）

---

## 多处镜像同步（漏一处就出 bug）

| 改什么 | 必须同步的位置 |
| --- | --- |
| 桌面类型 | `src/constants.js` 的 `DESKS` · `src/styles/index.css` 的 `body[data-desk="x"]` 与 `.sw-x` · `server.js` 的 `DESKS` 白名单 |
| 纸张类型 | `src/constants.js` 的 `PAPERS` + `PAPER_PREVIEW` · `src/styles/index.css` 的 `.paper-x` · `server.js` 的 `PAPERS` 白名单 |
| 排序方式 | `src/constants.js` 的 `SORTS` · `src/components/TopBar.vue` 的下拉选项 · `server.js` 的 `SORTS` |
| 新增设置字段 | `server.js` 的 `defaultSettings()` + `handleSettings()` · `src/stores/data.js` 的默认值与 `patchSettings` |
| 新增静态资源类型 | `server.js` 的 `MIME_BY_EXT` |
| 用户可见行为变化 | **同一次提交内**更新 `README.md`（对照表见其第六节） |
| 数据结构 / 存储方案 | **同一次提交内**更新 `STORAGE.md` |

---

## 代码风格

- `src/`：Vue 3 `<script setup>` + ESM，可以用现代语法；组件直接读写 Pinia store（`src/stores/data.js` 数据、`src/stores/ui.js` 提示与弹窗）
- `src/styles/index.css` 是**全局样式**（不做 `scoped`、不拆分）—— 跨组件复用的类很多，改动时注意影响面
- `server.js`：CommonJS + 现代语法（`const` / 箭头函数）
- 前端除 `vue` / `pinia` / `@vueuse/core` 外，不要引入 UI 组件库等运行时依赖
- 注释用中文，解释「为什么」而不是「是什么」
- 视觉改动沿用既有设计语言：写实纸张质感、手写体标题、低饱和配色

---

## 提交

- 提交信息用中文，格式 `type: 说明`（`feat:` / `fix:` / `docs:` / `perf:` / `style:` 等）
- 提交前确认：`node --check server.js` 通过、`npm run build` 通过、浏览器验证过改动路径、需要更新的文档已同步
