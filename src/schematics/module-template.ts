import { CaseTransform } from "@/schematics/case-transform.ts";
import type { GeneratedSchematic } from "@/schematics/schematic-registry.ts";

export class ModuleTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
  ) {}

  static from(name: string): ModuleTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new ModuleTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Module`);
  }

  /** `declarations`/`imports` arrancan vacíos — `generate` los va llenando (`ModuleRegistrar`). */
  toString(): string {
    return `import { NgModule } from "ngjs-core";

@NgModule({
  declarations: [],
  imports: [],
})
export class ${this.className} {}
`;
  }

  generated(): GeneratedSchematic {
    const fileName = `${this.fileBase}.module`;
    return { kind: "module", className: this.className, fileName, files: [{ name: `${fileName}.ts`, content: this.toString() }] };
  }
}
