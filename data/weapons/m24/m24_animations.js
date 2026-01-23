
// js/data/weapons/m24/m24_animations.js
(function() {
    const weapon = window.TacticalShooter.GameData.Weapons["M24"];
    if (!weapon) return;

    weapon.animationLogic = {
        hasEjected: false,
        hasEjectedReload: false,
        
        updateParts(dt, playerState, parts, weaponDef, ejectCallback, dropMagCallback) {
            const boltGroup = parts.slide;   // Moves Z
            const handleGroup = parts.handle; // Rotates Z
            const handLeft = parts.handLeft; 
            const shellMesh = parts.shell;
            
            if (!boltGroup || !handleGroup) return;
            
            const isReloading = playerState.isReloading; 
            const wm = window.TacticalShooter.WeaponManager;
            const fireCycle = wm ? wm.fireTimer : 0;
            const fireRate = weaponDef.fireRate; // 0.75s now

            // Bolt positions (in meters)
            // Model: closed Z=60mm (0.06). 
            // Open: Pull back ~100mm -> Z=0.16.
            const closedZ = 0.06;
            const openZ = 0.16;
            
            // Handle rotations (Radians)
            // Closed: 0 (Horizontal)
            // Open: ~60 deg up
            const handleDown = 0;
            const handleUp = 60 * (Math.PI / 180);

            // --- RELOAD ANIMATION (Manual Insert) ---
            if (isReloading) {
                const t = playerState.reloadTimer;
                const phase = playerState.reloadPhase;
                
                // Keep bolt open during reload loop
                handleGroup.rotation.z = handleUp;
                boltGroup.position.z = openZ;

                if (phase === 'start') {
                    // Open Bolt
                    if (t < 0.3) { // Lift
                        const p = t/0.3;
                        handleGroup.rotation.z = p * handleUp;
                        boltGroup.position.z = closedZ;
                    } else if (t < 0.6) { // Pull
                        const p = (t - 0.3)/0.3;
                        handleGroup.rotation.z = handleUp;
                        boltGroup.position.z = window.THREE.MathUtils.lerp(closedZ, openZ, p);
                        
                        // PARTIAL RELOAD EJECTION LOGIC
                        if (p > 0.6 && !this.hasEjectedReload) {
                            // If we didn't shoot dry (chambering required is false), we have a round in chamber.
                            // Eject it to clear chamber for reloading.
                            if (!playerState.reloadChamberingRequired && playerState.currentAmmo > 0) {
                                this.hasEjectedReload = true;
                                if (ejectCallback) ejectCallback();
                                // Decrement ammo (waste round)
                                playerState.currentAmmo = Math.max(0, playerState.currentAmmo - 1);
                            }
                        }
                    }
                    if (shellMesh) shellMesh.visible = false;
                }
                else if (phase === 'loop') {
                    // Insert Round
                     if (handLeft) {
                        if (t < 0.25) {
                            if (shellMesh) shellMesh.visible = true;
                            const p = t / 0.25;
                            // Move hand to breech
                            handLeft.position.lerpVectors(
                                new window.THREE.Vector3(0, -0.3, 0.1),
                                new window.THREE.Vector3(0, 0.06, 0.02),
                                p
                            );
                            handLeft.rotation.x = -0.5 * p; 
                            handLeft.rotation.z = 0.5 * p;
                        } else {
                            if (shellMesh) shellMesh.visible = false;
                            const p = (t - 0.25) / 0.25;
                            handLeft.position.lerpVectors(
                                new window.THREE.Vector3(0, 0.06, 0.02),
                                new window.THREE.Vector3(0, -0.3, 0.1),
                                p
                            );
                            handLeft.rotation.set(0,0,0);
                        }
                    }
                }
                return;
            } else {
                this.hasEjectedReload = false; // Reset for next reload
            }

            // --- FIRING CYCLE (Automatic Bolt) ---
            if (fireCycle > 0) {
                // Progress goes 0 -> 1 over fireRate duration.
                // FireTimer counts DOWN. So 1.0 is start, 0.0 is end.
                // Let's invert it: 0.0 = Start of shot, 1.0 = Ready for next.
                const p = 1.0 - (fireCycle / fireRate); 
                
                // Cycle: 0.75s Total
                // 0.00 - 0.15: Pause (Recoil)
                // 0.15 - 0.30: Unlock (Handle Up)
                // 0.30 - 0.50: Open (Bolt Back) -> Eject
                // 0.50 - 0.60: Pause Open
                // 0.60 - 0.80: Close (Bolt Forward)
                // 0.80 - 0.95: Lock (Handle Down)
                
                if (shellMesh) shellMesh.visible = false;
                if (handLeft) handLeft.position.set(0, -0.04, -0.35); // Reset hand

                if (p < 0.15) {
                    // Just recoil, bolt locked
                    handleGroup.rotation.z = handleDown;
                    boltGroup.position.z = closedZ;
                    this.hasEjected = false;
                }
                else if (p < 0.30) {
                    // Unlock
                    const subP = (p - 0.15) / 0.15;
                    handleGroup.rotation.z = window.THREE.MathUtils.lerp(handleDown, handleUp, subP);
                    boltGroup.position.z = closedZ;
                }
                else if (p < 0.50) {
                    // Open
                    const subP = (p - 0.30) / 0.20;
                    handleGroup.rotation.z = handleUp;
                    boltGroup.position.z = window.THREE.MathUtils.lerp(closedZ, openZ, subP);
                    
                    // Eject at end of pull
                    if (subP > 0.8 && !this.hasEjected) {
                        this.hasEjected = true;
                        if (ejectCallback) ejectCallback();
                    }
                }
                else if (p < 0.60) {
                    // Hold Open
                    handleGroup.rotation.z = handleUp;
                    boltGroup.position.z = openZ;
                }
                else if (p < 0.80) {
                    // Close
                    const subP = (p - 0.60) / 0.20;
                    handleGroup.rotation.z = handleUp;
                    boltGroup.position.z = window.THREE.MathUtils.lerp(openZ, closedZ, subP);
                }
                else if (p < 0.95) {
                    // Lock
                    const subP = (p - 0.80) / 0.15;
                    handleGroup.rotation.z = window.THREE.MathUtils.lerp(handleUp, handleDown, subP);
                    boltGroup.position.z = closedZ;
                }
                else {
                    // Done
                    handleGroup.rotation.z = handleDown;
                    boltGroup.position.z = closedZ;
                }
            } 
            else {
                // Idle
                // Smoothly return to locked state in case interrupted
                handleGroup.rotation.z = window.THREE.MathUtils.lerp(handleGroup.rotation.z, handleDown, dt * 15);
                boltGroup.position.z = window.THREE.MathUtils.lerp(boltGroup.position.z, closedZ, dt * 15);
                if (shellMesh) shellMesh.visible = false;
                if (handLeft) handLeft.position.set(0, -0.04, -0.35);
            }
        },

        getOffsets(playerState, weaponDef) {
            const wm = window.TacticalShooter.WeaponManager;
            const p = wm.fireTimer > 0 ? (1.0 - (wm.fireTimer / weaponDef.fireRate)) : 0;
            
            // Subtle roll during bolt operation
            if (p > 0.2 && p < 0.9) {
                return { pos: new window.THREE.Vector3(0,0,0), rot: new window.THREE.Euler(0, 0, 0.15) }; 
            }
            
            if (playerState.isReloading) {
                return { pos: new window.THREE.Vector3(0,-0.05,0), rot: new window.THREE.Euler(0.2, 0.1, 0.3) };
            }
            
            return { pos: new window.THREE.Vector3(0,0,0), rot: new window.THREE.Euler(0,0,0) };
        }
    };
})();
