/**
 * Shared types for extension ↔ WebView message passing.
 */

export type SessionStatus = "running" | "idle" | "completed" | "error";

export interface SessionInfo {
    id: string;
    worktreePath: string;
    branch: string;
    taskDescription: string;
    startedAt: string;
    endedAt?: string;
    status: SessionStatus;
    exitCode?: number;
    modifiedFiles: string[];
}

export interface WorktreeInfo {
    path: string;
    branch: string;
    commit: string;
    isMain: boolean;
    statusSummary: string;
    status: {
        modified: number;
        staged: number;
        untracked: number;
        conflicts: number;
    };
}

export interface FileChange {
    timestamp: string;
    worktreePath: string;
    branch: string;
    filePath: string;
    changeType: "created" | "modified" | "deleted";
}

/** Messages from extension to WebView */
export type ExtensionMessage =
    | { type: "update"; sessions: SessionInfo[]; worktrees: WorktreeInfo[] }
    | { type: "file-change"; change: FileChange };

/** Messages from WebView to extension */
export type WebViewMessage =
    | { type: "stop-session"; sessionId: string }
    | { type: "focus-session"; sessionId: string }
    | { type: "open-terminal"; worktreePath: string; branch: string }
    | { type: "view-diff"; worktreePath: string; branch: string }
    | { type: "refresh" }
    | { type: "ready" };
