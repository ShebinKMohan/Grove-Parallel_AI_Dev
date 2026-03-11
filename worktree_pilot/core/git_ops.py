"""All git operations — GitPython wrappers.

Every git interaction in the project must go through this module.
"""

from pathlib import Path

from git import GitCommandError, InvalidGitRepositoryError, Repo


def find_repo(start_path: Path | None = None) -> Repo:
    """Find the git repository from the given path or cwd, walking up to the root.

    Args:
        start_path: Starting directory. Defaults to cwd.

    Returns:
        A GitPython Repo object for the discovered repository.

    Raises:
        InvalidGitRepositoryError: If no git repo is found.
    """
    path = (start_path or Path.cwd()).resolve()
    try:
        return Repo(path, search_parent_directories=True)
    except InvalidGitRepositoryError as e:
        raise InvalidGitRepositoryError(
            f"No git repository found at or above {path}.\n"
            f"  Fix: Run 'git init' or navigate into a git repository."
        ) from e


def get_repo_root(repo: Repo) -> Path:
    """Return the absolute path to the repository root."""
    return Path(repo.working_dir).resolve()


def get_current_branch(repo: Repo) -> str:
    """Return the name of the current branch.

    Returns:
        Branch name, or 'HEAD' if in detached HEAD state.
    """
    if repo.head.is_detached:
        return "HEAD"
    return repo.active_branch.name


def list_local_branches(repo: Repo) -> list[str]:
    """Return names of all local branches."""
    return [ref.name for ref in repo.branches]


def list_remote_branches(repo: Repo) -> list[str]:
    """Return names of all remote branches (without 'origin/' prefix)."""
    remote_refs = []
    for remote in repo.remotes:
        try:
            remote_refs.extend(ref.remote_head for ref in remote.refs if ref.remote_head != "HEAD")
        except ValueError:
            continue
    return remote_refs


def branch_exists_locally(repo: Repo, branch_name: str) -> bool:
    """Check if a branch exists in local refs."""
    return branch_name in list_local_branches(repo)


def branch_exists_on_remote(repo: Repo, branch_name: str) -> bool:
    """Check if a branch exists on any remote."""
    return branch_name in list_remote_branches(repo)


def list_worktrees(repo: Repo) -> list[dict[str, str]]:
    """List all worktrees with their path, branch, and commit info.

    Returns:
        List of dicts with keys: 'path', 'branch', 'commit', 'is_bare', 'is_main'.
    """
    raw = repo.git.worktree("list", "--porcelain")
    worktrees: list[dict[str, str]] = []
    current: dict[str, str] = {}

    for line in raw.splitlines():
        if line.startswith("worktree "):
            if current:
                worktrees.append(current)
            current = {"path": line.split(" ", 1)[1]}
        elif line.startswith("HEAD "):
            current["commit"] = line.split(" ", 1)[1][:8]
        elif line.startswith("branch "):
            current["branch"] = line.split(" ", 1)[1].replace("refs/heads/", "")
        elif line == "bare":
            current["is_bare"] = "true"
        elif line == "detached":
            current["branch"] = "(detached HEAD)"

    if current:
        worktrees.append(current)

    # Mark the main worktree (first one)
    if worktrees:
        worktrees[0]["is_main"] = "true"
        for wt in worktrees[1:]:
            wt.setdefault("is_main", "false")
            wt.setdefault("is_bare", "false")

    return worktrees


def add_worktree(
    repo: Repo,
    path: Path,
    branch: str,
    new_branch: bool = False,
    start_point: str | None = None,
) -> None:
    """Add a new worktree.

    Args:
        repo: The git repository.
        path: Absolute path where the worktree will be created.
        branch: Branch name for the worktree.
        new_branch: If True, create the branch with -b.
        start_point: The commit/branch to base the new branch on.

    Raises:
        GitCommandError: If the worktree creation fails.
    """
    args = ["add"]
    if new_branch:
        args.extend(["-b", branch])
        args.append(str(path))
        if start_point:
            args.append(start_point)
    else:
        args.append(str(path))
        args.append(branch)

    try:
        repo.git.worktree(*args)
    except GitCommandError as e:
        _raise_friendly_worktree_error(e, branch, path)


