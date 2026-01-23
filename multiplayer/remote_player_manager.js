
// js/multiplayer/remote_player_manager.js
(function() {
    const RemotePlayerManager = {
        remotePlayers: {},
        SYMBOLS: ['◆', '●', '■', '▼', '▲', '♠'],
        frameCount: 0,
        
        // Frustum for culling (Initialized lazily)
        frustum: null,
        projScreenMatrix: null,
        
        // Performance Settings
        occlusionEnabled: true,

        addPlayer(player) {
            if (this.remotePlayers[player.id]) return;
            if (!window.TacticalShooter.RemotePlayerVisuals) return;
            if (!window.TacticalShooter.RemotePlayer) return; // Wait for class load
            
            const stateName = player.getState('name');
            const finalName = stateName || "...";
            const assignment = this._getAssignment(player);
            
            // Use Factory to create visual parts
            const visuals = window.TacticalShooter.RemotePlayerVisuals.createVisuals(player.id, finalName, assignment);
            if (!visuals) return;

            // Instantiate Class
            const rp = new window.TacticalShooter.RemotePlayer(player, {
                name: finalName,
                teamId: assignment.teamId,
                teamColor: assignment.teamColor,
                symbol: assignment.symbol,
                ...visuals
            });
            
            // Equip Initial Weapon
            const weaponId = player.getState('weaponId') || "PISTOL"; 
            const attachments = player.getState('attachments') || [];
            window.TacticalShooter.RemotePlayerVisuals.equipWeapon(rp, weaponId, attachments);
            
            // Init Animator
            if (window.TacticalShooter.RemotePlayerAnimator) {
                rp.animator = new window.TacticalShooter.RemotePlayerAnimator(rp.mesh, rp.parts, rp.weaponParts, rp.weaponMesh, rp.weaponDef);
                const currentLastFired = player.getState('lastFired') || 0;
                rp.animator.setWeaponContext(rp.weaponMesh, rp.weaponParts, rp.weaponDef, rp.muzzleFlashGroup, currentLastFired);
            }
            
            this.remotePlayers[player.id] = rp;
            console.log(`RemotePlayerManager: Added ${finalName} (ID: ${player.id})`);
        },

        removePlayer(playerId) {
            const rp = this.remotePlayers[playerId];
            if (!rp) return;
            
            // Spawn ragdoll on disconnect if alive
            if (!rp.isRagdolled && window.TacticalShooter.RagdollManager) {
                const crumpleImpulse = new THREE.Vector3((Math.random() - 0.5) * 1.5, -2.0, (Math.random() - 0.5) * 1.5);
                window.TacticalShooter.RagdollManager.spawn(rp.mesh, undefined, rp.mesh.position, rp.mesh.rotation.y, crumpleImpulse);
            }
            
            rp.cleanup();
            delete this.remotePlayers[playerId];
            console.log(`RemotePlayerManager: Removed ${rp.name}`);
        },

        removeAll() {
            for (const id in this.remotePlayers) {
                this.removePlayer(id);
            }
        },
        
        setOcclusionEnabled(enabled) {
            this.occlusionEnabled = enabled;
            console.log("RemotePlayerManager: Occlusion Culling " + (enabled ? "ENABLED" : "DISABLED"));
        },

        getHitboxes() {
            const boxes = [];
            for (const id in this.remotePlayers) {
                const rp = this.remotePlayers[id];
                if (rp.mesh && !rp.isRagdolled && rp.mesh.visible) {
                    boxes.push(rp.mesh);
                }
            }
            return boxes;
        },

        update(dt) {
            // Lazy Init THREE objects to prevent load-order crash
            if (!this.frustum && window.THREE) {
                this.frustum = new THREE.Frustum();
                this.projScreenMatrix = new THREE.Matrix4();
            }

            this.frameCount++; 
            const Visuals = window.TacticalShooter.RemotePlayerVisuals;
            const MS = window.TacticalShooter.MatchState;
            const gameManager = window.TacticalShooter.GameManager;
            const gameCamera = gameManager ? gameManager.camera : null;
            const pm = window.TacticalShooter.ParticleManager;
            
            // --- Update Frustum for Culling ---
            if (gameCamera && this.frustum && this.projScreenMatrix) {
                this.projScreenMatrix.multiplyMatrices(gameCamera.projectionMatrix, gameCamera.matrixWorldInverse);
                this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
            }
            
            // --- UI State Check ---
            let showNametags = window.TacticalShooter.config ? window.TacticalShooter.config.showNametags : true;
            const lobbyUI = document.getElementById('lobby-ui-layer');
            const isLobbyUIActive = lobbyUI && lobbyUI.classList.contains('active');
            const isFFA = MS && MS.state.gamemode === 'FFA';
            const isNightMap = (MS && MS.state.nightMode === true);
            
            if ((MS && MS.state.status === 'LOBBY') || isLobbyUIActive) {
                showNametags = false;
                for (const id in this.remotePlayers) { 
                    if (this.remotePlayers[id].tagGroup) this.remotePlayers[id].tagGroup.visible = false; 
                }
            }

            let localTeamId = 0;
            let myId = null;
            if (window.TacticalShooter.PlayroomManager && window.TacticalShooter.PlayroomManager.myPlayer) {
                 myId = window.TacticalShooter.PlayroomManager.myPlayer.id;
                 if (window.TacticalShooter.TeamManager) localTeamId = window.TacticalShooter.TeamManager.getLocalTeamId();
            }

            let staticCollider = null;
            if (window.TacticalShooter.GameManager && window.TacticalShooter.GameManager.staticCollider) {
                staticCollider = window.TacticalShooter.GameManager.staticCollider;
            }

            for (const id in this.remotePlayers) {
                const rp = this.remotePlayers[id];
                if (!rp.player) continue;
                
                // 1. Position Update (Always)
                const worldVelocity = rp.update(dt);
                
                // 2. Visibility / Culling Check
                let isVisible = true;
                let distToCam = 0;
                
                if (gameCamera) {
                    distToCam = gameCamera.position.distanceTo(rp.mesh.position);
                    // Add buffer to prevent pop-in
                    if (this.frustum && !this.frustum.containsPoint(rp.mesh.position) && distToCam > 5.0) {
                        isVisible = false;
                    }
                }
                
                // 3. LOD Determination
                let skipFrames = 0;
                if (!isVisible) skipFrames = 999; // Skip anim update entirely if culled
                else if (distToCam > 80) skipFrames = 3;
                else if (distToCam > 30) skipFrames = 1;
                
                // 4. Visual Updates (Throttled)
                if (isVisible) {
                    // Only check raycasts if occlusion enabled OR forced by logic
                    const shouldCheckRaycasts = this.occlusionEnabled && ((this.frameCount + rp.lodOffset) % 10 === 0);
                    const isAttachmentOn = rp.player.getState('isAttachmentOn') !== false;
                    
                    // Pass throttling flag
                    Visuals.updateAttachmentEffects(rp, isAttachmentOn, gameCamera, staticCollider, shouldCheckRaycasts);
                    
                    // UI Tag Updates
                    if (rp.tagGroup && !isLobbyUIActive && MS.state.status !== 'LOBBY' && rp.initialHideTimer <= 0) {
                        const isEnemy = isFFA || (rp.teamId !== localTeamId);
                        const health = rp.player.getState('health') !== undefined ? rp.player.getState('health') : 100;
                        const state = { 
                            isCrouching: rp.player.getState('isCrouching'), 
                            isProne: rp.player.getState('isProne') 
                        };
                        
                        // If occlusion disabled, we pass false to updateUI to skip raycast check inside nametag system
                        Visuals.updateUI(rp, gameCamera, dt, showNametags, isNightMap, state, isEnemy, health, this.occlusionEnabled);
                    } else if (rp.tagGroup) {
                        rp.tagGroup.visible = false;
                    }
                } else {
                    // Force hide UI if culled
                    if (rp.tagGroup) rp.tagGroup.visible = false;
                }

                // 5. Weapon Equip Sync (Check periodically)
                if ((this.frameCount + rp.lodOffset) % 30 === 0) {
                    const netWeapon = rp.player.getState('weaponId');
                    const netAttachments = rp.player.getState('attachments') || [];
                    const attHash = JSON.stringify(netAttachments);
                    if (netWeapon && (netWeapon !== rp.currentWeaponId || attHash !== rp.currentAttachmentsHash)) {
                        Visuals.equipWeapon(rp, netWeapon, netAttachments);
                        if (rp.animator) {
                            const currentLastFired = rp.player.getState('lastFired') || 0;
                            rp.animator.setWeaponContext(rp.weaponMesh, rp.weaponParts, rp.weaponDef, rp.muzzleFlashGroup, currentLastFired);
                        }
                    }
                }

                // 6. Identity Sync (Aggressive Update Fix)
                // If name is placeholder or invalid, check very frequently (every 5 frames)
                const isInvalid = (rp.name === "..." || rp.name === "Player" || !rp.name);
                const syncRate = isInvalid ? 5 : 60;

                if ((this.frameCount + rp.lodOffset) % syncRate === 0) {
                    const newState = this._getAssignment(rp.player);
                    if (rp.teamId !== newState.teamId || rp.teamColor !== newState.teamColor) {
                        rp.teamId = newState.teamId; rp.teamColor = newState.teamColor; rp.symbol = newState.symbol;
                        Visuals.updateVisualIdentity(rp, rp.name, newState);
                    }
                    const remoteNameState = rp.player.getState('name');
                    if (remoteNameState && remoteNameState !== rp.name && remoteNameState.length > 0) {
                        rp.name = remoteNameState; Visuals.updateVisualIdentity(rp, remoteNameState, newState);
                    }
                }

                // 7. Ragdoll Check
                const ragdollData = rp.player.getState('ragdollData');
                if (ragdollData) {
                    if (!rp.isRagdolled) {
                        rp.isRagdolled = true; rp.mesh.visible = false; rp.mesh.position.set(0, -1000, 0); rp.tagGroup.visible = false;
                        if (window.TacticalShooter.RagdollManager) {
                            const spawnPos = new THREE.Vector3(ragdollData.x, ragdollData.y, ragdollData.z);
                            const impulse = new THREE.Vector3(ragdollData.vx, ragdollData.vy, ragdollData.vz);
                            let momentum = null;
                            if (ragdollData.mvx !== undefined) momentum = new THREE.Vector3(ragdollData.mvx, ragdollData.mvy, ragdollData.mvz);
                            const hitOffset = ragdollData.offX !== undefined ? new THREE.Vector3(ragdollData.offX, ragdollData.offY, ragdollData.offZ) : null;
                            window.TacticalShooter.RagdollManager.spawn(rp.mesh, undefined, spawnPos, ragdollData.ry, impulse, hitOffset, momentum);
                        }
                    }
                    continue; 
                } else {
                    if (rp.isRagdolled) { rp.isRagdolled = false; rp.mesh.visible = true; if(rp.tagGroup) rp.tagGroup.visible = true; }
                }

                // 8. Health Logic
                const health = rp.player.getState('health') !== undefined ? rp.player.getState('health') : 100;
                if (health <= 0) {
                    rp.damageHealth = 0; rp.prevHealth = 0; rp.mesh.visible = false; if(rp.tagGroup) rp.tagGroup.visible = false; rp.mesh.position.set(0, -1000, 0); continue; 
                } else {
                    if (health < rp.prevHealth) rp.damageTimer = 0.5; 
                    rp.prevHealth = health;
                    if (rp.damageHealth > health) {
                        if (rp.damageTimer > 0) rp.damageTimer -= dt;
                        else {
                            rp.damageHealth = THREE.MathUtils.lerp(rp.damageHealth, health, dt * 5.0);
                            if (Math.abs(rp.damageHealth - health) < 0.5) rp.damageHealth = health;
                        }
                    } else { rp.damageHealth = health; rp.damageTimer = 0; }
                    if (!rp.isRagdolled) rp.mesh.visible = true;
                }

                // 9. ANIMATION UPDATE (With LOD)
                if (skipFrames < 900 && (this.frameCount + rp.lodOffset) % (skipFrames + 1) === 0) {
                    const animationDt = dt * (skipFrames + 1);
                    rp.updateAnim(animationDt, worldVelocity);
                }

                // 10. Weapon Mechanics (Always update to catch fire events)
                const lastFired = rp.player.getState('lastFired') || 0;
                if (rp.animator && rp.animator.updateWeaponMechanics) rp.animator.updateWeaponMechanics(dt, lastFired);
                
                // 11. Hit Processing
                const hitQueue = rp.player.getState('hitQueue');
                if (Array.isArray(hitQueue)) {
                    hitQueue.forEach(hit => {
                        if (rp.processedHitIds.has(hit.id)) return;
                        rp.processedHitIds.add(hit.id);
                        if (rp.processedHitIds.size > 100) { const arr = Array.from(rp.processedHitIds).slice(-50); rp.processedHitIds = new Set(arr); }
                        if (hit.targetId === myId) {
                            if (window.TacticalShooter.PlayerState) {
                                let canDmg = true;
                                if (!isFFA && !MS.state.friendlyFire && rp.teamId === localTeamId) canDmg = false; 
                                
                                if (canDmg) {
                                    // Extract Damage Origin if present
                                    let damageOrigin = null;
                                    if (hit.ox !== undefined && hit.oy !== undefined && hit.oz !== undefined) {
                                        damageOrigin = new THREE.Vector3(hit.ox, hit.oy, hit.oz);
                                    }
                                    
                                    window.TacticalShooter.PlayerState.takeDamage(
                                        hit.dmg || 0, 
                                        rp.id, 
                                        hit.part, 
                                        hit.imp, 
                                        hit.stealth, 
                                        damageOrigin
                                    );
                                }
                            }
                        } else if (hit.targetId) {
                            const victim = this.remotePlayers[hit.targetId];
                            if (victim && victim.animator && victim.animator.triggerFlinch) {
                                let canFlinch = true;
                                if (!isFFA && !MS.state.friendlyFire && rp.teamId === victim.teamId) canFlinch = false;
                                if (canFlinch) victim.animator.triggerFlinch(hit.part || 'Torso', new THREE.Vector3(hit.nx, hit.ny, hit.nz));
                            }
                        }
                        if (hit.targetId !== myId && pm) {
                            const effectsConfig = (rp.weaponDef && rp.weaponDef.effects) ? rp.weaponDef.effects.impact : {};
                            pm.createImpactSparks(new THREE.Vector3(hit.x, hit.y, hit.z), new THREE.Vector3(hit.nx, hit.ny, hit.nz), effectsConfig);
                        }
                    });
                }
            }
        },

        _getAssignment(player) {
            const id = player.id || player; 
            const teamId = player.getState ? player.getState('teamId') : undefined;
            const validTid = (typeof teamId === 'number') ? teamId : 0;
            const TM = window.TacticalShooter.TeamManager;
            let color = "#ffffff"; 
            const MS = window.TacticalShooter.MatchState;
            const isFFA = (MS && MS.state.gamemode === 'FFA');
            if (isFFA) color = "#EE0000"; 
            else {
                if (TM && TM.teams[validTid]) {
                    if (validTid === 0) color = "#0077CC"; 
                    else if (validTid === 1) color = "#EE0000"; 
                    else color = TM.teams[validTid].color;
                } else color = "#00AAFF"; 
            }
            let hash = 0;
            for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i) | 0;
            const symbolIndex = Math.abs(hash) % this.SYMBOLS.length;
            return { teamId: validTid, teamColor: color, symbol: this.SYMBOLS[symbolIndex] };
        }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.RemotePlayerManager = RemotePlayerManager;
})();
