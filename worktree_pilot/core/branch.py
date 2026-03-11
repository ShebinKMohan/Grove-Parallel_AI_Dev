"""Branch naming, validation, and creation strategy."""

import re
from pathlib import Path

from git import Repo

from worktree_pilot.constants import BRANCH_PREFIXES, DEFAULT_WORKTREE_DIR_PREFIX
from worktree_pilot.core import git_ops


def validate_branch_name(name: str) -> str | None:
    """Validate a git branch name.

    Args:
        name: Proposed branch name.

    Returns:
        None if valid, or an error message string.
    """
    if not name:
        return "Branch name cannot be empty."
    if name.startswith("/") or name.endswith("/"):
        return "Branch name cannot start or end with '/'."
    if ".." in name:
        return "Branch name cannot contain '..'."
    if name.endswith(".lock"):
        return "Branch name cannot end with '.lock'."
    if " " in name or "~" in name or "^" in name or ":" in name or "?" in name or "*" in name:
        return "Branch name contains invalid characters (spaces, ~, ^, :, ?, *)."
    if not re.match(r"^[\w./-]+$", name):
        return "Branch name contains invalid characters."
    return None


def suggest_branch_name(description: str, prefix: str = "feature/") -> str:
    """Generate a branch name from a description.

    Args:
        description: Human-readable description (e.g., "add user auth").
        prefix: Branch prefix to use.

    Returns:
        A valid branch name like "feature/add-user-auth".
    """
    slug = re.sub(r"[^\w\s-]", "", description.lower().strip())
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return f"{prefix}{slug}"


def resolve_branch_strategy(repo: Repo, branch_name: str) -> dict[str, str | bool]:
    """Determine how to set up a worktree for the given branch.

    This implements the critical -b flag decision tree:
    - Branch exists locally → no -b, use branch name directly
    - Branch exists on remote only → -b with origin/branch as start point
    - Brand new branch → -b with HEAD as start point

    Args:
        repo: The git repository.
        branch_name: The desired branch name.

    Returns:
        Dict with keys:
            'branch': the branch name to use
            'new_branch': whether to pass -b
            'start_point': the start point (if new_branch is True)
            'description': human-readable explanation of what will happen
    """
    if git_ops.branch_exists_locally(repo, branch_name):
        return {
            "branch": branch_name,
            "new_branch": False,
            "start_point": "",
            "description": f"Using existing local branch '{branch_name}'",
        }

    if git_ops.branch_exists_on_remote(repo, branch_name):
        return {
            "branch": branch_name,
            "new_branch": True,
            "start_point": f"origin/{branch_name}",
            "description": (
                f"Creating local branch '{branch_name}' tracking 'origin/{branch_name}'"
            ),
        }

    return {
        "branch": branch_name,
        "new_branch": True,
        "start_point": "HEAD",
        "description": f"Creating new branch '{branch_name}' from current HEAD",
    }


def compute_worktree_path(repo: Repo, branch_name: str) -> Path:
    """Compute the absolute path for a new worktree.

    Places worktrees in a sibling directory structure:
    <repo-root>/../<repo-name>-worktrees/<branch-slug>

    Args:
        repo: The git repository.
        branch_name: The branch name (used to derive directory name).

    Returns:
        Absolute path for the worktree.
    """
    repo_root = git_ops.get_repo_root(repo)
    slug = branch_name.replace("/", "-")
    worktree_base = repo_root.parent / f"{repo_root.name}-{DEFAULT_WORKTREE_DIR_PREFIX}"
    return (worktree_base / slug).resolve()


def get_prefix_choices() -> list[dict[str, str]]:
    """Return branch prefix choices for interactive selection.

    Returns:
        List of dicts with 'name' (display) and 'value' (prefix string).
    """
    return [
        {"name": f"{prefix.rstrip('/')}  →  {prefix}<your-name>", "value": prefix}
        for prefix in BRANCH_PREFIXES
    ]
