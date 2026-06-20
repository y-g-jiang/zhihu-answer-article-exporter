# Zhihu Export Pipeline

This document turns the current Zhihu article work into a repeatable engineering workflow. It is written for a future AI or human maintainer who needs to export more of Jiang Yaogeng's own Zhihu writing, preview it on the personal homepage, and prepare a standalone article repository.

## Outputs

The pipeline produces three related outputs plus one generated target manifest:

0. `data/zhihu-targets.json`
   - Exportable Zhihu URL collection.
   - Generated from `constants.ts`, `contentSources.ts`, and `date-inference-results.json`.
   - Contains the local exportable article/answer targets when generated.

1. `article-export-sample/`
   - Raw export workspace inside this homepage project.
   - Contains source Markdown, source HTML, image manifests, compressed images, and original image backups.
   - `articles.json` is the article collection consumed by every page builder.

2. `public/zhihu/`
   - Homepage preview shell plus article pages.
   - These are copied into `dist/zhihu/` by Vite.
   - Visual style follows the personal homepage: GitHub-like top bar, narrow sidebar metadata, article-set navigation, restrained article panel.

3. `../zhihu-articles/`
   - Standalone publishable article repository.
   - `docs/` is suitable for GitHub Pages.
   - `content/` keeps Markdown/HTML source and image manifests.
   - `docs/assets/` contains the shared shell CSS and compressed public images only.

## Full Run

PowerShell may block npm shim scripts on this machine, so use direct Node commands when necessary:

```powershell
node --check .\scripts\build-zhihu-targets.mjs
node --check .\scripts\collect-zhihu-profile-posts.mjs
node --check .\scripts\export-zhihu-sample.mjs
node --check .\scripts\zhihu-site-shell.mjs
node --check .\scripts\build-zhihu-preview-pages.mjs
node --check .\scripts\build-zhihu-local-site.mjs
node --check .\scripts\build-zhihu-article-repo.mjs

node .\scripts\build-zhihu-targets.mjs
node .\scripts\export-zhihu-sample.mjs
node .\scripts\build-zhihu-preview-pages.mjs
node .\scripts\build-zhihu-article-repo.mjs
node .\node_modules\vite\bin\vite.js build
```

For this low-memory machine, prefer:

```powershell
$env:ZHIHU_BROWSER_CONCURRENCY='2'
$env:ZHIHU_IMAGE_CONCURRENCY='4'
node .\scripts\export-zhihu-sample.mjs
```

For batch export, use:

```powershell
$env:ZHIHU_OFFSET='0'
$env:ZHIHU_LIMIT='10'
$env:ZHIHU_SKIP_EXISTING='1'
node .\scripts\export-zhihu-sample.mjs
```

`article-export-sample/articles.json` is merged across runs, so slices can be exported without losing previous article metadata.

Equivalent npm scripts exist:

```powershell
npm run zhihu:targets
npm run targets
npm run targets:profile
npm run export:zhihu
npm run export
npm run build:local
npm run build:zhihu:preview
npm run build:preview
npm run build:zhihu:repo
npm run build:repo
npm run build
```

## Script Responsibilities

### `scripts/build-zhihu-targets.mjs`

This builds the target collection.

Responsibilities:

- Extract all Zhihu article and answer URLs from the homepage source files.
- Merge approximate dates from `date-inference-results.json`.
- Deduplicate URLs.
- Preserve stable legacy slugs for the two already-reviewed pages.
- Write `data/zhihu-targets.json`.

### `scripts/collect-zhihu-profile-posts.mjs`

This collects visible Zhihu article/answer URLs from a profile page.

Responsibilities:

- Open a Zhihu profile URL and, for `/people/<id>/posts`, also check `/answers`.
- Use a persistent local browser profile when `ZHIHU_PROFILE_INTERACTIVE=1`.
- Wait for the user to log in when `ZHIHU_PROFILE_WAIT_FOR_LOGIN=1`.
- Deep-scroll the profile while collecting answer/article URLs without loading images, fonts, or media.
- Write `<output-root>/targets.json`.

Useful environment variables:

- `ZHIHU_PROFILE_URL`: profile URL, for example `https://www.zhihu.com/people/<profile-id>/posts`.
- `ZHIHU_PROFILE_URLS`: comma-separated explicit pages to collect.
- `ZHIHU_PROFILE_OUTPUT_ROOT`: output folder, default `article-export-sample`.
- `ZHIHU_PROFILE_INTERACTIVE=1`: keep and reuse `<output-root>/browser-profile`.
- `ZHIHU_PROFILE_WAIT_FOR_LOGIN=1`: wait up to ten minutes for manual login/content access.
- `ZHIHU_PROFILE_MAX_SCROLLS` and `ZHIHU_PROFILE_STABLE_ROUNDS`: tune deep scrolling.
- `ZHIHU_PROFILE_DEBUG=1`: save profile debug JSON/screenshots locally.

### `scripts/export-zhihu-sample.mjs`

This is the main exporter.

Responsibilities:

