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
const publicRoot = path.join(repoRoot, 'public', 'zhihu');

const writeJson = async (file, value) => {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const copyAssets = async () => {
  const sourceAssets = path.join(sampleRoot, 'assets');
  const outputAssets = path.join(publicRoot, 'assets');

  await ensureDir(outputAssets);
  await fs.cp(sourceAssets, outputAssets, { recursive: true, force: true });
  await fs.writeFile(path.join(outputAssets, 'site.css'), siteCss, 'utf8');
};

const buildArticlePages = async (articles) => {
  const successful = articles.filter((article) => article.ok);

  for (const article of successful) {
    const contentDir = path.join(sampleRoot, 'content', article.slug);
    const sourceHtml = await fs.readFile(path.join(contentDir, 'index.html'), 'utf8');
    const body = readArticleBody(sourceHtml, '/zhihu/assets/');
    const outputDir = path.join(publicRoot, article.slug);

    await ensureDir(outputDir);
    await fs.writeFile(
      path.join(outputDir, 'index.html'),
      renderArticlePage({
        article,
        body,
        articles,
        cssHref: '/zhihu/assets/site.css',
        homeHref: '/',
        indexHref: '/zhihu/',
        linkForArticle: (item) => `/zhihu/${item.slug}/`,
      }),
      'utf8'
    );
  }
};

const buildIndex = async (articles) => {
  await fs.writeFile(
    path.join(publicRoot, 'index.html'),
    renderIndexPage({
      articles,
      cssHref: '/zhihu/assets/site.css',
      homeHref: '/',
      indexHref: '/zhihu/',
      linkForArticle: (article) => `/zhihu/${article.slug}/`,
    }),
    'utf8'
  );
};

const run = async () => {
  const articles = await readArticleCollection(sampleRoot);

  await fs.rm(publicRoot, { recursive: true, force: true });
  await ensureDir(publicRoot);
  await copyAssets();
  await writeJson(path.join(publicRoot, 'articles.json'), {
    generatedAt: new Date().toISOString(),
    articles,
  });
  await buildArticlePages(articles);
  await buildIndex(articles);

  console.log(`Built ${articles.filter((article) => article.ok).length}/${articles.length} Zhihu preview pages in ${path.relative(repoRoot, publicRoot)}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
