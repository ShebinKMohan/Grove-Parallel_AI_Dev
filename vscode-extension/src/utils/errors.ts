/**
 * Custom error types with fix suggestions.
 * Every error shown to users includes a fix command.
 */

export class WorktreePilotError extends Error {
    public readonly fix: string;
    public readonly originalError?: Error;

    constructor(message: string, fix: string, originalError?: Error) {
        super(message);
        this.name = "WorktreePilotError";
        this.fix = fix;
        this.originalError = originalError;
    }
}

export class GitNotFoundError extends WorktreePilotError {
    constructor() {
        super(
            "Git is not installed or not found in PATH.",
            "Install git: https://git-scm.com/downloads"
        );
        this.name = "GitNotFoundError";
    }
}

export class NotAGitRepoError extends WorktreePilotError {
    constructor(path: string) {
        super(
            `No git repository found at or above ${path}.`,
            "Run 'git init' or open a folder that contains a git repository."
        );
        this.name = "NotAGitRepoError";
    }
}

export class BranchAlreadyCheckedOutError extends WorktreePilotError {
    constructor(branch: string) {
        super(
            `Branch '${branch}' is already checked out in another worktree.`,
            "Use a different branch name, or remove the other worktree first."
        );
        this.name = "BranchAlreadyCheckedOutError";
    }
}

export class WorktreePathExistsError extends WorktreePilotError {
    constructor(path: string) {
        super(
            `Path '${path}' already exists.`,
            "Choose a different directory name, or run Cleanup to remove stale worktrees."
        );
        this.name = "WorktreePathExistsError";
    }
}
