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
- **Standalone no se va a soportar.** Todo component/directive/pipe tiene que
  estar en `declarations` de un `@NgModule` — sin eso, `ApplicationScanner`
  nunca lo ve y no se registra, ni es un caso a cubrir más adelante. Angular
  16.2 (el techo de arriba) es la última versión antes de que standalone sea
  default; migrar hacia standalone queda del lado de `ng update` de Angular
  real, después de `migrate`, no de este compilador.
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
  y hace `angular.bootstrap`. `ZonePatchesRuntime` (ver "✅ Patches globales"
  más abajo) se estampa acá también.
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

## ✅ `@HostBinding`/`@HostListener` funcionales

`DecoratorReader` ya leía ambos pero no se traducían a nada — ahora `HostWiring`
(`plugins/ng-js-compiler/src/compiler/host-wiring.ts`) arma el wiring real en el
`ɵfac` de la clase, sin tocar el caso común (una clase sin ninguno de los dos
sigue con el factory de siempre):

- El factory de TODO `@Component`/`@Directive` inyecta `$element`/`$scope` extra
  y envuelve la instancia: `var instance = new X(...); <wiring>; return instance;`
  — siempre, tenga o no la clase `@HostBinding`/`@HostListener`/lifecycle hooks.
  Es gratis (`$compile` ya arma `$element`/`$scope` en `locals` para cualquier
  controller, se pidan o no) y evita tener que detectar de antemano qué necesita
  cada feature que cuelgue de ahí (ver también "Lifecycle hooks" más abajo).
- `@HostBinding`: un `$scope.$watch` por binding, aplicado como Angular real
  (recién en el primer digest, no al construir) — mismo mecanismo que ya usa
  `@Input`. Soporta `class.X`, `attr.X` (semántica de `null`/`false`/`true`),
  `style.X`/`style.X.unit` y propiedad DOM plana (`$element.prop`).
- `@HostListener`: `$element.on(evento, handler)`; el segundo argumento
  (`['$event', '$event.target']`) se lee y valida en `DecoratorReader` — solo
  `$event`/`$event.algo`, cualquier otra cosa es error en build. El handler
  corre con "safe apply" (chequea `$scope.$root.$$phase` antes de
  `$scope.$apply()`, para no chocar con un digest ya en curso).
- `$scope.$on("$destroy", ...)` desregistra todos los `$watch` y saca todos los
  `$element.on` — nada queda colgado después de destruir el scope.

Cubierto con test unitario (`decorator-writer.test.ts`, mocks de
`$element`/`$scope`) y de integración (`angularjs.test.ts`, AngularJS real +
jsdom: click nativo, digest automático, limpieza en `$destroy`).

## ✅ `providers` de `@Component`/`@Directive` (injector jerárquico por elemento)

Se leían (`DecoratorReader`) pero no se emitían — ahora tienen efecto real, aislado
por instancia, no una registración global disfrazada. Nueva pieza,
`plugins/ng-js-compiler/src/compiler/scoped-injector-runtime.ts` +
`scoped-providers.ts`, portando la idea de `ElementInjectorNode`/
`scoped-injector-bridge.ts` de `ngjs-core` — pero sin importar nada de ahí (sigue
"sin runtime propio"): el compilador estampa su propia versión, más simple.

- **`ScopedProviders`**: `ClassName.ɵfac.ɵproviders = [...]` — recetas ya
  resueltas en build (mismo shape que `ModuleWriter.providerCall` usa para
  `@NgModule`), colgadas del MISMO array que ya es `controller:` en
  `ModuleWriter` (`X.ɵfac`) — así el runtime las lee de `expression.ɵproviders`
  sin necesitar un registro de clases por selector/tagName.
