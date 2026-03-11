"""Integration tests for CLI commands."""

import os

from typer.testing import CliRunner

from worktree_pilot.cli import app

runner = CliRunner()


class TestCLI:
    def test_no_args_shows_help(self):
        result = runner.invoke(app, [])
        # Typer returns exit code 0 for --help, 2 for no_args_is_help
        assert result.exit_code in (0, 2)
        assert "WorkTree Pilot" in result.output

    def test_list_command(self, temp_git_repo, original_cwd):
        os.chdir(temp_git_repo.working_dir)
        result = runner.invoke(app, ["list"])
        assert result.exit_code == 0

    def test_status_command(self, temp_git_repo, original_cwd):
        os.chdir(temp_git_repo.working_dir)
        result = runner.invoke(app, ["status"])
        assert result.exit_code == 0

    def test_pull_command(self, temp_git_repo, original_cwd):
        os.chdir(temp_git_repo.working_dir)
        result = runner.invoke(app, ["pull"])
        assert result.exit_code == 0

    def test_doctor_command(self, temp_git_repo, original_cwd):
        os.chdir(temp_git_repo.working_dir)
        result = runner.invoke(app, ["doctor"])
        assert result.exit_code == 0
        assert "Doctor Report" in result.output

    def test_merge_no_branches(self, temp_git_repo, original_cwd):
        os.chdir(temp_git_repo.working_dir)
        result = runner.invoke(app, ["merge"])
        assert result.exit_code == 0
        # Only one branch — should exit gracefully
        assert "Need at least 2" in result.output or "already merged" in result.output

    def test_merge_abort_no_merge(self, temp_git_repo, original_cwd):
        os.chdir(temp_git_repo.working_dir)
        result = runner.invoke(app, ["merge", "--abort"])
        # Should fail gracefully since no merge in progress
        assert result.exit_code == 1

    def test_experiment_list_empty(self, temp_git_repo, original_cwd):
        os.chdir(temp_git_repo.working_dir)
        result = runner.invoke(app, ["experiment", "--list"])
        assert result.exit_code == 0
        assert "No active experiments" in result.output

    def test_experiment_clean_aborts_without_tty(self, temp_git_repo, original_cwd):
        os.chdir(temp_git_repo.working_dir)
        # InquirerPy prompts require a real terminal; CliRunner triggers Abort
        result = runner.invoke(app, ["experiment", "--clean", "nope"])
        # Exits non-zero because the interactive prompt can't run
        assert result.exit_code == 1

    def test_stash_move_needs_worktrees(self, temp_git_repo, original_cwd):
        os.chdir(temp_git_repo.working_dir)
        result = runner.invoke(app, ["stash-move"])
        assert result.exit_code == 0
        assert "Need at least 2" in result.output
