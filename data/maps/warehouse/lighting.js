
// js/data/maps/warehouse/lighting.js
window.WAREHOUSE_LIGHTING = {
    id: "WAREHOUSE_LIGHTING",
    name: "Training Course",
    mapId: "WAREHOUSE",
    
    // Sun: High angle, crisp
    sun: {
        type: "directional",
        position: { x: 30, y: 80, z: -20 },
        color: "#fffde0", 
        intensity: 3.8, 
        
        visual: {
            distance: 400,
            coreSize: 75, 
            coreColor: "#ffffff",
            glowSize: 200, 
            glowColor: "#ffffee" 
        }
    },
    
    // Atmosphere
    atmosphere: {
        zenithColor: "#eef5f5",      
        horizonColor: "#cce0e0",     
        groundColor: "#808080"       
    },
    
    // Ambient
    ambient: {
        color: "#ddeeff", 
        intensity: 0.3 
    },
    
    // Hemisphere
    hemisphere: {
        skyColor: "#ffffff",
        groundColor: "#aaaaaa",
        intensity: 0.4
    },
    
    // Fog
    fog: {
        enabled: true,
        color: "#cce0e0", 
        density: 0.005
    },
    
    // Post-processing
    postProcessing: {
        bloom: {
            strength: 0.9,  // Increased strength
            radius: 0.5,    // Increased radius
            threshold: 0.85  // KEEP AT 0.85
        }
    }
};
console.log('Warehouse lighting config loaded (Training)');
