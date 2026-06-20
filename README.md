# zhihu-answer-article-exporter

Repeatable exporter for a user's own Zhihu answers/articles.

This repository contains the engineering workflow only. It intentionally does not publish exported article bodies, generated pages, image assets, or a concrete target manifest.

## What It Does

- captures Zhihu pages from a logged-in local Edge profile;
- can keep a dedicated Playwright/Edge profile for repeated authenticated exports;
- can collect visible article/answer URLs from a Zhihu profile posts/answers page;
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
node --check .\scripts\collect-zhihu-profile-posts.mjs
node --check .\scripts\export-zhihu-sample.mjs
node --check .\scripts\zhihu-site-shell.mjs
node --check .\scripts\build-zhihu-preview-pages.mjs
node --check .\scripts\build-zhihu-local-site.mjs
node --check .\scripts\build-zhihu-article-repo.mjs
```

## Collect From A Profile

Use a dedicated browser profile when Zhihu needs an interactive login. The profile stays local and is ignored by the publishing script.

```powershell
$env:ZHIHU_PROFILE_URL='https://www.zhihu.com/people/<profile-id>/posts'
$env:ZHIHU_PROFILE_OUTPUT_ROOT='..\my-zhihu-export'
$env:ZHIHU_PROFILE_INTERACTIVE='1'
$env:ZHIHU_PROFILE_WAIT_FOR_LOGIN='1'
$env:ZHIHU_PROFILE_MAX_SCROLLS='420'
$env:ZHIHU_PROFILE_STABLE_ROUNDS='30'
node .\scripts\collect-zhihu-profile-posts.mjs
```

This writes `targets.json` under `ZHIHU_PROFILE_OUTPUT_ROOT` and, for normal profile URLs, checks both `/posts` and `/answers`.

Low-memory export:

```powershell
$env:ZHIHU_OUTPUT_ROOT='..\my-zhihu-export'
$env:ZHIHU_TARGETS_PATH='..\my-zhihu-export\targets.json'
$env:ZHIHU_BROWSER_PROFILE_ROOT='..\my-zhihu-export\browser-profile'
$env:ZHIHU_BROWSER_CONCURRENCY='2'
$env:ZHIHU_IMAGE_CONCURRENCY='4'
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

Build a local shell plus article collection without touching the homepage preview:

```powershell
$env:ZHIHU_SITE_COLLECTION_ROOT='..\my-zhihu-export'
node .\scripts\build-zhihu-local-site.mjs
```

Then serve the generated `docs/` folder:

```powershell
python -m http.server 4185 --bind 127.0.0.1 --directory ..\my-zhihu-export\docs
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
