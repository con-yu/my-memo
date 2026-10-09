# MIGRATION.md — Vue 3 + Vite 重构方案

> ## 状态：**已实施**
>
> 前端已迁移为 Vue 3 + Vite（源码 `src/`，产物 `dist/`）；`server.js` 仍是零依赖 CommonJS，只有静态托管部分改为
> 「优先 `dist/`、找不到时回退 `legacy/`」。重构前的三个文件（`index.html` / `styles.css` / `app.js`）保留在 `legacy/` 以便回退。
>
> 本文件保留为**决策记录**：为什么这么改、放弃了什么、当时如何取舍。
> 阅读当前代码请以 `src/`、`server.js`、`README.md`、`AGENTS.md` 为准。

---

## 实施记录（与计划的差异）

| 计划 | 实际 | 原因 |
| --- | --- | --- |
| `vite.config.js` | `vite.config.mjs` | `package.json` **不能**设 `type: module`（会让 `server.js` 的 `require` 直接报错），因此构建配置改用 `.mjs` |
| 未规划回退目录 | 新增 `legacy/` | 保留重构前的可运行版本，`server.js` 在 `dist/` 缺失时自动回退，便于一键退回 |
| `server.js` 删除 `assetStamp` / `injectAssetStamp` | 已删除，改为按扩展名映射的 `MIME_BY_EXT` + `staticRoot()` + `staticFileFor()` | Vite 产物的 hash 文件名取代了资源指纹注入 |
| 组件与 store 数量 | 12 个组件、2 个 store、3 个 composable | 与计划一致 |

**验证方式**：仓库没有测试框架，本次通过 Chrome DevTools 协议驱动真实浏览器完成端到端验证——
覆盖首屏加载、搜索筛选、视图切换、卡片勾选、固定、编辑器（类型锁定 / 纸张 / 分类）、分类增删、
桌面切换、拖拽排序与 `Alt+方向键`、增量 PATCH 请求体、离线遮罩与重试连接。

---

## 一、方案与代价

**选定方案**：全量重写前端为 Vue 3 + Vite（方案 A）。

**明确要放弃的三点**（当前项目的核心定位）：

1. 零 npm 依赖 —— 改为需要 `node_modules` 与联网安装
2. 零构建 —— 改为必须 `npm run build` 后上传 `dist/`
3. 改完即生效 —— 改为「改源码 → 构建 → 上传产物」

**不受影响的部分**：`server.js` 的数据层与 REST API 契约一行不改（`GET /api/state`、`PUT /api/notes/:id`、`PATCH /api/settings` 等），线上数据与多账号隔离机制不变。

---

## 二、现状盘点（规划时的实测数据）

| 文件 | 行数 | 关键特征 |
| --- | --- | --- |
| `app.js` | 1269 | 66 个函数、39 处 `addEventListener`、9 处 `innerHTML` 拼接、12 处 `classList`、8 处 `setAttribute` |
| `styles.css` | 1388 | 12 个大分区（桌面材质 / 卡片 / 弹窗 / 拖拽 / 响应式） |
| `index.html` | 193 | 顶栏 + 侧栏 + 看板 + 5 个弹层 + Toast |
| `server.js` | 505 | REST API + 静态托管 + 资源指纹 |

前端合计约 2850 行，是一个完整但集中式的应用：渲染、状态、拖拽、乐观更新、弹窗、剪贴板全部在 `app.js` 里。

---

## 三、目标形态

