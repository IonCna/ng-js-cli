import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class InterfaceTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly interfaceName: string,
  ) {}

  static from(name: string): InterfaceTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new InterfaceTemplate(fileBase, CaseTransform.toPascalCase(name));
  }

  toString(): string {
    return `export interface ${this.interfaceName} {}\n`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.ts`), this.toString(), "utf8");
  }
}
