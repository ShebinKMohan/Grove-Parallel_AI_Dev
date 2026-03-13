/**
 * Terminal creation and management utilities.
 * Handles launching terminals in worktree directories and Claude Code sessions.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFileSync } from "child_process";
import { log } from "./logger";

/** Cached absolute path to the claude binary. */
let cachedClaudePath: string | undefined;

function resolveClaudePath(): string {
    if (!cachedClaudePath) {
        try {
            cachedClaudePath = execFileSync("which", ["claude"], {
                encoding: "utf-8",
            }).trim();
        } catch {
            cachedClaudePath = "claude";
        }
    }
    return cachedClaudePath;
}

/**
 * Open a plain terminal in the given directory.
 */
export function openTerminal(name: string, cwd: string): vscode.Terminal {
    const terminal = vscode.window.createTerminal({ name, cwd });
    terminal.show();
    return terminal;
}

/**
 * Open a folder in a new VS Code window.
 */
export async function openInNewWindow(folderPath: string): Promise<void> {
    await vscode.commands.executeCommand(
        "vscode.openFolder",
        vscode.Uri.file(folderPath),
        true
    );
}

/**
 * Check if a Claude session exists for the given directory.
 * Claude stores sessions in ~/.claude/projects/<slug>/ where slug is
 * the absolute path with /, _, and . replaced by -.
 */
export function hasExistingClaudeSession(cwd: string): boolean {
    try {
        const claudeDir = path.join(os.homedir(), ".claude", "projects");
        if (!fs.existsSync(claudeDir)) return false;

        const projectSlug = cwd.replace(/[/_.]/g, "-");
        const projectDir = path.join(claudeDir, projectSlug);

        if (!fs.existsSync(projectDir)) return false;

        const files = fs.readdirSync(projectDir);
        return files.some((f) => f.endsWith(".jsonl"));
    } catch {
        return false;
    }
}

/**
 * Launch Claude Code in a terminal at the given path.
 * Prompts for session continuation if an existing session is found.
 *
 * Uses clean zsh (--no-rcs) to avoid shell profile pollution,
 * drains any IDE-injected stdin, then exec's Claude with a real PTY.
 */
export async function launchClaude(
    branchName: string,
    cwd: string
): Promise<vscode.Terminal | undefined> {
    const claudePath = resolveClaudePath();
    let claudeArgs: string[] = [];

    log(`Launch Claude: branch="${branchName}" cwd="${cwd}"`);

    if (hasExistingClaudeSession(cwd)) {
        const choice = await vscode.window.showQuickPick(
            [
                {
                    label: "$(history) Continue last session",
                    description: "Resume where you left off",
                    value: "continue",
                },
                {
                    label: "$(list-tree) Pick a session",
                    description: "Choose from recent conversations",
                    value: "resume",
                },
                {
                    label: "$(add) New session",
                    description: "Start a fresh conversation",
                    value: "new",
                },
            ],
            {
                placeHolder: "Existing Claude session found in this worktree",
                title: "WorkTree Pilot: Launch Claude",
            }
        );

        if (!choice) return undefined;

        if (choice.value === "continue") {
            claudeArgs = ["--continue"];
        } else if (choice.value === "resume") {
            claudeArgs = ["--resume"];
        }
    }

    const quotedPath = claudePath.includes(" ")
        ? `"${claudePath}"`
        : claudePath;
    const execCmd = [quotedPath, ...claudeArgs].join(" ");

    // Strategy: clean shell → sleep to drain IDE injections → exec claude
    const shellCmd = [
        "sleep 2",
        "while read -t 0.5 -k 1 c 2>/dev/null; do :; done",
        `exec ${execCmd}`,
    ].join("; ");

    const terminal = vscode.window.createTerminal({
        name: `Claude: ${branchName}`,
        cwd,
        shellPath: "/bin/zsh",
        shellArgs: ["--no-rcs", "--no-globalrcs", "-c", shellCmd],
        strictEnv: true,
        env: {
            PATH: process.env["PATH"] || "/usr/local/bin:/usr/bin:/bin",
            HOME: process.env["HOME"] || "",
            USER: process.env["USER"] || "",
            SHELL: "/bin/zsh",
            TERM: "xterm-256color",
            LANG: process.env["LANG"] || "en_US.UTF-8",
        },
    });
    terminal.show();
    return terminal;
}
