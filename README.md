# 实验室 SOP 手册

基于 [Astro Starlight](https://starlight.astro.build/) 的实验室标准操作规程文档站，部署在 Cloudflare。

## 本地预览

需要 Node.js 22.23.4 及以上（推荐 24，见 `.nvmrc`）。

```bash
npm install
npm run dev      # 打开 http://localhost:4321
```

## 新增 SOP

1. 复制 `src/content/docs/guide/sop-template.mdx` 到对应分类目录（如 `src/content/docs/synthesis/`）。
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

用法见 `src/content/docs/synthesis/his-trt-nca.mdx`。

## 化学结构式

结构式统一用 SVG 图片，在 `.mdx` 文件中通过 `Structure` 组件插入（`.md` 文件需先改名为 `.mdx`）：

```mdx
import Structure from '../../../components/Structure.astro';
import tris from '../../../assets/structures/tris.svg';

<Structure src={tris} alt="Tris 结构式" caption="Tris（三羟甲基氨基甲烷）" width={220} />
```

- `alt` 必填；`caption` 为图注，可省略；`width` 为显示宽度（像素），省略时用 SVG 原始宽度。
- 用 ChemDraw、[Ketcher](https://lifescience.opensource.epam.com/KetcherDemo/index.html) 或 ChemSketch 绘制，导出为 SVG，保存到 `src/assets/structures/`，文件名用小写英文加连字符（如 `edta-disodium.svg`）。
- 导出时用**黑色线条、透明背景**、不着色杂原子。深色模式下网站会把图片整体反色为白线，带颜色或白色背景的图在深色模式下会显示异常。
- 源文件（`.cdxml` 或 `.mol`）与 SVG 同名放在同一目录并一起提交，方便以后修改。
- 示例文件见 `src/assets/structures/tris.svg` 和 `tris.mol`。

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
`wrangler.jsonc` 中的 `build.command` 让 wrangler 在部署和预览前自动构建 `dist/`；新分支的 Preview 构建不会执行控制台里的构建命令，请勿删除。

**方式二：本地命令部署**

```bash
npx wrangler login
npm run deploy           # 正式版
npm run deploy:preview   # 实验预览版
```

## 批注

在 SOP 正文中选中文字即可添加批注，右下角「批注」按钮打开批注面板，可以回复、标记已解决、删除自己的批注。

- 接口：Worker（`worker/`）提供 `/api/annotations`，其余请求返回静态页面。
- 数据：存放在 D1 数据库，正式版用 `lab-protocols-db`，预览版用 `lab-protocols-db-preview`，互不影响。数据表由 Worker 自动创建（`worker/schema.ts`）。
- 身份：SOP 页面公开，不登录也能看；批注只对登录用户显示。批注面板里的「登录」按钮跳到 `/api/login`，这个路径受 Cloudflare Access 保护，登录后回到原页面。Access 留下的 `CF_Authorization` cookie 作用于整个域名，Worker 校验其中的令牌（签名、AUD、签发方、有效期），批注署名为登录邮箱。
- 安全：写操作只接受本站页面发出的请求（校验 `Origin`），防止别的网站借用登录 cookie。

### 开启 Cloudflare Access

正式版只保护登录路径，预览版整站保护：

1. **正式版**：Zero Trust → Access → Applications → Add an application → **Self-hosted**，在同一个应用里添加两个目标，路径都填 `api/login`：
   - `lab-protocols.ainslee-lt.cn/api/login`
   - `lab-protocols.litao2235466690.workers.dev/api/login`

   策略选 **Allow**，Include → Emails ending in → `@ainslee-lt.cn`。登录方式开启 One-time PIN。应用设置里**不要开启 Cookie Path Attribute**，否则登录 cookie 只在 `/api/login` 下有效，其他页面认不出登录身份。
2. **预览版**：Workers & Pages → `lab-protocols` → Settings → Domains & Routes，在 Preview URLs 上开启 Cloudflare Access（Worker Access「Previews only」），整个预览网址都要求登录。
3. 在两个应用里分别记下 Audience (AUD) Tag。团队域名为 `ainslee-lt.cloudflareaccess.com`。
4. 填入 `wrangler.jsonc` 的 `vars` 和 `previews.vars`：`ACCESS_TEAM_DOMAIN` 填团队域名，`ACCESS_AUD` 填 AUD，多个应用用逗号分隔。提交后自动部署生效。

检查：无痕窗口打开网站应能直接浏览；点「批注」→「登录」应跳到 Access 登录页，登录后 `/api/me` 显示自己的邮箱。如果点「登录」后提示「登录未配置」，说明这个域名的 `/api/login` 没有被 Access 保护。

### 批注转为 GitHub issue，由 Claude 修改

需要改 SOP 的批注，在批注卡片上点「转为 issue」。这样会在本仓库开一个 issue，内容包括页面、源文件路径、引用的原文和上下文，以及批注和全部回复。署名只用邮箱 `@` 前面的部分。issue 带 `annotation` 和 `claude` 两个标签，GitHub Action（`.github/workflows/claude.yml`）收到 `claude` 标签后，由 Claude 按 issue 修改 SOP。它会从 `experimental` 拉出 `claude/` 分支并提交，然后在 issue 里回复改动说明和「Create PR」链接。点开这个链接，就能创建合并到 `experimental` 的 PR。

- 不想让 Claude 自动处理时，从 `GITHUB_ISSUE_LABELS` 里去掉 `claude`，以后需要时再给 issue 手动加上这个标签。
- 在 issue 或 PR 评论里写 `@claude` 加说明，可以让 Claude 继续修改。批注原文里的 `@` 会被转义，不会触发 Claude。
- 一条批注只能转一次。转过之后，卡片上会显示 issue 链接。

一次性配置：

1. **GitHub token（给 Worker 建 issue 用）**：GitHub → Settings → Developer settings → Fine-grained tokens，仓库只选本仓库，权限选 Issues: Read and write。然后设置成 Worker 密钥，正式版和预览版都要设置：

   ```bash
   npx wrangler secret put GITHUB_TOKEN                      # 正式版
   npx wrangler preview base-config secret put GITHUB_TOKEN  # 之后新建的 Preview
   npx wrangler preview secret put GITHUB_TOKEN --name experimental  # 已存在的 experimental Preview
   ```

   没有设置时不显示「转为 issue」按钮。仓库和标签在 `wrangler.jsonc` 的 `vars` 和 `previews.vars` 里配置（`GITHUB_REPO`、`GITHUB_ISSUE_LABELS`）。
2. **Claude 的凭据**：在本地 Claude Code 里运行 `/install-github-app`，按提示安装 Claude GitHub App，并生成 `CLAUDE_CODE_OAUTH_TOKEN`（使用订阅额度）。也可以在仓库 Settings → Secrets and variables → Actions 里手动添加 `ANTHROPIC_API_KEY`（按 API 用量计费）。二选一即可。
3. workflow 只在合并到 `main` 后生效（GitHub 只运行默认分支上的 issue 类 workflow）。
4. 建议在仓库 Settings → General 里勾选「Automatically delete head branches」。这样 PR 合并后会自动删除 `claude/` 分支，Cloudflare 上对应的 Preview 也会一并清理。

### 本地调试

```bash
echo 'DEV_USER=me@example.com' > .dev.vars   # 本地模拟登录用户，不会被提交或部署
npm run dev:worker                            # http://127.0.0.1:8787，使用本地模拟的 D1
npm run typecheck
```

## 样式

- 主题样式：`src/styles/custom.css`
- 字体（Source Serif 4、思源宋体、Inter、JetBrains Mono）通过 Fontsource 打包进站点，与网站同域名加载，不依赖第三方字体服务。
