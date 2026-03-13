/**
 * Entry point for VS Code extension integration tests.
 * Downloads VS Code and launches the test suite.
 */

import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
    // The folder containing the extension manifest (package.json)
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to the test suite entry point
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
    });
}

main().catch((err) => {
    console.error("Failed to run tests:", err);
    process.exit(1);
});
