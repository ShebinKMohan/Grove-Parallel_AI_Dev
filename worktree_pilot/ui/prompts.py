"""InquirerPy interactive prompts for all user interactions."""

from pathlib import Path

from InquirerPy import inquirer
from InquirerPy.validator import EmptyInputValidator

from worktree_pilot.core.branch import (
    get_prefix_choices,
    suggest_branch_name,
    validate_branch_name,
)


def prompt_branch_prefix() -> str:
    """Prompt user to select a branch prefix via arrow keys.

    Returns:
        Selected prefix string (e.g., "feature/").
    """
    choices = get_prefix_choices()
    return inquirer.select(
        message="Select branch type:",
        choices=choices,
        default=choices[0]["value"],
    ).execute()


def prompt_branch_name(prefix: str) -> str:
    """Prompt user for a branch name with validation.

    Args:
        prefix: The branch prefix already selected.

    Returns:
        Full branch name (prefix + user input).
    """
    description = inquirer.text(
        message=f"Branch name ({prefix}):",
        validate=EmptyInputValidator("Branch name cannot be empty."),
    ).execute()

    suggested = suggest_branch_name(description, prefix)

    use_suggested = inquirer.confirm(
        message=f"Use '{suggested}'?",
        default=True,
    ).execute()

    if use_suggested:
        return suggested

    custom = inquirer.text(
        message="Enter custom branch name:",
        default=suggested,
        validate=lambda val: validate_branch_name(val) is None,
        invalid_message="Invalid branch name.",
    ).execute()
    return custom


def prompt_worktree_selection(
    worktrees: list[dict[str, str]], message: str = "Select worktree:"
) -> dict[str, str]:
    """Prompt user to select a worktree from a list.

    Args:
        worktrees: List of worktree info dicts.
        message: Prompt message.

    Returns:
        The selected worktree dict.
    """
    choices = [
        {
            "name": f"{wt.get('branch', 'unknown')}  ({wt.get('path', '')})",
            "value": wt,
        }
        for wt in worktrees
        if wt.get("is_main") != "true"
    ]

    if not choices:
        return {}

    return inquirer.select(
        message=message,
        choices=choices,
    ).execute()


def prompt_worktree_multi_selection(
    worktrees: list[dict[str, str]], message: str = "Select worktrees to remove:"
) -> list[dict[str, str]]:
    """Prompt user to select multiple worktrees.

    Args:
        worktrees: List of worktree info dicts.
        message: Prompt message.

    Returns:
        List of selected worktree dicts.
    """
    choices = [
        {
            "name": f"{wt.get('branch', 'unknown')}  ({wt.get('path', '')})",
            "value": wt,
        }
        for wt in worktrees
        if wt.get("is_main") != "true"
    ]

    if not choices:
        return []

    return inquirer.checkbox(
        message=message,
        choices=choices,
    ).execute()


def prompt_confirm(message: str, default: bool = False) -> bool:
    """Prompt user for yes/no confirmation.

    Args:
        message: The question to ask.
        default: Default value.

    Returns:
        True if confirmed, False otherwise.
    """
    return inquirer.confirm(message=message, default=default).execute()


def prompt_merge_source(branches: list[str]) -> str:
    """Prompt user to select a branch to merge from.

    Args:
        branches: List of branch names to choose from.

    Returns:
        Selected branch name.
    """
    return inquirer.select(
        message="Select branch to merge:",
        choices=branches,
    ).execute()


def prompt_merge_target(branches: list[str], default: str = "main") -> str:
    """Prompt user to select a target branch to merge into.

    Args:
        branches: List of branch names.
        default: Default target branch.

    Returns:
        Selected target branch name.
    """
    return inquirer.select(
        message="Merge into:",
        choices=branches,
        default=default if default in branches else branches[0],
    ).execute()


def prompt_experiment_name() -> str:
    """Prompt user for an experiment name.

    Returns:
        Experiment name string.
    """
    return inquirer.text(
        message="Experiment name (e.g., auth-refactor):",
        validate=EmptyInputValidator("Experiment name cannot be empty."),
    ).execute()


def prompt_variant_names() -> list[str]:
    """Prompt user for experiment variant names.

    Returns:
        List of variant name strings.
    """
    text = inquirer.text(
        message="Variant names (comma-separated, e.g., approach-a, approach-b):",
        validate=EmptyInputValidator("At least one variant is required."),
    ).execute()
    return [v.strip() for v in text.split(",") if v.strip()]


def prompt_experiment_selection(experiment_names: list[str]) -> str:
    """Prompt user to select an experiment.

    Args:
        experiment_names: List of experiment names.

    Returns:
        Selected experiment name.
    """
    return inquirer.select(
        message="Select experiment:",
        choices=experiment_names,
    ).execute()


def prompt_custom_path(default_path: Path) -> Path:
    """Prompt user for a custom worktree path.

    Args:
        default_path: The auto-computed default path.

    Returns:
        The chosen path.
    """
    use_default = inquirer.confirm(
        message=f"Use default path '{default_path}'?",
        default=True,
    ).execute()

    if use_default:
        return default_path

    custom = inquirer.filepath(
        message="Enter worktree path:",
        default=str(default_path),
    ).execute()
    return Path(custom).resolve()
