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
- 只改文档内容（`src/content/docs/`、`src/assets/`）的 PR 若预览检查失败，先在 PR 里说明本地构建已通过，再请用户查看控制台日志。
