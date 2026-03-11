"""Typer app with all command definitions."""

from pathlib import Path

import typer
from git import GitCommandError, InvalidGitRepositoryError, Repo

from worktree_pilot.core import git_ops
from worktree_pilot.core.experiment import (
    cleanup_experiment,
    create_experiment_set,
    list_experiments,
)
from worktree_pilot.core.merge import abort_merge, get_merge_candidates, merge_branch
from worktree_pilot.core.worktree import (
    create_worktree,
    list_all_worktrees,
    pull_all_worktrees,
    remove_worktree,
)
from worktree_pilot.ui.display import (
    print_cleanup_result,
    print_doctor_report,
    print_error,
    print_experiment_list,
    print_experiment_set,
    print_info,
    print_merge_result,
    print_pull_results,
    print_stash_move_result,
    print_status_dashboard,
    print_success,
    print_warning,
    print_worktree_created,
    print_worktree_table,
)
from worktree_pilot.ui.prompts import (
    prompt_branch_name,
    prompt_branch_prefix,
    prompt_confirm,
    prompt_experiment_name,
    prompt_merge_source,
    prompt_merge_target,
    prompt_variant_names,
    prompt_worktree_multi_selection,
    prompt_worktree_selection,
)
from worktree_pilot.utils.gitignore import ensure_gitignored

app = typer.Typer(
    name="wt",
    help="WorkTree Pilot — Git Worktree Manager for Claude Code Developers",
    no_args_is_help=True,
)


def _get_repo() -> "Repo":
    """Get the git repo or exit with a friendly error."""
    try:
        return git_ops.find_repo()
    except InvalidGitRepositoryError as e:
        print_error(str(e))
        raise typer.Exit(1) from None


@app.command()
def create() -> None:
    """Interactive worktree creation with branch selection."""
    repo = _get_repo()

    prefix = prompt_branch_prefix()
    branch_name = prompt_branch_name(prefix)

    print_info(f"Creating worktree for branch '{branch_name}'...")

    try:
        result = create_worktree(repo, branch_name)
        print_worktree_created(result)

        # Auto-add to .gitignore
        repo_root = git_ops.get_repo_root(repo)
        wt_path = Path(result["path"])
        if ensure_gitignored(repo_root, wt_path):
            print_info("Added worktree path to .gitignore")

        # Offer to launch claude in the new worktree
        if prompt_confirm("Launch Claude Code in the new worktree?"):
            print_info(f"Run: cd {result['path']} && claude")

    except GitCommandError as e:
        print_error(e.stderr if e.stderr else str(e))
        raise typer.Exit(1) from None


@app.command(name="list")
def list_cmd() -> None:
    """Pretty table of all worktrees."""
    repo = _get_repo()
    worktrees = list_all_worktrees(repo)

    if not worktrees:
        print_info("No worktrees found.")
        return

    print_worktree_table(worktrees)


@app.command()
def pull() -> None:
    """Pull latest changes in all worktrees."""
    repo = _get_repo()

    print_info("Pulling all worktrees...")
    results = pull_all_worktrees(repo)
    print_pull_results(results)


@app.command()
def cleanup() -> None:
    """Interactive cleanup wizard — remove worktrees and optionally their branches."""
    repo = _get_repo()
    worktrees = list_all_worktrees(repo)

    # Filter out main worktree
    removable = [wt for wt in worktrees if wt.get("is_main") != "true"]

    if not removable:
        print_info("No worktrees to clean up (only the main worktree exists).")
        return

    selected = prompt_worktree_multi_selection(worktrees)
    if not selected:
        print_info("No worktrees selected.")
        return

    delete_branches = prompt_confirm("Also delete the associated branches?", default=False)
    force = False

    # Check for dirty worktrees
    dirty = [wt for wt in selected if wt.get("status") not in ("clean", "missing")]
    if dirty:
        print_warning(f"{len(dirty)} worktree(s) have uncommitted changes.")
        force = prompt_confirm("Force remove them anyway?", default=False)
        if not force:
            selected = [wt for wt in selected if wt not in dirty]
            if not selected:
                print_info("No clean worktrees left to remove.")
                return

    for wt in selected:
        try:
            result = remove_worktree(
                repo,
                Path(wt["path"]),
                delete_branch=delete_branches,
                force=force,
            )
            print_cleanup_result(result)
        except GitCommandError as e:
            print_error(f"Failed to remove {wt.get('branch', 'unknown')}: {e.stderr}")

    print_success(f"Cleaned up {len(selected)} worktree(s).")


@app.command()
def status() -> None:
    """Overview dashboard of all worktrees and their status."""
    repo = _get_repo()
    worktrees = list_all_worktrees(repo)
    current_branch = git_ops.get_current_branch(repo)
    print_status_dashboard(worktrees, current_branch)


