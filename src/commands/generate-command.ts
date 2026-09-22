import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import { GenerateConfig } from "@/config/generate-config.ts";
import { ModuleRegistrar } from "@/schematics/module-registrar.ts";
import { resolveSchematic, type SchematicKind } from "@/schematics/schematic-registry.ts";

export class GenerateCommand extends NgjsCommand<GenerateConfig> {
  static from(config: GenerateConfig): GenerateCommand {
    return new GenerateCommand(config);
  }

  async run(): Promise<void> {
    const schematic = resolveSchematic(this.config.schematic);
    if (!schematic) {
      throw new Error(
        `Schematic desconocido: "${this.config.schematic}" (esperaba component/directive/pipe/service/module/class/interface/enum/guard/resolver/interceptor, o sus alias c/d/p/s/m/cl/i/e/g/r/itc).`,
      );
    }

    const { dir, name } = this.resolveTarget();
    const modulePath = await this.findModule(dir, name, schematic.kind);

    await mkdir(dir, { recursive: true });
    const generated = await schematic.generate(name, dir, { prefix: this.config.prefix });
    if (modulePath) await ModuleRegistrar.register(modulePath, generated, dir);
  }

  /**
   * Se busca ANTES de escribir: si no hay módulo donde registrar, falla sin dejar archivos sueltos.
   * Como `ng generate`: los declarables van al módulo más cercano (o al de `--module`); un `module`
   * nuevo solo se importa en otro si se pasa `--module`.
   */
  private async findModule(dir: string, name: string, kind: SchematicKind): Promise<string | undefined> {
    if (this.config.skipImport || !ModuleRegistrar.propertyFor(kind)) return undefined;
    if (this.config.module) return ModuleRegistrar.locate(this.config.module, dir, this.config.sourceRoot);
    if (kind === "module") return undefined;

    const modulePath = await ModuleRegistrar.find(dir, this.config.sourceRoot);
    if (!modulePath) {
      throw new Error(
        `No se encontró ningún módulo (*.module.ts) desde "${dir}" hasta "${this.config.sourceRoot}" donde registrar "${name}". Usá --skip-import para no registrarlo.`,
      );
    }
    return modulePath;
  }

  /** `feature/card` → escribe en `<sourceRoot>/feature`, con nombre base `card`. */
  private resolveTarget(): { dir: string; name: string } {
    const segments = this.config.name.split("/");
    const name = segments.pop()!;
    return { dir: join(this.config.sourceRoot, ...segments), name };
  }
}

/** Lo que `commander` invoca en `.action(...)` — todo lo que necesita para registrar el comando vive acá al lado. */
export async function runGenerateCommand(
  schematic: string,
  name: string,
  options: { skipImport?: boolean; module?: string },
): Promise<void> {
  const config = await GenerateConfig.create({ schematic, name, skipImport: options.skipImport, module: options.module });
  const cmd = GenerateCommand.from(config);
  await cmd.run();
}

export const generateCommandDefinition = {
  name: "generate",
  alias: "g",
};
