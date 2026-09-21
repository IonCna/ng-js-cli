/** Flags de `ngjs new` — acá no hay `ngjs.json` que leer todavía, todo sale de flags + defaults. */
export interface NewFlags {
  projectType?: "application" | "library";
}

export class NewConfig {
  private constructor(public readonly projectType: "application" | "library") {}

  static create(flags: NewFlags): NewConfig {
    return new NewConfig(flags.projectType ?? "library");
  }
}
