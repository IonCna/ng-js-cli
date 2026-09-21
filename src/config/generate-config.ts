import { NgjsCommandConfig } from "@/config/ngjs-command-config.ts";

/** `ngjs generate <schematic> <name>` — positional args de `commander`, `--scoped` es la única flag real. */
export interface GenerateFlags {
  schematic: string;
  name: string;
  scoped?: boolean;
}

export class GenerateConfig extends NgjsCommandConfig {
  private constructor(
    public readonly schematic: string,
    public readonly name: string,
    public readonly sourceRoot: string,
    public readonly prefix: string,
    public readonly scoped: boolean,
  ) {
    super();
  }

  static async create(flags: GenerateFlags): Promise<GenerateConfig> {
    const config = await this.read();
    return new GenerateConfig(flags.schematic, flags.name, config.sourceRoot, config.prefix ?? "app", flags.scoped ?? false);
  }
}
