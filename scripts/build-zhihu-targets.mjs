import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const dataRoot = path.join(repoRoot, 'data');
const outputPath = path.join(dataRoot, 'zhihu-targets.json');
const slugOverridesPath = path.join(dataRoot, 'slug-overrides.local.json');

const sourceFiles = ['constants.ts', 'contentSources.ts'];
const zhihuUrlPattern =
  /https?:\/\/(?:www\.)?(?:zhihu\.com\/question\/\d+\/answer\/\d+|zhuanlan\.zhihu\.com\/p\/\d+|zhihu\.com\/column\/c_\d+)[^\s"'`<>),]*/g;

let slugOverrides = new Map();

const ensureDir = (dir) => fs.mkdir(dir, { recursive: true });

const loadSlugOverrides = async () => {
  const raw = await fs.readFile(slugOverridesPath, 'utf8').catch(() => null);
  if (!raw) {
    return new Map();
  }

  const value = JSON.parse(raw);
  return new Map(Object.entries(value));
};

const normalizeWhitespace = (value) => value?.replace(/\s+/g, ' ').trim() || null;

const normalizeUrl = (rawUrl) => {
  const trimmed = rawUrl.replace(/&amp;/g, '&').replace(/[，。；;、]+$/g, '');
  const parsed = new URL(trimmed);
  const answerMatch = parsed.pathname.match(/\/question\/(\d+)\/answer\/(\d+)/);
  const articleMatch = parsed.hostname.includes('zhuanlan.zhihu.com') && parsed.pathname.match(/\/p\/(\d+)/);
  const columnMatch = parsed.pathname.match(/\/column\/(c_\d+)/);

  if (answerMatch) {
    return `https://www.zhihu.com/question/${answerMatch[1]}/answer/${answerMatch[2]}`;
  }

  if (articleMatch) {
    return `https://zhuanlan.zhihu.com/p/${articleMatch[1]}`;
  }

  if (columnMatch) {
    return `https://www.zhihu.com/column/${columnMatch[1]}`;
  }

  return parsed.toString();
};

const inferKind = (url) => {
  if (/\/answer\/\d+/.test(url)) {
    return 'answer';
  }

  if (/zhuanlan\.zhihu\.com\/p\/\d+/.test(url)) {
    return 'article';
  }

  if (/\/column\/c_\d+/.test(url)) {
    return 'column';
  }

  return 'unknown';
};

const zhihuIdFromUrl = (url) => {
  const answerMatch = url.match(/\/answer\/(\d+)/);
  const articleMatch = url.match(/\/p\/(\d+)/);
  const columnMatch = url.match(/\/column\/(c_\d+)/);
  return answerMatch?.[1] ?? articleMatch?.[1] ?? columnMatch?.[1] ?? null;
};

const slugFromUrl = (url) => {
  const override = slugOverrides.get(url);
  if (override) {
    return override;
  }

  const kind = inferKind(url);
  const id = zhihuIdFromUrl(url);
  return id ? `${kind}-${id}` : `zhihu-${Buffer.from(url).toString('hex').slice(0, 12)}`;
};

const normalizeDate = (value) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{4})[.-](\d{1,2})(?:[.-](\d{1,2}))?/);
  if (!match) {
    return normalized;
  }

  const year = match[1];
  const month = match[2].padStart(2, '0');
  const day = (match[3] ?? '01').padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const cleanHint = (value) => {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned || /^查看链接|^鏌ョ湅|^Zhihu$/i.test(cleaned)) {
    return null;
  }

  return cleaned;
};

const nearestFieldBefore = (text, index, fieldNames) => {
  const before = text.slice(Math.max(0, index - 900), index);
  const pattern = new RegExp(`(${fieldNames.join('|')})\\s*:\\s*(['"\`])([\\s\\S]*?)\\2`, 'g');
  let match;
  let latest = null;

  while ((match = pattern.exec(before))) {
    latest = {
      name: match[1],
      value: match[3],
      index: match.index,
    };
  }

  return latest;
};

const mergeTarget = (map, url, patch) => {
  const existing =
    map.get(url) ?? {
      url,
      kind: inferKind(url),
      zhihuId: zhihuIdFromUrl(url),
      slug: slugFromUrl(url),
      titleHint: null,
      dateHint: null,
      sources: [],
    };

  const sources = new Set(existing.sources);
  for (const source of patch.sources ?? []) {
    sources.add(source);
  }

  map.set(url, {
    ...existing,
    titleHint: cleanHint(existing.titleHint) ?? cleanHint(patch.titleHint),
    dateHint: normalizeDate(existing.dateHint) ?? normalizeDate(patch.dateHint),
    inferredDate: normalizeDate(existing.inferredDate) ?? normalizeDate(patch.inferredDate),
    confidence: existing.confidence ?? patch.confidence ?? null,
    sources: [...sources],
  });
};

const collectFromSourceFile = async (file, map) => {
  const fullPath = path.join(repoRoot, file);
  const text = await fs.readFile(fullPath, 'utf8');
  const matches = [...text.matchAll(zhihuUrlPattern)];

  for (const match of matches) {
    const url = normalizeUrl(match[0]);
    const titleField = nearestFieldBefore(text, match.index ?? 0, ['title', 'text']);
    const dateField = nearestFieldBefore(text, match.index ?? 0, ['date']);

    mergeTarget(map, url, {
      titleHint: titleField?.value,
      dateHint: dateField?.value,
      sources: [file],
    });
  }
};

const collectFromDateInference = async (map) => {
  const file = 'date-inference-results.json';
  const fullPath = path.join(repoRoot, file);
  const raw = await fs.readFile(fullPath, 'utf8').catch(() => null);
  if (!raw) {
    return;
  }

  const data = JSON.parse(raw);
  for (const article of data.articles ?? []) {
    if (!article.href) {
      continue;
    }

    mergeTarget(map, normalizeUrl(article.href), {
      titleHint: article.title,
      dateHint: article.finalDate ?? article.date,
      inferredDate: article.networkDate,
      confidence: article.confidence,
      sources: [file],
    });
  }
};

const sortDate = (target) => target.dateHint ?? target.inferredDate ?? '0000-00-00';

const run = async () => {
  slugOverrides = await loadSlugOverrides();
  const map = new Map();

  for (const file of sourceFiles) {
    await collectFromSourceFile(file, map);
  }
  await collectFromDateInference(map);

  const all = [...map.values()].sort((a, b) => {
    const dateCompare = sortDate(b).localeCompare(sortDate(a));
    return dateCompare || a.slug.localeCompare(b.slug);
  });

  const targets = all.filter((target) => target.kind === 'article' || target.kind === 'answer');
  const ignored = all.filter((target) => target.kind !== 'article' && target.kind !== 'answer');

  await ensureDir(dataRoot);
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceFiles: [...sourceFiles, 'date-inference-results.json'],
        totalSourceUrls: all.length,
        exportableCount: targets.length,
        ignoredCount: ignored.length,
        targets,
        ignored,
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log(`Wrote ${targets.length} exportable Zhihu targets to ${path.relative(repoRoot, outputPath)}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
