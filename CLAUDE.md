# WorkTree Pilot — Claude Code Development Instructions

## What This Is

You are building **WorkTree Pilot**, a VS Code / Cursor extension that serves as the **control plane for parallel AI development**. It combines git worktree management, Claude Code agent session orchestration, Agent Teams integration, and merge intelligence into a single IDE-native experience.

Think of it as "Docker Desktop for AI coding agents" — you don't replace Claude Code, you wrap it with visibility, safety, and one-click orchestration.

## Current State

There is existing mid-way code for a basic WorkTree Pilot extension that handles worktree creation and management. We are now **pivoting the vision** significantly. The tool is no longer just a worktree UI — it is a full control plane for parallel AI development. Review the existing codebase first, understand what's already built, then restructure and extend based on the plan below. Reuse what makes sense, refactor or replace what doesn't fit the new architecture.

## Core Philosophy

- This extension is a **wrapper and management layer**, not a replacement for Claude Code or git
- Every feature must work with Claude Code's native `--worktree` flag and Agent Teams feature
- Safety and visibility are the primary differentiators — overlap detection, merge sequencing, conflict prevention
- The UI must feel native to VS Code — sidebar TreeViews, WebView panels, integrated terminals
- Start simple, layer complexity. Each module should work independently

---

## Architecture Overview

The extension has 5 core modules. Build them in this order.

### Module 1: Worktree Manager (Foundation)

Handles all git worktree operations through a VS Code sidebar.

**Sidebar TreeView** showing all worktrees in the current repo:
- Each worktree item shows: name, branch, status (clean / has changes / active session)
- Status icons: green dot for active Claude Code session, yellow for uncommitted changes, grey for idle
- Right-click context menu on each worktree: Open in Terminal, Open in New Window, Launch Claude Code, Delete Worktree, View Diff

**Create Worktree action** (button at top of sidebar):
- Input: worktree name (auto-suggests from task/branch naming)
- Input: base branch (defaults to main/master)
- Option: auto-run dependency install (detect package manager: npm, yarn, pnpm, pip, poetry)
- Creates worktree at `.claude/worktrees/<name>/` using `git worktree add`
- Refreshes the sidebar TreeView

**Delete Worktree action:**
- Safety check: warn if there are uncommitted changes or unpushed commits
- Runs `git worktree remove` and optionally deletes the branch with `git branch -d`
- Refreshes the sidebar TreeView

**Switch to Worktree:**
- Opens the worktree directory in a new VS Code window, or switches the current workspace
- Use `vscode.commands.executeCommand('vscode.openFolder', ...)` for new window

**Cleanup Wizard:**
- Scans for stale worktrees (no changes, no active sessions, older than N days)
- Batch delete with confirmation

**Git commands**: Use `child_process.execSync` or `execa` to run git commands. Parse output as needed. Do not use a git library unless absolutely necessary — keep dependencies minimal.

---

### Module 2: Agent Session Tracker (Dashboard)

Tracks and displays active Claude Code sessions running in worktrees.

**Session Spawning:**
- "Launch Claude Code" button per worktree in the sidebar
- Opens a VS Code integrated terminal in that worktree's directory
- Runs `claude --worktree <name>` or just `claude` if already inside the worktree dir
- Tracks the terminal instance and maps it to the worktree

**Dashboard Panel** (VS Code WebView):
- Build using React, bundled with Vite, rendered inside a VS Code WebView panel
- Opens as a tab in the editor area (like the built-in Welcome tab)
- Command palette: "WorkTree Pilot: Open Dashboard"

**Dashboard shows Agent Cards**, one per active session:
- Worktree name and branch
- Task description (user can set this when launching, stored in `.worktreepilot/sessions.json`)
- Files modified since session started (use `git diff --name-only` against the base branch)
- Time elapsed since session started
- Status: Running / Waiting for Input / Completed / Error
- Quick actions: Open Terminal, View Diff, Stop Session

**File Activity Stream:**
- Use `chokidar` or VS Code's `FileSystemWatcher` to watch all active worktree directories
- Show a real-time feed of file changes across all worktrees in the dashboard
- Each file change shows: timestamp, worktree/agent name, file path, change type (created/modified/deleted)

