import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import type { NgjsConfig } from "@/config/cli-config.ts";
import { NewConfig, type NewFlags } from "@/config/new-config.ts";
import { EnvironmentTemplate } from "@/schematics/environment-template.ts";

const ENVIRONMENTS_DIR = join("src", "environments");

export class NewCommand extends NgjsCommand<NewConfig> {
  static from(config: NewConfig): NewCommand {
    return new NewCommand(config);
  }

  async run(): Promise<void> {
    const path = join(process.cwd(), "ngjs.json");
    if (existsSync(path)) {
      throw new Error(`Ya existe "ngjs.json" en "${process.cwd()}".`);
    }

    await this.writeEnvironments();
    await writeFile(path, `${JSON.stringify(this.buildConfig(), null, 2)}\n`, "utf8");
  }

  /** `environment.ts` (dev) + `environment.prod.ts` — el par que `configurations.production` swapea. */
  private async writeEnvironments(): Promise<void> {
    await mkdir(ENVIRONMENTS_DIR, { recursive: true });
    await EnvironmentTemplate.development().write(ENVIRONMENTS_DIR);
    await EnvironmentTemplate.production().write(ENVIRONMENTS_DIR);
  }

  private buildConfig(): NgjsConfig {
    return {
      version: "1",
      root: ".",
      projectType: this.config.projectType,
      sourceRoot: "src",
      prefix: "app",
      architect: {
        build: {
          options: {
            entryPoints: { index: "src/index.ts" },
            outputPath: "dist",
          },
          configurations: {
            production: {
              fileReplacements: [{ replace: "src/environments/environment.ts", with: "src/environments/environment.prod.ts" }],
            },
          },
        },
        // `serve` (dev-server Vite) solo aplica a `application` — ver comentario en `ServeTarget`, `cli-config.ts`.
        ...(this.config.projectType === "application" ? { serve: { options: { port: 4200 } } } : {}),
      },
    };
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
