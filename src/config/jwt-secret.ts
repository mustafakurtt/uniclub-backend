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

/** `.env.example` ve bilinen şablon değerleri — prod'da özellikle yasak. */
const JWT_EXAMPLE_SECRETS = new Set(
  ["change-me-to-a-long-random-secret", "change-me"].map((s) => s.toLowerCase())
);

export function isJwtPlaceholderSecret(secret: string): boolean {
  const normalized = secret.trim().toLowerCase();
  if (JWT_PLACEHOLDER_SECRETS.has(normalized)) return true;
  if (normalized.startsWith("change-me")) return true;
  if (normalized.includes("changeme")) return true;
  if (normalized.includes("your-secret")) return true;
  return false;
}

export function validateJwtSecret(secret: string, nodeEnv: string): string | null {
  if (secret.length < JWT_SECRET_MIN_LENGTH) {
    return `JWT_SECRET en az ${JWT_SECRET_MIN_LENGTH} karakter olmalıdır.`;
  }
  if (isJwtPlaceholderSecret(secret)) {
    return "JWT_SECRET örnek veya placeholder değer kullanılamaz.";
  }
  if (nodeEnv === "production") {
    const normalized = secret.trim().toLowerCase();
    if (JWT_EXAMPLE_SECRETS.has(normalized) || normalized.startsWith("change-me")) {
      return "JWT_SECRET production ortamında örnek veya varsayılan değer kullanılamaz.";
    }
  }
  return null;
}
