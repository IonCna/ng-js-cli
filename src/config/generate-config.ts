import { NgjsCommandConfig } from "@/config/ngjs-command-config.ts";

/** `ngjs generate <schematic> <name>` — positional args de `commander`. */
export interface GenerateFlags {
  schematic: string;
  name: string;
}

export class GenerateConfig extends NgjsCommandConfig {
  private constructor(
    public readonly schematic: string,
    public readonly name: string,
    public readonly sourceRoot: string,
    public readonly prefix: string,
  ) {
    super();
  }

  static async create(flags: GenerateFlags): Promise<GenerateConfig> {
    const config = await this.read();
    return new GenerateConfig(flags.schematic, flags.name, config.sourceRoot, config.prefix ?? "app");
  }
}
