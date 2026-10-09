# 我的备忘录（my-memo）

桌面便签风格的个人备忘录 / 待办看板：纸张贴在桌面上的写实观感，支持分类、搜索、拖动排序、多账号数据隔离。

- **线上地址**：<https://www.conyu.top/my-memo/>（备用入口 <http://118.178.224.228/my-memo/>）
- **代码仓库**：<https://github.com/con-yu/my-memo>（公开）

> ⚠️ **改功能前先看第六节的「文档维护约定」：重要功能调整必须同步更新本文件。**

---

## 一、功能特性

### 卡片与视觉

| 特性 | 说明 |
| --- | --- |
| 写实纸张 | 上缘按平（圆角 2px）、下缘微微翘起（圆角 8px/6px）+ 翘起处受光渐变 + 上紧下散的投影 |
| 随手摆放感 | 每张卡片按 id 散列产生 ±1.25° 倾角与随机下移，避免整齐的「格子感」 |
| 桌面材质 | 9 种：浅灰 / 暖砂 / 雾蓝 / 浅橡木 / 亚麻桌布 / 软木板 / 实木 / 墨绿毛毡 / 深色石板；按钮图标实时显示**当前桌面的预览色块** |
| 纸张样式 | 6 种：横格 / 方格 / 白纸 / 牛皮 / 便签黄 / 薄荷便签 |
| 纸面质感 | 一层噪点叠图（`multiply` 混合）模拟纸张纤维 |
| 完成划线 | 待办勾选后，一条 2px 手绘直线从左向右**展开**划过（`width` 动画）；未完成时宽度为 0，不留任何痕迹 |

### 内容与组织

| 特性 | 说明 |
| --- | --- |
| 两种类型 | 文字笔记 / 待办清单（逐条勾选，卡片上显示 `x/y 已完成`） |
| 分类 | 新建分类（≤16 字 + 8 种预设色）；侧栏按分类筛选；删除分类时其下备忘自动转为未分类 |
| 搜索 | 标题 / 正文 / 待办条目全文过滤 |
| 固定 | 点 `☆` 固定到最前；**所有已固定的卡片顶部统一显示一条胶带**（与纸张类型无关），固定组永远排在最前 |
| 复制全文 | 卡片上的 `📋`（仅文字笔记且有正文）与编辑弹窗左下角的「复制全文」；复制的是**完整正文**（卡片展示是截断的） |

### 交互

| 特性 | 说明 |
| --- | --- |
| 点击卡片即编辑 | 卡片不再有「编辑」按钮；点击卡片任意空白/正文区域打开编辑器，键盘 `Enter` / `Space` 同样可以 |
| 拖动排序 | 按住卡片拖动**超过 6px** 触发；拖动中卡片浮起并跟随指针，原位留虚线占位框；松手即落位，过程中**不弹任何提示** |
| 键盘等价操作 | 卡片聚焦后 `Alt + 方向键` 前后移动一位 |
| 编辑后自动置顶 | 保存后该便签自动排到**固定组之后的第一位**（固定便签仍更靠前） |
| 乐观更新 | 所有改动先更新界面再同步服务端，操作即时响应 |
| 右上角账号菜单 | 顶栏最右侧是一枚账号头像（由账号服务 `site-auth` 的通用组件渲染）：桌面端鼠标悬浮展开、触摸端点击展开，菜单里可进「个人主页」或「退出登录」 |

---

## 二、排序与顺序规则

排序方式（顶栏下拉）：

| 取值 | 名称 | 规则 |
| --- | --- | --- |
| `updated` | 最近修改 | 按 `updatedAt` 倒序 |
| `created` | 创建时间 | 按 `createdAt` 倒序 |
| `title` | 标题 | 按标题本地化排序（`zh-Hans-CN`） |
| `manual` | 手动排序 | 按 `settings.order` 里的 id 序列，由拖拽排序产生 |

