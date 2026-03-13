/**
 * OutputChannel-based logging for WorkTree Pilot.
 * Falls back to console when running outside VS Code (e.g., in tests).
 */

let vscodeModule: typeof import("vscode") | undefined;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    vscodeModule = require("vscode");
} catch {
    // Running outside VS Code (tests, CLI)
}

let outputChannel: { appendLine(value: string): void; dispose(): void } | undefined;

function getOutputChannel(): { appendLine(value: string): void } {
    if (!outputChannel) {
        if (vscodeModule) {
            outputChannel = vscodeModule.window.createOutputChannel("WorkTree Pilot");
        } else {
            // Fallback for test environments
            outputChannel = {
                appendLine(value: string) {
                    // Silent in tests unless DEBUG is set
                    if (process.env["DEBUG"]) {
                        console.log(value);
                    }
                },
                dispose() {
                    // no-op
                },
            };
        }
    }
    return outputChannel;
}

export function log(message: string): void {
    getOutputChannel().appendLine(`[${timestamp()}] ${message}`);
}

export function logError(message: string, error?: unknown): void {
    const errorMsg =
        error instanceof Error ? error.message : String(error ?? "");
    getOutputChannel().appendLine(
        `[${timestamp()}] ERROR: ${message}${errorMsg ? ` — ${errorMsg}` : ""}`
    );
}

function timestamp(): string {
    return new Date().toISOString().slice(11, 19);
}

export function disposeLogger(): void {
    outputChannel?.dispose();
    outputChannel = undefined;
}
