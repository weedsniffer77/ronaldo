
// js/data/weapons/type92/type92_attachments.js
(function() {
    const G = window.TacticalShooter.GameData.Attachments;

    G["type92_trigger_match"] = {
        name: "MATCH TRIGGER",
        type: "trigger",
        apply: (def) => {
            // Full Auto conversion at 450 RPM (60/450 = 0.1333s delay)
            // If Subsonic is already applied, it will be handled by the subsonic attachment logic if it ran first? 
            // No, attachments are processed in order. 
            // We set a flag here so later attachments know.
            
            def.automatic = true;
            def.isMatchTrigger = true;
            
            // Check if subsonic applied first
            if (def.isSubsonic) {
                def.fireRate = 0.2; // 300 RPM
            } else {
                def.fireRate = 0.1333; // 450 RPM
            }
            
            // Reduced Accuracy (-15%)
            def.hipfireSpread = (def.hipfireSpread || 0.025) * 1.15;
            def.adsSpread = (def.adsSpread || 0.001) * 1.15;
            
            // Reduced Control (-10%)
            def.recoilPitch = (def.recoilPitch || 0.015) * 1.1;
            def.recoilYaw = (def.recoilYaw || 0.005) * 1.1;
            
            // Custom Visual Stat Override
            def.visuals = def.visuals || {};
            def.visuals.customStats = {
                fireRate: 45 // 450 RPM
            };
        }
    };

    G["type92_suppressor"] = {
        name: "Suppressor",
        type: "barrel",
        description: "no muzzle flash, dead enemies' cameras won't focus on you after they are killed",
        apply: (def) => {
            if (!def.visuals) def.visuals = {};
            // Completely eliminate flash
            def.visuals.muzzleFlashScale = 0; 
            def.visuals.muzzleFlashIntensity = 0;
            
            def.recoilPitch *= 0.9;
            def.recoilYaw *= 0.9;
            def.range *= 1.05;
            def.sprintMultiplier = (def.sprintMultiplier || 1.15) * 0.925;
        }
    };

    G["type92_ammo_subsonic"] = {
        name: "SUBSONIC AMMO",
        type: "special",
        requirements: ["type92_suppressor"],
        description: "barely visible hit sparks, headshots deal 100 damage at close range",
        apply: (def) => {
            def.isSubsonic = true;
            def.ballistics.muzzleVelocity = 320;
            
            // Damage Reduced to 17.5
            def.damage = 17.5;
            
            // Range Reduced by 30%
            def.range *= 0.7;
            
            // Control Increased by 15%
            def.recoilPitch *= 0.85;
            def.recoilYaw *= 0.85;
            
            // Fire Rate Check: If automatic (Match Trigger), set to 300 RPM
            if (def.automatic || def.isMatchTrigger) {
                def.fireRate = 0.2; // 300 RPM
                if (!def.visuals) def.visuals = {};
                def.visuals.customStats = { fireRate: 30 };
            }
            
            if (!def.effects) def.effects = {};
            def.effects.impact = {
                useDebris: true,
                color: 0x888888, 
                opacity: 0.6,
                size: 0.06,
                speed: 3.0,
                gravity: -9.8,
                particleCount: 6,
                lifetime: 0.5
            };
            
            // Subsonic removes flash entirely too
            if (!def.visuals) def.visuals = {};
            def.visuals.muzzleFlashIntensity = 0;
            def.visuals.muzzleFlashScale = 0;

            // Custom Headshot Damage Profile
            if (!def.damageFalloff) def.damageFalloff = {};
            // Close range (0-5m) = 100 damage headshot.
            // Beyond that, standard falloff applies (though modified by base damage reduction usually).
            def.damageFalloff.head = [
                { maxDist: 5, dmg: 100 }, // 1-tap range
                { maxDist: 20, dmg: 40 }, 
                { maxDist: Infinity, dmg: 20 }
            ];
        }
    };

    console.log("Attachments: Type 92 loaded");
})();
