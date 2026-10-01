import { buildCommandDefinition, runBuildCommand } from "@/commands/build-command.ts";
import { configCommandDefinition, runConfigCommand } from "@/commands/config-command.ts";
import { generateCommandDefinition, runGenerateCommand } from "@/commands/generate-command.ts";
import { newCommandDefinition, runNewCommand } from "@/commands/new-command.ts";
import { runServeCommand, serveCommandDefinition } from "@/commands/serve-command.ts";
import { runTestCommand, testCommandDefinition } from "@/commands/test-command.ts";
import { Command, InvalidArgumentError } from "commander";

const program = new Command("ngjs");

program
  .command(newCommandDefinition.name)
  .alias(newCommandDefinition.alias)
  .option("--project-type <type>", "'application' o 'library'")
  .action(runNewCommand);

program
  .command(buildCommandDefinition.name)
  .alias(buildCommandDefinition.alias)
  .option("-c, --configuration <names>", "configuration(s) de architect.build a aplicar, separadas por coma (la última pisa)")
  .option("-w, --watch", "reconstruye al cambiar algo de sourceRoot (sin regenerar los .d.ts)")
  .action(runBuildCommand);

program
  .command(generateCommandDefinition.name)
  .alias(generateCommandDefinition.alias)
  .argument(
    "<schematic>",
    "component|directive|pipe|service|module|class|interface|enum|guard|resolver|interceptor (o alias c/d/p/s/m/cl/i/e/g/r/itc)",
  )
  .argument("<name>", "nombre del schematic a generar")
  // Las opciones de `ng generate` (Angular 16); cada schematic acepta las suyas (ver `schematic-registry.ts`). Las
  // booleanas aceptan valor (`--flat=false`), para pisar un default de `schematics` en `ngjs.json`.
  .option("--path <path>", "carpeta base, relativa a la raíz del proyecto (default <sourceRoot>/app)")
  .option("--flat [bool]", "sin carpeta propia (default: false en component/module, true en el resto)", parseBoolean)
  .option("--skip-tests [bool]", "no generar el .spec.ts", parseBoolean)
  .option("--skip-import [bool]", "no registrar en ningún @NgModule", parseBoolean)
  .option("-m, --module <path>", "@NgModule donde registrar, en vez del más cercano")
  .option("--export [bool]", "agregarlo también a exports del @NgModule", parseBoolean)
  .option("-p, --prefix <prefix>", "prefijo del selector (default: prefix de ngjs.json); en interface, del nombre")
  .option("--selector <selector>", "selector, en vez de <prefix>-<name>")
  .option("--style <style>", "archivo de estilos del componente: css | none")
  .option("-s, --inline-style [bool]", "estilos inline (styles) en vez de un .css", parseBoolean)
  .option("-t, --inline-template [bool]", "template inline (template) en vez de un .html", parseBoolean)
  .option("-b, --display-block [bool]", ":host { display: block; } en los estilos del componente", parseBoolean)
  .option("--type <type>", "sufijo del archivo (y de la clase en component): card.page.ts")
  .option("-d, --dry-run [bool]", "mostrar qué se crearía/actualizaría sin escribir nada", parseBoolean)
  .option("-f, --force [bool]", "sobrescribir archivos que ya existen", parseBoolean)
  .action(runGenerateCommand);

program
  .command(serveCommandDefinition.name)
  .alias(serveCommandDefinition.alias)
  .option("-p, --port <port>", "puerto del dev-server", Number)
  .action(runServeCommand);

program
  .command(testCommandDefinition.name)
  .alias(testCommandDefinition.alias)
  .option("--no-watch", "corre los specs una vez y termina (para CI)")
  .option("--include <globs...>", "globs de specs a correr, en vez de architect.test.options.include")
  .action(runTestCommand);

program
  .command(configCommandDefinition.name)
  .alias(configCommandDefinition.alias)
  .argument("<path>", "path en dot-notation sobre ngjs.json, ej. architect.build.options.outputPath")
  .argument("[value]", "si se omite, lee; si se pasa, escribe (JSON.parse con fallback a string)")
  .action(runConfigCommand);

/** `--flat` / `--flat=true` / `--flat=false`, como las booleanas de Angular. */
function parseBoolean(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new InvalidArgumentError(`esperaba true o false, no "${value}".`);
}

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
