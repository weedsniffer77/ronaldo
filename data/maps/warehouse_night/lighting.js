
// js/data/maps/warehouse_night/lighting.js
window.WAREHOUSE_NIGHT_LIGHTING = {
    id: "WAREHOUSE_NIGHT_LIGHTING",
    name: "Night Operations",
    mapId: "WAREHOUSE",
    
    // Moon
    sun: {
        type: "directional",
        position: { x: -40, y: 60, z: -30 }, // Moon position
        color: "#aaccff", // Bluish moonlight
        intensity: 0.6,   // Dim light
        
        visual: {
            distance: 400,
            coreSize: 80, 
            coreColor: "#eeffff",
            glowSize: 250, 
            glowColor: "#224488", // Deep blue glow
            isMoon: true
        }
    },
    
    // Star Field
    stars: {
        enabled: true,
        count: 1500,
        brightness: 0.8,
        color: "#ffffff"
    },
    
    // Atmosphere
    atmosphere: {
        zenithColor: "#000510",      // Deep space black/blue
        horizonColor: "#051020",     // Dark navy horizon
        groundColor: "#020205"       
    },
    
    // Ambient
    ambient: {
        color: "#112244", // Cold blue ambient
        intensity: 0.15 
    },
    
    // Hemisphere
    hemisphere: {
        skyColor: "#112233",
        groundColor: "#050505",
        intensity: 0.2
    },
    
    // Fog
    fog: {
        enabled: true,
        color: "#051020", 
        density: 0.01 // Thicker night fog
    },
    
    // Post-processing
    postProcessing: {
        bloom: {
            strength: 1.2, // Stronger bloom for lights in darkness
            radius: 0.6, 
            threshold: 0.8 
        }
    }
};
console.log('Warehouse (Night) lighting config loaded');
