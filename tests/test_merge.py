"""Tests for merge and conflict resolution logic."""

from pathlib import Path

import pytest
from git import GitCommandError, Repo

from worktree_pilot.core.merge import (
    abort_merge,
    get_merge_candidates,
    merge_branch,
)


class TestMergeBranch:
    def test_merge_simple(self, temp_git_repo: Repo):
        repo = temp_git_repo
        # Create a feature branch with a commit
        repo.create_head("feature/to-merge")
        repo.heads["feature/to-merge"].checkout()
        test_file = Path(repo.working_dir) / "feature.txt"
        test_file.write_text("feature content\n")
        repo.index.add(["feature.txt"])
        repo.index.commit("Add feature file")

        # Go back to main
        main_branch = [b.name for b in repo.branches if b.name in ("main", "master")][0]
        repo.heads[main_branch].checkout()

        result = merge_branch(repo, "feature/to-merge", main_branch)
        assert result["status"] == "merged"
        assert result["source"] == "feature/to-merge"

    def test_merge_already_merged(self, temp_git_repo: Repo):
        repo = temp_git_repo
        main_branch = [b.name for b in repo.branches if b.name in ("main", "master")][0]
        # Create branch from same point (no divergence)
        repo.create_head("feature/already-merged")

        result = merge_branch(repo, "feature/already-merged", main_branch)
        assert result["status"] == "already_merged"

    def test_merge_nonexistent_source(self, temp_git_repo: Repo):
        with pytest.raises(GitCommandError):
            merge_branch(temp_git_repo, "feature/nonexistent", "main")

    def test_merge_with_conflict(self, temp_git_repo: Repo):
        repo = temp_git_repo
        main_branch = [b.name for b in repo.branches if b.name in ("main", "master")][0]

        # Modify README on a feature branch
        repo.create_head("feature/conflict")
        repo.heads["feature/conflict"].checkout()
        readme = Path(repo.working_dir) / "README.md"
        readme.write_text("# Feature version\n")
        repo.index.add(["README.md"])
        repo.index.commit("Feature change to README")

        # Modify README on main too
        repo.heads[main_branch].checkout()
        readme.write_text("# Main version\n")
        repo.index.add(["README.md"])
        repo.index.commit("Main change to README")

        result = merge_branch(repo, "feature/conflict", main_branch)
        assert result["status"] == "conflict"
        assert "README.md" in result.get("conflict_files", "")

        # Clean up the conflict state
        repo.git.merge("--abort")


class TestGetMergeCandidates:
    def test_returns_unmerged(self, temp_git_repo: Repo):
        repo = temp_git_repo
        main_branch = [b.name for b in repo.branches if b.name in ("main", "master")][0]

        # Create a branch with a new commit
        repo.create_head("feature/unmerged")
        repo.heads["feature/unmerged"].checkout()
        f = Path(repo.working_dir) / "new.txt"
        f.write_text("new\n")
        repo.index.add(["new.txt"])
        repo.index.commit("New file")
        repo.heads[main_branch].checkout()

        candidates = get_merge_candidates(repo, main_branch)
        assert "feature/unmerged" in candidates

    def test_empty_when_all_merged(self, temp_git_repo: Repo):
        repo = temp_git_repo
        main_branch = [b.name for b in repo.branches if b.name in ("main", "master")][0]
        # No divergent branches
        candidates = get_merge_candidates(repo, main_branch)
        assert candidates == []


class TestAbortMerge:
    def test_abort_no_merge_in_progress(self, temp_git_repo: Repo):
        with pytest.raises(GitCommandError):
            abort_merge(temp_git_repo)