- **`ScopedInjectorRuntime`**: una versión chica de `ElementInjectorNode`
  (mapa de singles/multis, `resolve()` sube al padre, cae al `$injector` de la
  app si no hay nada) + un `.decorator("$controller", ...)` que intercepta la
  construcción de CUALQUIER controller, ancla el nodo al elemento vía jqLite
  `$element.data()`/`inheritedData()`, y resuelve el `$inject` de la clase
  contra la cadena de nodos en vez del `$injector` plano. Se estampa como texto
  plano (funciones a nivel de módulo, sin `globalThis`) una sola vez, en el
  archivo del `@NgModule` raíz (el que tiene `bootstrap`) — y **nada** si
  ningún component/directive del proyecto declaró `providers` propios
  (`ApplicationScanner.hasScopedProviders()`, chequeado por `ModuleWriter`).
- **Limpieza**: `$scope.$on("$destroy", ...)` por nodo, mismo patrón que
  `HostWiring`.
- **Alcance de esta vuelta** (decisión explícita, no pendiente):
  - Sin "entornos" de rama lazy (`ngjs-core` los soporta para `loadChildren`
    vía UI-Router) — coincide con que `forRoot()`/`ModuleWithProviders` ya es
    error en build en este compilador.
  - Sin flags de DI (`@Optional`/`@Self`/`@SkipSelf`/`@Host`) — `DecoratorReader`
    no los lee todavía.
  - Sin `registerInstance` (inyectar una directiva/componente ancestro como
    token, `inject(OtroComponente)`) — capability aparte, no pedida acá.
  - `ngOnDestroy` de las instancias del nodo no se llama (depende de que los
    lifecycle hooks estén traducidos, ítem aparte de este roadmap).
- **Nota de diseño**: "¿es este el módulo raíz?" se decide con
  `bootstrap.length > 0` — coincide con el único caso real (`platformBrowserDynamic().bootstrapModule()`
  exige `bootstrap` para montar algo), pero un test/app que llame
  `angular.bootstrap()` a mano sin declarar `bootstrap` en su `@NgModule` no
  activa el injector jerárquico aunque tenga `providers` — hay que declarar
  `bootstrap: [...]` igual que en producción.

Cubierto con tests unitarios (`scoped-providers.test.ts`,
`scoped-injector-runtime.test.ts` con el runtime evaluado en aislado,
`module-writer.test.ts` para el gate de "cuándo se estampa") y de integración
(`angularjs.test.ts`, AngularJS real + jsdom: dos `<app-widget>` hermanos con
`providers: [Logger]` reciben cada uno su propia instancia, y un hijo anidado
sin providers propios hereda la del padre).

## ✅ Lifecycle hooks (`ngOnInit`, `ngOnChanges`, etc.)

Se detectan por NOMBRE de método (no son decoradores — `LifecycleWiring`,
`plugins/ng-js-compiler/src/compiler/lifecycle-wiring.ts`), y se traducen a los
5 hooks nativos de un controller de AngularJS (`$onChanges`/`$onInit`/`$doCheck`/
`$postLink`/`$onDestroy`) con un método de `prototype` puente — el código de la
clase no se toca, `ngOnInit`/etc. quedan 100% Angular real, listos para
`migrate`.

- **Rename directo**: `ngOnInit`→`$onInit`, `ngOnDestroy`→`$onDestroy`.
- **`ngOnChanges`→`$onChanges`**: adaptador de forma — AngularJS entrega
  `changesObj` por **bindingName** con `isFirstChange()` como único método;
  se traduce a un objeto por **propName** (como Angular real) con
  `firstChange` como propiedad **y** `isFirstChange()` como método (las dos
  formas de leerlo en Angular real, para que el código no cambie al migrar).
- **`ngAfterContentInit`/`ngAfterViewInit`→`$postLink`**: aproximado —
  AngularJS no separa contenido de vista, `$postLink` corre una sola vez
  después de linkear (con el contenido transcluido ya adentro). Si la clase
  tiene los dos, se llaman en el orden real de Angular (contenido antes que
  vista).
- **`ngAfterContentChecked`/`ngAfterViewChecked`→`$doCheck`**: sin contraparte
  real, así que se disparan desde `$doCheck` (el único hook nativo que corre
  en cada digest) — **sincrónico**, nunca con `$scope.$evalAsync`. Se probó la
  versión con `$evalAsync` (para diferenciar el timing de `ngDoCheck`) y
  produce `"$digest() iterations reached. Aborting!"` real: `$doCheck` corre
  una vez por cada PASADA INTERNA del loop de `$digest` (no una vez por
  digest lógico), así que encolar algo en `$evalAsync` desde ahí deja la cola
  async no vacía para siempre y el digest nunca estabiliza.