> `manual` 是「拖拽出来的顺序」，不需要手动去选：拖一次就自动切过去。

统一的附加规则：

1. **固定永远最前**：`pinned` 的卡片始终排在未固定卡片之前，以上排序都在各自分组内生效。
2. **手动排序的存储**：`settings.order` 是 id 数组，**不**存在笔记对象里——一次拖拽只需 1 个 PATCH 请求，且用户删除笔记后该数组会在下次拖拽时自动收敛（重建自现存笔记）。
3. **未纳入序列的笔记**（刚新建、还没拖过）排在已定位笔记**之前**。
4. **拖拽即切到手动排序**：拖动（或键盘 `Alt+方向键`）后排序方式自动变为 `manual`，下拉同步选中「手动排序」，过程中不弹提示；在下拉里改选其他方式即退出手动顺序（`order` 仍保留，下次拖拽继续沿用）。
5. **筛选视图下拖动**：只重排「可见笔记」所占的槽位，被分类/搜索过滤掉的笔记位置保持不动。
6. **编辑置顶**：保存后把该便签插到「最后一张固定便签」之后；自己若是固定状态则进固定组最前。其余笔记的相对顺序不变。

---

## 三、文件结构

```
my-memo/
├── server.js              # 后端：零依赖 HTTP 服务（CommonJS）+ REST API + 托管前端产物
├── index.html             # Vite 入口（只留挂载点与模块脚本）
├── vite.config.mjs        # 构建配置：base = /my-memo/，dev 时把 api 代理到 5058
├── src/                   # 前端源码（Vue 3 + Vite）
│   ├── main.js            # 应用入口（挂载 Vue + Pinia）
│   ├── App.vue            # 布局与全局快捷键
│   ├── constants.js       # 纸张 / 桌面 / 分类色 / 排序方式
│   ├── utils.js           # uid、时间格式化、卡片倾斜与错落
│   ├── styles/index.css   # 全部样式（桌面材质、纸张、弹窗等）
│   ├── stores/            # data.js（数据与同步）、ui.js（提示 / 弹窗 / 离线）
│   ├── composables/       # useDragSort、useClipboard、useNoteActions
│   └── components/        # TopBar / SideBar / NoteBoard / MemoCard / CardTodoList
│                          # base/BaseModal + modals/（编辑器、分类、桌面、确认、离线）
├── dist/                  # 构建产物（部署时上传，`.gitignore`）
├── legacy/                # 重构前的零构建版本，仅作回退，不参与开发
├── STORAGE.md             # 数据存储方案与演进路线（数据模型变化时同步更新）
├── MIGRATION.md           # 本次重构的方案与取舍
├── AGENTS.md              # 给 AI 代理的工作约定
└── README.md              # 本文件
```

运行时目录（`.gitignore`）：

```
data/store.json    # 数据文件，服务首次启动自动创建
node_modules/      # 依赖
dist/              # 构建产物
```

---

## 四、技术形态与约束

| 项 | 说明 |
| --- | --- |
| 后端依赖 | **零 npm 依赖**，仅用 Node 内置模块（`http` / `fs` / `crypto` / `path`），Node ≥ 14 即可；**CommonJS**，线上直接 `node server.js` |
| 前端依赖 | Vue 3 + Pinia，Vite 构建（`vue` / `pinia` / `vite` / `@vitejs/plugin-vue` / `@vueuse/core`） |
| 部署形态 | `npm run build` 生成 `dist/`，由 `server.js` 托管（不经过 Nginx 静态目录）；找不到 `dist/` 时回退 `legacy/` |
| **单进程单实例** | 数据在内存持有，多进程会互相覆盖 |
| **手工改数据前必须先停服务** | SIGTERM 处理会把内存状态写回，直接改文件会被覆盖 |
| 落盘方式 | 原子写：先写 `store.json.tmp` 再 `rename` |

