import { buildCommandDefinition, runBuildCommand } from "@/commands/build-command.ts";
import { configCommandDefinition, runConfigCommand } from "@/commands/config-command.ts";
import { generateCommandDefinition, runGenerateCommand } from "@/commands/generate-command.ts";
import { newCommandDefinition, runNewCommand } from "@/commands/new-command.ts";
import { runServeCommand, serveCommandDefinition } from "@/commands/serve-command.ts";
import { Command } from "commander";

const program = new Command("ngjs");

program
  .command(newCommandDefinition.name)
  .alias(newCommandDefinition.alias)
  .option("--project-type <type>", "'application' o 'library'")
  .action(runNewCommand);

program
  .command(buildCommandDefinition.name)
  .alias(buildCommandDefinition.alias)
  .option("-c, --configuration <name>", "configuration de architect.build a aplicar")
  .action(runBuildCommand);

program
  .command(generateCommandDefinition.name)
  .alias(generateCommandDefinition.alias)
  .argument("<schematic>", "component | directive | pipe | service | module (o alias c/d/p/s/m)")
  .argument("<name>", "nombre del schematic a generar")
  .action(runGenerateCommand);

program
  .command(serveCommandDefinition.name)
  .alias(serveCommandDefinition.alias)
  .option("-p, --port <port>", "puerto del dev-server", Number)
  .action(runServeCommand);

program
  .command(configCommandDefinition.name)
  .alias(configCommandDefinition.alias)
  .argument("<path>", "path en dot-notation sobre ngjs.json, ej. architect.build.options.outputPath")
  .argument("[value]", "si se omite, lee; si se pasa, escribe (JSON.parse con fallback a string)")
  .action(runConfigCommand);

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
