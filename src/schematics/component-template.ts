import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class ComponentTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    /** Nombre de registro en AngularJS (`appCard`) — usado sin `core` (`$name`); con `core`, `ngjs-core` lo deriva del selector. */
    public readonly registerName: string,
    /** Selector CSS real (`app-card`) — el que entiende `@Component` de `ngjs-core`. */
    public readonly selector: string,
    public readonly core: boolean,
  ) {}

  static from(name: string, prefix = "app", core = false): ComponentTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    const selector = `${prefix}-${fileBase}`;
    return new ComponentTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Component`, CaseTransform.toCamelCase(selector), selector, core);
  }

  toString(): string {
    return this.core ? this.toCoreString() : this.toPlainString();
  }

  /** Con `core`: decorador real de `ngjs-core` — sin `$name`/`ɵcmp` a mano, `component()` los deriva del selector. */
  private toCoreString(): string {
    return `import { Component } from "ngjs-core";

@Component({
  selector: "${this.selector}",
  templateUrl: "./${this.fileBase}.component.html",
  styleUrl: "./${this.fileBase}.component.css",
})
export class ${this.className} {}
`;
  }

  private toPlainString(): string {
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