**Notifications:**
- When a Claude Code session in a terminal goes idle or completes, fire a VS Code notification
- Use VS Code's `window.showInformationMessage` with action buttons

---

### Module 3: Agent Teams Orchestrator (One-Click Teams)

This is the key feature. Makes Claude Code Agent Teams + worktree isolation a one-click operation.

**Team Templates System:**

Templates are JSON files stored in `.worktreepilot/templates/` at the project level and also at the global extension level (`~/.worktreepilot/templates/`). Project templates override global ones.

Each template defines:
```
{
  "name": "Full-Stack Team",
  "description": "Backend + Frontend + Tests + Reviewer",
  "agents": [
    {
      "role": "backend",
      "displayName": "Backend Architect",
      "ownership": ["src/api/**", "src/models/**", "src/services/**"],
      "prompt": "You are the backend architect. Focus on API routes, database models, and server logic.",
      "claudeMdExtra": "Use FastAPI patterns. Follow existing error handling conventions.",
      "readOnly": false
    },
    ...more agents
  ],
  "mergeOrder": ["backend", "frontend", "tests"],
  "estimatedTokens": "150K-300K"
}
```

**Built-in Templates** (ship with extension):
1. **Full-Stack Team**: Backend + Frontend + Tests + Reviewer (4 agents)
2. **Code Review Team**: Security + Performance + Architecture reviewers (3 agents, all read-only)
3. **Debug Squad**: 3 agents with competing hypotheses for debugging
4. **Migration Team**: N configurable agents for parallel file migrations
5. **Rapid Prototype**: Designer + Implementer + Tester (3 agents)

**Template Editor:**
- WebView-based UI for creating and editing templates
- Drag-and-drop role ordering
- File ownership pattern builder with glob syntax
- Preview of generated CLAUDE.md per agent

**One-Click Team Launch Flow:**

When user clicks "Launch Team" with a selected template and task description:

