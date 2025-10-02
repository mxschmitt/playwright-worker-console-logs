import { test, expect } from "./captureSharedWorkerLogs.fixture";

test.describe("Shared Worker Logs Capture Fixture Demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:8080/");
  });

  test("should be able to get Shared Worker logs", async ({
    page,
    getWorkerConnection,
    getWorkerLog,
  }) => {
    await Promise.all([
      getWorkerConnection(),
      page.getByRole("button", { name: "Test Shared Worker" }).click(),
    ]);
    const log = await getWorkerLog();

    console.log("workerLog:", log);
    expect(log).toEqual([
      "Shared Worker initialized",
      "🤝 SHARED STATE",
      {
        capabilities: [
          "multi-tab communication",
          "shared state",
          "persistent connections",
        ],
        connections: {
          currentConnections: 0,
          maxConnections: "unlimited",
          portManagement: true,
        },
        features: {
          broadcastMessages: true,
          crossOrigin: false,
          sharedMemory: true,
        },
        initialized: "2025-09-17T13:01:33.886Z",
        workerType: "Shared Worker",
      },
    ]);
  });
});
