import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class ComponentTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    /** Nombre de registro en AngularJS (`appCard`) — el selector no existe sin core, es su versión camelCase. */
    public readonly registerName: string,
  ) {}

  static from(name: string, prefix = "app"): ComponentTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    const registerName = CaseTransform.toCamelCase(`${prefix}-${fileBase}`);
    return new ComponentTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Component`, registerName);
  }

  toString(): string {
    return `export class ${this.className} {
  static $name = "${this.registerName}";
  static ɵcmp = {
    templateUrl: "./${this.fileBase}.component.html",
    styleUrl: "./${this.fileBase}.component.css",
    controller: ${this.className},
  };
  static $inject = [];
}
`;
  }

  /** Escribe los tres archivos (`.ts`/`.html`/`.css`) en `dir` — `.html`/`.css` salen vacíos. */
  async write(dir: string): Promise<void> {
    await Promise.all([
      writeFile(join(dir, `${this.fileBase}.component.ts`), this.toString(), "utf8"),
      writeFile(join(dir, `${this.fileBase}.component.html`), "", "utf8"),
      writeFile(join(dir, `${this.fileBase}.component.css`), "", "utf8"),
    ]);
  }
}
