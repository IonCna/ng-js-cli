import type { NgjsConfig } from "@/config/cli-config.ts";
import { ConfigReader } from "@/config/config-reader.ts";

/**
 * Base de los configs resueltos por comando (`BuildConfig`, `ServeConfig`,
 * ...). Centraliza la lectura de `ngjs.json` — cada subclase escribe su propio
 * `static create(flags)` que llama a `this.read()`, saca lo que le toca de
 * `NgjsConfig` y lo mergea con las flags de CLI, devolviendo la instancia ya
 * resuelta. `create()` no se puede compartir acá (el merge es distinto por
 * comando), solo el `read()`.
 */
export abstract class NgjsCommandConfig {
  protected static async read(): Promise<NgjsConfig> {
    return ConfigReader.read();
  }
}
