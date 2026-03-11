"""Tests for branch naming, validation, and strategy resolution."""

from git import Repo

from worktree_pilot.core.branch import (
    compute_worktree_path,
    resolve_branch_strategy,
    suggest_branch_name,
    validate_branch_name,
)


class TestValidateBranchName:
    def test_valid_simple(self):
        assert validate_branch_name("feature/my-branch") is None

    def test_valid_nested(self):
        assert validate_branch_name("feature/scope/my-branch") is None

    def test_empty(self):
        assert validate_branch_name("") is not None

    def test_starts_with_slash(self):
        assert validate_branch_name("/bad") is not None

    def test_ends_with_slash(self):
        assert validate_branch_name("bad/") is not None

    def test_double_dot(self):
        assert validate_branch_name("feature/my..branch") is not None

    def test_ends_with_lock(self):
        assert validate_branch_name("feature/my.lock") is not None

    def test_spaces(self):
        assert validate_branch_name("feature/my branch") is not None

    def test_special_chars(self):
        for char in "~^:?*":
            assert validate_branch_name(f"feature/my{char}branch") is not None


class TestSuggestBranchName:
    def test_simple(self):
        assert suggest_branch_name("add user auth") == "feature/add-user-auth"

    def test_with_prefix(self):
        assert suggest_branch_name("fix login bug", "fix/") == "fix/fix-login-bug"

    def test_strips_special_chars(self):
        result = suggest_branch_name("add @user auth!")
        assert result == "feature/add-user-auth"

    def test_collapses_spaces(self):
        result = suggest_branch_name("add   user   auth")
        assert result == "feature/add-user-auth"


class TestResolveBranchStrategy:
    def test_existing_local_branch(self, temp_git_repo: Repo):
        repo = temp_git_repo
        repo.create_head("feature/existing")

        strategy = resolve_branch_strategy(repo, "feature/existing")
        assert strategy["new_branch"] is False
        assert strategy["branch"] == "feature/existing"

    def test_new_branch(self, temp_git_repo: Repo):
        strategy = resolve_branch_strategy(temp_git_repo, "feature/brand-new")
        assert strategy["new_branch"] is True
        assert strategy["start_point"] == "HEAD"
        assert strategy["branch"] == "feature/brand-new"


class TestComputeWorktreePath:
    def test_path_is_absolute(self, temp_git_repo: Repo):
        path = compute_worktree_path(temp_git_repo, "feature/test")
        assert path.is_absolute()

    def test_slug_replaces_slashes(self, temp_git_repo: Repo):
        path = compute_worktree_path(temp_git_repo, "feature/my-branch")
        assert "feature-my-branch" in path.name
