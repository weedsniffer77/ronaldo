
// js/player/player_state.js
(function() {
    // Facade Pattern: Aggregates sub-modules while maintaining original API
    const PlayerState = {
        modules: {
            health: null,
            ammo: null
        },

        // Animation/Action Flags
        isADS: false,
        isInspecting: false,
        isAttachmentOn: false,
        currentActionId: 0,
        actionStartTime: 0,
        
        // Cache for attachment states per weapon ID
        weaponAttachmentStates: {},
        
        DEATH_CAM_DURATION: 5.0,

        // --- Getters/Setters directing to Modules ---
        get health() { return this.modules.health ? this.modules.health.hp : 100; },
        set health(v) { if(this.modules.health) this.modules.health.hp = v; },
        
        get maxHealth() { return this.modules.health ? this.modules.health.maxHp : 100; },
        get isDead() { return this.modules.health ? this.modules.health.isDead : false; },
        set isDead(v) { if(this.modules.health) this.modules.health.isDead = v; },
        
        get damageHealth() { return this.modules.health ? this.modules.health.damageHealth : 100; },
        get deathTimer() { return this.modules.health ? this.modules.health.deathTimer : 0; },
        set deathTimer(v) { if(this.modules.health) this.modules.health.deathTimer = v; },
        
        get deployWaitTimer() { return this.modules.health ? this.modules.health.deployWaitTimer : 0; },
        set deployWaitTimer(v) { if(this.modules.health) this.modules.health.deployWaitTimer = v; },

        get currentAmmo() { return this.modules.ammo ? this.modules.ammo.currentAmmo : 0; },
        set currentAmmo(v) { if(this.modules.ammo) this.modules.ammo.currentAmmo = v; },
        
        get maxAmmo() { return this.modules.ammo ? this.modules.ammo.maxAmmo : 0; },
        set maxAmmo(v) { if(this.modules.ammo) this.modules.ammo.maxAmmo = v; },
        
        get reserveAmmo() { return this.modules.ammo ? this.modules.ammo.reserve : 0; },
        set reserveAmmo(v) { if(this.modules.ammo) this.modules.ammo.reserve = v; }, // Added Setter for grenade logic
        
        get isReloading() { return this.modules.ammo ? this.modules.ammo.isReloading : false; },
        set isReloading(v) { if(this.modules.ammo) this.modules.ammo.isReloading = v; },
        
        get reloadTimer() { return this.modules.ammo ? this.modules.ammo.reloadTimer : 0; },
        get reloadPhase() { return this.modules.ammo ? this.modules.ammo.reloadPhase : 'none'; },
        
        get reloadChamberingRequired() { return this.modules.ammo ? this.modules.ammo.chamberingRequired : false; },
        
        get hasDroppedMag() { return this.modules.ammo ? this.modules.ammo.hasDroppedMag : false; },
        set hasDroppedMag(v) { if(this.modules.ammo) this.modules.ammo.hasDroppedMag = v; },
        
        get hasDroppedMagLeft() { return this.modules.ammo ? this.modules.ammo.hasDroppedMagLeft : false; },
        set hasDroppedMagLeft(v) { if(this.modules.ammo) this.modules.ammo.hasDroppedMagLeft = v; },
        
        get pumpStage() { return this.modules.ammo ? this.modules.ammo.pumpStage : 0; },
        get pumpTimer() { return this.modules.ammo ? this.modules.ammo.pumpTimer : 0; },
        
        get needsPump() { return this.modules.ammo ? this.modules.ammo.needsPump : false; },
        get isPumping() { return this.modules.ammo ? this.modules.ammo.isPumping : false; },

        init() {
            console.log('PlayerState: Initializing (Facade Mode)...');
            
            // Init Sub-Modules
            if (window.TacticalShooter.PlayerHealth) this.modules.health = new window.TacticalShooter.PlayerHealth(this);
            if (window.TacticalShooter.PlayerAmmo) this.modules.ammo = new window.TacticalShooter.PlayerAmmo(this);
            
            this.resetSession();
            
            if (window.TacticalShooter.HUDManager) window.TacticalShooter.HUDManager.init();
            if (window.TacticalShooter.DeploymentScreen) window.TacticalShooter.DeploymentScreen.init();
            if (window.TacticalShooter.DamageIndicatorSystem) window.TacticalShooter.DamageIndicatorSystem.init();
            
            this.updateHUD();
        },
        
        resetSession() {
            // Reset Modules
            if (this.modules.health) this.modules.health.reset();
            if (this.modules.ammo) this.modules.ammo.reset();
            
            // Reset Flags
            this.isADS = false;
            this.isInspecting = false;
            this.isAttachmentOn = false;
            this.currentActionId = 0;
            this.weaponAttachmentStates = {}; // Clear cache
            
            // Load Weapon into Ammo Module
            if (window.TacticalShooter.WeaponManager) {
                const def = window.TacticalShooter.WeaponManager.currentWeapon;
                if (def) this.setWeapon(def);
            }
            this.updateHUD();
        },
        
        setWeapon(weaponDef) {
            if (this.modules.ammo) this.modules.ammo.setWeapon(weaponDef);
            this.isInspecting = false;
            
            // Load stored attachment state for this weapon ID
            if (weaponDef && weaponDef.id) {
                if (this.weaponAttachmentStates[weaponDef.id] !== undefined) {
                    this.isAttachmentOn = this.weaponAttachmentStates[weaponDef.id];
                } else {
                    this.isAttachmentOn = false; // Default off for new weapons
                }
            } else {
                this.isAttachmentOn = false;
            }
            
            this.updateHUD();
        },
        
        takeDamage(amount, sourceId, hitPart, impulseForce, isStealth, damageOrigin) {
            if (this.modules.health) this.modules.health.takeDamage(amount, sourceId, hitPart, impulseForce, isStealth, damageOrigin);
        },
        
        respawn() {
            if (this.modules.health && !this.modules.health.isDead) return;
            
            // 1. RE-EQUIP ORIGINAL LOADOUT (CRITICAL FIX)
            // This undoes any "bumping" or consumption of inventory from the previous life
            // ensuring we spawn with full grenades and correct slot assignments.
            if (window.TacticalShooter.LoadoutManager) {
                const lm = window.TacticalShooter.LoadoutManager;
                lm.equipLoadout(lm.currentLoadoutIndex); 
                lm.activeSlot = 'primary';
            }

            // 2. RE-INIT INVENTORY
            if (window.TacticalShooter.InventoryController) {
                window.TacticalShooter.InventoryController.initInventoryFromLoadout();
            }
            
            // 3. RESET WEAPON MANAGER & VISUALS
            if (window.TacticalShooter.WeaponManager) {
                window.TacticalShooter.WeaponManager.reset(); // Refreshes weapon, resets timers
                // Force visibility on in case it was hidden by a grenade throw
                if (window.TacticalShooter.GunRenderer) {
                    window.TacticalShooter.GunRenderer.setVisible(true);
                }
            }

            // 4. RESET STATE MODULES
            this.resetSession();
            
            // 5. CLEAR VISUAL ARTIFACTS (BLUR/RED SCREEN)
            if (window.TacticalShooter.PostProcessor) {
                window.TacticalShooter.PostProcessor.reset();
            }
            const canvas = document.getElementById('game-canvas');
            if (canvas) canvas.classList.remove('canvas-blur');
            
            if (window.TacticalShooter.PlayroomManager && window.TacticalShooter.PlayroomManager.myPlayer) {
                window.TacticalShooter.PlayroomManager.myPlayer.setState('ragdollData', null, true);
            }
            
            if (window.TacticalShooter.DeathCameraController) window.TacticalShooter.DeathCameraController.stop();
            if (window.TacticalShooter.GameManager) window.TacticalShooter.GameManager.spawnPlayer();
            if (window.TacticalShooter.DeploymentScreen) window.TacticalShooter.DeploymentScreen.hide();
            
            if (window.TacticalShooter.MultiplayerUI) {
                window.TacticalShooter.MultiplayerUI.requestPointerLock();
                window.TacticalShooter.MultiplayerUI.setHUDVisible(true);
            }
            
            this.updateHUD();
        },
        
        update(dt) {
            // Input Shortcut for Pre-Round (Legacy support)
            const MS = window.TacticalShooter.MatchState;
            const IM = window.TacticalShooter.InputManager;
            if (MS && MS.state.status === 'PRE_ROUND' && IM) {
                if (IM.justPressed['Digit1']) this.applyLoadout(0);
                if (IM.justPressed['Digit2']) this.applyLoadout(1);
                if (IM.justPressed['Digit3']) this.applyLoadout(2);
                if (IM.justPressed['Digit4']) this.applyLoadout(3);
                if (IM.justPressed['Digit5']) this.applyLoadout(4);
            }

            // Delegate to Health (Death/Respawn Logic)
            if (this.modules.health) {
                if (this.modules.health.isDead) {
                    this._updateDead(dt);
                    return;
                }
                this.modules.health.update(dt);
            }
            
            // Delegate to Ammo (Reload/Pump)
            if (this.modules.ammo) {
                this.modules.ammo.update(dt);
            }
            
            this.updateHUD();
            
            // Name Tag Sync
            const nameEl = document.getElementById('player-name-display');
            if (nameEl && window.TacticalShooter.PlayroomManager) {
                const actualName = window.TacticalShooter.PlayroomManager.localPlayerName || 'OPERATOR';
                if (nameEl.textContent !== actualName) nameEl.textContent = actualName;
            }
        },
        
        _updateDead(dt) {
            let enterJustPressed = false;
            if (window.TacticalShooter.InputManager && window.TacticalShooter.InputManager.justPressed['Enter']) {
                enterJustPressed = true;
            }
            
            if (this.deathTimer > 0) {
                this.deathTimer -= dt;
                if (enterJustPressed) {
                    this.deathTimer = 0; 
                    enterJustPressed = false;
                }
                if (this.deathTimer <= 0) {
                    // RETURN TO MAIN MENU AS DEATH SCREEN
                    if (window.TacticalShooter.DeploymentScreen) {
                        window.TacticalShooter.DeploymentScreen.hideDeathInfo();
                        window.TacticalShooter.DeploymentScreen.hide(); // Ensure old screen is hidden
                    }
                    if (window.TacticalShooter.GameManager) {
                        window.TacticalShooter.GameManager.enterMenu();
                    }
                    if (window.TacticalShooter.MultiplayerUI) {
                        window.TacticalShooter.MultiplayerUI.showMainMenu();
                        // Update loadout picker in main menu
                        if(this.renderLoadoutPicker) this.renderLoadoutPicker('menu-loadout-quick-select');
                    }
                }
                return;
            }
            // deployWaitTimer handled by menu interactions now
        },

        // --- Actions ---
        
        toggleAttachment() { 
            this.isAttachmentOn = !this.isAttachmentOn;
            // Save state for current weapon
            if (window.TacticalShooter.WeaponManager) {
                const def = window.TacticalShooter.WeaponManager.currentWeapon;
                if (def && def.id) {
                    this.weaponAttachmentStates[def.id] = this.isAttachmentOn;
                }
            }
        },
        
        setADS(active) {
            if (this.isDead || this.isReloading) { this.isADS = false; return; }
            this.isADS = active;
            if (active) this.isInspecting = false;
        },
        
        toggleInspect() {
            if (!this.isDead && !this.isReloading && !this.isADS && !this.isPumping && !this.needsPump) {
                this.isInspecting = !this.isInspecting;
            }
        },
        
        // Pass-throughs to Ammo Module
        startReload() { return this.modules.ammo ? this.modules.ammo.startReload() : false; },
        cancelReload() { if(this.modules.ammo) this.modules.ammo.cancelReload(); },
        consumeAmmo(n) { 
            if (this.isInspecting) this.isInspecting = false; // Interrupt inspect
            return this.modules.ammo ? this.modules.ammo.consume(n) : false; 
        },
        markNeedsPump() { if(this.modules.ammo) this.modules.ammo.markNeedsPump(); },
        triggerPump() { if(this.modules.ammo) this.modules.ammo.triggerPump(); },
        canShoot() { 
            if (this.maxAmmo === 0) return !this.isDead && !this.isReloading;
            return !this.isDead && !this.isReloading && !this.needsPump && !this.isPumping && this.currentAmmo > 0;
        },

        updateHUD() {
            if (window.TacticalShooter.HUDManager) {
                const weapon = window.TacticalShooter.WeaponManager ? window.TacticalShooter.WeaponManager.currentWeapon : null;
                if(weapon) window.TacticalShooter.HUDManager.update(this, weapon);
            }
        },
        
        // --- UI Helpers (Kept here for now) ---
        toggleInGameLoadoutPicker(show) {
             const picker = document.getElementById('ingame-loadout-picker');
            const status = document.getElementById('player-status');
            if (!picker || !status) return;
            if (show) {
                this.renderLoadoutPicker('ilp-list');
                picker.style.display = 'block';
                picker.classList.remove('fade-out');
                status.style.display = 'none';
            } else {
                picker.classList.add('fade-out');
                status.style.display = 'block';
                setTimeout(() => { if (picker.classList.contains('fade-out')) picker.style.display = 'none'; }, 500);
            }
        },
        
        renderLoadoutPicker(containerId) {
             const container = document.getElementById(containerId);
             if (!container) return;
             container.innerHTML = '';
             const LM = window.TacticalShooter.LoadoutManager;
             const GD = window.TacticalShooter.GameData;
             const currentIdx = LM.currentLoadoutIndex;
             LM.savedLoadouts.forEach((l, i) => {
                 const slot = document.createElement('div');
                 slot.className = `ilp-slot ${i === currentIdx ? 'active' : ''}`;
                 const getWepName = (id) => {
                     if(GD.Weapons[id]) return GD.Weapons[id].name;
                     if(GD.Throwables[id]) return GD.Throwables[id].name;
                     return id;
                 };
                 const getAttString = (id, atts) => {
                      if (!atts || atts.length === 0) return "";
                      const names = atts.map(aId => GD.Attachments[aId] ? GD.Attachments[aId].name : aId);
                      return names.join(" + ");
                 };
                 const pName = getWepName(l.primary.id);
                 const sName = getWepName(l.secondary.id);
                 const mName = getWepName(l.melee.id);
                 const pAtts = getAttString(l.primary.id, l.primary.attachments);
                 const sAtts = getAttString(l.secondary.id, l.secondary.attachments);
                 
                 // Get Throwable Names from actual slots
                 const t1 = l.equipment1 ? getWepName(l.equipment1.id) : "EMPTY";
                 const t2 = l.equipment2 ? getWepName(l.equipment2.id) : "EMPTY";
                 const gName = `${t1} + ${t2}`;
                 
                 let html = `<div class="ilp-num">${(i+1).toString().padStart(2, '0')}</div><div class="ilp-content"><span class="ilp-wep" ${pAtts ? `data-tooltip="${pName}: ${pAtts}"` : ''}>${pName}</span><span class="ilp-sep">|</span><span class="ilp-wep" ${sAtts ? `data-tooltip="${sName}: ${sAtts}"` : ''}>${sName}</span><span class="ilp-sep">|</span><span class="ilp-wep">${mName}</span><span class="ilp-sep">|</span><span class="ilp-wep">${gName}</span></div>`;
                 slot.innerHTML = html;
                 slot.onclick = () => this.applyLoadout(i);
                 container.appendChild(slot);
             });
        },
        
        applyLoadout(index) {
             const LM = window.TacticalShooter.LoadoutManager;
             LM.equipLoadout(index);
             this.renderLoadoutPicker('ilp-list');
             this.renderLoadoutPicker('deployment-loadout-container');
             // Also update Main Menu picker if active
             if (document.getElementById('menu-loadout-quick-select')) {
                 this.renderLoadoutPicker('menu-loadout-quick-select');
             }
             
             if (!this.isDead) {
                 this.resetSession(); 
                 // RE-INIT INVENTORY ON LOADOUT SWITCH TO PREVENT SYNC ISSUES
                 if (window.TacticalShooter.InventoryController) {
                     window.TacticalShooter.InventoryController.initInventoryFromLoadout();
                 }
                 if (window.TacticalShooter.WeaponManager) window.TacticalShooter.WeaponManager.refreshCurrentWeapon();
             }
        }
    };
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.PlayerState = PlayerState;
})();
