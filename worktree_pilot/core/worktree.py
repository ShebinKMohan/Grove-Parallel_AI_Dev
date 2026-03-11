"""Worktree CRUD logic — create, list, remove, pull workflows."""

from pathlib import Path

from git import GitCommandError, Repo

from worktree_pilot.core import git_ops
from worktree_pilot.core.branch import compute_worktree_path, resolve_branch_strategy


def create_worktree(
    repo: Repo, branch_name: str, custom_path: Path | None = None
) -> dict[str, str]:
    """Create a new worktree with proper branch handling.

    Args:
        repo: The git repository.
        branch_name: Desired branch name.
        custom_path: Optional custom path. Auto-computed if None.

    Returns:
        Dict with 'path', 'branch', 'description' of what was done.

    Raises:
        GitCommandError: If worktree creation fails.
    """
    strategy = resolve_branch_strategy(repo, branch_name)
    wt_path = custom_path or compute_worktree_path(repo, branch_name)

    git_ops.add_worktree(
        repo,
        path=wt_path,
        branch=strategy["branch"],
        new_branch=strategy["new_branch"],
        start_point=strategy["start_point"] if strategy["new_branch"] else None,
    )

    return {
        "path": str(wt_path),
        "branch": strategy["branch"],
        "description": strategy["description"],
    }


def list_all_worktrees(repo: Repo) -> list[dict[str, str]]:
    """List all worktrees with status info.

    Args:
        repo: The git repository.

    Returns:
        List of worktree info dicts with 'path', 'branch', 'commit',
        'is_main', 'status' keys.
    """
    worktrees = git_ops.list_worktrees(repo)
    for wt in worktrees:
        wt_path = Path(wt["path"])
        if wt_path.exists():
            status = git_ops.get_worktree_status(wt_path)
            changes = []
            if status["modified"]:
                changes.append(f"{status['modified']}M")
            if status["staged"]:
                changes.append(f"{status['staged']}S")
            if status["untracked"]:
                changes.append(f"{status['untracked']}?")
            if status["conflicts"]:
                changes.append(f"{status['conflicts']}!")
            wt["status"] = " ".join(changes) if changes else "clean"
        else:
            wt["status"] = "missing"
    return worktrees


def remove_worktree(
    repo: Repo, path: Path, delete_branch: bool = False, force: bool = False
) -> dict[str, str]:
    """Remove a worktree and optionally its branch.

    Args:
        repo: The git repository.
        path: Path of the worktree to remove.
        delete_branch: If True, also delete the associated branch.
        force: If True, force removal.

    Returns:
        Dict describing what was done.
    """
    worktrees = git_ops.list_worktrees(repo)
    branch_name = None
    for wt in worktrees:
        if Path(wt["path"]).resolve() == path.resolve():
            branch_name = wt.get("branch")
            break

    git_ops.remove_worktree(repo, path, force=force)

    result = {"path": str(path), "removed": "true"}

    if delete_branch and branch_name and branch_name != "(detached HEAD)":
        try:
            git_ops.delete_branch(repo, branch_name, force=force)
            result["branch_deleted"] = branch_name
        except GitCommandError:
            result["branch_deleted"] = "failed"

    return result


def pull_all_worktrees(repo: Repo) -> list[dict[str, str]]:
    """Pull latest changes in all worktrees.

    Args:
        repo: The git repository.

    Returns:
        List of dicts with 'path', 'branch', 'result' for each worktree.
    """
    worktrees = git_ops.list_worktrees(repo)
    results: list[dict[str, str]] = []

    for wt in worktrees:
        wt_path = Path(wt["path"])
        if not wt_path.exists():
            results.append(
                {
                    "path": wt["path"],
                    "branch": wt.get("branch", "unknown"),
                    "result": "path missing",
                }
            )
            continue

        result = git_ops.pull_branch(repo, wt_path)
        results.append(
            {
                "path": wt["path"],
                "branch": wt.get("branch", "unknown"),
                "result": result,
            }
        )

    return results
