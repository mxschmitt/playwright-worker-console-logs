// Service Worker Script
console.log("Service Worker initialized", "⚙️ STATUS: READY", { workerType: "Service Worker", timestamp: new Date().toISOString(), capabilities: ["network interception", "caching", "background sync", "push notifications"] });

// Install event
self.addEventListener('install', function(event) {
    console.log("Service Worker install", "🔧 INSTALLING", {
        event: "install",
        timestamp: new Date().toISOString(),
        workerType: "Service Worker",
        capabilities: ["network interception", "caching", "background sync", "push notifications"],
        lifecycle: {
            phase: "install",
            skipWaiting: true,
            updatefound: false
        }
    });
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', function(event) {
    console.log("Service Worker activated", "✅ ACTIVE", {
        event: "activate",
        timestamp: new Date().toISOString(),
        workerType: "Service Worker",
        clients: {
            claim: true,
            controlAll: true
        },
        caches: {
            cleanup: true,
            strategy: "cache-first"
        }
    });
    event.waitUntil(self.clients.claim());
});

// Message event
self.addEventListener('message', function(event) {
    const { type, data } = event.data;
    
    if (type === 'LOG_OBJECT') {
        console.log("Service Worker message received", "📨 DATA PROCESSED", {
            workerType: "Service Worker",
            messageReceived: new Date().toISOString(),
            clientId: event.source?.id || "unknown",
            dataProcessed: {
                userCount: 1,
                metricsCount: data.data.metrics.length,
                configKeys: Object.keys(data.data.config).length,
                metadataKeys: Object.keys(data.metadata).length
            },
            networkState: navigator.onLine ? "online" : "offline",
            receivedData: data
        });
    }
});

// Fetch event (for demonstration)
self.addEventListener('fetch', function(event) {
    // Only log for our demo files, not for every request
    if (event.request.url.includes('johannes-console-workers')) {
        console.log("Service Worker intercepted request", "🌐 FETCH", {
            event: "fetch",
            url: event.request.url,
            method: event.request.method,
            timestamp: new Date().toISOString(),
            headers: Object.fromEntries(event.request.headers),
            mode: event.request.mode,
            cache: event.request.cache
        });
    }
});