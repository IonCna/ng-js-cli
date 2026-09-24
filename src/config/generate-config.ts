import { NgjsCommandConfig } from "@/config/ngjs-command-config.ts";

/** `ngjs generate <schematic> <name>` — positional args de `commander`, más sus flags. */
export interface GenerateFlags {
  schematic: string;
  name: string;
  /** `--skip-import`: no registrar en ningún `@NgModule`. */
  skipImport?: boolean;
  /** `--module <path>`: el `@NgModule` donde registrar, en vez del más cercano. */
  module?: string;
  /** `--skip-tests`: sin el `.spec.ts`. */
  skipTests?: boolean;
}

export class GenerateConfig extends NgjsCommandConfig {
  private constructor(
    public readonly schematic: string,
    public readonly name: string,
    public readonly sourceRoot: string,
    public readonly prefix: string,
    public readonly skipImport: boolean,
    public readonly module: string | undefined,
    public readonly skipTests: boolean,
  ) {
    super();
  }

  static async create(flags: GenerateFlags): Promise<GenerateConfig> {
    const config = await this.read();
    return new GenerateConfig(
      flags.schematic,
      flags.name,
      config.sourceRoot,
      config.prefix ?? "app",
      flags.skipImport ?? false,
      flags.module,
      flags.skipTests ?? false,
    );
  }
}