def remove_worktree(repo: Repo, path: Path, force: bool = False) -> None:
    """Remove a worktree.

    Args:
        repo: The git repository.
        path: Path of the worktree to remove.
        force: If True, force removal even with changes.

    Raises:
        GitCommandError: If the removal fails.
    """
    args = ["remove"]
    if force:
        args.append("--force")
    args.append(str(path))

    try:
        repo.git.worktree(*args)
    except GitCommandError as e:
        raise GitCommandError(
            e.command,
            e.status,
            stderr=(
                f"Failed to remove worktree at {path}.\n"
                f"  If it has uncommitted changes, use force removal.\n"
                f"  Original error: {e.stderr}"
            ),
        ) from e


def pull_branch(repo: Repo, worktree_path: Path) -> str:
    """Pull latest changes in a worktree.

    Args:
        repo: The main repository (unused — we open the worktree repo directly).
        worktree_path: Path to the worktree.

    Returns:
        Status message describing what happened.
    """
    try:
        wt_repo = Repo(worktree_path)
        if not wt_repo.remotes:
            return "no remote configured"
        result = wt_repo.git.pull()
        if "Already up to date" in result:
            return "already up to date"
        return "updated"
    except GitCommandError as e:
        return f"pull failed: {e.stderr.strip()}"


def delete_branch(repo: Repo, branch_name: str, force: bool = False) -> None:
    """Delete a local branch.

    Args:
        repo: The git repository.
        branch_name: Name of the branch to delete.
        force: If True, use -D instead of -d.
    """
    flag = "-D" if force else "-d"
    try:
        repo.git.branch(flag, branch_name)
    except GitCommandError as e:
        raise GitCommandError(
            e.command,
            e.status,
            stderr=(
                f"Failed to delete branch '{branch_name}'.\n"
                f"  If it has unmerged changes, use force delete.\n"
                f"  Original error: {e.stderr}"
            ),
        ) from e


def get_worktree_status(worktree_path: Path) -> dict[str, int]:
    """Get a summary of the working tree status.

    Returns:
        Dict with counts: 'modified', 'staged', 'untracked', 'conflicts'.
    """
    try:
        wt_repo = Repo(worktree_path)
        status = {"modified": 0, "staged": 0, "untracked": 0, "conflicts": 0}
        for _item in wt_repo.index.diff(None):
            status["modified"] += 1
        for _item in wt_repo.index.diff("HEAD"):
            status["staged"] += 1
        status["untracked"] = len(wt_repo.untracked_files)
        try:
            unmerged = wt_repo.index.unmerged_blobs()
            status["conflicts"] = len(unmerged)
        except Exception:
            pass
        return status
    except (InvalidGitRepositoryError, Exception):
        return {"modified": 0, "staged": 0, "untracked": 0, "conflicts": 0}


def stash_save(repo: Repo, worktree_path: Path, message: str = "") -> str:
    """Create a stash in a worktree.

    Args:
        repo: The main repository (unused — we open the worktree directly).
        worktree_path: Path to the worktree.
        message: Optional stash message.

    Returns:
        Status message.
    """
    try:
        wt_repo = Repo(worktree_path)
        args = ["push", "--include-untracked"]
        if message:
            args.extend(["-m", message])
        result = wt_repo.git.stash(*args)
        if "No local changes" in result:
            return "nothing_to_stash"
        return "stashed"
    except GitCommandError as e:
        raise GitCommandError(
            e.command,
            e.status,
            stderr=(f"Failed to stash changes in {worktree_path}.\n  Original error: {e.stderr}"),
        ) from e


