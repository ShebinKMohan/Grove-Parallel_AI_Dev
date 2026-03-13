/**
 * TreeDataProvider for the Active Sessions sidebar view.
 * Shows all tracked Claude Code sessions with status, elapsed time,
 * and quick actions.
 */

import * as vscode from "vscode";
import {
    SessionTracker,
    SessionInfo,
} from "../../core/session-tracker";

// ────────────────────────────────────────────
// Tree Item
// ────────────────────────────────────────────

export class SessionTreeItem extends vscode.TreeItem {
    public readonly session: SessionInfo;

    constructor(
        session: SessionInfo,
        private readonly tracker: SessionTracker
    ) {
        super(session.branch, vscode.TreeItemCollapsibleState.None);
        this.session = session;
        this.description = this.buildDescription();
        this.tooltip = this.buildTooltip();
        this.iconPath = this.getStatusIcon();
        this.contextValue = this.getContextValue();
    }

    private buildDescription(): string {
        const elapsed = this.tracker.getElapsedTime(this.session);
        const parts: string[] = [this.getStatusLabel(), elapsed];

        if (this.session.modifiedFiles.length > 0) {
            parts.push(`${this.session.modifiedFiles.length} files`);
        }

        return parts.join(" · ");
    }

    private getStatusLabel(): string {
        switch (this.session.status) {
            case "running":
                return "Running";
            case "idle":
                return "Idle";
            case "completed":
                return "Done";
            case "error":
                return "Error";
        }
    }

    private buildTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString("", true);
        md.supportThemeIcons = true;

        md.appendMarkdown(`### $(rocket) ${this.session.branch}\n\n`);
        md.appendMarkdown("---\n\n");

        // Status
        const statusIcon = this.session.status === "running"
            ? "$(sync~spin)"
            : this.session.status === "completed"
                ? "$(check)"
                : this.session.status === "error"
                    ? "$(error)"
                    : "$(clock)";
        md.appendMarkdown(
            `${statusIcon} **${this.getStatusLabel()}** — ${this.tracker.getElapsedTime(this.session)}\n\n`
        );

        // Task
        if (this.session.taskDescription) {
            md.appendMarkdown(
                `$(note) ${this.session.taskDescription}\n\n`
            );
        }

        // Path
        md.appendMarkdown(
            `$(folder) \`${this.session.worktreePath}\`\n\n`
        );

        // Started at
        const started = new Date(this.session.startedAt);
        md.appendMarkdown(
            `$(calendar) Started: ${started.toLocaleTimeString()}\n\n`
        );

        // Modified files
        if (this.session.modifiedFiles.length > 0) {
            md.appendMarkdown(
                `**Modified files (${this.session.modifiedFiles.length}):**\n\n`
            );
            const displayed = this.session.modifiedFiles.slice(0, 10);
            for (const file of displayed) {
                md.appendMarkdown(`- \`${file}\`\n`);
            }
            if (this.session.modifiedFiles.length > 10) {
                md.appendMarkdown(
                    `- *...and ${this.session.modifiedFiles.length - 10} more*\n`
                );
            }
        }

        return md;
    }

    private getStatusIcon(): vscode.ThemeIcon {
        switch (this.session.status) {
            case "running":
                return new vscode.ThemeIcon(
                    "sync~spin",
                    new vscode.ThemeColor("charts.green")
                );
            case "idle":
                return new vscode.ThemeIcon(
                    "clock",
                    new vscode.ThemeColor("charts.yellow")
                );
            case "completed":
                return new vscode.ThemeIcon(
                    "pass",
                    new vscode.ThemeColor("charts.blue")
                );
            case "error":
                return new vscode.ThemeIcon(
                    "error",
                    new vscode.ThemeColor("charts.red")
                );
        }
    }

    private getContextValue(): string {
        if (
            this.session.status === "running" ||
            this.session.status === "idle"
        ) {
            return "session-active";
        }
        return "session-completed";
    }
}

// ────────────────────────────────────────────
// Tree Data Provider
// ────────────────────────────────────────────

export class SessionTreeProvider
    implements vscode.TreeDataProvider<SessionTreeItem>
{
    private _onDidChangeTreeData =
        new vscode.EventEmitter<SessionTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private tracker: SessionTracker | undefined;

    setTracker(tracker: SessionTracker): void {
        this.tracker = tracker;
        // Auto-refresh when sessions change
        tracker.onDidChangeSessions(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: SessionTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(
        _element?: SessionTreeItem
    ): Promise<SessionTreeItem[]> {
        if (!this.tracker) return [];

        // Show active sessions first, then recent completed (last 5)
        const active = this.tracker.getActiveSessions();
        const completed = this.tracker
            .getAllSessions()
            .filter(
                (s) => s.status === "completed" || s.status === "error"
            )
            .sort(
                (a, b) =>
                    new Date(b.endedAt ?? b.startedAt).getTime() -
                    new Date(a.endedAt ?? a.startedAt).getTime()
            )
            .slice(0, 5);

        const all = [...active, ...completed];
        return all.map((s) => new SessionTreeItem(s, this.tracker!));
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}
