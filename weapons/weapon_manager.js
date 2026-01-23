
// js/weapons/weapon_manager.js
(function() {
    const WeaponManager = {
        currentWeapon: null,
        fireTimer: 0, 
        drawTimer: 0, 
        
        // SWITCH LOGIC
        pendingSwitchSlot: null,
        switchTimer: 0,
        
        // GRENADE STATES
        grenadeState: 'idle', // idle, primed, throwing, recovery
        grenadeThrowTimer: 0,
        grenadeChargeTimer: 0,
        
        fPressed: false,
        lPressed: false,
        
        comboStep: 0,
        lastAttackTime: 0,
        
        init() {
            console.log('WeaponManager: Initializing...');
            if (!window.TacticalShooter.GameData || !window.TacticalShooter.GameData.Weapons) {
                setTimeout(() => this.init(), 100);
                return;
            }
            if (window.TacticalShooter.LoadoutManager) window.TacticalShooter.LoadoutManager.init();
            this.refreshCurrentWeapon();
        },
        
        initiateSwitch(slotName) {
            if (slotName.startsWith('equipment')) {
                const IC = window.TacticalShooter.InventoryController;
                const count = IC ? IC.getGrenadeCount(slotName) : 0;
                if (count <= 0) {
                    if (this.currentWeapon && this.currentWeapon.type === 'throwable') {
                        this.initiateSwitch('primary');
                    }
                    return; 
                }
            }

            const newDef = window.TacticalShooter.LoadoutManager.switchWeapon(slotName);
            if (newDef) {
                if (this.currentWeapon) {
                    this.pendingSwitchSlot = slotName;
                    this.switchTimer = this.currentWeapon.holsterTime || 0.4;
                    if (this.currentWeapon.type === 'throwable' && this.grenadeState === 'recovery') {
                        this.switchTimer = 0.1; 
                    }
                } else {
                    this.completeSwitch(newDef);
                }
            }
        },
        
        completeSwitch(newDef) {
            const playerState = window.TacticalShooter.PlayerState;
            playerState.setWeapon(newDef);
            this.currentWeapon = newDef;
            
            if (newDef.type === 'throwable') {
                const LM = window.TacticalShooter.LoadoutManager;
                const IC = window.TacticalShooter.InventoryController;
                const slot = LM.activeSlot;
                const totalCount = IC ? IC.getGrenadeCount(slot) : 1;
                playerState.currentAmmo = 1;
                playerState.reserveAmmo = Math.max(0, totalCount - 1);
                this.grenadeState = 'idle';
                this.grenadeChargeTimer = 0;
                this.grenadeThrowTimer = 0;
            }
            
            if (window.TacticalShooter.GunRenderer) {
                window.TacticalShooter.GunRenderer.resetRefs(); 
                window.TacticalShooter.GunRenderer.loadWeapon(newDef);
                if (window.TacticalShooter.HUDManager) {
                    window.TacticalShooter.HUDManager.update(playerState);
                }
            }
            
            this.drawTimer = newDef.drawTime || 0.5;
            this.fireTimer = 0; 
            this.comboStep = 0;
            this.pendingSwitchSlot = null;
        },
        
        refreshCurrentWeapon() {
            let newDef = window.TacticalShooter.LoadoutManager.getActiveWeaponDef();
            if (newDef) {
                this.currentWeapon = newDef;
                this.fireTimer = 0; this.drawTimer = 0; this.switchTimer = 0; this.pendingSwitchSlot = null;
                if (window.TacticalShooter.PlayerState) window.TacticalShooter.PlayerState.setWeapon(this.currentWeapon);
                if (window.TacticalShooter.GunRenderer) {
                    window.TacticalShooter.GunRenderer.loadWeapon(this.currentWeapon);
                }
            }
        },
        
        reset() {
            if (window.TacticalShooter.PlayerState) window.TacticalShooter.PlayerState.resetSession();
            if (window.TacticalShooter.GunRenderer) window.TacticalShooter.GunRenderer.resetRefs();
            if (window.TacticalShooter.LoadoutManager) window.TacticalShooter.LoadoutManager.activeSlot = 'primary'; 
            this.refreshCurrentWeapon();
            if (window.TacticalShooter.GunRenderer && window.TacticalShooter.GunRenderer.warmup) window.TacticalShooter.GunRenderer.warmup();
        },
        
        playGunshotSound() {
            if (window.TacticalShooter.AudioManager) window.TacticalShooter.AudioManager.playGunshot();
        },
        
        update(dt, inputManager, playerState, playerCamera) {
            if (window.TacticalShooter.Ballistics) window.TacticalShooter.Ballistics.update(dt);
            
            if (this.pendingSwitchSlot) {
                this.switchTimer -= dt;
                if (this.switchTimer <= 0) {
                    const newDef = window.TacticalShooter.LoadoutManager.getActiveWeaponDef();
                    if (newDef) this.completeSwitch(newDef);
                    else this.pendingSwitchSlot = null;
                }
                if (window.TacticalShooter.GunRenderer) {
                    window.TacticalShooter.GunRenderer.update(dt, playerState, window.TacticalShooter.CharacterController, inputManager, false);
                }
                return; 
            }

            if (!this.currentWeapon) return;
            
            const crosshairEl = document.getElementById('crosshair');
            if (crosshairEl) {
                const isUIHidden = window.TacticalShooter.UIManager && window.TacticalShooter.UIManager.uiHidden;
                const shouldHide = playerState.isADS && this.currentWeapon.visuals && this.currentWeapon.visuals.hideCrosshair;
                
                if (shouldHide && !isUIHidden) {
                    crosshairEl.style.display = 'none';
                } else if (!isUIHidden) {
                    crosshairEl.style.display = 'block';
                }
            }

            if (playerState.isDead) {
                if (this.currentWeapon.type === 'throwable' && (this.grenadeState === 'primed' || this.grenadeState === 'throwing')) {
                    this.performDrop(playerCamera);
                    this.grenadeState = 'idle';
                }
                return;
            }
            
            if (this.fireTimer > 0) this.fireTimer -= dt;
            if (this.drawTimer > 0) this.drawTimer -= dt;
            
            let inputBlocked = (window.TacticalShooter.MatchState && window.TacticalShooter.MatchState.state.status === 'PRE_ROUND');

            if (!inputBlocked) {
                if (this.currentWeapon.type !== 'throwable') {
                    if (inputManager.isActionActive('Reload')) playerState.startReload(); 
                    if (inputManager.isActionActive('Inspect')) { if (!this.fPressed) { playerState.toggleInspect(); this.fPressed = true; } } else { this.fPressed = false; }
                    if (inputManager.wasActionJustPressed('AttachmentFunctionality')) { if (!this.lPressed) { playerState.toggleAttachment(); this.lPressed = true; } } else { this.lPressed = false; }
                }
            }
            
            if (this.currentWeapon.type === 'throwable') {
                this.updateGrenadeLogic(dt, inputManager, playerState, playerCamera, inputBlocked);
                if (window.TacticalShooter.GunRenderer) {
                    const isThrowing = (this.grenadeState === 'throwing');
                    if (this.grenadeState === 'recovery') window.TacticalShooter.GunRenderer.setVisible(false);
                    else window.TacticalShooter.GunRenderer.setVisible(true);
                    window.TacticalShooter.GunRenderer.update(dt, playerState, window.TacticalShooter.CharacterController, inputManager, isThrowing);
                }
                return;
            }

            if (window.TacticalShooter.GunRenderer) window.TacticalShooter.GunRenderer.setVisible(true);

            let canADS = true;
            if (this.currentWeapon.type === 'melee' || this.currentWeapon.allowADS === false) canADS = false;
            
            const isBlocked = window.TacticalShooter.GunRenderer && window.TacticalShooter.GunRenderer.isBarrelBlocked;
            let adsActive = !inputBlocked && inputManager.isActionActive('ADS') && canADS;
            if (isBlocked) adsActive = false;
            playerState.setADS(adsActive);
            
            let isShooting = false;
            if (!inputBlocked) {
                isShooting = this.currentWeapon.automatic ? inputManager.isActionActive('Shoot') : inputManager.wasActionJustPressed('Shoot');
            }
            
            if (isShooting && !isBlocked) {
                if (playerState.needsPump) playerState.triggerPump(); 
                else {
                    if (playerState.isReloading && this.currentWeapon.reloadType === 'incremental') playerState.cancelReload(); 
                    this.attemptFire(playerState, playerCamera);
                }
            } else if (isShooting && playerState.currentAmmo === 0) {
                // SettingsManager AutoReload Check
                const autoReload = window.TacticalShooter.SettingsManager ? window.TacticalShooter.SettingsManager.settings.autoReload : true;
                if (autoReload && playerState.reserveAmmo > 0) playerState.startReload();
            }

            if (window.TacticalShooter.GunRenderer) {
                const isFiring = this.fireTimer > 0;
                window.TacticalShooter.GunRenderer.update(dt, playerState, window.TacticalShooter.CharacterController, inputManager, isFiring);
            }
        },
        
        updateGrenadeLogic(dt, inputManager, playerState, playerCamera, inputBlocked) {
            const settings = window.TacticalShooter.SettingsManager ? window.TacticalShooter.SettingsManager.settings : { grenadeUseADS: false };
            const useADSKey = settings.grenadeUseADS;
            const isADS = inputManager.isActionActive('ADS');
            const isShoot = inputManager.isActionActive('Shoot'); 
            const justShot = inputManager.wasActionJustPressed('Shoot'); 
            if (this.grenadeThrowTimer > 0) this.grenadeThrowTimer -= dt;

            if (this.grenadeState === 'idle') {
                this.grenadeChargeTimer = 0; 
                if (useADSKey) { if (isADS && !inputBlocked) { this.grenadeState = 'primed'; playerState.setADS(true); } } 
                else { if (isShoot && !inputBlocked) { this.grenadeState = 'primed'; playerState.setADS(true); } }
            }
            else if (this.grenadeState === 'primed') {
                this.grenadeChargeTimer += dt;
                playerState.setADS(true); 
                if (useADSKey) { if (!isADS) { this.grenadeState = 'idle'; playerState.setADS(false); } else if (justShot && !inputBlocked) { this.triggerThrow(playerState); } } 
                else { if (isADS) { this.grenadeState = 'idle'; playerState.setADS(false); } else if (!isShoot && !inputBlocked) { this.triggerThrow(playerState); } }
            }
            else if (this.grenadeState === 'throwing') {
                if (this.grenadeThrowTimer <= 0) {
                    this.performThrow(playerCamera, playerState);
                    this.grenadeState = 'recovery';
                    this.grenadeThrowTimer = 0.5;
                }
            }
            else if (this.grenadeState === 'recovery') {
                if (this.grenadeThrowTimer <= 0) {
                    const LM = window.TacticalShooter.LoadoutManager;
                    const IC = window.TacticalShooter.InventoryController;
                    const slot = LM.activeSlot;
                    const count = IC ? IC.getGrenadeCount(slot) : 0;
                    if (count > 0) {
                        const currentDef = LM.getActiveWeaponDef();
                        if (currentDef.id !== this.currentWeapon.id) {
                            this.currentWeapon = currentDef;
                            if (window.TacticalShooter.GunRenderer) window.TacticalShooter.GunRenderer.loadWeapon(this.currentWeapon);
                        }
                        this.currentWeapon.reserveAmmo = count - 1;
                        playerState.currentAmmo = 1;
                        playerState.reserveAmmo = count - 1;
                        this.grenadeState = 'idle';
                        this.drawTimer = this.currentWeapon.drawTime || 0.5;
                        this.grenadeChargeTimer = 0;
                    } else {
                        this.initiateSwitch('primary');
                    }
                }
            }
        },
        
        triggerThrow(playerState) {
            this.grenadeState = 'throwing';
            this.grenadeThrowTimer = 0.15; 
            playerState.setADS(false); 
            if (window.TacticalShooter.GunRenderer) window.TacticalShooter.GunRenderer.triggerMeleeAnimation();
        },
        
        performThrow(playerCamera, playerState) {
            const TM = window.TacticalShooter.ThrowableManager;
            const IC = window.TacticalShooter.InventoryController;
            const LM = window.TacticalShooter.LoadoutManager;
            const PM = window.TacticalShooter.PlayroomManager;
            
            if (TM && IC) {
                const origin = playerCamera.camera.position.clone();
                const dir = playerCamera.getForwardDirection();
                dir.y += 0.2; 
                dir.normalize();
                
                const chargeTime = 1.5;
                const chargeRatio = Math.min(this.grenadeChargeTimer, chargeTime) / chargeTime; 
                const powerMult = 0.6 + (chargeRatio * 0.9);
                
                const right = playerCamera.getRightDirection();
                origin.add(right.multiplyScalar(0.2));
                
                // Spawn Local and Get Velocity Vector
                const myId = PM && PM.myPlayer ? PM.myPlayer.id : "SELF";
                const velocity = TM.throwItem(origin, dir, this.currentWeapon.id, powerMult, myId);
                
                // Broadcast to Network
                if (PM) {
                    PM.broadcastThrow(origin, velocity, this.currentWeapon.id);
                }
                
                IC.consumeGrenade(LM.activeSlot);
                const count = IC.getGrenadeCount(LM.activeSlot);
                this.currentWeapon.reserveAmmo = Math.max(0, count - 1);
                playerState.currentAmmo = (count > 0) ? 1 : 0;
                playerState.reserveAmmo = Math.max(0, count - 1);
                
                if (window.TacticalShooter.HUDManager) window.TacticalShooter.HUDManager.update(playerState);
                this.grenadeChargeTimer = 0;
            }
        },
        
        performDrop(playerCamera) {
            const TM = window.TacticalShooter.ThrowableManager;
            const IC = window.TacticalShooter.InventoryController;
            const LM = window.TacticalShooter.LoadoutManager;
            const PM = window.TacticalShooter.PlayroomManager;
            
            if (TM && IC) {
                const origin = playerCamera.camera.position.clone();
                const dir = new THREE.Vector3((Math.random()-0.5)*0.2, -1, (Math.random()-0.5)*0.2).normalize();
                
                const myId = PM && PM.myPlayer ? PM.myPlayer.id : "SELF";
                const velocity = TM.throwItem(origin, dir, this.currentWeapon.id, 0.1, myId);
                
                // Broadcast Drop
                if (PM) {
                    PM.broadcastThrow(origin, velocity, this.currentWeapon.id);
                }
                
                IC.consumeGrenade(LM.activeSlot);
            }
        },
        
        onBulletHit(result, weapon) {
            const isMelee = (weapon.type === 'melee');
            const pm = window.TacticalShooter.ParticleManager;

            if (result.object && result.object.userData.type === 'player') {
                if(pm) pm.createBloodSparks(result.point, result.normal);
                const hitPart = result.object.name || 'Torso';
                let damage = weapon.damage || 25;
                const dist = result.distance || 0;
                let falloffTable = weapon.damageFalloff ? weapon.damageFalloff.base : null;
                if (hitPart === 'Head' && weapon.damageFalloff && weapon.damageFalloff.head) falloffTable = weapon.damageFalloff.head;
                if (falloffTable) {
                    for (const step of falloffTable) {
                        if (dist <= step.maxDist) { damage = step.dmg; break; }
                    }
                }
                if ((hitPart === 'Leg' || hitPart === 'Arm') && weapon.damageFalloff && weapon.damageFalloff.limbMultiplier) damage *= weapon.damageFalloff.limbMultiplier;
                damage = Math.floor(damage);

                let isValidHit = true;
                if (window.TacticalShooter.MatchState && window.TacticalShooter.TeamManager) {
                    const MS = window.TacticalShooter.MatchState.state;
                    if (MS.gamemode !== 'FFA' && !MS.friendlyFire) {
                        const TM = window.TacticalShooter.TeamManager;
                        const myTeam = TM.getLocalTeamId();
                        if (window.TacticalShooter.RemotePlayerManager && result.playerId) {
                            const rp = window.TacticalShooter.RemotePlayerManager.remotePlayers[result.playerId];
                            if (rp && rp.teamId === myTeam) isValidHit = false; 
                        }
                    }
                }

                if (window.TacticalShooter.PlayroomManager && isValidHit && damage > 0) {
                    const impulse = (weapon.ragdollImpulse !== undefined) ? weapon.ragdollImpulse : 2.0;
                    window.TacticalShooter.PlayroomManager.broadcastBulletHit(result.point, result.normal, result.playerId, damage, hitPart, impulse);
                    if (window.TacticalShooter.HitmarkerSystem) {
                        if (hitPart === 'Head') window.TacticalShooter.HitmarkerSystem.show('headshot');
                        else window.TacticalShooter.HitmarkerSystem.show('normal');
                    }
                    if (window.TacticalShooter.RemotePlayerManager && result.playerId) {
                        const victim = window.TacticalShooter.RemotePlayerManager.remotePlayers[result.playerId];
                        if (victim && victim.animator && victim.animator.triggerFlinch) victim.animator.triggerFlinch(hitPart, result.normal);
                    }
                }
            } else {
                let effectsConfig = weapon.effects ? weapon.effects.impact : {};
                if (isMelee) { effectsConfig = { ...effectsConfig }; if (effectsConfig.particleCount) effectsConfig.particleCount = Math.ceil(effectsConfig.particleCount * 0.5); }
                if(pm) { pm.createImpactSparks(result.point, result.normal, effectsConfig); if (!isMelee) pm.createImpactDust(result.point, result.normal); }
                if (window.TacticalShooter.PlayroomManager) window.TacticalShooter.PlayroomManager.broadcastBulletHit(result.point, result.normal, null, 0, null, 0);
            }
        },

        attemptFire(playerState, playerCamera) {
            if (!this.currentWeapon || playerState.isReloading) return; 
            if (this.currentWeapon.magazineSize > 0 && playerState.currentAmmo <= 0) { 
                const autoReload = window.TacticalShooter.SettingsManager ? window.TacticalShooter.SettingsManager.settings.autoReload : true;
                if (autoReload && playerState.reserveAmmo > 0) playerState.startReload();
                return; 
            }
            if (this.fireTimer > 0 || this.drawTimer > 0 || playerState.needsPump || playerState.isPumping) return;
            
            const ammoToConsume = (this.currentWeapon.ammoPerShot !== undefined) ? this.currentWeapon.ammoPerShot : 1;
            if (!playerState.consumeAmmo(ammoToConsume)) return;
            
            if (this.currentWeapon.actionType === 'pump') {
                if (playerState.currentAmmo === 0) { 
                    const autoReload = window.TacticalShooter.SettingsManager ? window.TacticalShooter.SettingsManager.settings.autoReload : true;
                    if (autoReload) playerState.startReload(); 
                } else playerState.markNeedsPump();
            }
            
            this.fireTimer = this.currentWeapon.fireRate;
            if (window.TacticalShooter.PlayroomManager) window.TacticalShooter.PlayroomManager.onPlayerFired();

            if (this.currentWeapon.type === 'melee') {
                const now = Date.now();
                if (now - this.lastAttackTime > 1200) this.comboStep = 0; 
                if (window.TacticalShooter.GunRenderer) window.TacticalShooter.GunRenderer.triggerMeleeAnimation(this.comboStep);
                this.lastAttackTime = now;
                this.comboStep = (this.comboStep + 1) % 2; 
            } else {
                this.playGunshotSound();
                if (window.TacticalShooter.GunRenderer) {
                    window.TacticalShooter.GunRenderer.applyRecoil();
                    
                    // FIXED: Do NOT trigger shell ejection on fire for Pump/Bolt actions
                    // Ejection happens during the manual cycle animation
                    const isManualAction = (this.currentWeapon.actionType === 'pump' || this.currentWeapon.actionType === 'bolt');
                    window.TacticalShooter.GunRenderer.triggerMuzzleFlash(this.currentWeapon, !isManualAction);
                }
            }
            
            const range = (this.currentWeapon.ballistics && this.currentWeapon.ballistics.maxRange) ? this.currentWeapon.ballistics.maxRange : 100;
            const charController = window.TacticalShooter.CharacterController;
            const horizontalSpeed = new THREE.Vector3(charController.velocity.x, 0, charController.velocity.z).length();
            const isSprinting = horizontalSpeed > charController.config.walkSpeed + 1.0;
            
            const muzzleState = window.TacticalShooter.GunRenderer ? window.TacticalShooter.GunRenderer.getMuzzleState() : null;
            const muzzlePrimary = muzzleState ? muzzleState.primary : { position: playerCamera.camera.position.clone(), direction: playerCamera.getForwardDirection() };
            const muzzleSecondary = muzzleState ? muzzleState.secondary : null;
            
            let spread = this.currentWeapon.hipfireSpread;
            if (playerState.isADS) spread = isSprinting ? this.currentWeapon.hipfireSpread * 2.0 : this.currentWeapon.adsSpread;
            else if (isSprinting) spread = this.currentWeapon.sprintSpread || (spread * 3.0);
            
            if (playerState.isAttachmentOn && this.currentWeapon.activeModifiers && this.currentWeapon.activeModifiers.laser) spread *= this.currentWeapon.activeModifiers.laser.spreadMultiplier;
            
            const shotCount = this.currentWeapon.projectilesPerShot || 1;
            const hasDual = !!muzzleSecondary;
            
            for(let i=0; i<shotCount; i++) {
                let origin = hasDual && (i%2 !== 0) ? muzzleSecondary.position : muzzlePrimary.position;
                let direction = hasDual && (i%2 !== 0) ? muzzleSecondary.direction : muzzlePrimary.direction;
                if (!hasDual && this.currentWeapon.id !== 'SHOTGUN' && !isSprinting && !playerState.isInspecting) {
                    const targetPoint = window.TacticalShooter.Ballistics.getCrosshairTarget(playerCamera.camera, range);
                    direction = new THREE.Vector3().subVectors(targetPoint, origin).normalize();
                }
                window.TacticalShooter.Ballistics.fireProjectile(origin, direction, this.currentWeapon, spread, (result) => this.onBulletHit(result, this.currentWeapon));
            }
            playerCamera.addRecoil(this.currentWeapon.recoilPitch, (Math.random() - 0.5) * this.currentWeapon.recoilYaw);
            
            // FIXED: Trigger auto-reload immediately if magazine becomes empty after shot
            if (playerState.currentAmmo === 0 && !playerState.isReloading) {
                 const settings = window.TacticalShooter.SettingsManager ? window.TacticalShooter.SettingsManager.settings : {};
                 const autoReload = (settings.autoReload !== false); // Default True
                 if (autoReload && playerState.reserveAmmo > 0) {
                     playerState.startReload();
                 }
            }
        }
    };
    window.TacticalShooter.WeaponManager = WeaponManager;
})();
