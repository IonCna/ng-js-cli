import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import { GenerateConfig } from "@/config/generate-config.ts";
import { ModuleRegistrar } from "@/schematics/module-registrar.ts";
import { resolveSchematic } from "@/schematics/schematic-registry.ts";

export class GenerateCommand extends NgjsCommand<GenerateConfig> {
  static from(config: GenerateConfig): GenerateCommand {
    return new GenerateCommand(config);
  }

  async run(): Promise<void> {
    const schematic = resolveSchematic(this.config.schematic);
    if (!schematic) {
      throw new Error(
        `Schematic desconocido: "${this.config.schematic}" (esperaba component/directive/pipe/service/module, o sus alias c/d/p/s/m).`,
      );
    }

    const { dir, name } = this.resolveTarget();

    // Se busca ANTES de escribir: si no hay módulo donde registrar, falla sin dejar archivos sueltos.
    // Un `module` nuevo puede ser el primero del proyecto — sin padre no hay a quién registrarlo, y no es error.
    const modulePath = await ModuleRegistrar.find(dir, this.config.sourceRoot);
    if (!modulePath && schematic.kind !== "module") {
      throw new Error(
        `No se encontró ningún módulo (*.module.ts) desde "${dir}" hasta "${this.config.sourceRoot}" donde registrar "${name}".`,
      );
    }

    await mkdir(dir, { recursive: true });
    const generated = await schematic.generate(name, dir, { prefix: this.config.prefix, scoped: this.config.scoped });
    if (modulePath) await ModuleRegistrar.register(modulePath, generated, dir);
  }

  /** `feature/card` → escribe en `<sourceRoot>/feature`, con nombre base `card`. */
  private resolveTarget(): { dir: string; name: string } {
    const segments = this.config.name.split("/");
    const name = segments.pop()!;
    return { dir: join(this.config.sourceRoot, ...segments), name };
  }
}

/** Lo que `commander` invoca en `.action(...)` — todo lo que necesita para registrar el comando vive acá al lado. */
export async function runGenerateCommand(schematic: string, name: string, options: { scoped?: boolean }): Promise<void> {
  const config = await GenerateConfig.create({ schematic, name, scoped: options.scoped });
  const cmd = GenerateCommand.from(config);
  await cmd.run();
}

export const generateCommandDefinition = {
  name: "generate",
  alias: "g",
};