Step 1 — Pre-flight checks (before any worktree creation):
- Scan the task description and template ownership patterns
- Detect potential file overlaps between agents
- Check if `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled in settings
- Estimate token cost based on template
- Show a confirmation dialog with the plan: "Will create 4 worktrees, spawn 4 Claude Code sessions, estimated cost ~200K tokens. Proceed?"

Step 2 — Create worktrees:
- For each agent in the template, run `git worktree add .claude/worktrees/<teamname>-<role> -b worktree-<teamname>-<role>`
- Run dependency installation in each worktree (auto-detect package manager)

Step 3 — Generate per-agent CLAUDE.md:
- Create a CLAUDE.md file in each worktree's root
- Contents include:
  - Agent role and responsibilities from template
  - File ownership boundaries (what they own, what they must NOT touch)
  - Shared files protocol (if they need to change package.json, tsconfig, etc., document it in SHARED-CHANGES.md instead of modifying directly)
  - Project conventions (pulled from the main repo's CLAUDE.md if it exists)
  - The user's task description
  - Instructions to write a HANDOFF.md if they need changes in files they don't own

Step 4 — Spawn Claude Code sessions:
- Open a VS Code terminal for each agent
- Run `claude` in each worktree directory
- Pass the task as the initial prompt if possible (via piping or just display it for the user to paste)

Step 5 — Activate monitoring:
- Start file watchers on all worktree directories
- Open the dashboard panel automatically
- Begin overlap detection

**Team Management in Sidebar:**
- New TreeView section: "Active Teams"
- Shows team name, agents, their status
- Collapse/expand to see individual agents
- Quick actions: Message Agent (open their terminal), Stop Agent, Stop All

---

### Module 4: File Overlap Detector & Safety Layer

This is the differentiator. Nobody else has this.

**Pre-Flight Analyzer** (runs before team launch):
- Parse the template's ownership patterns
- Identify files/directories that appear in multiple agents' ownership
- Identify "shared files" that any feature development typically touches: package.json, tsconfig.json, .env, config files, type definition files, index/barrel files
- Show a warning with recommendations: "These shared files will likely be modified by multiple agents. Consider assigning one owner or using the shared files protocol."
- Let user adjust ownership before proceeding

**Real-Time Overlap Monitor** (runs during team execution):
- Watch all active worktrees using file system watchers
- Maintain a map: `{ filePath: [worktreesThatModifiedIt] }`
- When any file is modified in more than one worktree, immediately trigger an alert
- Alert shows: file path, which agents modified it, and a quick diff comparison
- Alert actions: "View Diffs", "Assign to One Agent", "Mark as Expected"

**File Ownership Heatmap** (in dashboard):
- Visual representation of the project file tree
- Each file/directory colored by which agent owns it
- Red highlights for files modified by multiple agents
- Grey for unowned/untouched files
- This helps the user see at a glance if agents are staying in their lanes

**Overlap Alert Panel:**
- Dedicated section in the dashboard showing all detected overlaps
- Sorted by severity: same file modified differently > same file modified identically > shared config files
- Each overlap item shows side-by-side diff snippets

---

### Module 5: Merge Sequencer & Intelligence

Handles the end-of-workflow merge process.

**Merge Readiness Report:**
When user clicks "Generate Merge Report" (available when all agents are done or manually triggered):
- For each worktree/agent, compute:
  - Files changed count (`git diff --stat` against base branch)
  - Lines added/removed
  - New files created
  - List of modified files
- Run overlap analysis across all worktrees
- For each overlap, determine:
  - Auto-resolvable (e.g., both added different entries to package.json dependencies)
  - Manual merge needed (e.g., both modified the same function)
- Check architecture consistency:
  - Compare import patterns across worktrees
  - Compare error handling patterns
  - Flag naming convention mismatches
- Compile reviewer findings (if a reviewer agent wrote REVIEW.md)
- Display the report in a WebView panel with clear sections

**Merge Order Recommendation:**
- Read the template's `mergeOrder` if defined
- If not defined, analyze file dependencies:
  - If Agent B's code imports from files Agent A created, Agent A merges first
  - If no dependencies, alphabetical/creation order
- Show recommended order with reasoning

**One-Click Sequential Merge:**
- User clicks "Execute Merge Sequence"
- For each worktree in order:
  1. Checkout main branch
  2. Merge the worktree's branch (`git merge worktree-<name>`)
  3. If conflict: pause, show conflict in diff editor, let user resolve
  4. If clean: run tests (detect test command from package.json scripts or user config)
  5. If tests pass: continue to next merge
  6. If tests fail: pause, show failure, let user decide (continue anyway / abort / fix)
- After all merges: show final summary

**Post-Merge Cleanup:**
- Option to delete all worktrees after successful merge
- Option to keep worktrees for reference
- Clean up generated CLAUDE.md files from worktrees

---

## Extension Configuration

### Extension Settings (VS Code settings.json contribution)

```
worktreePilot.defaultBaseBranch: string (default: "main")
worktreePilot.autoInstallDependencies: boolean (default: true)
worktreePilot.packageManager: "auto" | "npm" | "yarn" | "pnpm" | "pip" | "poetry" (default: "auto")
worktreePilot.worktreeLocation: string (default: ".claude/worktrees")
worktreePilot.enableAgentTeams: boolean (default: true) — auto-sets the env var
worktreePilot.templateDirectory: string (default: ".worktreepilot/templates")
worktreePilot.testCommand: string (default: auto-detect from package.json)
worktreePilot.maxConcurrentSessions: number (default: 5)
worktreePilot.showTokenEstimates: boolean (default: true)
worktreePilot.fileWatcherDebounce: number (default: 500) — ms debounce for file change events
worktreePilot.notifyOnSessionComplete: boolean (default: true)
```

### Project-Level Config (`.worktreepilot/config.json`)

```
{
  "projectName": "alpha-hiring",
  "conventions": {
    "framework": "FastAPI + React",
    "testFramework": "pytest + vitest",
    "linter": "ruff + eslint"
  },
  "sharedFiles": [
    "package.json",
    "tsconfig.json",
    ".env.example",
    "src/types/index.ts"
  ],
  "mergeTestCommand": "npm test && npm run lint",
  "defaultTemplate": "full-stack-team"
}
```

---

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Extension Framework**: VS Code Extension API
- **UI Framework**: React (for WebView panels only), bundled with Vite
- **Styling**: Tailwind CSS inside WebViews, VS Code's built-in theming for native UI
- **File Watching**: chokidar (cross-platform, performant)
- **Git Operations**: Direct `child_process.exec` calls to git CLI — no git library
- **State Management**: Simple in-memory state with JSON file persistence for sessions/config
- **Bundler**: esbuild for the extension, Vite for WebView React apps
- **Testing**: Vitest for unit tests, VS Code Extension Testing for integration tests

## Project Structure

```
worktree-pilot/
├── src/
│   ├── extension.ts                    # Entry point — registers all commands, views, panels
│   ├── core/
│   │   ├── worktree-manager.ts         # All git worktree CRUD operations
│   │   ├── session-tracker.ts          # Tracks active Claude Code terminal sessions
│   │   ├── agent-orchestrator.ts       # Team creation, template loading, one-click launch
│   │   ├── file-watcher.ts             # Cross-worktree file monitoring with chokidar
│   │   ├── overlap-detector.ts         # Detects file conflicts across worktrees in real-time
│   │   ├── merge-sequencer.ts          # Dependency analysis, merge ordering, sequential merge
│   │   ├── claude-md-generator.ts      # Generates per-agent CLAUDE.md files
│   │   └── config-manager.ts           # Reads/writes extension and project-level configs
│   ├── ui/
│   │   ├── sidebar/
│   │   │   ├── worktree-tree-provider.ts   # TreeDataProvider for worktrees
│   │   │   ├── session-tree-provider.ts    # TreeDataProvider for active sessions
│   │   │   └── team-tree-provider.ts       # TreeDataProvider for active teams
│   │   ├── webview/
│   │   │   ├── dashboard-panel.ts          # Creates and manages the dashboard WebView
│   │   │   ├── merge-panel.ts              # Creates and manages the merge report WebView
│   │   │   └── template-editor-panel.ts    # Creates and manages the template editor WebView
│   │   └── notifications.ts                # Notification helpers
│   └── utils/
│       ├── git.ts                      # Git command execution wrapper
│       ├── terminal.ts                 # Terminal creation and management
│       ├── glob-matcher.ts             # File ownership glob pattern matching
│       └── package-manager.ts          # Auto-detect and run package manager commands
├── webview-ui/
│   ├── src/
│   │   ├── main.tsx                    # React entry point
│   │   ├── Dashboard.tsx               # Main dashboard view
│   │   ├── MergeReport.tsx             # Merge readiness report view
│   │   ├── TemplateEditor.tsx          # Team template editor view
│   │   └── components/
│   │       ├── AgentCard.tsx           # Individual agent status card
│   │       ├── FileActivityStream.tsx  # Real-time file change feed
│   │       ├── FileHeatmap.tsx         # File ownership visualization
│   │       ├── OverlapAlerts.tsx       # Overlap detection alerts
│   │       ├── MergeSequence.tsx       # Step-by-step merge progress
│   │       ├── WorktreeStatus.tsx      # Worktree status summary
│   │       └── TeamLauncher.tsx        # Team creation and launch UI
│   ├── vite.config.ts
│   └── tailwind.config.ts
├── templates/                          # Built-in team templates (shipped with extension)
│   ├── full-stack-team.json
│   ├── code-review-team.json
│   ├── debug-squad.json
│   ├── migration-team.json
│   └── rapid-prototype.json
├── package.json                        # Extension manifest with contributes (commands, views, config)
├── tsconfig.json
├── esbuild.config.js                   # Extension bundler config
└── README.md
```

---

## Commands to Register (package.json contributes.commands)

```
worktreePilot.createWorktree          — "WorkTree Pilot: Create Worktree"
worktreePilot.deleteWorktree          — "WorkTree Pilot: Delete Worktree"
worktreePilot.launchSession           — "WorkTree Pilot: Launch Claude Code in Worktree"
worktreePilot.openDashboard           — "WorkTree Pilot: Open Dashboard"
worktreePilot.launchTeam              — "WorkTree Pilot: Launch Agent Team"
worktreePilot.createTemplate          — "WorkTree Pilot: Create Team Template"
worktreePilot.editTemplate            — "WorkTree Pilot: Edit Team Template"
worktreePilot.runOverlapCheck         — "WorkTree Pilot: Check File Overlaps"
worktreePilot.generateMergeReport     — "WorkTree Pilot: Generate Merge Report"
worktreePilot.executeMergeSequence    — "WorkTree Pilot: Execute Merge Sequence"
worktreePilot.cleanupWorktrees        — "WorkTree Pilot: Cleanup Stale Worktrees"
worktreePilot.stopAllSessions         — "WorkTree Pilot: Stop All Sessions"
worktreePilot.refreshSidebar          — "WorkTree Pilot: Refresh"
```

## Views to Register (package.json contributes.views)

Sidebar container: `worktreePilot` (icon: git-branch or layers icon)

Views inside:
1. `worktreePilot.worktrees` — "Worktrees" TreeView
2. `worktreePilot.sessions` — "Active Sessions" TreeView
3. `worktreePilot.teams` — "Agent Teams" TreeView

---

## Development Priorities

**Build in this exact order. Do not skip ahead.**

### Priority 1: Core Worktree Manager
Get the sidebar TreeView working with full CRUD for worktrees. This is the foundation everything else depends on. Must be rock-solid.

### Priority 2: Session Spawning and Tracking
Add the ability to launch Claude Code terminals per worktree and track which terminals are active. Map terminal instances to worktrees.

### Priority 3: Dashboard WebView
Build the React-based dashboard panel showing agent cards with file activity. This requires setting up the Vite build pipeline for the WebView.

### Priority 4: Team Templates and One-Click Launch
Implement the template system and the one-click team launch flow. This is the headline feature. Generate CLAUDE.md files per agent, create worktrees, spawn sessions.

### Priority 5: Overlap Detection
Add real-time file watching across worktrees and the overlap detection engine. Surface alerts in the dashboard.

### Priority 6: Merge Sequencer
Build the merge readiness report generator and the sequential merge execution flow.

### Priority 7: Template Editor WebView
Nice-to-have: visual template editor. Low priority — users can edit JSON directly.

---

## Important Implementation Notes

1. **Do NOT bundle Claude Code or any Anthropic SDK.** The extension only interacts with Claude Code through the terminal (spawning `claude` commands). No API calls to Anthropic.

2. **Git operations must be synchronous or properly queued.** Never run concurrent git commands on the same repo — git locks will cause failures. Use a queue/mutex for git operations.

3. **WebView panels must communicate with the extension via message passing.** Use `webview.postMessage()` from extension to WebView and `vscode.postMessage()` from WebView to extension. Define a clear message protocol.

4. **File watchers must be debounced.** AI agents write files rapidly — without debouncing, the overlap detector will fire hundreds of events per second. Use 500ms debounce minimum.

5. **All paths must be cross-platform.** Use `path.join()` and `vscode.Uri` consistently. The extension must work on macOS, Linux, and Windows.

6. **The extension must activate lazily.** Only activate when the user opens the sidebar, runs a command, or the workspace is a git repository. Use `activationEvents` properly.

7. **Theme compatibility.** All WebView UIs must respect VS Code's color theme. Use CSS variables from VS Code's WebView toolkit (`--vscode-editor-background`, `--vscode-foreground`, etc.).

8. **Error handling.** Every git command, file operation, and terminal spawn must have proper error handling with user-friendly error messages via `vscode.window.showErrorMessage()`.

9. **State persistence.** Active sessions, team configurations, and overlap data should persist across VS Code restarts. Use `context.globalState` or `context.workspaceState` for transient data, and `.worktreepilot/` files for project-level data.

10. **The `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var** must be set automatically when the user launches a team. Write it to the terminal's environment or to the user's Claude Code settings.json at `~/.claude/settings.json`.

---

## Quality Standards

- TypeScript strict mode, no `any` types
- Every core module must have unit tests
- Every git operation must have error handling
- WebView React components must be typed with proper interfaces
- Extension must not increase VS Code startup time noticeably (lazy activation)
- All user-facing strings must be clear and non-technical where possible
- README must include: what it does, installation, quick start, screenshots placeholder, configuration reference