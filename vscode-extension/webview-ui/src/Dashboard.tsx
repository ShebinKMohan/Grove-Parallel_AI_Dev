import { useEffect, useState, useCallback } from "react";
import type {
    SessionInfo,
    WorktreeInfo,
    FileChange,
    OverlapAlert,
    ExtensionMessage,
} from "./types";
import vscode from "./vscode";
import { AgentCard } from "./components/AgentCard";
import { FileActivityStream } from "./components/FileActivityStream";
import { WorktreeStatus } from "./components/WorktreeStatus";
import { OverlapAlerts } from "./components/OverlapAlerts";
import "./dashboard.css";

const MAX_FILE_CHANGES = 100;

export function Dashboard() {
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
    const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
    const [overlaps, setOverlaps] = useState<OverlapAlert[]>([]);

    const handleMessage = useCallback(
        (event: MessageEvent<ExtensionMessage>) => {
            const message = event.data;
            switch (message.type) {
                case "update":
                    setSessions(message.sessions);
                    setWorktrees(message.worktrees);
                    setOverlaps(message.overlaps);
                    break;
                case "file-change":
                    setFileChanges((prev) => {
                        const next = [message.change, ...prev];
                        return next.slice(0, MAX_FILE_CHANGES);
                    });
                    break;
            }
        },
        []
    );

    useEffect(() => {
        window.addEventListener("message", handleMessage);
        vscode.postMessage({ type: "ready" });
        return () => window.removeEventListener("message", handleMessage);
    }, [handleMessage]);

    const activeSessions = sessions.filter(
        (s) => s.status === "running" || s.status === "idle"
    );
    const completedSessions = sessions.filter(
        (s) => s.status === "completed" || s.status === "error"
    );

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <h1>WorkTree Pilot</h1>
                <div className="header-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={() =>
                            vscode.postMessage({ type: "refresh" })
                        }
                    >
                        Refresh
                    </button>
                </div>
            </header>

            <div className="dashboard-grid">
                {/* Left: Agent Cards */}
                <section className="dashboard-main">
                    {/* Stats bar */}
                    <WorktreeStatus
                        worktrees={worktrees}
                        activeSessions={activeSessions.length}
                    />

                    {/* Overlap Alerts */}
                    <OverlapAlerts overlaps={overlaps} />

                    {/* Active Sessions */}
                    {activeSessions.length > 0 && (
                        <div className="section">
                            <h2 className="section-title">
                                Active Sessions ({activeSessions.length})
                            </h2>
                            <div className="cards-grid">
                                {activeSessions.map((session) => (
                                    <AgentCard
                                        key={session.id}
                                        session={session}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Completed Sessions */}
                    {completedSessions.length > 0 && (
                        <div className="section">
                            <h2 className="section-title">
                                Completed ({completedSessions.length})
                            </h2>
                            <div className="cards-grid">
                                {completedSessions.slice(0, 6).map((session) => (
                                    <AgentCard
                                        key={session.id}
                                        session={session}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {activeSessions.length === 0 &&
                        completedSessions.length === 0 && (
                            <div className="empty-state">
                                <p>No sessions yet.</p>
                                <p className="text-muted">
                                    Launch Claude Code from a worktree to see
                                    session activity here.
                                </p>
                            </div>
                        )}
                </section>

                {/* Right: File Activity Stream */}
                <aside className="dashboard-sidebar">
                    <FileActivityStream changes={fileChanges} />
                </aside>
            </div>
        </div>
    );
}
