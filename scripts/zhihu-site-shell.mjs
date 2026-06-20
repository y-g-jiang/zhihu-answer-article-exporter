import fs from 'node:fs/promises';
import path from 'node:path';

export const ensureDir = (dir) => fs.mkdir(dir, { recursive: true });
export const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

export const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const stripBody = (html) => {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1].trim() : html;
};

export const stripTitle = (html) => {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return match?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || 'Zhihu Article';
};

export const dateOnly = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  const match = String(value).match(/^(\d{4})[.-](\d{1,2})(?:[.-](\d{1,2}))?/);
  if (!match) {
    return String(value).slice(0, 10);
  }

  return `${match[1]}-${match[2].padStart(2, '0')}-${(match[3] ?? '01').padStart(2, '0')}`;
};

export const normalizeArticle = (article) => ({
  ok: article.ok !== false,
  kind: article.kind === 'answer' ? 'answer' : 'article',
  label: article.label || (article.kind === 'answer' ? 'Zhihu Answer' : 'Zhihu Article'),
  slug: article.slug,
  url: article.url,
  zhihuId: article.zhihuId ?? null,
  title: article.title || article.titleHint || article.slug || 'Zhihu Article',
  publishedAt: article.publishedAt ?? null,
  modifiedAt: article.modifiedAt ?? null,
  date: article.date || dateOnly(article.publishedAt) || dateOnly(article.dateHint) || null,
  markdown: article.markdown ?? (article.slug ? `content/${article.slug}/index.md` : null),
  html: article.html ?? (article.slug ? `content/${article.slug}/index.html` : null),
  imageCount: article.imageCount ?? null,
  imageOkCount: article.imageOkCount ?? null,
  imageOriginalBytes: article.imageOriginalBytes ?? null,
  imageOutputBytes: article.imageOutputBytes ?? null,
  textLength: article.textLength ?? null,
  error: article.error ?? null,
  skipped: article.skipped ?? false,
});

export const sortArticles = (articles) =>
  [...articles].sort((a, b) => {
    const dateCompare = String(b.date ?? '').localeCompare(String(a.date ?? ''));
    return dateCompare || String(a.slug).localeCompare(String(b.slug));
  });

export const readArticleCollection = async (sampleRoot) => {
  const manifestPath = path.join(sampleRoot, 'articles.json');
  const reportPath = path.join(sampleRoot, 'export-report.json');

  try {
    const manifest = await readJson(manifestPath);
    return sortArticles((manifest.articles ?? manifest).map(normalizeArticle));
  } catch {
    // Fall through to the older export report shape.
  }

  try {
    const report = await readJson(reportPath);
    return sortArticles((report.results ?? []).map(normalizeArticle));
  } catch {
    // Fall through to scanning content folders.
  }

  const contentRoot = path.join(sampleRoot, 'content');
  const entries = await fs.readdir(contentRoot, { withFileTypes: true }).catch(() => []);
  const articles = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sourceHtml = await fs.readFile(path.join(contentRoot, entry.name, 'index.html'), 'utf8').catch(() => null);
    const failed = await fs.readFile(path.join(contentRoot, entry.name, 'FAILED.json'), 'utf8').catch(() => null);

    if (sourceHtml) {
      articles.push(
        normalizeArticle({
          ok: true,
          slug: entry.name,
          kind: entry.name.startsWith('answer-') ? 'answer' : 'article',
          title: stripTitle(sourceHtml),
        })
      );
    } else if (failed) {
      const item = JSON.parse(failed);
      articles.push(
        normalizeArticle({
          ok: false,
          ...item.target,
          error: item.error,
        })
      );
    }
  }

  return sortArticles(articles);
};

export const readArticleBody = (sourceHtml, imageAssetPrefix) =>
  stripBody(sourceHtml)
    .replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '')
    .replace(/\s*<p>\s*<a[^>]+>\s*(?:知乎原文|鐭[^<]*|Zhihu Original)[\s\S]*?<\/a>\s*<\/p>\s*/i, '\n')
    .replaceAll('../../assets/', imageAssetPrefix);

