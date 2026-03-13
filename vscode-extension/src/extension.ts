/**
 * WorkTree Pilot — VS Code Extension Entry Point.
 * Control plane for parallel AI development with git worktrees.
 *
 * Registers all commands, views, and lifecycle management.
 */

import * as vscode from "vscode";
import { getRepoRoot, getCurrentBranch, listLocalBranches } from "./utils/git";
import {
    WorktreeTreeProvider,
    WorktreeTreeItem,
} from "./ui/sidebar/worktree-tree-provider";
import {
    SessionTreeProvider,
    SessionTreeItem,
} from "./ui/sidebar/session-tree-provider";
import { SessionTracker } from "./core/session-tracker";
import {
    createWorktree,
    removeWorktree,
    listAllWorktrees,
    validateBranchName,
    computeWorktreePath,
    BRANCH_PREFIXES,
} from "./core/worktree-manager";
import { openTerminal, openInNewWindow, launchClaude } from "./utils/terminal";
import { DashboardPanel } from "./ui/webview/dashboard-panel";
import { WorktreePilotError } from "./utils/errors";
import { log, logError, disposeLogger } from "./utils/logger";

export async function activate(
    context: vscode.ExtensionContext
): Promise<void> {
    log("WorkTree Pilot activating...");

    // Find workspace git repo
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        log("No workspace folder open");
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    let repoRoot: string;
    try {
        repoRoot = await getRepoRoot(workspaceRoot);
    } catch {
        log("Not a git repository, extension inactive");
        return;
    }

    log(`Git repo found: ${repoRoot}`);

    // ── Session Tracker ─────────────────────────────────────

    const sessionTracker = new SessionTracker(repoRoot, () => {
        const config = vscode.workspace.getConfiguration("worktreePilot");
        return config.get<boolean>("notifyOnSessionComplete", true);
    });

    // ── Tree Providers ──────────────────────────────────────

    const worktreeTreeProvider = new WorktreeTreeProvider();
    worktreeTreeProvider.setRepoRoot(repoRoot);

    const sessionTreeProvider = new SessionTreeProvider();
    sessionTreeProvider.setTracker(sessionTracker);

    const worktreeView = vscode.window.createTreeView(
        "worktreePilot.worktrees",
        { treeDataProvider: worktreeTreeProvider, showCollapseAll: true }
    );
    const sessionView = vscode.window.createTreeView(
        "worktreePilot.sessions",
        { treeDataProvider: sessionTreeProvider, showCollapseAll: true }
    );

    // ── Status Bar ──────────────────────────────────────────

    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.command = "worktreePilot.refreshSidebar";

    async function updateStatusBar(): Promise<void> {
        const config = vscode.workspace.getConfiguration("worktreePilot");
        if (!config.get<boolean>("showStatusBarItem", true)) {
            statusBarItem.hide();
            return;
        }
        try {
            const branch = await getCurrentBranch(repoRoot);
            const worktrees = await listAllWorktrees(repoRoot);
            const activeSessionCount = sessionTracker.activeCount;
            let text = `$(git-branch) ${branch} | ${worktrees.length} wt`;
            if (activeSessionCount > 0) {
                text += ` | $(rocket) ${activeSessionCount}`;
            }
            statusBarItem.text = text;
            statusBarItem.tooltip =
                `WorkTree Pilot: ${worktrees.length} worktree(s)` +
                (activeSessionCount > 0
                    ? `, ${activeSessionCount} active session(s)`
                    : "") +
                "\nClick to refresh";
            statusBarItem.show();
        } catch {
            statusBarItem.hide();
        }
    }

    // ── Refresh Helper ──────────────────────────────────────

    const refreshAll = (): void => {
        worktreeTreeProvider.refresh();
        sessionTreeProvider.refresh();
        void updateStatusBar();
    };

    // Update status bar when sessions change
    sessionTracker.onDidChangeSessions(() => void updateStatusBar());

    // ── Commands ────────────────────────────────────────────

    // Create Worktree
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.createWorktree",
            async () => {
                // 1. Select prefix
                const prefixItems = BRANCH_PREFIXES.map((p) => ({
                    label: p.replace(/\/$/, ""),
                    description: `${p}<name>`,
                    value: p,
                }));
                const prefixPick = await vscode.window.showQuickPick(
                    prefixItems,
                    {
                        placeHolder: "Select branch type",
                        title: "WorkTree Pilot: Branch Prefix",
                    }
                );
                if (!prefixPick) return;
                const prefix = prefixPick.value;

                // 2. Input branch name
                const nameInput = await vscode.window.showInputBox({
                    prompt: `Branch name (${prefix})`,
                    placeHolder: "e.g., add-user-auth",
                    title: "WorkTree Pilot: Branch Name",
                    validateInput: (value) => {
                        if (!value) return "Branch name cannot be empty.";
                        return validateBranchName(`${prefix}${value}`);
                    },
                });
                if (!nameInput) return;
                const branchName = `${prefix}${nameInput}`;

                // 3. Select source branch
                const branches = await listLocalBranches(repoRoot);
                const currentBranch = await getCurrentBranch(repoRoot);
                const sourceItems: vscode.QuickPickItem[] = [
                    {
                        label: "$(git-commit) Current HEAD",
                        description: `(${currentBranch})`,
                        detail: "Create from the current commit",
                    },
                    ...branches.map((b) => ({
                        label: `$(git-branch) ${b}`,
                        description: b === currentBranch ? "(current)" : "",
                        detail: `Create from '${b}'`,
                    })),
                ];
                const sourcePick = await vscode.window.showQuickPick(
                    sourceItems,
                    {
                        placeHolder: "Create worktree from which branch?",
                        title: "WorkTree Pilot: Source Branch",
                    }
                );
                if (!sourcePick) return;
                const startPoint = sourcePick.label.includes("Current HEAD")
                    ? undefined
                    : sourcePick.label.replace(/^\$\(git-branch\)\s*/, "");

                // 4. Select directory
                const config = vscode.workspace.getConfiguration("worktreePilot");
                const worktreeDir = config.get<string>(
                    "worktreeLocation",
                    ".claude/worktrees"
                );
                const defaultPath = computeWorktreePath(
                    repoRoot,
                    branchName,
                    worktreeDir
                );
                const dirItems: vscode.QuickPickItem[] = [
                    {
                        label: "$(folder) Default location",
                        detail: defaultPath,
                    },
                    {
                        label: "$(folder-opened) Choose custom directory...",
                        detail: "Browse for a different location",
                    },
                ];
                const dirPick = await vscode.window.showQuickPick(dirItems, {
                    placeHolder: "Where to create the worktree?",
                    title: "WorkTree Pilot: Directory",
                });
                if (!dirPick) return;

                let wtPath = defaultPath;
                if (dirPick.label.includes("Choose custom")) {
                    const folders = await vscode.window.showOpenDialog({
                        canSelectFolders: true,
                        canSelectFiles: false,
                        canSelectMany: false,
                        openLabel: "Select Worktree Directory",
                    });
                    if (!folders || folders.length === 0) return;
                    wtPath = folders[0].fsPath;
                }

                // 5. Create with progress
                try {
                    const result = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: `Creating worktree '${branchName}'...`,
                            cancellable: false,
                        },
                        async () =>
                            createWorktree(repoRoot, branchName, {
                                customPath:
                                    wtPath !== defaultPath
                                        ? wtPath
                                        : undefined,
                                startPoint,
                                worktreeDir,
                                autoGitignore: config.get<boolean>(
                                    "autoGitignore",
                                    true
                                ),
                                autoInstallDeps: config.get<boolean>(
                                    "autoInstallDependencies",
                                    true
                                ),
                            })
                    );

                    refreshAll();

                    // 6. Success with actions
                    const action =
                        await vscode.window.showInformationMessage(
                            `Worktree created: ${result.branch}`,
                            "Open in New Window",
                            "Open Terminal",
                            "Launch Claude"
                        );

                    if (action === "Open in New Window") {
                        await openInNewWindow(result.path);
                    } else if (action === "Open Terminal") {
                        openTerminal(`WT: ${result.branch}`, result.path);
                    } else if (action === "Launch Claude") {
                        await launchClaudeWithTracking(
                            result.branch,
                            result.path
                        );
                    }
                } catch (err) {
                    logError("Failed to create worktree", err);
                    if (err instanceof WorktreePilotError) {
                        void vscode.window.showErrorMessage(
                            `${err.message}\n\nFix: ${err.fix}`
                        );
                    } else {
                        void vscode.window.showErrorMessage(
                            `Failed to create worktree: ${err instanceof Error ? err.message : String(err)}`
                        );
                    }
                }
            }
        )
    );

    // Delete Worktree (context menu on single worktree)
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.deleteWorktree",
            async (item?: WorktreeTreeItem) => {
                if (!item?.worktree) return;
                const wt = item.worktree;

                if (wt.isMain) {
                    void vscode.window.showWarningMessage(
                        "Cannot delete the main worktree."
                    );
                    return;
                }

                // Check for active session
                if (sessionTracker.hasActiveSession(wt.path)) {
                    const confirm = await vscode.window.showWarningMessage(
                        `Worktree '${wt.branch}' has an active Claude session. Stop it and delete?`,
                        { modal: true },
                        "Stop & Delete"
                    );
                    if (confirm !== "Stop & Delete") return;

                    const session = sessionTracker.getSessionForWorktree(
                        wt.path
                    );
                    if (session) {
                        sessionTracker.stopSession(session.id);
                    }
                }

                // Warn about uncommitted changes
                if (
                    wt.statusSummary !== "clean" &&
                    wt.statusSummary !== "missing"
                ) {
                    const confirm = await vscode.window.showWarningMessage(
                        `Worktree '${wt.branch}' has uncommitted changes. Delete anyway?`,
                        { modal: true },
                        "Force Delete"
                    );
                    if (confirm !== "Force Delete") return;

                    await removeWorktree(repoRoot, wt.path, {
                        deleteBranch: true,
                        force: true,
                    });
                } else {
                    const deleteBranch =
                        await vscode.window.showWarningMessage(
                            `Delete worktree '${wt.branch}'?`,
                            { modal: true },
                            "Delete",
                            "Delete + Branch"
                        );
                    if (!deleteBranch) return;

                    await removeWorktree(repoRoot, wt.path, {
                        deleteBranch: deleteBranch === "Delete + Branch",
                    });
                }

                refreshAll();
                void vscode.window.showInformationMessage(
                    `Deleted worktree: ${wt.branch}`
                );
            }
        )
    );

    // Cleanup Worktrees (batch cleanup wizard)
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.cleanupWorktrees",
            async () => {
                const worktrees = await listAllWorktrees(repoRoot);
                const removable = worktrees.filter((wt) => !wt.isMain);

                if (removable.length === 0) {
                    void vscode.window.showInformationMessage(
                        "No worktrees to clean up."
                    );
                    return;
                }

                const items = removable.map((wt) => ({
                    label: wt.branch,
                    description: wt.statusSummary || "",
                    detail: wt.path,
                    picked: false,
                    worktree: wt,
                }));

                const picked = await vscode.window.showQuickPick(items, {
                    placeHolder: "Select worktrees to remove",
                    title: "WorkTree Pilot: Cleanup",
                    canPickMany: true,
                });
                if (!picked || picked.length === 0) return;

                const deleteBranches =
                    (await vscode.window.showWarningMessage(
                        "Also delete the associated branches?",
                        { modal: true },
                        "Yes"
                    )) === "Yes";

                const selected = picked.map((p) => p.worktree);
                const dirty = selected.filter(
                    (wt) =>
                        wt.statusSummary !== "clean" &&
                        wt.statusSummary !== "missing"
                );

                let force = false;
                let toRemove = selected;
                if (dirty.length > 0) {
                    force =
                        (await vscode.window.showWarningMessage(
                            `${dirty.length} worktree(s) have uncommitted changes. Force remove?`,
                            { modal: true },
                            "Yes"
                        )) === "Yes";
                    if (!force) {
                        toRemove = selected.filter(
                            (wt) =>
                                wt.statusSummary === "clean" ||
                                wt.statusSummary === "missing"
                        );
                        if (toRemove.length === 0) {
                            void vscode.window.showInformationMessage(
                                "No clean worktrees left to remove."
                            );
                            return;
                        }
                    }
                }

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: "Cleaning up worktrees...",
                        cancellable: false,
                    },
                    async (progress) => {
                        let removed = 0;
                        for (const wt of toRemove) {
                            progress.report({
                                message: `Removing ${wt.branch}...`,
                                increment: 100 / toRemove.length,
                            });
                            try {
                                // Stop any active sessions first
                                const session =
                                    sessionTracker.getSessionForWorktree(
                                        wt.path
                                    );
                                if (session) {
                                    sessionTracker.stopSession(session.id);
                                }

                                await removeWorktree(repoRoot, wt.path, {
                                    deleteBranch: deleteBranches,
                                    force,
                                });
                                removed++;
                            } catch (err) {
                                logError(
                                    `Failed to remove ${wt.branch}`,
                                    err
                                );
                            }
                        }
                        void vscode.window.showInformationMessage(
                            `Cleaned up ${removed} worktree(s).`
                        );
                    }
                );

                refreshAll();
            }
        )
    );

    // ── Session Launch Helper ───────────────────────────────

    async function launchClaudeWithTracking(
        branch: string,
        worktreePath: string,
        taskDescription?: string
    ): Promise<void> {
        // Check max concurrent sessions
        const config = vscode.workspace.getConfiguration("worktreePilot");
        const maxSessions = config.get<number>("maxConcurrentSessions", 5);
        if (sessionTracker.activeCount >= maxSessions) {
            void vscode.window.showWarningMessage(
                `Maximum concurrent sessions (${maxSessions}) reached. Stop a session first.`
            );
            return;
        }

        // Prompt for task description if not provided
        let task = taskDescription;
        if (task === undefined) {
            task =
                (await vscode.window.showInputBox({
                    prompt: "What should Claude work on? (optional)",
                    placeHolder:
                        "e.g., Implement user authentication with JWT",
                    title: "WorkTree Pilot: Task Description",
                })) ?? "";
        }

        const terminal = await launchClaude(branch, worktreePath);
        if (terminal) {
            sessionTracker.startSession(
                terminal,
                worktreePath,
                branch,
                task
            );
        }
    }

    // Launch Claude Code in Worktree (from worktree context menu)
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.launchSession",
            async (item?: WorktreeTreeItem) => {
                if (!item?.worktree) return;

                // Warn if session already running for this worktree
                if (sessionTracker.hasActiveSession(item.worktree.path)) {
                    const action = await vscode.window.showWarningMessage(
                        `A Claude session is already running in '${item.worktree.branch}'.`,
                        "Open Terminal",
                        "Launch Another",
                        "Cancel"
                    );
                    if (action === "Open Terminal") {
                        const session = sessionTracker.getSessionForWorktree(
                            item.worktree.path
                        );
                        if (session) {
                            const terminal =
                                sessionTracker.getTerminalForSession(
                                    session.id
                                );
                            if (terminal) {
                                terminal.show();
                                return;
                            }
                        }
                    } else if (action !== "Launch Another") {
                        return;
                    }
                }

                await launchClaudeWithTracking(
                    item.worktree.branch,
                    item.worktree.path
                );
            }
        )
    );

    // Stop Session (from session context menu)
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.stopSession",
            async (item?: SessionTreeItem) => {
                if (!item?.session) return;

                if (
                    item.session.status !== "running" &&
                    item.session.status !== "idle"
                ) {
                    return;
                }

                const confirm = await vscode.window.showWarningMessage(
                    `Stop Claude session for '${item.session.branch}'?`,
                    { modal: true },
                    "Stop"
                );
                if (confirm !== "Stop") return;

                sessionTracker.stopSession(item.session.id);
            }
        )
    );

    // Stop All Sessions
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.stopAllSessions",
            async () => {
                const count = sessionTracker.activeCount;
                if (count === 0) {
                    void vscode.window.showInformationMessage(
                        "No active sessions."
                    );
                    return;
                }

                const confirm = await vscode.window.showWarningMessage(
                    `Stop all ${count} active session(s)?`,
                    { modal: true },
                    "Stop All"
                );
                if (confirm !== "Stop All") return;

                sessionTracker.stopAllSessions();
                void vscode.window.showInformationMessage(
                    `Stopped ${count} session(s).`
                );
            }
        )
    );

    // Focus Session Terminal (from session context menu)
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.focusSession",
            (item?: SessionTreeItem) => {
                if (!item?.session) return;
                const terminal = sessionTracker.getTerminalForSession(
                    item.session.id
                );
                if (terminal) {
                    terminal.show();
                } else {
                    void vscode.window.showWarningMessage(
                        "Terminal no longer available."
                    );
                }
            }
        )
    );

    // Set Task Description (from session context menu)
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.setTaskDescription",
            async (item?: SessionTreeItem) => {
                if (!item?.session) return;

                const desc = await vscode.window.showInputBox({
                    prompt: "Update task description",
                    value: item.session.taskDescription,
                    title: "WorkTree Pilot: Task Description",
                });
                if (desc === undefined) return;

                sessionTracker.setTaskDescription(item.session.id, desc);
            }
        )
    );

    // Clear Completed Sessions
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.clearCompletedSessions",
            () => {
                sessionTracker.clearCompletedSessions();
            }
        )
    );

    // Open in Terminal
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.openInTerminal",
            async (item?: WorktreeTreeItem) => {
                if (!item?.worktree) return;
                openTerminal(
                    `WT: ${item.worktree.branch}`,
                    item.worktree.path
                );
            }
        )
    );

    // Open in New Window
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.openInNewWindow",
            async (item?: WorktreeTreeItem) => {
                if (!item?.worktree) return;
                await openInNewWindow(item.worktree.path);
            }
        )
    );

    // View Diff
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.viewDiff",
            async (item?: WorktreeTreeItem) => {
                if (!item?.worktree) return;
                const terminal = openTerminal(
                    `Diff: ${item.worktree.branch}`,
                    item.worktree.path
                );
                const config = vscode.workspace.getConfiguration(
                    "worktreePilot"
                );
                const baseBranch = config.get<string>(
                    "defaultBaseBranch",
                    "main"
                );
                terminal.sendText(`git diff ${baseBranch}...HEAD --stat`);
            }
        )
    );

    // Refresh Sidebar
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.refreshSidebar",
            () => {
                refreshAll();
            }
        )
    );

    // Open Dashboard
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "worktreePilot.openDashboard",
            () => {
                DashboardPanel.createOrShow(
                    context.extensionUri,
                    repoRoot,
                    sessionTracker
                );
            }
        )
    );

    // ── File Watcher for auto-refresh ───────────────────────

    const gitWorktreesPattern = new vscode.RelativePattern(
        repoRoot,
        ".git/worktrees/**"
    );
    const watcher =
        vscode.workspace.createFileSystemWatcher(gitWorktreesPattern);
    let refreshTimeout: NodeJS.Timeout | undefined;
    const debouncedRefresh = (): void => {
        if (refreshTimeout) clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(refreshAll, 300);
    };
    watcher.onDidCreate(debouncedRefresh);
    watcher.onDidDelete(debouncedRefresh);
    watcher.onDidChange(debouncedRefresh);

    // ── Register disposables ────────────────────────────────

    context.subscriptions.push(
        worktreeView,
        sessionView,
        worktreeTreeProvider,
        sessionTreeProvider,
        sessionTracker,
        statusBarItem,
        watcher
    );

    // Initial status bar update
    await updateStatusBar();

    log("WorkTree Pilot activated successfully");
}

export function deactivate(): void {
    disposeLogger();
}