- Launch Edge through Playwright using a temporary copy of the local logged-in profile.
- Or reuse a persistent local profile when `ZHIHU_BROWSER_PROFILE_ROOT` is set.
- Read targets from `data/zhihu-targets.json`.
- Visit each target with a small browser-page pool.
- Block heavy image/media/font resource loads in the browser by default.
- Expand collapsed Zhihu content when needed.
- Select the right article or answer body.
- Clean the body into portable HTML.
- Download and compress images through a separate global image queue.
- Write:
  - `article-export-sample/content/<slug>/index.html`
  - `article-export-sample/content/<slug>/index.md`
  - `article-export-sample/content/<slug>/images.json`
  - `article-export-sample/articles.json`
  - `article-export-sample/export-report.json`

Key target fields:

```js
{
  kind: 'answer' | 'article',
  slug: 'stable-output-folder-name',
  titleHint: 'fallback title',
  url: 'https://www.zhihu.com/...'
}
```

Do not add targets inside the exporter. Regenerate or edit `data/zhihu-targets.json`.

Important environment variables:

- `ZHIHU_BROWSER_CONCURRENCY`: concurrent browser pages, default `3`; use `2` on low-memory runs.
- `ZHIHU_IMAGE_CONCURRENCY`: global image download/compression concurrency, default `10`; use `4` to `6` on low-memory runs.
- `ZHIHU_OUTPUT_ROOT`: export workspace, default `article-export-sample`.
- `ZHIHU_TARGETS_PATH`: local target manifest path, default `data/zhihu-targets.json`.
- `ZHIHU_BROWSER_PROFILE_ROOT`: persistent Playwright/Edge profile to reuse login state.
- `ZHIHU_LIMIT` / `ZHIHU_OFFSET`: export a slice.
- `ZHIHU_ONLY`: comma-separated slugs to export.
- `ZHIHU_SKIP_EXISTING=1`: reuse existing content and refresh manifests.
- `ZHIHU_BLOCK_HEAVY_RESOURCES=0`: allow browser image/media/font loading if needed for debugging.

Short but real answers are accepted when the extractor has matched the exact answer id. This prevents concise answers from being misclassified as failed exports.

### `scripts/zhihu-site-shell.mjs`

This is the shared article shell.

Responsibilities:

- Read `article-export-sample/articles.json`.
- Normalize article metadata.
- Provide the shared top bar, sidebar metadata, article-set navigation, CSS, and MathJax setup.
- Render both the collection index and each article page.

If a future sidebar, global nav item, theme change, or layout change should apply to every article, change this shell and rebuild.

### `scripts/build-zhihu-preview-pages.mjs`

This builds homepage-style static pages from `article-export-sample/`.

Responsibilities:

- Copy assets into `public/zhihu/assets`.
- Write the shared shell CSS to `public/zhihu/assets/site.css`.
- Build one page per exported article under `public/zhihu/<slug>/index.html` through `zhihu-site-shell.mjs`.
- Build `public/zhihu/index.html`.
- Write `public/zhihu/articles.json`.
- Keep styling close to the personal homepage.
- Preserve top publish-time metadata.
- Load MathJax for formulas.

### `scripts/build-zhihu-local-site.mjs`

This builds a local static shell inside any export workspace.

Responsibilities:

- Read `<collection-root>/articles.json`.
- Copy compressed assets to `<collection-root>/docs/assets`.
- Render `docs/index.html` and one shell page per article/answer.
- Keep the article-set sidebar and scroll state behavior from `zhihu-site-shell.mjs`.

Useful environment variables:

- `ZHIHU_SITE_COLLECTION_ROOT`: export workspace, default `article-export-sample`.
- `ZHIHU_SITE_OUTPUT_DIR`: output folder name under the collection root, default `docs`.
- `ZHIHU_SITE_HOME_HREF`: topbar Homepage link, default `./`.

### `scripts/build-zhihu-article-repo.mjs`

This prepares the standalone article repository at `../zhihu-articles`.

Responsibilities:

- Recreate the output directory from scratch.
- Copy `content/<slug>/` for source Markdown/HTML.
- Build `docs/` pages through the same `zhihu-site-shell.mjs` renderer.
- Copy only compressed public images to `docs/assets/`.
- Do not copy `original/` image backups.
- Write `docs/assets/site.css` and `docs/articles.json`.
- Write `README.md`, `.gitignore`, and `docs/.nojekyll`.

GitHub Pages should be configured to serve from `main` / `docs`.

## Cleaning Rules

Keep these rules stable across future work:

### Links

Allowed:

- Normal external references.
- Link cards converted from Zhihu rich link cards.
- Real targets extracted from `https://link.zhihu.com/?target=...`.

Removed or rewritten:

- `zhida.zhihu.com/search` links become plain text.
- `a.RichContent-EntityWord` becomes plain text.
- `file:///C:/...` and `C:/...` links become plain text.

Rationale: Zhihu Direct entity links create misleading blue keywords, and local absolute links are broken after publication.

### Link Cards

