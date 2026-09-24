import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NgjsConfig, TestOptions } from "@/config/cli-config.ts";
import { TestConfig } from "@/config/test-config.ts";

describe("TestConfig.create()", () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), "ngjs-test-config-test-"));
    process.chdir(dir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  async function writeNgjsConfig(options?: TestOptions): Promise<void> {
    await writeFile(
      join(dir, "ngjs.json"),
      JSON.stringify({
        version: "1",
        root: ".",
        projectType: "application",
        sourceRoot: "app",
        architect: { build: { options: { entryPoints: {}, outputPath: "dist" } }, ...(options && { test: { options } }) },
      } satisfies NgjsConfig),
      "utf8",
    );
  }

  it("sin architect.test: watch, specs bajo sourceRoot, sin excludes ni setupFiles", async () => {
    await writeNgjsConfig();
    const config = await TestConfig.create({ watch: true });

    expect(config.watch).toBe(true);
    expect(config.include).toEqual(["app/**/*.spec.ts"]);
    expect(config.exclude).toEqual([]);
    expect(config.setupFiles).toEqual([]);
    expect(config.sourceRoot).toBe("app");
    expect(config.fileReplacements).toEqual([]);
  });

  it("lee architect.test.options; --no-watch y --include pisan", async () => {
    const fileReplacements = [{ replace: "app/environment.ts", with: "app/environment.test.ts" }];
    await writeNgjsConfig({ include: ["app/a.spec.ts"], exclude: ["app/slow/**"], setupFiles: ["app/test-setup.ts"], watch: false, fileReplacements });

    const fromFile = await TestConfig.create({ watch: true });
    expect(fromFile.watch).toBe(false);
    expect(fromFile.include).toEqual(["app/a.spec.ts"]);
    expect(fromFile.exclude).toEqual(["app/slow/**"]);
    expect(fromFile.setupFiles).toEqual(["app/test-setup.ts"]);
    expect(fromFile.fileReplacements).toEqual(fileReplacements);

    await writeNgjsConfig({ watch: true });
    const fromFlags = await TestConfig.create({ watch: false, include: ["app/b.spec.ts"] });
    expect(fromFlags.watch).toBe(false);
    expect(fromFlags.include).toEqual(["app/b.spec.ts"]);
  });
});
