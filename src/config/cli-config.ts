export interface NgjsConfig {
  version: string;
  root: string;
  /**
   * `"library"` (esm+cjs sin bundlear una app, `declarations: true`) vs.
   * `"application"` (consumo final en browser: bundle único + `index.html`,
   * sin `.d.ts`). Determina qué campos de `BuildOptions` aplican.
   */
  projectType: "application" | "library";
  sourceRoot: string;
  /** Prefijo de selector de componentes/directivas — informativo por ahora, sin lint todavía. */
  prefix?: string;
  architect: {
    build: BuildTarget;
    /** Solo tiene sentido para `projectType: "application"` (fase 2, dev-server con Vite + `ng-js-vite`). */
    serve?: ServeTarget;
  };
  /** Mismo `"cli"` de `angular.json` real — hoy solo `defaultCollection`. */
  cli?: {
    /**
     * Nombre de la colección de schematics que usa `generate` — mismo campo que
     * `cli.defaultCollection` de Angular real. `"ng-js-cli"` (default, si falta)
     * → templates planos: clases con `$name`/`ɵcmp`/`ɵdir` a mano, sin decoradores.
     * `"ngjs-core"` → templates con los decoradores reales de `ngjs-core`
     * (`@Component`, `@Directive`, `@Pipe`, `@NgModule`, `@Injectable`). El CLI
     * solo estampa la metadata; el registro en el módulo (`declarations`, etc.)
     * queda manual — `ngjs-core` es quien hace ese trabajo en runtime, no `generate`.
     */
    defaultCollection?: "ng-js-cli" | "ngjs-core";
  };
}

export interface BuildTarget {
  options: BuildOptions;
  /**
   * Sets con nombre que pisan `options` (como `--configuration production`
   * de Angular real, componible: `--configuration staging,es-MX`). Acá vive
   * "environments": un `fileReplacements` puesto en `configurations.production`
   * es la forma de swappear `environment.ts` → `environment.prod.ts`.
   */
  configurations?: Record<string, Partial<BuildOptions>>;
}

export interface BuildOptions {
  /** Clave = ruta de salida bajo `outputPath` (sin extensión); valor = entry point fuente. */
  entryPoints: Record<string, string>;
  outputPath: string;
  /** Paquetes que no se bundlean (quedan como `import`/`require` externos). */
  external?: string[];
  sourceMap?: boolean;
  optimization?: boolean | { scripts?: boolean; styles?: boolean };
  /** Swap de archivos por configuration — la pieza de "environments". */
  fileReplacements?: FileReplacement[];
  /** Solo `projectType: "library"` — además del bundle, corre `tsc` para `.d.ts`. */
  declarations?: boolean;
  /** `.html` importado como string en vez de resuelto por `ng-js-vite` (proyectos sin dev-server Vite). */
  htmlLoader?: boolean;

  // --- Solo `projectType: "application"` (consumo final en browser) ---
  index?: { input: string; output?: string };
  assets?: AssetGlob[];
  styles?: StyleEntry[];
  scripts?: StyleEntry[];
  budgets?: Budget[];
}

export interface FileReplacement {
  replace: string;
  with: string;
}

export interface AssetGlob {
  glob: string;
  input: string;
  output: string;
  ignore?: string[];
}

export interface StyleEntry {
  input: string;
  bundleName?: string;
  inject?: boolean;
}

export interface Budget {
  type: "initial" | "bundle" | "any";
  maximumWarning?: string;
  maximumError?: string;
}

export interface ServeTarget {
  options?: { port?: number; allowedHosts?: string[] };
  configurations?: Record<string, Partial<NonNullable<ServeTarget["options"]>>>;
}