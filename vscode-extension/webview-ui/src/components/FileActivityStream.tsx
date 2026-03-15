import { useMemo, useState } from "react";
import type { FileChange } from "../types";
import vscode from "../vscode";

interface FileActivityStreamProps {
    changes: FileChange[];
}

/** Files to hide — Claude Code atomic writes, editor swap files, etc. */
const NOISE_PATTERNS = [
    /\.tmp\.\d+$/,
    /\.swp$/,
    /~$/,
    /\.DS_Store$/,
];

function isNoise(filePath: string): boolean {
    return NOISE_PATTERNS.some((p) => p.test(filePath));
}

interface FileSummary {
    filePath: string;
    fileName: string;
    dir: string;
    status: "created" | "modified" | "deleted";
    changeCount: number;
    lastChanged: string;
    branch: string;
    worktreePath: string;
}

interface DirGroup {
    dir: string;
    files: FileSummary[];
}

interface BranchSummary {
    branch: string;
    worktreePath: string;
    dirs: DirGroup[];
    stats: { created: number; modified: number; deleted: number };
}

function buildSummary(changes: FileChange[]): BranchSummary[] {
    // Filter noise
    const clean = changes.filter((c) => !isNoise(c.filePath));

    // Group by branch
    const branchMap = new Map<string, FileChange[]>();
    for (const c of clean) {
        const key = `${c.branch}::${c.worktreePath}`;
        let arr = branchMap.get(key);
        if (!arr) {
            arr = [];
            branchMap.set(key, arr);
        }
        arr.push(c);
    }

    const result: BranchSummary[] = [];

    for (const [, branchChanges] of branchMap) {
        // Deduplicate: keep latest change per file, accumulate count
        const fileMap = new Map<string, FileSummary>();
        for (const c of branchChanges) {
            const existing = fileMap.get(c.filePath);
            const parts = c.filePath.split("/");
            const fileName = parts.pop() ?? c.filePath;
            const dir = parts.length > 0 ? parts.join("/") : ".";

            if (!existing || new Date(c.timestamp) > new Date(existing.lastChanged)) {
                fileMap.set(c.filePath, {
                    filePath: c.filePath,
                    fileName,
                    dir,
                    status: c.changeType,
                    changeCount: (existing?.changeCount ?? 0) + 1,
                    lastChanged: c.timestamp,
                    branch: c.branch,
                    worktreePath: c.worktreePath,
                });
            } else {
                existing.changeCount++;
            }
        }

        // Group by directory
        const dirMap = new Map<string, FileSummary[]>();
        for (const file of fileMap.values()) {
            let arr = dirMap.get(file.dir);
            if (!arr) {
                arr = [];
                dirMap.set(file.dir, arr);
            }
            arr.push(file);
        }

        // Sort dirs, sort files within dirs
        const dirs: DirGroup[] = Array.from(dirMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dir, files]) => ({
                dir,
                files: files.sort((a, b) => a.fileName.localeCompare(b.fileName)),
            }));

        // Compute stats
        let created = 0, modified = 0, deleted = 0;
        for (const file of fileMap.values()) {
            if (file.status === "created") created++;
            else if (file.status === "deleted") deleted++;
            else modified++;
        }

        const sample = branchChanges[0];
        result.push({
            branch: sample.branch,
            worktreePath: sample.worktreePath,
            dirs,
            stats: { created, modified, deleted },
        });
    }

    return result;
}

export function FileActivityStream({ changes }: FileActivityStreamProps) {
    const summaries = useMemo(() => buildSummary(changes), [changes]);
    const totalFiles = useMemo(
        () => summaries.reduce((sum, s) => sum + s.stats.created + s.stats.modified + s.stats.deleted, 0),
        [summaries]
    );

    return (
        <div className="file-activity">
            <div className="activity-header">
                <h2 className="section-title">File Activity</h2>
                {totalFiles > 0 && (
                    <span className="activity-count text-muted">
                        {totalFiles} file{totalFiles !== 1 ? "s" : ""}
                    </span>
                )}
            </div>

            {totalFiles === 0 ? (
                <div className="empty-state">
                    <p>No file changes detected yet.</p>
                    <p className="text-muted">
                        File changes across all active worktrees will appear here in real time.
                    </p>
                </div>
            ) : (
                <div className="activity-groups">
                    {summaries.map((summary) => (
                        <BranchSummaryCard
                            key={`${summary.branch}-${summary.worktreePath}`}
                            summary={summary}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function BranchSummaryCard({ summary }: { summary: BranchSummary }) {
    const { stats } = summary;

    return (
        <div className="activity-branch-group">
            <div className="activity-branch-header">
                <span className="activity-branch-name">{summary.branch}</span>
                <span className="activity-branch-stats">
                    {stats.created > 0 && (
                        <span className="stat-created">+{stats.created}</span>
                    )}
                    {stats.modified > 0 && (
                        <span className="stat-modified">~{stats.modified}</span>
                    )}
                    {stats.deleted > 0 && (
                        <span className="stat-deleted">-{stats.deleted}</span>
                    )}
                </span>
            </div>
            <div className="activity-dir-list">
                {summary.dirs.map((dirGroup) => (
                    <DirSection
                        key={dirGroup.dir}
                        group={dirGroup}
                        worktreePath={summary.worktreePath}
                        branch={summary.branch}
                    />
                ))}
            </div>
        </div>
    );
}

function DirSection({
    group,
    worktreePath,
    branch,
}: {
    group: DirGroup;
    worktreePath: string;
    branch: string;
}) {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <div className="activity-dir">
            <div
                className="activity-dir-header"
                onClick={() => setCollapsed(!collapsed)}
            >
                <span className="activity-dir-arrow">
                    {collapsed ? "\u25B6" : "\u25BC"}
                </span>
                <span className="activity-dir-name">{group.dir}/</span>
                <span className="activity-dir-count text-muted">
                    {group.files.length}
                </span>
            </div>
            {!collapsed && (
                <div className="activity-dir-files">
                    {group.files.map((file) => (
                        <FileRow
                            key={file.filePath}
                            file={file}
                            worktreePath={worktreePath}
                            branch={branch}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function FileRow({
    file,
    worktreePath,
    branch,
}: {
    file: FileSummary;
    worktreePath: string;
    branch: string;
}) {
    const statusIcon =
        file.status === "created"
            ? "+"
            : file.status === "deleted"
              ? "\u2212"
              : "~";

    const statusClass = `file-status-${file.status}`;

    return (
        <div
            className="activity-file-row"
            onClick={() =>
                vscode.postMessage({
                    type: "open-file-diff",
                    worktreePath,
                    branch,
                    filePath: file.filePath,
                })
            }
            title={`${file.filePath} — click to view diff`}
        >
            <span className={`activity-file-icon ${statusClass}`}>
                {statusIcon}
            </span>
            <span className="activity-file-name">{file.fileName}</span>
            {file.changeCount > 1 && (
                <span className="activity-file-edits text-muted">
                    {file.changeCount} edits
                </span>
            )}
        </div>
    );
}
