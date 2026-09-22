# Roadmap

Leyenda: ✅ cerrado · 🚧 en progreso · ⬜ no empezado.

## El objetivo real: `migrate`

`ng-js-cli` no es decoración permanente de AngularJS — el punto final es un comando
`migrate` que ejecuta el salto real: toma lo que ya está escrito con sintaxis de
Angular real (decoradores), desinstala `ngb-js`/todo lo puente, e instala Angular
real (14/16). Cuando ese comando exista y corra, la migración terminó: no queda
reescritura pendiente, solo el swap de paquetes.

**Consecuencia para priorizar todo lo demás:** lo que acerca a `migrate` (cobertura
del compilador, fidelidad `ngjs.json` ↔ `angular.json`) importa más que pulir el
CLI para que "se parezca más" a Angular por parecerse (`--version`, shell
completion, etc.) — ver [[project_ngjs_migration_bridge_goal]] en la memoria del
usuario.

## ✅ Separación de responsabilidades entre repos

Cerrado en esta sesión — ver [[project_ngjs_repo_responsibilities]]:

- **`ng-js-cli`** — orquestador puro: `new`/`generate`/`build`/`serve`/`config`.
  Sin decoradores ni template scoping adentro.
- **`plugins/ng-js-compiler`** — el compilador de verdad: `@Component`/`@Directive`/
  `@Pipe`/`@Injectable`/`@NgModule` → AngularJS nativo y final (`angular.module(id,
  imports).component()/.directive()/.filter()/.service()`), texto literal, sin
  runtime propio. `ApplicationScanner` hace la resolución en DOS pasadas (lee todo
  el proyecto antes de emitir nada) para poder resolver `declarations`/`imports`
  de un `@NgModule` sin importar en qué archivo vive cada clase ni el orden de
  compilación. Expone `.` (core, agnóstico de build tool), `/esbuild`, `/vite`.
- **`plugins/ng-js-vite`** — reestructurado: sin `.` ni `./core` genéricos, expone
  `/vite` (el plugin de Vite) y `/esbuild` (scoping de template para `ng-js-cli`
  build — antes era el paquete aparte `ng-js-template-plugin`, ahora fusionado
  acá). Ninguno de los dos depende del otro paquete por tipos que no necesita.
- **Modo "sin core" eliminado.** `generate` tiene una sola salida (decoradores
  reales) — no hay más `cli.defaultCollection` que elegir. Se cayó con esto:
  `ModuleRegistrar` (registro por chain-calls de AngularJS, texto sobre
  `ɵmod`/`ɵcmp` a mano) y el flag `--scoped` (ya estaba muerto en los dos modos).

## ⬜ Precondiciones de `migrate`

- [x] **Auto-registro en `generate`.** `ModuleRegistrar` (reescrito sobre el
      `@NgModule({...})`, no chain-calls) hace lo que hace el `ng generate` de
      Angular: component/directive/pipe van a `declarations` del `*.module.ts`
      más cercano (subiendo hasta `sourceRoot`, ignorando `-routing.module.ts`)
      con su `import`; falla antes de escribir si no hay módulo o si hay más de
      uno en la misma carpeta. Un `module` nuevo solo va a `imports` de otro con
      `--module <path>`. `--skip-import` no registra. Service/class/guard/etc.
      no se registran (service: `providers` todavía no lo traduce el compilador).
- [ ] **Cobertura del compilador — gaps encontrados probando "¿qué pasa si le doy
      Angular real tal cual?"**:
  - `providers`/`bootstrap` de `@NgModule` no se traducen (solo `declarations`/
    `imports`).
  - Componentes standalone (sin `@NgModule` que los declare) nunca se registran.
  - Selectores compuestos (`button[foo]`, `a, b`) tiran error — `SelectorParser`
    solo soporta tag simple o `[atributo]` simple.
  - `@HostBinding`/`@HostListener` se leen (`DecoratorReader`) pero no se
    traducen a nada funcional en el registro final.
  - Lifecycle hooks (`ngOnInit`, etc.) no se traducen a `$onInit`/etc. de
    AngularJS.
  - Sin DI avanzada (`inject()`, Router, Forms, HttpClient, RxJS) — fuera de
    alcance del compilador tal como está pensado (es "registro AngularJS", no
    un framework).
- [x] **Más schematics.** `generate` cubre component/directive/pipe/service/module +
      class/interface/enum (TS plano) + guard/resolver (funcionales, `CanActivateFn`/
      `ResolveFn` de `ngjs-core/router`) + interceptor (clase, `implements
      HttpInterceptor` de la raíz `ngjs-core` — sin subpath propio para http).
      Aliases: `cl`/`i`/`e`/`g`/`r`/`itc`.
- [ ] **Inventario de "qué es puente / qué es Angular real."** No hay ningún
      marcador hoy que diga "esto lo instala `migrate`" vs "esto lo desinstala
      `migrate`" — ni a nivel paquete (`ngb-js`) ni a nivel archivo.
- [x] **Fidelidad `ngjs.json` ↔ `angular.json` real**: `architect.build.
      configurations`, `fileReplacements` para environments.

## 🐛 Bug conocido (no roadmap — arreglo suelto, aparte)

- **`--configuration` no es componible.** El comentario en `cli-config.ts`
  (`BuildTarget.configurations`) promete `--configuration staging,es-MX` al
  estilo Angular real, pero `build-config.ts` hace un lookup de UN solo nombre
  (`configurations?.[flags.configuration]`) — pasar una lista separada por comas
  busca esa key literal y no matchea nada.

## ⬜ Parecido a Angular CLI — housekeeping, prioridad baja

No bloquean `migrate`, son pulido de CLI:

- `--version` / `-V` (`program` no tiene `.version(...)`).
- `.description(...)` por comando (hoy `--help` no explica qué hace cada uno).
- `"$schema"` en `ngjs.json` (ya existe el zod schema en `ngjs-config-schema.ts`,
  falta exportarlo a JSON Schema).
- `ConfigReader.read()` solo mira `process.cwd()` — Angular real sube el árbol
  de directorios hasta encontrar `angular.json`.
- `--dry-run` en `generate`/`new`.
- `--flat` en `generate` (hoy siempre crea carpeta propia por schematic).
- Generación de `.spec.ts` por schematic (Angular real lo hace por default).
- `ng test` / `ng lint` / `ng add` / `ng update` — sin equivalente.
- Multi-proyecto (`angular.json` soporta varios `projects`; `ngjs.json` es de
  un solo proyecto) — la brecha estructural más grande si algún día hay
  monorepo con más de una app/lib.
