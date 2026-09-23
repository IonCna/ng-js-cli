import type { BuildOptions, FileReplacement, NgjsConfig } from "@/config/cli-config.ts";
import { NgjsCommandConfig } from "@/config/ngjs-command-config.ts";

/** Flags de `ngjs build` (línea de comandos) — lo que NO vive en `ngjs.json`. */
export interface BuildFlags {
  /** `--configuration <names>` — qué sets de `architect.build.configurations` mergear sobre `options` (`staging,es-MX`). */
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
    /** `projectType` de `ngjs.json` — el compilador solo inyecta la plataforma (`bootstrapModule`) en una aplicación. */
    public readonly projectType: NgjsConfig["projectType"],
    public readonly fileReplacements: FileReplacement[],
    /** `ApplicationScanner` (`ng-js-compiler`) escanea desde acá — mismo `sourceRoot` de `ngjs.json`. */
    public readonly sourceRoot: string,
  ) {
    super();
  }

  static async create(flags: BuildFlags): Promise<BuildConfig> {
    const config = await this.read();
    const { options, configurations } = config.architect.build;
    const override = BuildConfig.mergeConfigurations(configurations, flags.configuration);

    const optimization = override.optimization ?? options.optimization ?? false;
    const minify = typeof optimization === "boolean" ? optimization : Boolean(optimization.scripts);

    return new BuildConfig(
      override.entryPoints ?? options.entryPoints,
      override.outputPath ?? options.outputPath,
      override.external ?? options.external ?? [],
      override.sourceMap ?? options.sourceMap ?? false,
      minify,
      override.declarations ?? options.declarations ?? false,
      config.projectType === "library",
      config.projectType,
      override.fileReplacements ?? options.fileReplacements ?? [],
      config.sourceRoot,
    );
  }

  /** Como Angular real: `a,b` aplica `a` y después `b` encima (la última pisa); un nombre que no existe es error. */
  private static mergeConfigurations(
    configurations: Record<string, Partial<BuildOptions>> | undefined,
    names: string | undefined,
  ): Partial<BuildOptions> {
    return (names ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .reduce<Partial<BuildOptions>>((merged, name) => {
        const configuration = configurations?.[name];
        if (!configuration) {
          throw new Error(`Configuration "${name}" no está definida en architect.build.configurations de ngjs.json.`);
        }
        return { ...merged, ...configuration };
      }, {});
  }
}
