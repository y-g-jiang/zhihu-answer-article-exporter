# zhihu-answer-article-exporter

Repeatable exporter for a user's own Zhihu answers/articles.

This repository contains the engineering workflow only. It intentionally does not publish exported article bodies, generated pages, image assets, or a concrete target manifest.

## What It Does

- captures Zhihu pages from a logged-in local Edge profile;
- cleans Zhihu-specific HTML into portable HTML and Markdown;
- preserves ordinary links and rich link cards;
- removes Zhihu Direct/entity links and local file links;
- downloads and compresses images into local assets;
- converts Zhihu LaTeX nodes into MathJax-renderable TeX;
- builds a shared shell plus an article collection so global layout changes apply to every exported page.

## Private Local Inputs And Outputs

These paths are generated or user-specific and are ignored by the publishing script:

- `data/zhihu-targets.json`
- `data/slug-overrides.local.json`
- `article-export-sample/`
- `public/`
- `docs/`
- `content/`
- `dist/`

Create `data/zhihu-targets.json` locally with records like:

```json
{
  "targets": [
    {
      "kind": "article",
      "slug": "my-private-slug",
      "titleHint": "Optional fallback title",
      "url": "https://zhuanlan.zhihu.com/p/..."
    }
  ]
}
```

## Commands

```powershell
npm install
npm run check
npm run export
npm run build
```

When PowerShell blocks npm shims, use direct Node commands:

```powershell
node --check .\scripts\build-zhihu-targets.mjs
node --check .\scripts\export-zhihu-sample.mjs
node --check .\scripts\zhihu-site-shell.mjs
node --check .\scripts\build-zhihu-preview-pages.mjs
node --check .\scripts\build-zhihu-article-repo.mjs
```

Low-memory export:

```powershell
$env:ZHIHU_BROWSER_CONCURRENCY='2'
$env:ZHIHU_IMAGE_CONCURRENCY='6'
$env:ZHIHU_SKIP_EXISTING='1'
node .\scripts\export-zhihu-sample.mjs
```

Batch export:

```powershell
$env:ZHIHU_OFFSET='0'
$env:ZHIHU_LIMIT='10'
$env:ZHIHU_SKIP_EXISTING='1'
node .\scripts\export-zhihu-sample.mjs
```

## Local Preview

After exporting and building locally:

```powershell
python -m http.server 4185 --bind 127.0.0.1 --directory ..\zhihu-articles\docs
```

Open:

- `http://127.0.0.1:4185/`
- `http://127.0.0.1:4185/<article-slug>/`

## Publishing This Engineering Repo

`scripts/publish-github.mjs` uploads only source scripts, docs, and config. It skips generated article content and target manifests even if those folders exist locally.

```powershell
$env:GITHUB_TOKEN='...'
npm run publish:github
```

Read [ZHIHU_EXPORT_PIPELINE.md](ZHIHU_EXPORT_PIPELINE.md) before changing the exporter.
