# Roadmap

Leyenda: ✅ cerrado · 🚧 en progreso · ⬜ no empezado.

## El objetivo real: `migrate`

`ng-js-cli` no es decoración permanente de AngularJS — el punto final es un comando
`migrate` que ejecuta el salto real: toma lo que ya está escrito con sintaxis de
Angular real (decoradores), desinstala `ngb-js`/todo lo puente, e instala Angular
real. Cuando ese comando exista y corra, la migración terminó: no queda
reescritura pendiente, solo el swap de paquetes.

**Techo: Angular 16.2 sin signals.** Es el contrato de qué API emula ngjs y el
destino de `migrate`; de ahí en adelante es `ng update` de Angular. Lo que está
arriba del techo (signals, control flow `@if`/`@for`, `@defer`, `@Service` de
Angular 22) no entra.

**Consecuencia para priorizar todo lo demás:** lo que acerca a `migrate` (cobertura
del compilador, fidelidad `ngjs.json` ↔ `angular.json`) importa más que pulir el
CLI para que "se parezca más" a Angular por parecerse (`--version`, shell
completion, etc.) — ver [[project_ngjs_migration_bridge_goal]] en la memoria del
usuario.

## ✅ Separación de responsabilidades entre repos

Ver [[project_ngjs_repo_responsibilities]]:

- **`ng-js-cli`** — orquestador puro: `new`/`generate`/`build`/`serve`/`config`.
  Sin decoradores ni template scoping adentro.
- **`plugins/ng-js-compiler`** — el compilador de verdad: `@Component`/`@Directive`/
  `@Pipe`/`@Injectable`/`@NgModule` → AngularJS nativo y final, texto literal.
  `ApplicationScanner` hace la resolución en DOS pasadas (lee todo el proyecto
  antes de emitir nada). Expone `.`, `/esbuild`, `/vite`. Ver "Compilador sin
  runtime" abajo.
- **`plugins/ng-js-vite`** — expone `/vite` (el plugin de Vite) y `/esbuild`
  (scoping de template / `templateUrl` para `ng-js-cli` build).
- **Modo "sin core" eliminado.** `generate` tiene una sola salida (decoradores
  reales).

## ✅ Compilador sin runtime

El compilado corre sobre AngularJS 1.8.3 solo — no lee nada de `ngjs-core` en
runtime; lo único que lee es lo que el propio compilador estampa. `ngjs-core` es
consumidor de este contrato, no al revés. Probado con tests de integración
(esbuild + jsdom + AngularJS real, sin nada más cargado).

- **Estampado estilo Ivy** (`DecoratorWriter`): `ɵfac` (factory con anotación en
  array de AngularJS y nombres de DI ya resueltos), `ɵprov` (`{ token, providedIn? }`),
  `ɵcmp`/`ɵdir` (`selectors`, `inputs`/`outputs`, `exportAs` con la forma de Ivy),
  `ɵpipe` (`{ name, pure }`), `ɵmod` (`{ id, bootstrap? }`, lo estampa
  `ModuleWriter`). Sin `$name`/`$inject`/`design:paramtypes`.
- **Nombres de DI en build** (`TokenName`): `HashId.readable(símbolo exportado,
  paquete)`, resuelto por el import de cada archivo — sirve igual para clases e
  `InjectionToken`. Parámetro de constructor sin tipo ni `@Inject()` y dos
  clases con el mismo nombre en el proyecto son error en build. Cada dependencia
  del constructor deja un import de efecto de su archivo (equivalente a la
  referencia de valor de Ivy).
- **`declarations`**: solo component/directive/pipe (un servicio ahí es error,
  como Angular).
- **`providers` de `@NgModule`**: clase, `{ provide }`, `useClass`, `useValue`,
  `useFactory` + `deps`, `useExisting`, `multi`, arrays anidados. Último gana;
  mezclar multi/no-multi es error; lo que no se puede leer en build
  (`...spread`, `provideX()`, variable) es error, nunca se descarta.
- **`imports` de `@NgModule`**: `@NgModule` propio (`X.ɵmod.id`, por referencia
  para que el archivo se evalúe), de otro paquete compilado con ngjs (`ɵmod.id`),
  `angular.IModule` legacy (`.name`) y módulos por nombre (`"ngAnimate"`).
  `forRoot()`/`ModuleWithProviders` es error por ahora.
- **Plataforma** (`PlatformCode`): el build deja `globalThis.ɵngjsPlatform =
  { bootstrapModule }` al inicio (esbuild: `banner`; Vite: `<script>` en el
  HTML), solo con `projectType: "application"`. `bootstrapModule(AppModule)` arma
  el módulo raíz: `ɵroot.providers` (los `providedIn: "root"`, que se anotan en
  una cola global al evaluarse) antes que el módulo arrancado, así un provider del
  `@NgModule` pisa al root como en Angular; monta los componentes de `bootstrap`
  y hace `angular.bootstrap`. Sin NgZone ni `APP_INITIALIZER`.
