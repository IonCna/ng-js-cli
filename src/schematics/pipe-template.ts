import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class PipeTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    public readonly pipeName: string,
  ) {}

  static from(name: string): PipeTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new PipeTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Pipe`, CaseTransform.toCamelCase(name));
  }

  toString(): string {
    return `export class ${this.className} {
  static $name = "${this.pipeName}";

  static transform = (() => {
    const _ = () => (value: unknown): unknown => value;
    _.$inject = [] as string[];
    return _;
  })();
}
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.pipe.ts`), this.toString(), "utf8");
  }
}
