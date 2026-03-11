"""Merge and conflict resolution logic.

Handles merging worktree branches back into a target branch,
with conflict detection and resolution guidance.
"""

from git import GitCommandError, Repo

from worktree_pilot.core import git_ops


def merge_branch(
    repo: Repo,
    source_branch: str,
    target_branch: str = "main",
    no_ff: bool = True,
) -> dict[str, str]:
    """Merge a source branch into the target branch.

    Args:
        repo: The git repository.
        source_branch: Branch to merge from.
        target_branch: Branch to merge into (default: main).
        no_ff: If True, create a merge commit even for fast-forwards.

    Returns:
        Dict with 'status' ('merged', 'conflict', 'already_merged'),
        'source', 'target', and optional 'details'.

    Raises:
        GitCommandError: If the merge fails for non-conflict reasons.
    """
    # Ensure both branches exist
    if not git_ops.branch_exists_locally(repo, source_branch):
        raise GitCommandError(
            "merge",
            128,
            stderr=(
                f"Source branch '{source_branch}' does not exist locally.\n"
                f"  Fix: Create the branch first or check the name.\n"
                f"  Run: git branch -a  (to see all branches)"
            ),
        )

    if not git_ops.branch_exists_locally(repo, target_branch):
        raise GitCommandError(
            "merge",
            128,
            stderr=(
                f"Target branch '{target_branch}' does not exist locally.\n"
                f"  Fix: Check the branch name or fetch from remote.\n"
                f"  Run: git fetch origin {target_branch}"
            ),
        )

    # Check if already merged
    try:
        merged_branches = repo.git.branch("--merged", target_branch).splitlines()
        merged_names = [b.strip().lstrip("* ") for b in merged_branches]
        if source_branch in merged_names:
            return {
                "status": "already_merged",
                "source": source_branch,
                "target": target_branch,
                "details": f"'{source_branch}' is already merged into '{target_branch}'.",
            }
    except GitCommandError:
        pass

    # Save current branch to restore later
    original_branch = git_ops.get_current_branch(repo)

    try:
        # Checkout the target branch
        repo.git.checkout(target_branch)

        # Perform the merge
        args = ["--no-ff"] if no_ff else []
        args.extend([source_branch, "-m", f"Merge '{source_branch}' into '{target_branch}'"])
        repo.git.merge(*args)

        return {
            "status": "merged",
            "source": source_branch,
            "target": target_branch,
            "details": f"Successfully merged '{source_branch}' into '{target_branch}'.",
        }

    except GitCommandError as e:
        stderr = e.stderr.strip() if e.stderr else str(e)
        if "CONFLICT" in stderr or "conflict" in stderr.lower():
            conflicts = get_conflict_files(repo)
            return {
                "status": "conflict",
                "source": source_branch,
                "target": target_branch,
                "details": f"Merge conflicts in {len(conflicts)} file(s).",
                "conflict_files": "\n".join(conflicts),
            }
        raise GitCommandError(
            e.command,
            e.status,
            stderr=(
                f"Failed to merge '{source_branch}' into '{target_branch}'.\n"
                f"  Original error: {stderr}"
            ),
        ) from e
    finally:
        # Try to return to original branch (best-effort)
        try:
            if original_branch != "HEAD":
                repo.git.checkout(original_branch)
        except GitCommandError:
            pass


def get_conflict_files(repo: Repo) -> list[str]:
    """Get list of files with merge conflicts.

    Args:
        repo: The git repository.

    Returns:
        List of file paths with conflicts.
    """
    try:
        unmerged = repo.index.unmerged_blobs()
        return list(unmerged.keys())
    except Exception:
        # Fallback: parse git status for unmerged paths
        try:
            status_output = repo.git.status("--porcelain")
            conflicts = []
            for line in status_output.splitlines():
                if line[:2] in ("UU", "AA", "DD", "AU", "UA", "DU", "UD"):
                    conflicts.append(line[3:])
            return conflicts
        except GitCommandError:
            return []


def abort_merge(repo: Repo) -> dict[str, str]:
    """Abort an in-progress merge.

    Args:
        repo: The git repository.

    Returns:
        Dict with 'status' and 'details'.
    """
    try:
        repo.git.merge("--abort")
        return {
            "status": "aborted",
            "details": "Merge aborted. Working tree restored to pre-merge state.",
        }
    except GitCommandError as e:
        raise GitCommandError(
            e.command,
            e.status,
            stderr=(
                "Failed to abort merge.\n"
                f"  Fix: Run 'git reset --hard HEAD' to restore the working tree.\n"
                f"  Original error: {e.stderr}"
            ),
        ) from e


def get_merge_candidates(repo: Repo, target_branch: str = "main") -> list[str]:
    """Get branches that are not yet merged into the target.

    Args:
        repo: The git repository.
        target_branch: Branch to check against.

    Returns:
        List of unmerged branch names.
    """
    try:
        unmerged_output = repo.git.branch("--no-merged", target_branch).splitlines()
        candidates = []
        for line in unmerged_output:
            name = line.strip().lstrip("* ")
            if name and name != target_branch:
                candidates.append(name)
        return candidates
    except GitCommandError:
        return []
