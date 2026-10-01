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
  /** Prefijo de selector de componentes/directivas — `ngjs generate` lo usa como Angular; sin él, selector sin prefijo. */
  prefix?: string;
  /**
   * Defaults de `ngjs generate`, como `schematics` de un proyecto en `angular.json`: la clave es
   * `"@schematics/angular:<schematic>"` y el valor, sus opciones (`{ "style": "none", "skipTests": true }`).
   */
  schematics?: Record<string, Record<string, unknown>>;
  architect: {
    build: BuildTarget;
    /** Solo tiene sentido para `projectType: "application"` (fase 2, dev-server con Vite + `ng-js-vite`). */
    serve?: ServeTarget;
    /** `ngjs test` (Vitest + jsdom, specs compilados con `ng-js-compiler`) — todo opcional, como `ng test`. */
    test?: TestTarget;
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
  /**
   * Como Angular 16: hash del contenido en el nombre de lo que emite el build, para que un deploy nuevo no choque con
   * la caché del navegador. `bundles`: los `.js` de entrada y los estilos globales (`main-<hash>.js`); `media`: lo que
   * copian los estilos (`media/<nombre>-<hash>.woff2`); `all`: los dos. Default `none`. Los chunks lazy siempre llevan hash.
   */
  outputHashing?: OutputHashing;
  /** Swap de archivos por configuration — la pieza de "environments". */
  fileReplacements?: FileReplacement[];
  /** Solo `projectType: "library"` — además del bundle, corre `tsc` para `.d.ts`. */
  declarations?: boolean;
  /** `.html` importado como string en vez de resuelto por `ng-js-vite` (proyectos sin dev-server Vite). */
  htmlLoader?: boolean;

  // --- Solo `projectType: "application"` (consumo final en browser) ---
  index?: { input: string; output?: string };
  /**
   * Como `deployUrl` de Angular: URL (absoluta o de origen, `/Client/dist/`) donde quedan publicados los archivos del
   * build, aparte del `<base href>` que usa el router. Prefija los `<script>`/`<link>` del `index.html` y los
   * `templateUrl` de los componentes; sin él, todo queda relativo al `<base href>`.
   */
  deployUrl?: string;
  /**
   * Archivos estáticos, como Angular 16: `"src/assets"`/`"src/favicon.ico"` (dentro de `sourceRoot`, se publican con
   * su ruta desde ahí) o `{ glob, input, output, ignore? }`. `build` los copia a `outputPath`; `serve` los sirve.
   */
  assets?: (string | AssetGlob)[];
  /** Estilos globales, como Angular real: `"src/styles.css"` o `{ input, bundleName?, inject? }`. También en `serve`. */
  styles?: (string | StyleEntry)[];
  scripts?: StyleEntry[];
  budgets?: Budget[];
}

export type OutputHashing = "none" | "all" | "media" | "bundles";

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
export interface TestTarget {
  options?: TestOptions;
}

export interface TestOptions {
  /** Globs de specs, relativos a la raíz del proyecto. Default: todos los `.spec.ts` bajo `sourceRoot`. */
  include?: string[];
  exclude?: string[];
  /** Archivos que corren antes de cada spec, después del entorno de `ngjs test` (el `src/test.ts` de Angular). */
  setupFiles?: string[];
  /** Default `true`, como `ng test`; `--no-watch` lo apaga. */
  watch?: boolean;
  /** Como en `build`: `environment.ts` → `environment.test.ts` (el `fileReplacements` del builder de `ng test`). */
  fileReplacements?: FileReplacement[];
}
