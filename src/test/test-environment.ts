import { PlatformCode } from "ng-js-compiler";
import { JasmineShim } from "@/test/jasmine-shim.ts";

/**
 * Lo que `ngjs test` carga antes de cada spec — lo que en Angular son los `polyfills` de `ng test` (`zone.js`,
 * `zone.js/testing`) más `initTestEnvironment()`: la plataforma de `ng-js-compiler` con sus parches de zona (el
 * `TestBed` de `ngjs-core` le pasa su `$rootScope`, así el trabajo async termina en un digest como en la app) y la
 * API de Jasmine (`JasmineShim`). El reset de `TestBed` después de cada test lo engancha el propio `TestBed`.
 *
 * `prodMode` (`ngjs test --prod`): el debug info de AngularJS apagado, como lo deja `ngjs build` — para cazar lo que
 * solo se rompe en el build (clases `ng-scope`, `.scope()`, comentarios ancla sin texto). Va como `.config` del módulo
 * `ng`: lo carga cualquier injector (`TestBed`, `angular.mock`, `angular.bootstrap`).
 */
export class TestEnvironment {
  private static readonly PROD_MODE =
    'angular.module("ng").config(["$compileProvider", function ($compileProvider) { $compileProvider.debugInfoEnabled(false); }]);';

  static source(prodMode = false): string {
    const environment = `${PlatformCode.source(prodMode)}\n${JasmineShim.source()}\n`;
    return prodMode ? `import angular from "angular";\n${environment}${TestEnvironment.PROD_MODE}\n` : environment;
  }
}
