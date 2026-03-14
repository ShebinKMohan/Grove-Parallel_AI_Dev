# Grove

Grove is the control plane for parallel AI development -- orchestrate multiple Claude Code agents across git worktrees from one dashboard.

<!-- ![Grove in action](media/grove-demo.gif) -->

## What it does

- **One-click agent teams** -- pick a template (Full-Stack, Code Review, Debug Squad, Migration, Rapid Prototype), enter your task, and Grove creates isolated worktrees, generates per-agent CLAUDE.md files, and launches all sessions in parallel.
- **Real-time file overlap detection** -- file watchers monitor every worktree and alert you the moment two agents touch the same file, ranked by severity (conflict / warning / info), before it becomes a merge nightmare.
- **Merge intelligence** -- a merge sequencer analyzes cross-worktree changes, recommends merge order based on file-type dependency priority, auto-commits uncommitted work, and walks you through sequential merges with conflict pauses and optional test gates.
- **Session dashboard** -- a live WebView panel with agent cards showing elapsed time, modified file counts, and status; an activity feed of every file change across worktrees; and an overlaps tab with diffs and dismiss controls.
- **Team templates** -- five built-in templates ship with the extension, and you can drop custom JSON templates into `.grove/templates/` to define your own agent roles, ownership globs, prompts, and merge order.

## Install

```bash
code --install-extension grove
```

## Quick start

1. Open a git repo in VS Code or Cursor.
2. Click the Grove icon in the Activity Bar.
3. Hit **+** to create a worktree, or the team icon to launch a full agent team.
4. Open the dashboard (`Grove: Open Dashboard`) to monitor everything in real-time.
5. When agents finish, generate a merge report and execute the guided merge sequence.

See [DOCUMENTATION.md](DOCUMENTATION.md) for the full reference.

## License

MIT
