import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import { GenerateConfig } from "@/config/generate-config.ts";
import { SCHEMATICS } from "@/schematics/schematic-registry.ts";

export class GenerateCommand extends NgjsCommand<GenerateConfig> {
  static from(config: GenerateConfig): GenerateCommand {
    return new GenerateCommand(config);
  }

  async run(): Promise<void> {
    const generate = SCHEMATICS[this.config.schematic];
    if (!generate) {
      throw new Error(
        `Schematic desconocido: "${this.config.schematic}" (esperaba component/directive/pipe/service, o sus alias c/d/p/s).`,
      );
    }

    const { dir, name } = this.resolveTarget();
    await mkdir(dir, { recursive: true });
    await generate(name, dir, { prefix: this.config.prefix, scoped: this.config.scoped });
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
