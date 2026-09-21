import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NgjsConfig } from "@/config/cli-config.ts";

export class ConfigReader {
    static async read(): Promise<NgjsConfig> {
        const root = process.cwd();
        const path = join(root, "ngjs.json");
        if (!existsSync(path)) {
            throw new Error(`No se encontró "ngjs.json" en "${root}".`);
        }

        const raw = await readFile(path, "utf8");
        return JSON.parse(raw) as NgjsConfig;
    }
}
