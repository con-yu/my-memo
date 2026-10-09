# AGENTS.md

给 AI 编码代理的工作说明。

项目是什么、有哪些功能、怎么部署，见 [README.md](./README.md)；数据结构与演进路线见 [STORAGE.md](./STORAGE.md)。
**本文件只写「在这个仓库里干活必须遵守的事」**，不重复上面两份文档的内容。

---

## 一句话

零依赖 Node 服务（`server.js`）+ 无构建原生前端（`index.html` / `styles.css` / `app.js`），JSON 文件持久化，单进程单实例。

---

## 运行与验证

```bash
# 本机调试：免鉴权，数据落在 anonymous 空间
ALLOW_ANON=1 node server.js        # → http://127.0.0.1:5058/
```

- 改 `server.js` **必须重启进程**；改前端文件刷新页面即可（服务每次请求实时读文件）
- 语法自检：`node --check server.js && node --check app.js`
- **没有测试框架、没有 lint、没有 CI**。改完必须自己起服务，用真实浏览器走一遍改动路径，并确认「操作成功 → 刷新页面后数据仍在」
- 改了 CSS/JS 却在浏览器里看不到效果时，先检查 `index.html` 的 ETag 是否仍包含 `assetStamp()`（见 `server.js` 中静态资源部分的注释）—— 这是「改了样式刷新却看不到」的唯一失效点

---

## 硬约束

违反其中任何一条，都会破坏项目卖点或线上数据：

1. **不加 npm 依赖、不加构建步骤、不引入前端框架** —— 「上传即运行」是核心卖点
2. **单进程单实例**：不要同时起多个 `server.js`，数据在内存持有，多进程会互相覆盖
3. **不要提交 `data/`，部署时也不要上传它** —— 会覆盖线上数据
4. **手工改 `data/store.json` 前必须先停服务** —— SIGTERM 处理会把内存状态写回
5. **这是公开仓库**：不要写入日期、时间线、个人信息
6. 前端一律用**相对路径**请求 `api/...`，不要写 `/api/...` —— 要兼容挂载在 `/my-memo/` 之类的子路径下

---

## 多处镜像同步（漏一处就出 bug）

| 改什么 | 必须同步的位置 |
| --- | --- |
| 桌面类型 | `server.js` 的 `DESKS` · `app.js` 的 `DESKS` · `styles.css` 的 `body[data-desk="x"]` 与 `.sw-x` |
| 纸张类型 | `server.js` 的 `PAPERS` · `app.js` 的 `PAPERS` + `PAPER_PREVIEW` · `styles.css` 的 `.paper-x` |
| 新增前端文件 | `server.js` 的 `STATIC_MIME` · `index.html` 里的引用 |
| 新增设置字段 | `server.js` 的 `defaultSettings()` + `handleSettings()` · `app.js` 的默认值与 `pushSettings` |
| 排序方式 | `server.js` 的 `SORTS` · `app.js` 的 `SORTS` · `index.html` 的下拉选项 |
| 用户可见行为变化 | **同一次提交内**更新 `README.md`（对照表见其第六节） |
| 数据结构 / 存储方案 | **同一次提交内**更新 `STORAGE.md` |

---

## 代码风格

- `app.js` 是**纯 ES5**：只用 `var` + `function`，不要用 `const` / `let`、箭头函数、模板字符串 —— 与全文件保持一致
- `server.js` 用现代写法（`const` / 箭头函数）
- 前端整个逻辑包在 IIFE 里；字符串用 `+` 拼接
- 注释用中文，解释「为什么」而不是「是什么」
- 视觉改动沿用既有设计语言：写实纸张质感、手写体标题、低饱和配色

---

## 提交

- 提交信息用中文，格式 `type: 说明`（`feat:` / `fix:` / `docs:` / `perf:` / `style:` 等）
- 提交前确认：语法自检通过、浏览器验证过改动路径、需要更新的文档已同步
