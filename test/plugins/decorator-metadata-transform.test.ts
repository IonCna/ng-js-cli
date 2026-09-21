import { describe, expect, it } from "vitest";
import { decoratorMetadataTransform } from "@/plugins/decorator-metadata-transform.ts";

describe("decoratorMetadataTransform", () => {
  it("emite design:paramtypes vía SWC (legacyDecorator + decoratorMetadata)", async () => {
    const code = `
      function Inject(t: unknown): ParameterDecorator { return () => {}; }
      class Config {}
      class Api {
        constructor(@Inject(Config) public config: Config) {}
      }
    `;

    const result = await decoratorMetadataTransform.transform(code, "api.ts");

    expect(result).toContain('_ts_metadata("design:paramtypes"');
    expect(result).toContain("Config");
    expect(result).not.toMatch(/@Inject/);
  });

  it("no necesita experimentalDecorators en un tsconfig.json (SWC parsea solo)", async () => {
    const code = `
      function Log(): ClassDecorator { return () => {}; }
      @Log()
      class Plain {}
    `;

    await expect(decoratorMetadataTransform.transform(code, "plain.ts")).resolves.toBeDefined();
  });
});
