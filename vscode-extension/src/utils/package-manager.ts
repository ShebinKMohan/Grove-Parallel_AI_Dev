/**
 * Auto-detect and run package manager commands.
 * Supports npm, yarn, pnpm, pip, and poetry.
 *
 * No vscode dependency — detection is purely file-system based.
 */

import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { log, logError } from "./logger";

const execFileAsync = promisify(execFile);

export type PackageManager = "npm" | "yarn" | "pnpm" | "pip" | "poetry" | "none";

/**
 * Detect the package manager used in a directory.
 * Checks lock files and config files in priority order.
 */
export function detectPackageManager(dir: string): PackageManager {
    if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
    if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";
    if (fs.existsSync(path.join(dir, "package-lock.json"))) return "npm";
    if (fs.existsSync(path.join(dir, "package.json"))) return "npm";
    if (fs.existsSync(path.join(dir, "poetry.lock"))) return "poetry";
    if (fs.existsSync(path.join(dir, "Pipfile.lock"))) return "pip";
    if (fs.existsSync(path.join(dir, "requirements.txt"))) return "pip";
    if (fs.existsSync(path.join(dir, "pyproject.toml"))) return "poetry";

    return "none";
}

/**
 * Get the install command for the detected package manager.
 */
function getInstallCommand(pm: PackageManager): [string, string[]] {
    switch (pm) {
        case "npm":
            return ["npm", ["install"]];
        case "yarn":
            return ["yarn", ["install"]];
        case "pnpm":
            return ["pnpm", ["install"]];
        case "pip":
            return ["pip", ["install", "-r", "requirements.txt"]];
        case "poetry":
            return ["poetry", ["install"]];
        case "none":
            return ["", []];
    }
}

/**
 * Install dependencies in a directory using the detected package manager.
 * Returns true if installation succeeded or was skipped (no package manager).
 */
export async function installDependencies(dir: string): Promise<boolean> {
    const pm = detectPackageManager(dir);
    if (pm === "none") {
        log(`No package manager detected in ${dir}`);
        return true;
    }

    const [cmd, args] = getInstallCommand(pm);
    log(`Installing dependencies with ${pm} in ${dir}`);

    try {
        await execFileAsync(cmd, args, {
            cwd: dir,
            maxBuffer: 10 * 1024 * 1024,
            timeout: 120_000, // 2 minute timeout
        });
        log(`Dependencies installed successfully with ${pm}`);
        return true;
    } catch (err) {
        logError(`Failed to install dependencies with ${pm}`, err);
        return false;
    }
}
