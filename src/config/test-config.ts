import type { FileReplacement } from "@/config/cli-config.ts";
import { NgjsCommandConfig } from "@/config/ngjs-command-config.ts";

/** Flags de `ngjs test` (línea de comandos) — pisan lo que haya en `architect.test.options`. */
export interface TestFlags {
  /** `--no-watch` → `false` (`commander` da `true` por default). */
  watch?: boolean;
  include?: string[];
}

export class TestConfig extends NgjsCommandConfig {
  private constructor(
    public readonly watch: boolean,
    public readonly include: string[],
    public readonly exclude: string[],
    public readonly setupFiles: string[],
    /** `ApplicationScanner` (`ng-js-compiler`) escanea desde acá — mismo `sourceRoot` de `ngjs.json`, specs incluidos. */
    public readonly sourceRoot: string,
    public readonly projectType: "application" | "library",
    public readonly fileReplacements: FileReplacement[],
  ) {
    super();
  }

  static async create(flags: TestFlags): Promise<TestConfig> {
    const config = await this.read();
    const options = config.architect.test?.options ?? {};

    return new TestConfig(
      // `commander` siempre manda `watch` (default `true`): `ngjs.json` solo cuenta si no se pasó `--no-watch`.
      flags.watch === false ? false : (options.watch ?? true),
      flags.include?.length ? flags.include : (options.include ?? [`${config.sourceRoot}/**/*.spec.ts`]),
      options.exclude ?? [],
      options.setupFiles ?? [],
      config.sourceRoot,
      config.projectType,
      options.fileReplacements ?? [],
    );
  }
}
