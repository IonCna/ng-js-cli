import { describe, expect, it } from "vitest";
import type { NgjsConfig } from "@/config/cli-config.ts";
import { ngjsConfigSchema } from "@/config/ngjs-config-schema.ts";

const validConfig: NgjsConfig = {
  version: "1",
  root: ".",
  projectType: "application",
  sourceRoot: "src",
  prefix: "app",
  architect: {
    build: {
      options: {
        entryPoints: { index: "src/index.ts" },
        outputPath: "dist",
        external: ["angular"],
        sourceMap: true,
        optimization: { scripts: true, styles: false },
        declarations: false,
        index: { input: "src/index.html" },
        assets: [{ glob: "**/*", input: "src/assets", output: "assets" }],
        styles: [{ input: "src/styles.css" }],
        budgets: [{ type: "initial", maximumWarning: "500kb" }],
      },
      configurations: { production: { optimization: true } },
    },
    serve: { options: { port: 4200 }, configurations: { staging: { port: 4300 } } },
  },
  cli: { defaultCollection: "ngjs-core" },
};

describe("ngjsConfigSchema", () => {
  it("acepta una NgjsConfig completa y válida", () => {
    expect(ngjsConfigSchema.safeParse(validConfig).success).toBe(true);
  });

  it("rechaza un projectType inválido", () => {
    const result = ngjsConfigSchema.safeParse({ ...validConfig, projectType: "nope" });
    expect(result.success).toBe(false);
  });

  it("rechaza outputPath con el tipo equivocado", () => {
    const invalid = structuredClone(validConfig) as Record<string, any>;
    invalid.architect.build.options.outputPath = 123;

    expect(ngjsConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it("rechaza si falta un campo requerido", () => {
    const { version: _version, ...withoutVersion } = validConfig;
    expect(ngjsConfigSchema.safeParse(withoutVersion).success).toBe(false);
  });

  it("rechaza un cli.defaultCollection desconocido", () => {
    const invalid = { ...validConfig, cli: { defaultCollection: "nope" } };
    expect(ngjsConfigSchema.safeParse(invalid).success).toBe(false);
  });
});
