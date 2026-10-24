# 实验室 SOP 手册

基于 [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) 的实验室标准操作规程文档站。

## 本地预览

```bash
pip install -r requirements.txt
mkdocs serve
```

浏览器打开 http://127.0.0.1:8000 。

## 新增 SOP

复制 `docs/guide/sop-template.md` 到对应目录，填写后在 `mkdocs.yml` 的 `nav` 中添加条目，提交 PR 审核。

## 部署

推送到 `main` 分支后，GitHub Actions 会自动构建并发布到 GitHub Pages（`gh-pages` 分支）。
