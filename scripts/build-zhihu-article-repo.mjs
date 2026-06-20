import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sampleRoot = path.join(repoRoot, 'article-export-sample');
const publicZhihuRoot = path.join(repoRoot, 'public', 'zhihu');
const docsRoot = path.join(repoRoot, 'docs');
const contentRoot = path.join(repoRoot, 'content');

const pages = [
  {
    slug: 'answer-100gm-decenter-simulation',
    label: 'Zhihu Answer',
    date: '2026-05-14',
  },
  {
    slug: 'article-color-bit-depth',
    label: 'Zhihu Article',
    date: '2026-06-15',
  },
];

const ensureDir = (dir) => fs.mkdir(dir, { recursive: true });

const stripTitle = (html) => {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return match?.[1]?.replace(/<[^>]+>/g, '').trim() || 'Zhihu Article';
};

const rewritePageForStandaloneRepo = (html) =>
  html
    .replaceAll('href="/"', 'href="../"')
    .replaceAll('href="/#zhihu-preview"', 'href="../"')
    .replaceAll('src="/zhihu/assets/', 'src="../assets/')
    .replaceAll('href="/zhihu/', 'href="../')
    .replaceAll('README_姜尧耕', 'Zhihu Articles')
    .replaceAll('Preview List', 'Article List')
    .replaceAll('Generated from local Zhihu export sample. Originals are kept in the project export folder.', 'Generated from Jiang Yaogeng Zhihu article exports.');

const rewriteIndexForStandaloneRepo = (html) =>
  html
    .replaceAll('href="/zhihu/', 'href="./')
    .replaceAll('Zhihu Preview', 'Zhihu Articles');

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

const copyContent = async () => {
  await fs.rm(contentRoot, { recursive: true, force: true });
  await ensureDir(contentRoot);

  for (const page of pages) {
    await fs.cp(path.join(sampleRoot, 'content', page.slug), path.join(contentRoot, page.slug), { recursive: true });
  }
};

const copyCompressedAssets = async () => {
  const fromRoot = path.join(sampleRoot, 'assets');
  const toRoot = path.join(docsRoot, 'assets');
  await ensureDir(toRoot);

  for (const page of pages) {
    const fromDir = path.join(fromRoot, page.slug);
    const toDir = path.join(toRoot, page.slug);
    await ensureDir(toDir);

    const entries = await fs.readdir(fromDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        continue;
      }

      await fs.copyFile(path.join(fromDir, entry.name), path.join(toDir, entry.name));
    }
  }
};

const buildDocs = async () => {
  await fs.rm(docsRoot, { recursive: true, force: true });
  await ensureDir(docsRoot);

  const indexHtml = await fs.readFile(path.join(publicZhihuRoot, 'index.html'), 'utf8');
  await fs.writeFile(path.join(docsRoot, 'index.html'), rewriteIndexForStandaloneRepo(indexHtml), 'utf8');
  await fs.writeFile(path.join(docsRoot, '.nojekyll'), '', 'utf8');

  for (const page of pages) {
    const outputDir = path.join(docsRoot, page.slug);
    await ensureDir(outputDir);
    const html = await fs.readFile(path.join(publicZhihuRoot, page.slug, 'index.html'), 'utf8');
    await fs.writeFile(path.join(outputDir, 'index.html'), rewritePageForStandaloneRepo(html), 'utf8');
  }
};

const updateReadmePages = async () => {
  const rows = [];

  for (const page of pages) {
    const sourceHtml = await fs.readFile(path.join(sampleRoot, 'content', page.slug, 'index.html'), 'utf8');
    const images = await readJson(path.join(sampleRoot, 'content', page.slug, 'images.json'));
    rows.push({
      ...page,
      title: stripTitle(sourceHtml),
      imageCount: images.filter((image) => image.ok).length,
    });
  }

  const pageList = rows.map((row) => `- [${row.title}](docs/${row.slug}/) - ${row.label}, ${row.date}, ${row.imageCount} images`).join('\n');
  const readmePath = path.join(repoRoot, 'README.md');
  const current = await fs.readFile(readmePath, 'utf8');
  const next = current.replace(/## Current Pages[\s\S]*?## Structure/, `## Current Pages\n\n${pageList}\n\n## Structure`);
  await fs.writeFile(readmePath, next, 'utf8');
};

const run = async () => {
  await copyContent();
  await buildDocs();
  await copyCompressedAssets();
  await updateReadmePages();

  console.log(`Built docs and content inside ${repoRoot}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
