import type { FileReplacement } from "@/config/cli-config.ts";
import { NgjsCommandConfig } from "@/config/ngjs-command-config.ts";

/** Flags de `ngjs build` (línea de comandos) — lo que NO vive en `ngjs.json`. */
export interface BuildFlags {
  /** `--configuration <name>` — qué set de `architect.build.configurations` mergear sobre `options`. */
  configuration?: string;
}

export class BuildConfig extends NgjsCommandConfig {
  private constructor(
    public readonly entryPoints: Record<string, string>,
    public readonly outputPath: string,
    public readonly external: string[],
    public readonly sourceMap: boolean,
    public readonly minify: boolean,
    public readonly declarations: boolean,
    /** `projectType: "library"` — esm+cjs (no solo esm). */
    public readonly dualFormat: boolean,
    public readonly fileReplacements: FileReplacement[],
  ) {
    super();
  }

  static async create(flags: BuildFlags): Promise<BuildConfig> {
    const config = await this.read();
    const { options, configurations } = config.architect.build;
    const override = flags.configuration ? configurations?.[flags.configuration] : undefined;

    const optimization = override?.optimization ?? options.optimization ?? false;
    const minify = typeof optimization === "boolean" ? optimization : Boolean(optimization.scripts);

    return new BuildConfig(
      override?.entryPoints ?? options.entryPoints,
      override?.outputPath ?? options.outputPath,
      override?.external ?? options.external ?? [],
      override?.sourceMap ?? options.sourceMap ?? false,
      minify,
      override?.declarations ?? options.declarations ?? false,
      config.projectType === "library",
      override?.fileReplacements ?? options.fileReplacements ?? [],
    );
  }
}
