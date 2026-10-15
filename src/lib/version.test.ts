import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLI_VERSION } from "./version.js";

describe("CLI_VERSION", () => {
  it("matches package.json so --version can never drift again", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(CLI_VERSION).toBe(pkg.version);
    expect(CLI_VERSION).toBe("0.4.0");
  });
});
