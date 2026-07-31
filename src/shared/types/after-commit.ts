/** Sahip servis yanıtı — yan etkiler commit SONRASI orkestratör tarafından çalıştırılır. */
export type WithAfterCommit<T> = {
  result: T;
  afterCommit?: () => Promise<void>;
};
