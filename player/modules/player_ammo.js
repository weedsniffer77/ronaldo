
// js/player/modules/player_ammo.js
(function() {
    class PlayerAmmo {
        constructor(stateContext) {
            this.state = stateContext; // Parent
            
            this.currentAmmo = 0;
            this.maxAmmo = 0;
            this.currentAmmoType = 'none';
            this.currentWeaponId = null;
            
            this.ammoPools = {};
            this.weaponMagCache = {};
            
            // Reload State
            this.isReloading = false;
            this.reloadTimer = 0;
            this.reloadPhase = 'none';
            this.chamberingRequired = false;
            this.hasAddedRound = false;
            
            // Flags
            this.hasDroppedMag = false;
            this.hasDroppedMagLeft = false;
            
            // Pump Action
            this.pumpStage = 0;
            this.pumpTimer = 0;
        }

        get reserve() {
            if (this.currentAmmoType && this.ammoPools[this.currentAmmoType] !== undefined) {
                return this.ammoPools[this.currentAmmoType];
            }
            return 0;
        }

        get needsPump() { return this.pumpStage === 1; }
        get isPumping() { return this.pumpStage === 2; }

        reset() {
            // 1. Clear Cache
            this.weaponMagCache = {};
            this.ammoPools = {};
            this.currentWeaponId = null; // Reset ID tracking
            
            // 2. Reset States
            this.isReloading = false;
            this.reloadPhase = 'none';
            this.chamberingRequired = false;
            this.pumpStage = 0;
            this.pumpTimer = 0;
            
            // 3. Re-read Loadout for Reserve Pools
            this._initFromLoadout();
        }

        _initFromLoadout() {
            if (!window.TacticalShooter.LoadoutManager) return;
            const loadout = window.TacticalShooter.LoadoutManager.activeLoadout;
            if (!loadout) return;
            
            const processSlot = (slotData) => {
                if (!slotData || !slotData.id) return;
                const def = window.TacticalShooter.LoadoutManager.generateModifiedDef(slotData.id, slotData.attachments);
                if (def && def.ammoType) {
                    const type = def.ammoType;
                    const amount = def.reserveAmmo || 0;
                    this.ammoPools[type] = (this.ammoPools[type] || 0) + amount;
                    // Pre-fill cache with full mags for all equipped guns
                    this.weaponMagCache[def.id] = def.magazineSize;
                }
            };
            
            processSlot(loadout.primary);
            processSlot(loadout.secondary);
        }

        setWeapon(weaponDef) {
            if (!weaponDef) return;
            
            // 1. SAVE PREVIOUS STATE
            // Only save if previous weapon was a GUN (not throwable/melee which handles its own ammo)
            // and if we have a valid ID.
            if (this.currentWeaponId) {
                const prevDef = window.TacticalShooter.GameData.Weapons[this.currentWeaponId];
                // If it was a gun (has magazineSize > 1 or ammoType), save it.
                // We avoid saving Grenade '1' into a Gun's cache slot if IDs overlap (unlikely but safe)
                if (prevDef && prevDef.type !== 'throwable' && prevDef.type !== 'melee') {
                    this.weaponMagCache[this.currentWeaponId] = this.currentAmmo;
                }
            }
            
            this.currentWeaponId = weaponDef.id;
            
            // 2. SETUP NEW WEAPON
            if (weaponDef.type === 'throwable') {
                // Grenades: Handled by InventoryController mainly. 
                // We just set visuals here to 1 so "canShoot" passes if checked.
                this.maxAmmo = 1;
                this.currentAmmo = 1;
                this.currentAmmoType = 'none';
            } 
            else if (weaponDef.type === 'melee') {
                this.maxAmmo = 0;
                this.currentAmmo = 0;
                this.currentAmmoType = 'none';
            }
            else {
                // Guns
                this.maxAmmo = weaponDef.magazineSize;
                this.currentAmmoType = weaponDef.ammoType || 'none';
                
                // Load from Cache or Default
                if (this.weaponMagCache[this.currentWeaponId] !== undefined) {
                    this.currentAmmo = this.weaponMagCache[this.currentWeaponId];
                } else {
                    this.currentAmmo = this.maxAmmo;
                    this.weaponMagCache[this.currentWeaponId] = this.currentAmmo;
                }
            }
            
            this.cancelReload();
            this.pumpStage = 0;
            this.pumpTimer = 0;
        }

        consume(amount = 1) {
            if (this.needsPump || this.isPumping) return false;
            if (this.maxAmmo === 0) return true; // Infinite/Melee
            
            if (this.currentAmmo > 0) {
                this.currentAmmo = Math.max(0, this.currentAmmo - amount);
                // Update Cache Immediately
                if (this.currentWeaponId) {
                     this.weaponMagCache[this.currentWeaponId] = this.currentAmmo;
                }
                return true;
            }
            return false;
        }

        startReload() {
            if (this.isReloading || this.isPumping) return false;
            if (this.maxAmmo === 0 || this.currentAmmo === this.maxAmmo) return false;
            if (this.reserve <= 0) return false;
            
            // Logic for Empty Reload vs Tactical
            if (this.pumpStage !== 0) {
                this.chamberingRequired = true;
                this.pumpStage = 0;
            } else {
                this.chamberingRequired = (this.currentAmmo === 0);
            }

            this.isReloading = true;
            this.reloadTimer = 0;
            this.hasAddedRound = false;
            this.hasDroppedMag = false;
            this.hasDroppedMagLeft = false;
            
            const weapon = window.TacticalShooter.WeaponManager.currentWeapon;
            if (weapon.reloadType === 'incremental') this.reloadPhase = 'start';
            else this.reloadPhase = 'standard';
            
            return true;
        }

        cancelReload() {
            if (this.isReloading) {
                this.isReloading = false;
                this.reloadPhase = 'none';
                // If cancelled while empty/pump needed, ensure pump state
                if (this.chamberingRequired && this.currentAmmo > 0) {
                    this.pumpStage = 1;
                } else {
                    this.chamberingRequired = false;
                }
            }
        }
        
        finishReload() {
            const weapon = window.TacticalShooter.WeaponManager.currentWeapon;
            if (weapon.reloadType !== 'incremental') {
                const needed = this.maxAmmo - this.currentAmmo;
                const available = Math.min(needed, this.reserve);
                
                this.currentAmmo += available;
                this.ammoPools[this.currentAmmoType] -= available;
                this.weaponMagCache[this.currentWeaponId] = this.currentAmmo;
            }
            this.isReloading = false;
            this.reloadPhase = 'none';
            this.reloadTimer = 0;
            
            if (this.chamberingRequired && this.currentAmmo > 0) {
                if (weapon.actionType === 'pump') this.triggerPump();
                else this.chamberingRequired = false;
            } else {
                this.chamberingRequired = false;
            }
        }
        
        triggerPump() {
            if (this.pumpStage === 1 || this.chamberingRequired) {
                this.pumpStage = 2;
                this.pumpTimer = 0;
            }
        }

        markNeedsPump() {
            this.pumpStage = 1;
        }

        update(dt) {
            const weapon = window.TacticalShooter.WeaponManager ? window.TacticalShooter.WeaponManager.currentWeapon : null;
            if (!weapon) return;

            // Reload Logic
            if (this.isReloading) {
                this.reloadTimer += dt;
                
                if (weapon.reloadType === 'incremental') {
                    if (this.reloadPhase === 'start') {
                        if (!this.hasAddedRound && this.reloadTimer >= 0.9) {
                            this._addSingleRound();
                            this.hasAddedRound = true;
                        }
                        if (this.reloadTimer >= weapon.reloadStart) {
                            if (this.chamberingRequired) this.chamberingRequired = false;
                            
                            if (this.currentAmmo >= this.maxAmmo || this.reserve <= 0) {
                                this.finishReload();
                            } else {
                                this.reloadPhase = 'loop';
                                this.reloadTimer = 0;
                                this.hasAddedRound = false;
                            }
                        }
                    } else if (this.reloadPhase === 'loop') {
                        if (this.reloadTimer >= weapon.reloadLoop) {
                            this._addSingleRound();
                            if (this.currentAmmo >= this.maxAmmo || this.reserve <= 0) this.finishReload();
                            else this.reloadTimer = 0;
                        }
                    }
                } else {
                    // Standard
                    if (this.reloadTimer >= (weapon.reloadTime || 2.0)) this.finishReload();
                }
            }
            
            // Pump Logic
            if (this.isPumping) {
                this.pumpTimer += dt;
                const cycleTime = weapon.pumpCycleTime || 0.35;
                if (this.pumpTimer >= cycleTime) {
                    this.pumpStage = 0;
                    this.chamberingRequired = false;
                }
                // Safety timeout
                if (this.pumpTimer > cycleTime * 3.0) {
                    this.pumpStage = 0; this.pumpTimer = 0;
                }
            }
        }
        
        _addSingleRound() {
            if (this.currentAmmo < this.maxAmmo && this.reserve > 0) {
                this.currentAmmo++;
                this.ammoPools[this.currentAmmoType]--;
                this.weaponMagCache[this.currentWeaponId] = this.currentAmmo;
            }
        }
    }

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.PlayerAmmo = PlayerAmmo;
})();
