import * as assert from "assert";
import { buildClaudeMdContent } from "../../src/core/claude-md-generator";
import type { TeamTemplate, AgentRole } from "../../src/core/template-manager";

describe("claude-md-generator", () => {
    const backendAgent: AgentRole = {
        role: "backend",
        displayName: "Backend Architect",
        ownership: ["src/api/**", "src/models/**"],
        prompt: "You are the backend architect. Build APIs.",
        claudeMdExtra: "Use REST patterns.",
        readOnly: false,
    };

    const frontendAgent: AgentRole = {
        role: "frontend",
        displayName: "Frontend Engineer",
        ownership: ["src/components/**", "src/pages/**"],
        prompt: "You are the frontend engineer. Build UI.",
        readOnly: false,
    };

    const reviewerAgent: AgentRole = {
        role: "reviewer",
        displayName: "Code Reviewer",
        ownership: [],
        prompt: "Review the code for quality.",
        readOnly: true,
    };

    const template: TeamTemplate = {
        name: "Test Team",
        description: "A test team",
        agents: [backendAgent, frontendAgent, reviewerAgent],
        mergeOrder: ["backend", "frontend"],
        estimatedTokens: "100K",
    };

    describe("buildClaudeMdContent()", () => {
        it("includes agent display name in header", () => {
            const content = buildClaudeMdContent({
                agent: backendAgent,
                template,
                taskDescription: "Build user auth",
                teamName: "auth-team",
                repoRoot: "/tmp/fake",
                worktreePath: "/tmp/fake/wt",
            });
            assert.ok(content.includes("# Backend Architect"));
        });

        it("includes task description", () => {
            const content = buildClaudeMdContent({
                agent: backendAgent,
                template,
                taskDescription: "Build user auth",
                teamName: "auth-team",
                repoRoot: "/tmp/fake",
                worktreePath: "/tmp/fake/wt",
            });
            assert.ok(content.includes("Build user auth"));
        });

        it("includes agent prompt", () => {
            const content = buildClaudeMdContent({
                agent: backendAgent,
                template,
                taskDescription: "",
                teamName: "test",
                repoRoot: "/tmp/fake",
                worktreePath: "/tmp/fake/wt",
            });
            assert.ok(content.includes("You are the backend architect"));
        });

        it("lists ownership patterns", () => {
            const content = buildClaudeMdContent({
                agent: backendAgent,
                template,
                taskDescription: "",
                teamName: "test",
                repoRoot: "/tmp/fake",
                worktreePath: "/tmp/fake/wt",
            });
            assert.ok(content.includes("`src/api/**`"));
            assert.ok(content.includes("`src/models/**`"));
        });

        it("lists other agents as do-not-modify", () => {
            const content = buildClaudeMdContent({
                agent: backendAgent,
                template,
                taskDescription: "",
                teamName: "test",
                repoRoot: "/tmp/fake",
                worktreePath: "/tmp/fake/wt",
            });
            assert.ok(content.includes("Frontend Engineer"));
            assert.ok(content.includes("`src/components/**`"));
        });

        it("includes read-only warning for reviewer agents", () => {
            const content = buildClaudeMdContent({
                agent: reviewerAgent,
                template,
                taskDescription: "",
                teamName: "test",
                repoRoot: "/tmp/fake",
                worktreePath: "/tmp/fake/wt",
            });
            assert.ok(content.includes("READ-ONLY"));
            assert.ok(content.includes("REVIEW.md"));
        });

        it("includes shared files protocol when provided", () => {
            const content = buildClaudeMdContent({
                agent: backendAgent,
                template,
                taskDescription: "",
                teamName: "test",
                repoRoot: "/tmp/fake",
                worktreePath: "/tmp/fake/wt",
                sharedFiles: ["package.json", "tsconfig.json"],
            });
            assert.ok(content.includes("Shared Files Protocol"));
            assert.ok(content.includes("`package.json`"));
            assert.ok(content.includes("SHARED-CHANGES.md"));
        });

        it("includes handoff protocol for non-readonly agents", () => {
            const content = buildClaudeMdContent({
                agent: backendAgent,
                template,
                taskDescription: "",
                teamName: "test",
                repoRoot: "/tmp/fake",
                worktreePath: "/tmp/fake/wt",
            });
            assert.ok(content.includes("HANDOFF.md"));
        });

        it("does not include handoff protocol for readonly agents", () => {
            const content = buildClaudeMdContent({
                agent: reviewerAgent,
                template,
                taskDescription: "",
                teamName: "test",
                repoRoot: "/tmp/fake",
                worktreePath: "/tmp/fake/wt",
            });
            assert.ok(!content.includes("HANDOFF.md"));
        });

        it("includes claudeMdExtra when provided", () => {
            const content = buildClaudeMdContent({
                agent: backendAgent,
                template,
                taskDescription: "",
                teamName: "test",
                repoRoot: "/tmp/fake",
                worktreePath: "/tmp/fake/wt",
            });
            assert.ok(content.includes("Use REST patterns."));
        });

        it("includes project conventions when provided", () => {
            const content = buildClaudeMdContent({
                agent: backendAgent,
                template,
                taskDescription: "",
                teamName: "test",
                repoRoot: "/tmp/fake",
                worktreePath: "/tmp/fake/wt",
                projectConfig: {
                    conventions: {
                        framework: "FastAPI + React",
                        testFramework: "pytest",
                        linter: "ruff",
                    },
                },
            });
            assert.ok(content.includes("FastAPI + React"));
            assert.ok(content.includes("pytest"));
        });

        it("includes team and session metadata", () => {
            const content = buildClaudeMdContent({
                agent: backendAgent,
                template,
                taskDescription: "",
                teamName: "auth-team",
                repoRoot: "/tmp/fake",
                worktreePath: "/tmp/fake/wt",
            });
            assert.ok(content.includes("Test Team"));
            assert.ok(content.includes("auth-team"));
        });
    });
});
