import { test as base, type Page, expect } from "@playwright/test";

declare module "@playwright/test" {
  interface Page {
    getWorkerConnection: () => Promise<void>;
    getWorkerLog: (clearLog?: boolean) => any[];
  }
}

const functionDeclaration = `function () {
  try { return JSON.parse(JSON.stringify(this)); }
  catch (e) { return { __nonSerializable__: true, description: String(this) }; }
}`;

async function sharedWorkerLogsCapture(
  page: Page,
  { captureTimeout }: { captureTimeout: number }
): Promise<() => void> {
  const shutdownFns = [] as (() => void)[];
  const logData = [] as any[];

  // Create a new Chrome DevTools Protocol session
  const cdp = await page.context().browser()!.newBrowserCDPSession();
  shutdownFns.push(() => {
    cdp.detach();
  });

  // Make Chrome emit Target.targetCreated events.
  await cdp.send("Target.setDiscoverTargets", { discover: true });

  // Wait for the SharedWorker target to be created as a result of the click.
  const waitForSharedWorkerTarget = new Promise<{ targetId: string }>(
    (resolve, reject) => {
      const timeoutId = setTimeout(
        () => reject(new Error("Timed out waiting for SharedWorker creation")),
        captureTimeout
      );
      const onCreated = ({ targetInfo }: any) => {
        if (targetInfo?.type === "shared_worker") {
          cdp.off("Target.targetCreated", onCreated);
          clearTimeout(timeoutId);
          resolve(targetInfo);
        }
      };
      cdp.on("Target.targetCreated", onCreated);
    }
  );

  // Attach to that worker with a *nested* session (flatten:false).
  const attachToSharedWorker = async (targetId: string) => {
    return cdp.send("Target.attachToTarget", {
      targetId,
      flatten: false,
    });
  };

  // Create functions to communicate with the worker
  const createCommunicationsFns = (sessionId: string) => {
    let nextMsgId = 0;
    const pending = new Map<number, (res: any) => void>();
    let consoleChain = Promise.resolve();

    const sendToWorker = (method: string, params: any = {}) => {
      const id = ++nextMsgId;
      cdp.send("Target.sendMessageToTarget", {
        sessionId,
        message: JSON.stringify({ id, method, params }),
      });
      return new Promise<any>((resolve) => pending.set(id, resolve));
    };

    const receivedMessageFromTarget = async ({
      sessionId: sid,
      message,
    }: any) => {
      console.log("Received message from target:", sid, message);
      if (sid !== sessionId) {
        return;
      }
      try {
        const payload = JSON.parse(message);
        if (payload.method === "Runtime.consoleAPICalled") {
          const args = payload.params.args ?? [];
          consoleChain = consoleChain.then(async () => {
            // Materialize all args (in parallel) preserving ordering
            const resolved = await Promise.all(
              args.map((a: any) => materializeArg(a))
            );
            logData.push(...resolved);
          });
        } else if (typeof payload.id === "number") {
          const r = pending.get(payload.id);
          if (r) {
            pending.delete(payload.id);
            r(payload);
          }
        }
      } catch {
        console.error("Could not parse message.");
      }
    };
    cdp.on("Target.receivedMessageFromTarget", receivedMessageFromTarget);
    shutdownFns.push(() =>
      cdp.off("Target.receivedMessageFromTarget", receivedMessageFromTarget)
    );

    const materializeArg = async (a: any) => {
      if ("value" in a) return a.value;
      if ("unserializableValue" in a) {
        const u = a.unserializableValue;
        if (u === "NaN") return NaN;
        if (u === "Infinity") return Infinity;
        if (u === "-Infinity") return -Infinity;
        if (u === "-0") return -0;
        if (/^-?\d+n$/.test(u)) return BigInt(u.slice(0, -1));
        return u;
      }
      if (a.objectId) {
        // Ask the worker to JSON-serialize the object and return it by value
        const resp = await sendToWorker("Runtime.callFunctionOn", {
          objectId: a.objectId,
          functionDeclaration,
          returnByValue: true,
        });
        return resp?.result?.result?.value;
      }
      return a; // fallback
    };

    return {
      sendToWorker,
    };
  };

  waitForSharedWorkerTarget
    .then(({ targetId }) => attachToSharedWorker(targetId))
    .then(({ sessionId }) => createCommunicationsFns(sessionId))
    .then(async ({ sendToWorker }) => {
      await sendToWorker("Runtime.enable");
      await sendToWorker("Log.enable");
      await sendToWorker("Runtime.runIfWaitingForDebugger");
    })
    .catch((error) => {
      console.error("Error during SharedWorker handling:", error);
    });

  page.getWorkerLog = (clearLog?: boolean) => {
    const current = [...logData];
    if (clearLog) {
      logData.length = 0;
    }
    return current;
  };
  page.getWorkerConnection = () =>
    waitForSharedWorkerTarget.then(() => undefined);

  return () => {
    shutdownFns.reverse().forEach((fn) => fn());
  };
}

export type CaptureOptions = {
  captureTimeout: number;
};

type CaptureFixtures = {
  page: Page;
  getWorkerConnection: () => Promise<void>;
  getWorkerLog: (clearLog?: boolean) => any[];
};

const test = base.extend<CaptureOptions & CaptureFixtures>({
  captureTimeout: [10_000, { option: true }],

  page: async ({ page, captureTimeout }, use) => {
    await sharedWorkerLogsCapture(page, {
      captureTimeout,
    });
    await use(page);
  },

  getWorkerLog: async ({ page }, use) => use(page.getWorkerLog.bind(page)),
  getWorkerConnection: async ({ page }, use) =>
    use(page.getWorkerConnection.bind(page)),
});

export { test, expect };