export const siteCss = `:root {
  color-scheme: light;
  --bg: #ffffff;
  --canvas: #f6f8fa;
  --panel: #ffffff;
  --border: #d8dee4;
  --border-muted: #eaeef2;
  --text: #24292f;
  --muted: #57606a;
  --accent: #0969da;
  --accent-soft: #ddf4ff;
  --success: #1a7f37;
  --warning: #9a6700;
  --danger: #cf222e;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", Helvetica, Arial, sans-serif;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--text); }
.article-shell,
.article-shell body,
.article-page {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.article-page {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}
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
  background: rgba(246, 248, 250, 0.94);
  backdrop-filter: blur(12px);
}

.topbar-brand { color: var(--text); font-weight: 700; }
.article-set-toggle {
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--text);
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
}
.article-set-toggle:hover { background: rgba(208, 215, 222, 0.34); }
.article-set-backdrop { display: none; }
.topbar-nav { display: flex; gap: 0.25rem; align-items: center; overflow-x: auto; }
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
.topbar-nav a:hover { background: rgba(208, 215, 222, 0.34); text-decoration: none; }

.page-layout {
  display: grid;
  grid-template-columns: minmax(232px, 304px) minmax(0, 880px);
  gap: 28px;
  width: min(1232px, 100%);
  margin: 0 auto;
  padding: 28px 24px 48px;
}
.article-page .page-layout {
  height: 100%;
  max-height: 100%;
  padding-bottom: 0;
  overflow: hidden;
}

.meta-sidebar {
  position: relative;
  align-self: start;
  min-width: 0;
  display: grid;
  align-content: start;
  height: var(--article-shell-height, calc(100vh - 92px));
  max-height: var(--article-shell-height, calc(100vh - 92px));
}
.shell-section, .article-panel {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
}
.shell-section { padding: 14px; }
.article-set-section {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}
.shell-section h2 {
  margin: 0 0 0.65rem;
  font-size: 0.9rem;
  line-height: 1.3;
  letter-spacing: 0;
}
.collection-nav {
  display: grid;
  gap: 2px;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.collection-nav a, .collection-nav span {
  display: grid;
  gap: 0.18rem;
  padding: 0.44rem 0.52rem;
  border-radius: 6px;
  color: var(--text);
}
.collection-nav a:hover { background: var(--canvas); text-decoration: none; }
.collection-nav .active { background: var(--accent-soft); color: #0550ae; font-weight: 700; }
.collection-nav .failed { color: var(--danger); }
.collection-nav small { color: var(--muted); font-size: 0.74rem; line-height: 1.2; }

.article-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 48px;
  padding: 0.82rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--canvas);
  color: var(--text);
  font-size: 0.92rem;
  font-weight: 700;
}
.panel-header span:last-child { color: var(--muted); font-weight: 600; white-space: nowrap; }
.article-content {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 28px;
  font-size: 16px;
  line-height: 1.78;
}
.article-content h1, .article-content h2, .article-content h3 {
  margin: 1.45rem 0 0.75rem;
  line-height: 1.35;
  letter-spacing: 0;
}
.article-content h2 {
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--border-muted);
  font-size: 1.45rem;
}
.article-content p { margin: 0.9rem 0; overflow-wrap: anywhere; }
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
.article-content .export-math-inline { display: inline; }
.article-content mjx-container { max-width: 100%; overflow-x: auto; overflow-y: hidden; }
.article-content figure { margin: 1.15rem 0; padding: 0; }
.article-content figure img, .article-content p > img { border: 1px solid var(--border-muted); background: var(--canvas); }
.article-content blockquote {
  margin: 1rem 0;
  padding-left: 1rem;
  border-left: 4px solid var(--border);
  color: var(--muted);
}
.article-content .RichText-LinkCardContainer { margin: 1rem 0; }
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
.article-content .export-link-card:hover { border-color: #afb8c1; background: #f3f4f6; text-decoration: none; }
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
.article-content code, .article-content pre { background: var(--canvas); }
.article-content pre { overflow: auto; padding: 12px; border-radius: 6px; }

.collection-page {
  width: min(1060px, 100%);
  margin: 0 auto;
  padding: 32px 20px 52px;
}
.collection-heading {
  display: grid;
  gap: 0.4rem;
  margin-bottom: 18px;
}
.collection-heading h1 { margin: 0; font-size: 1.72rem; line-height: 1.25; letter-spacing: 0; }
.collection-heading p { margin: 0; color: var(--muted); }
.article-grid { display: grid; gap: 10px; }
.article-card {
  display: grid;
  gap: 0.46rem;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--text);
}
a.article-card:hover { border-color: #afb8c1; background: var(--canvas); text-decoration: none; }
.article-card.failed { border-color: #ffebe9; background: #fff8f7; }
.article-card strong { overflow-wrap: anywhere; }
.article-card span { color: var(--muted); font-size: 0.82rem; font-weight: 700; }

.page-footer {
  width: min(1232px, 100%);
  margin: 0 auto;
  padding: 18px 24px 34px;
  border-top: 1px solid var(--border-muted);
  color: var(--muted);
  font-size: 0.84rem;
}

@media (max-width: 900px) {
  .page-layout { grid-template-columns: 1fr; gap: 18px; padding: 22px 16px 36px; }
  .article-page .page-layout {
    height: 100%;
    max-height: 100%;
    padding: 22px 16px 0;
  }
  .github-topbar { min-height: 56px; padding: 10px 12px; justify-content: flex-start; }
  .article-page .article-set-toggle { display: inline-flex; }
  .topbar-nav { width: 100%; }
  .meta-sidebar {
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 40;
    width: min(360px, calc(100vw - 24px));
    height: calc(100vh - 24px);
    max-height: calc(100vh - 24px);
    transform: translateX(calc(-100% - 24px));
    opacity: 0;
    pointer-events: none;
    transition: transform 160ms ease, opacity 160ms ease;
  }
  body.article-set-open .meta-sidebar {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
  }
  .article-set-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: none;
    border: 0;
    background: rgba(27, 31, 36, 0.22);
    cursor: pointer;
  }
  body.article-set-open .article-set-backdrop { display: block; }
  .collection-nav { max-height: 100%; }
  .article-content { padding: 18px; }
}
`;