- **`$element`/`$scope` siempre disponibles**: como consecuencia de esto, se
  generalizó `DecoratorWriter.facStatement` — TODO `@Component`/`@Directive`
  inyecta `$element`/`$scope` en su factory ahora (antes era condicional a
  `HostWiring.hasAny()`), ver nota arriba en "Host bindings".

Cubierto con tests unitarios (`lifecycle-wiring.test.ts`, cada hook evaluado en
aislado) y de integración (`angularjs.test.ts`, AngularJS real + jsdom:
`$onChanges` en el primer y segundo digest con valores reales, orden
`onChanges`→`onInit`→`doCheck` en el arranque, `$postLink` una sola vez,
`$onDestroy` real al destruir el scope).

## ✅ Selector compuesto `tag[atributo]` (`button[ngbButtonLabel]`)

AngularJS no sabe matchear "esta directiva solo si el tag es X" a nivel de
registro — `.directive(nombre, factory)` matchea por nombre solo, y el
`controller` declarado en la definición se instancia siempre que matcheó, sin
importar qué devuelva `compile`/`link` (`terminal`/`compile` tampoco sirven
para esto: paran otras directivas del mismo elemento o directivas de menor
prioridad, no evitan que ESTA se instancie).

La solución real: `SelectorParser.parse` ahora reconoce `tag[atributo]` — se
registra bajo el ATRIBUTO (`requiredTag` queda como dato extra) — y
`DecoratorWriter.tagGuardStatement` arma un guard adentro del mismo factory
envuelto que ya usa `HostWiring` (`$element` siempre disponible, ver ✅ arriba):

```js
if ($element[0].tagName.toLowerCase() !== "button") {
  console.warn("X: este selector requiere <button>, no se aplica en <" + $element[0].tagName.toLowerCase() + ">.");
  return {};
}
```

Como el factory (no la clase) es lo que AngularJS invoca para construir, y usa
lo que el factory DEVUELVE como instancia real (`$injector.instantiate`), esto
evita que el constructor de la clase real corra en el tag equivocado — sin
reimplementar `bindToController` a mano. Limitación real y documentada:
`bindToController` sigue posando los bindings sobre el objeto vacío devuelto
(inofensivo, nadie los lee).

Sin valor (`tag[attr=value]`) — queda afuera de este alcance.

Cubierto con tests unitarios (`selector-parser.test.ts`, `decorator-writer.test.ts`)
y de integración (`angularjs.test.ts`: un `<button>` con el atributo activa la
clase real, un `<label>` con el mismo atributo queda inerte sin romper el
resto de la página).

## ✅ Listas de selector por coma (`"[foo], [bar]"`)

`SelectorParser.parse` ahora devuelve un ARRAY (una entrada por alternativa,
separadas por coma) en vez de un selector único — `ɵcmp`/`ɵdir` ya las
estampaban (Ivy, `ivySelectors` en `defStatement`), esto era lo que faltaba
del lado de `ModuleWriter` (a dónde se registra).

- `ModuleWriter.componentCall`/`directiveCall` registran una vez por
  alternativa (`.component()`/`.directive()` con el mismo `controller`/
  `bindings`, solo cambia el nombre) — pero DEDUPLICADAS por
  `registrationName` primero: dos alternativas del mismo atributo con
  distinto tag (`"button[x], label[x]"`) comparten nombre de registro, y
  registrar dos veces bajo el mismo nombre hace que AngularJS tire
  `$compile:multidir` (dos directivas pidiendo el mismo `controllerAs` en el
  mismo elemento) — bug real, se vio correr en el test de integración antes
  de agregar el dedupe.
- **Validar ANTES de deduplicar, no después**: si dos alternativas comparten
  nombre y una es inválida (ej. `"app-card, [appCard]"` para un `@Component`),
  deduplicar primero taparía la inválida con la válida y el error nunca
  saldría. `componentCall` valida las alternativas completas, después
  deduplica para emitir.
