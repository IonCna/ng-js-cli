import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import { ConfigConfig, type ConfigFlags } from "@/config/config-command-config.ts";
import { ngjsConfigSchema } from "@/config/ngjs-config-schema.ts";

type JsonObject = Record<string, unknown>;

export class ConfigCommand extends NgjsCommand<ConfigConfig> {
  static from(config: ConfigConfig): ConfigCommand {
    return new ConfigCommand(config);
  }

  async run(): Promise<void> {
    if (this.config.rawValue === undefined) {
      this.get();
    } else {
      await this.set(this.config.rawValue);
    }
  }

  private get(): void {
    const value = this.navigate(this.config.config as unknown as JsonObject, this.config.segments);
    console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  }

  private async set(rawValue: string): Promise<void> {
    // Clon profundo: el `NgjsConfig` en `this.config.config` no se toca hasta confirmar
    // que el resultado final pasa el schema — un `set` inválido no deja el objeto a medio mutar.
    const draft = structuredClone(this.config.config) as unknown as JsonObject;
    const value = this.parseValue(rawValue);
    this.write(draft, this.config.segments, value);

    const result = ngjsConfigSchema.safeParse(draft);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
      throw new Error(`El valor deja "ngjs.json" inválido — ${issues}`);
    }

    const path = join(process.cwd(), "ngjs.json");
    await writeFile(path, `${JSON.stringify(result.data, null, 2)}\n`, "utf8");
  }

  /** `JSON.parse` cubre boolean/number/array/object; si no parsea (ej. `dist2`), se guarda como string tal cual. */
  private parseValue(rawValue: string): unknown {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue;
    }
  }

  private navigate(root: JsonObject, segments: string[]): unknown {
    let current: unknown = root;
    for (const segment of segments) {
      if (typeof current !== "object" || current === null || !(segment in current)) {
        throw new Error(`No existe "${segments.join(".")}" en "ngjs.json".`);
      }
      current = (current as JsonObject)[segment];
    }
    return current;
  }

  private write(root: JsonObject, segments: string[], value: unknown): void {
    let current = root;
    for (const segment of segments.slice(0, -1)) {
      const next = current[segment];
      if (typeof next !== "object" || next === null) {
        current[segment] = {};
      }
      current = current[segment] as JsonObject;
    }
    current[segments[segments.length - 1]!] = value;
  }
}

/** Lo que `commander` invoca en `.action(...)` — todo lo que necesita para registrar el comando vive acá al lado. */
export async function runConfigCommand(path: string, value: string | undefined): Promise<void> {
  const flags: ConfigFlags = { path, value };
  const config = await ConfigConfig.create(flags);
  const cmd = ConfigCommand.from(config);
  await cmd.run();
}

export const configCommandDefinition = {
  name: "config",
  alias: "c",
};
