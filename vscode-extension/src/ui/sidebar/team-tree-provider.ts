/**
 * Team Tree Provider — sidebar TreeView for active Agent Teams.
 *
 * Shows team hierarchy:
 * - Team Name (parent)
 *   - Agent Role (children)
 */

import * as vscode from "vscode";
import { AgentOrchestrator, TeamState, AgentState } from "../../core/agent-orchestrator";

// ────────────────────────────────────────────
// Tree Items
// ────────────────────────────────────────────

export class TeamTreeItem extends vscode.TreeItem {
    constructor(
        public readonly team: TeamState,
        collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(team.name, collapsibleState);

        const agentCount = team.agents.length;
        const running = team.agents.filter((a) => a.status === "running").length;
        const statusLabel = team.status === "running"
            ? `${running}/${agentCount} running`
            : team.status;

        this.description = `${team.templateName} · ${statusLabel}`;
        this.contextValue = team.status === "running" || team.status === "launching"
            ? "team-active"
            : "team-completed";

        // Icon based on team status
        switch (team.status) {
            case "launching":
                this.iconPath = new vscode.ThemeIcon(
                    "loading~spin",
                    new vscode.ThemeColor("charts.yellow")
                );
                break;
            case "running":
                this.iconPath = new vscode.ThemeIcon(
                    "organization",
                    new vscode.ThemeColor("charts.green")
                );
                break;
            case "completed":
                this.iconPath = new vscode.ThemeIcon(
                    "pass",
                    new vscode.ThemeColor("charts.blue")
                );
                break;
            case "error":
                this.iconPath = new vscode.ThemeIcon(
                    "error",
                    new vscode.ThemeColor("charts.red")
                );
                break;
            case "stopped":
                this.iconPath = new vscode.ThemeIcon(
                    "debug-stop",
                    new vscode.ThemeColor("disabledForeground")
                );
                break;
        }

        // Rich tooltip
        const md = new vscode.MarkdownString("", true);
        md.isTrusted = true;
        md.appendMarkdown(`**${team.name}**\n\n`);
        md.appendMarkdown(`Template: ${team.templateName}\n\n`);
        md.appendMarkdown(`Status: ${team.status}\n\n`);
        if (team.taskDescription) {
            md.appendMarkdown(`Task: ${team.taskDescription}\n\n`);
        }
        md.appendMarkdown(`Agents: ${agentCount}\n\n`);
        md.appendMarkdown(`Started: ${new Date(team.startedAt).toLocaleString()}\n\n`);
        if (team.endedAt) {
            md.appendMarkdown(`Ended: ${new Date(team.endedAt).toLocaleString()}\n\n`);
        }
        this.tooltip = md;
    }
}

export class AgentTreeItem extends vscode.TreeItem {
    constructor(
        public readonly agent: AgentState,
        public readonly teamId: string
    ) {
        super(agent.displayName, vscode.TreeItemCollapsibleState.None);

        this.description = `${agent.role} · ${agent.status}`;
        this.contextValue = agent.status === "running"
            ? "agent-active"
            : "agent-completed";

        // Icon based on agent status
        switch (agent.status) {
            case "pending":
                this.iconPath = new vscode.ThemeIcon(
                    "circle-outline",
                    new vscode.ThemeColor("disabledForeground")
                );
                break;
            case "launching":
                this.iconPath = new vscode.ThemeIcon(
                    "loading~spin",
                    new vscode.ThemeColor("charts.yellow")
                );
                break;
            case "running":
                this.iconPath = new vscode.ThemeIcon(
                    "sync~spin",
                    new vscode.ThemeColor("charts.green")
                );
                break;
            case "completed":
                this.iconPath = new vscode.ThemeIcon(
                    "pass",
                    new vscode.ThemeColor("charts.blue")
                );
                break;
            case "error":
                this.iconPath = new vscode.ThemeIcon(
                    "error",
                    new vscode.ThemeColor("charts.red")
                );
                break;
            case "stopped":
                this.iconPath = new vscode.ThemeIcon(
                    "debug-stop",
                    new vscode.ThemeColor("disabledForeground")
                );
                break;
        }

        // Tooltip
        const md = new vscode.MarkdownString("", true);
        md.isTrusted = true;
        md.appendMarkdown(`**${agent.displayName}** (\`${agent.role}\`)\n\n`);
        md.appendMarkdown(`Status: ${agent.status}\n\n`);
        if (agent.branch) {
            md.appendMarkdown(`Branch: \`${agent.branch}\`\n\n`);
        }
        if (agent.worktreePath) {
            md.appendMarkdown(`Path: \`${agent.worktreePath}\`\n\n`);
        }
        this.tooltip = md;
    }
}

// ────────────────────────────────────────────
// Tree Data Provider
// ────────────────────────────────────────────

type TeamTreeElement = TeamTreeItem | AgentTreeItem;

export class TeamTreeProvider
    implements vscode.TreeDataProvider<TeamTreeElement>, vscode.Disposable
{
    private _onDidChangeTreeData = new vscode.EventEmitter<
        TeamTreeElement | undefined | null
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private orchestrator: AgentOrchestrator | undefined;
    private disposables: vscode.Disposable[] = [];

    setOrchestrator(orchestrator: AgentOrchestrator): void {
        // Clean up old listener
        for (const d of this.disposables) d.dispose();
        this.disposables = [];

        this.orchestrator = orchestrator;
        this.disposables.push(
            orchestrator.onDidChangeTeams(() => this.refresh())
        );
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: TeamTreeElement): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TeamTreeElement): TeamTreeElement[] {
        if (!this.orchestrator) return [];

        // Root level: show teams
        if (!element) {
            const teams = this.orchestrator.getAllTeams();
            if (teams.length === 0) return [];

            // Active teams first, then by start time desc
            return teams
                .sort((a, b) => {
                    const aActive = a.status === "running" || a.status === "launching";
                    const bActive = b.status === "running" || b.status === "launching";
                    if (aActive !== bActive) return aActive ? -1 : 1;
                    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
                })
                .map(
                    (team) =>
                        new TeamTreeItem(
                            team,
                            vscode.TreeItemCollapsibleState.Expanded
                        )
                );
        }

        // Team children: show agents
        if (element instanceof TeamTreeItem) {
            return element.team.agents.map(
                (agent) => new AgentTreeItem(agent, element.team.id)
            );
        }

        return [];
    }

    dispose(): void {
        for (const d of this.disposables) d.dispose();
        this._onDidChangeTreeData.dispose();
    }
}
