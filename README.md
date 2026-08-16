# DeepSeek Harness — macOS Desktop App

> **⚠️ DISCLAIMER — Not an official DeepSeek product**
>
> This is an **unofficial, community-built desktop wrapper** for the DeepSeek Harness web interface.
> It is **not affiliated with, endorsed by, or produced by DeepSeek** (DeepSeek AI / 深度求索).
>
> The official DeepSeek Harness is available at: **https://www.deepseek.com/harness/**
>
> "DeepSeek" and related names/trademarks belong to their respective owners. This project only wraps
> the published `@deepseek-ai/dsh` npm package and adds no DeepSeek code or branding beyond the package name.

把现有的 **DeepSeek Harness Web 版**（`dsh web`）封装成一个真正可独立运行的 macOS 原生应用：

- 双击 App 即可启动，无需手动开浏览器、无需手动起 Server
- 无需用户安装 Node.js / Python / Bun / Electron 等任何运行环境
- 保留现有 Harness Runtime 与 Web UI 的全部功能
- 退出 App 时自动关闭后端及所有子进程，无残留

## 架构

采用 **Electron 外壳 + 内置 dsh 后端** 方案，不重写、不改动现有 Harness。

```
DeepSeek Harness.app
├── Electron 主进程 (main.js)
│     ├── 启动内置的 Harness Runtime（用 Electron 自带 Node 作为子进程）
│     ├── 等待本地 Server Ready（解析 dsh web 打印的 URL）
│     ├── 打开原生窗口加载现有 Web UI
│     └── 退出时终止整个后端进程树
├── Harness Runtime（@deepseek-ai/dsh）
│     ├── Agent / LLM / Tools
│     ├── Shell / Terminal（node-pty）
│     ├── File System
│     ├── MCP
│     └── 本地 API Server（node:http，127.0.0.1）
└── Renderer（现有 React Web UI）
```

关键点：

- **后端以子进程方式运行**：用 `ELECTRON_RUN_AS_NODE=1` 复用 Electron 自带的 Node，
  因此最终用户**不需要**装 Node.js。
- **`asar: false`**：dsh 后端以纯 Node 子进程运行，无法读取 asar 归档；且后端含
  N-API 原生模块（node-pty / sharp / koffi），全部解包最稳妥。
- **端口自动分配**：`--port 0` 让系统随机选端口，避免与其它程序冲突。
- **数据持久化**：沿用 Web 版同一数据目录 `~/.dsh`（会话、设置、凭据、历史都在这里），
  桌面版与 `dsh web` 共享数据，不会写入临时目录。可用 `DSH_HOME` 环境变量覆盖。

## 开发模式

```bash
npm install
npm run dev        # 启动 Electron + 内置 dsh 后端（带日志）
npm start          # 同 dev，但不带 dev 日志
npm run smoke      # 无界面自检：起后端→校验 UI→加载窗口→干净退出
```

开发模式下，日志输出到终端；运行日志同时写入
`~/Library/Logs/DeepSeek Harness/dsh-backend.log`。

## 构建生产版

```bash
npm run dist:dir   # 只产出 .app（不打包 dmg，用于快速验证）
npm run dist       # 产出 .app + .dmg + .zip
npm run pack       # 同 dist（dmg + zip）
```

产物在 `release/` 目录：

- `release/mac-arm64/DeepSeek Harness.app` — 可双击运行的 App
- `release/DeepSeek Harness-0.1.0-arm64.dmg` — 安装镜像（拖入“应用程序”）
- `release/DeepSeek Harness-0.1.0-arm64.zip` — 免安装压缩版

当前仅构建 **Apple Silicon (arm64)**。如需支持 Intel Mac，把
`electron-builder.yml` 中 `mac.target` 的 `arch` 改为 `[arm64, x64]` 或 `[universal]`。

## 打包后的自检

```bash
./release/mac-arm64/DeepSeek\ Harness.app/Contents/MacOS/DeepSeek\ Harness --smoke
```

看到 `SMOKE_OK` 且退出码为 0 即为通过。

## 签名与“已损坏”问题（重要）

构建产物使用 **ad-hoc 签名**（本机可运行，但无公证）。

- **为什么会报“已损坏，无法打开”**：两种原因叠加——
  1. App 未被正确签名（残缺签名链）；
  2. 文件带上了 `com.apple.quarantine`/`FinderInfo` 等属性（比如经 QQ/微信/网盘
     传输，或存放在 iCloud 同步的 `Documents` 目录里被反复加属性）。

  本项目已从两方面根治：`electron-builder.yml` 设置 `identity: "-"`（ad-hoc
  签名），并把构建输出放到 iCloud 范围外的 `/tmp/dsh-release`（构建后自动复制回
  `release/`）。

- **推荐用法：用 dmg 安装**。双击 `.dmg` → 把 App 拖进「应用程序」→ 从「应用程序」
  打开（`/Applications` 不在 iCloud 同步范围，签名不会被打扰）。

- **如果直接双击 `.app` 仍报“已损坏”**，先清除文件属性再打开：

  ```bash
  xattr -cr "/Users/steve/Documents/harness app/release/mac-arm64/DeepSeek Harness.app"
  ```

分发到**其它 Mac** 前需要 Apple Developer ID 签名 + 公证，否则对方首次打开会被
Gatekeeper 拦截（需要右键 → 打开，或到「系统设置 → 隐私与安全性」放行）。

```bash
# 用你的 Developer ID 构建并公证
CSC_LINK=/path/to/cert.p12 \
CSC_KEY_PASSWORD=xxx \
APPLE_ID=you@example.com \
APPLE_APP_SPECIFIC_PASSWORD=xxxx \
APPLE_TEAM_ID=XXXXXXXXXX \
npm run dist
```

## 数据 / 配置

- Harness 数据与 Web 版一致，位于 `~/.dsh`（`DSH_HOME` 可覆盖）。
- DeepSeek API Key 通过 `.env`（`~/.dsh/.env` 或工作目录 `.env`）或环境变量
  `DEEPSEEK_API_KEY` 配置，**不会硬编码进 App**。

## 已知限制

- 未签名/未公证：分发到其它 Mac 需要自行签名公证（见上）。
- 仅 arm64：Intel Mac 需按上文改 arch 重新构建。
- 应用图标暂用 Electron 默认图标，可后续替换（放入 `build/icon.icns`）。
