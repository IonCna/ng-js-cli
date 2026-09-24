import { PlatformCode } from "ng-js-compiler";
import { JasmineShim } from "@/test/jasmine-shim.ts";

/**
 * Lo que `ngjs test` carga antes de cada spec — lo que en Angular son los `polyfills` de `ng test` (`zone.js`,
 * `zone.js/testing`) más `initTestEnvironment()`: la plataforma de `ng-js-compiler` con sus parches de zona (el
 * `TestBed` de `ngjs-core` le pasa su `$rootScope`, así el trabajo async termina en un digest como en la app) y la
 * API de Jasmine (`JasmineShim`). El reset de `TestBed` después de cada test lo engancha el propio `TestBed`.
 */
export class TestEnvironment {
  static source(): string {
    return `${PlatformCode.source()}\n${JasmineShim.source()}\n`;
  }
}
