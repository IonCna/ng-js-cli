import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class ComponentTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    public readonly selector: string,
  ) {}

  static from(name: string, prefix = "app"): ComponentTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new ComponentTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Component`, `${prefix}-${fileBase}`);
  }

  toString(): string {
    return `import { Component } from "ngjs-core";

@Component({
  selector: "${this.selector}",
  templateUrl: "./${this.fileBase}.component.html",
  styleUrl: "./${this.fileBase}.component.css",
})
export class ${this.className} {}
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
