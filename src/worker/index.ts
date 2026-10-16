/**
 * Worker entry: build this file as a classic (IIFE) script, dist/PostalSharedWorker.js.
 * The same file runs as a SharedWorker or as the fallback dedicated Worker.
 * The worker name (set by the library) is the BroadcastChannel name.
 */
import { Hub } from "./hub";

const scope = self as unknown as { name?: string; onconnect?: ((e: MessageEvent) => void) | null };
const hub = new Hub(scope.name || "PostalWorker");

// SharedWorker: tabs connect through ports, but all traffic uses the BroadcastChannel.
// Starting the port keeps the connection (and so the worker) alive for that tab.
scope.onconnect = (e: MessageEvent) => {
  e.ports[0]?.start();
  hub.announce();
};

hub.announce();
