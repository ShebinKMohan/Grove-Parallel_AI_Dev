"""Input validation for branch names, paths, and other user input."""

from pathlib import Path

from worktree_pilot.core.branch import validate_branch_name


def validate_branch_input(name: str) -> str | None:
    """Validate branch name input from user.

    Args:
        name: The branch name to validate.

    Returns:
        None if valid, or error message string.
    """
    return validate_branch_name(name)


def validate_path_writable(path: Path) -> str | None:
    """Check that a path's parent exists and is writable.

    Args:
        path: The path to check.

    Returns:
        None if valid, or error message string.
    """
    parent = path.parent
    if not parent.exists():
        return f"Parent directory does not exist: {parent}"
    if not parent.is_dir():
        return f"Parent path is not a directory: {parent}"
    return None


def validate_worktree_path_available(path: Path) -> str | None:
    """Check that a worktree path doesn't already exist.

    Args:
        path: The proposed worktree path.

    Returns:
        None if available, or error message string.
    """
    if path.exists():
        return f"Path already exists: {path}\n  Fix: Choose a different name or run 'wt cleanup'."
    return None