- **`angular`** lo importa el compilado (`import ɵangular from "angular"` en cada
  archivo con `@NgModule`): va dentro del bundle salvo que `ngjs.json` lo liste en
  `external`. `angular@1.8.3` es `peerDependency` de `ng-js-compiler`.

## ⬜ Precondiciones de `migrate`

- [x] **Auto-registro en `generate`.** Como `ng generate`: component/directive/
      pipe van a `declarations` del `*.module.ts` más cercano (subiendo hasta
      `sourceRoot`, ignorando `-routing.module.ts`) con su `import`; falla antes
      de escribir si no hay módulo o si hay más de uno en la misma carpeta. Un
      `module` nuevo solo va a `imports` de otro con `--module <path>`.
      `--skip-import` no registra. Service no se registra en ningún módulo: se
      genera con `@Injectable({ providedIn: "root" })`.
- [ ] **Cobertura del compilador — lo que falta:**
  - `providers` de `@Component`/`@Directive`: se leen pero no se emiten
    (jerárquicos).
  - Componentes standalone (sin `@NgModule` que los declare) nunca se registran.
  - Selectores compuestos (`button[foo]`, `a, b`): `ɵcmp`/`ɵdir` ya los estampan,
    pero `ModuleWriter`/`SelectorParser` solo registran tag simple o
    `[atributo]` simple.
  - `@HostBinding`/`@HostListener` se leen (`DecoratorReader`) pero no se
    traducen a nada funcional.
  - Lifecycle hooks (`ngOnInit`, etc.) no se traducen a `$onInit`/etc. de
    AngularJS.
  - `APP_INITIALIZER` / NgZone en `bootstrapModule`.
  - `ModuleWithProviders` (`forRoot()`/`forChild()`) en `imports`.
  - Sin DI avanzada (`inject()`, Router, Forms, HttpClient, RxJS) — fuera de
    alcance del compilador tal como está pensado.
- [ ] **`ngjs-core` como consumidor del contrato del compilado** (rebuild
      pendiente): su `platformBrowserDynamic` tiene que ser la puerta
      (`() => globalThis.ɵngjsPlatform`), y dejar de resolver en runtime lo que
      ahora resuelve el compilador.
- [x] **Más schematics.** `generate` cubre component/directive/pipe/service/module +
      class/interface/enum (TS plano) + guard/resolver (funcionales, `CanActivateFn`/
      `ResolveFn` de `ngjs-core/router`) + interceptor (clase, `implements
      HttpInterceptor` de la raíz `ngjs-core` — sin subpath propio para http).
      Aliases: `cl`/`i`/`e`/`g`/`r`/`itc`.
- [ ] **Inventario de "qué es puente / qué es Angular real."** No hay ningún
      marcador hoy que diga "esto lo instala `migrate`" vs "esto lo desinstala
      `migrate`" — ni a nivel paquete (`ngb-js`) ni a nivel archivo.
- [x] **Fidelidad `ngjs.json` ↔ `angular.json` real**: `architect.build.
      configurations`, `fileReplacements` para environments, `projectType`
      (`application`/`library`) llega al compilador.

## ✅ Bug suelto: `--configuration` componible

- `--configuration staging,es-MX` aplica cada configuration en orden sobre
  `options` (la última pisa), como Angular real (`BuildConfig.mergeConfigurations`).
  Un nombre que no existe en `configurations` es error, también como Angular real.

## ⬜ Parecido a Angular CLI — housekeeping, prioridad baja

No bloquean `migrate`, son pulido de CLI:

- `--version` / `-V` (`program` no tiene `.version(...)`).
- `.description(...)` por comando (hoy `--help` no explica qué hace cada uno).
- `"$schema"` en `ngjs.json` (ya existe el zod schema en `ngjs-config-schema.ts`,
  falta exportarlo a JSON Schema).
- `ConfigReader.read()` solo mira `process.cwd()` — Angular real sube el árbol
  de directorios hasta encontrar `angular.json`.
- `--dry-run` en `generate`/`new`.
- Carpeta propia por schematic en `generate` (Angular real la crea por default;
  hoy siempre escribe plano, como `--flat`) y `--flat` para volver a lo de hoy.
- Generación de `.spec.ts` por schematic (Angular real lo hace por default).
- `ng test` / `ng lint` / `ng add` / `ng update` — sin equivalente.
- Multi-proyecto (`angular.json` soporta varios `projects`; `ngjs.json` es de
  un solo proyecto) — la brecha estructural más grande si algún día hay
  monorepo con más de una app/lib.
