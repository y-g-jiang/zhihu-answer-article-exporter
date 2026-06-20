import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const profileUrl = process.env.ZHIHU_PROFILE_URL ?? 'https://www.zhihu.com/people/<profile-id>/posts';
const outputRoot = path.resolve(repoRoot, process.env.ZHIHU_PROFILE_OUTPUT_ROOT ?? 'article-export-sample');
const outputPath = path.join(outputRoot, 'targets.json');
const browserProfileRoot = path.join(outputRoot, 'browser-profile');
const edgePath = process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const edgeUserDataDir =
  process.env.EDGE_USER_DATA_DIR ?? path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Edge', 'User Data');
const edgeProfileDirectory = process.env.EDGE_PROFILE_DIRECTORY ?? 'Default';
const headless = process.env.HEADLESS === '1';
const useInteractiveProfile = process.env.ZHIHU_PROFILE_INTERACTIVE === '1';
const waitForLogin = process.env.ZHIHU_PROFILE_WAIT_FOR_LOGIN === '1';
const maxStableRounds = Number.parseInt(process.env.ZHIHU_PROFILE_STABLE_ROUNDS ?? '8', 10);
const maxScrollRounds = Number.parseInt(process.env.ZHIHU_PROFILE_MAX_SCROLLS ?? '180', 10);

const sourceUrls = (() => {
  if (process.env.ZHIHU_PROFILE_URLS) {
    return process.env.ZHIHU_PROFILE_URLS.split(',').map((item) => item.trim()).filter(Boolean);
  }

  const parsed = new URL(profileUrl);
  const match = parsed.pathname.match(/^(\/people\/[^/]+)(?:\/.*)?$/);
  if (!match) {
    return [profileUrl];
  }

  return [`${parsed.origin}${match[1]}/posts`, `${parsed.origin}${match[1]}/answers`];
})();

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
  if (useInteractiveProfile) {
    await ensureDir(browserProfileRoot);
    return { tempRoot: null, tempUserData: browserProfileRoot, keep: true };
  }

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

const normalizeUrl = (rawUrl) => {
  const parsed = new URL(rawUrl, profileUrl);
  const answerMatch = parsed.pathname.match(/\/question\/(\d+)\/answer\/(\d+)/);
  if (answerMatch) {
    return `https://www.zhihu.com/question/${answerMatch[1]}/answer/${answerMatch[2]}`;
  }

  const articleMatch = parsed.hostname.includes('zhuanlan.zhihu.com') && parsed.pathname.match(/\/p\/(\d+)/);
  if (articleMatch) {
    return `https://zhuanlan.zhihu.com/p/${articleMatch[1]}`;
  }

  return null;
};

const kindFromUrl = (url) => (url.includes('/answer/') ? 'answer' : 'article');

const idFromUrl = (url) => {
  const answerMatch = url.match(/\/answer\/(\d+)/);
  const articleMatch = url.match(/\/p\/(\d+)/);
  return answerMatch?.[1] ?? articleMatch?.[1] ?? null;
};

const collectLinks = async (page) =>
  page.evaluate(() => {
    const normalizeText = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('a[href]')]
      .map((link) => {
        const href = link.href;
        const card = link.closest('.List-item, .ContentItem, .ArticleItem, .PostItem, [data-za-detail-view-path-module]');
        const title =
          normalizeText(link.querySelector('.ContentItem-title, .ArticleItem-title, h2, h3')?.textContent) ||
          normalizeText(link.textContent) ||
          normalizeText(card?.querySelector('.ContentItem-title, .ArticleItem-title, h2, h3')?.textContent);
        return { href, title };
      })
      .filter((item) => /\/question\/\d+\/answer\/\d+|zhuanlan\.zhihu\.com\/p\/\d+/.test(item.href));
  });

const waitUntilLoggedInOrReady = async (page) => {
  if (!waitForLogin) {
    return;
  }

  console.log('Waiting for Zhihu login/content in the controlled browser window...');
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    let state;
    try {
      state = await page.evaluate(() => {
        const text = document.body?.innerText ?? '';
        const links = [...document.querySelectorAll('a[href]')].filter((link) =>
          /\/question\/\d+\/answer\/\d+|zhuanlan\.zhihu\.com\/p\/\d+/.test(link.href)
        ).length;
        return {
          links,
          blocked: /该用户设置了隐私保护|登录查看|登录\/注册|Login|Sign in/i.test(text),
          textStart: text.slice(0, 500),
        };
      });
    } catch {
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(1200);
      continue;
    }

    if (state.links > 0 || !state.blocked) {
      console.log(`Login/content gate cleared; current visible target links: ${state.links}`);
      return;
    }

    await page.waitForTimeout(3000);
  }

  throw new Error('Timed out waiting for Zhihu login/content. Complete login in the controlled browser and rerun.');
};

const slugForTarget = (kind, id) => `${kind}-${id}`;

const run = async () => {
  await ensureDir(outputRoot);
  const profile = await prepareTemporaryEdgeProfile();
  let context;

  try {
    context = await chromium.launchPersistentContext(profile.tempUserData, {
      executablePath: edgePath,
      headless,
      viewport: { width: 1280, height: 1400 },
      locale: 'zh-CN',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0',
      args: [`--profile-directory=${edgeProfileDirectory}`, '--disable-blink-features=AutomationControlled'],
    });

    const page = await context.newPage();
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'media', 'font'].includes(type)) {
        return route.abort();
      }
      return route.continue();
    });

    const seen = new Map();

    for (const urlToCollect of sourceUrls) {
      await page.goto(urlToCollect, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2500);
      await waitUntilLoggedInOrReady(page);

      if (process.env.ZHIHU_PROFILE_DEBUG === '1') {
        const suffix = urlToCollect.endsWith('/answers') ? 'answers' : 'posts';
        const debug = await page.evaluate(() => ({
          url: location.href,
          title: document.title,
          text: document.body?.innerText?.slice(0, 4000) ?? '',
          hrefs: [...document.querySelectorAll('a[href]')].slice(0, 120).map((link) => ({
            text: link.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120),
            href: link.href,
          })),
        }));
        await fs.writeFile(path.join(outputRoot, `profile-debug-${suffix}.json`), `${JSON.stringify(debug, null, 2)}\n`, 'utf8');
        await page.screenshot({ path: path.join(outputRoot, `profile-debug-${suffix}.png`), fullPage: true });
      }

      let stableRounds = 0;
      let lastCount = seen.size;

      for (let round = 0; round < maxScrollRounds && stableRounds < maxStableRounds; round += 1) {
        for (const item of await collectLinks(page)) {
          const url = normalizeUrl(item.href);
          if (!url || seen.has(url)) {
            continue;
          }

          const kind = kindFromUrl(url);
          const id = idFromUrl(url);
          seen.set(url, {
            kind,
            slug: slugForTarget(kind, id),
            titleHint: item.title || null,
            url,
            zhihuId: id,
          });
        }

        if (seen.size === lastCount) {
          stableRounds += 1;
        } else {
          stableRounds = 0;
          lastCount = seen.size;
        }

        console.log(`${urlToCollect} scroll ${round + 1}: ${seen.size} total targets`);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1600);
      }
    }

    const targets = [...seen.values()];
    await fs.writeFile(
      outputPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: profileUrl,
          count: targets.length,
          targets,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    console.log(`Wrote ${targets.length} targets to ${outputPath}`);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    if (!profile.keep && profile.tempRoot) {
      await fs.rm(profile.tempRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
