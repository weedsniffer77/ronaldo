
// js/data/weapons/pistol/pistol_attachments.js
(function() {
    const G = window.TacticalShooter.GameData.Attachments;

    G["pistol_mag_ext"] = {
        name: "30 ROUND MAG", 
        type: "magazine",
        requires: "pistol_auto", 
        apply: (def) => {
            def.magazineSize = 30;
            def.reserveAmmo = 150; 
            def.reloadTime = (def.reloadTime || 1.8) * 1.25; 
            def.sprintMultiplier = (def.sprintMultiplier || 1.2) * 0.98; // -2%
            if (def.allowADS === false) {
                def.magazineSize *= 2;
                def.reserveAmmo *= 2;
            }
        }
    };

    G["pistol_auto"] = {
        name: "FULL AUTO",
        type: "conversion",
        apply: (def) => {
            def.automatic = true;
            def.fireRate = 0.05;
            def.visualFireRate = 0.1; 
            if (!def.projectilesPerShot) def.projectilesPerShot = 1;
            def.damage = 15; 
            def.recoilPitch = 0.012; 
            def.recoilYaw = 0.008;
            def.recoilRecovery = 20.0; 
            def.hipfireSpread = 0.08; 
            def.adsSpread = 0.035;     
            def.sprintSpread = 0.25;
            
            // Mobility Reduction (-3%)
            def.sprintMultiplier = (def.sprintMultiplier || 1.2) * 0.97;
            
            // Add Visual Stat Modifier for StatSystem (Massive Control Penalty)
            def.visuals = def.visuals || {};
            def.visuals.statRecoilMultiplier = 2.5; 
            
            def.damageFalloff = {
                base: [{ maxDist: 8, dmg: 15 }, { maxDist: 15, dmg: 10 }, { maxDist: 25, dmg: 8 }, { maxDist: Infinity, dmg: 5 }],
                head: [{ maxDist: 8, dmg: 22 }, { maxDist: 15, dmg: 15 }, { maxDist: Infinity, dmg: 10 }],
                limbMultiplier: 0.75
            };
        }
    };

    G["pistol_akimbo"] = {
        name: "Dual Pistols",
        type: "special",
        apply: (def) => {
            def.allowADS = false; 
            def.ammoPerShot = 2; // Consume 2 ammo per shot
            def.reloadTime = (def.reloadTime || 1.8) * 2.0; 
            def.magazineSize *= 2; 
            def.reserveAmmo *= 2;  
            def.projectilesPerShot = 2; 
            
            // Mobility Reduction (-3%)
            def.sprintMultiplier = (def.sprintMultiplier || 1.2) * 0.97;

            if (def.visuals && def.visuals.hipPosition) {
                def.visuals.hipPosition.x = 0.0; 
            }
            if (def.visuals) {
                def.visuals.sprintRotation = { x: 0, y: 0, z: 0 };
                def.visuals.sprintPosition = { x: 0, y: -0.1, z: -0.2 };
            }
            if (def.visuals && def.visuals.ikStats) {
                def.visuals.leftHandOffset = { x: 0, y: 0, z: 0 }; 
                def.visuals.ikStats.leftHandMode = 'grip';
            }
            let spreadFactor = 2.5; 
            if (def.automatic) spreadFactor *= 0.7; 
            def.hipfireSpread = (def.hipfireSpread || 0.03) * spreadFactor;
        }
    };

    // Rails handled by Common Attachments logic (pistol_flash/laser mapped there)

    console.log("Attachments: Pistol loaded");
})();
