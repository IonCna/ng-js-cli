import type { NgjsConfig } from "@/config/cli-config.ts";
import { NgjsCommandConfig } from "@/config/ngjs-command-config.ts";

/** `ngjs config <path> [value]` — `path` en dot-notation sobre `ngjs.json`; `value` ausente = modo lectura. */
export interface ConfigFlags {
  path: string;
  value?: string;
}

export class ConfigConfig extends NgjsCommandConfig {
  private constructor(
    /** El `ngjs.json` completo, tal cual está en disco — el comando navega/muta esto según `segments`. */
    public readonly config: NgjsConfig,
    public readonly segments: string[],
    /** `undefined` = `get`; cualquier otro valor (incluido `""`) = `set`. */
    public readonly rawValue: string | undefined,
  ) {
    super();
  }

  static async create(flags: ConfigFlags): Promise<ConfigConfig> {
    const config = await this.read();
    const segments = flags.path.split(".").filter(Boolean);
    if (segments.length === 0) {
      throw new Error(`Path de config inválido: "${flags.path}".`);
    }

    return new ConfigConfig(config, segments, flags.value);
  }
}
