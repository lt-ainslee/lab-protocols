# 工作须知

## Cloudflare 部署（Workers Builds）

预览构建（非 `main` 分支、PR 分支）反复出现过 `Workers Builds: lab-protocols` 检查失败，且失败时 GitHub 上的检查输出为空，只有控制台链接。改动涉及部署时提前规划，避免再踩：

- **推送前在本地跑完 Cloudflare 会跑的步骤**，不要只跑 `astro build`：
  - `npm run build`（Node 需 ≥ 22.23.4；容器自带 Node 22.22 不够，用 `npx -y node@24 node_modules/astro/bin/astro.mjs build`）
  - `npm run typecheck`（Worker 代码）
  - `npx wrangler deploy --dry-run --outdir <临时目录>`
- **不要动这些配置**，除非确认 Worker Previews 仍能工作：`wrangler.jsonc` 里的 `previews` 块（`wrangler preview` 必需）、`preview_urls`、预览用的单独 D1 数据库、`package.json` 的 `engines.node`。
- 新增绑定（D1、KV、变量等）时，正式和 `previews` 两处都要加，否则预览构建会缺绑定。
- 检查在 0 秒内失败、输出为空：说明构建根本没开始，问题在 Cloudflare 控制台的构建配置（分支控制、构建/预览命令、Node 版本），不在代码里。先让用户把控制台里的构建日志贴过来，不要盲改代码或空提交重跑。
- **每个推送的分支都会在 Cloudflare 生成一个独立的 Preview**（名称和 Tracking branch 都是分支名），各有自己的构建设置（构建命令 `npm run build`，预览命令 `npx wrangler preview`）。Claude 会话分支（`ccr-*`）也会各生成一个；Auto-deletion 只在分支被删除时才清理 Preview，合并后不删分支，旧 Preview 就一直留着（例如 `ccr-235bf636-qxtro6`）。内容最终要进 `experimental`，所以合并后应删掉会话分支。
- Node 版本由 `.nvmrc`（24）决定，控制台里没有设置构建变量；改 Node 版本时同时改 `.nvmrc` 和 `package.json` 的 `engines`。
- 已确认过的失败原因（都已修复，别再引入）：
  - 控制台构建命令为空 → 没有 `dist/`，部署失败。现在控制台构建命令是 `npm run build`。
  - `wrangler.jsonc` 缺少 `previews` 块 → `npx wrangler preview` 报 `missing a previews block`（9659a5b 修复）。修复前建出来的旧分支（如 `ccr-235bf636-qxtro6`）的 Preview 每次重建仍会报这个错，应删除该分支，而不是改代码。
- 看构建日志时先核对时间戳和分支名，确认是不是本次 PR 的构建。
- 只改文档内容（`src/content/docs/`、`src/assets/`）的 PR 若预览检查失败，先在 PR 里说明本地构建已通过，再请用户查看控制台日志。
