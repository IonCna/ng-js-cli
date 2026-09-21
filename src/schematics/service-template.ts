import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

/**
 * v1 sin `ngjs-core`: clase plana con `$name` estático, sin decorador — por
 * eso `scoped` (`@Service()` vs `@Injectable()`) todavía no cambia la salida.
 */
export class ServiceTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    public readonly scoped: boolean,
  ) {}

  static from(name: string, scoped = false): ServiceTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new ServiceTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Service`, scoped);
  }

  toString(): string {
    return `export class ${this.className} {
  static $name = "${this.className}";
  static $inject = [];
}
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.service.ts`), this.toString(), "utf8");
  }
}
