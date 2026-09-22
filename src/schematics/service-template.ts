import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class ServiceTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
  ) {}

  static from(name: string): ServiceTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new ServiceTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Service`);
  }

  toString(): string {
    return `import { Injectable } from "ngjs-core";

@Injectable()
export class ${this.className} {}
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.service.ts`), this.toString(), "utf8");
  }
}
