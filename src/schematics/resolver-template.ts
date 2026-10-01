import { CaseTransform } from "@/schematics/case-transform.ts";
import type { GeneratedSchematic } from "@/schematics/schematic-registry.ts";

/** `ResolveFn<T>` — funcional, como Angular 15+ (`ngjs-core/router`, ver `route.ts`). */
export class ResolverTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly resolverName: string,
  ) {}

  static from(name: string): ResolverTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new ResolverTemplate(fileBase, `${CaseTransform.toCamelCase(name)}Resolver`);
  }

  toString(): string {
    return `import type { ActivatedRouteSnapshot, ResolveFn } from "ngjs-core/router";

export const ${this.resolverName}: ResolveFn<unknown> = (route: ActivatedRouteSnapshot) => {
  return null;
};
`;
  }

  generated(): GeneratedSchematic {
    const fileName = `${this.fileBase}.resolver`;
    return { kind: "resolver", className: this.resolverName, fileName, files: [{ name: `${fileName}.ts`, content: this.toString() }] };
  }
}
