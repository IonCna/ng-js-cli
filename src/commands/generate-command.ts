import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import { GenerateConfig, type GenerateFlags } from "@/config/generate-config.ts";
import { CaseTransform } from "@/schematics/case-transform.ts";
import { ModuleRegistrar } from "@/schematics/module-registrar.ts";
import { resolveSchematic, type SchematicKind, type SchematicOptions } from "@/schematics/schematic-registry.ts";
import { SpecTemplate } from "@/schematics/spec-template.ts";

export class GenerateCommand extends NgjsCommand<GenerateConfig> {
  static from(config: GenerateConfig): GenerateCommand {
    return new GenerateCommand(config);
  }

  /**
   * Como `ng generate`: arma todos los cambios primero (archivos nuevos + el módulo actualizado) y recién después
   * escribe — un error (módulo que no está, archivo que ya existe) no deja nada a medias. Imprime `CREATE`/`UPDATE`.
   */
  async run(): Promise<void> {
    const schematic = resolveSchematic(this.config.schematic);
    if (!schematic) {
      throw new Error(
        `Schematic desconocido: "${this.config.schematic}" (esperaba component/directive/pipe/service/module/class/interface/enum/guard/resolver/interceptor, o sus alias c/d/p/s/m/cl/i/e/g/r/itc).`,
      );
    }
    const options = schematic.options(this.config.configuredOptions(schematic.kind), this.config.options);

    // `feature/card` → `<path>/feature`, nombre `card`; sin `--flat`, en su propia carpeta (`<path>/feature/card`).
    const segments = this.config.name.split("/");
    const name = segments.pop()!;
    const parentDir = join(this.config.path, ...segments);
    const dir = options.flat ? parentDir : join(parentDir, CaseTransform.toKebabCase(name));

    const modulePath = await this.findModule(dir, schematic.kind, options);
    const generated = schematic.generate(name, options, this.config.prefix);
    const spec = options.skipTests ? undefined : SpecTemplate.for(generated)?.file();

    const changes = [...generated.files, ...(spec ? [spec] : [])].map((file) => ({ path: join(dir, file.name), content: file.content }));
    const existing = changes.filter((change) => existsSync(change.path));
    if (existing.length && !this.config.force) {
      throw new Error(`Ya existe ${existing.map((change) => `"${change.path}"`).join(", ")}. Usá --force para sobrescribir.`);
    }
    if (modulePath) {
      changes.push({
        path: modulePath,
        content: await ModuleRegistrar.register(modulePath, generated, dir, { exported: options.export }),
      });
    }

    for (const change of changes) {
      const action = existsSync(change.path) ? "UPDATE" : "CREATE";
      console.log(`${action} ${relative(process.cwd(), change.path).split(sep).join("/")} (${Buffer.byteLength(change.content)} bytes)`);
      if (this.config.dryRun) continue;
      await mkdir(dirname(change.path), { recursive: true });
      await writeFile(change.path, change.content, "utf8");
    }
    if (this.config.dryRun) console.log(`\nNOTA: con --dry-run no se escribió nada.`);
  }

  /**
   * Como `ng generate`: los declarables van al módulo más cercano (o al de `--module`); un `module` nuevo solo se
   * importa en otro si se pasa `--module`. Se busca hasta la raíz del proyecto.
   */
  private async findModule(dir: string, kind: SchematicKind, options: SchematicOptions): Promise<string | undefined> {
    if (options.skipImport || !ModuleRegistrar.propertyFor(kind)) return undefined;
    if (options.module) return ModuleRegistrar.locate(options.module, this.config.path, this.config.name, process.cwd());
    if (kind === "module") return undefined;

    const modulePath = await ModuleRegistrar.find(dir, process.cwd());
    if (!modulePath) {
      throw new Error(
        `No se encontró ningún módulo (*.module.ts) desde "${dir}" hacia arriba donde registrar "${this.config.name}". Usá --skip-import para no registrarlo.`,
      );
    }
    return modulePath;
  }
}

/** Lo que `commander` invoca en `.action(...)` — todo lo que necesita para registrar el comando vive acá al lado. */
export async function runGenerateCommand(schematic: string, name: string, options: Omit<GenerateFlags, "schematic" | "name">): Promise<void> {
  const config = await GenerateConfig.create({ ...options, schematic, name });
  const cmd = GenerateCommand.from(config);
  await cmd.run();
}

export const generateCommandDefinition = {
  name: "generate",
  alias: "g",
};