> 数据结构的细节（`spaces` 按账号分区、`pending` 历史数据继承、scrypt 口令、会话续期等）见 **STORAGE.md**。

---

## 五、数据同步与多端行为

- **偏好增量同步**：`desk` / `sort` / `view` / `lastPaper` / `order` 这类偏好走 `PATCH /api/settings`，且**只提交相对上次同步结果真正变化的字段**。目的是防止较早打开的标签页把别人刚改好的字段（尤其是手动排序 `order`）整体覆盖回去。
- **防抖合并**：偏好的 PATCH 有 600ms 防抖；拖动排序这类明确动作会立即发送。
- **多标签页不会实时同步**：没有轮询/推送机制，A 页改动后需在 B 页刷新才能看到；本机制保证的是「不会互相破坏数据」。
- **失败反馈**：保存失败弹 Toast；网络中断弹离线遮罩并提供「重试连接」；会话过期跳登录页。

---

## 六、文档维护约定（重要）

**凡涉及重要功能调整，必须在同一次提交里同步更新本 README**，不允许「先改代码、文档以后补」。

什么算「重要功能调整」：用户可见的行为变化（新增 / 移除 / 改变交互）、API 增删改、环境变量、部署方式、数据结构、排序与渲染等核心规则。

更新位置对照：

| 改动内容 | 需要更新的位置 |
| --- | --- |
| 新增/修改用户可见功能 | 第一节「功能特性」 |
| 排序、置顶、顺序相关的规则 | 第二节「排序与顺序规则」 |
| 接口增删改 | 第七节「API」 |
| 环境变量、启动方式 | 第八节「本地开发」 |
| 部署方式、Nginx/systemd、缓存策略 | 第九节「部署」 |
| 数据结构 / 存储方案 | 本节 README 第四节 + **STORAGE.md** |
| 已知限制、取舍 | 第十节「已知限制」 |

**不要写入日期或时间信息**（本仓库为公开仓库，避免对外暴露时间线）。

> 例：新增「拖动排序」与「编辑后自动置顶」时，已同步更新「功能特性 / 排序与顺序规则 / 数据同步」三处，并把偏好同步改为增量字段。

---

## 七、API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查：`{ ok, rev, spaces }` |
| GET | `/api/state` | 读取当前账号的数据：`{ rev, user, categories, notes, settings }` |
| PUT | `/api/notes/:id` | 新建或更新一条备忘（幂等 upsert） |
| DELETE | `/api/notes/:id` | 删除一条备忘 |
| PUT | `/api/categories/:id` | 新建或更新一个分类 |
| DELETE | `/api/categories/:id` | 删除分类（其下备忘转为未分类） |
| PATCH | `/api/settings` | 更新界面偏好，可传 `desk` / `sort` / `view` / `lastPaper` / `order`（部分字段即可） |

约定：

- 所有写操作的响应为 `{ rev, data }`，`rev` 为当前版本号；错误为 `{ error }`，请求体上限 512KB。
- **路由兼容子路径**：服务端按 URL 中 `/api/` 出现的位置截取路由，因此挂在 `/my-memo/` 之类的任意前缀下都能工作；前端一律用相对路径请求 `api/...`。
- **身份来自网关**：`X-User-Id` 由 Nginx 在鉴权通过后注入（客户端伪造的同名头会被覆盖）；配置了 `GATEWAY_TOKEN` 时还会校验 `X-Gateway-Token`，防止同机其它进程绕过网关自带身份冒充他人。

---

## 八、本地开发

```bash
# 1) 接口服务：零依赖、免鉴权，数据落在 anonymous 空间
ALLOW_ANON=1 node server.js        # → http://127.0.0.1:5058/

# 2) 前端开发：Vite 热更新，api 自动代理到 5058
npm install
npm run dev                        # → http://localhost:5173/my-memo/

# 3) 构建产物（部署形态）
npm run build                      # → dist/
```

