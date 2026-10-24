# 实验室 SOP 手册

基于 [Astro Starlight](https://starlight.astro.build/) 的实验室标准操作规程文档站，部署在 Cloudflare。

## 本地预览

需要 Node.js 22.23.4 及以上（推荐 24，见 `.nvmrc`）。

```bash
npm install
npm run dev      # 打开 http://localhost:4321
```

## 新增 SOP

1. 复制 `src/content/docs/guide/sop-template.mdx` 到对应分类目录（如 `src/content/docs/molecular/`）。
2. 修改顶部 `title`，按模板填写内容。新文件会自动出现在侧边栏。
3. 提交 Pull Request，由负责人审核后合并。

新增分类时，在 `astro.config.mjs` 的 `sidebar` 中添加一组。

## 写作语法

```md
:::danger[安全警告]
危险内容
:::

:::caution[注意]  /  :::tip[提示]  /  :::note[说明]
```

分步骤、标签页需在 `.mdx` 文件中引入组件：

```mdx
import { Steps, Tabs, TabItem } from '@astrojs/starlight/components';
```

用法见 `src/content/docs/molecular/pcr.mdx`。

## 部署到 Cloudflare

| 分支 | 用途 | 网址 |
|---|---|---|
| `main` | 正式版 | `lab-protocols.<子域>.workers.dev` |
| `experimental` | 实验预览版 | `experimental-lab-protocols.<子域>.workers.dev` |

预览版页面顶部会显示“实验预览版”提示条，并设置 `noindex` 禁止搜索引擎收录。
判断逻辑在 `astro.config.mjs`：Cloudflare 构建非 `main` 分支（`WORKERS_CI_BRANCH`），或手动设置 `SITE_ENV=preview` 时，即为预览版。

**方式一：Git 自动部署（推荐）**

在 Cloudflare 控制台 Workers & Pages → 创建 → 导入 Git 仓库，选择本仓库，然后在 Settings → Builds 中设置：

- 生产分支：`main`
- 构建命令：`npm run build`
- 部署命令：`npx wrangler deploy`
- Branch control 中勾选 Enable Preview Builds
- Preview 命令：`npx wrangler preview`（默认值）

预览使用 Cloudflare 的 [Worker Previews](https://developers.cloudflare.com/workers/previews/)，预览名默认取分支名，因此 `experimental` 分支的预览网址固定为 `experimental-lab-protocols.<子域>.workers.dev`。
`wrangler preview` 要求 `wrangler.jsonc` 中存在 `previews` 配置块（可以为空），请勿删除。

**方式二：本地命令部署**

```bash
npx wrangler login
npm run deploy           # 正式版
npm run deploy:preview   # 实验预览版
```

## 样式

- 主题样式：`src/styles/custom.css`
- 字体（Source Serif 4、思源宋体、Inter、JetBrains Mono）通过 Fontsource 打包进站点，与网站同域名加载，不依赖第三方字体服务。
