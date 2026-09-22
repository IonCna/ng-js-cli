import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NgjsConfig } from "@/config/cli-config.ts";
import { GenerateConfig } from "@/config/generate-config.ts";

describe("GenerateConfig.create()", () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), "ngjs-generate-config-test-"));
    process.chdir(dir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  async function writeNgjsConfig(prefix: string | undefined): Promise<void> {
    await writeFile(
      join(dir, "ngjs.json"),
      JSON.stringify({
        version: "1",
        root: ".",
        projectType: "library",
        sourceRoot: "src",
        prefix,
        architect: { build: { options: { entryPoints: {}, outputPath: "dist" } } },
      } satisfies NgjsConfig),
      "utf8",
    );
  }

  it("lee sourceRoot/prefix de ngjs.json", async () => {
    await writeNgjsConfig("ngb");
    const config = await GenerateConfig.create({ schematic: "component", name: "card" });

    expect(config.sourceRoot).toBe("src");
    expect(config.prefix).toBe("ngb");
  });

  it("prefix por default 'app' si ngjs.json no lo tiene", async () => {
    await writeNgjsConfig(undefined);
    const config = await GenerateConfig.create({ schematic: "component", name: "card" });

    expect(config.prefix).toBe("app");
  });
});
