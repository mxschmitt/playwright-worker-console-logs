// Shared Worker Script
console.log("Shared Worker initialized", "🤝 SHARED STATE", {
    workerType: "Shared Worker",
    initialized: new Date("2025-09-17T13:01:33.886Z").toISOString(),
    capabilities: ["multi-tab communication", "shared state", "persistent connections"],
    connections: {
        maxConnections: "unlimited",
        currentConnections: 0,
        portManagement: true
    },
    features: {
        crossOrigin: false,
        sharedMemory: true,
        broadcastMessages: true
    }
});

// Store connected ports
const connectedPorts = new Set();

// Handle new connections
self.addEventListener('connect', function(e) {
    const port = e.ports[0];
    connectedPorts.add(port);
    
    console.log("Shared Worker new connection", "🔗 CONNECTED", {
        event: "new_connection",
        timestamp: new Date().toISOString(),
        totalConnections: connectedPorts.size,
        portId: "port_" + Math.random().toString(36).substring(2, 11),
        connectionDetails: {
            origin: e.origin || "unknown",
            type: "MessagePort",
            transferable: true
        }
    });
    
    port.onmessage = function(event) {
        const { type, data } = event.data;
        
        if (type === 'LOG_OBJECT') {
            console.log("Shared Worker data analysis", "📊 ANALYZED", {
                workerType: "Shared Worker",
                messageReceived: new Date().toISOString(),
                dataAnalysis: {
                    userPreferences: data.user.preferences,
                    totalMetrics: data.data.metrics.length,
                    upTrendMetrics: data.data.metrics.filter(m => m.trend === "up").length,
                    apiEndpoints: Object.keys(data.data.config.endpoints).length,
                    sessionInfo: {
                        sessionId: data.metadata.session,
                        screenResolution: `${data.metadata.screen.width}x${data.metadata.screen.height}`,
                        colorDepth: data.metadata.screen.colorDepth
                    }
                },
                sharedWorkerStats: {
                    activeConnections: connectedPorts.size,
                    memoryUsage: "shared across tabs",
                    persistency: "until all tabs closed"
                },
                originalData: data
            });
            
            // Broadcast to all connected ports
            connectedPorts.forEach(p => {
                if (p !== port) {
                    try {
                        p.postMessage({
                            type: 'BROADCAST',
                            data: data,
                            from: 'shared-worker'
                        });
                    } catch (e) {
                        // Port might be closed, remove it
                        connectedPorts.delete(p);
                    }
                }
            });
            
            // Send confirmation back to sender
            port.postMessage({ type: 'LOGGED', success: true });
        }
    };
    
    // Handle port disconnect
    port.onclose = function() {
        connectedPorts.delete(port);
        console.log("Shared Worker connection closed", "❌ DISCONNECTED", {
            activeConnections: connectedPorts.size,
            timestamp: new Date().toISOString(),
            event: "port_closed"
        });
    };
    
    port.start();
});