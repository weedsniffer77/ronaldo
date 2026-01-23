
// js/player/modules/player_health.js
(function() {
    class PlayerHealth {
        constructor(stateContext) {
            this.state = stateContext; // Parent Facade
            
            this.hp = 100;
            this.maxHp = 100;
            this.isDead = false;
            
            // Visuals
            this.damageHealth = 100;
            this.damageTimer = 0;
            this.healingWaitTimer = 0;
            
            // Death info
            this.deathTimer = 0;
            this.deployWaitTimer = 0;
            this.killerName = null;
            this.lastHitPart = 'Torso';
            this.lastImpulseForce = 2.0;
            this.lastDamageVector = null;
            
            // Flags for Death Cam
            this.lastHitWasStealth = false;
            this.lastDamageOrigin = null; 
        }

        reset() {
            this.hp = this.maxHp;
            this.damageHealth = this.maxHp;
            this.isDead = false;
            this.healingWaitTimer = 0;
            this.lastImpulseForce = 2.0;
            this.lastHitWasStealth = false;
            this.lastDamageOrigin = null;
            this.updateUI();
        }

        takeDamage(amount, sourceId, hitPart, impulseForce, isStealth = false, damageOrigin = null) {
            if (this.isDead) return;
            
            // Friendly Fire Check
            if (window.TacticalShooter.MatchState) {
                const MS = window.TacticalShooter.MatchState.state;
                if (!MS.friendlyFire && MS.gamemode !== 'FFA' && sourceId) {
                    const shooter = window.TacticalShooter.RemotePlayerManager.remotePlayers[sourceId];
                    if (shooter && shooter.teamId === window.TacticalShooter.TeamManager.getLocalTeamId()) return;
                }
            }

            this.hp -= amount;
            if (this.hp < 0) this.hp = 0;
            
            this.healingWaitTimer = 10.0;
            this.lastHitPart = hitPart || 'Torso';
            this.damageTimer = 0.8;
            
            // Store Context for Death Cam
            this.lastHitWasStealth = isStealth;
            this.lastDamageOrigin = damageOrigin; // Will be non-null for Grenades/Explosions
            
            if (impulseForce !== undefined) this.lastImpulseForce = impulseForce;
            else this.lastImpulseForce = 2.0;

            // --- DAMAGE INDICATOR LOGIC ---
            // If explicit origin (grenade), point away from it.
            // If Shooter ID available, point away from shooter.
            // Stealth flag is passed to indicator system to modify visual (blur/widen).
            
            if (damageOrigin) {
                const myPos = window.TacticalShooter.CharacterController.position.clone();
                this.lastDamageVector = new THREE.Vector3().subVectors(myPos, damageOrigin).normalize();
                
                if (window.TacticalShooter.DamageIndicatorSystem) {
                    window.TacticalShooter.DamageIndicatorSystem.show(amount, this.lastDamageVector, isStealth);
                }
            }
            else if (sourceId && window.TacticalShooter.RemotePlayerManager && window.TacticalShooter.DamageIndicatorSystem) {
                const shooter = window.TacticalShooter.RemotePlayerManager.remotePlayers[sourceId];
                if (shooter && shooter.mesh) {
                    const myPos = window.TacticalShooter.CharacterController.position.clone();
                    const shooterPos = shooter.mesh.position.clone();
                    this.lastDamageVector = new THREE.Vector3().subVectors(myPos, shooterPos).normalize();
                    window.TacticalShooter.DamageIndicatorSystem.show(amount, this.lastDamageVector, isStealth);
                }
            }

            // Visuals
            if (this.hp > 0) {
                if (window.TacticalShooter.PlayerCamera) window.TacticalShooter.PlayerCamera.applyFlinch();
                if (window.TacticalShooter.PostProcessor) window.TacticalShooter.PostProcessor.addDamageImpulse(amount);
            }
            
            // Network Sync
            if (window.TacticalShooter.PlayroomManager && window.TacticalShooter.PlayroomManager.myPlayer) {
                window.TacticalShooter.PlayroomManager.myPlayer.setState('health', this.hp, true);
            }

            this.updateUI();
            if (this.hp <= 0) this.die(sourceId);
        }

        die(killerId) {
            if (this.isDead) return;
            this.isDead = true;
            this.deathTimer = this.state.DEATH_CAM_DURATION;
            this.deployWaitTimer = 0;
            this.healingWaitTimer = 0;
            
            // Sync Death Health
            if (window.TacticalShooter.PlayroomManager && window.TacticalShooter.PlayroomManager.myPlayer) {
                window.TacticalShooter.PlayroomManager.myPlayer.setState('health', 0, true);
            }

            this.killerName = null;
            if (killerId && window.TacticalShooter.RemotePlayerManager) {
                const killer = window.TacticalShooter.RemotePlayerManager.remotePlayers[killerId];
                if (killer) this.killerName = killer.name;
            }

            // Ragdoll Calculation
            const cc = window.TacticalShooter.CharacterController;
            const cam = window.TacticalShooter.PlayerCamera;
            
            const impulse = this.lastDamageVector ? this.lastDamageVector.clone().normalize().multiplyScalar(this.lastImpulseForce) : new THREE.Vector3(0,0,1);
            impulse.y += 1.5;

            const momentum = cc.velocity.clone();
            if (momentum.length() > 5.0) momentum.normalize().multiplyScalar(5.0); 

            let hitOffset = new THREE.Vector3(0, 0.2, 0); 
            if (this.lastHitPart === 'Head') hitOffset.set(0, 0.8, 0);

            // Broadcast Death Event
            if (window.TacticalShooter.PlayroomManager && window.TacticalShooter.PlayroomManager.myPlayer) {
                const ragdollData = {
                    x: cc.position.x, y: cc.position.y, z: cc.position.z,
                    ry: cam ? cam.yaw : 0, 
                    vx: impulse.x, vy: impulse.y, vz: impulse.z,
                    mvx: momentum.x, mvy: momentum.y, mvz: momentum.z,
                    offX: hitOffset.x, offY: hitOffset.y, offZ: hitOffset.z,
                    time: Date.now()
                };
                window.TacticalShooter.PlayroomManager.myPlayer.setState('ragdollData', ragdollData, true);
                
                const currentDeaths = window.TacticalShooter.PlayroomManager.myPlayer.getState('deaths') || 0;
                window.TacticalShooter.PlayroomManager.myPlayer.setState('deaths', currentDeaths + 1, true);
                
                window.TacticalShooter.PlayroomManager.broadcastDeath(killerId);
            }

            // Spawn Local Ragdoll
            let localRagdoll = null;
            if (window.TacticalShooter.RagdollManager) {
                const spawnPos = cc.position.clone();
                localRagdoll = window.TacticalShooter.RagdollManager.spawn(null, '#333333', spawnPos, (cam ? cam.yaw : 0), impulse, hitOffset, momentum);
            }

            // --- DEATH CAM START ---
            if (window.TacticalShooter.DeathCameraController && localRagdoll) {
                // Focus Logic:
                // 1. If Origin exists (Grenade), focus on that.
                // 2. Else if Stealth (Suppressed), focus on Body (Confused).
                // 3. Else focus on Killer.
                
                const focusPoint = this.lastDamageOrigin; 
                // Only enable body focus if NO origin and YES stealth
                const focusBody = !focusPoint && this.lastHitWasStealth; 
                
                window.TacticalShooter.DeathCameraController.start(
                    localRagdoll, 
                    this.lastDamageVector, 
                    killerId, 
                    focusBody, 
                    focusPoint
                );
            }

            // UI Changes
            if (window.TacticalShooter.MultiplayerUI) window.TacticalShooter.MultiplayerUI.setHUDVisible(false);
            if (window.TacticalShooter.DeploymentScreen) window.TacticalShooter.DeploymentScreen.showDeathInfo(this.killerName);
            if (document.exitPointerLock) document.exitPointerLock();
            if (window.TacticalShooter.GunRenderer) window.TacticalShooter.GunRenderer.setVisible(false);
        }

        update(dt) {
            // Regen / Damage Bar Animation
            if (window.TacticalShooter.PostProcessor) {
                if (this.healingWaitTimer > 0) {
                    this.healingWaitTimer -= dt;
                    if (this.hp < 25) window.TacticalShooter.PostProcessor.setVignetteState('damaged');
                    else window.TacticalShooter.PostProcessor.setVignetteState('clear');
                } else if (this.hp < this.maxHp) {
                    window.TacticalShooter.PostProcessor.setVignetteState('healing');
                    this.hp = Math.min(this.maxHp, this.hp + 10 * dt);
                    this.updateUI();
                } else {
                    window.TacticalShooter.PostProcessor.setVignetteState('clear');
                }
            }

            if (this.hp < this.damageHealth) {
                if (this.damageTimer > 0) this.damageTimer -= dt;
                else {
                    this.damageHealth = THREE.MathUtils.lerp(this.damageHealth, this.hp, dt * 5.0);
                    if (Math.abs(this.damageHealth - this.hp) < 0.5) this.damageHealth = this.hp;
                    this.updateUI();
                }
            } else if (this.hp > this.damageHealth) {
                this.damageHealth = this.hp;
                this.damageTimer = 0;
                this.updateUI();
            }
        }

        updateUI() {
            const bar = document.getElementById('health-fill');
            const damageBar = document.getElementById('health-damage');
            if (bar && damageBar) {
                const pct = (this.hp / this.maxHp) * 100;
                bar.style.width = `${pct}%`;
                damageBar.style.width = `${(this.damageHealth / this.maxHp) * 100}%`;
                if (pct < 30) bar.style.backgroundColor = '#d63333';
                else bar.style.backgroundColor = '#ffffff';
            }
        }
    }
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.PlayerHealth = PlayerHealth;
})();
