import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

/**
 * `@Service()` (default) = el equivalente de `ngjs-core` a
 * `@Injectable({ providedIn: 'root' })` de Angular real — auto-registrado,
 * sin `providers`. `--scoped` = `@Injectable()` a secas, igual que Angular
 * cuando NO se auto-registra en root: necesita `providers: [...]` a mano.
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
    const decorator = this.scoped ? "Injectable" : "Service";
    return `import { ${decorator} } from "ngjs-core";

@${decorator}()
export class ${this.className} {}
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.service.ts`), this.toString(), "utf8");
  }
}
