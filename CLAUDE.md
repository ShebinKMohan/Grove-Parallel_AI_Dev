# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WorkTree Pilot is an interactive CLI tool (`wt`) that simplifies parallel development with Git Worktrees for Claude Code developers. It replaces 10+ git commands with single interactive prompts. Python 3.11+, packaged via pyproject.toml with entry point `wt`.

## Development Commands

```bash
pip install -e ".[dev]"          # Install in dev mode with dev dependencies
pytest                           # Run all tests
pytest tests/test_cli.py         # Run a single test file
pytest -k "test_create"          # Run tests matching a name pattern
pytest --cov=worktree_pilot      # Run tests with coverage
ruff check .                     # Lint
ruff format .                    # Format
python -m worktree_pilot         # Run CLI directly (via __main__.py)
```

## Architecture

- **`cli.py`** — Typer app with all command definitions. Commands: `create`, `list`, `pull`, `cleanup`, `experiment`, `merge`, `stash-move`, `status`, `doctor`
- **`core/`** — Business logic layer. All git operations go through `git_ops.py` (GitPython wrappers) — never call git directly elsewhere. `worktree.py` (CRUD), `branch.py` (naming/validation), `merge.py` (merge + conflict resolution), `experiment.py` (experiment sets)
- **`ui/`** — Presentation layer. `prompts.py` (InquirerPy interactive prompts), `display.py` (Rich tables/panels — all user-facing output goes here, no raw `print()`), `colors.py` (theme)
- **`utils/`** — `config.py` (.worktreepilot.toml), `gitignore.py`, `validators.py`
- **`constants.py`** — Branch prefixes: `feature/`, `experiment/`, `fix/`, `hotfix/`, `refactor/`, `chore/`, `docs/`, `test/`, `release/`, `integration/`, `spike/`, `perf/`, `ci/`, `style/`

## Key Libraries

- **Typer** + **Rich** for CLI and styled output
- **GitPython** for git operations (`repo.git.worktree()` maps to `git worktree` subcommands)
- **InquirerPy** for arrow-key selection, multi-select, fuzzy search prompts

## Critical Conventions

- Type hints on all function signatures; Google-style docstrings on public functions
- No bare `except` — always catch specific exceptions
- Git errors must be caught and shown as friendly messages **with fix suggestions**
- Use `pathlib.Path`, not `os.path`
- Every command must auto-detect repo root and work from any subdirectory
- Always resolve to absolute paths to avoid `../` vs `./` confusion
- Tests use real temp git repos in fixtures (conftest.py), not mocks for git state

## Branch `-b` Flag Logic (core/branch.py)

This is the most error-prone area. The decision tree:
- Branch exists locally → no `-b`, use branch name directly
- Branch exists on remote only → `-b` with `origin/branch` as start point
- Brand new branch → `-b` with `HEAD` or specified source
- **Never** pass bare `origin/branch` without `-b` (causes detached HEAD)

## Design Principles

- **Interactive-first:** Arrow-key selection everywhere, no flags to memorize
- **Safe defaults:** Confirm destructive actions, auto-add worktrees to .gitignore
- **Error recovery:** Every error message includes the fix command
- **Claude Code aware:** `wt create` offers to launch `claude` in the new worktree
