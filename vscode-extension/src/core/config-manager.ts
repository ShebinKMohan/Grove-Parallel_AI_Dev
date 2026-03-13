/**
 * Configuration manager — reads/writes extension and project-level configs.
 * Project config is stored in .worktreepilot/config.json.
 */

import * as fs from "fs";
import * as path from "path";
import { log, logError } from "../utils/logger";

export interface ProjectConfig {
    projectName?: string;
    conventions?: {
        framework?: string;
        testFramework?: string;
        linter?: string;
    };
    sharedFiles?: string[];
    mergeTestCommand?: string;
    defaultTemplate?: string;
}

const CONFIG_DIR = ".worktreepilot";
const CONFIG_FILE = "config.json";

/**
 * Find and load the project config from .worktreepilot/config.json.
 * Searches upward from the given directory.
 */
export function loadProjectConfig(repoRoot: string): ProjectConfig | null {
    const configPath = path.join(repoRoot, CONFIG_DIR, CONFIG_FILE);

    if (!fs.existsSync(configPath)) {
        return null;
    }

    try {
        const content = fs.readFileSync(configPath, "utf-8");
        return JSON.parse(content) as ProjectConfig;
    } catch (err) {
        logError("Failed to parse project config", err);
        return null;
    }
}

/**
 * Save the project config to .worktreepilot/config.json.
 */
export function saveProjectConfig(
    repoRoot: string,
    config: ProjectConfig
): void {
    const configDir = path.join(repoRoot, CONFIG_DIR);
    const configPath = path.join(configDir, CONFIG_FILE);

    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    log(`Saved project config to ${configPath}`);
}

/**
 * Get a specific config value by dotted key path.
 * e.g., getConfigValue(config, "conventions.framework") → "FastAPI + React"
 */
export function getConfigValue(
    config: ProjectConfig,
    key: string
): string | string[] | undefined {
    const parts = key.split(".");
    let current: unknown = config;

    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== "object") {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }

    if (typeof current === "string") return current;
    if (Array.isArray(current)) return current as string[];
    return undefined;
}

/**
 * Ensure the .worktreepilot directory exists and is gitignored.
 */
export function ensureConfigDirectory(repoRoot: string): string {
    const configDir = path.join(repoRoot, CONFIG_DIR);

    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    return configDir;
}
