import type { DbExecutor } from "../../db/executor";
import type { WithAfterCommit } from "../../shared/types/after-commit";
import { authRepository } from "./auth.repository";

/** Tx içi yazım + commit sonrası hook deseni (provision, davet). */
export async function runAuthTransactionWithAfterCommit<T>(
  fn: (tx: DbExecutor) => Promise<WithAfterCommit<T>>
): Promise<T> {
  const afterCommits: Array<() => Promise<void>> = [];
  const result = await authRepository.runInTransaction(async (tx) => {
    const wrapped = await fn(tx);
    if (wrapped.afterCommit) {
      afterCommits.push(wrapped.afterCommit);
    }
    return wrapped.result;
  });
  for (const runAfterCommit of afterCommits) {
    await runAfterCommit();
  }
  return result;
}
