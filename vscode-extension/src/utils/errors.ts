/**
 * Custom error types with fix suggestions.
 * Every error shown to users includes a fix command.
 */

export class GroveError extends Error {
    public readonly fix: string;
    public readonly originalError?: Error;

    constructor(message: string, fix: string, originalError?: Error) {
        super(message);
        this.name = "GroveError";
        this.fix = fix;
        this.originalError = originalError;
    }
}

export class BranchAlreadyCheckedOutError extends GroveError {
    constructor(branch: string) {
        super(
            `Branch '${branch}' is already checked out in another worktree.`,
            "Use a different branch name, or remove the other worktree first."
        );
        this.name = "BranchAlreadyCheckedOutError";
    }
}

export class WorktreePathExistsError extends GroveError {
    constructor(path: string) {
        super(
            `Path '${path}' already exists.`,
            "Choose a different directory name, or run Cleanup to remove stale worktrees."
        );
        this.name = "WorktreePathExistsError";
    }
}
