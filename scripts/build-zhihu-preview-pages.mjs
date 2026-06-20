import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sampleRoot = path.join(repoRoot, 'article-export-sample');
const publicRoot = path.join(repoRoot, 'public', 'zhihu');

const pages = [
  {
    slug: 'answer-100gm-decenter-simulation',
    kind: 'Answer',
    label: 'Zhihu Answer',
    url: 'https://www.zhihu.com/question/300139587/answer/2038319263958741552',
  },
  {
    slug: 'article-color-bit-depth',
    kind: 'Article',
    label: 'Zhihu Column',
    url: 'https://zhuanlan.zhihu.com/p/2049616049604244194',
  },
];

const ensureDir = (dir) => fs.mkdir(dir, { recursive: true });

const stripBody = (html) => {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1].trim() : html;
};

const stripTitle = (html) => {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return match?.[1]?.replace(/<[^>]+>/g, '').trim() || 'Zhihu Export';
};

const bodyWithoutGeneratedHeader = (html) =>
  stripBody(html)
    .replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '')
    .replace(/\s*<p>\s*<a[^>]+>(?:知乎原文|鐭ヤ箮鍘熸枃)<\/a>\s*<\/p>\s*/i, '\n')
    .replaceAll('../../assets/', '../assets/')
    .replaceAll('src="../assets/', 'src="/zhihu/assets/');

const buildPage = ({ title, kind, label, url, body, imageCount }) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} - Jiang Yaogeng</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #ffffff;
      --canvas: #f6f8fa;
      --panel: #ffffff;
      --border: #d8dee4;
      --border-muted: #eaeef2;
      --text: #24292f;
      --muted: #57606a;
      --accent: #0969da;
      --success: #1a7f37;
      --shadow: 0 8px 24px rgba(140, 149, 159, 0.18);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", Helvetica, Arial, sans-serif;
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; background: var(--bg); color: var(--text); }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { display: block; max-width: 100%; height: auto; border-radius: 6px; }

    .github-topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      min-height: 64px;
      padding: 0 24px;
      border-bottom: 1px solid var(--border);
      background: rgba(246, 248, 250, 0.92);
      backdrop-filter: blur(12px);
    }

    .topbar-brand {
      color: var(--text);
      font-weight: 700;
    }

    .topbar-nav {
      display: flex;
      gap: 0.25rem;
      align-items: center;
    }

    .topbar-nav a {
      display: inline-flex;
      align-items: center;
      min-height: 36px;
      padding: 0 0.75rem;
      border-radius: 6px;
      color: var(--text);
      font-size: 0.92rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .topbar-nav a:hover {
      background: rgba(208, 215, 222, 0.32);
      text-decoration: none;
    }

    .page-layout {
      display: grid;
      grid-template-columns: minmax(220px, 296px) minmax(0, 860px);
      gap: 32px;
      width: min(1212px, 100%);
      margin: 0 auto;
      padding: 32px 24px 48px;
    }

    .meta-sidebar {
      min-width: 0;
    }

    .meta-card,
    .article-panel {
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--panel);
    }

    .meta-card {
      display: grid;
      gap: 1rem;
      padding: 16px;
    }

    .meta-eyebrow {
      display: inline-flex;
      width: fit-content;
      padding: 0.16rem 0.5rem;
      border: 1px solid #aceebb;
      border-radius: 999px;
      background: #dafbe1;
      color: #116329;
      font-size: 0.72rem;
      font-weight: 800;
    }

    .meta-card h1 {
      margin: 0;
      color: var(--text);
      font-size: 1.35rem;
      line-height: 1.25;
      letter-spacing: 0;
    }

    .meta-list {
      display: grid;
      gap: 0.6rem;
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--muted);
      font-size: 0.86rem;
    }

    .meta-list strong {
      display: block;
      margin-top: 0.1rem;
      color: var(--text);
      font-size: 0.95rem;
    }

    .article-panel {
      overflow: hidden;
      min-width: 0;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      min-height: 48px;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--border);
      background: var(--canvas);
      color: var(--text);
      font-size: 0.92rem;
      font-weight: 700;
    }

    .panel-header span:last-child {
      color: var(--muted);
      font-weight: 600;
    }

    .article-content {
      padding: 28px;
      font-size: 16px;
      line-height: 1.78;
    }

    .article-content h1,
    .article-content h2,
    .article-content h3 {
      margin: 1.45rem 0 0.75rem;
      line-height: 1.35;
      letter-spacing: 0;
    }

    .article-content h2 {
      padding-bottom: 0.35rem;
      border-bottom: 1px solid var(--border-muted);
      font-size: 1.45rem;
    }

    .article-content p {
      margin: 0.9rem 0;
      overflow-wrap: anywhere;
    }

    .article-content .export-meta {
      margin: 0 0 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border-muted);
      color: var(--muted);
      font-size: 0.9rem;
      font-weight: 700;
    }

    .article-content .export-math-display {
      display: block;
      max-width: 100%;
      margin: 1rem 0;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .article-content .export-math-inline {
      display: inline;
    }

    .article-content mjx-container {
      max-width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .article-content figure {
      margin: 1.15rem 0;
      padding: 0;
    }

    .article-content figure img,
    .article-content p > img {
      border: 1px solid var(--border-muted);
      background: var(--canvas);
    }

    .article-content blockquote {
      margin: 1rem 0;
      padding-left: 1rem;
      border-left: 4px solid var(--border);
      color: var(--muted);
    }

    .article-content .RichText-LinkCardContainer {
      margin: 1rem 0;
    }

    .article-content .export-link-card {
      display: grid;
      gap: 0.22rem;
      max-width: 520px;
      min-height: 76px;
      margin: 0.9rem auto;
      padding: 14px 18px;
      border: 1px solid var(--border-muted);
      border-radius: 8px;
      background: var(--canvas);
      color: var(--text);
      text-decoration: none;
    }

    .article-content .export-link-card:hover {
      border-color: #afb8c1;
      background: #f3f4f6;
      text-decoration: none;
    }

    .article-content .export-link-card-title {
      color: var(--text);
      font-size: 1.05rem;
      font-weight: 700;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    .article-content .export-link-card-desc {
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .article-content code,
    .article-content pre {
      background: var(--canvas);
    }

    .article-content pre {
      overflow: auto;
      padding: 12px;
      border-radius: 6px;
    }

    .page-footer {
      width: min(1212px, 100%);
      margin: 0 auto;
      padding: 18px 24px 34px;
      border-top: 1px solid var(--border-muted);
      color: var(--muted);
      font-size: 0.84rem;
    }

    @media (max-width: 900px) {
      .page-layout {
        grid-template-columns: 1fr;
        gap: 18px;
        padding: 24px 16px 36px;
      }

      .github-topbar {
        flex-direction: column;
        align-items: flex-start;
        padding: 12px 16px;
      }

      .topbar-nav {
        width: 100%;
        overflow-x: auto;
      }

      .article-content {
        padding: 18px;
      }
    }
  </style>
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['\\\\(', '\\\\)']],
        displayMath: [['\\\\[', '\\\\]']],
        processEscapes: true
      },
      svg: { fontCache: 'global' },
      options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] }
    };
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
</head>
<body>
  <header class="github-topbar">
    <a class="topbar-brand" href="/">README_姜尧耕</a>
    <nav class="topbar-nav" aria-label="Article navigation">
      <a href="/">Homepage</a>
      <a href="/#zhihu-preview">Preview List</a>
      <a href="${url}" target="_blank" rel="noopener noreferrer">Original</a>
    </nav>
  </header>

  <main class="page-layout">
    <aside class="meta-sidebar">
      <section class="meta-card">
        <span class="meta-eyebrow">${label}</span>
        <h1>${title}</h1>
        <ul class="meta-list">
          <li>Source<strong>Zhihu ${kind}</strong></li>
          <li>Assets<strong>${imageCount} compressed images</strong></li>
          <li>Owner<strong>Jiang Yaogeng</strong></li>
        </ul>
      </section>
    </aside>

    <article class="article-panel">
      <div class="panel-header">
        <span>${title}</span>
        <span>${kind}</span>
      </div>
      <div class="article-content">
        ${body}
      </div>
    </article>
  </main>

  <footer class="page-footer">Generated from local Zhihu export sample. Originals are kept in the project export folder.</footer>
