"""Rich tables, panels, and status output.

All user-facing output goes through this module — no raw print() elsewhere.
"""

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from worktree_pilot.ui.colors import WT_THEME

console = Console(theme=WT_THEME)


def print_success(message: str) -> None:
    """Print a success message."""
    console.print(f"[success]✓[/success] {message}")


def print_error(message: str) -> None:
    """Print an error message."""
    console.print(f"[error]✗[/error] {message}")


def print_warning(message: str) -> None:
    """Print a warning message."""
    console.print(f"[warning]![/warning] {message}")


def print_info(message: str) -> None:
    """Print an info message."""
    console.print(f"[info]ℹ[/info] {message}")


def print_worktree_created(result: dict[str, str]) -> None:
    """Display worktree creation result."""
    panel = Panel(
        f"[branch]{result['branch']}[/branch]\n"
        f"[path]{result['path']}[/path]\n"
        f"[dim]{result['description']}[/dim]",
        title="[success]Worktree Created[/success]",
        border_style="green",
    )
    console.print(panel)


def print_worktree_table(worktrees: list[dict[str, str]]) -> None:
    """Display a pretty table of all worktrees."""
    table = Table(title="Git Worktrees", border_style="cyan")
    table.add_column("Branch", style="branch")
    table.add_column("Path", style="path")
    table.add_column("Commit", style="dim")
    table.add_column("Status")
    table.add_column("", style="dim")  # Main indicator

    for wt in worktrees:
        status = wt.get("status", "")
        status_style = "success" if status == "clean" else "warning"
        main_marker = "★ main" if wt.get("is_main") == "true" else ""

        table.add_row(
            wt.get("branch", "unknown"),
            wt.get("path", ""),
            wt.get("commit", ""),
            f"[{status_style}]{status}[/{status_style}]",
            main_marker,
        )

    console.print(table)


def print_pull_results(results: list[dict[str, str]]) -> None:
    """Display pull results for all worktrees."""
    table = Table(title="Pull Results", border_style="cyan")
    table.add_column("Branch", style="branch")
    table.add_column("Result")

    for r in results:
        result = r["result"]
        if result == "already up to date":
            style = "dim"
        elif result == "updated":
            style = "success"
        else:
            style = "warning"
        table.add_row(r["branch"], f"[{style}]{result}[/{style}]")

    console.print(table)


def print_cleanup_result(result: dict[str, str]) -> None:
    """Display cleanup result for a single worktree."""
    msg = f"Removed worktree at [path]{result['path']}[/path]"
    if result.get("branch_deleted") and result["branch_deleted"] != "failed":
        msg += f" and branch [branch]{result['branch_deleted']}[/branch]"
    elif result.get("branch_deleted") == "failed":
        msg += " [warning](branch deletion failed)[/warning]"
    print_success(msg)


def print_merge_result(result: dict[str, str]) -> None:
    """Display merge operation result."""
    status = result["status"]
    if status == "merged":
        print_success(result["details"])
    elif status == "already_merged":
        print_info(result["details"])
    elif status == "conflict":
        print_warning(result["details"])
        if result.get("conflict_files"):
            console.print("[warning]Conflicting files:[/warning]")
            for f in result["conflict_files"].splitlines():
                console.print(f"  [error]•[/error] {f}")
            console.print(
                "\n[info]Fix:[/info] Resolve conflicts, then run "
                "'git add <files>' and 'git commit'.\n"
                "[info]Or:[/info]  Run 'wt merge --abort' to cancel."
            )
    elif status == "aborted":
        print_info(result["details"])


def print_experiment_set(results: list[dict[str, str]]) -> None:
    """Display experiment set creation results."""
    table = Table(title="Experiment Set", border_style="magenta")
    table.add_column("Branch", style="branch")
    table.add_column("Path", style="path")
    table.add_column("Status")

    for r in results:
        if r.get("error"):
            table.add_row(r["branch"], "", f"[error]✗ {r['description']}[/error]")
        else:
            table.add_row(r["branch"], r["path"], "[success]✓ created[/success]")

    console.print(table)


def print_experiment_list(experiments: dict[str, list[dict[str, str]]]) -> None:
    """Display grouped experiment sets."""
    if not experiments:
        print_info("No active experiments.")
        return

    for name, worktrees in experiments.items():
        table = Table(title=f"Experiment: {name}", border_style="magenta")
        table.add_column("Variant", style="branch")
        table.add_column("Path", style="path")
        table.add_column("Commit", style="dim")

        for wt in worktrees:
            branch = wt.get("branch", "")
            # Extract variant name from experiment/name/variant
            parts = branch.split("/", 2)
            variant = parts[2] if len(parts) >= 3 else parts[-1]
            table.add_row(variant, wt.get("path", ""), wt.get("commit", ""))

        console.print(table)
        console.print()


def print_stash_move_result(source: str, target: str, status: str) -> None:
    """Display stash-move operation result."""
    if status == "success":
        print_success(f"Stash moved from [branch]{source}[/branch] to [branch]{target}[/branch]")
    elif status == "nothing_to_stash":
        print_info(f"No changes to stash in [branch]{source}[/branch]")
    else:
        print_error(f"Failed to move stash: {status}")


def print_doctor_report(
    git_version: str,
    issues: list[dict[str, str]],
    worktree_count: int,
) -> None:
    """Display doctor health check report."""
    header = f"[info]Git version:[/info] {git_version}\n[info]Worktrees:[/info]   {worktree_count}"
    console.print(Panel(header, title="Doctor Report", border_style="cyan"))

    if not issues:
        print_success("All worktrees are healthy!")
        return

    table = Table(title=f"Issues Found ({len(issues)})", border_style="yellow")
    table.add_column("Worktree", style="branch")
    table.add_column("Issue", style="warning")
    table.add_column("Fix", style="info")

    for issue in issues:
        table.add_row(issue["worktree"], issue["issue"], issue["fix"])

    console.print(table)


def print_status_dashboard(worktrees: list[dict[str, str]], current_branch: str) -> None:
    """Display an overview status dashboard."""
    total = len(worktrees)
    clean = sum(1 for wt in worktrees if wt.get("status") == "clean")
    dirty = total - clean

    header = (
        f"[info]Current branch:[/info] [branch]{current_branch}[/branch]\n"
        f"[info]Worktrees:[/info] {total} total, "
        f"[success]{clean} clean[/success], "
        f"[warning]{dirty} with changes[/warning]"
    )
    console.print(Panel(header, title="WorkTree Pilot Status", border_style="cyan"))
    print_worktree_table(worktrees)