export const mathJaxHead = `<script>
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
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>`;

export const shellScript = `<script>
(() => {
  const scrollKey = 'zhihu-article-set-scroll';
  const openKey = 'zhihu-article-set-open';
  const nav = document.querySelector('[data-article-set-nav]');
  const sidebar = document.querySelector('[data-article-set-sidebar]');
  const toggle = document.querySelector('[data-article-set-toggle]');
  const backdrop = document.querySelector('[data-article-set-backdrop]');
  if (!nav) {
    return;
  }

  const setShellMetrics = () => {
    const topbar = document.querySelector('.github-topbar');
    const layout = document.querySelector('.page-layout');
    const layoutPaddingTop = Number.parseFloat(window.getComputedStyle(layout ?? document.body).paddingTop) || 0;
    const top = Math.ceil((topbar?.getBoundingClientRect().bottom ?? 64) + layoutPaddingTop);

    document.documentElement.style.setProperty('--article-shell-top', top + 'px');
    document.documentElement.style.setProperty('--article-shell-height', Math.max(240, window.innerHeight - top) + 'px');

    if (!sidebar || window.matchMedia('(max-width: 900px)').matches) {
      return;
    }
  };

  const setOpen = (open) => {
    document.body.classList.toggle('article-set-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    sessionStorage.setItem(openKey, open ? '1' : '0');
  };

  setShellMetrics();
  window.addEventListener('resize', setShellMetrics, { passive: true });
  window.addEventListener('scroll', setShellMetrics, { passive: true });

  if (sessionStorage.getItem(openKey) === '1' && window.matchMedia('(max-width: 900px)').matches) {
    setOpen(true);
  } else {
    setOpen(false);
  }

  toggle?.addEventListener('click', () => setOpen(!document.body.classList.contains('article-set-open')));
  backdrop?.addEventListener('click', () => setOpen(false));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  });

  const saved = Number(sessionStorage.getItem(scrollKey));
  if (Number.isFinite(saved)) {
    nav.scrollTop = saved;
  }

  const active = nav.querySelector('.active');
  if (active) {
    const activeTop = active.offsetTop;
    const activeBottom = activeTop + active.offsetHeight;
    if (activeTop < nav.scrollTop || activeBottom > nav.scrollTop + nav.clientHeight) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  nav.addEventListener('scroll', () => {
    sessionStorage.setItem(scrollKey, String(nav.scrollTop));
  }, { passive: true });
})();
</script>`;