</body>
</html>
`;

const buildIndex = (items) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Zhihu Preview - Jiang Yaogeng</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif; background: #fff; color: #24292f; }
    main { width: min(920px, 100%); margin: 0 auto; padding: 40px 20px; }
    h1 { margin: 0 0 18px; font-size: 28px; }
    a { color: #0969da; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .list { display: grid; gap: 12px; }
    .card { display: grid; gap: 8px; padding: 16px; border: 1px solid #d8dee4; border-radius: 6px; background: #fff; }
    .card span { color: #57606a; font-size: 13px; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>Zhihu Preview</h1>
    <div class="list">
      ${items
        .map(
          (item) => `<a class="card" href="/zhihu/${item.slug}/">
        <span>${item.label}</span>
        <strong>${item.title}</strong>
      </a>`
        )
        .join('\n')}
    </div>
  </main>
</body>
</html>
`;

const run = async () => {
  await fs.rm(publicRoot, { recursive: true, force: true });
  await ensureDir(publicRoot);
  await fs.cp(path.join(sampleRoot, 'assets'), path.join(publicRoot, 'assets'), { recursive: true });

  const builtPages = [];
  for (const page of pages) {
    const contentDir = path.join(sampleRoot, 'content', page.slug);
    const sourceHtml = await fs.readFile(path.join(contentDir, 'index.html'), 'utf8');
    const images = JSON.parse(await fs.readFile(path.join(contentDir, 'images.json'), 'utf8'));
    const title = stripTitle(sourceHtml);
    const body = bodyWithoutGeneratedHeader(sourceHtml);
    const outputDir = path.join(publicRoot, page.slug);
    await ensureDir(outputDir);
    await fs.writeFile(
      path.join(outputDir, 'index.html'),
      buildPage({
        ...page,
        title,
        body,
        imageCount: images.filter((image) => image.ok).length,
      }),
      'utf8'
    );
    builtPages.push({ ...page, title });
  }

  await fs.writeFile(path.join(publicRoot, 'index.html'), buildIndex(builtPages), 'utf8');
  console.log(`Built ${builtPages.length} Zhihu preview pages in ${path.relative(repoRoot, publicRoot)}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
