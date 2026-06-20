import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import sharp from 'sharp';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(repoRoot, 'article-export-sample');
const contentRoot = path.join(outputRoot, 'content');
const assetRoot = path.join(outputRoot, 'assets');
const reportPath = path.join(outputRoot, 'export-report.json');
const maxConcurrency = 14;
const edgePath = process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const edgeUserDataDir =
  process.env.EDGE_USER_DATA_DIR ?? path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Edge', 'User Data');
const edgeProfileDirectory = process.env.EDGE_PROFILE_DIRECTORY ?? 'Default';
const headless = process.env.HEADLESS === '1';

const targets = [
  {
    kind: 'answer',
    slug: 'answer-100gm-decenter-simulation',
    titleHint: '100GM歪轴仿真报告',
    url: 'https://www.zhihu.com/question/300139587/answer/2038319263958741552',
  },
  {
    kind: 'article',
    slug: 'article-color-bit-depth',
    titleHint: '关于色彩位深-bit数',
    url: 'https://zhuanlan.zhihu.com/p/2049616049604244194',
  },
];

const turndown = new TurndownService({
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
  bulletListMarker: '-',
});

turndown.use(gfm);
turndown.addRule('figureImage', {
  filter: ['figure'],
  replacement: (_content, node) => {
    const image = node.querySelector?.('img');
    const caption = node.querySelector?.('figcaption')?.textContent?.trim();

    if (!image) {
      return `\n\n${node.textContent?.trim() ?? ''}\n\n`;
    }

    const alt = image.getAttribute('alt') || caption || '';
    const src = image.getAttribute('src') || image.getAttribute('data-original') || '';
    const captionText = caption ? `\n\n<figcaption>${caption}</figcaption>` : '';
    return `\n\n![${alt}](${src})${captionText}\n\n`;
  },
});

turndown.addRule('zhihuLinkCard', {
  filter: (node) =>
    node.nodeName === 'A' &&
    typeof node.getAttribute === 'function' &&
    node.getAttribute('data-export-kind') === 'link-card',
  replacement: (_content, node) => {
    const href = node.getAttribute('href') || '';
    const title = node.getAttribute('data-title') || node.textContent?.trim() || href;
    const desc = node.getAttribute('data-desc') || '';
    const suffix = desc && desc !== href ? ` - ${desc}` : '';
    return `\n\n[${title}${suffix}](${href})\n\n`;
  },
});

turndown.addRule('zhihuMath', {
  filter: (node) =>
    typeof node.getAttribute === 'function' &&
    node.getAttribute('data-export-kind') === 'math' &&
    node.getAttribute('data-tex'),
  replacement: (_content, node) => {
    const tex = node.getAttribute('data-tex') || '';
    const display = node.getAttribute('data-display') === 'true';
    return display ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
  },
});

const ensureDir = (dir) => fs.mkdir(dir, { recursive: true });

const copyIfExists = async (from, to) => {
  try {
    await ensureDir(path.dirname(to));
    await fs.copyFile(from, to);
    return true;
  } catch {
    return false;
  }
};

const prepareTemporaryEdgeProfile = async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zhihu-edge-profile-'));
  const tempUserData = path.join(tempRoot, 'User Data');
  const sourceProfile = path.join(edgeUserDataDir, edgeProfileDirectory);
  const targetProfile = path.join(tempUserData, edgeProfileDirectory);

  await ensureDir(targetProfile);
  await copyIfExists(path.join(edgeUserDataDir, 'Local State'), path.join(tempUserData, 'Local State'));
  await copyIfExists(path.join(sourceProfile, 'Preferences'), path.join(targetProfile, 'Preferences'));
  await copyIfExists(path.join(sourceProfile, 'Cookies'), path.join(targetProfile, 'Cookies'));
  await copyIfExists(path.join(sourceProfile, 'Network', 'Cookies'), path.join(targetProfile, 'Network', 'Cookies'));

  return { tempRoot, tempUserData };
};

const limitConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let index = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  });

  await Promise.all(runners);
  return results;
};

const cleanTitle = (title) =>
  title
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim();

const normalizeTex = (value) => value.replace(/\s+/g, ' ').trim().replace(/\\\\\s*$/, '').trim();

const zhihuDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const zhihuDateOnlyFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const formatZhihuDateTime = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return zhihuDateFormatter.format(date).replaceAll('/', '-');
};

const formatZhihuDateOnly = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return zhihuDateOnlyFormatter.format(date).replaceAll('/', '-');
};

const frontMatter = (metadata) => {
  const lines = [
    '---',
    `title: "${metadata.title.replaceAll('"', '\\"')}"`,
    metadata.date ? `date: ${metadata.date}` : null,
    `source: zhihu`,
    `kind: ${metadata.kind}`,
    `original_url: "${metadata.url}"`,
    metadata.zhihuId ? `zhihu_id: "${metadata.zhihuId}"` : null,
    '---',
  ].filter(Boolean);

  return `${lines.join('\n')}\n\n`;
};

const getZhihuId = (url) => {
  const answerMatch = url.match(/\/answer\/(\d+)/);
  const articleMatch = url.match(/\/p\/(\d+)/);
  return answerMatch?.[1] ?? articleMatch?.[1] ?? null;
};

const absolutizeUrl = (src, baseUrl) => {
  if (!src || src.startsWith('data:')) {
    return null;
  }

  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return null;
  }
};

const imageNameFromUrl = (url, index) => {
  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname).replace(/[^.\w]/g, '').slice(0, 8) || '.bin';
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 10);
  return `image-${String(index + 1).padStart(3, '0')}-${hash}${ext}`;
};