@app.command()
def merge(
    abort: bool = typer.Option(False, "--abort", help="Abort an in-progress merge."),
) -> None:
    """Interactive merge — select source and target branches."""
    repo = _get_repo()

    if abort:
        try:
            result = abort_merge(repo)
            print_merge_result(result)
        except GitCommandError as e:
            print_error(e.stderr if e.stderr else str(e))
            raise typer.Exit(1) from None
        return

    # Get local branches for selection
    local_branches = git_ops.list_local_branches(repo)
    if len(local_branches) < 2:
        print_info("Need at least 2 branches to merge. Create more worktrees first.")
        return

    # Show unmerged candidates first
    candidates = get_merge_candidates(repo)
    if not candidates:
        print_info("All branches are already merged into the default branch.")
        return

    source = prompt_merge_source(candidates)
    target = prompt_merge_target(
        [b for b in local_branches if b != source],
    )

    if not prompt_confirm(f"Merge '{source}' into '{target}'?"):
        print_info("Merge cancelled.")
        return

    try:
        result = merge_branch(repo, source, target)
        print_merge_result(result)
    except GitCommandError as e:
        print_error(e.stderr if e.stderr else str(e))
        raise typer.Exit(1) from None


@app.command()
def experiment(
    list_all: bool = typer.Option(False, "--list", "-l", help="List all experiment sets."),
    clean: str = typer.Option("", "--clean", "-c", help="Clean up an experiment by name."),
) -> None:
    """Create or manage experiment sets — parallel worktrees for trying ideas."""
    repo = _get_repo()

    if list_all:
        experiments = list_experiments(repo)
        print_experiment_list(experiments)
        return

    if clean:
        force = prompt_confirm(f"Remove all worktrees for experiment '{clean}'?")
        if not force:
            print_info("Cleanup cancelled.")
            return
        results = cleanup_experiment(repo, clean, delete_branches=True, force=True)
        for r in results:
            if r.get("removed") == "true":
                print_cleanup_result(r)
            elif r.get("status") == "not_found":
                print_warning(r["details"])
            else:
                print_error(f"Failed: {r.get('error', 'unknown error')}")
        return

    # Interactive creation
    exp_name = prompt_experiment_name()
    variants = prompt_variant_names()

    if not variants:
        print_info("No variants specified.")
        return

    print_info(f"Creating experiment '{exp_name}' with {len(variants)} variant(s)...")

    results = create_experiment_set(repo, exp_name, variants)
    print_experiment_set(results)

    # Auto-gitignore each created worktree
    repo_root = git_ops.get_repo_root(repo)
    for r in results:
        if r.get("path") and not r.get("error"):
            wt_path = Path(r["path"])
            ensure_gitignored(repo_root, wt_path)


@app.command(name="stash-move")
def stash_move() -> None:
    """Move uncommitted changes from one worktree to another via stash."""
    repo = _get_repo()
    worktrees = list_all_worktrees(repo)

    # Need at least 2 worktrees
    if len(worktrees) < 2:
        print_info("Need at least 2 worktrees for stash-move.")
        return

    print_info("Select the source worktree (changes will be stashed from here):")
    source_wt = prompt_worktree_selection(worktrees, "Stash FROM:")
    if not source_wt:
        print_info("No source selected.")
        return

    remaining = [wt for wt in worktrees if wt.get("path") != source_wt.get("path")]
    print_info("Select the target worktree (stash will be applied here):")
    target_wt = prompt_worktree_selection(remaining, "Apply TO:")
    if not target_wt:
        print_info("No target selected.")
        return

    source_path = Path(source_wt["path"])
    target_path = Path(target_wt["path"])
    source_branch = source_wt.get("branch", "unknown")
    target_branch = target_wt.get("branch", "unknown")

    # Stash from source
    try:
        stash_result = git_ops.stash_save(
            repo, source_path, message=f"wt stash-move to {target_branch}"
        )
    except GitCommandError as e:
        print_error(e.stderr if e.stderr else str(e))
        raise typer.Exit(1) from None

    if stash_result == "nothing_to_stash":
        print_stash_move_result(source_branch, target_branch, "nothing_to_stash")
        return

    # Pop stash in target
    try:
        pop_result = git_ops.stash_pop(repo, target_path)
    except GitCommandError as e:
        print_error(e.stderr if e.stderr else str(e))
        print_warning(
            f"Stash is still saved in {source_branch}. "
            f"Recover with: cd {source_path} && git stash pop"
        )
        raise typer.Exit(1) from None

    if pop_result == "applied":
        print_stash_move_result(source_branch, target_branch, "success")
    else:
        print_stash_move_result(source_branch, target_branch, pop_result)


@app.command()
def doctor() -> None:
    """Health check for git worktrees — detect and suggest fixes for issues."""
    repo = _get_repo()

    git_version = git_ops.check_git_version()
    worktrees = git_ops.list_worktrees(repo)
    issues = git_ops.check_worktree_health(repo)

    print_doctor_report(git_version, issues, len(worktrees))
