// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// 预览版：手动设置 SITE_ENV=preview，或在 Cloudflare Workers Builds 中构建非 main 分支
const branch = process.env.WORKERS_CI_BRANCH;
const isPreview = process.env.SITE_ENV === 'preview' || (branch !== undefined && branch !== 'main');

export default defineConfig({
  integrations: [
    starlight({
      title: '实验室 SOP 手册',
      description: '课题组标准操作规程（SOP）',
      logo: { src: './src/assets/flask.svg' },
      defaultLocale: 'root',
      locales: {
        root: { label: '简体中文', lang: 'zh-CN' },
      },
      customCss: [
        '@fontsource-variable/source-serif-4/opsz.css',
        '@fontsource-variable/source-serif-4/opsz-italic.css',
        '@fontsource/noto-serif-sc/400.css',
        '@fontsource/noto-serif-sc/600.css',
        '@fontsource/noto-serif-sc/700.css',
        '@fontsource/inter/400.css',
        '@fontsource/inter/500.css',
        '@fontsource/inter/600.css',
        '@fontsource/jetbrains-mono/400.css',
        './src/styles/custom.css',
      ],
      sidebar: [
        { label: '安全规范', items: [{ autogenerate: { directory: 'safety' } }] },
        { label: 'NCA 单体合成', items: [{ autogenerate: { directory: 'synthesis' } }] },
        { label: '模板', items: [{ autogenerate: { directory: 'guide' } }] },
      ],
      lastUpdated: false,
      components: {
        Banner: './src/components/Banner.astro',
      },
      head: isPreview ? [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' } }] : [],
    }),
  ],
  vite: {
    define: {
      __PREVIEW__: JSON.stringify(isPreview),
      __BRANCH__: JSON.stringify(branch ?? ''),
    },
  },
});
