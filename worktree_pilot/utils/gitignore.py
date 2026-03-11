"""Auto-manage .gitignore entries for worktree directories."""

from pathlib import Path


def ensure_gitignored(repo_root: Path, worktree_path: Path) -> bool:
    """Ensure a worktree path is in .gitignore.

    Args:
        repo_root: Root of the git repository.
        worktree_path: Path to the worktree directory.

    Returns:
        True if the entry was added, False if already present.
    """
    gitignore = repo_root / ".gitignore"
    # Compute relative pattern
    try:
        relative = worktree_path.resolve().relative_to(repo_root.resolve())
        pattern = f"/{relative}/"
    except ValueError:
        # Worktree is outside the repo — nothing to gitignore
        return False

    if gitignore.exists():
        content = gitignore.read_text()
        if pattern in content:
            return False
        # Append with newline safety
        if not content.endswith("\n"):
            content += "\n"
        content += f"{pattern}\n"
        gitignore.write_text(content)
    else:
        gitignore.write_text(f"# WorkTree Pilot managed worktrees\n{pattern}\n")

    return True
