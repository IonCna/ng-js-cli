import { CaseTransform } from "@/schematics/case-transform.ts";
import type { GeneratedSchematic } from "@/schematics/schematic-registry.ts";

/** `CanActivateFn` — funcional, como Angular 15+ (`ngjs-core/router`, ver `route.ts`). */
export class GuardTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly guardName: string,
  ) {}

  static from(name: string): GuardTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new GuardTemplate(fileBase, `${CaseTransform.toCamelCase(name)}Guard`);
  }

  toString(): string {
    return `import type { ActivatedRouteSnapshot, CanActivateFn } from "ngjs-core/router";

export const ${this.guardName}: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  return true;
};
`;
  }

  generated(): GeneratedSchematic {
    const fileName = `${this.fileBase}.guard`;
    return { kind: "guard", className: this.guardName, fileName, files: [{ name: `${fileName}.ts`, content: this.toString() }] };
  }
}
