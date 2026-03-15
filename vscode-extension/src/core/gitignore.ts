/**
 * Auto-manage .gitignore entries for worktree directories
 * and the .grove/ local state directory.
 */

import * as fs from "fs";
import * as path from "path";

const GROVE_DIR_PATTERN = "/.grove/";

/**
 * Add a pattern to .gitignore. Creates the file if it doesn't exist.
 * Returns true if the entry was added, false if already present.
 */
function addToGitignore(
    gitignorePath: string,
    pattern: string,
    header: string
): boolean {
    if (fs.existsSync(gitignorePath)) {
        let content = fs.readFileSync(gitignorePath, "utf-8");
        if (content.includes(pattern)) {
            return false;
        }
        if (!content.endsWith("\n")) {
            content += "\n";
        }
        content += `${pattern}\n`;
        fs.writeFileSync(gitignorePath, content);
    } else {
        fs.writeFileSync(gitignorePath, `${header}\n${pattern}\n`);
    }
    return true;
}

/**
 * Ensure a worktree path is in .gitignore.
 * Returns true if the entry was added, false if already present.
 */
export function ensureGitignored(
    repoRoot: string,
    worktreePath: string
): boolean {
    const resolved = path.resolve(worktreePath);
    const resolvedRoot = path.resolve(repoRoot);

    if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
        // Worktree is outside the repo — nothing to gitignore
        return false;
    }

    const relative = path.relative(resolvedRoot, resolved).replace(/\\/g, "/");
    const pattern = `/${relative}/`;
    const gitignorePath = path.join(repoRoot, ".gitignore");

    return addToGitignore(gitignorePath, pattern, "# Grove managed worktrees");
}

/**
 * Ensure .grove/ (local state directory) is in .gitignore.
 * Called when .grove/ is first created to persist sessions or teams.
 * Returns true if the entry was added, false if already present.
 */
export function ensureGroveDirIgnored(repoRoot: string): boolean {
    const gitignorePath = path.join(repoRoot, ".gitignore");
    return addToGitignore(gitignorePath, GROVE_DIR_PATTERN, "# Grove local state");
}
