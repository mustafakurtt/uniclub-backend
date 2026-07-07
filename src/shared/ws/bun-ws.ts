import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";

/**
 * Bun'ın native WebSocket motoru (uWebSockets) için Hono adaptörü.
 *
 * `createBunWebSocket()` uygulama başına **tek kez** çağrılmalıdır: döndürdüğü
 * `websocket` handler'ı `Bun.serve` yapılandırmasına (src/index.ts default export)
 * verilir. İkinci bir örnek oluşturulursa upgrade edilen soketler yanlış handler'a
 * bağlanır ve mesajlar sessizce kaybolur. Bu yüzden burada tek noktada üretilip
 * dışarı veriliyor.
 */
export const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();
