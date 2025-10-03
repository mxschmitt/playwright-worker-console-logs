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
      page.waitForTimeout(1000),
    ]);

    const actualLog = getWorkerLog(true);
    console.log("workerLog:");
    console.log(JSON.stringify(actualLog, null, 2));

    const expectedLog = [
      "Shared Worker initialized",
      "🤝 SHARED STATE",
      {
        workerType: "Shared Worker",
        initialized: "2025-09-17T13:01:33.886Z",
        capabilities: [
          "multi-tab communication",
          "shared state",
          "persistent connections",
        ],
        connections: {
          maxConnections: "unlimited",
          currentConnections: 0,
          portManagement: true,
        },
        features: {
          crossOrigin: false,
          sharedMemory: true,
          broadcastMessages: true,
        },
      },
      "Shared Worker new connection",
      "🔗 CONNECTED",
      {
        event: "new_connection",
        timestamp: expect.any(String),
        totalConnections: 1,
        portId: expect.any(String),
        connectionDetails: {
          origin: "unknown",
          type: "MessagePort",
          transferable: true,
        },
      },
      "Shared Worker data analysis",
      "📊 ANALYZED",
      {
        workerType: "Shared Worker",
        messageReceived: expect.any(String),
        dataAnalysis: expect.any(Object),
        sharedWorkerStats: {
          activeConnections: 1,
          memoryUsage: "shared across tabs",
          persistency: "until all tabs closed",
        },
        originalData: {
          timestamp: expect.any(String),
          user: {
            id: 12345,
            name: "John Doe",
            email: "john.doe@example.com",
            preferences: {
              theme: "dark",
              notifications: true,
              language: "en-US",
            },
          },
          data: {
            metrics: [
              {
                name: "pageViews",
                value: 1542,
                trend: "up",
              },
              {
                name: "uniqueUsers",
                value: 847,
                trend: "stable",
              },
              {
                name: "bounceRate",
                value: 0.23,
                trend: "down",
              },
            ],
            features: ["analytics", "reporting", "realtime"],
            config: {
              apiVersion: "v2.1",
              timeout: 5000,
              retries: 3,
              endpoints: {
                auth: "/api/auth",
                data: "/api/data",
                upload: "/api/upload",
              },
            },
          },
          metadata: expect.any(Object),
        },
      },
    ];
    expect(actualLog).toEqual(expectedLog);
  });
});