- El guard de tag de `DecoratorWriter.tagGuardStatement` (ver ítem anterior)
  ya sabía aceptar la UNIÓN de tags de todas las alternativas que comparten
  `ɵfac` — sin cambios ahí, solo hacía falta que `ModuleWriter` dejara de
  chocar con AngularJS al registrar.
- Alternativa inválida en la lista: el error señala esa alternativa puntual
  (`SelectorParser` parsea cada parte por separado, el mensaje de error usa
  el texto de la parte que falló, no la lista completa).

Sin `tag[attr=value]` — mismo límite que el ítem anterior.

Cubierto con tests unitarios (`selector-parser.test.ts`, `decorator-writer.test.ts`,
`module-writer.test.ts` — incluye el caso de dedupe) y de integración
(`angularjs.test.ts`: `"button[x], label[x]"` activa la misma clase en
cualquiera de los dos tags, sin `$compile:multidir`).

## ✅ Patches globales para digest automático (sin `NgZone`, sin Zone.js real)

"Zone.js dispara `$digest`. No hay OnPush, ni CD por componente, ni scheduler
propio" — esto acerca el comportamiento a Angular real para los casos que
importan de verdad, con monkey-patches puntuales en vez de la maquinaria
completa de Zone.js (fetch/XHR/MutationObserver/WebSocket siguen quedando
afuera, a propósito).

**Este compilador no define ninguna clase `NgZone`.** Solo le importa que el
lado async del navegador dispare un digest — quién lo consuma (una clase con
ese nombre, o directamente el código del dev) es indistinto acá.

`plugins/ng-js-compiler/src/compiler/zone-patches-runtime.ts`
(`ZonePatchesRuntime`), estampado junto a `PlatformCode` (mismo gate:
`projectType: "application"`) — solo los patches globales, nada de clases:

- **`setTimeout`/`setInterval` nativos** y **`addEventListener` nativo** —
  disparan `$apply` (con el mismo "safe apply" que ya usa `HostWiring")
  DESPUÉS de que corrió el callback del dev. `removeEventListener` va
  parcheado EN PAREJA (`WeakMap` listener→wrapper) para que sacar un listener
  agregado en `ngOnInit` siga funcionando; sin esto, `remove` compararía
  contra el wrapper interno, no el original, y el listener nunca se sacaría
  de verdad (memory leak / zombie).
- **`Promise.prototype.then`**: cubre cadenas `.then()` explícitas, pero
  **no** `async/await` — se probó en el motor real (Node/V8 actual) y el
  patch da CERO intercepciones en `await` (optimización interna de V8, no
  hay vuelta con un patch de runtime nomás).
- **La vuelta real para `async/await`**: como somos compilador (no solo
  runtime), el build fuerza `target: "es2016"` en esbuild (`pluginLoader`) y
  en Vite (`viteTransformPlugin`, hook `config()`) — a ese target, esbuild
  baja `async/await` a un helper basado en generadores (`__async`) que SÍ
  llama `Promise.resolve(...).then(...)` por debajo (confirmado con esbuild
  real, no solo SWC) — así el patch los agarra igual, indirectamente. Si el
  proyecto ya pide un `target` propio (o `esbuild: false` en Vite), se
  respeta tal cual — no se pisa una elección explícita.
- `globalThis.ɵngjsRootScope` (lo deja `PlatformCode.bootstrapModule()`
  cuando el bootstrap real corrió) es lo único que necesitan los patches
  para saber a qué scope aplicarle `$apply` — sin runtime propio de por
  medio.

Cubierto con tests unitarios (`zone-patches-runtime.test.ts`, cada patch
probado en aislado con una ventana `jsdom` fresca; `vite-transform-plugin.test.ts`
para el hook `config()`) y de integración (`angularjs.test.ts`: `async/await`
REAL de punta a punta — no un `.then()` escrito a mano —, `setTimeout` y un
`addEventListener` nativo actualizan la vista solos, sin llamar
`$digest`/`$apply` a mano en ningún lado).

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
