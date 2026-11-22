import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  convertV1,
  INITIAL_SNAPSHOT,
  parseSnapshot,
  type Snapshot,
} from "./profiles";

type Database = ReturnType<BbPluginApi["storage"]["database"]>;
/** The table keeps its Model Manager name so existing rules upgrade in place. */
export const PROFILE_MIGRATIONS = [
  "CREATE TABLE IF NOT EXISTS model_filter_preferences (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), document TEXT NOT NULL)",
];

/** One singleton row. Every change runs on the latest stored snapshot inside
 * one immediate transaction, so overlapping requests serialize in SQLite.
 */
export class ProfilesStore {
  constructor(private readonly db: Database) {}
  read(): Snapshot {
    const row = this.db
      .prepare(
        "SELECT document FROM model_filter_preferences WHERE singleton=1",
      )
      .get() as { document: string } | undefined;
    if (!row) return INITIAL_SNAPSHOT;
    try {
      const document: unknown = JSON.parse(row.document);
      if (
        typeof document !== "object" ||
        document === null ||
        !("snapshot" in document)
      )
        throw new Error("Unsupported stored profiles document");
      if ("version" in document && document.version === 2)
        return parseSnapshot(document.snapshot);
      if ("version" in document && document.version === 1)
        return convertV1(document.snapshot);
      throw new Error("Unsupported stored profiles version");
    } catch (error) {
      throw new Error(
        `Cannot read stored profiles: ${error instanceof Error ? error.message : "Invalid document"}`,
      );
    }
  }
  mutate(change: (current: Snapshot) => Snapshot): Snapshot {
    return this.db
      .transaction(() => {
        const current = this.read();
        const next = parseSnapshot({
          ...change(current),
          revision: current.revision + 1,
        });
        this.db
          .prepare(
            "INSERT INTO model_filter_preferences (singleton, document) VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET document=excluded.document",
          )
          .run(JSON.stringify({ version: 2, snapshot: next }));
        return next;
      })
      .immediate();
  }
}
