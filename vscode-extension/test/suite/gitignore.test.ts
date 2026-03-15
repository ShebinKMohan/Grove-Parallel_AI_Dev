/**
 * Tests for core/gitignore.ts — auto-manage .gitignore entries.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ensureGitignored, ensureGroveDirIgnored } from "../../src/core/gitignore";

describe("ensureGitignored", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wt-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("creates .gitignore if it does not exist", () => {
        const wtPath = path.join(tmpDir, "my-worktree");
        const result = ensureGitignored(tmpDir, wtPath);

        assert.strictEqual(result, true);
        assert.ok(fs.existsSync(path.join(tmpDir, ".gitignore")));
    });

    it("adds worktree pattern to new .gitignore", () => {
        const wtPath = path.join(tmpDir, "my-worktree");
        ensureGitignored(tmpDir, wtPath);

        const content = fs.readFileSync(
            path.join(tmpDir, ".gitignore"),
            "utf-8"
        );
        assert.ok(content.includes("/my-worktree/"));
    });

    it("includes header comment in new .gitignore", () => {
        const wtPath = path.join(tmpDir, "my-worktree");
        ensureGitignored(tmpDir, wtPath);

        const content = fs.readFileSync(
            path.join(tmpDir, ".gitignore"),
            "utf-8"
        );
        assert.ok(content.includes("Grove"));
    });

    it("appends to existing .gitignore", () => {
        fs.writeFileSync(
            path.join(tmpDir, ".gitignore"),
            "node_modules/\n"
        );

        const wtPath = path.join(tmpDir, "my-worktree");
        const result = ensureGitignored(tmpDir, wtPath);

        assert.strictEqual(result, true);
        const content = fs.readFileSync(
            path.join(tmpDir, ".gitignore"),
            "utf-8"
        );
        assert.ok(content.includes("node_modules/"));
        assert.ok(content.includes("/my-worktree/"));
    });

    it("does not duplicate existing entry", () => {
        const wtPath = path.join(tmpDir, "my-worktree");
        ensureGitignored(tmpDir, wtPath);
        const result = ensureGitignored(tmpDir, wtPath);

        assert.strictEqual(result, false);
        const content = fs.readFileSync(
            path.join(tmpDir, ".gitignore"),
            "utf-8"
        );
        const matches = content.match(/\/my-worktree\//g);
        assert.strictEqual(matches?.length, 1);
    });

    it("returns false for paths outside the repo", () => {
        const wtPath = "/completely/different/path";
        const result = ensureGitignored(tmpDir, wtPath);
        assert.strictEqual(result, false);
    });

    it("adds newline before entry if file doesn't end with one", () => {
        fs.writeFileSync(
            path.join(tmpDir, ".gitignore"),
            "node_modules/"  // no trailing newline
        );

        const wtPath = path.join(tmpDir, "worktree-a");
        ensureGitignored(tmpDir, wtPath);

        const content = fs.readFileSync(
            path.join(tmpDir, ".gitignore"),
            "utf-8"
        );
        // Should not have the pattern stuck to the previous line
        assert.ok(content.includes("node_modules/\n/worktree-a/"));
    });
});

describe("ensureGroveDirIgnored", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wt-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("creates .gitignore with /.grove/ if none exists", () => {
        const result = ensureGroveDirIgnored(tmpDir);

        assert.strictEqual(result, true);
        const content = fs.readFileSync(
            path.join(tmpDir, ".gitignore"),
            "utf-8"
        );
        assert.ok(content.includes("/.grove/"));
    });

    it("appends /.grove/ to existing .gitignore", () => {
        fs.writeFileSync(
            path.join(tmpDir, ".gitignore"),
            "node_modules/\n"
        );

        const result = ensureGroveDirIgnored(tmpDir);

        assert.strictEqual(result, true);
        const content = fs.readFileSync(
            path.join(tmpDir, ".gitignore"),
            "utf-8"
        );
        assert.ok(content.includes("node_modules/"));
        assert.ok(content.includes("/.grove/"));
    });

    it("does not duplicate /.grove/ entry", () => {
        ensureGroveDirIgnored(tmpDir);
        const result = ensureGroveDirIgnored(tmpDir);

        assert.strictEqual(result, false);
        const content = fs.readFileSync(
            path.join(tmpDir, ".gitignore"),
            "utf-8"
        );
        const matches = content.match(/\/\.grove\//g);
        assert.strictEqual(matches?.length, 1);
    });
});