```
my-memo/
├── server.js                 # 只改「静态托管」部分，API 一行不动
├── dist/                     # 构建产物（.gitignore，部署时上传）
├── src/
│   ├── main.js               # createApp + pinia
│   ├── App.vue               # 布局 + 全局快捷键（Esc / Cmd+Enter）
│   ├── styles/
│   │   └── index.css         # ← 原 1388 行 styles.css 原样搬入，不拆不 scoped
│   ├── stores/
│   │   ├── data.js           # notes / categories / settings + 同步
│   │   └── ui.js             # 弹窗开闭 / toast / offline / confirm
│   ├── composables/
│   │   ├── useDragSort.js
│   │   └── useClipboard.js
│   └── components/
│       ├── TopBar.vue
│       ├── SideBar.vue
│       ├── NoteBoard.vue
│       ├── MemoCard.vue
│       ├── CardTodoList.vue
│       ├── ToastHost.vue
│       ├── base/BaseModal.vue
│       └── modals/
│           ├── NoteEditorModal.vue
│           ├── CategoryEditorModal.vue
│           ├── DeskModal.vue
│           ├── ConfirmModal.vue
│           └── OfflineModal.vue
├── index.html                # Vite 入口，只留 <div id="app"> + <script type="module">
├── vite.config.js
├── package.json
└── .gitignore                # 新增 node_modules/ 与 dist/
```

`STORAGE.md` 完全不用动。

**CSS 策略**：1388 行样式整体作为全局样式引入，**不做拆分、不用 `scoped`**。原因是现有类名已按区块组织、且跨组件复用较多（`.mask`/`.sheet`/`.btn`/`.paper-*`/`body[data-desk]`），拆开只会增加回归风险。

---

## 四、依赖与构建配置

| 包 | 版本（规划时 npm latest） | 用途 |
| --- | --- | --- |
| `vue` | 3.5.43 | 运行时 |
| `vite` + `@vitejs/plugin-vue` | 8.3.4 | 构建（要求 Node `^20.19.0 \|\| >=22.12.0`） |
| `pinia` | 4.0.3 | 状态管理 |
| `@vueuse/core` | 按 latest 安装 | `useDebounceFn`、`useEventListener` 等 |
| `vitest` | 5.0.3 | 二期再上，第一期靠手测 |

**不引入**：

- `vue-router` —— 单页看板，没有多页面与 URL 路由需求，引入只会增加复杂度
- TypeScript —— 当前代码零类型，全量补类型会让迁移工作量增加约三分之一，建议二期单独推进

`vite.config.js` 的关键项：

```js
export default defineConfig({
  base: '/my-memo/',                    // 子路径部署，必须与 Nginx 的 location 一致
  plugins: [vue()],
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false }
});
```

---

## 五、组件拆分清单

| 组件 | 对应现状 | 职责 |
| --- | --- | --- |
| `TopBar.vue` | `index.html` 顶栏区；`renderDeskGrid` / `applyDesk` / `deskPreview` | 搜索框、排序下拉、桌面按钮、新建按钮 |
| `SideBar.vue` | `index.html` 侧栏区；`renderViews` / `renderCats` / `renderStats` / `countOf` | 视图列表、分类列表、统计行 |
| `NoteBoard.vue` | `index.html` 看板区；`renderBoard` / `renderAll` / `visibleNotes` | 卡片网格、空状态、拖拽容器 |
| `MemoCard.vue` | `cardHTML` / `tiltOf` / `shiftOf` / `fmtTime` | 单张卡片：胶带、工具按钮、页脚 |
| `CardTodoList.vue` | `todosHTML` | 卡片内待办列表与勾选 |
| `NoteEditorModal.vue` | 编辑弹层；`openEditor` / `closeEditor` / `submitNote` / `deleteNote` / `setType` / `setTypeLocked` / `renderTodoEdit` / `renderCatChips` / `renderPaperChips` / `copyNote` | 最复杂的组件 |
| `CategoryEditorModal.vue` | 分类弹层；`openCatEditor` / `closeCatEditor` / `submitCat` / `deleteCat` / `renderColorChips` | 分类增删改 |
| `DeskModal.vue` | 桌面弹层；`openDesk` / `closeDesk` / `renderDeskGrid` / `applyDesk` | 桌面材质选择 |
| `ConfirmModal.vue` | 确认弹层；`confirmDialog` / `closeConfirm` | Promise 化的确认框 |
| `OfflineModal.vue` | 离线弹层；`showOffline` / `hideOffline` / `gotoLogin` / `boot` | 断线遮罩与重试 |
| `ToastHost.vue` | `toast` | 轻提示 |
| `base/BaseModal.vue` | 5 个 `.mask` + `.sheet` 的公共结构 | 遮罩、Esc、点遮罩关闭、焦点管理 |

