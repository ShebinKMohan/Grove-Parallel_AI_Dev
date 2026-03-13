/**
 * Mocha test runner — discovers and runs all *.test.js files in this directory.
 */

import * as path from "path";
import * as fs from "fs";
import Mocha from "mocha";

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: "bdd",
        color: true,
        timeout: 10000,
    });

    const testsRoot = __dirname;
    const testFiles = fs
        .readdirSync(testsRoot)
        .filter((f) => f.endsWith(".test.js"));

    for (const file of testFiles) {
        mocha.addFile(path.resolve(testsRoot, file));
    }

    return new Promise((resolve, reject) => {
        mocha.run((failures) => {
            if (failures > 0) {
                reject(new Error(`${failures} test(s) failed.`));
            } else {
                resolve();
            }
        });
    });
}
