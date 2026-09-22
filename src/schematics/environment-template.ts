import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Par `environment.ts` / `environment.prod.ts` que `new` deja listo en
 * `src/environments/` — el swap entre ambos es lo que arma
 * `configurations.production.fileReplacements` en el `ngjs.json` generado.
 */
export class EnvironmentTemplate {
  private constructor(
    public readonly fileName: string,
    public readonly production: boolean,
  ) {}

  static development(): EnvironmentTemplate {
    return new EnvironmentTemplate("environment.ts", false);
  }

  static production(): EnvironmentTemplate {
    return new EnvironmentTemplate("environment.prod.ts", true);
  }

  toString(): string {
    return `export const environment = {
  production: ${this.production},
};
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, this.fileName), this.toString(), "utf8");
  }
}
