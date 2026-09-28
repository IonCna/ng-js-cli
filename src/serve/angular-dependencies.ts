import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";

interface PackageJson {
  main?: string;
  module?: string;
  exports?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/**
 * `optimizeDeps.include` del dev-server: `angular` y toda dependencia que lo importe (`@uirouter/angularjs`,
 * `angular-translate`, …), también las de librerías enlazadas (`link:ngjs-core` → `"ngjs-core > @uirouter/angularjs"`).
 *
 * Por qué: Vite 8 pre-bundlea con rolldown, que al optimizar `angular` junto a una dependencia que lo requiere mueve
 * helpers compartidos (`__toESM`, `require_angular`) a `angular.js` como exports extra. Si esa dependencia se
 * descubre a mitad de sesión (un import nuevo, o un caché de `.vite` de antes), Vite re-optimiza pero decide si
 * recargar mirando solo los `imports` de cada dep ya optimizada, no sus exports: conserva el `?v=` de `angular.js` y
 * el navegador sigue con la versión vieja (cacheada `immutable`) — "does not provide an export named 'n'", aun
 * recargando. Optimizándolas todas desde el arranque, `angular.js` ya sale con su forma final.
 */
export class AngularDependencies {
  private readonly include = new Set<string>(["angular"]);
  private readonly visited = new Set<string>();

  private constructor() {}

  static include(root = process.cwd()): string[] {
    const dependencies = new AngularDependencies();
    dependencies.collect(root, []);
    return [...dependencies.include];
  }

  /** `dir`: el proyecto o una librería enlazada; `chain`: cómo llegar a ella desde el proyecto (sintaxis `a > b`). */
  private collect(dir: string, chain: string[]): void {
    if (!existsSync(dir)) return;
    const real = realpathSync(dir);
    if (this.visited.has(real)) return;
    this.visited.add(real);

    const pkg = AngularDependencies.read(join(dir, "package.json"));
    if (!pkg) return;
    const names = Object.keys({ ...pkg.dependencies, ...(chain.length ? {} : pkg.devDependencies), ...pkg.peerDependencies });

    for (const name of names) {
      const packageDir = join(dir, "node_modules", name);
      const dependency = AngularDependencies.read(join(packageDir, "package.json"));
      if (!dependency || name === "angular") continue;

      // Enlazada (`link:`): Vite la sirve como fuente, no la pre-bundlea — pero sus dependencias sí.
      if (!realpathSync(packageDir).split(sep).includes("node_modules")) {
        this.collect(packageDir, [...chain, name]);
        continue;
      }
      if (AngularDependencies.requiresAngular(dependency)) this.include.add([...chain, name].join(" > "));
    }
  }

  private static requiresAngular(pkg: PackageJson): boolean {
    const hasEntry = Boolean(pkg.main || pkg.module || pkg.exports);
    return hasEntry && Boolean(pkg.dependencies?.angular || pkg.peerDependencies?.angular);
  }

  private static read(path: string): PackageJson | undefined {
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
    } catch {
      return undefined;
    }
  }
}
