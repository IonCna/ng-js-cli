import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import type { NgjsConfig } from "@/config/cli-config.ts";
import { NewConfig, type NewFlags } from "@/config/new-config.ts";

export class NewCommand extends NgjsCommand<NewConfig> {
  static from(config: NewConfig): NewCommand {
    return new NewCommand(config);
  }

  async run(): Promise<void> {
    const path = join(process.cwd(), "ngjs.json");
    if (existsSync(path)) {
      throw new Error(`Ya existe "ngjs.json" en "${process.cwd()}".`);
    }

    const config: NgjsConfig = {
      version: "1",
      root: ".",
      projectType: this.config.projectType,
      sourceRoot: "src",
      architect: {
        build: {
          options: {
            entryPoints: { index: "src/index.ts" },
            outputPath: "dist",
          },
        },
      },
    };

    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }
}

/** Lo que `commander` invoca en `.action(...)` — todo lo que necesita para registrar el comando vive acá al lado. */
export async function runNewCommand(flags: NewFlags): Promise<void> {
  const config = NewConfig.create(flags);
  const cmd = NewCommand.from(config);
  await cmd.run();
}

export const newCommandDefinition = {
  name: "new",
  alias: "n",
};