---

## 六、状态层设计（现行函数 → store 成员）

**`stores/data.js`**

| 现行实现 | 归宿 |
| --- | --- |
| `state` / `normalize` | store 的 `state` |
| `api` / `push` | `actions.request()`，保留乐观更新与 401、离线分支 |
| `pushNote` / `removeNote` / `pushCat` / `removeCat` | `actions.upsertNote` / `removeNote` / `upsertCategory` / `removeCategory` |
| `settingsDiff` / `pushSettings` / `flushSettingsNow` / `flushSettings` | `actions.patchSettings()`，**增量 diff + 600ms 防抖语义必须原样保留**（这是多标签页不互相覆盖的关键） |
| `filteredNotes` / `sortNotes` / `visibleNotes` | `getters` |
| `promoteNote` / `ensureManualSort` / `applyOrder` / `moveNote` | `actions` |
| `boot` | `actions.load()` |

**`stores/ui.js`**：`activeModal`、toast 队列、`confirm()`（返回 Promise）、offline 状态。

**`composables/useClipboard.js`**：`writeClipboard` + `legacyCopy` 平移，保留 `execCommand` 兜底。

---

## 七、拖拽排序（高风险区）

`startDrag` / `moveDrag` / `endDrag` / `boardOrder` 约 130 行，是本次迁移最容易翻车的地方 —— **Vue 的 `v-for` 重排会与原生拖拽的实时插位互相打断**。

建议做法：

- 拖拽**期间不写 store**：仍直接操作真实 DOM（用占位符 `insertBefore`），避免响应式重排打断拖拽
- **松手时**才一次性把最终顺序写入 store（`boardOrder()` → `applyOrder()`）
- 必须保留的三个手感细节：位移阈值 `6px`、拖拽结束后抑制紧随的一次 click（避免误开编辑器）、`.card-placeholder` 虚线占位框
- 用 Sortable.js 也可以，但它会与 Vue 的 DOM 所有权冲突（需要 `:key` + 顺序回写），风险不比照搬现有算法低 —— **优先照搬现有逻辑，只把头尾接到 store**

---

## 八、`server.js` 改造点

| 位置 | 动作 |
| --- | --- |
| `STATIC_MIME` | **重写**：从「3 个固定文件名」改为按扩展名映射（`.js` / `.css` / `.html` / `.svg` / `.png` / `.ico` / `.woff2` / `.json` 等） |
| `assetStamp()` / `injectAssetStamp()` | **删除** —— Vite 的 hash 文件名取代了这套机制 |
| ETag 计算 | **简化**为 `长度-修改时间`；`index.html` 保持 `no-cache` |
| `handleStatic` | **重写**：按相对路径解析 `dist/` 下文件、拒绝 `..` 与绝对路径、目录请求回退 `index.html`（SPA fallback）、按扩展名决定 MIME 与缓存头 |
| 路由分发（按 `/api/` 截取） | 不变 |
| `loadState` / `persist` / `getSpace` / `handleApi` 及其余全部 | **一行不改** |
| 新增 | `dist/` 不存在时返回明确报错（提示先执行构建），避免线上白屏难以定位 |

---

## 九、部署与缓存换代

发布步骤（README 第九节需同步重写）：

```bash
# 旧：改文件直接上传
# 新：
npm ci && npm run build          # 本地构建
# 上传 dist/ 到 /opt/my-memo/dist/
# 只有改了 server.js 才需要 systemctl restart my-memo
```

缓存策略对比：

| 资源 | 旧策略 | 新策略 |
| --- | --- | --- |
| `index.html` | `no-cache` + ETag（含资源指纹） | `no-cache` + ETag |
| `app.js` / `styles.css` | `max-age=3600` + `?v=` 指纹 | `assets/*-[hash].js` → `max-age=31536000, immutable` |