Zhihu rich link cards are converted to:

```html
<a class="export-link-card"
   data-export-kind="link-card"
   data-title="..."
   data-desc="..."
   href="...">
  <span class="export-link-card-title">...</span>
  <span class="export-link-card-desc">...</span>
</a>
```

The Markdown exporter turns these into normal Markdown links instead of dropping them.

### Dates

Publish time is required at the top of exported HTML:

```html
<p class="export-meta">鍙戝竷鏃堕棿锛歒YYY-MM-DD HH:mm</p>
```

Markdown front matter must contain:

```yaml
date: YYYY-MM-DD
```

Important: for answers, do not use page-level question metadata. Use the current `.ContentItem.AnswerItem` matching the answer URL, otherwise the question creation date may be incorrectly exported.

### Images

Image handling is quality-constrained:

- Original downloaded files are kept in `article-export-sample/assets/<slug>/original/`.
- Photo-like images are encoded as WebP quality 82, effort 6.
- Long edge is capped at 2200 px.
- Non-photo images become optimized palette PNG.
- If compression is not at least about 2 percent smaller, keep the source image.
- Standalone `../zhihu-articles` publishes only compressed images, not the `original/` backup folders.

## Zhihu Formula Rendering

Zhihu stores formulas as HTML nodes like:

```html
<span class="ztext-math" data-eeimg="1" data-tex="...">
  <span class="tex2jax_ignore math-holder">...</span>
</span>
```

Exporter rule:

- Read `.ztext-math[data-tex]`.
- Normalize whitespace.
- Remove trailing `\\` linebreak markers.
- Treat `data-eeimg="1"` as inline math.
- Treat `data-eeimg="2"` as display math.

Generated HTML:

```html
<span class="export-math export-math-inline"
      data-export-kind="math"
      data-display="false"
      data-tex="...">\( ... \)</span>

<span class="export-math export-math-display"
      data-export-kind="math"
      data-display="true"
      data-tex="...">\[ ... \]</span>
```

Generated Markdown:

```markdown
$...$

$$
...
$$
```

Generated HTML pages include MathJax:

```html
<script>
  window.MathJax = {
    tex: {
      inlineMath: [['\\(', '\\)']],
      displayMath: [['\\[', '\\]']],
      processEscapes: true
    },
    svg: { fontCache: 'global' },
    options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] }
  };
</script>
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
```

CSS keeps display formulas readable on mobile:

```css
.export-math-display {
  display: block;
  max-width: 100%;
  margin: 1rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}

mjx-container {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}
```

## Browser Verification

If the in-app browser tool is not available, use Playwright with local Edge:

```powershell
@'
const { chromium } = require('playwright');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://127.0.0.1:4174/zhihu/<article-slug>/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.MathJax?.startup?.promise, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => window.MathJax?.typesetPromise?.()).catch(() => {});
  await page.waitForTimeout(1000);
  console.log(await page.evaluate(() => ({
    mathSourceCount: document.querySelectorAll('[data-export-kind="math"]').length,
    mathJaxCount: document.querySelectorAll('mjx-container').length,
    brokenImages: Array.from(document.images).filter((img) => !img.complete || img.naturalWidth === 0).length,
    badLinks: Array.from(document.querySelectorAll('a')).filter((a) => /zhida\.zhihu\.com|file:|C:\/Users/.test(a.href)).length,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  })));
  await browser.close();
})();
'@ | node -
```

Expected for the current formula-heavy article:

- `mathSourceCount = 21`
- `mathJaxCount = 21`
- `brokenImages = 0`
- `badLinks = 0`
- desktop `scrollWidth = clientWidth`
- mobile `scrollWidth = clientWidth`

## Local Preview Servers

Local collection preview:

```powershell
python -m http.server 4185 --bind 127.0.0.1 --directory .\article-export-sample\docs
```

Standalone repo docs preview:

```powershell
python -m http.server 4186 --bind 127.0.0.1 --directory ..\zhihu-articles\docs
```


If `build:zhihu:repo` fails with `EBUSY`, stop the Python server because it may be holding `../zhihu-articles/docs`.

## Publishing

The machine may not have Git or GitHub CLI. If Git becomes available:

```powershell
cd ..\zhihu-articles
git init -b main
git add .
git commit -m "Publish Zhihu article exports"
git remote add origin https://github.com/y-g-jiang/<repo-name>.git
git push -u origin main
```

Then enable GitHub Pages from:

```text
branch: main
folder: /docs
```

Do not create or publish a public remote repository without explicit confirmation from the user.

## Known Current Pages

Current generated page URLs during local validation:

- Homepage list: `http://127.0.0.1:4174/#zhihu-preview`
- Homepage answer preview: `http://127.0.0.1:4174/zhihu/<answer-slug>/`
- Homepage article preview: `http://127.0.0.1:4174/zhihu/<article-slug>/`
- Standalone repo list: `http://127.0.0.1:4185/`
- Standalone repo article: `http://127.0.0.1:4185/<article-slug>/`
