import type { SessionInfo } from "../types";
import vscode from "../vscode";

interface AgentCardProps {
    session: SessionInfo;
}

export function AgentCard({ session }: AgentCardProps) {
    const isActive =
        session.status === "running" || session.status === "idle";
    const elapsed = formatElapsed(session.startedAt, session.endedAt);

    return (
        <div className={`card card-${session.status}`}>
            <div className="card-header">
                <div className="card-title">
                    <span className={`status-dot status-${session.status}`} />
                    <span className="branch-name">{session.branch}</span>
                </div>
                <span className="card-elapsed">{elapsed}</span>
            </div>

            {session.taskDescription && (
                <p className="card-task">{session.taskDescription}</p>
            )}

            {session.modifiedFiles.length > 0 && (
                <div className="card-files">
                    <span className="files-count">
                        {session.modifiedFiles.length} file
                        {session.modifiedFiles.length !== 1 ? "s" : ""} changed
                    </span>
                    <ul className="files-list">
                        {session.modifiedFiles.slice(0, 5).map((f) => (
                            <li key={f} className="file-item">
                                {f}
                            </li>
                        ))}
                        {session.modifiedFiles.length > 5 && (
                            <li className="file-item text-muted">
                                +{session.modifiedFiles.length - 5} more
                            </li>
                        )}
                    </ul>
                </div>
            )}

            <div className="card-actions">
                {isActive && (
                    <>
                        <button
                            className="btn btn-small"
                            onClick={() =>
                                vscode.postMessage({
                                    type: "focus-session",
                                    sessionId: session.id,
                                })
                            }
                        >
                            Terminal
                        </button>
                        <button
                            className="btn btn-small"
                            onClick={() =>
                                vscode.postMessage({
                                    type: "view-diff",
                                    worktreePath: session.worktreePath,
                                    branch: session.branch,
                                })
                            }
                        >
                            Diff
                        </button>
                        <button
                            className="btn btn-small btn-danger"
                            onClick={() =>
                                vscode.postMessage({
                                    type: "stop-session",
                                    sessionId: session.id,
                                })
                            }
                        >
                            Stop
                        </button>
                    </>
                )}
                {!isActive && (
                    <button
                        className="btn btn-small"
                        onClick={() =>
                            vscode.postMessage({
                                type: "view-diff",
                                worktreePath: session.worktreePath,
                                branch: session.branch,
                            })
                        }
                    >
                        View Diff
                    </button>
                )}
            </div>

            {session.status === "error" && session.exitCode !== undefined && (
                <div className="card-error">
                    Exited with code {session.exitCode}
                </div>
            )}
        </div>
    );
}

function formatElapsed(
    startedAt: string,
    endedAt: string | undefined
): string {
    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    const ms = end - start;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return `${hours}h ${rem}m`;
}
