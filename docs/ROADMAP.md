# Roadmap

Leyenda: ✅ cerrado · 🚧 en progreso · ⬜ no empezado.

## El objetivo real: `migrate`

`ng-js-cli` no es decoración permanente de AngularJS — el punto final es un comando
`migrate` que ejecuta el salto real: toma lo que `ngjs-core` ya tradujo (código
escrito en modo `ngjs-core`, decoradores reales — ver `cli.defaultCollection` en
`ngjs.json`), desinstala `ngb-js`/todo lo puente, e instala Angular real (14/16).
Cuando ese comando exista y corra, la migración terminó: no queda reescritura
pendiente, solo el swap de paquetes.

**Consecuencia para priorizar todo lo demás:** lo que acerca a `migrate` (más
cobertura de modo `core`, más fidelidad `ngjs.json` ↔ `angular.json`) importa más
que pulir el CLI para que "se parezca más" a Angular por parecerse (`--version`,
shell completion, etc.) — ver [[project_ngjs_migration_bridge_goal]] en la memoria
del usuario.

## ⬜ Precondiciones de `migrate`

- [ ] **Cobertura de `core` en todos los schematics que `ngjs-core` soporta hoy.**
      `generate` solo cubre component/directive/pipe/service/module. Si
      `ngjs-core` gana más superficie de autoría (guards, resolvers,
      interceptors, lo que sea), `generate` necesita su template en modo core
      para que `migrate` tenga algo que levantar.
- [ ] **Registro real en modo `core`.** Hoy `generate` en modo core solo estampa
      la clase con su decorador — no toca `declarations`/`imports` de ningún
      `@NgModule` (decisión deliberada, ver conversación del feature `core`).
      Pendiente decidir QUIÉN arma ese grafo antes de que `migrate` necesite
      leerlo: ¿`generate` en un futuro? ¿algo que `migrate` mismo resuelve al
      caminar el código? ¿`ngjs-core` en runtime, y `migrate` solo lo consulta?
- [ ] **Inventario de "qué es puente / qué es Angular real."** No hay ningún
      marcador hoy que diga "esto lo instala `migrate`" vs "esto lo desinstala
      `migrate`" — ni a nivel paquete (`ngb-js`, dependencias runtime de
      `ngjs-core`) ni a nivel archivo. `migrate` necesita esa lista para saber
      qué borrar.
- [x] **Fidelidad `ngjs.json` ↔ `angular.json` real** (en curso, ver `cli-config.ts`):
      `cli.defaultCollection`, `architect.build.configurations`, `fileReplacements`
      para environments. Cuanto más mecánico el mapeo, más mecánico el
      `ngjs.json` → `angular.json` final.

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
- `--flat` / `--skip-import` en `generate`.
- Schematics que Angular tiene y acá no: `class`, `interface`, `enum`, `guard`,
  `resolver`, `interceptor`, generación de `.spec.ts`.
- `ng test` / `ng lint` / `ng add` / `ng update` — sin equivalente.
- Multi-proyecto (`angular.json` soporta varios `projects`; `ngjs.json` es de
  un solo proyecto) — la brecha estructural más grande si algún día hay
  monorepo con más de una app/lib.
