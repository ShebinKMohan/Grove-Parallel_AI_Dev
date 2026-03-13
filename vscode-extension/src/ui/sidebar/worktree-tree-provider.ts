/**
 * TreeDataProvider for the sidebar worktree list.
 * Shows all worktrees with status icons, rich tooltips, and context menus.
 *
 * Each worktree item shows: name, branch, status (clean/has changes/active session).
 * Icons: green for clean, yellow for uncommitted changes, orange for modified, red for conflicts.
 */

import * as vscode from "vscode";
import * as path from "path";
import {
    listAllWorktrees,
    WorktreeInfo,
} from "../../core/worktree-manager";
import { logError } from "../../utils/logger";

// ────────────────────────────────────────────
// Tree Item
// ────────────────────────────────────────────

export class WorktreeTreeItem extends vscode.TreeItem {
    public readonly worktree: WorktreeInfo;

    constructor(worktree: WorktreeInfo) {
        super(worktree.branch, vscode.TreeItemCollapsibleState.None);
        this.worktree = worktree;
        this.description = this.buildDescription();
        this.tooltip = this.buildTooltip();
        this.iconPath = this.getStatusIcon();
        this.contextValue = worktree.isMain ? "worktree-main" : "worktree";
        this.resourceUri = vscode.Uri.file(worktree.path);
    }

    private buildDescription(): string {
        if (this.worktree.isMain) {
            const parts: string[] = ["default"];
            const changes = this.getChangeSummary();
            if (changes) parts.push(changes);
            return parts.join(" · ");
        }

        if (this.worktree.statusSummary === "missing") {
            return "missing";
        }

        const parts: string[] = [];
        const dirName = path.basename(this.worktree.path);
        parts.push(dirName);

        const changes = this.getChangeSummary();
        if (changes) {
            parts.push(changes);
        } else {
            parts.push("clean");
        }

        return parts.join(" · ");
    }

    private getChangeSummary(): string {
        const { modified, staged, untracked, conflicts } = this.worktree.status;
        const parts: string[] = [];
        if (conflicts > 0) parts.push(`!${conflicts}`);
        if (staged > 0) parts.push(`+${staged}`);
        if (modified > 0) parts.push(`~${modified}`);
        if (untracked > 0) parts.push(`?${untracked}`);
        return parts.join(" ");
    }

    private buildTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString("", true);
        md.supportThemeIcons = true;

        if (this.worktree.isMain) {
            md.appendMarkdown(`### $(home) ${this.worktree.branch}\n\n`);
            md.appendMarkdown("$(star-full) **Default worktree**\n\n");
        } else {
            md.appendMarkdown(
                `### $(git-branch) ${this.worktree.branch}\n\n`
            );
        }

        md.appendMarkdown("---\n\n");
        md.appendMarkdown(`$(folder) \`${this.worktree.path}\`\n\n`);

        if (this.worktree.commit) {
            md.appendMarkdown(
                `$(git-commit) \`${this.worktree.commit}\`\n\n`
            );
        }

        const { modified, staged, untracked, conflicts } =
            this.worktree.status;
        if (this.worktree.statusSummary === "missing") {
            md.appendMarkdown(
                "$(error) **Worktree directory missing**\n\n"
            );
        } else if (
            conflicts > 0 ||
            modified > 0 ||
            staged > 0 ||
            untracked > 0
        ) {
            md.appendMarkdown("**Changes:**\n\n");
            if (conflicts > 0)
                md.appendMarkdown(`- $(alert) ${conflicts} conflict(s)\n`);
            if (staged > 0)
                md.appendMarkdown(`- $(diff-added) ${staged} staged\n`);
            if (modified > 0)
                md.appendMarkdown(`- $(diff-modified) ${modified} modified\n`);
            if (untracked > 0)
                md.appendMarkdown(`- $(diff-removed) ${untracked} untracked\n`);
            md.appendMarkdown("\n");
        } else {
            md.appendMarkdown(
                "$(pass) **Clean** — no pending changes\n\n"
            );
        }

        md.appendMarkdown("---\n\n");
        md.appendMarkdown(
            "$(rocket) Launch Claude · $(terminal) Open Terminal · $(multiple-windows) New Window"
        );

        return md;
    }

    private getStatusIcon(): vscode.ThemeIcon {
        if (this.worktree.isMain) {
            return new vscode.ThemeIcon(
                "home",
                new vscode.ThemeColor("charts.yellow")
            );
        }

        if (this.worktree.statusSummary === "missing") {
            return new vscode.ThemeIcon(
                "error",
                new vscode.ThemeColor("charts.red")
            );
        }

        if (this.worktree.status.conflicts > 0) {
            return new vscode.ThemeIcon(
                "alert",
                new vscode.ThemeColor("charts.red")
            );
        }

        const { modified, staged, untracked } = this.worktree.status;
        if (modified > 0 || staged > 0 || untracked > 0) {
            return new vscode.ThemeIcon(
                "diff-modified",
                new vscode.ThemeColor("charts.orange")
            );
        }

        return new vscode.ThemeIcon(
            "pass",
            new vscode.ThemeColor("charts.green")
        );
    }
}

// ────────────────────────────────────────────
// Tree Data Provider
// ────────────────────────────────────────────

export class WorktreeTreeProvider
    implements vscode.TreeDataProvider<WorktreeTreeItem>
{
    private _onDidChangeTreeData =
        new vscode.EventEmitter<WorktreeTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private repoRoot: string | undefined;

    setRepoRoot(repoRoot: string): void {
        this.repoRoot = repoRoot;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: WorktreeTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(
        _element?: WorktreeTreeItem
    ): Promise<WorktreeTreeItem[]> {
        if (!this.repoRoot) return [];

        try {
            const worktrees = await listAllWorktrees(this.repoRoot);
            if (worktrees.length === 0) return [];

            // Sort: main first, then alphabetically by branch
            const sorted = [...worktrees].sort((a, b) => {
                if (a.isMain && !b.isMain) return -1;
                if (!a.isMain && b.isMain) return 1;
                return a.branch.localeCompare(b.branch);
            });

            return sorted.map((wt) => new WorktreeTreeItem(wt));
        } catch (err) {
            logError("Failed to list worktrees", err);
            return [];
        }
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}
