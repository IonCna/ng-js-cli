import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class ModuleTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    public readonly core: boolean,
  ) {}

  static from(name: string, core = false): ModuleTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new ModuleTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Module`, core);
  }

  toString(): string {
    return this.core ? this.toCoreString() : this.toPlainString();
  }

  /** Con `core`: `declarations`/`imports` quedan vacíos para completar a mano — `generate` no auto-registra en modo core (ver `generate-command.ts`). */
  private toCoreString(): string {
    return `import { NgModule } from "ngjs-core";

@NgModule({
  declarations: [],
  imports: [],
})
export class ${this.className} {}
`;
  }

  private toPlainString(): string {
    return `import angular from "angular";

export class ${this.className} {
  static $name = "${this.className}";
  static ɵmod = angular.module(${this.className}.$name, []);
}
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.module.ts`), this.toString(), "utf8");
  }
}
