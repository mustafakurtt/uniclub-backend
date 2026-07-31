import { db } from "./index";

/** Drizzle transaction callback'inin executor tipi — feature repository `*InTx` metotları bunu alır. */
export type DbExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];
