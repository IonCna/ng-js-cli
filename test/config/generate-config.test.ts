import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NgjsConfig } from "@/config/cli-config.ts";
import { GenerateConfig } from "@/config/generate-config.ts";

async function writeNgjsConfig(dir: string, defaultCollection: "ng-js-cli" | "ngjs-core" | undefined): Promise<void> {
  await writeFile(
    join(dir, "ngjs.json"),
    JSON.stringify({
      version: "1",
      root: ".",
      projectType: "library",
      sourceRoot: "src",
      architect: { build: { options: { entryPoints: {}, outputPath: "dist" } } },
      cli: defaultCollection ? { defaultCollection } : undefined,
    } satisfies NgjsConfig),
    "utf8",
  );
}

describe("GenerateConfig.create() — resolución de cli.defaultCollection", () => {
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

  it("sin `cli.defaultCollection`, core es false", async () => {
    await writeNgjsConfig(dir, undefined);
    const config = await GenerateConfig.create({ schematic: "component", name: "card" });
    expect(config.core).toBe(false);
  });

  it("`cli.defaultCollection: 'ng-js-cli'` explícito, core es false", async () => {
    await writeNgjsConfig(dir, "ng-js-cli");
    const config = await GenerateConfig.create({ schematic: "component", name: "card" });
    expect(config.core).toBe(false);
  });

  it("`cli.defaultCollection: 'ngjs-core'`, core es true", async () => {
    await writeNgjsConfig(dir, "ngjs-core");
    const config = await GenerateConfig.create({ schematic: "component", name: "card" });
    expect(config.core).toBe(true);
  });
});
