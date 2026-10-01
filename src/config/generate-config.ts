import { join } from "node:path";
import type { NgjsConfig } from "@/config/cli-config.ts";
import { NgjsCommandConfig } from "@/config/ngjs-command-config.ts";
import type { SchematicKind, SchematicOptions } from "@/schematics/schematic-registry.ts";

/** `ngjs generate <schematic> <name>` — positional args de `commander`, más sus flags (las de Angular 16). */
export interface GenerateFlags extends Partial<SchematicOptions> {
  schematic: string;
  name: string;
  /** `--path`: la carpeta base, relativa a la raíz del proyecto (default `<sourceRoot>/app`, o `/lib` en una librería). */
  path?: string;
  /** `--dry-run`: muestra qué crearía/actualizaría sin escribir nada. */
  dryRun?: boolean;
  /** `--force`: sobrescribe archivos que ya existen. */
  force?: boolean;
}

export class GenerateConfig extends NgjsCommandConfig {
  private constructor(
    public readonly schematic: string,
    public readonly name: string,
    public readonly sourceRoot: string,
    /** Como Angular (`buildDefaultPath`): `<sourceRoot>/app` en una aplicación, `<sourceRoot>/lib` en una librería. */
    public readonly path: string,
    /** `prefix` de `ngjs.json` (`undefined` = sin prefijo, como Angular). */
    public readonly prefix: string | undefined,
    /** Las flags de opciones del schematic, tal cual (las valida `resolveSchematic`). */
    public readonly options: Partial<SchematicOptions>,
    private readonly schematics: NgjsConfig["schematics"],
    public readonly dryRun: boolean,
    public readonly force: boolean,
  ) {
    super();
  }

  static async create({ schematic, name, path, dryRun, force, ...options }: GenerateFlags): Promise<GenerateConfig> {
    const config = await this.read();
    return new GenerateConfig(
      schematic,
      name,
      config.sourceRoot,
      path ?? join(config.sourceRoot, config.projectType === "application" ? "app" : "lib"),
      config.prefix,
      options,
      config.schematics,
      dryRun ?? false,
      force ?? false,
    );
  }

  /** `schematics["@schematics/angular:<kind>"]` de `ngjs.json` — los defaults del proyecto para ese schematic. */
  configuredOptions(kind: SchematicKind): Record<string, unknown> | undefined {
    return this.schematics?.[`@schematics/angular:${kind}`];
  }
}
