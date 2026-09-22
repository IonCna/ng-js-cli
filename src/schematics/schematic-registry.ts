import { ComponentTemplate } from "@/schematics/component-template.ts";
import { DirectiveTemplate } from "@/schematics/directive-template.ts";
import { ModuleTemplate } from "@/schematics/module-template.ts";
import { PipeTemplate } from "@/schematics/pipe-template.ts";
import { ServiceTemplate } from "@/schematics/service-template.ts";

export interface SchematicContext {
  prefix: string;
  scoped: boolean;
  /** `ngjs.json` → `schematics["*"|kind].core`, ya resuelto — ver `SchematicOptions` en `cli-config.ts`. */
  core: boolean;
}

export type SchematicKind = "component" | "directive" | "pipe" | "service" | "module";

/** Lo que `ModuleRegistrar` necesita para registrar lo recién generado — `fileName` va sin extensión (`card.component`). */
export interface GeneratedSchematic {
  kind: SchematicKind;
  className: string;
  fileName: string;
}

type Schematic = (name: string, dir: string, context: SchematicContext) => Promise<GeneratedSchematic>;

/** Diccionario cerrado — sin soporte para schematics de terceros, esto es todo lo que hay. */
const SCHEMATICS: Record<SchematicKind, Schematic> = {
  component: async (name, dir, ctx) => {
    const template = ComponentTemplate.from(name, ctx.prefix, ctx.core);
    await template.write(dir);
    return { kind: "component", className: template.className, fileName: `${template.fileBase}.component` };
  },
  directive: async (name, dir, ctx) => {
    const template = DirectiveTemplate.from(name, ctx.prefix, ctx.core);
    await template.write(dir);
    return { kind: "directive", className: template.className, fileName: `${template.fileBase}.directive` };
  },
  pipe: async (name, dir, ctx) => {
    const template = PipeTemplate.from(name, ctx.core);
    await template.write(dir);
    return { kind: "pipe", className: template.className, fileName: `${template.fileBase}.pipe` };
  },
  service: async (name, dir, ctx) => {
    const template = ServiceTemplate.from(name, ctx.scoped, ctx.core);
    await template.write(dir);
    return { kind: "service", className: template.className, fileName: `${template.fileBase}.service` };
  },
  module: async (name, dir, ctx) => {
    const template = ModuleTemplate.from(name, ctx.core);
    await template.write(dir);
    return { kind: "module", className: template.className, fileName: `${template.fileBase}.module` };
  },
};

const ALIASES: Record<string, SchematicKind> = { c: "component", d: "directive", p: "pipe", s: "service", m: "module" };

/** Acepta el nombre completo (`component`) o su alias (`c`); `undefined` si no existe. */
export function resolveSchematic(key: string): { kind: SchematicKind; generate: Schematic } | undefined {
  const kind = ALIASES[key] ?? (key in SCHEMATICS ? (key as SchematicKind) : undefined);
  return kind ? { kind, generate: SCHEMATICS[kind] } : undefined;
}