Windows PowerShell：

```powershell
$env:ALLOW_ANON='1'; node server.js
```

访问 <http://127.0.0.1:5058/>（构建产物形态）或 <http://localhost:5173/my-memo/>（开发形态）。

环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `5058` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址 |
| `DATA_DIR` | `./data` | 数据目录 |
| `ALLOW_ANON` | 未设置 | 设为 `1` 时允许无身份访问（落到 `anonymous` 空间，**仅本机调试用**） |
| `GATEWAY_TOKEN` | 未设置 | 未设置时不校验网关令牌（方便本机开发） |

改 `src/` 后：开发模式热更新；要验证线上形态就 `npm run build` 再刷新页面。改 `server.js` 必须重启进程。

---

## 九、部署

线上环境（阿里云 ECS，Alibaba Cloud Linux 3）：

| 项 | 值 |
| --- | --- |
| 应用目录 | `/opt/my-memo/` |
| 服务管理 | systemd 服务 `my-memo`：`/usr/bin/node server.js`，监听 `127.0.0.1:5058` |
| Nginx | `/etc/nginx/default.d/my-memo.conf`：`location /my-memo/` 反代（`auth_request` 鉴权 + `X-User-Id` 透传 + 网关令牌）；另有一条正则 location 让 `/my-memo/assets/*`（以及回退版本的 `styles.css` / `app.js`）**免鉴权**，以便 Cloudflare 边缘缓存 ✓ 改前端产物路径时记得同步这条规则 |
| 数据文件 | `/opt/my-memo/data/store.json` |
| Swap | 2 G `/swapfile`（`vm.swappiness=10`，已写入 `/etc/fstab` 开机自启）。未配置时内存耗尽会直接 OOM Kill 进程，而本服务数据在内存持有，被杀会丢最后一次未落盘的写 |
| HTTPS | Cloudflare Tunnel（`cloudflared`），规范入口 `https://www.conyu.top/` |

发布步骤：

1. 本地 `npm run build`，把 `dist/` 上传到 `/opt/my-memo/dist/`（**不要上传本地的 `data/`**，会覆盖线上数据）
2. 改了 `server.js` → `systemctl restart my-memo`；只改前端则无需重启，但必须上传新的 `dist/`
3. 验证：`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/my-memo/`、`systemctl is-active my-memo`

### 缓存策略（改动如何生效）

| 资源 | 响应头 | 行为 |
| --- | --- | --- |
| `index.html` | `no-cache` + ETag | 每次刷新都校验 |
| `assets/*-[hash].js` / `*-[hash].css` | `public, max-age=31536000, immutable` | 文件名由 Vite 带上内容 hash，内容变了 URL 就变，无需清缓存 |
| 回退场景下的 `legacy/` 文件 | `public, max-age=3600` + ETag | 仅在 `dist/` 缺失时才会走到 |

> 关键点：产物文件名自带内容 hash，因此不再有「改了样式刷新却没变化」的问题 —— 前提是**确实上传了新的 `dist/`**。

---

## 十、已知限制

1. **单进程单实例**：不能用多 worker / 负载均衡（数据在内存）。这也是线上 `pm2`/`cluster` 都不启用的原因。
2. **手工改 `store.json` 前必须先停服务**，否则会被服务的 SIGTERM 写回覆盖。
3. **多标签页不实时同步**：偏好的增量同步避免了互相覆盖，但界面不会自动刷新。
4. **没有自动备份**：建议 cron 每日打包 `store.json`（方案见 STORAGE.md 第五节）。
5. **拖动排序仅支持鼠标 / 触摸拖动与键盘 `Alt+方向键`**，未做拖到视口边缘的自动滚动。
6. **静态路径解析**：`server.js` 只认 `/assets/` 之后的部分与带扩展名的文件名，其余一律回退 `index.html`（SPA fallback）；新增资源类型时同步 `MIME_BY_EXT`。
