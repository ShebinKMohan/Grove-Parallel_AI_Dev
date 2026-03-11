"""Per-project .worktreepilot.toml configuration."""

import tomllib
from pathlib import Path
from typing import Any

from worktree_pilot.constants import CONFIG_FILENAME


def find_config(start_path: Path | None = None) -> Path | None:
    """Find the nearest .worktreepilot.toml walking up from start_path.

    Args:
        start_path: Starting directory. Defaults to cwd.

    Returns:
        Path to config file, or None if not found.
    """
    path = (start_path or Path.cwd()).resolve()
    while path != path.parent:
        config_path = path / CONFIG_FILENAME
        if config_path.exists():
            return config_path
        path = path.parent
    return None


def load_config(config_path: Path | None = None) -> dict[str, Any]:
    """Load configuration from .worktreepilot.toml.

    Args:
        config_path: Explicit path, or auto-discover if None.

    Returns:
        Config dict (empty if no config file found).
    """
    path = config_path or find_config()
    if path is None or not path.exists():
        return {}
    with open(path, "rb") as f:
        return tomllib.load(f)


def get_config_value(key: str, default: Any = None) -> Any:
    """Get a single config value by dotted key.

    Args:
        key: Dotted key like "worktree.default_prefix".
        default: Default value if key not found.

    Returns:
        The config value or default.
    """
    config = load_config()
    parts = key.split(".")
    current: Any = config
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return default
    return current
