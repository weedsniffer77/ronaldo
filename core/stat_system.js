
// js/core/stat_system.js
(function() {
    const StatSystem = {
        // Deep clone helper to prevent attachments from permanently altering the base weapon data
        cloneWeaponDefinition(baseDef) {
            if (!baseDef) return null;
            const newDef = { ...baseDef };
            if (baseDef.visuals) newDef.visuals = JSON.parse(JSON.stringify(baseDef.visuals));
            if (baseDef.ballistics) newDef.ballistics = JSON.parse(JSON.stringify(baseDef.ballistics));
            if (baseDef.effects) newDef.effects = JSON.parse(JSON.stringify(baseDef.effects));
            if (baseDef.damageFalloff) newDef.damageFalloff = JSON.parse(JSON.stringify(baseDef.damageFalloff));
            if (baseDef.attachmentSlots) newDef.attachmentSlots = JSON.parse(JSON.stringify(baseDef.attachmentSlots));
            newDef.attachments = [];
            return newDef;
        },

        getAllAttachmentsForWeapon(weaponId, gameData) {
            const globalAtts = gameData.Attachments || {};
            const weaponDef = gameData.Weapons[weaponId];
            const localAtts = (weaponDef && weaponDef.localAttachments) ? weaponDef.localAttachments : {};
            return { ...globalAtts, ...localAtts };
        },

        calculateWeaponStats(baseId, attachmentIds, gameData) {
            const baseDef = gameData.Weapons[baseId];
            if (!baseDef) {
                console.error(`StatSystem: Weapon ID ${baseId} not found.`);
                return null;
            }
            const finalDef = this.cloneWeaponDefinition(baseDef);
            const allAttachments = this.getAllAttachmentsForWeapon(baseId, gameData);
            const appliedIds = [];
            (attachmentIds || []).forEach(attId => {
                const attData = allAttachments[attId];
                if (attData && typeof attData.apply === 'function') {
                    try { attData.apply(finalDef); appliedIds.push(attId); } 
                    catch (e) { console.error(`StatSystem: Error applying attachment ${attId}`, e); }
                }
            });
            finalDef.attachments = appliedIds;
            return finalDef;
        },

        getDisplayStats(def) {
            if (!def) return { damage: 0, range: 0, accuracy: 0, control: 0, mobility: 0, reload: 0, fireRate: 0 };

            // --- THROWABLES ---
            if (def.type === 'throwable') {
                const exp = def.explosion || {};
                const dmg = exp.maxDamage || 0;
                const rad = exp.radius || 0;
                
                let damScore = dmg;
                if (dmg > 10) damScore = dmg * 1.2;
                
                const radScore = Math.min(200, (rad / 20) * 200);
                return {
                    damage: Math.round(damScore),
                    radius: Math.round(radScore),
                    isThrowable: true,
                    rawDamage: dmg,
                    rawRadius: rad
                };
            }
            
            // --- MELEE ---
            if (def.type === 'melee') {
                const dmg = def.damage || 50;
                const damScore = dmg * 2;
                
                const sprint = def.sprintMultiplier || 1.3;
                const mobScore = Math.round(sprint * 100);
                
                const rate = def.fireRate || 1.0;
                const speedScore = Math.max(0, 200 * (1.0 - (rate / 5.0)));
                
                return {
                    damage: Math.round(damScore),
                    mobility: mobScore,
                    attackSpeed: Math.round(speedScore),
                    isMelee: true,
                    rawSpeed: rate
                };
            }

            // --- GUNS ---
            const shots = def.projectilesPerShot || 1;
            let totalDmg = def.damage || 0;
            // Intelligent total calc for UI
            if (shots > 1 && totalDmg < 50) totalDmg *= shots; 
            
            // Score Calc (Visual Bar)
            let damageScore = 0;
            if (shots > 1) damageScore = totalDmg * 0.833;
            else damageScore = totalDmg * 2.0;

            // RANGE
            // Get effective range (start of falloff or max range)
            let maxEffectiveRange = def.range || 50;
            if (def.damageFalloff && def.damageFalloff.base && def.damageFalloff.base.length > 0) {
                // The first entry is usually the "max damage" range
                maxEffectiveRange = def.damageFalloff.base[0].maxDist;
            }
            
            // Updated: Use Effective Range for visual bar (Scale: 1m = 2.5pts, 80m = 200)
            const rangeScore = Math.min(200, maxEffectiveRange * 2.5);

            // ACCURACY
            const spread = def.hipfireSpread !== undefined ? def.hipfireSpread : 0.05;
            const accScore = Math.max(0, 200 * (1.0 - (spread / 0.1)));

            // CONTROL (Pure Recoil)
            const pitch = def.recoilPitch || 0;
            const yaw = def.recoilYaw || 0;
            let visualMultiplier = 1.0;
            if (def.visuals && def.visuals.statRecoilMultiplier) visualMultiplier = def.visuals.statRecoilMultiplier;
            
            let totalRecoil = (pitch + yaw) * visualMultiplier;
            if (!def.automatic) totalRecoil /= 2;

            // Increased sensitivity (0.2 -> 0.1) to spread high stats
            const recoilScore = Math.max(0, 200 * (1.0 - (totalRecoil / 0.1)));
            // ADS Time removed from Control

            // MOBILITY (Composite)
            // Sprint % (Base 100) + ADS Speed + Draw Speed
            const sprint = def.sprintMultiplier || 1.0;
            const adsSpeed = (def.visuals && def.visuals.adsInSpeed) ? def.visuals.adsInSpeed : 10;
            const drawTime = def.drawTime || 0.5;
            
            // Weights: 
            // Sprint: 1.0 = 100pts
            // ADS: 20.0 = 50pts
            // Draw: 0.5 = 30pts
            const mobScore = (sprint * 100) + (adsSpeed * 2.0) + (1.0 / drawTime * 15.0) - 50; 
            const finalMobScore = Math.min(200, Math.max(0, mobScore));

            // RELOAD
            let relTime = def.reloadTime || 3.0;
            if (def.reloadType === 'incremental') {
                relTime = (def.reloadStart || 1.0) + ((def.reloadLoop || 0.5) * (def.magazineSize || 1));
            }
            const relScore = Math.min(200, 400 / Math.max(0.5, relTime));
            
            // FIRE RATE
            const rpm = (1.0 / (def.fireRate || 0.1)) * 60;
            let rofScore = rpm / 10; 
            if (!def.automatic) rofScore /= 2;

            // --- CUSTOM OVERRIDES ---
            const stats = {
                damage: Math.round(damageScore),
                range: Math.round(rangeScore),
                accuracy: Math.round(accScore),
                control: Math.round(recoilScore),
                mobility: Math.round(finalMobScore),
                reload: Math.round(relScore),
                fireRate: Math.round(rofScore),
                
                // Raw Values for Text Display
                rawDamage: totalDmg,
                rawRange: maxEffectiveRange,
                rawReload: relTime,
                rawSprint: Math.round(sprint * 100),
                isThrowable: false,
                isMelee: false
            };

            // Apply overrides if present (e.g. for custom Fire Rate display)
            if (def.visuals && def.visuals.customStats) {
                const overrides = def.visuals.customStats;
                for (const key in overrides) {
                    if (stats[key] !== undefined) stats[key] = overrides[key];
                }
            }

            return stats;
        }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.StatSystem = StatSystem;
})();
