# AI 小说创作系统

一个面向网文与短剧创作场景的 AI 协同写作平台，覆盖从立项到发布的完整流程：

- 项目立项（标题/简介智能生成）
- 核心设定（世界观/冲突/规则）
- 角色设计（含角色形象图）
- 大纲拆解（按幕/章节）
- 章节生成与多版本评分
- 章节分镜与场景资产补全
- 番茄发布与批量发布流程

> 适合做：AI 写作产品原型、工作流自动化项目、创作助手类应用的二次开发。

---

## 技术栈

- **前端/服务端**: Next.js 15（App Router）+ React 19 + TypeScript
- **UI**: Tailwind CSS 4 + Radix UI
- **数据库**: PostgreSQL + Prisma
- **鉴权**: NextAuth v5
- **AI**: OpenAI / Anthropic / Google / Qwen（按项目或用户配置）
- **自动化发布**: Puppeteer（用于番茄作家流程）

---

## 项目结构

```bash
book/
├── apps/
│   └── web/                 # 主应用（Next.js）
├── docs/                    # 设计与迭代文档
├── docker-compose.yml       # 本地 PostgreSQL
├── package.json             # Monorepo 根脚本
└── pnpm-workspace.yaml
```

---

## 功能概览

- **项目生成**: 支持 AI 生成标题/简介，可选择是否先做需求优化
- **核心设定**: 支持关键词输入，可选择是否先做关键词优化
- **角色系统**: 角色增删改查、批量生成、二次元形象图生成
- **章节系统**:
  - 单章生成 / 重新生成
  - 一幕内自动顺序生成（支持自定义目标字数）
  - 版本评分与最佳版本选择
- **分镜系统**:
  - 章节分镜生成与查看
  - 场景图补全（缺失检测、单次补全、手动复用/删除）
  - 人物形象缺失提示
- **发布系统**:
  - 单章发布 / 批量发布
  - 番茄作家项目级独立绑定（作者与书籍 ID）

---

## 快速开始（本地开发）

### 1) 准备环境

- Node.js >= 18
- pnpm >= 8
- PostgreSQL（推荐直接用仓库内 docker-compose）

### 2) 安装依赖

```bash
pnpm install
```

### 3) 启动数据库（推荐）

```bash
docker compose up -d
```

默认会启动：

- host: `localhost`
- port: `6432`
- db: `novel_ai`
- user: `novel_user`

### 4) 配置环境变量

复制并编辑：

```bash
cp apps/web/.env.example apps/web/.env
```

最小必填项示例：

```env
DATABASE_URL="postgresql://novel_user:novel_password@localhost:6432/novel_ai"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="请替换为至少32位随机字符串"
```

可选项：

- `CHROME_PATH` / `PUPPETEER_EXECUTABLE_PATH`（番茄自动化场景）

### 5) 初始化数据库

```bash
pnpm db:generate
pnpm db:push
```

### 6) 启动开发服务器

```bash
pnpm dev
```

访问：`http://localhost:3000`

---

## 部署指南（生产）

以下为通用自建部署流程（VM / 物理机 / 容器环境均可）。

### 1) 构建

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm build
```

### 2) 生产环境变量

至少配置：

- `DATABASE_URL`
- `NEXTAUTH_URL`（必须是线上域名）
- `NEXTAUTH_SECRET`

建议：

- 使用托管 PostgreSQL（或独立数据库容器）
- 通过进程管理器（pm2/systemd）守护 `pnpm start`

### 3) 启动

```bash
pnpm start
```

默认端口：`3000`（可通过常规 Next.js 方式调整）

---

## 常用命令

```bash
pnpm dev          # 启动开发环境
pnpm build        # 生产构建
pnpm start        # 启动生产服务
pnpm lint         # 代码检查
pnpm db:generate  # 生成 Prisma Client
pnpm db:push      # 推送 schema 到数据库（开发常用）
pnpm db:migrate   # 创建并执行迁移（演进数据库结构）
pnpm db:studio    # 打开 Prisma Studio
```

---

## 常见问题

### 1) `未授权` / 登录异常

- 检查 `NEXTAUTH_URL` 与实际访问域名是否一致
- 检查 `NEXTAUTH_SECRET` 是否正确、稳定

### 2) 章节/分镜生成失败

- 检查 AI Key 和模型配置
- 检查项目或用户级 AI 配置是否覆盖默认值

### 3) 番茄自动化不可用

- 需可用 Chrome/Chromium
- 可通过 `CHROME_PATH` 或 `PUPPETEER_EXECUTABLE_PATH` 指定浏览器路径

---

## 文档

详细设计文档在 `docs/`：

- [需求规划](./docs/01-需求规划.md)
- [迭代计划](./docs/02-迭代计划.md)
- [技术实现流程](./docs/03-技术实现流程.md)

---

## 开源协议

MIT
