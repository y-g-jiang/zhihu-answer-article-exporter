# zhihu-answer-article-exporter

Repeatable exporter for Jiang Yaogeng's own Zhihu answers/articles.

It captures selected Zhihu pages from a logged-in local Edge profile, cleans Zhihu-specific HTML, compresses images, converts Zhihu LaTeX formula nodes into MathJax-renderable TeX, and emits both source files and GitHub Pages-ready static pages.

## Current Pages

- [如何判断镜头光轴有偏移？](docs/answer-100gm-decenter-simulation/) - Zhihu Answer, 2026-05-14, 6 images
- [相机史诗级智商税：色彩位深-bit数](docs/article-color-bit-depth/) - Zhihu Article, 2026-06-15, 8 images

## Structure

- `scripts/`: exporter and build scripts.
- `article-export-sample/`: generated source Markdown/HTML, image manifests, and compressed sample assets.
- `public/zhihu/`: homepage-style preview pages.
- `docs/`: standalone GitHub Pages output.
- `content/`: publishable source Markdown/HTML copied beside `docs/`.
- `AGENTS.md`: instructions for future AI agents.
- `ZHIHU_EXPORT_PIPELINE.md`: full engineering handoff manual.
- `zhihu-pipeline.manifest.json`: machine-readable workflow manifest.

## Commands

```powershell
npm install
npm run check
npm run export
npm run build
```

When PowerShell blocks npm shims, use direct Node commands:

```powershell
node --check .\scripts\export-zhihu-sample.mjs
node --check .\scripts\build-zhihu-preview-pages.mjs
node --check .\scripts\build-zhihu-article-repo.mjs
node .\scripts\export-zhihu-sample.mjs
node .\scripts\build-zhihu-preview-pages.mjs
node .\scripts\build-zhihu-article-repo.mjs
```

## Local Preview

Serve `docs/` as a static site:

```powershell
python -m http.server 4185 --bind 127.0.0.1
```

Open:

- `http://127.0.0.1:4185/`
- `http://127.0.0.1:4185/article-color-bit-depth/`

## Publishing

Enable GitHub Pages from `main` / `docs`.

Read [ZHIHU_EXPORT_PIPELINE.md](ZHIHU_EXPORT_PIPELINE.md) before changing the exporter. It documents the required cleanup rules, formula conversion policy, and browser verification checks.
