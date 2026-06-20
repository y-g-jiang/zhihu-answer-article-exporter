import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureDir,
  readArticleBody,
  readArticleCollection,
  renderArticlePage,
  renderIndexPage,
  siteCss,
} from './zhihu-site-shell.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sampleRoot = path.join(repoRoot, 'article-export-sample');
const outputRoot = path.resolve(repoRoot, '..', 'zhihu-articles');
const docsRoot = path.join(outputRoot, 'docs');
const personalHomepageHref = 'https://y-g-jiang.github.io/';

const writeJson = async (file, value) => {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const copyContent = async (articles) => {
  const contentOutput = path.join(outputRoot, 'content');
  await ensureDir(contentOutput);

  for (const article of articles) {
    const from = path.join(sampleRoot, 'content', article.slug);
    const to = path.join(contentOutput, article.slug);
    await fs.cp(from, to, { recursive: true, force: true });
  }
};

const copyCompressedAssets = async (articles) => {
  const fromRoot = path.join(sampleRoot, 'assets');
  const toRoot = path.join(docsRoot, 'assets');
  await ensureDir(toRoot);
  await fs.writeFile(path.join(toRoot, 'site.css'), siteCss, 'utf8');

  for (const article of articles.filter((item) => item.ok)) {
    const fromDir = path.join(fromRoot, article.slug);
    const toDir = path.join(toRoot, article.slug);
    await ensureDir(toDir);

    const entries = await fs.readdir(fromDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        continue;
      }

      await fs.copyFile(path.join(fromDir, entry.name), path.join(toDir, entry.name));
    }
  }
};

const buildDocs = async (articles) => {
  await ensureDir(docsRoot);
  await fs.writeFile(path.join(docsRoot, '.nojekyll'), '', 'utf8');
  await writeJson(path.join(docsRoot, 'articles.json'), {
    generatedAt: new Date().toISOString(),
    articles,
  });

  await fs.writeFile(
    path.join(docsRoot, 'index.html'),
    renderIndexPage({
      articles,
      cssHref: './assets/site.css',
      homeHref: personalHomepageHref,
      indexHref: './',
      linkForArticle: (article) => `./${article.slug}/`,
    }),
    'utf8'
  );

  for (const article of articles.filter((item) => item.ok)) {
    const sourceHtml = await fs.readFile(path.join(sampleRoot, 'content', article.slug, 'index.html'), 'utf8');
    const body = readArticleBody(sourceHtml, '../assets/');
    const outputDir = path.join(docsRoot, article.slug);

    await ensureDir(outputDir);
    await fs.writeFile(
      path.join(outputDir, 'index.html'),
      renderArticlePage({
        article,
        body,
        articles,
        cssHref: '../assets/site.css',
        homeHref: personalHomepageHref,
        indexHref: '../',
        linkForArticle: (item) => `../${item.slug}/`,
      }),
      'utf8'
    );
  }
};

const buildReadme = async (articles) => {
  const okCount = articles.filter((article) => article.ok).length;
  const failedCount = articles.length - okCount;
  const rows = articles.map((article) => {
    const status = article.ok ? `${article.label}, ${article.date ?? 'undated'}, ${article.imageOkCount ?? 0} images` : `failed: ${article.error ?? 'unknown error'}`;
    return `- [${article.title}](docs/${article.slug}/) - ${status}`;
  });

  const readme = `# Zhihu Articles

This repository contains standalone exports of Jiang Yaogeng's Zhihu articles and answers.

## Pages

${okCount} exported pages${failedCount ? `, ${failedCount} pending or failed exports` : ''}.

${rows.join('\n')}

## Structure

- \`docs/\`: static pages suitable for GitHub Pages.
- \`content/\`: source Markdown, HTML, and image manifests from the export pipeline.
- \`docs/assets/\`: shared article shell CSS and compressed public images.

The original Zhihu URLs and publish dates are preserved in the exported front matter and HTML metadata.
`;

  await fs.writeFile(path.join(outputRoot, 'README.md'), readme, 'utf8');
};

const buildGitignore = async () => {
  const gitignore = `# OS/editor noise
.DS_Store
Thumbs.db
.vscode/

# Local transient files
*.log
`;

  await fs.writeFile(path.join(outputRoot, '.gitignore'), gitignore, 'utf8');
};

const run = async () => {
  const articles = await readArticleCollection(sampleRoot);

  await fs.rm(outputRoot, { recursive: true, force: true });
  await ensureDir(outputRoot);

  await copyContent(articles);
  await buildDocs(articles);
  await copyCompressedAssets(articles);
  await buildReadme(articles);
  await buildGitignore();

  console.log(`Built standalone Zhihu article repository at ${outputRoot}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
