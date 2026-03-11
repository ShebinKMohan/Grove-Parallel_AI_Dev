"""Experiment set creation and cleanup.

Experiments are groups of related worktrees prefixed with 'experiment/'
for trying out ideas in parallel. They can be created as a set
and cleaned up together.
"""

from pathlib import Path

from git import GitCommandError, Repo

from worktree_pilot.core import git_ops
from worktree_pilot.core.worktree import create_worktree, remove_worktree


def create_experiment_set(
    repo: Repo,
    experiment_name: str,
    variant_names: list[str],
) -> list[dict[str, str]]:
    """Create a set of experiment worktrees.

    Creates multiple worktrees under experiment/<name>/<variant>.

    Args:
        repo: The git repository.
        experiment_name: Base name for the experiment (e.g., "auth-refactor").
        variant_names: List of variant names (e.g., ["approach-a", "approach-b"]).

    Returns:
        List of creation result dicts with 'path', 'branch', 'description'.

    Raises:
        GitCommandError: If any worktree creation fails.
    """
    results: list[dict[str, str]] = []

    for variant in variant_names:
        branch_name = f"experiment/{experiment_name}/{variant}"
        try:
            result = create_worktree(repo, branch_name)
            results.append(result)
        except GitCommandError as e:
            results.append(
                {
                    "path": "",
                    "branch": branch_name,
                    "description": f"Failed: {e.stderr if e.stderr else str(e)}",
                    "error": "true",
                }
            )

    return results


def list_experiments(repo: Repo) -> dict[str, list[dict[str, str]]]:
    """List all experiment sets grouped by experiment name.

    Args:
        repo: The git repository.

    Returns:
        Dict mapping experiment names to lists of worktree info dicts.
    """
    worktrees = git_ops.list_worktrees(repo)
    experiments: dict[str, list[dict[str, str]]] = {}

    for wt in worktrees:
        branch = wt.get("branch", "")
        if branch.startswith("experiment/"):
            parts = branch.split("/", 2)
            if len(parts) >= 3 or len(parts) == 2:
                exp_name = parts[1]
                experiments.setdefault(exp_name, []).append(wt)

    return experiments


def cleanup_experiment(
    repo: Repo,
    experiment_name: str,
    delete_branches: bool = True,
    force: bool = False,
) -> list[dict[str, str]]:
    """Remove all worktrees belonging to an experiment set.

    Args:
        repo: The git repository.
        experiment_name: Name of the experiment to clean up.
        delete_branches: If True, also delete associated branches.
        force: If True, force removal even with uncommitted changes.

    Returns:
        List of cleanup result dicts.
    """
    experiments = list_experiments(repo)
    worktrees = experiments.get(experiment_name, [])

    if not worktrees:
        return [
            {
                "path": "",
                "branch": f"experiment/{experiment_name}/*",
                "status": "not_found",
                "details": f"No worktrees found for experiment '{experiment_name}'.",
            }
        ]

    results: list[dict[str, str]] = []
    for wt in worktrees:
        wt_path = Path(wt["path"])
        try:
            result = remove_worktree(
                repo,
                wt_path,
                delete_branch=delete_branches,
                force=force,
            )
            results.append(result)
        except GitCommandError as e:
            results.append(
                {
                    "path": str(wt_path),
                    "removed": "false",
                    "error": e.stderr if e.stderr else str(e),
                }
            )

    return results


def get_experiment_names(repo: Repo) -> list[str]:
    """Get names of all active experiments.

    Args:
        repo: The git repository.

    Returns:
        Sorted list of experiment names.
    """
    return sorted(list_experiments(repo).keys())
