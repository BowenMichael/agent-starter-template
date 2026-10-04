# Autonomous Agent Guidelines & Budget Guardrails

## 1. Autonomous Task Lifecycle & Worktree Isolation

### A. Board Status-Driven Takeover & Comment Ingestion
The **GitHub Project Board** (`F1 Viewer - Sprint & Agent Board`) is the primary driver of agent task execution:
1. **Board Status Trigger**: Agents actively monitor the project board for items in the **`📋 Ready for Agent`** column.
2. **Review User Comments First**: Before writing any code, the agent MUST read the latest comments on the issue to ingest user feedback, questions, and scope refinements.
3. **State Transition**:
   - Move the card on the Project Board to **`⚡ In Progress`**.
   - Ensure the issue label is set to `agent:in-progress`.
4. **Mandatory Issue Takeover Comment**:
   The agent **MUST immediately comment** on the GitHub issue acknowledging the user's specific comments and outlining the updated plan:
   ```markdown
   🤖 **Agent Takeover: Development Started**

   - **Feedback Acknowledged**: [Briefly address the user's latest comment/request]
   - **Worktree**: `.worktrees/issue-<number>`
   - **Branch**: `feat/issue-<number>-<short-description>`
   - **Planned Approach**:
     1. [Step 1: Next immediate deliverable]
     2. [Step 2: Component / Implementation]
     3. [Step 3: Verification & demo video recording]
   - **Budget Guardrail**: Max 15 tool execution turns before pause & approval.
   ```

### B. Git Worktree Isolation (Strictly Required)
To prevent interference with the user's active editor, other agent sessions, or local uncommitted changes:
1. **Never work in the root directory**: All feature development must occur in an isolated Git worktree.
2. **Worktree Creation & Upstream Sync**:
   ```bash
   git worktree add -b feat/issue-<number>-<short-description> .worktrees/issue-<number> master
   ```
   *Always pull/merge the latest upstream changes into the worktree branch before beginning work:*
   ```bash
   git fetch origin
   git merge origin/master # or default branch (main/master)
   ```
3. **Execution**:
   - All file edits, typechecks, component creation, and commits must be scoped to `.worktrees/issue-<number>`.
4. **Completion & Cleanup**:
   - Push the branch from the worktree:
     ```bash
     git push origin feat/issue-<number>-<short-description>
     ```
   - Open the Pull Request linking to the issue with demo video and screenshots.
   - Clean up the worktree once the branch is pushed:
     ```bash
     git worktree remove .worktrees/issue-<number>
     ```
   - Tag the issue with `agent:review`.

### C. Issue & Project Board Synchronization (Anti-Duplication Protocol)
To ensure multiple agents or team members never duplicate work:
1. **Check Claim Status First**:
   - Before taking any action on an issue, verify it is strictly in `agent:ready` state and has no active worktree in `.worktrees/`.
   - If an issue is already labeled `agent:in-progress`, `agent:needs-approval`, or has an active worktree, **DO NOT TOUCH IT**.
2. **Immediate Project Board Update**:
   - Move the card on the GitHub Project Board to **`⚡ In Progress`** upon takeover.
3. **Always Post Deliverables Directly to the GitHub Issue**:
   - **Never keep answers only in local IDE chat.**
   - All architecture specifications, deployment guides, research findings, and task completions must be posted as formal comments on the GitHub issue.
4. **Mark Acceptance Criteria Checkboxes**:
   - When criteria are satisfied, the agent MUST update the GitHub issue body via API to check off the boxes (`- [x]`).
5. **Move to Review**:
   - Once all criteria are met, update the issue labels to `agent:review` and move the card on the Project Board to **`🔍 In Review`**.

---

## 2. 🛑 Token & Complexity Budget Guardrail (Mandatory Pause)

To ensure tasks remain cost-effective and prevent run-away context/token consumption, the agent must enforce the following guardrail:

### Thresholds
- **Turn Limit**: If a single task reaches **15 tool execution turns** without completing the implementation.
- **Context / Token Growth**: If the conversation encounters repetitive failure loops, unexpected circular dependencies, or major unplanned refactoring.

### Mandatory Pause Protocol
When a threshold is reached, the agent **MUST IMMEDIATELY PAUSE** execution on the issue and execute the following:

1. **Tag the Issue**:
   - Remove `agent:in-progress`.
   - Add `agent:needs-approval`.
2. **Post Insights Breakdown** (both as an Issue comment and to the user):
   ```markdown
   ⚠️ **Task Paused: Token / Complexity Budget Threshold Reached**
   
   ### 📊 Task Insights
   - **Progress Completed**: [Summary of files edited and components built]
   - **Remaining Work**: [Exact items needed to reach acceptance criteria]
   - **Cost / Complexity Driver**: [Explain why token consumption is high, e.g. breaking API changes, ambiguous requirement, circular imports]
   - **Proposed Next Action**: [Option A: Approve 10 more turns to finish; Option B: Narrow scope; Option C: Human intervention]
   ```
3. **Await User Approval**:
   - The agent MUST NOT take further code modification actions until the user explicitly responds with approval to proceed.

---

## 3. 🔄 Template Synchronization Protocol (Upstream Feedback Loop)

To prevent fragmentation and ensure learnings, guardrails, and workflow improvements benefit the entire agent ecosystem:

1. **Check Sync Divergence**:
   - When introducing improvements to agent guidelines (`AGENTS.md`), issue templates, workflows, or MCP configuration, run:
     ```bash
     node scripts/agent-sync.js --status
     ```
2. **Propose Improvements Upstream**:
   - To propagate agent framework enhancements back to `BowenMichael/agent-starter-template`, run:
     ```bash
     node scripts/agent-sync.js --push
     ```
   - Alternatively, automated CI (`.github/workflows/agent-template-sync.yml`) will propose a PR upon merging changes to master.
3. **Ingest Upstream Updates**:
   - Before starting major agent refactoring tasks, agents may check for upstream template updates:
     ```bash
     node scripts/agent-sync.js --pull
     ```

