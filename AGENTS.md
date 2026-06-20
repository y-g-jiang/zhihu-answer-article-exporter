# AGENTS.md

## Project Mission

This project contains Jiang Yaogeng's personal homepage and a repeatable Zhihu article export pipeline.

When asked to continue the Zhihu work, preserve the same workflow:

1. Export selected Zhihu answers/articles from the authenticated local Edge profile.
2. Clean the article body into portable Markdown and HTML.
3. Compress and localize images.
4. Preserve real link cards, but remove Zhihu Direct entity links.
5. Convert Zhihu LaTeX formula nodes into renderable TeX and load MathJax in generated HTML.
6. Keep the exported article collection in `article-export-sample/articles.json`.
7. Build homepage preview pages under `public/zhihu` from a shared shell plus the article collection.
8. Build a standalone publishable article repository at `../zhihu-articles` from the same shared shell.
9. Verify generated pages in browser before reporting completion.

The articles are the user's own writing. Do not remove content merely because it came from Zhihu.

## Main Commands

Use Node directly in PowerShell when npm scripts are blocked by execution policy:

```powershell
node .\scripts\build-zhihu-targets.mjs
node .\scripts\export-zhihu-sample.mjs
node .\scripts\build-zhihu-preview-pages.mjs
node .\scripts\build-zhihu-article-repo.mjs
node .\node_modules\vite\bin\vite.js build
```

Equivalent npm scripts:

```powershell
npm run zhihu:targets
npm run export:zhihu
npm run export:zhihu:sample
npm run build:zhihu:preview
npm run build:zhihu:repo
npm run build
```

## Important Paths

- `scripts/build-zhihu-targets.mjs`: generates `data/zhihu-targets.json` from homepage source files.
- `scripts/export-zhihu-sample.mjs`: authenticated Zhihu export, body cleanup, image compression, Markdown/HTML writing.
- `scripts/zhihu-site-shell.mjs`: shared shell renderer, article-set navigation, CSS, and MathJax setup.
- `scripts/build-zhihu-preview-pages.mjs`: builds homepage-style static pages under `public/zhihu`.
- `scripts/build-zhihu-article-repo.mjs`: builds the standalone publish repo at `../zhihu-articles`.
- `data/zhihu-targets.json`: export target collection. Regenerate it instead of editing many script constants.
- `article-export-sample/`: generated export source and image artifacts.
- `article-export-sample/articles.json`: article collection manifest consumed by all page builders.
- `public/zhihu/`: homepage preview source copied into the Vite build.
- `dist/zhihu/`: production output after `vite build`.
- `../zhihu-articles/`: standalone repository folder, with `docs/` for GitHub Pages and `content/` for Markdown/HTML source.
- `qa-screenshots/`: browser verification screenshots.
- `ZHIHU_EXPORT_PIPELINE.md`: human and AI handoff manual for the full pipeline.

## Export Invariants

Keep these behaviors unless the user explicitly changes the policy:

- Use a temporary copy of the Edge profile. Do not write cookies into this repo.
- Do not publish `article-export-sample/assets/<slug>/original/` in the standalone repo. The standalone repo should contain compressed public images only.
- Preserve normal external links and exported link cards.
- Convert `https://link.zhihu.com/?target=...` links to their real target.
- Convert `a[href*="zhida.zhihu.com/search"]` and `a.RichContent-EntityWord` to plain text.
- Convert local absolute links such as `file:///C:/...` to plain text.
- Preserve article publish time at the top of exported HTML and in Markdown front matter.
- Use the current answer/article container for answer publish time. Do not accidentally use the parent question creation time.
- Convert Zhihu formula nodes:
  - source: `.ztext-math[data-tex]`
  - inline when `data-eeimg="1"`
  - display/block when `data-eeimg="2"`
  - HTML output uses `\(...\)` and `\[...\]` plus MathJax.
  - Markdown output uses `$...$` and `$$...$$`.

## Verification Checklist

After changing the pipeline, run:

```powershell
node --check .\scripts\build-zhihu-targets.mjs
node --check .\scripts\export-zhihu-sample.mjs
node --check .\scripts\zhihu-site-shell.mjs
node --check .\scripts\build-zhihu-preview-pages.mjs
node --check .\scripts\build-zhihu-article-repo.mjs
node .\scripts\build-zhihu-targets.mjs
node .\scripts\export-zhihu-sample.mjs
node .\scripts\build-zhihu-preview-pages.mjs
node .\scripts\build-zhihu-article-repo.mjs
node .\node_modules\vite\bin\vite.js build
```

On this small-memory machine, prefer:

```powershell
$env:ZHIHU_BROWSER_CONCURRENCY='2'
$env:ZHIHU_IMAGE_CONCURRENCY='6'
node .\scripts\export-zhihu-sample.mjs
```

For batch runs, use `ZHIHU_OFFSET`, `ZHIHU_LIMIT`, `ZHIHU_ONLY`, and `ZHIHU_SKIP_EXISTING=1`. The exporter merges `article-export-sample/articles.json` across runs.

Then check generated files:

```powershell
rg -n "zhida.zhihu.com|zhida_source|RichContent-EntityWord|file://|C:/Users|src=\"/zhihu|href=\"/zhihu" article-export-sample public\zhihu dist\zhihu ..\zhihu-articles
Select-String -Path ".\article-export-sample\content\*\index.md" -Pattern "^date:|\$\$"
Select-String -Path ".\public\zhihu\*\index.html",".\dist\zhihu\*\index.html" -Pattern "发布时间|MathJax|tex-svg.js|data-export-kind=""math"""
```

Use Playwright with local Edge for browser checks if the in-app browser tools are unavailable. Verify at least:

- no broken images;
- no bad links to Zhihu Direct or local `file:///` paths;
- publish time appears first in article content;
- MathJax rendered formulas, i.e. `document.querySelectorAll('mjx-container').length` matches `[data-export-kind="math"]`;
- mobile viewport does not horizontally overflow.

## Publishing Notes

The standalone repo is prepared locally at `../zhihu-articles`.

To publish manually once Git/GitHub auth is available:

```powershell
cd ..\zhihu-articles
git init -b main
git add .
git commit -m "Publish Zhihu article exports"
git remote add origin https://github.com/y-g-jiang/<repo-name>.git
git push -u origin main
```

Enable GitHub Pages from `main` / `docs`.

Do not force-push or create public GitHub repos without explicit user approval.
