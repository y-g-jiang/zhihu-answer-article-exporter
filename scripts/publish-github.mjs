import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repoName = process.env.GITHUB_REPO || 'zhihu-answer-article-exporter';
const branch = process.env.GITHUB_BRANCH || 'main';
const commitMessage = process.env.GITHUB_COMMIT_MESSAGE || 'Publish Zhihu answer/article exporter';
const dryRun = process.env.DRY_RUN === '1';
const enablePages = process.env.ENABLE_PAGES === '1';

const ignoredDirs = new Set([
  '.git',
  'article-export-sample',
  'content',
  'dist',
  'docs',
  'node_modules',
  'public',
  'qa-screenshots',
  'browser-profile',
]);
const ignoredFilePatterns = [/^\.env(?:\.|$)/, /\.log$/i, /^Thumbs\.db$/i, /^\.DS_Store$/i, /^profile-debug.*\.(?:json|png)$/i];
const ignoredRepoPaths = new Set(['data/zhihu-targets.json', 'data/slug-overrides.local.json']);
const remoteDeletePrefixes = [
  'article-export-sample/',
  'content/',
  'dist/',
  'docs/',
  'public/',
  'browser-profile/',
];
const remoteDeletePaths = new Set(['data/zhihu-targets.json', 'data/slug-overrides.local.json']);

const api = async (url, options = {}) => {
  if (!token) {
    throw new Error('Missing GITHUB_TOKEN or GH_TOKEN.');
  }

  const response = await fetch(`https://api.github.com${url}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body?.message || `${response.status} ${response.statusText}`;
    const error = new Error(`${options.method || 'GET'} ${url}: ${message}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
};

const apiMaybe = async (url, options = {}) => {
  try {
    return await api(url, options);
  } catch (error) {
    if (error.status === 404 || error.status === 409) {
      return null;
    }

    throw error;
  }
};

const shouldIgnoreFile = (name) => ignoredFilePatterns.some((pattern) => pattern.test(name));

const walkFiles = async (dir, root = dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) {
        continue;
      }

      files.push(...(await walkFiles(path.join(dir, entry.name), root)));
      continue;
    }

    if (!entry.isFile() || shouldIgnoreFile(entry.name)) {
      continue;
    }

    const absolute = path.join(dir, entry.name);
    const repoPath = path.relative(root, absolute).replaceAll(path.sep, '/');
    if (ignoredRepoPaths.has(repoPath)) {
      continue;
    }

    const stats = await fs.stat(absolute);
    files.push({
      absolute,
      repoPath,
      size: stats.size,
    });
  }

  return files;
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

const ensureRepository = async (owner) => {
  const existing = await apiMaybe(`/repos/${owner}/${repoName}`);
  if (existing) {
    return existing;
  }

  console.log(`Creating repository ${owner}/${repoName}`);
  return api('/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: repoName,
      private: false,
      auto_init: false,
      description: 'Repeatable exporter for Jiang Yaogeng Zhihu answers/articles.',
      has_issues: true,
      has_projects: false,
      has_wiki: false,
    }),
  });
};

const createBlob = async (owner, repo, file) => {
  const buffer = await fs.readFile(file.absolute);
  const blob = await api(`/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({
      content: buffer.toString('base64'),
      encoding: 'base64',
    }),
  });

  return {
    path: file.repoPath,
    mode: '100644',
    type: 'blob',
    sha: blob.sha,
  };
};

const flattenTree = async (owner, repo, treeSha, prefix = '') => {
  const tree = await api(`/repos/${owner}/${repo}/git/trees/${treeSha}`);
  const entries = [];

  for (const item of tree.tree ?? []) {
    const itemPath = `${prefix}${item.path}`;
    if (item.type === 'tree') {
      entries.push(...(await flattenTree(owner, repo, item.sha, `${itemPath}/`)));
      continue;
    }

    entries.push(itemPath);
  }

  return entries;
};

const remoteDeletionEntries = async (owner, repo, parentCommit) => {
  if (!parentCommit?.tree?.sha) {
    return [];
  }

  const paths = await flattenTree(owner, repo, parentCommit.tree.sha);
  return paths
    .filter((repoPath) => remoteDeletePaths.has(repoPath) || remoteDeletePrefixes.some((prefix) => repoPath.startsWith(prefix)))
    .map((repoPath) => ({
      path: repoPath,
      mode: '100644',
      type: 'blob',
      sha: null,
    }));
};

const configurePages = async (owner, repo) => {
  const existing = await apiMaybe(`/repos/${owner}/${repo}/pages`);
  if (existing) {
    await api(`/repos/${owner}/${repo}/pages`, {
      method: 'PUT',
      body: JSON.stringify({
        source: {
          branch,
          path: '/docs',
        },
      }),
    });
    return;
  }

  await api(`/repos/${owner}/${repo}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      source: {
        branch,
        path: '/docs',
      },
    }),
  });
};

const run = async () => {
  const files = (await walkFiles(repoRoot)).sort((a, b) => a.repoPath.localeCompare(b.repoPath));
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  console.log(`Repository root: ${repoRoot}`);
  console.log(`Files to publish: ${files.length}`);

  if (dryRun) {
    files.forEach((file) => console.log(file.repoPath));
    return;
  }

  if (!token) {
    throw new Error('Set GITHUB_TOKEN or GH_TOKEN before publishing.');
  }

  const user = await api('/user');
  const owner = process.env.GITHUB_OWNER || user.login;
  const repo = await ensureRepository(owner);
  const repoOwner = repo.owner.login;

  const ref = await apiMaybe(`/repos/${repoOwner}/${repoName}/git/ref/heads/${branch}`);
  const parentSha = ref?.object?.sha || null;
  const parentCommit = parentSha ? await api(`/repos/${repoOwner}/${repoName}/git/commits/${parentSha}`) : null;

  console.log(`Uploading ${files.length} files to ${repoOwner}/${repoName}`);
  const treeEntries = await limitConcurrency(files, 6, (file) => createBlob(repoOwner, repoName, file));
  const deleteEntries = await remoteDeletionEntries(repoOwner, repoName, parentCommit);
  if (deleteEntries.length) {
    console.log(`Removing ${deleteEntries.length} generated/private files from remote tree`);
  }

  const tree = await api(`/repos/${repoOwner}/${repoName}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      ...(parentCommit?.tree?.sha ? { base_tree: parentCommit.tree.sha } : {}),
      tree: [...deleteEntries, ...treeEntries],
    }),
  });

  const commit = await api(`/repos/${repoOwner}/${repoName}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: commitMessage,
      tree: tree.sha,
      parents: parentSha ? [parentSha] : [],
    }),
  });

  if (parentSha) {
    await api(`/repos/${repoOwner}/${repoName}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({
        sha: commit.sha,
        force: false,
      }),
    });
  } else {
    await api(`/repos/${repoOwner}/${repoName}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: commit.sha,
      }),
    });
    await api(`/repos/${repoOwner}/${repoName}`, {
      method: 'PATCH',
      body: JSON.stringify({ default_branch: branch }),
    });
  }

  if (enablePages) {
    await configurePages(repoOwner, repoName);
  }

  console.log(JSON.stringify(
    {
      repository: `https://github.com/${repoOwner}/${repoName}`,
      branch,
      commit: commit.sha,
      pages: enablePages ? `https://${repoOwner}.github.io/${repoName}/` : null,
    },
    null,
    2
  ));
};

run().catch((error) => {
  console.error(error.message);
  if (error.body) {
    console.error(JSON.stringify(error.body, null, 2));
  }
  process.exitCode = 1;
});