注意：hash 文件名天然解决了「HTML 与资源版本不匹配」的问题，因此旧的指纹注入逻辑可以整体退休。

---

## 十、实施里程碑

| # | 内容 | 验收 | 人天 |
| --- | --- | --- | --- |
| M0 | Vite + Vue + Pinia 骨架，空壳跑通 | `/my-memo/` 下能加载 | 0.5 |
| M1 | `server.js` 静态托管改造（可先拿现有 `app.js` 塞进 `dist` 验证） | 子路径 + 缓存头正确 | 0.5 ~ 1 |
| M2 | `stores/data.js` + 同步层 | 首屏加载、保存、刷新后数据仍在 | 1 |
| M3 | `TopBar` / `SideBar` / `NoteBoard` / `MemoCard` / `CardTodoList` | 列表、筛选、搜索、排序可用 | 1 |
| M4 | 5 个弹窗 + Toast + 剪贴板 | 增删改全通 | 1 |
| M5 | `useDragSort` | 手感与旧版一致 | 1 ~ 1.5 |
| M6 | 回归验证 + 文档同步 | 验收清单全部通过 | 1 |

合计约 6 ~ 8 人天，其中约三分之一花在与 Vue 无关的部署与缓存基建上。

---

## 十一、验收清单

必须逐条手测：

- 首屏加载、离线遮罩与「重试连接」
- 新建 / 编辑 / 删除笔记；**编辑已有备忘时类型锁定**
- 待办勾选（含绿色圆点的勾选态）、复制全文
- 分类增删改、按分类筛选、删除分类后其下笔记转为未分类
- 搜索（标题 / 正文 / 待办）
- 四种排序，含 `manual` 手动排序
- **拖拽排序** + `Alt + 方向键` + 拖完自动切到手动排序且不弹提示
- 9 种桌面 + 6 种纸张，刷新后保持
- 两个标签页同时打开时不会互相覆盖数据（增量 PATCH 生效）
- 挂在 `/my-memo/` 子路径下全部可用
- 移动端布局与弹窗

---

## 十二、已知风险

1. **旧缓存残留**：上线瞬间，老用户浏览器里可能仍是旧的 `app.js`。由于新产物文件名带 hash，HTML 中的引用会自然失效；但仍建议提示用户硬刷新一次。
2. **`AGENTS.md` 的硬约束必须改写**：其中「不加 npm 依赖、不加构建步骤」在方案 A 下会反过来阻止 AI 安装依赖，需改为「前端产物必须构建后上传 `dist/`，不要把 `src/` 直接传到服务器」。
3. **构建环境要求**：Vite 8 需要 Node `^20.19.0 || >=22.12.0`。本机满足；线上 Node 20 只需继续跑 `server.js`（构建在本地完成），因此不受影响。
4. **npm 网络可达性**：安装依赖需要稳定访问 npm registry。动手前先验证网络（本机曾出现无法连接 GitHub 的情况）。
5. **无自动化测试**：第一期仍靠手测，回归成本较高；`vitest` 建议在第二期补上。

---

## 十三、需要同步更新的文档

| 文档 | 需要改的位置 |
| --- | --- |
| `README.md` | 第三节「文件结构」、第四节「技术形态与约束」、第七节「API」中的缓存说明、第八节「本地开发」、第九节「部署」、第十节「已知限制」 |
| `AGENTS.md` | 「硬约束」第 1 条、「多处镜像同步」表中新增前端文件的条目、「运行与验证」中的构建与验证方式 |
| `STORAGE.md` | 不需要改动 |

---

## 十四、回退方式

整个迁移可以在分支上进行，`server.js` 的 API 契约保持不变，因此：

- 前端产物出问题时，把线上 `dist/` 换回**当前的三个文件**（`index.html` / `styles.css` / `app.js`）即可立即回退
- 数据层与线上 `data/store.json` 不受任何影响

建议在动手前保留一份当前版本的发布包，便于一键回退。
