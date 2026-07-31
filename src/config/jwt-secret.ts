/** HS256 için minimum uzunluk (256 bit entropi hedefi). */
export const JWT_SECRET_MIN_LENGTH = 32;

/** Yaygın örnek / placeholder değerler — küçük harf normalize edilerek kıyaslanır. */
const JWT_PLACEHOLDER_SECRETS = new Set(
  [
    "secret",
    "changeme",
    "change-me",
    "change-me-to-a-long-random-secret",
    "your-secret-key",
    "your_jwt_secret",
    "jwt_secret",
    "jwt-secret",
    "smoke-test-only",
    "password",
    "supersecret",
    "dev-secret",
    "mysecret",
    "test",
    "12345678901234567890123456789012",
  ].map((s) => s.toLowerCase())
);

export function isJwtPlaceholderSecret(secret: string): boolean {
  const normalized = secret.trim().toLowerCase();
  if (JWT_PLACEHOLDER_SECRETS.has(normalized)) return true;
  if (normalized.startsWith("change-me")) return true;
  if (normalized.includes("changeme")) return true;
  if (normalized.includes("your-secret")) return true;
  return false;
}

/**
 * JWT_SECRET doğrulama — development/production/test için tek kural seti.
 * Production'da ekstra bir dal yok; `isJwtPlaceholderSecret` örnek/şablon değerleri
 * tüm ortamlarda reddeder.
 */
export function validateJwtSecret(secret: string, nodeEnv: string): string | null {
  void nodeEnv; // imza ortam ayrımı için korunur; kurallar ortak
  if (secret.length < JWT_SECRET_MIN_LENGTH) {
    return `JWT_SECRET en az ${JWT_SECRET_MIN_LENGTH} karakter olmalıdır.`;
  }
  if (isJwtPlaceholderSecret(secret)) {
    return "JWT_SECRET örnek veya placeholder değer kullanılamaz.";
  }
  return null;
}
