import { test, expect, ConsoleMessage } from '@playwright/test';
import path, { parse } from 'path';

const { createHandle } = require(path.join(require.resolve("playwright-core"), "..", "/lib/server/chromium/crExecutionContext.js"))

test.describe('Worker Types Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/');
  });

  test('should get Web Worker logs', async ({ page }) => {
    // NOTE: Should work as of today.
    const [msg] = await Promise.all([
      page.waitForEvent('console', { predicate: msg => msg.text().includes('Web Worker processing data') }),
      page.getByRole('button', { name: 'Test Web Worker' }).click()
    ]);
    const args = msg.args();
    for (let i = 0; i < args.length; ++i) {
      const arg = args[i];
      console.log(`arg[${i}]:`, await arg.jsonValue());
    }
    console.log('workerLog:', msg.text());
  });

  test('should be able to get Service Worker logs', async ({ page }) => {
    // NOTE: Depends on https://github.com/microsoft/playwright/pull/37368
    const [worker] = await Promise.all([
      page.context().waitForEvent('serviceworker'),
      page.getByRole('button', { name: 'Register & Test Service Worker' }).click()
    ]);
    const msg = await new Promise<ConsoleMessage>(resolve => worker.once('console', resolve));
    const args = msg.args();
    for (let i = 0; i < args.length; ++i) {
      const arg = args[i];
      console.log(`arg[${i}]:`, await arg.jsonValue());
    }
    console.log('workerLog:', msg.text());
  });


  test('should be able to get Shared Worker logs', async ({ page }) => {
    const cdp = await page.context().browser()!.newBrowserCDPSession();

    // Make Chrome emit Target.targetCreated events.
    await cdp.send('Target.setDiscoverTargets', { discover: true });

    // Wait for the SharedWorker target to be created as a result of the click.
    const waitForSharedWorkerTarget = () =>
      new Promise<{ targetId: string }>((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('Timed out waiting for SharedWorker creation')), 10_000);
        const onCreated = ({ targetInfo }: any) => {
          if (targetInfo?.type === 'shared_worker') {
            cdp.off('Target.targetCreated', onCreated);
            clearTimeout(to);
            resolve(targetInfo);
          }
        };
        cdp.on('Target.targetCreated', onCreated);
      });

    // Start waiting for the shared worker, then click the button that creates it.
    const { targetId } = await Promise.all([
      waitForSharedWorkerTarget(),
      page.getByRole('button', { name: 'Test Shared Worker' }).click(),
    ]).then(([res]) => res);

    // Attach to that worker with a *nested* session (flatten:false).
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: false,
    });

    let _msgId = 0;
    const pending = new Map<number, (res: any) => void>();
    const sendToWorker = (method: string, params: any = {}) => {
      const id = ++_msgId;
      cdp.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({ id, method, params }),
      });
      return new Promise<any>(resolve => pending.set(id, resolve));
    };
    cdp.on('Target.receivedMessageFromTarget', ({ sessionId: sid, message }: any) => {
      if (sid !== sessionId) return;
      try {
        const payload = JSON.parse(message);
        if (typeof payload.id === 'number') {
          const r = pending.get(payload.id);
          if (r) { pending.delete(payload.id); r(payload); }
        }
      } catch { }
    });


    const materializeArg = async (a: any) => {
      if ('value' in a) return a.value;
      if ('unserializableValue' in a) {
        const u = a.unserializableValue;
        if (u === 'NaN') return NaN;
        if (u === 'Infinity') return Infinity;
        if (u === '-Infinity') return -Infinity;
        if (u === '-0') return -0;
        if (/^-?\d+n$/.test(u)) return BigInt(u.slice(0, -1));
        return u;
      }
      if (a.objectId) {
        // Ask the worker to JSON-serialize the object and return it by value
        const resp = await sendToWorker('Runtime.callFunctionOn', {
          objectId: a.objectId,
          functionDeclaration: `
        function () {
          try { return JSON.parse(JSON.stringify(this)); }
          catch (e) { return { __nonSerializable__: true, description: String(this) }; }
        }
      `,
          returnByValue: true,
        });
        return resp?.result?.result?.value;
      }
      return a; // fallback
    };

    const workerLogPromise = new Promise<any[]>((resolve) => {
      const onMsg = async ({ sessionId: sid, message }: any) => {
        console.log('Received message from target:', sid, message);
        if (sid !== sessionId)
          return;
        const m = JSON.parse(message);
        if (m.method === 'Runtime.consoleAPICalled') {
          const args = m.params.args || [];
          cdp.off('Target.receivedMessageFromTarget', onMsg);
          const resolved = [];
          for (const a of args)
            resolved.push(await materializeArg(a));
          resolve(resolved);
        }
      };
      cdp.on('Target.receivedMessageFromTarget', onMsg);
    });

    await sendToWorker('Runtime.enable');
    await sendToWorker('Log.enable');
    await sendToWorker('Runtime.runIfWaitingForDebugger');

    const log = await workerLogPromise;
    console.log('workerLog:', log);
    expect(log).toEqual(["Shared Worker initialized", "🤝 SHARED STATE", {
      "capabilities": ["multi-tab communication", "shared state", "persistent connections"],
      "connections": {
        "currentConnections": 0,
        "maxConnections": "unlimited",
        "portManagement": true
      },
      "features": {
        "broadcastMessages": true, 
        "crossOrigin": false,
         "sharedMemory": true
      },
      "initialized": "2025-09-17T13:01:33.886Z",
       "workerType": "Shared Worker"
    }]);
  });
});