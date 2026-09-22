import { ClassTemplate } from "@/schematics/class-template.ts";
import { ComponentTemplate } from "@/schematics/component-template.ts";
import { DirectiveTemplate } from "@/schematics/directive-template.ts";
import { EnumTemplate } from "@/schematics/enum-template.ts";
import { GuardTemplate } from "@/schematics/guard-template.ts";
import { InterceptorTemplate } from "@/schematics/interceptor-template.ts";
import { InterfaceTemplate } from "@/schematics/interface-template.ts";
import { ModuleTemplate } from "@/schematics/module-template.ts";
import { PipeTemplate } from "@/schematics/pipe-template.ts";
import { ResolverTemplate } from "@/schematics/resolver-template.ts";
import { ServiceTemplate } from "@/schematics/service-template.ts";

export interface SchematicContext {
  prefix: string;
}

export type SchematicKind =
  | "component"
  | "directive"
  | "pipe"
  | "service"
  | "module"
  | "class"
  | "interface"
  | "enum"
  | "guard"
  | "resolver"
  | "interceptor";

/** `className` = nombre del símbolo principal generado (clase, interfaz, enum, o la función/const de guard/resolver). */
export interface GeneratedSchematic {
  kind: SchematicKind;
  className: string;
  fileName: string;
}

type Schematic = (name: string, dir: string, context: SchematicContext) => Promise<GeneratedSchematic>;

/** Diccionario cerrado — sin soporte para schematics de terceros, esto es todo lo que hay. */
const SCHEMATICS: Record<SchematicKind, Schematic> = {
  component: async (name, dir, ctx) => {
    const template = ComponentTemplate.from(name, ctx.prefix);
    await template.write(dir);
    return { kind: "component", className: template.className, fileName: `${template.fileBase}.component` };
  },
  directive: async (name, dir, ctx) => {
    const template = DirectiveTemplate.from(name, ctx.prefix);
    await template.write(dir);
    return { kind: "directive", className: template.className, fileName: `${template.fileBase}.directive` };
  },
  pipe: async (name, dir) => {
    const template = PipeTemplate.from(name);
    await template.write(dir);
    return { kind: "pipe", className: template.className, fileName: `${template.fileBase}.pipe` };
  },
  service: async (name, dir) => {
    const template = ServiceTemplate.from(name);
    await template.write(dir);
    return { kind: "service", className: template.className, fileName: `${template.fileBase}.service` };
  },
  module: async (name, dir) => {
    const template = ModuleTemplate.from(name);
    await template.write(dir);
    return { kind: "module", className: template.className, fileName: `${template.fileBase}.module` };
  },
  class: async (name, dir) => {
    const template = ClassTemplate.from(name);
    await template.write(dir);
    return { kind: "class", className: template.className, fileName: template.fileBase };
  },
  interface: async (name, dir) => {
    const template = InterfaceTemplate.from(name);
    await template.write(dir);
    return { kind: "interface", className: template.interfaceName, fileName: template.fileBase };
  },
  enum: async (name, dir) => {
    const template = EnumTemplate.from(name);
    await template.write(dir);
    return { kind: "enum", className: template.enumName, fileName: template.fileBase };
  },
  guard: async (name, dir) => {
    const template = GuardTemplate.from(name);
    await template.write(dir);
    return { kind: "guard", className: template.guardName, fileName: `${template.fileBase}.guard` };
  },
  resolver: async (name, dir) => {
    const template = ResolverTemplate.from(name);
    await template.write(dir);
    return { kind: "resolver", className: template.resolverName, fileName: `${template.fileBase}.resolver` };
  },
  interceptor: async (name, dir) => {
    const template = InterceptorTemplate.from(name);
    await template.write(dir);
    return { kind: "interceptor", className: template.className, fileName: `${template.fileBase}.interceptor` };
  },
};

const ALIASES: Record<string, SchematicKind> = {
  c: "component",
  d: "directive",
  p: "pipe",
  s: "service",
  m: "module",
  cl: "class",
  i: "interface",
  e: "enum",
  g: "guard",
  r: "resolver",
  itc: "interceptor",
};

/** Acepta el nombre completo (`component`) o su alias (`c`); `undefined` si no existe. */
export function resolveSchematic(key: string): { kind: SchematicKind; generate: Schematic } | undefined {
  const kind = ALIASES[key] ?? (key in SCHEMATICS ? (key as SchematicKind) : undefined);
  return kind ? { kind, generate: SCHEMATICS[kind] } : undefined;
}
