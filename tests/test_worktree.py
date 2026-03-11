"""Tests for worktree CRUD operations."""

from pathlib import Path

from git import Repo

from worktree_pilot.core.worktree import (
    create_worktree,
    list_all_worktrees,
    pull_all_worktrees,
    remove_worktree,
)


class TestCreateWorktree:
    def test_create_new_branch(self, temp_git_repo: Repo):
        result = create_worktree(temp_git_repo, "feature/new-feature")
        assert result["branch"] == "feature/new-feature"
        assert Path(result["path"]).exists()

    def test_create_existing_branch(self, temp_git_repo_with_branches: Repo):
        repo = temp_git_repo_with_branches
        result = create_worktree(repo, "feature/test-a")
        assert result["branch"] == "feature/test-a"
        assert Path(result["path"]).exists()

    def test_create_with_custom_path(self, temp_git_repo: Repo, tmp_path: Path):
        custom = tmp_path / "custom-worktree"
        result = create_worktree(temp_git_repo, "feature/custom", custom_path=custom)
        assert result["path"] == str(custom)
        assert custom.exists()


class TestListAllWorktrees:
    def test_lists_main(self, temp_git_repo: Repo):
        worktrees = list_all_worktrees(temp_git_repo)
        assert len(worktrees) >= 1
        assert any(wt.get("is_main") == "true" for wt in worktrees)

    def test_includes_status(self, temp_git_repo: Repo):
        worktrees = list_all_worktrees(temp_git_repo)
        for wt in worktrees:
            assert "status" in wt


class TestRemoveWorktree:
    def test_remove(self, temp_git_repo: Repo):
        result = create_worktree(temp_git_repo, "feature/to-remove")
        wt_path = Path(result["path"])

        remove_result = remove_worktree(temp_git_repo, wt_path)
        assert remove_result["removed"] == "true"
        assert not wt_path.exists()

    def test_remove_with_branch_delete(self, temp_git_repo: Repo):
        result = create_worktree(temp_git_repo, "feature/to-remove-branch")
        wt_path = Path(result["path"])

        remove_result = remove_worktree(temp_git_repo, wt_path, delete_branch=True, force=True)
        assert remove_result["removed"] == "true"
        assert remove_result.get("branch_deleted") == "feature/to-remove-branch"


class TestPullAllWorktrees:
    def test_pull_no_remote(self, temp_git_repo: Repo):
        results = pull_all_worktrees(temp_git_repo)
        assert len(results) >= 1
        # No remote configured, so should report that
        assert any("no remote" in r["result"] for r in results)
