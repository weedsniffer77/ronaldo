
// js/multiplayer/remote_player_visuals.js
(function() {
    const RemotePlayerVisuals = {
        _laserDotTexture: null,
        _glareTexture: null,
        _tempScale: null,
        _tempQuat: null,
        raycaster: null,
        _initialized: false,
        
        _ensureInit() {
            if (this._initialized) return;
            if (!window.THREE) return;
            
            this._tempScale = new THREE.Vector3();
            this._tempQuat = new THREE.Quaternion();
            this.raycaster = new THREE.Raycaster();
            this._initTextures();
            this._initialized = true;
            
            if (window.TacticalShooter.NametagSystem) {
                window.TacticalShooter.NametagSystem.init();
            }
        },

        _initTextures() {
            if (!this._laserDotTexture) {
                const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
                const ctx = canvas.getContext('2d');
                const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
                grad.addColorStop(0, 'rgba(255, 255, 255, 1)'); grad.addColorStop(0.3, 'rgba(0, 255, 0, 1)'); grad.addColorStop(1, 'rgba(0, 255, 0, 0)');
                ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 32);
                this._laserDotTexture = new THREE.CanvasTexture(canvas);
            }
            if (!this._glareTexture) {
                const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
                const ctx = canvas.getContext('2d');
                const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
                grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)'); grad.addColorStop(0.1, 'rgba(255, 255, 255, 0.8)'); grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.15)'); grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
                ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
                this._glareTexture = new THREE.CanvasTexture(canvas);
            }
        },

        createVisuals(playerId, name, assignment) {
            this._ensureInit();
            const scene = window.TacticalShooter.GameManager ? window.TacticalShooter.GameManager.scene : null;
            if (!scene) return null;

            let mesh, parts;
            if (window.TacticalShooter.PlayerModelBuilder) {
                const buildResult = window.TacticalShooter.PlayerModelBuilder.build();
                mesh = buildResult.mesh;
                parts = buildResult.parts;
                
                // Fix rotation orders for animation
                if (parts.leftLeg) parts.leftLeg.rotation.order = 'YXZ';
                if (parts.rightLeg) parts.rightLeg.rotation.order = 'YXZ';
                if (parts.leftArm) parts.leftArm.rotation.order = 'XYZ';
                if (parts.rightArm) parts.rightArm.rotation.order = 'XYZ';
                
                // --- LIMB HITBOX SETUP ---
                mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.userData.collidable = true;
                        child.userData.type = 'player';
                        child.userData.playerId = playerId; 
                        
                        // CRITICAL: Make limbs solid to bullets for precision hits
                        // The 'name' (Head, Torso, Leg) is set by PlayerModelBuilder
                        child.userData.bulletTransparent = false; 
                    }
                });
            } else {
                // Fallback capsule
                const geo = new THREE.CapsuleGeometry(0.4, 1.85, 4, 8);
                const mat = new THREE.MeshStandardMaterial({ color: 0x444444 });
                mesh = new THREE.Mesh(geo, mat);
                mesh.name = "Torso"; // Default to Torso
                mesh.userData.collidable = true;
                mesh.userData.type = 'player';
                mesh.userData.playerId = playerId;
                mesh.userData.bulletTransparent = false;
                parts = {};
            }

            // General Collision Box (For movement/physics, NOT bullets anymore)
            const colGeo = new THREE.BoxGeometry(0.6, 1.85, 0.6);
            const colMat = new THREE.MeshBasicMaterial({ visible: false });
            const collisionBox = new THREE.Mesh(colGeo, colMat);
            collisionBox.position.y = 0.925; 
            collisionBox.userData.collidable = true; // Still collidable for movement
            collisionBox.userData.type = 'player';
            collisionBox.userData.playerId = playerId;
            
            // IGNORE FOR BULLETS (Raycaster will skip this and hit the limbs inside)
            collisionBox.userData.bulletTransparent = true; 
            
            mesh.add(collisionBox);

            // --- UI Tags (Delegated to NametagSystem) ---
            let tags = null;
            if (window.TacticalShooter.NametagSystem) {
                tags = window.TacticalShooter.NametagSystem.createTag(name, assignment.teamColor, assignment.symbol);
                if (tags && tags.group) {
                    mesh.add(tags.group);
                }
            }
            
            scene.add(mesh);

            return {
                mesh,
                parts,
                collisionBox,
                tagGroup: tags ? tags.group : null,
                nameSprite: tags ? tags.nameSprite : null,
                markerSprite: tags ? tags.markerSprite : null,
                hpBgSprite: tags ? tags.hpBgSprite : null,
                hpDamageSprite: tags ? tags.hpDamageSprite : null,
                hpFillSprite: tags ? tags.hpFillSprite : null,
                hpWidthBase: tags ? tags.hpWidthBase : 1.0,
                hpHeightBase: tags ? tags.hpHeightBase : 0.1
            };
        },

        updateVisualIdentity(rp, name, assignment) {
            if (window.TacticalShooter.NametagSystem) {
                window.TacticalShooter.NametagSystem.updateIdentity(rp, name, assignment.teamColor, assignment.symbol);
            }
        },

        updateUI(rp, camera, dt, showNametags, isNightMap, state, isEnemy, health) {
            if (window.TacticalShooter.NametagSystem) {
                // Use cached suppressed state instead of iterating arrays every frame
                window.TacticalShooter.NametagSystem.updateTag(rp, camera, dt, showNametags, isNightMap, state, isEnemy, health, rp.isSuppressed);
            }
        },
        
        updateAttachmentEffects(rp, isAttachmentOn, camera, staticCollider, shouldCheckRaycasts) {
            // 1. Lights
            if (rp.attachmentLights) {
                rp.attachmentLights.forEach(light => {
                    light.visible = isAttachmentOn;
                });
            }
            
            // 2. Glares
            if (rp.attachmentGlares) {
                rp.attachmentGlares.forEach(g => {
                    if (!isAttachmentOn) {
                        g.sprite.visible = false;
                        return;
                    }
                    if (camera) {
                        const worldPos = new THREE.Vector3();
                        g.parent.getWorldPosition(worldPos);
                        const camDir = new THREE.Vector3().subVectors(camera.position, worldPos).normalize();
                        
                        const q = new THREE.Quaternion();
                        g.parent.getWorldQuaternion(q);
                        const forward = new THREE.Vector3(0,0,1).applyQuaternion(q);
                        
                        const dot = camDir.dot(forward);
                        if (dot > 0.8) {
                            g.sprite.visible = true;
                            g.sprite.material.opacity = (dot - 0.8) / 0.2;
                        } else {
                            g.sprite.visible = false;
                        }
                    }
                });
            }

            // 3. Lasers
            if (rp.attachmentLasers) {
                rp.attachmentLasers.forEach(l => {
                    l.beam.visible = isAttachmentOn;
                    if (!isAttachmentOn) {
                        l.dot.visible = false;
                        return;
                    }
                    
                    if (shouldCheckRaycasts) {
                        const origin = new THREE.Vector3();
                        l.parent.getWorldPosition(origin);
                        const q = new THREE.Quaternion();
                        l.parent.getWorldQuaternion(q);
                        const direction = new THREE.Vector3(0,0,1).applyQuaternion(q);
                        
                        this.raycaster.set(origin, direction);
                        this.raycaster.far = 100;
                        
                        let hits = [];
                        if (staticCollider) {
                            hits = this.raycaster.intersectObject(staticCollider);
                        } else if (window.TacticalShooter.GameManager && window.TacticalShooter.GameManager.currentMap) {
                            hits = this.raycaster.intersectObjects(window.TacticalShooter.GameManager.currentMap.geometry || []);
                        }
                        
                        if (hits.length > 0) {
                            l.dist = hits[0].distance;
                            l.vis = true;
                        } else {
                            l.dist = 100;
                            l.vis = false;
                        }
                    }
                    
                    const d = l.dist || 100;
                    l.beam.scale.set(1, 1, d);
                    l.dot.position.set(0, 0, d);
                    l.dot.visible = (l.vis !== false);
                });
            }
        },

        // --- Weapon & Effects ---

        equipWeapon(rp, weaponId, attachments = []) {
            this._ensureInit();
            if (!rp.parts || !rp.parts.rightArm || !rp.parts.rightArm.userData.elbow) return;
            const attHash = JSON.stringify(attachments);
            if (rp.currentWeaponId === weaponId && rp.currentAttachmentsHash === attHash) return;
            this.cleanupWeapon(rp);
            
            let baseDef = window.TacticalShooter.GameData.Weapons[weaponId];
            if (!baseDef) baseDef = window.TacticalShooter.GameData.Throwables[weaponId];
            if (!baseDef) return;
            
            let def = baseDef;
            // CHECK IF IT IS A WEAPON BEFORE CALLING STATSYSTEM. Throwables are not in Weapons list.
            if (window.TacticalShooter.StatSystem && window.TacticalShooter.GameData.Weapons[weaponId]) {
                def = window.TacticalShooter.StatSystem.calculateWeaponStats(weaponId, attachments, window.TacticalShooter.GameData);
            } else {
                def = { ...baseDef, attachments: attachments };
            }
            
            rp.weaponDef = def;
            rp.currentWeaponId = weaponId;
            rp.currentAttachmentsHash = attHash;
            
            // DETERMINE SUPPRESSION STATUS (ONCE ON EQUIP)
            // Check visuals config directly (most accurate)
            if (def.visuals && def.visuals.muzzleFlashScale <= 0.05) {
                rp.isSuppressed = true;
            } else {
                rp.isSuppressed = false;
            }
            
            if (baseDef.buildMesh) {
                const built = baseDef.buildMesh.call(def); 
                rp.weaponMesh = built.mesh;
                rp.weaponParts = built.parts;
                
                // Weapons should NOT block bullets (transparency)
                rp.weaponMesh.traverse((child) => {
                    child.userData.bulletTransparent = true;
                });

                rp.parts.rightArm.userData.elbow.add(rp.weaponMesh);
                if (rp.weaponParts.muzzle) {
                    this.createMuzzleFlash(rp, def);
                }
                this.setupAttachments(rp);
            }
        },

        cleanupWeapon(rp) {
            if (rp.weaponMesh) {
                if(rp.weaponMesh.parent) rp.weaponMesh.parent.remove(rp.weaponMesh);
                rp.weaponMesh = null;
                rp.weaponParts = null;
                rp.muzzleFlashGroup = null;
                rp.muzzleFlashGroupLeft = null;
                rp.attachmentLights = [];
                rp.attachmentLasers = [];
                rp.attachmentLensMeshes = [];
                rp.attachmentEmitterMeshes = [];
                rp.attachmentGlares = [];
            }
        },

        createMuzzleFlash(rp, baseDef) {
            const createFlash = (parent) => {
                const group = new THREE.Group();
                group.visible = false;
                parent.add(group);
                
                const flashConfig = (baseDef.visuals && baseDef.visuals.muzzleFlash) ? baseDef.visuals.muzzleFlash : {};
                const legacyConfig = (baseDef.effects && baseDef.effects.muzzle) ? baseDef.effects.muzzle : {};
                const flashColor = flashConfig.color || legacyConfig.color || 0xffaa00;
                
                // CRITICAL FIX: If Suppressed, DO NOT Create PointLight or Flash Meshes.
                // Just leave group empty. Animator will toggle group visibility but it will render nothing.
                if (rp.isSuppressed) {
                    return group;
                }
                
                const fMat = new THREE.MeshBasicMaterial({ 
                    color: flashColor, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending 
                });
                
                const fGeo = new THREE.PlaneGeometry(0.3, 0.3);
                const p1 = new THREE.Mesh(fGeo, fMat);
                const p2 = new THREE.Mesh(fGeo, fMat); 
                p2.rotation.z = Math.PI/2;
                
                p1.userData.bulletTransparent = true; p2.userData.bulletTransparent = true; 
                
                let sX = 1, sY = 1, sZ = 1;
                if (flashConfig.tpvScale) { sX = flashConfig.tpvScale.x || 1; sY = flashConfig.tpvScale.y || 1; sZ = flashConfig.tpvScale.z || 1; } 
                else if (flashConfig.scale) { sX = sY = sZ = (typeof flashConfig.scale === 'object' ? 1 : flashConfig.scale); }
                
                p1.scale.set(sX, sY, 1); p2.scale.set(sX, sY, 1);
                group.add(p1); group.add(p2);
                
                if (parent === rp.weaponParts.muzzle) {
                     rp.muzzleFlashLight = new THREE.PointLight(flashColor, 0, 8);
                     group.add(rp.muzzleFlashLight);
                }
                return group;
            };
            rp.muzzleFlashGroup = createFlash(rp.weaponParts.muzzle);
            if (rp.weaponParts.muzzleLeft) rp.muzzleFlashGroupLeft = createFlash(rp.weaponParts.muzzleLeft);
        },

        setupAttachments(rp) {
            // ... (Attachment Setup - ensured transparent) ...
            if (!rp.weaponMesh) return;
            rp.attachmentLights = []; rp.attachmentLasers = []; rp.attachmentLensMeshes = []; rp.attachmentEmitterMeshes = []; rp.attachmentGlares = [];
            
            rp.weaponMesh.traverse(c => {
                if (c.name === "ATTACHMENT_FLASHLIGHT_LENS" && c.parent) {
                    const spot = new THREE.SpotLight(0xffffee, 25.0, 150, Math.PI / 6, 0.2, 2.0);
                    c.parent.add(spot); spot.position.copy(c.position); spot.target.position.set(0, 0, -50.0); c.parent.add(spot.target); spot.visible = false; spot.castShadow = false; 
                    rp.attachmentLights.push(spot);
                    
                    // RE-ENABLED DEPTH TEST FOR GLARE SPRITE (so it doesn't shine through walls)
                    const mat = new THREE.SpriteMaterial({ map: this._glareTexture, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
                    const glare = new THREE.Sprite(mat);
                    glare.scale.set(0.2, 0.2, 1); glare.visible = false; glare.userData.bulletTransparent = true; 
                    c.add(glare); glare.position.z = -0.05; 
                    rp.attachmentGlares.push({ sprite: glare, parent: c, type: 'light' });

                    if (c.material) { c.material = c.material.clone(); rp.attachmentLensMeshes.push(c); }
                }
                if (c.name === "ATTACHMENT_LASER_EMITTER") {
                    const beamGeo = new THREE.CylinderGeometry(0.0005, 0.0005, 1, 4); beamGeo.rotateX(Math.PI / 2); beamGeo.translate(0, 0, 0.5); 
                    const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
                    const beam = new THREE.Mesh(beamGeo, beamMat); beam.userData.bulletTransparent = true; c.add(beam);
                    
                    const dotMat = new THREE.SpriteMaterial({ map: this._laserDotTexture, color: 0x88ff88, blending: THREE.AdditiveBlending, depthTest: true });
                    const dot = new THREE.Sprite(dotMat); dot.scale.set(0.05, 0.05, 1); dot.userData.bulletTransparent = true; c.add(dot);
                    
                    beam.visible = false; dot.visible = false;
                    rp.attachmentLasers.push({ beam, dot, parent: c, mat: beamMat });
                    
                    const mat = new THREE.SpriteMaterial({ map: this._glareTexture, color: 0x00ff00, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
                    const glare = new THREE.Sprite(mat); glare.scale.set(0.02, 0.02, 1); glare.visible = false; glare.userData.bulletTransparent = true; c.add(glare); glare.position.z = -0.02;
                    rp.attachmentGlares.push({ sprite: glare, parent: c, type: 'laser' });
                    
                    if (c.material) { c.material = c.material.clone(); rp.attachmentEmitterMeshes.push(c); }
                }
            });
        }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.RemotePlayerVisuals = RemotePlayerVisuals;
})();
