import type { WorktreeInfo } from "../types";

interface WorktreeStatusProps {
    worktrees: WorktreeInfo[];
    activeSessions: number;
}

export function WorktreeStatus({
    worktrees,
    activeSessions,
}: WorktreeStatusProps) {
    const total = worktrees.length;
    const clean = worktrees.filter((w) => w.statusSummary === "clean").length;
    const dirty = total - clean;

    return (
        <div className="status-bar">
            <div className="stat">
                <span className="stat-value">{total}</span>
                <span className="stat-label">Worktrees</span>
            </div>
            <div className="stat">
                <span className="stat-value">{activeSessions}</span>
                <span className="stat-label">Active</span>
            </div>
            <div className="stat">
                <span className="stat-value">{clean}</span>
                <span className="stat-label">Clean</span>
            </div>
            {dirty > 0 && (
                <div className="stat stat-warn">
                    <span className="stat-value">{dirty}</span>
                    <span className="stat-label">Changed</span>
                </div>
            )}
        </div>
    );
}
