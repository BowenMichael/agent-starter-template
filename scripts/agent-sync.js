#!/usr/bin/env node
/**
 * Agent Template Synchronization CLI
 * 
 * Synchronizes autonomous agent governance files, workflows, and rules
 * between downstream repositories and the upstream template repository.
 * 
 * Usage:
 *   node scripts/agent-sync.js --status
 *   node scripts/agent-sync.js --pull
 *   node scripts/agent-sync.js --push [--direct]
 *   node scripts/agent-sync.js --help
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const DEFAULT_UPSTREAM = 'BowenMichael/agent-starter-template';
const DEFAULT_BRANCH = 'main';

// Tracked files representing the agent operating system blueprint
const TRACKED_FILES = [
  'AGENTS.md',
  '.github/ISSUE_TEMPLATE/agent_task.md',
  '.github/pull_request_template.md',
  '.github/workflows/agent-task-dispatcher.yml',
  '.github/workflows/agent-template-sync.yml',
  'mcp_config.template.json',
  'scripts/agent-sync.js',
  'docs/TEMPLATE_SYNC_GUIDE.md'
];

// CLI Argument Parsing
const args = process.argv.slice(2);
let mode = 'status';
let upstreamRepo = DEFAULT_UPSTREAM;
let upstreamBranch = DEFAULT_BRANCH;
let isDirect = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--status' || arg === 'status') mode = 'status';
  else if (arg === '--pull' || arg === 'pull') mode = 'pull';
  else if (arg === '--push' || arg === 'push') mode = 'push';
  else if (arg === '--direct') isDirect = true;
  else if (arg === '--upstream' && args[i + 1]) {
    upstreamRepo = args[++i];
  } else if (arg === '--branch' && args[i + 1]) {
    upstreamBranch = args[++i];
  } else if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
}

function printHelp() {
  console.log(`
🔄 Agent Template Synchronization CLI
=======================================
Keeps agent rules, workflows, and prompts in sync with upstream template:
https://github.com/${upstreamRepo}

Usage:
  node scripts/agent-sync.js [command] [options]

Commands:
  --status            Inspect divergence between local and upstream files (default)
  --pull              Pull latest template updates from upstream into local project
  --push              Push local improvements back to upstream template repo

Options:
  --upstream <repo>   Upstream repository slug (default: ${DEFAULT_UPSTREAM})
  --branch <branch>   Upstream branch (default: ${DEFAULT_BRANCH})
  --direct            Push directly to upstream default branch (if authorized)
  --help, -h          Show this help message

Examples:
  node scripts/agent-sync.js --status
  node scripts/agent-sync.js --pull
  node scripts/agent-sync.js --push
  npm run agent:sync:status
`);
}

// Find repository root
function getRepoRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

const REPO_ROOT = getRepoRoot();

// Helper to get GitHub token from env or gh CLI
function getAuthToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const token = execSync('gh auth token', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (token) return token;
  } catch {
    // Ignore error if gh not configured
  }
  return null;
}

// Fetch file from GitHub API / Raw content
function fetchUpstreamFile(filePath) {
  return new Promise((resolve) => {
    const rawUrl = `https://raw.githubusercontent.com/${upstreamRepo}/${upstreamBranch}/${filePath}`;
    const token = getAuthToken();
    const headers = {
      'User-Agent': 'agent-sync-tool'
    };
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    https.get(rawUrl, { headers }, (res) => {
      if (res.statusCode === 404) {
        return resolve({ exists: false, content: null });
      }
      if (res.statusCode !== 200) {
        return resolve({ exists: false, error: `HTTP ${res.statusCode}` });
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ exists: true, content: data }));
    }).on('error', (err) => {
      resolve({ exists: false, error: err.message });
    });
  });
}

// Normalize line endings for clean cross-platform comparison
function normalizeContent(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\r\n/g, '\n').trim();
}

// Command: Status
async function handleStatus() {
  console.log(`\n🔍 Checking synchronization with upstream [${upstreamRepo}@${upstreamBranch}]...\n`);
  console.log('='.repeat(78));
  console.log(String('File').padEnd(46) + String('Status').padEnd(20) + 'Action Needed');
  console.log('-'.repeat(78));

  let hasDivergence = false;
  let aheadCount = 0;
  let behindCount = 0;

  for (const relPath of TRACKED_FILES) {
    const localPath = path.join(REPO_ROOT, relPath);
    const localExists = fs.existsSync(localPath);
    const localContent = localExists ? fs.readFileSync(localPath, 'utf8') : null;

    const upstream = await fetchUpstreamFile(relPath);

    let statusText = '';
    let actionText = '';

    if (!localExists && !upstream.exists) {
      statusText = '⚪ Not Present';
      actionText = 'None';
    } else if (localExists && !upstream.exists) {
      statusText = '🟡 New Local File';
      actionText = 'Push to Upstream';
      hasDivergence = true;
      aheadCount++;
    } else if (!localExists && upstream.exists) {
      statusText = '🔵 Upstream Only';
      actionText = 'Run --pull to import';
      hasDivergence = true;
      behindCount++;
    } else {
      const normLocal = normalizeContent(localContent);
      const normUpstream = normalizeContent(upstream.content);

      if (normLocal === normUpstream) {
        statusText = '🟢 In Sync';
        actionText = 'Up to date';
      } else {
        statusText = '🟡 Diverged';
        actionText = 'Review diff / Push';
        hasDivergence = true;
        aheadCount++;
      }
    }

    console.log(relPath.padEnd(46) + statusText.padEnd(20) + actionText);
  }

  console.log('='.repeat(78));
  if (!hasDivergence) {
    console.log('✨ All agent governance files are fully synchronized with upstream template!\n');
  } else {
    console.log(`⚠️ Divergence detected (${aheadCount} ahead/modified, ${behindCount} missing/behind).`);
    console.log('👉 To pull upstream updates:   node scripts/agent-sync.js --pull');
    console.log('👉 To propose upstream sync:  node scripts/agent-sync.js --push\n');
  }
}

// Command: Pull
async function handlePull() {
  console.log(`\n📥 Pulling latest agent files from [${upstreamRepo}@${upstreamBranch}]...\n`);
  let updatedCount = 0;

  for (const relPath of TRACKED_FILES) {
    const localPath = path.join(REPO_ROOT, relPath);
    const upstream = await fetchUpstreamFile(relPath);

    if (!upstream.exists) {
      console.log(`⏩ Skipping ${relPath} (not in upstream template)`);
      continue;
    }

    const localExists = fs.existsSync(localPath);
    const normUpstream = normalizeContent(upstream.content);

    if (localExists) {
      const normLocal = normalizeContent(fs.readFileSync(localPath, 'utf8'));
      if (normLocal === normUpstream) {
        console.log(`✅ ${relPath} is already up to date.`);
        continue;
      }

      // Backup local before overwriting
      const backupPath = `${localPath}.bak`;
      fs.copyFileSync(localPath, backupPath);
      console.log(`📦 Backed up current version to ${relPath}.bak`);
    } else {
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
    }

    fs.writeFileSync(localPath, upstream.content, 'utf8');
    console.log(`⬇️ Updated ${relPath}`);
    updatedCount++;
  }

  console.log(`\n🎉 Pull complete! ${updatedCount} file(s) updated.\n`);
}

// Command: Push
async function handlePush() {
  console.log(`\n🚀 Proposing agent improvements to upstream [${upstreamRepo}]...\n`);
  const token = getAuthToken();

  // Check which files differ
  const changedFiles = [];
  for (const relPath of TRACKED_FILES) {
    const localPath = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(localPath)) continue;

    const localContent = fs.readFileSync(localPath, 'utf8');
    const upstream = await fetchUpstreamFile(relPath);

    if (!upstream.exists || normalizeContent(localContent) !== normalizeContent(upstream.content)) {
      changedFiles.push(relPath);
    }
  }

  if (changedFiles.length === 0) {
    console.log('✨ No changes detected between local files and upstream template. Nothing to push!\n');
    return;
  }

  console.log(`Identified ${changedFiles.length} file(s) with improvements to push:`);
  changedFiles.forEach(f => console.log(`   - ${f}`));

  // Check if gh CLI is available
  let hasGh = false;
  try {
    execSync('gh --version', { stdio: 'ignore' });
    hasGh = true;
  } catch {}

  const sourceRepo = path.basename(REPO_ROOT);
  const syncBranchName = `sync/agent-updates-from-${sourceRepo}-${Date.now().toString().slice(-4)}`;

  if (isDirect && hasGh) {
    console.log(`\n⚡ Direct push requested. Applying updates directly to ${upstreamRepo}@${upstreamBranch}...`);
    // Direct sync using gh api or clone
    syncViaClone({ directPush: true, changedFiles });
    return;
  }

  if (hasGh) {
    console.log(`\n🌿 Creating upstream branch and Pull Request via GitHub CLI...`);
    syncViaClone({ directPush: false, syncBranchName, changedFiles });
  } else {
    console.log('\nℹ️ GitHub CLI (`gh`) not detected or not authenticated.');
    console.log('To synchronize manually:');
    console.log(`1. Fork or clone https://github.com/${upstreamRepo}`);
    console.log(`2. Copy the modified files listed above into your clone.`);
    console.log(`3. Commit and open a Pull Request against ${upstreamRepo}.`);
    console.log('\nAlternatively, automated CI will handle this when merged to your default branch via .github/workflows/agent-template-sync.yml');
  }
}

function syncViaClone({ directPush, syncBranchName, changedFiles }) {
  const tmpDir = path.join(REPO_ROOT, '.tmp-agent-sync');
  try {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

function getCloneUrl(repo) {
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    const token = getAuthToken();
    return token ? `https://x-access-token:${token}@github.com/${repo}.git` : `https://github.com/${repo}.git`;
  }
  try {
    execSync('ssh -o BatchMode=yes -o ConnectTimeout=3 -T git@github.com', { stdio: 'ignore' });
    return `git@github.com:${repo}.git`;
  } catch (e) {
    if (e.status === 1) {
      return `git@github.com:${repo}.git`;
    }
  }
  const token = getAuthToken();
  return token ? `https://x-access-token:${token}@github.com/${repo}.git` : `https://github.com/${repo}.git`;
}

    const cloneUrl = getCloneUrl(upstreamRepo);

    console.log(`   Cloning upstream repository ${upstreamRepo}...`);
    execSync(`git clone --depth 1 --branch ${upstreamBranch} "${cloneUrl}" "${tmpDir}"`, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    execSync('git config user.name "Autonomous Agent"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "agent@f1-viewer.local"', { cwd: tmpDir, stdio: 'pipe' });

    if (!directPush) {
      execSync(`git checkout -b ${syncBranchName}`, { cwd: tmpDir, stdio: 'pipe' });
    }

    // Copy modified files
    for (const relPath of changedFiles) {
      const src = path.join(REPO_ROOT, relPath);
      const dest = path.join(tmpDir, relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }

    const gitStatus = execSync('git status --porcelain', { cwd: tmpDir, encoding: 'utf8' }).trim();
    if (!gitStatus) {
      console.log('   No file differences found after staging.');
      return;
    }

    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    const commitMsg = `feat(sync): incorporate agent rule & workflow updates from ${path.basename(REPO_ROOT)}`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: tmpDir, stdio: 'pipe' });

    if (directPush) {
      execSync(`git push origin ${upstreamBranch}`, { cwd: tmpDir, stdio: 'pipe' });
      console.log(`\n✅ Successfully pushed updates directly to ${upstreamRepo}@${upstreamBranch}!`);
    } else {
      execSync(`git push origin ${syncBranchName}`, { cwd: tmpDir, stdio: 'pipe' });
      const prTitle = `feat(sync): agent governance updates from ${path.basename(REPO_ROOT)}`;
      const prBody = `Automated agent governance synchronization.\n\n### Updated Files:\n${changedFiles.map(f => `- \`${f}\``).join('\n')}\n\nPropagated from \`${path.basename(REPO_ROOT)}\`.`;
      execSync(`gh pr create --repo ${upstreamRepo} --title "${prTitle}" --body "${prBody}" --head ${syncBranchName} --base ${upstreamBranch}`, {
        cwd: tmpDir,
        stdio: 'pipe'
      });
      console.log(`\n🎉 Pull Request created successfully on ${upstreamRepo}!`);
    }
  } catch (err) {
    console.error('⚠️ Sync operation encountered an issue:', err.message);
  } finally {
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

// Main Runner
async function main() {
  switch (mode) {
    case 'status':
      await handleStatus();
      break;
    case 'pull':
      await handlePull();
      break;
    case 'push':
      await handlePush();
      break;
    default:
      printHelp();
  }
}

main().catch(err => {
  console.error('❌ Sync script failure:', err);
  process.exit(1);
});
