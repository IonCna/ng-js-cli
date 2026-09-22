import { z } from "zod";

/**
 * Espejo en zod de `NgjsConfig` (`cli-config.ts`) — única razón de existir es
 * validar el objeto DESPUÉS de un `ngjs config <path> <value>`, así un `set`
 * que rompe la forma del archivo (tipo equivocado, campo que no existe) falla
 * ANTES de escribir a disco. Si `cli-config.ts` cambia, este schema se
 * actualiza junto.
 */
const fileReplacementSchema = z.object({
  replace: z.string(),
  with: z.string(),
});

const assetGlobSchema = z.object({
  glob: z.string(),
  input: z.string(),
  output: z.string(),
  ignore: z.array(z.string()).optional(),
});

const styleEntrySchema = z.object({
  input: z.string(),
  bundleName: z.string().optional(),
  inject: z.boolean().optional(),
});

const budgetSchema = z.object({
  type: z.enum(["initial", "bundle", "any"]),
  maximumWarning: z.string().optional(),
  maximumError: z.string().optional(),
});

const buildOptionsSchema = z.object({
  entryPoints: z.record(z.string(), z.string()),
  outputPath: z.string(),
  external: z.array(z.string()).optional(),
  sourceMap: z.boolean().optional(),
  optimization: z.union([z.boolean(), z.object({ scripts: z.boolean().optional(), styles: z.boolean().optional() })]).optional(),
  fileReplacements: z.array(fileReplacementSchema).optional(),
  declarations: z.boolean().optional(),
  htmlLoader: z.boolean().optional(),
  index: z.object({ input: z.string(), output: z.string().optional() }).optional(),
  assets: z.array(assetGlobSchema).optional(),
  styles: z.array(styleEntrySchema).optional(),
  scripts: z.array(styleEntrySchema).optional(),
  budgets: z.array(budgetSchema).optional(),
});

const buildTargetSchema = z.object({
  options: buildOptionsSchema,
  configurations: z.record(z.string(), buildOptionsSchema.partial()).optional(),
});

const serveTargetOptionsSchema = z.object({
  port: z.number().optional(),
  allowedHosts: z.array(z.string()).optional(),
});

const serveTargetSchema = z.object({
  options: serveTargetOptionsSchema.optional(),
  configurations: z.record(z.string(), serveTargetOptionsSchema.partial()).optional(),
});

export const ngjsConfigSchema = z.object({
  version: z.string(),
  root: z.string(),
  projectType: z.enum(["application", "library"]),
  sourceRoot: z.string(),
  prefix: z.string().optional(),
  architect: z.object({
    build: buildTargetSchema,
    serve: serveTargetSchema.optional(),
  }),
});
