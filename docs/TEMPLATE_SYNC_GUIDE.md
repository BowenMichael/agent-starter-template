# 🔄 Upstream Agent Template Synchronization Guide

This guide details the implementation, architecture, and operation of the **Upstream Agent Template Synchronization System**. It enables any downstream project (like `f1-frontend` or future microservices) to continuously inform and synchronize agent enhancements back to the upstream [BowenMichael/agent-starter-template](https://github.com/BowenMichael/agent-starter-template) repository, as well as pull downstream updates.

---

## 1. 💡 Why Bi-Directional Template Synchronization?

In an **Agent-Driven Development** paradigm:
1. **Agents Learn by Doing**: As autonomous agents encounter real-world bugs, build errors, context limits, and new frameworks in downstream projects, developers and agents refine prompt contracts, token guardrails, and CI workflows.
2. **Prevent Knowledge Isolation**: Without synchronization, rule improvements made in Project A never reach Project B, forcing developers to reinvent the wheel.
3. **Template Drift Prevention**: A starter template should be a living blueprint that absorbs collective architectural learnings from all projects built with it.

---

## 2. 🏗️ Architecture & Component Overview

The synchronization mechanism is intentionally decoupled, tech-stack agnostic, and uses a **PR-gated pull/push model**:

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer / Autonomous Agent
    participant Local as Downstream Repo (e.g. f1-frontend)
    participant CLI as scripts/agent-sync.js
    participant Actions as GitHub Actions Sync Runner
    participant Upstream as Upstream Template (agent-starter-template)

    Note over Local,Upstream: 1. Continuous Evolution in Downstream Project
    Dev->>Local: Refine AGENTS.md, workflows, or MCP configs
    
    alt Automated Push via CI
        Local->>Actions: Push to master / main with changes to agent files
        Actions->>CLI: node scripts/agent-sync.js --push
        CLI->>Upstream: Propose Pull Request (feat/sync-updates)
    else Interactive Push via CLI
        Dev->>CLI: npm run agent:sync:push
        CLI->>Upstream: Open Pull Request with diff summary
    end

    Note over Upstream: 2. Review & Upstream Merge
    Upstream-->>Dev: Reviewer approves PR; template master updated

    Note over Local,Upstream: 3. Downstream Ingestion
    Dev->>CLI: npm run agent:sync:pull
    CLI->>Local: Pulls latest template improvements with automatic .bak backup
```

### Synchronized File Set
The sync engine tracks the canonical agent operating system files:
- `AGENTS.md` (Operating system rulebook, guardrails, worktree protocol)
- `.github/ISSUE_TEMPLATE/agent_task.md` (Standardized agent task contract)
- `.github/pull_request_template.md` (Verification, checklist & video embed template)
- `.github/workflows/agent-task-dispatcher.yml` (Task event intake and webhook runner)
- `.github/workflows/agent-template-sync.yml` (Automated upstream synchronization CI)
- `mcp_config.template.json` (Model Context Protocol server blueprints)
- `scripts/agent-sync.js` (Zero-dependency CLI tool)
- `docs/TEMPLATE_SYNC_GUIDE.md` (Architecture and usage guide)

---

## 3. ⚙️ Implementation Deep Dive

### A. The CLI Tool: `scripts/agent-sync.js`
Built using zero external npm dependencies (using Node.js standard libraries `https`, `fs`, `path`, `child_process`) to guarantee that **any** tech stack (Python, Go, Rust, React, Node) can execute it without dependency conflicts:

1. **`--status` (Divergence Inspector)**:
   - Fetches the raw content or commit SHA for each tracked file from the upstream template (`BowenMichael/agent-starter-template@main`).
   - Normalizes cross-platform line endings (`\r\n` vs `\n`).
   - Outputs a clean terminal matrix showing which files are `🟢 In Sync`, `🟡 Diverged`, `🔵 Upstream Only`, or `🟡 New Local File`.
2. **`--pull` (Ingest Upstream Enhancements)**:
   - Downloads the latest versions from upstream.
   - Automatically writes a `.bak` backup copy of any modified local file before overwriting.
3. **`--push` (Propose Improvements Upstream)**:
   - Detects all local modifications compared to upstream.
   - When run with the GitHub CLI (`gh`) or a `GITHUB_TOKEN`/`GH_TOKEN`, it clones a shallow upstream branch, stages changed agent files, commits them, pushes to a unique sync branch (`sync/agent-updates-from-<repo>-<id>`), and creates a structured Pull Request on GitHub.
   - If `--direct` is passed and the caller has write access to the upstream repo, it pushes directly to `main`.

### B. Automated GitHub Actions Workflow: `.github/workflows/agent-template-sync.yml`
Automates upstream synchronization on every merge:
- **Triggers**:
  - `push` to `master`/`main` on paths matching tracked agent files.
  - `workflow_dispatch` for manual execution with optional custom repository or branch target.
- **Security & Authorization**:
  - Uses `secrets.TEMPLATE_SYNC_TOKEN` (a GitHub Personal Access Token with repository write permissions) or falls back to `secrets.GITHUB_TOKEN`.
  - Runs the headless CLI sync runner to create a clean Pull Request in `BowenMichael/agent-starter-template`.

---

## 4. 🚀 Quickstart & Developer Workflow

### Step 1: Inspect Status
Run the status check to see if your local project has evolved beyond the template:
```bash
npm run agent:sync:status
# or: node scripts/agent-sync.js --status
```

### Step 2: Propose Your Changes to Upstream
If you made changes to `AGENTS.md` or added a new MCP config:
```bash
npm run agent:sync:push
# or: node scripts/agent-sync.js --push
```
This opens a Pull Request on [BowenMichael/agent-starter-template](https://github.com/BowenMichael/agent-starter-template) linking your changes.

### Step 3: Pull New Template Updates
To incorporate the latest updates made in upstream:
```bash
npm run agent:sync:pull
# or: node scripts/agent-sync.js --pull
```

---

## 5. 🔐 Setting Up Secret Tokens for CI Automation

To allow the automated GitHub Actions runner in your downstream project to create PRs in `BowenMichael/agent-starter-template`:
1. Generate a GitHub Personal Access Token (Classic or Fine-grained) with `repo` scope.
2. In your downstream repository settings, navigate to:
   **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.
3. Name: `TEMPLATE_SYNC_TOKEN`
4. Value: Paste your GitHub PAT.

---

## 6. ⚖️ Why Decoupled Sync Over Git Submodules / Subtrees?

| Metric | Git Submodules | Git Subtree | Decoupled Sync (This Solution) |
| :--- | :--- | :--- | :--- |
| **Tech Stack Freedom** | Poor (Requires Git module knowledge) | Moderate (Complex git history interleaving) | **High** (Standard files, zero dependencies) |
| **Accidental Overwrites** | High risk of detached HEAD states | High risk of accidental subtree push | **Zero risk** (Pull requests act as review gates) |
| **New Project Overhead** | Requires recursive git clone | Requires complex remote tracking commands | **One command setup** (`setup.js`) |
| **Agent Autonomy** | Agents struggle with submodule pointer conflicts | Commits pollute application git history | **Clean, dedicated synchronization PRs** |
