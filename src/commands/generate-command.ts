import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import { GenerateConfig } from "@/config/generate-config.ts";
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
    await mkdir(dir, { recursive: true });

    // El registro en el módulo (`declarations`/`imports` del `@NgModule`) queda manual —
    // el CLI solo estampa la clase con su decorador, ver `docs/ROADMAP.md`.
    await schematic.generate(name, dir, { prefix: this.config.prefix });
  }

  /** `feature/card` → escribe en `<sourceRoot>/feature`, con nombre base `card`. */
  private resolveTarget(): { dir: string; name: string } {
    const segments = this.config.name.split("/");
    const name = segments.pop()!;
    return { dir: join(this.config.sourceRoot, ...segments), name };
  }
}

/** Lo que `commander` invoca en `.action(...)` — todo lo que necesita para registrar el comando vive acá al lado. */
export async function runGenerateCommand(schematic: string, name: string): Promise<void> {
  const config = await GenerateConfig.create({ schematic, name });
  const cmd = GenerateCommand.from(config);
  await cmd.run();
}

export const generateCommandDefinition = {
  name: "generate",
  alias: "g",
};
