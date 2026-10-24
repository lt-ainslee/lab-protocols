// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

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
        { label: '分子生物学', items: [{ autogenerate: { directory: 'molecular' } }] },
        { label: '试剂配方', items: [{ autogenerate: { directory: 'reagents' } }] },
        { label: '模板', items: [{ autogenerate: { directory: 'guide' } }] },
      ],
      lastUpdated: false,
    }),
  ],
});
