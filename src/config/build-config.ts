import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import type { IndexHtmlOptions } from "@/build/index-html-writer.ts";
import type { AssetGlob, BuildOptions, FileReplacement, NgjsConfig, OutputHashing, StyleEntry } from "@/config/cli-config.ts";
import { NgjsCommandConfig } from "@/config/ngjs-command-config.ts";

/** Flags de `ngjs build` (línea de comandos) — lo que NO vive en `ngjs.json`. */
export interface BuildFlags {
  /** `--configuration <names>` — qué sets de `architect.build.configurations` mergear sobre `options` (`staging,es-MX`). */
  configuration?: string;
  /** `--watch` — después del primer build, reconstruye al cambiar algo de `sourceRoot` (ver `BuildCommand.watch`). */
  watch?: boolean;
}

export class BuildConfig extends NgjsCommandConfig {
  private constructor(
    public readonly entryPoints: Record<string, string>,
    public readonly outputPath: string,
    public readonly external: string[],
    public readonly sourceMap: boolean,
    public readonly minify: boolean,
    /** `optimization.styles` (o `optimization: true`) — minifica los estilos globales. */
    public readonly minifyStyles: boolean,
    public readonly declarations: boolean,
    /** `projectType: "library"` — esm+cjs (no solo esm). */
    public readonly dualFormat: boolean,
    /** `projectType` de `ngjs.json` — el compilador solo inyecta la plataforma (`bootstrapModule`) en una aplicación. */
    public readonly projectType: NgjsConfig["projectType"],
    public readonly fileReplacements: FileReplacement[],
    /** `ApplicationScanner` (`ng-js-compiler`) escanea desde acá — mismo `sourceRoot` de `ngjs.json`. */
    public readonly sourceRoot: string,
    /** Solo `projectType: "application"`: el `index.html` a emitir en `outputPath` (ver `resolveIndex`). */
    public readonly index: IndexHtmlOptions | undefined,
    /** `styles` de `ngjs.json` tal cual (ver `GlobalStyles`). */
    public readonly styles: (string | StyleEntry)[],
    /** `assets` de `ngjs.json` tal cual (ver `Assets`); solo los copia una aplicación. */
    public readonly assets: (string | AssetGlob)[],
    /** `outputHashing` de `ngjs.json` (default `none`, como Angular). */
    public readonly outputHashing: OutputHashing,
    /** `deployUrl` de `ngjs.json`, con `/` final (`""` si no hay) — ver `BuildOptions.deployUrl`. */
    public readonly deployUrl: string,
  ) {
    super();
  }

  static async create(flags: BuildFlags): Promise<BuildConfig> {
    const config = await this.read();
    const { options, configurations } = config.architect.build;
    const override = BuildConfig.mergeConfigurations(configurations, flags.configuration);

    const optimization = override.optimization ?? options.optimization ?? false;
    const minify = typeof optimization === "boolean" ? optimization : Boolean(optimization.scripts);
    const minifyStyles = typeof optimization === "boolean" ? optimization : Boolean(optimization.styles);

    return new BuildConfig(
      override.entryPoints ?? options.entryPoints,
      override.outputPath ?? options.outputPath,
      override.external ?? options.external ?? [],
      override.sourceMap ?? options.sourceMap ?? false,
      minify,
      minifyStyles,
      override.declarations ?? options.declarations ?? false,
      config.projectType === "library",
      config.projectType,
      override.fileReplacements ?? options.fileReplacements ?? [],
      config.sourceRoot,
      BuildConfig.resolveIndex(config, override.index ?? options.index),
      override.styles ?? options.styles ?? [],
      override.assets ?? options.assets ?? [],
      override.outputHashing ?? options.outputHashing ?? "none",
      BuildConfig.normalizeDeployUrl(override.deployUrl ?? options.deployUrl),
    );
  }

  /** `/Client/dist` → `/Client/dist/`: se concatena tal cual delante de cada archivo publicado. */
  private static normalizeDeployUrl(deployUrl: string | undefined): string {
    if (!deployUrl) return "";
    return deployUrl.endsWith("/") ? deployUrl : `${deployUrl}/`;
  }

  /**
   * `index` de `ngjs.json`; sin él, el `index.html` de la raíz del proyecto — el mismo que sirve Vite en `serve`.
   * `output` por default: el nombre de `input` (`src/index.html` → `index.html`). Una librería no emite HTML.
   */
  private static resolveIndex(config: NgjsConfig, index: BuildOptions["index"]): IndexHtmlOptions | undefined {
    if (config.projectType !== "application") return undefined;
    if (index) return { input: index.input, output: index.output ?? basename(index.input) };
    return existsSync(join(process.cwd(), "index.html")) ? { input: "index.html", output: "index.html" } : undefined;
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
