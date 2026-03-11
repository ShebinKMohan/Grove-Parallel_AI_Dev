"""Theme constants for consistent styling."""

from rich.theme import Theme

# Color palette
SUCCESS = "green"
ERROR = "red bold"
WARNING = "yellow"
INFO = "cyan"
DIM = "dim"
ACCENT = "magenta"
BRANCH = "cyan bold"
PATH = "blue underline"

WT_THEME = Theme(
    {
        "success": SUCCESS,
        "error": ERROR,
        "warning": WARNING,
        "info": INFO,
        "dim": DIM,
        "accent": ACCENT,
        "branch": BRANCH,
        "path": PATH,
    }
)