const renderTopbar = ({ homeHref, indexHref }) => `<header class="github-topbar">
  <button class="article-set-toggle" type="button" aria-label="Open article set" aria-expanded="false" data-article-set-toggle>&#9776;</button>
  <nav class="topbar-nav" aria-label="Site navigation">
    <a href="${escapeHtml(homeHref)}">Homepage</a>
    <a href="${escapeHtml(indexHref)}">Articles</a>
  </nav>
</header>`;

const renderCollectionNav = ({ articles, currentSlug, linkForArticle }) => `<nav class="collection-nav" aria-label="Article collection" data-article-set-nav>
  ${articles
    .map((article) => {
      const label = `${article.date ?? 'undated'} &middot; ${article.kind === 'answer' ? 'Answer' : 'Article'}`;
      if (!article.ok) {
        return `<span class="failed"><small>${escapeHtml(label)}</small>${escapeHtml(article.title)}</span>`;
      }

      const active = article.slug === currentSlug ? ' class="active"' : '';
      return `<a${active} href="${escapeHtml(linkForArticle(article))}"><small>${escapeHtml(label)}</small>${escapeHtml(article.title)}</a>`;
    })
    .join('\n')}
</nav>`;

export const renderArticlePage = ({ article, body, articles, cssHref, homeHref, indexHref, linkForArticle }) => `<!doctype html>
<html class="article-shell" lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(article.title)} - Jiang Yaogeng</title>
  <link rel="stylesheet" href="${escapeHtml(cssHref)}" />
  ${mathJaxHead}
</head>
<body class="article-page">
  ${renderTopbar({ homeHref, indexHref })}
  <button class="article-set-backdrop" type="button" aria-label="Close article set" data-article-set-backdrop></button>
  <main class="page-layout">
    <aside class="meta-sidebar" data-article-set-sidebar>
      <section class="shell-section article-set-section">
        <h2>Article Set</h2>
        ${renderCollectionNav({ articles, currentSlug: article.slug, linkForArticle })}
      </section>
    </aside>
    <article class="article-panel">
      <div class="panel-header">
        <span>${escapeHtml(article.title)}</span>
        <span>${escapeHtml(article.kind === 'answer' ? 'Answer' : 'Article')}</span>
      </div>
      <div class="article-content">
        ${body}
      </div>
    </article>
  </main>
  ${shellScript}
</body>
</html>
`;

export const renderIndexPage = ({ articles, cssHref, homeHref, indexHref, linkForArticle }) => {
  const okCount = articles.filter((article) => article.ok).length;
  const failedCount = articles.length - okCount;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Zhihu Articles - Jiang Yaogeng</title>
  <link rel="stylesheet" href="${escapeHtml(cssHref)}" />
</head>
<body>
  ${renderTopbar({ homeHref, indexHref })}
  <main class="collection-page">
    <header class="collection-heading">
      <h1>Zhihu Articles</h1>
      <p>${okCount} exported articles and answers${failedCount ? `, ${failedCount} pending or failed` : ''}.</p>
    </header>
    <section class="article-grid" aria-label="Article list">
      ${articles
        .map((article) => {
          const meta = `${article.date ?? 'undated'} &middot; ${article.label}${article.imageOkCount == null ? '' : ` &middot; ${article.imageOkCount} images`}`;
          if (!article.ok) {
            return `<div class="article-card failed"><span>${escapeHtml(meta)}</span><strong>${escapeHtml(article.title)}</strong><span>${escapeHtml(article.error ?? 'Export failed')}</span></div>`;
          }

          return `<a class="article-card" href="${escapeHtml(linkForArticle(article))}"><span>${escapeHtml(meta)}</span><strong>${escapeHtml(article.title)}</strong></a>`;
        })
        .join('\n')}
    </section>
  </main>
  <footer class="page-footer">Generated from Jiang Yaogeng's Zhihu article export collection.</footer>
</body>
</html>
`;
};
