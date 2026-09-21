import { NgjsCommandConfig } from "@/config/ngjs-command-config.ts";

/** Flags de `ngjs serve` (línea de comandos) — pisan lo que haya en `architect.serve.options`. */
export interface ServeFlags {
  port?: number;
}

export class ServeConfig extends NgjsCommandConfig {
  private constructor(
    public readonly port: number,
    public readonly allowedHosts: string[],
  ) {
    super();
  }

  static async create(flags: ServeFlags): Promise<ServeConfig> {
    const config = await this.read();
    const options = config.architect.serve?.options ?? {};

    return new ServeConfig(flags.port ?? options.port ?? 4200, options.allowedHosts ?? []);
  }
}
