// Runs once per Next.js server instance. Starts the Bitcoin deposit watcher in
// the Node.js runtime (it's a no-op unless BTC_XPUB is configured).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBtcWatcher } = await import("./lib/btc/watcher");
    startBtcWatcher();
  }
}
