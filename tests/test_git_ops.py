"""Tests for git operations."""

from pathlib import Path

from git import Repo

from worktree_pilot.core import git_ops


class TestFindRepo:
    def test_finds_repo(self, temp_git_repo: Repo, original_cwd):
        import os

        os.chdir(temp_git_repo.working_dir)
        repo = git_ops.find_repo()
        assert repo.working_dir == temp_git_repo.working_dir

    def test_finds_repo_from_subdirectory(self, temp_git_repo: Repo, original_cwd):
        import os

        subdir = Path(temp_git_repo.working_dir) / "subdir"
        subdir.mkdir()
        os.chdir(subdir)
        repo = git_ops.find_repo()
        assert repo.working_dir == temp_git_repo.working_dir


class TestBranchOperations:
    def test_list_local_branches(self, temp_git_repo: Repo):
        branches = git_ops.list_local_branches(temp_git_repo)
        # Should have at least the default branch
        assert len(branches) >= 1

    def test_branch_exists_locally(self, temp_git_repo_with_branches: Repo):
        repo = temp_git_repo_with_branches
        assert git_ops.branch_exists_locally(repo, "feature/test-a") is True
        assert git_ops.branch_exists_locally(repo, "feature/nonexistent") is False

    def test_get_current_branch(self, temp_git_repo: Repo):
        branch = git_ops.get_current_branch(temp_git_repo)
        assert isinstance(branch, str)
        assert len(branch) > 0


class TestWorktreeOperations:
    def test_list_worktrees(self, temp_git_repo: Repo):
        worktrees = git_ops.list_worktrees(temp_git_repo)
        assert len(worktrees) >= 1
        assert worktrees[0]["is_main"] == "true"

    def test_add_and_remove_worktree(self, temp_git_repo: Repo):
        repo = temp_git_repo
        wt_path = Path(repo.working_dir).parent / "test-worktree"

        git_ops.add_worktree(repo, wt_path, "feature/wt-test", new_branch=True, start_point="HEAD")

        worktrees = git_ops.list_worktrees(repo)
        paths = [wt["path"] for wt in worktrees]
        assert str(wt_path) in paths

        git_ops.remove_worktree(repo, wt_path)

        worktrees = git_ops.list_worktrees(repo)
        paths = [wt["path"] for wt in worktrees]
        assert str(wt_path) not in paths

    def test_get_worktree_status(self, temp_git_repo: Repo):
        status = git_ops.get_worktree_status(Path(temp_git_repo.working_dir))
        assert "modified" in status
        assert "staged" in status
        assert "untracked" in status
        assert "conflicts" in status


class TestStashOperations:
    def test_stash_nothing_to_stash(self, temp_git_repo: Repo):
        result = git_ops.stash_save(temp_git_repo, Path(temp_git_repo.working_dir))
        assert result == "nothing_to_stash"

    def test_stash_and_pop(self, temp_git_repo: Repo):
        repo = temp_git_repo
        wt_path = Path(repo.working_dir)

        # Create an uncommitted change
        (wt_path / "dirty.txt").write_text("dirty\n")

        result = git_ops.stash_save(repo, wt_path, message="test stash")
        assert result == "stashed"
        assert not (wt_path / "dirty.txt").exists()

        pop_result = git_ops.stash_pop(repo, wt_path)
        assert pop_result == "applied"
        assert (wt_path / "dirty.txt").exists()

    def test_stash_pop_no_stash(self, temp_git_repo: Repo):
        result = git_ops.stash_pop(temp_git_repo, Path(temp_git_repo.working_dir))
        assert result == "no_stash"


class TestDoctorOperations:
    def test_check_git_version(self):
        version = git_ops.check_git_version()
        assert version != "not found"
        # Should look like a version number
        assert "." in version

    def test_check_worktree_health_clean(self, temp_git_repo: Repo):
        issues = git_ops.check_worktree_health(temp_git_repo)
        assert isinstance(issues, list)
        # Fresh repo should have no issues
        assert len(issues) == 0

    def test_check_worktree_health_missing_path(self, temp_git_repo: Repo):
        repo = temp_git_repo
        wt_path = Path(repo.working_dir).parent / "health-check-wt"

        # Create and then manually delete the worktree directory
        git_ops.add_worktree(repo, wt_path, "feature/health", new_branch=True, start_point="HEAD")
        import shutil

        shutil.rmtree(wt_path)

        issues = git_ops.check_worktree_health(repo)
        path_issues = [i for i in issues if "does not exist" in i["issue"]]
        assert len(path_issues) >= 1

        # Cleanup: prune stale entries
        repo.git.worktree("prune")
