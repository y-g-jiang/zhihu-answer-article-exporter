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
const collectionRoot = path.resolve(repoRoot, process.env.ZHIHU_SITE_COLLECTION_ROOT ?? 'article-export-sample');
const siteRoot = path.resolve(collectionRoot, process.env.ZHIHU_SITE_OUTPUT_DIR ?? 'docs');
const homeHref = process.env.ZHIHU_SITE_HOME_HREF ?? './';
const indexHref = './';

const writeJson = async (file, value) => {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const copyAssets = async () => {
  const sourceAssets = path.join(collectionRoot, 'assets');
  const outputAssets = path.join(siteRoot, 'assets');

  await ensureDir(outputAssets);
  await fs.cp(sourceAssets, outputAssets, { recursive: true, force: true });
  await fs.writeFile(path.join(outputAssets, 'site.css'), siteCss, 'utf8');
};

const buildArticlePages = async (articles) => {
  for (const article of articles.filter((item) => item.ok)) {
    const sourceHtml = await fs.readFile(path.join(collectionRoot, 'content', article.slug, 'index.html'), 'utf8');
    const body = readArticleBody(sourceHtml, '../assets/');
    const outputDir = path.join(siteRoot, article.slug);

    await ensureDir(outputDir);
    await fs.writeFile(
      path.join(outputDir, 'index.html'),
      renderArticlePage({
        article,
        body,
        articles,
        cssHref: '../assets/site.css',
        homeHref,
        indexHref: '../',
        linkForArticle: (item) => `../${item.slug}/`,
      }),
      'utf8'
    );
  }
};

const buildIndex = async (articles) => {
  await fs.writeFile(
    path.join(siteRoot, 'index.html'),
    renderIndexPage({
      articles,
      cssHref: './assets/site.css',
      homeHref,
      indexHref,
      linkForArticle: (article) => `./${article.slug}/`,
    }),
    'utf8'
  );
};

const run = async () => {
  const articles = await readArticleCollection(collectionRoot);

  await fs.rm(siteRoot, { recursive: true, force: true });
  await ensureDir(siteRoot);
  await fs.writeFile(path.join(siteRoot, '.nojekyll'), '', 'utf8');
  await copyAssets();
  await writeJson(path.join(siteRoot, 'articles.json'), {
    generatedAt: new Date().toISOString(),
    source: path.relative(repoRoot, collectionRoot).replaceAll('\\', '/'),
    articles,
  });
  await buildIndex(articles);
  await buildArticlePages(articles);

  console.log(`Built ${articles.filter((article) => article.ok).length}/${articles.length} local Zhihu pages at ${siteRoot}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