def stash_pop(repo: Repo, worktree_path: Path) -> str:
    """Pop the latest stash in a worktree.

    Args:
        repo: The main repository (unused — we open the worktree directly).
        worktree_path: Path to the worktree.

    Returns:
        Status message.
    """
    try:
        wt_repo = Repo(worktree_path)
        wt_repo.git.stash("pop")
        return "applied"
    except GitCommandError as e:
        stderr = e.stderr.strip() if e.stderr else str(e)
        if "No stash entries" in stderr:
            return "no_stash"
        raise GitCommandError(
            e.command,
            e.status,
            stderr=(
                f"Failed to pop stash in {worktree_path}.\n"
                f"  If there are conflicts, resolve them manually.\n"
                f"  Original error: {stderr}"
            ),
        ) from e


def check_git_version() -> str:
    """Get the installed git version string.

    Returns:
        Git version string (e.g., "2.43.0").
    """
    import subprocess

    try:
        result = subprocess.run(
            ["git", "--version"],
            capture_output=True,
            text=True,
            check=True,
        )
        # "git version 2.43.0" or "git version 2.50.1 (Apple Git-155)"
        parts = result.stdout.strip().split()
        # The version number is always the third token
        return parts[2] if len(parts) >= 3 else parts[-1]
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "not found"


def check_worktree_health(repo: Repo) -> list[dict[str, str]]:
    """Run health checks on all worktrees.

    Args:
        repo: The git repository.

    Returns:
        List of issue dicts with 'worktree', 'issue', 'fix'.
    """
    issues: list[dict[str, str]] = []
    worktrees = list_worktrees(repo)

    for wt in worktrees:
        wt_path = Path(wt["path"])

        # Check if path exists
        if not wt_path.exists():
            issues.append(
                {
                    "worktree": wt.get("branch", wt["path"]),
                    "issue": f"Path does not exist: {wt_path}",
                    "fix": "Run: git worktree prune  (to clean up stale entries)",
                }
            )
            continue

        # Check for detached HEAD
        if wt.get("branch") == "(detached HEAD)":
            issues.append(
                {
                    "worktree": str(wt_path),
                    "issue": "Detached HEAD state",
                    "fix": "Run: git checkout <branch>  (inside the worktree)",
                }
            )

        # Check for locked worktrees
        git_dir = wt_path / ".git"
        if git_dir.is_file():
            try:
                lock_ref = git_dir.read_text().strip()
                if lock_ref.startswith("gitdir:"):
                    lock_path = Path(lock_ref.split("gitdir:", 1)[1].strip())
                    lock_file = lock_path.parent / "locked"
                    if lock_file.exists():
                        issues.append(
                            {
                                "worktree": wt.get("branch", str(wt_path)),
                                "issue": "Worktree is locked",
                                "fix": f"Run: git worktree unlock {wt_path}",
                            }
                        )
            except (OSError, ValueError):
                pass

    # Run git worktree prune --dry-run to find stale entries
    try:
        prune_output = repo.git.worktree("prune", "--dry-run")
        if prune_output.strip():
            issues.append(
                {
                    "worktree": "(stale entries)",
                    "issue": "Stale worktree entries found",
                    "fix": "Run: git worktree prune",
                }
            )
    except GitCommandError:
        pass

    return issues


def _raise_friendly_worktree_error(e: GitCommandError, branch: str, path: Path) -> None:
    """Convert a GitCommandError into a friendly message with fix suggestions."""
    stderr = e.stderr.strip() if e.stderr else str(e)

    if "already checked out" in stderr:
        raise GitCommandError(
            e.command,
            e.status,
            stderr=(
                f"Branch '{branch}' is already checked out in another worktree.\n"
                f"  Fix: Use a different branch name, or remove the other worktree first.\n"
                f"  Run: wt list  (to see all worktrees)"
            ),
        ) from e
    if "already exists" in stderr:
        raise GitCommandError(
            e.command,
            e.status,
            stderr=(
                f"Path '{path}' already exists.\n"
                f"  Fix: Choose a different directory name, or remove the existing path.\n"
                f"  Run: wt cleanup  (to remove stale worktrees)"
            ),
        ) from e
    raise GitCommandError(
        e.command,
        e.status,
        stderr=(
            f"Failed to create worktree for branch '{branch}' at {path}.\n"
            f"  Original error: {stderr}"
        ),
    ) from e
