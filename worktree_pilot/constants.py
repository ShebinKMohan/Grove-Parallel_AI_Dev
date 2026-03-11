"""Branch prefixes, defaults, and shared constants."""

BRANCH_PREFIXES: list[str] = [
    "feature/",
    "experiment/",
    "fix/",
    "hotfix/",
    "refactor/",
    "chore/",
    "docs/",
    "test/",
    "release/",
    "integration/",
    "spike/",
    "perf/",
    "ci/",
    "style/",
]

DEFAULT_WORKTREE_DIR_PREFIX = ".worktrees"

CONFIG_FILENAME = ".worktreepilot.toml"

PROTECTED_BRANCHES = {"main", "master", "develop", "production"}
