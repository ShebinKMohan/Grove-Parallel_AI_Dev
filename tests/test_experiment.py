"""Tests for experiment set creation and management."""

from pathlib import Path

from git import Repo

from worktree_pilot.core.experiment import (
    cleanup_experiment,
    create_experiment_set,
    get_experiment_names,
    list_experiments,
)


class TestCreateExperimentSet:
    def test_creates_variants(self, temp_git_repo: Repo):
        results = create_experiment_set(temp_git_repo, "auth-test", ["approach-a", "approach-b"])
        assert len(results) == 2
        assert all(r.get("branch", "").startswith("experiment/auth-test/") for r in results)
        assert all(Path(r["path"]).exists() for r in results if not r.get("error"))

    def test_single_variant(self, temp_git_repo: Repo):
        results = create_experiment_set(temp_git_repo, "quick", ["solo"])
        assert len(results) == 1
        assert results[0]["branch"] == "experiment/quick/solo"


class TestListExperiments:
    def test_lists_grouped(self, temp_git_repo: Repo):
        create_experiment_set(temp_git_repo, "exp-a", ["v1", "v2"])
        create_experiment_set(temp_git_repo, "exp-b", ["v1"])

        experiments = list_experiments(temp_git_repo)
        assert "exp-a" in experiments
        assert "exp-b" in experiments
        assert len(experiments["exp-a"]) == 2
        assert len(experiments["exp-b"]) == 1

    def test_empty_when_no_experiments(self, temp_git_repo: Repo):
        experiments = list_experiments(temp_git_repo)
        assert experiments == {}


class TestCleanupExperiment:
    def test_cleanup_removes_worktrees(self, temp_git_repo: Repo):
        create_experiment_set(temp_git_repo, "to-clean", ["a", "b"])
        results = cleanup_experiment(temp_git_repo, "to-clean", delete_branches=True, force=True)
        assert all(r.get("removed") == "true" for r in results)

        # Verify they're gone
        experiments = list_experiments(temp_git_repo)
        assert "to-clean" not in experiments

    def test_cleanup_nonexistent(self, temp_git_repo: Repo):
        results = cleanup_experiment(temp_git_repo, "nonexistent")
        assert results[0]["status"] == "not_found"


class TestGetExperimentNames:
    def test_returns_sorted_names(self, temp_git_repo: Repo):
        create_experiment_set(temp_git_repo, "zebra", ["v1"])
        create_experiment_set(temp_git_repo, "alpha", ["v1"])

        names = get_experiment_names(temp_git_repo)
        assert names == ["alpha", "zebra"]
