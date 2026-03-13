import type { FileChange } from "../types";

interface FileActivityStreamProps {
    changes: FileChange[];
}

export function FileActivityStream({ changes }: FileActivityStreamProps) {
    return (
        <div className="file-activity">
            <h2 className="section-title">File Activity</h2>

            {changes.length === 0 ? (
                <p className="text-muted">No file changes detected yet.</p>
            ) : (
                <div className="activity-list">
                    {changes.map((change, i) => (
                        <FileChangeItem key={`${change.timestamp}-${i}`} change={change} />
                    ))}
                </div>
            )}
        </div>
    );
}

function FileChangeItem({ change }: { change: FileChange }) {
    const time = new Date(change.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });

    const icon = change.changeType === "created"
        ? "+"
        : change.changeType === "deleted"
            ? "-"
            : "~";

    const iconClass = `change-icon change-${change.changeType}`;

    // Show just the filename, not full path
    const fileName = change.filePath.split("/").pop() ?? change.filePath;

    return (
        <div className="activity-item">
            <span className="activity-time">{time}</span>
            <span className={iconClass}>{icon}</span>
            <span className="activity-branch" title={change.branch}>
                {change.branch.length > 20
                    ? change.branch.slice(0, 20) + "..."
                    : change.branch}
            </span>
            <span className="activity-file" title={change.filePath}>
                {fileName}
            </span>
        </div>
    );
}
