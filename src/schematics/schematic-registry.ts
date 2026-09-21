import { ComponentTemplate } from "@/schematics/component-template.ts";
import { DirectiveTemplate } from "@/schematics/directive-template.ts";
import { ModuleTemplate } from "@/schematics/module-template.ts";
import { PipeTemplate } from "@/schematics/pipe-template.ts";
import { ServiceTemplate } from "@/schematics/service-template.ts";

export interface SchematicContext {
  prefix: string;
  scoped: boolean;
}

type Schematic = (name: string, dir: string, context: SchematicContext) => Promise<void>;

/** Diccionario cerrado — sin soporte para schematics de terceros, esto es todo lo que hay. */
export const SCHEMATICS: Record<string, Schematic> = {
  component: (name, dir, ctx) => ComponentTemplate.from(name, ctx.prefix).write(dir),
  c: (name, dir, ctx) => ComponentTemplate.from(name, ctx.prefix).write(dir),
  directive: (name, dir, ctx) => DirectiveTemplate.from(name, ctx.prefix).write(dir),
  d: (name, dir, ctx) => DirectiveTemplate.from(name, ctx.prefix).write(dir),
  pipe: (name, dir) => PipeTemplate.from(name).write(dir),
  p: (name, dir) => PipeTemplate.from(name).write(dir),
  service: (name, dir, ctx) => ServiceTemplate.from(name, ctx.scoped).write(dir),
  s: (name, dir, ctx) => ServiceTemplate.from(name, ctx.scoped).write(dir),
  module: (name, dir) => ModuleTemplate.from(name).write(dir),
  m: (name, dir) => ModuleTemplate.from(name).write(dir),
};
