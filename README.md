# Worker Types Demo — Capturing Console Logs (Page, Web Worker, Service Worker, Shared Worker)

This repo demonstrates how to capture **console logs with complex arguments** from different worker types, including a **manual CDP-based approach for Shared Workers**.

- **Dedicated Web Workers**: supported natively by Playwright (already works).
- **Service Workers**: supported via Playwright context `serviceworker` events (requires a recent Playwright with the referenced change).
- **Shared Workers**: **not supported** by Playwright’s high-level APIs for console events. This project shows how to capture their logs using the **Chrome DevTools Protocol (CDP)**.

---

## Why this exists

Playwright exposes page-level console logs and (in recent versions) dedicated worker logs. However, Playwright **does not stream console logs from Shared Workers**.  
To fill that gap, we:

1. Discover the Shared Worker target.  
2. Attach a **nested** CDP session (`Target.attachToTarget` with `flatten:false`).  
3. Enable `Runtime`/`Log` while the worker is **paused** (`waitForDebuggerOnStart:true`) so no messages are missed.  
4. Listen for `Runtime.consoleAPICalled` events and **materialize** each console argument into plain JSON via `Runtime.callFunctionOn`.

This yields full, structured objects from `console.log()` inside a Shared Worker.

---

## Project layout

```
public/
  index.html               # UI with three buttons to trigger each worker type
  web-worker.js            # Dedicated Web Worker demo (console logs)
  service-worker.js        # Service Worker demo (console logs)
  shared-worker.js         # Shared Worker demo (console logs with complex objects)

tests/
  workers.spec.ts          # Playwright tests capturing logs from all three workers
```

The demo UI is served at `http://localhost:8080/` (as used in tests).

---

## Prerequisites

- Node.js 18+  
- Chromium (installed via Playwright)  
- Playwright installed

> Service Workers require a **secure context**; `localhost` qualifies.

---

## Install & run

```bash
# 1) Install deps
npm install

# 2) Install browsers
npx playwright install

# 3) Serve the demo site on :8080 (pick one)
npx http-server public -p 8080
# or
npx serve public -l 8080
```

In a second terminal, run the tests:

```bash
# All tests
npx playwright test

# Headed / filtered
npx playwright test workers --headed
```

---

## What each test demonstrates

### 1) Web Worker (Dedicated Worker)
- Clicks “Test Web Worker”.  
- Uses Playwright’s **page console** event to capture:  
  - `"Web Worker processing data"` and  
  - complex object args via `ConsoleMessage.args().jsonValue()`.

> Supported before Playwright **1.56**.

### 2) Service Worker
- Clicks “Register & Test Service Worker”.  
- Waits for a `serviceworker` target at the context level, then listens to its `console` events and resolves args via `jsonValue()`.

> Requires a Playwright version that includes support discussed in `microsoft/playwright#37368` (or equivalent).

### 3) Shared Worker (Manual via CDP)
- Enables **target discovery** via `Target.setDiscoverTargets({ discover: true })`.  
- Waits for `Target.targetCreated` where `type === 'shared_worker'`.  
- Attaches with `Target.attachToTarget({ flatten:false, waitForDebuggerOnStart:true })`.  
- Sends CDP commands **to the worker session** via `Target.sendMessageToTarget`.  
- Enables `Runtime/Log`, then calls `Runtime.runIfWaitingForDebugger`.  
- Listens to `Target.receivedMessageFromTarget` (`Runtime.consoleAPICalled`).  
- **Materializes** each console argument:
  - If it’s a primitive or `unserializableValue` (NaN/Infinity/BigInt, etc.), handle directly.
  - If it’s a remote object, call in-worker:
    ```js
    Runtime.callFunctionOn({
      objectId,
      functionDeclaration: `
        function () {
          try { return JSON.parse(JSON.stringify(this)); }
          catch { return { __nonSerializable__: true, description: String(this) }; }
        }`,
      returnByValue: true
    })
    ```
  - Receive a JSON-safe value for assertions.

---

## Minimal Shared Worker capture snippet (CDP)

```ts
// Browser-level CDP session
const cdp = await context.browser()!.newBrowserCDPSession();
await cdp.send('Target.setDiscoverTargets', { discover: true });

// Wait for shared worker target
const targetId = await new Promise<string>((resolve) => {
  const onCreated = ({ targetInfo }: any) => {
    if (targetInfo?.type === 'shared_worker') {
      cdp.off('Target.targetCreated', onCreated);
      resolve(targetInfo.targetId);
    }
  };
  cdp.on('Target.targetCreated', onCreated);
});

// Trigger creation in the page...
await page.getByRole('button', { name: 'Test Shared Worker' }).click();

// Attach nested session (flatten:false)
const { sessionId } = await cdp.send('Target.attachToTarget', {
  targetId, flatten: false, waitForDebuggerOnStart: true,
});

// Tiny RPC to talk to the worker
let id = 0;
const send = (method: string, params: any = {}) =>
  new Promise<any>((resolve) => {
    const msgId = ++id;
    cdp.send('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({ id: msgId, method, params }),
    });
    const onMsg = ({ sessionId: sid, message }: any) => {
      if (sid !== sessionId) return;
      const payload = JSON.parse(message);
      if (payload.id === msgId) {
        cdp.off('Target.receivedMessageFromTarget', onMsg);
        resolve(payload.result);
      }
    };
    cdp.on('Target.receivedMessageFromTarget', onMsg);
  });

// Enable + listen
await send('Runtime.enable');
await send('Log.enable');

cdp.on('Target.receivedMessageFromTarget', async ({ sessionId: sid, message }: any) => {
  if (sid !== sessionId) return;
  const m = JSON.parse(message);
  if (m.method !== 'Runtime.consoleAPICalled') return;

  // Materialize args here (use Runtime.callFunctionOn for objects)…
});

await send('Runtime.runIfWaitingForDebugger');
```

---

## Compatibility matrix (Chromium)

| Target                    | Console capture | How                                       |
|--------------------------|-----------------|--------------------------------------------|
| Page                     | ✅              | `page.on('console', …)`                    |
| Dedicated Web Worker     | ✅              | `page.on('console', …)` (pre-1.56 already) |
| Service Worker           | ✅             | `context.on('serviceworker', …).on('console', …)` (*requires recent PW) |
| Shared Worker            | ❌ (native)     | **Manual CDP attach** (this repo)          |

---

## Assertions & stability tips

- Clean up after the test:
  - `cdp.off('Target.targetCreated', ...)`
  - `cdp.off('Target.receivedMessageFromTarget', ...)`
  - `cdp.send('Target.setDiscoverTargets', { discover: false })`
  - Optionally `Target.detachFromTarget({ sessionId })`

---

## Troubleshooting

- **`Protocol error (Target.setAutoAttach): Only flatten protocol is supported with browser level auto-attach`**  
  Use the **discover + attach** flow with `flatten:false`.

- **`'Runtime.enable'/'Log.enable' wasn't found`**  
  You likely called domain methods on the **root** session. For `flatten:false`, always send via `Target.sendMessageToTarget`.

- **No events / timeouts**  
  Make sure discovery starts **before** the worker is created and the server runs at `http://localhost:8080/`.

---

## Notes on versions

- **Dedicated Web Worker console logs**: supported before Playwright **1.56**.  
- **Service Worker console logs**: available when the referenced change (`microsoft/playwright#37368`) is in your Playwright build.  
- **Shared Worker console logs**: not supported natively; use the CDP method above (Chromium).

---

## License

MIT.