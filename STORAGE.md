# 数据存储方案（Storage）

> 记录本项目当前的数据存储方式、选型理由，以及未来演进到数据库的触发条件与路径。
> 最后更新：2026-09-28

## 一、现状：JSON 文件（零依赖）

| 服务 | 文件 | 内容 |
|------|------|------|
| `site-auth` | `/opt/site-auth/data/store.json` | 账号、口令哈希、登录会话 |
| `my-memo` | `/opt/my-memo/data/store.json` | 按账号分区的备忘录、分类、界面偏好 |

**数据结构**

```jsonc
// site-auth
{ "rev": 38,
  "users":    [ { "id", "name", "pass": "scrypt:<盐>:<派生值>", "createdAt", "lastLoginAt" } ],
  "sessions": [ { "sid", "userId", "createdAt", "expiresAt" } ] }

// my-memo
{ "rev": 41,
  "spaces": { "<userId>": { "categories": [], "notes": [], "settings": {} } },
  "pending": null }
```

**读写机制**

- 只用 Node 内置模块，**零 npm 依赖**（上传即可运行，无需 install）
- 启动时把整个 JSON 读进内存；运行时读写内存；每次写操作后异步落盘
- 落盘为原子写：先写 `store.json.tmp`，再 `rename` 覆盖 —— 不会出现写一半的坏文件
- 安全：口令用 `node:crypto` 的 **scrypt + 16 字节随机盐**（64 字节派生值），比对用 `timingSafeEqual`，不可逆；
  会话为 32 字节随机 `sid`，服务端记录，**7 天滑动续期**

**固有约束（重要的运维前提）**

1. **只能单进程单实例**：多个进程会各自持有内存副本并互相覆盖
2. **每次写都重写整个文件**（全量写）
3. **手工改文件前必须先停对应服务**：服务的 SIGTERM 处理会把内存状态写回，直接改文件会被覆盖
4. 进程被强杀时，最后一次尚未落盘的改动会丢（文件本身不会损坏）
5. 备份依赖外部定时任务（见第五节）

## 二、为什么当前不引入数据库

这不是"文件比数据库好"，而是**场景匹配**：

- **规模极小**：2 个账号、2 条笔记，数据总量约 1~2 KB
- **零依赖是硬约束**：服务器在国内阿里云节点，装数据库/拉 npm 包都受网络影响；文件方案让部署变成"上传 + 起服务"
- **写者单一**：个人使用，不存在并发冲突，事务没有用武之地
- **一致性要求低**：备忘录不是金融数据，前端又做了乐观更新，UI 不会等后端
- **代码量小**：全部存储逻辑内联在几百行的 `server.js` 里，行为可预测

> 类比：文件方案相当于"一个人的记事本"，数据库相当于"带锁、索引、日志、权限的中央账本"。
> 什么时候需要账本，取决于同时有多少人在写、数据有多大、要不要跨服务共享。

## 三、什么时候该换（触发条件）

出现以下任一情况，建议切换到数据库：

- 单账号笔记 **超过 1000 条**，或数据文件 **超过 1 MB**
- 出现**多用户并发写**（例如分享给他人共同编辑）
- 需要**复杂查询/统计**（跨账号搜索、按时间聚合等）
- 需要**多实例部署 / 负载均衡**（单文件无法在进程间共享）
- 需要**跨服务的共享数据层**（多个后端读同一份业务数据）

## 四、演进路径

### 第 1 步：SQLite（最平滑）

单文件数据库，换来 SQL、事务、索引、并发读：

- 服务器当前 Node 为 **v20**，内置 `node:sqlite` 需要 **Node 22+**；否则用 `better-sqlite3`（需 npm 安装）
- 建议表结构（与现有数据一一对应）：

  | 表 | 关键字段 |
  |---|---|
  | `users` | id, name(唯一), pass_hash, created_at, last_login_at |
  | `sessions` | sid(主键), user_id, created_at, expires_at |
  | `categories` | id, user_id, name, color |
  | `notes` | id, user_id, title, type, content, paper, pinned, category_id, created_at, updated_at |
  | `todos` | id, note_id, text, done, ord |
  | `settings` | user_id(主键), desk, sort, view, last_paper |

- **API 契约不变**，前端（`src/`）无需改动
- 迁移：写一个一次性脚本，遍历 `spaces` 按 `userId` 导入即可

### 第 2 步：PostgreSQL / MySQL（有并发、多服务共享时）

- 把鉴权、会话也接进去，多实例部署时直接用数据库做共享状态
- 此时才需要连接池、迁移工具（Flyway / Prisma Migrate 之类）等配套

### 不建议的中间形态

- 不要为了"看起来专业"在只有 2 个用户时引入 MySQL：装服务、建库、连接池、迁移脚本的复杂度会立刻超过收益

## 五、备份

| 方案 | 做法 | 状态 |
|------|------|------|
| A. 本地滚动备份（0 成本） | `/root/backup/daily-backup.sh`：cron 每日 03:30 把两个 `store.json` 打包到 `/root/backup/rolling/store-<时间戳>.tar.gz`，保留 14 天，日志 `/var/log/my-memo-backup.log` | **已配置** |
| B. 同步 OSS | 用服务器上已有的 `aliyun` CLI 每天上传备份 | 未配置 |
| C. ECS 自动快照 | 控制台配置自动快照策略 | 未配置 |

为什么直接 `tar` 复制文件就够：两个服务都用「原子写」（先写 `.tmp` 再 `rename`），任意时刻读到的 `store.json` 都是完整版本，不会读到写了一半的坏文件。

恢复方式：

```bash
systemctl stop my-memo site-auth
cd / && tar xzf /root/backup/rolling/store-<时间戳>.tar.gz
systemctl start my-memo site-auth
```

> 两个注意点：备份包内是相对路径（`opt/...`），解压前必须 `cd /`；恢复前必须先停服务，
> 否则服务的 SIGTERM 处理会把内存状态写回、覆盖刚恢复的文件。

> 建议后续补上 B（异地留存，防磁盘故障）—— 方案 A 只能防误删与写坏，备份与数据在同一块磁盘上。
