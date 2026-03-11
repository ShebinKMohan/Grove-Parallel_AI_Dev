"""Shared fixtures — temp git repos for testing."""

import os
from pathlib import Path

import pytest
from git import Repo


@pytest.fixture
def temp_git_repo(tmp_path: Path) -> Repo:
    """Create a temporary git repository with an initial commit.

    Returns:
        A GitPython Repo object in the temp directory.
    """
    repo = Repo.init(tmp_path)
    # Configure git user for commits
    repo.config_writer().set_value("user", "name", "Test User").release()
    repo.config_writer().set_value("user", "email", "test@example.com").release()

    # Create initial commit (required for worktree operations)
    readme = tmp_path / "README.md"
    readme.write_text("# Test Repo\n")
    repo.index.add(["README.md"])
    repo.index.commit("Initial commit")

    return repo


@pytest.fixture
def temp_git_repo_with_branches(temp_git_repo: Repo) -> Repo:
    """Create a temp repo with multiple branches.

    Creates: main (default), feature/test-a, feature/test-b
    """
    repo = temp_git_repo

    # Create feature branches
    repo.create_head("feature/test-a")
    repo.create_head("feature/test-b")

    return repo


@pytest.fixture
def original_cwd():
    """Save and restore cwd around tests that change it."""
    cwd = Path.cwd()
    yield cwd
    os.chdir(cwd)