const fetchBinary = async (url, referer) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      Referer: referer,
    },
  });

  if (!response.ok) {
    throw new Error(`image HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const bestImageSource = (image) =>
  image.original ||
  image.actualSrc ||
  image.currentSrc ||
  image.src ||
  image.srcset?.split(',').at(-1)?.trim().split(/\s+/)[0] ||
  null;

const isLikelyPhoto = (metadata) => {
  if (metadata.hasAlpha) {
    return false;
  }

  return metadata.width >= 480 || metadata.height >= 480;
};

const compressImage = async (buffer, originalName, imageDir) => {
  const originalPath = path.join(imageDir, 'original', originalName);
  await ensureDir(path.dirname(originalPath));
  await fs.writeFile(originalPath, buffer);

  let metadata;
  try {
    metadata = await sharp(buffer, { animated: false }).metadata();
  } catch (error) {
    return {
      ok: false,
      original: path.relative(outputRoot, originalPath).replaceAll('\\', '/'),
      error: `sharp metadata failed: ${error.message}`,
    };
  }

  if (metadata.format === 'svg') {
    return {
      ok: true,
      format: 'svg',
      width: metadata.width,
      height: metadata.height,
      originalBytes: buffer.length,
      outputBytes: buffer.length,
      output: path.relative(outputRoot, originalPath).replaceAll('\\', '/'),
      reason: 'svg kept as source',
    };
  }

  const longEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  const resize =
    longEdge > 2200
      ? { width: metadata.width >= metadata.height ? 2200 : undefined, height: metadata.height > metadata.width ? 2200 : undefined, withoutEnlargement: true }
      : null;

  const base = sharp(buffer, { animated: false }).rotate();
  const pipeline = resize ? base.resize(resize) : base;
  const photo = isLikelyPhoto(metadata);
  const outputExt = photo ? '.webp' : '.png';
  const outputName = originalName.replace(/\.[^.]+$/, outputExt);
  const outputPath = path.join(imageDir, outputName);

  let outputBuffer;
  let format;
  let quality = null;

  if (photo) {
    quality = 82;
    outputBuffer = await pipeline.webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
    format = 'webp';
  } else {
    outputBuffer = await pipeline.png({ compressionLevel: 9, palette: true, effort: 10 }).toBuffer();
    format = 'png';
  }

  if (outputBuffer.length >= buffer.length * 0.98) {
    const keptName = originalName;
    const keptPath = path.join(imageDir, keptName);
    await fs.writeFile(keptPath, buffer);
    return {
      ok: true,
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      originalBytes: buffer.length,
      outputBytes: buffer.length,
      output: path.relative(outputRoot, keptPath).replaceAll('\\', '/'),
      original: path.relative(outputRoot, originalPath).replaceAll('\\', '/'),
      reason: 'compressed version was not smaller enough, kept source',
    };
  }

  await fs.writeFile(outputPath, outputBuffer);
  const outputMetadata = await sharp(outputBuffer).metadata();

  return {
    ok: true,
    format,
    quality,
    width: outputMetadata.width,
    height: outputMetadata.height,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    originalBytes: buffer.length,
    outputBytes: outputBuffer.length,
    savedBytes: buffer.length - outputBuffer.length,
    output: path.relative(outputRoot, outputPath).replaceAll('\\', '/'),
    original: path.relative(outputRoot, originalPath).replaceAll('\\', '/'),
    reason: photo ? 'photo-like image encoded as WebP q82 effort6' : 'non-photo image optimized as palette PNG',
  };
};

const extractArticleLegacy = async (page, target) => {
  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);

  const pageInfo = await page.evaluate((fallbackTitle) => {
    const normalize = (value) => value?.replace(/\s+/g, ' ').trim() ?? '';
    const selectors = [
      'article',
      '.Post-RichTextContainer',
      '.RichText',
      '.RichContent-inner',
      '.QuestionAnswer-content',
      '.AnswerItem .RichContent',
      '.Post-content',
      'main',
    ];
    const candidates = selectors
      .map((selector) => document.querySelector(selector))
      .filter(Boolean)
      .map((element) => ({
        selector: element.tagName.toLowerCase(),
        html: element.innerHTML,
        text: normalize(element.textContent),
      }))
      .sort((a, b) => b.text.length - a.text.length);

    const title =
      normalize(document.querySelector('h1')?.textContent) ||
      normalize(document.querySelector('.QuestionHeader-title')?.textContent) ||
      normalize(document.querySelector('.Post-Title')?.textContent) ||
      normalize(document.title.replace(/ - 知乎$/, '')) ||
      fallbackTitle;

    return {
      title,
      documentTitle: document.title,
      url: location.href,
      body: candidates[0] ?? null,
      images: Array.from(document.images)
        .map((image) => ({
          src: image.currentSrc || image.src || image.getAttribute('data-original') || '',
          alt: image.alt || '',
          width: image.naturalWidth || image.width || null,
          height: image.naturalHeight || image.height || null,
        }))
        .filter((image) => image.src),
      textLength: normalize(document.body?.textContent).length,
      bodyTextStart: normalize(document.body?.textContent).slice(0, 240),
    };
  }, target.titleHint);

  if (!pageInfo.body || pageInfo.body.text.length < 180 || /请求存在异常|安全验证|登录|验证码/.test(pageInfo.bodyTextStart)) {
    return {
      ok: false,
      target,
      pageInfo,
      error: 'Zhihu did not expose a usable article body in this session.',
    };
  }

  return {
    ok: true,
    target,
    pageInfo,
  };
};

const expandZhihuContent = async (page, target) => {
  const targetSelector =
    target.kind === 'answer'
      ? '.QuestionAnswer-content .ContentItem.AnswerItem, .ContentItem.AnswerItem'
      : 'article, .Post-Main, .Post-Row-Content-left-article, .Post-RichTextContainer';

  for (let pass = 0; pass < 5; pass += 1) {
    const clicked = await page.evaluate((selector) => {
      const roots = Array.from(document.querySelectorAll(selector));
      const containers = roots.length ? roots : [document.body];
      const expandPatterns = /阅读全文|显示全部|展开全文|展开阅读全文|Read more/i;

      for (const root of containers) {
        const buttons = Array.from(root.querySelectorAll('button, a, [role="button"]'));
        const button = buttons.find((candidate) => {
          const text = candidate.textContent?.replace(/\s+/g, '') ?? '';
          const aria = candidate.getAttribute('aria-label') ?? '';
          return expandPatterns.test(text) || expandPatterns.test(aria);
        });

        if (button) {
          button.scrollIntoView({ block: 'center' });
          button.click();
          return true;
        }
      }

      return false;
    }, targetSelector);

    if (!clicked) {
      break;
    }

    await page.waitForTimeout(900);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
};

const extractArticle = async (page, target) => {
  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await expandZhihuContent(page, target);
  await page.waitForTimeout(1200);

  const pageInfo = await page.evaluate(({ fallbackTitle, kind, url }) => {
    const normalize = (value) => value?.replace(/\s+/g, ' ').trim() ?? '';
    const cleanZhihuTitle = (value) => normalize(value).replace(/ - 知乎$/, '');

    const cloneForExport = (element) => {
      const clone = element.cloneNode(true);
      clone.querySelectorAll('.RichText-LinkCardContainer').forEach((container) => {
        const card = container.querySelector('a[href]');
        if (!card) {
          return;
        }

        let href = card.href || card.getAttribute('href') || '';
        try {
          const targetUrl = new URL(href).searchParams.get('target');
          if (targetUrl) {
            href = targetUrl;
          }
        } catch {
          // Keep the original href in place.
        }
        const title =
          card.getAttribute('data-text') ||
          card.querySelector('.LinkCard-title')?.getAttribute('data-text') ||
          card.querySelector('.LinkCard-title')?.textContent ||
          card.textContent ||
          href;
        const desc =
          card.querySelector('.LinkCard-desc')?.getAttribute('data-text') ||
          card.querySelector('.LinkCard-desc')?.textContent ||
          href;
        const exportCard = document.createElement('a');
        exportCard.className = 'export-link-card';
        exportCard.href = href;
        exportCard.target = '_blank';
        exportCard.rel = 'noopener noreferrer';
        exportCard.setAttribute('data-export-kind', 'link-card');
        exportCard.setAttribute('data-title', title.trim());
        exportCard.setAttribute('data-desc', desc.trim());
        exportCard.innerHTML = `<span class="export-link-card-title"></span><span class="export-link-card-desc"></span>`;
        exportCard.querySelector('.export-link-card-title').textContent = title.trim();
        exportCard.querySelector('.export-link-card-desc').textContent = desc.trim();
        container.replaceChildren(exportCard);
      });

      clone
        .querySelectorAll('script, style, noscript, svg, button, .ContentItem-actions, .RichContent-actions, .Reward, .Catalog')
        .forEach((node) => node.remove());
      clone.querySelectorAll('[style]').forEach((node) => node.removeAttribute('style'));
      clone.querySelectorAll('.ztext-math[data-tex]').forEach((mathNode) => {
        const tex = mathNode.getAttribute('data-tex') || '';
        const normalized = tex.replace(/\s+/g, ' ').trim().replace(/\\\\\s*$/, '').trim();
        const display = mathNode.getAttribute('data-eeimg') === '2' || /(^|\s)math-display(\s|$)/.test(mathNode.className);
        const exportMath = document.createElement('span');

        exportMath.className = display ? 'export-math export-math-display' : 'export-math export-math-inline';
        exportMath.setAttribute('data-export-kind', 'math');
        exportMath.setAttribute('data-tex', normalized);
        exportMath.setAttribute('data-display', display ? 'true' : 'false');
        exportMath.textContent = display ? `\\[${normalized}\\]` : `\\(${normalized}\\)`;
        mathNode.replaceWith(exportMath);
      });
      clone.querySelectorAll('img').forEach((image) => {
        const original =
          image.getAttribute('data-original') ||
          image.getAttribute('data-actualsrc') ||
          image.currentSrc ||
          image.getAttribute('src') ||
          '';
        const srcset = image.getAttribute('srcset') ?? '';
        const candidate = original || srcset.split(',').at(-1)?.trim().split(/\s+/)[0] || '';

        if (candidate && !candidate.startsWith('data:')) {
          image.setAttribute('src', candidate);
        }

        if (!image.getAttribute('alt')) {
          image.setAttribute('alt', image.getAttribute('data-caption') || '');
        }
      });

      clone.querySelectorAll('a[href^="https://link.zhihu.com/?target="]').forEach((link) => {
        try {
          const targetUrl = new URL(link.href).searchParams.get('target');
          if (targetUrl) {
            link.href = targetUrl;
          }
        } catch {
          // Leave the original href in place.
        }
      });

      clone.querySelectorAll('a[href*="zhida.zhihu.com/search"], a.RichContent-EntityWord').forEach((link) => {
        link.replaceWith(document.createTextNode(link.textContent || ''));
      });

      clone.querySelectorAll('a[href^="file:"], a[href^="C:"]').forEach((link) => {
        link.replaceWith(document.createTextNode(link.textContent || ''));
      });

      return clone;
    };

    const collectImages = (element) =>
      Array.from(element.querySelectorAll('img'))
        .map((image) => ({
          src: image.getAttribute('src') || '',
          currentSrc: image.currentSrc || '',
          original: image.getAttribute('data-original') || '',
          actualSrc: image.getAttribute('data-actualsrc') || '',
          srcset: image.getAttribute('srcset') || '',
          alt: image.alt || image.getAttribute('data-caption') || '',
          width: image.naturalWidth || Number(image.getAttribute('data-rawwidth')) || image.width || null,
          height: image.naturalHeight || Number(image.getAttribute('data-rawheight')) || image.height || null,
        }))
        .filter((image) => image.src || image.currentSrc || image.original || image.actualSrc || image.srcset);

    const scoreCandidate = (element, selector) => {
      const text = normalize(element.textContent);
      const imageCount = element.querySelectorAll('img').length;
      const className = element.getAttribute('class') ?? '';
      const collapsedPenalty = /collapsed/.test(className) || element.querySelector('.RichContent-inner--collapsed') ? 1200 : 0;
      const chromePenalty = /AuthorInfo|QuestionHeader|Card|Comment|Recommendations|HotSearch|Catalog/.test(className) ? 600 : 0;
      const selectorBonus =
        selector.includes('QuestionAnswer-content') || selector.includes('Post-RichText') || selector.includes('[itemprop="text"]')
          ? 1600
          : 0;

      return {
        selector,
        tag: element.tagName.toLowerCase(),
        className,
        html: cloneForExport(element).innerHTML,
        text,
        imageCount,
        score: text.length + imageCount * 120 + selectorBonus - collapsedPenalty - chromePenalty,
      };
    };

    const answerUrl = url.match(/\/answer\/(\d+)/)?.[1] ?? null;
    const answerSelectors = [
      answerUrl ? `.ContentItem.AnswerItem meta[itemprop="url"][content$="/answer/${answerUrl}"]` : null,
      '.QuestionAnswer-content .RichText.ztext[itemprop="text"]',
      '.QuestionAnswer-content .RichContent-inner .RichText.ztext',
    ].filter(Boolean);
    const articleSelectors = [
      '.Post-RichTextContainer .RichText.ztext.Post-RichText',
      '.Post-RichTextContainer .RichText.ztext',
      'article .RichText.ztext',
      '[itemprop="articleBody"]',
      '.Post-RichTextContainer',
      'article',
    ];

    const candidates = [];
    for (const selector of kind === 'answer' ? answerSelectors : articleSelectors) {
      if (selector.includes('meta[itemprop="url"]')) {
        const meta = document.querySelector(selector);
        const answerItem = meta?.closest('.ContentItem.AnswerItem');
        const textNode =
          answerItem?.querySelector('.RichText.ztext[itemprop="text"]') ||
          answerItem?.querySelector('.RichContent-inner .RichText.ztext') ||
          answerItem?.querySelector('.RichContent');
        if (textNode) {
          candidates.push(scoreCandidate(textNode, `${selector} -> RichText`));
        }
        continue;
      }

      for (const element of document.querySelectorAll(selector)) {
        candidates.push(scoreCandidate(element, selector));
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const body = candidates[0] ?? null;
    const bodyDocument = body ? document.createElement('div') : null;
    if (bodyDocument) {
      bodyDocument.innerHTML = body.html;
    }

    const answerMeta = answerUrl ? document.querySelector(`.ContentItem.AnswerItem meta[itemprop="url"][content$="/answer/${answerUrl}"]`) : null;
    const answerItem = answerMeta?.closest('.ContentItem.AnswerItem') ?? null;
    const dateSource = kind === 'answer' ? answerItem : document;
    const publishedAt =
      dateSource?.querySelector('meta[itemprop="datePublished"]')?.getAttribute('content') ||
      dateSource?.querySelector('meta[itemprop="dateCreated"]')?.getAttribute('content') ||
      (kind === 'article' ? document.querySelector('meta[itemprop="datePublished"]')?.getAttribute('content') : null) ||
      null;
    const modifiedAt =
      dateSource?.querySelector('meta[itemprop="dateModified"]')?.getAttribute('content') ||
      (kind === 'article' ? document.querySelector('meta[itemprop="dateModified"]')?.getAttribute('content') : null) ||
      null;

    const title =
      normalize(document.querySelector('.QuestionHeader-title')?.textContent) ||
      normalize(document.querySelector('.Post-Title')?.textContent) ||
      normalize(document.querySelector('h1')?.textContent) ||
      cleanZhihuTitle(document.title) ||
      fallbackTitle;

    return {
      title,
      documentTitle: document.title,
      url: location.href,
      publishedAt,
      modifiedAt,
      body,
      candidates: candidates.slice(0, 8).map(({ html, ...candidate }) => candidate),
      images: bodyDocument ? collectImages(bodyDocument) : [],
      textLength: normalize(document.body?.textContent).length,
      bodyTextStart: normalize(document.body?.textContent).slice(0, 240),
    };
  }, { fallbackTitle: target.titleHint, kind: target.kind, url: target.url });

  if (!pageInfo.body || pageInfo.body.text.length < 180 || /请求存在异常|安全验证|验证码/.test(pageInfo.bodyTextStart)) {
    return {
      ok: false,
      target,
      pageInfo,
      error: 'Zhihu did not expose a usable article body in this session.',
    };
  }

  return {
    ok: true,
    target,
    pageInfo,
  };
};

const saveExport = async (item) => {
  const target = item.target;
  const slug = target.slug;
  const contentDir = path.join(contentRoot, slug);
  const imageDir = path.join(assetRoot, slug);
  await ensureDir(contentDir);

  if (!item.ok) {
    await fs.writeFile(path.join(contentDir, 'FAILED.json'), JSON.stringify(item, null, 2), 'utf8');
    return item;
  }

  await fs.rm(path.join(contentDir, 'FAILED.json'), { force: true });
  await fs.rm(imageDir, { recursive: true, force: true });
  await ensureDir(imageDir);

  const imageCandidates = item.pageInfo.images
    .map((image) => ({ ...image, src: absolutizeUrl(bestImageSource(image), target.url) }))
    .filter((image) => image.src && !/static|avatar|icon|logo|data:image|_l\.(jpg|jpeg|png|webp)|_xl\.(jpg|jpeg|png|webp)/i.test(image.src))
    .filter((image) => (image.width ?? 0) >= 80 || (image.height ?? 0) >= 80)
    .filter((image, index, array) => array.findIndex((other) => other.src === image.src) === index)
    .slice(0, 80);

  const imageResults = await limitConcurrency(imageCandidates, maxConcurrency, async (image, index) => {
    const name = imageNameFromUrl(image.src, index);
    try {
      const buffer = await fetchBinary(image.src, target.url);
      return {
        source: image.src,
        alt: image.alt,
        ...(await compressImage(buffer, name, imageDir)),
      };
    } catch (error) {
      return {
        ok: false,
        source: image.src,
        alt: image.alt,
        error: error.message,
      };
    }
  });

  const imageMap = new Map(imageResults.filter((image) => image.ok && image.source && image.output).map((image) => [image.source, `../../${image.output}`]));
  let html = item.pageInfo.body.html;

  for (const [source, output] of imageMap) {
    html = html.replaceAll(source, output);
    try {
      const parsed = new URL(source);
      html = html.replaceAll(parsed.pathname + parsed.search, output);
      html = html.replaceAll(parsed.pathname, output);
    } catch {
      // Keep the original replacement only.
    }
  }

  const markdown = `${frontMatter({
    title: cleanTitle(item.pageInfo.title || target.titleHint),
    date: formatZhihuDateOnly(item.pageInfo.publishedAt),
    kind: target.kind,
    url: target.url,
    zhihuId: getZhihuId(target.url),
  })}${turndown.turndown(html).trim()}\n`;

  const publishedMeta = formatZhihuDateTime(item.pageInfo.publishedAt);

  const htmlDocument = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${cleanTitle(item.pageInfo.title || target.titleHint)}</title>
  <style>
    body { max-width: 860px; margin: 32px auto; padding: 0 18px; font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif; color: #24292f; }
    img { max-width: 100%; height: auto; }
    pre, code { background: #f6f8fa; }
    pre { padding: 12px; overflow: auto; border-radius: 6px; }
    blockquote { margin-left: 0; padding-left: 1rem; border-left: 4px solid #d8dee4; color: #57606a; }
    .RichText-LinkCardContainer { margin: 1rem 0; }
    .export-link-card { display: grid; gap: 0.2rem; max-width: 520px; min-height: 76px; margin: 0.9rem auto; padding: 14px 18px; border: 1px solid #eaeef2; border-radius: 8px; background: #f6f8fa; color: #24292f; text-decoration: none; }
    .export-link-card:hover { border-color: #afb8c1; text-decoration: none; }
    .export-link-card-title { color: #24292f; font-size: 1.05rem; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
    .export-link-card-desc { color: #57606a; font-size: 0.92rem; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .export-meta { margin: 0 0 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid #eaeef2; color: #57606a; font-size: 0.92rem; font-weight: 700; }
    .export-math-display { display: block; margin: 1rem 0; overflow-x: auto; overflow-y: hidden; }
    .export-math-inline { display: inline; }
    mjx-container { overflow-x: auto; overflow-y: hidden; max-width: 100%; }
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
  <h1>${cleanTitle(item.pageInfo.title || target.titleHint)}</h1>
  ${publishedMeta ? `<p class="export-meta">发布时间：${publishedMeta}</p>` : ''}
  <p><a href="${target.url}">知乎原文</a></p>
  ${html}
</body>
</html>`;

  await fs.writeFile(path.join(contentDir, 'index.md'), markdown, 'utf8');
  await fs.writeFile(path.join(contentDir, 'index.html'), htmlDocument, 'utf8');
  await fs.writeFile(path.join(contentDir, 'images.json'), JSON.stringify(imageResults, null, 2), 'utf8');

  return {
    ...item,
    markdown: path.relative(outputRoot, path.join(contentDir, 'index.md')).replaceAll('\\', '/'),
    html: path.relative(outputRoot, path.join(contentDir, 'index.html')).replaceAll('\\', '/'),
    images: imageResults,
  };
};

const run = async () => {
  await ensureDir(outputRoot);
  await ensureDir(contentRoot);
  await ensureDir(assetRoot);

  const profile = await prepareTemporaryEdgeProfile();
  let context;

  try {
    context = await chromium.launchPersistentContext(profile.tempUserData, {
      executablePath: edgePath,
      headless,
      viewport: { width: 1280, height: 1600 },
      locale: 'zh-CN',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0',
      args: [`--profile-directory=${edgeProfileDirectory}`, '--disable-blink-features=AutomationControlled'],
    });

    const extracted = await limitConcurrency(targets, Math.min(maxConcurrency, targets.length), async (target) => {
      const page = await context.newPage();
      try {
        return await extractArticle(page, target);
      } catch (error) {
        return {
          ok: false,
          target,
          error: error.message,
        };
      } finally {
        await page.close().catch(() => {});
      }
    });

    await context.close();

    const saved = await limitConcurrency(extracted, maxConcurrency, saveExport);
    const report = {
      generatedAt: new Date().toISOString(),
      maxConcurrency,
      browser: {
        executablePath: edgePath,
        profileSource: path.join(edgeUserDataDir, edgeProfileDirectory),
        usedTemporaryProfile: true,
        headless,
      },
      targets,
      results: saved.map((item) => ({
        ok: item.ok,
        kind: item.target.kind,
        slug: item.target.slug,
        url: item.target.url,
        title: item.pageInfo?.title,
        publishedAt: item.pageInfo?.publishedAt,
        modifiedAt: item.pageInfo?.modifiedAt,
        textLength: item.pageInfo?.body?.text?.length,
        markdown: item.markdown,
        html: item.html,
        imageCount: item.images?.length ?? 0,
        imageOkCount: item.images?.filter((image) => image.ok).length ?? 0,
        imageOriginalBytes: item.images?.reduce((sum, image) => sum + (image.originalBytes ?? 0), 0) ?? 0,
        imageOutputBytes: item.images?.reduce((sum, image) => sum + (image.outputBytes ?? 0), 0) ?? 0,
        error: item.error,
      })),
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }

    await fs.rm(profile.tempRoot, { recursive: true, force: true }).catch(() => {});
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
