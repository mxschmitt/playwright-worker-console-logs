// Web Worker Script
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    if (type === 'LOG_OBJECT') {
        console.log("Web Worker processing data", "⚡ PROCESSED", {
            workerType: "Web Worker",
            messageReceived: new Date().toISOString(),
            processedData: {
                userInfo: data.user,
                metricsAnalyzed: data.data.metrics.length,
                configurationKeys: Object.keys(data.data.config).length,
                sessionMetadata: data.metadata
            },
            performance: {
                cpuIntensive: true,
                memoryIsolated: true,
                domAccess: false
            },
            originalData: data
        });
        
        // Send confirmation back to main thread
        self.postMessage({ type: 'LOGGED', success: true });
    }
};