
// js/render/gun_renderer.js
(function() {
    const GunRenderer = {
        camera: null,
        scene: null, 
        useFullBody: false,
        weaponContainer: null, 
        recoilContainer: null, 
        gunMeshGroup: null,    
        fullBodyMesh: null,
        fullBodyParts: null,
        fullBodyAnimator: null,
        
        slideMesh: null, triggerMesh: null, muzzlePoint: null, ejectionPoint: null, magGroup: null,
        handLeft: null, handRight: null,
        slideMeshLeft: null, triggerMeshLeft: null, muzzlePointLeft: null, ejectionPointLeft: null, magGroupLeft: null,
        danglerMesh: null, 
        
        muzzleFlashGroup: null, muzzleFlashGroupLeft: null, flashLight: null, flashMesh: null, flashMeshLeft: null, flashMaterial: null, flashTimer: 0,
        muzzleFlashEnabled: true,
        attachmentLights: [], attachmentLasers: [], attachmentLensMeshes: [], attachmentEmitterMeshes: [],
        _laserDotTexture: null,
        
        barrelHeat: 0,
        smokeAccumulator: 0, 
        
        barrelRaycaster: null,
        isBarrelBlocked: false,
        obstructionCheckFrame: 0,
        laserCheckFrame: 0,
        
        currentWeaponDef: null,
        visualConfig: null, 
        
        init(camera) {
            if (!window.THREE) return;
            this.camera = camera;
            this.scene = window.TacticalShooter.GameManager ? window.TacticalShooter.GameManager.scene : null;
            this.barrelRaycaster = new THREE.Raycaster();
            this.laserCheckFrame = 0;
            
            const existing = this.camera.children.find(c => c.name === 'FPS_GUN_CONTAINER');
            if (existing) this.camera.remove(existing);

            this.weaponContainer = new THREE.Group();
            this.weaponContainer.name = 'FPS_GUN_CONTAINER'; 
            this.camera.add(this.weaponContainer);
            this.recoilContainer = new THREE.Group();
            this.weaponContainer.add(this.recoilContainer);
            
            if(window.TacticalShooter.GunAnimator) window.TacticalShooter.GunAnimator.init();
            
            this._initLaserTexture();
            this.warmup();
        },
        
        warmup() {
            if (!this.flashMaterial) {
                this.flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
            }
        },
        
        _initLaserTexture() {
            const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
            const ctx = canvas.getContext('2d');
            const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1)'); grad.addColorStop(0.3, 'rgba(0, 255, 0, 1)'); grad.addColorStop(1, 'rgba(0, 255, 0, 0)');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 32);
            this._laserDotTexture = new THREE.CanvasTexture(canvas);
        },

        setVisible(visible) {
            if (this.useFullBody) { if (this.fullBodyMesh) this.fullBodyMesh.visible = visible; } 
            else { if (this.weaponContainer) this.weaponContainer.visible = visible; }
        },
        
        setUseFullBody(enabled) {
            if (this.useFullBody === enabled) return;
            this.useFullBody = enabled;
            if (this.weaponContainer) this.weaponContainer.visible = false;
            if (this.fullBodyMesh) this.fullBodyMesh.visible = false;
            if (this.currentWeaponDef) this.loadWeapon(this.currentWeaponDef);
        },

        loadWeapon(weaponDef) {
            this.currentWeaponDef = weaponDef;
            this.visualConfig = weaponDef.visuals;
            this.resetRefs();
            this.barrelHeat = 0;
            this.smokeAccumulator = 0;
            
            // Check state: Only show if In-Game
            const gm = window.TacticalShooter.GameManager;
            const inGame = gm && gm.currentState === 'IN_GAME';
            
            // Ensure visual container is enabled ONLY if in-game
            if (this.weaponContainer) this.weaponContainer.visible = inGame;

            if (this.useFullBody) this.setupFullBody(weaponDef);
            else this.setupFPSHands(weaponDef);
            
            this._buildMuzzleFlash(this.muzzlePoint, false);
            if (this.muzzlePointLeft) this._buildMuzzleFlash(this.muzzlePointLeft, true);
            if (!this.useFullBody) this.setupTacticalAttachments(weaponDef);
            
            if(window.TacticalShooter.GunAnimator) {
                const startPos = new THREE.Vector3(this.visualConfig.hipPosition.x, this.visualConfig.hipPosition.y, this.visualConfig.hipPosition.z);
                window.TacticalShooter.GunAnimator.init(startPos);
                if(window.TacticalShooter.GunAnimator.danglerState) {
                    window.TacticalShooter.GunAnimator.danglerState.angle = 0;
                    window.TacticalShooter.GunAnimator.danglerState.velocity = 0;
                }
            }
        },
        
        setupFPSHands(weaponDef) {
            if (!this.weaponContainer) return; 
            
            const gm = window.TacticalShooter.GameManager;
            const inGame = gm && gm.currentState === 'IN_GAME';
            this.weaponContainer.visible = inGame; // Re-affirm visibility state
            
            if (typeof weaponDef.buildMesh === 'function') {
                const built = weaponDef.buildMesh.call(weaponDef);
                this.gunMeshGroup = built.mesh;
                
                // Parts Map
                this.slideMesh = built.parts.slide; this.triggerMesh = built.parts.trigger; this.muzzlePoint = built.parts.muzzle;
                this.ejectionPoint = built.parts.ejection; this.danglerMesh = built.parts.dangler; this.magGroup = built.parts.magazine;
                this.handLeft = built.parts.handLeft; this.handRight = built.parts.handRight;
                this.slideMeshLeft = built.parts.slideLeft; this.triggerMeshLeft = built.parts.triggerLeft;
                this.muzzlePointLeft = built.parts.muzzleLeft; this.ejectionPointLeft = built.parts.ejectionLeft; this.magGroupLeft = built.parts.magazineLeft;
                
                this.recoilContainer.add(this.gunMeshGroup);
            }
        },
        
        setupFullBody(weaponDef) {
            if (!window.TacticalShooter.PlayerModelBuilder) return;
            const buildResult = window.TacticalShooter.PlayerModelBuilder.build('#222222'); 
            this.fullBodyMesh = buildResult.mesh; this.fullBodyParts = buildResult.parts;
            if (this.fullBodyParts.head) this.fullBodyParts.head.visible = false;
            this.fullBodyMesh.traverse((child) => { child.userData.bulletTransparent = true; });
            
            const p = this.fullBodyParts;
            if (p.leftLeg) p.leftLeg.rotation.order = 'YXZ'; if (p.rightLeg) p.rightLeg.rotation.order = 'YXZ';
            if (p.leftArm) p.leftArm.rotation.order = 'XYZ'; if (p.rightArm) p.rightArm.rotation.order = 'XYZ';
            
            let weaponMesh, weaponParts;
            if (typeof weaponDef.buildMesh === 'function') {
                const built = weaponDef.buildMesh.call(weaponDef);
                weaponMesh = built.mesh; weaponParts = built.parts;
                weaponMesh.traverse((c) => c.userData.bulletTransparent = true);
                p.rightArm.userData.elbow.add(weaponMesh);
                
                this.slideMesh = weaponParts.slide; this.triggerMesh = weaponParts.trigger; this.muzzlePoint = weaponParts.muzzle;
                this.ejectionPoint = weaponParts.ejection; this.danglerMesh = weaponParts.dangler; this.magGroup = weaponParts.magazine;
                this.handLeft = weaponParts.handLeft; this.handRight = weaponParts.handRight;
                this.slideMeshLeft = weaponParts.slideLeft; this.triggerMeshLeft = weaponParts.triggerLeft;
                this.muzzlePointLeft = weaponParts.muzzleLeft; this.ejectionPointLeft = weaponParts.ejectionLeft; this.magGroupLeft = weaponParts.magazineLeft;
            }
            if (window.TacticalShooter.RemotePlayerAnimator) {
                this.fullBodyAnimator = new window.TacticalShooter.RemotePlayerAnimator(this.fullBodyMesh, this.fullBodyParts, weaponParts, weaponMesh, weaponDef);
            }
            this.scene.add(this.fullBodyMesh);
            
            const gm = window.TacticalShooter.GameManager;
            const inGame = gm && gm.currentState === 'IN_GAME';
            this.fullBodyMesh.visible = inGame;
        },
        
        setupTacticalAttachments(weaponDef) {
            if (!this.gunMeshGroup) return;
            this.attachmentLights = []; this.attachmentLasers = []; this.attachmentLensMeshes = []; this.attachmentEmitterMeshes = [];
            
            this.gunMeshGroup.traverse(c => {
                if (c.name === "ATTACHMENT_FLASHLIGHT_LENS" && c.parent) {
                    const spot = new THREE.SpotLight(0xffffee, 25.0, 150, Math.PI / 6, 0.2, 2.0);
                    c.parent.add(spot);
                    spot.position.copy(c.position);
                    spot.target.position.set(0, 0, -50.0);
                    c.parent.add(spot.target);
                    spot.visible = false;
                    spot.castShadow = true; 
                    spot.shadow.mapSize.width = 512; spot.shadow.mapSize.height = 512;
                    spot.shadow.bias = -0.00005; spot.shadow.normalBias = 0.02;
                    this.attachmentLights.push(spot);
                    if (c.material) { c.material = c.material.clone(); this.attachmentLensMeshes.push(c); }
                }
                if (c.name === "ATTACHMENT_LASER_EMITTER") {
                    const beamGeo = new THREE.CylinderGeometry(0.0005, 0.0005, 1, 4);
                    beamGeo.rotateX(Math.PI / 2); beamGeo.translate(0, 0, 0.5); 
                    const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
                    const beam = new THREE.Mesh(beamGeo, beamMat);
                    c.add(beam);
                    const dotMat = new THREE.SpriteMaterial({ map: this._laserDotTexture, color: 0x88ff88, blending: THREE.AdditiveBlending, depthTest: false });
                    const dot = new THREE.Sprite(dotMat);
                    dot.scale.set(0.05, 0.05, 1);
                    c.add(dot);
                    beam.visible = false; dot.visible = false;
                    this.attachmentLasers.push({ beam, dot, parent: c, mat: beamMat, _cachedDist: 200, _cachedVis: false });
                    if (c.material) { c.material = c.material.clone(); this.attachmentEmitterMeshes.push(c); }
                }
            });
        },
        
        resetRefs() {
            if (this.recoilContainer) { while(this.recoilContainer.children.length > 0) this.recoilContainer.remove(this.recoilContainer.children[0]); }
            this.gunMeshGroup = null;
            if (this.fullBodyMesh) { this.scene.remove(this.fullBodyMesh); this.fullBodyMesh = null; this.fullBodyParts = null; this.fullBodyAnimator = null; }
            this.slideMesh = null; this.triggerMesh = null; this.muzzlePoint = null; this.ejectionPoint = null; this.danglerMesh = null;
            this.magGroup = null; this.slideMeshLeft = null; this.triggerMeshLeft = null; this.muzzlePointLeft = null; this.ejectionPointLeft = null; this.magGroupLeft = null;
            this.muzzleFlashGroup = null; this.muzzleFlashGroupLeft = null; this.flashMesh = null; this.flashMeshLeft = null;
            this.attachmentLights = []; this.attachmentLasers = []; this.attachmentLensMeshes = []; this.attachmentEmitterMeshes = [];
        },
        
        triggerMeleeAnimation() { if(window.TacticalShooter.GunAnimator) window.TacticalShooter.GunAnimator.triggerMelee(); },
        applyRecoil() { if(window.TacticalShooter.GunAnimator) window.TacticalShooter.GunAnimator.applyRecoil(this.currentWeaponDef.recoilPitch, this.currentWeaponDef.recoilYaw); },
        
        update(dt, playerState, characterController, inputManager, isFiring) {
            if (!this.scene) this.scene = window.TacticalShooter.GameManager.scene;
            this.checkBarrelObstruction();
            this.updateFlash(dt);
            
            const smokeCfg = (this.visualConfig && this.visualConfig.barrelSmoke) ? this.visualConfig.barrelSmoke : { density: 0.1, duration: 1.0 };
            const decayRate = 1.0 / (smokeCfg.duration || 1.5);
            
            if (!isFiring && this.barrelHeat > 0) {
                this.barrelHeat = Math.max(0, this.barrelHeat - (dt * decayRate));
            }
            
            if (this.barrelHeat > 0.2 && !isFiring) {
                if (window.TacticalShooter.ParticleManager && window.TacticalShooter.ParticleManager.impactParticleCount >= 12) {
                     const densityMult = smokeCfg.density || 1.0;
                     const emissionRate = 180.0 * this.barrelHeat * densityMult;
                     this.smokeAccumulator += emissionRate * dt;
                     
                     while(this.smokeAccumulator >= 1.0) {
                         const state = this.getMuzzleState();
                         const intensity = this.barrelHeat * this.barrelHeat;
                         if (state && state.primary) {
                             const pos = state.primary.position.clone().add(new THREE.Vector3((Math.random()-0.5)*0.03, (Math.random()-0.5)*0.03, (Math.random()-0.5)*0.03));
                             const dir = new THREE.Vector3(0, 1, 0).lerp(state.primary.direction, 0.1).normalize();
                             window.TacticalShooter.ParticleManager.createBarrelWisp(pos, dir, intensity);
                         }
                         if (state && state.secondary) {
                             const pos = state.secondary.position.clone().add(new THREE.Vector3((Math.random()-0.5)*0.03, (Math.random()-0.5)*0.03, (Math.random()-0.5)*0.03));
                             const dir = new THREE.Vector3(0, 1, 0).lerp(state.secondary.direction, 0.1).normalize();
                             window.TacticalShooter.ParticleManager.createBarrelWisp(pos, dir, intensity);
                         }
                         this.smokeAccumulator -= 1.0;
                     }
                }
            } else {
                this.smokeAccumulator = 0;
            }
            
            const isOn = playerState.isAttachmentOn;
            
            this.attachmentLights.forEach(l => l.visible = isOn);
            this.attachmentLasers.forEach(l => { l.beam.visible = isOn; if (!isOn) l.dot.visible = false; });
            
            if (isOn) {
                 // REVERTED to 1.0 per request
                 this.attachmentLensMeshes.forEach(m => { m.material.color.setHex(0xeeffff); m.material.emissiveIntensity = 1.0; });
                 this.attachmentEmitterMeshes.forEach(m => { m.material.color.setHex(0x00ff00); m.material.emissiveIntensity = 1.0; });
                 this.updateLasers();
            } else {
                 this.attachmentLensMeshes.forEach(m => { m.material.color.setHex(0x111111); m.material.emissiveIntensity = 0; });
                 this.attachmentEmitterMeshes.forEach(m => { m.material.color.setHex(0x001100); m.material.emissiveIntensity = 0; });
            }
            
            this.updateWeaponParts(dt, isFiring, playerState);
            
            if (window.TacticalShooter.GunAnimator) {
                const anim = window.TacticalShooter.GunAnimator.update(dt, playerState, characterController, inputManager, this.currentWeaponDef, isFiring, this.isBarrelBlocked);
                
                if (this.useFullBody) this.updateFullBody(dt, playerState, characterController, isFiring, anim);
                else this.applyToFPSHands(anim);
                
                if (this.danglerMesh) {
                    const ang = window.TacticalShooter.GunAnimator.danglerState ? window.TacticalShooter.GunAnimator.danglerState.angle : 0;
                    this.danglerMesh.rotation.x = ang;
                }
            }
        },
        
        updateLasers() {
            if (this.attachmentLasers.length === 0) return;
            
            // Throttling: Run raycast check every 4 frames
            this.laserCheckFrame++;
            const doRaycast = (this.laserCheckFrame % 4 === 0);
            
            let collidables = [];
            if (doRaycast) {
                if (window.TacticalShooter.GameManager && window.TacticalShooter.GameManager.staticCollider) {
                    collidables = [window.TacticalShooter.GameManager.staticCollider];
                } else if (window.TacticalShooter.GameManager && window.TacticalShooter.GameManager.currentMap) {
                    collidables = window.TacticalShooter.GameManager.currentMap.geometry;
                }
            }
            
            this.attachmentLasers.forEach(laserData => {
                if (!laserData.beam.visible) return;
                
                if (doRaycast) {
                    const emitter = laserData.parent;
                    const origin = new THREE.Vector3(); const direction = new THREE.Vector3(0, 0, 1);
                    emitter.getWorldPosition(origin);
                    const q = new THREE.Quaternion(); emitter.getWorldQuaternion(q); direction.applyQuaternion(q);
                    
                    const backtrackDist = 0.5;
                    const safeOrigin = origin.clone().sub(direction.clone().multiplyScalar(backtrackDist));
                    this.barrelRaycaster.set(safeOrigin, direction);
                    this.barrelRaycaster.far = 200 + backtrackDist;
                    
                    const hits = this.barrelRaycaster.intersectObjects(collidables, true);
                    const validHit = hits.length > 0 ? hits[0] : null;
                    
                    if (validHit) {
                        laserData._cachedDist = Math.max(0, validHit.distance - backtrackDist);
                        laserData._cachedVis = true;
                    } else {
                        laserData._cachedDist = 200;
                        laserData._cachedVis = false;
                    }
                }
                
                // Update Visuals every frame
                laserData.dot.visible = laserData._cachedVis;
                if (laserData.dot.visible) {
                    laserData.dot.position.set(0, 0, laserData._cachedDist);
                }
                
                laserData.beam.scale.set(1, 1, laserData._cachedDist);
                let opacity = 0.25;
                if (laserData._cachedDist > 150) { 
                    const fade = 1.0 - ((laserData._cachedDist - 150) / 50.0); 
                    opacity *= Math.max(0, fade); 
                }
                laserData.mat.opacity = opacity;
            });
        },

        updateFlash(dt) {
            if (this.flashTimer > 0) {
                this.flashTimer -= dt;
                if (this.flashTimer <= 0) {
                    if (this.muzzleFlashGroup) { this.muzzleFlashGroup.visible = false; if (this.flashLight) this.flashLight.intensity = 0; }
                    if (this.muzzleFlashGroupLeft) this.muzzleFlashGroupLeft.visible = false;
                }
            }
        },
        
        updateWeaponParts(dt, isFiring, playerState) {
            if (this.currentWeaponDef && this.currentWeaponDef.animationLogic && this.currentWeaponDef.animationLogic.updateParts) {
                const dropCallback = (isLeft = false) => {
                    const mag = isLeft ? this.magGroupLeft : this.magGroup;
                    if (mag && window.TacticalShooter.ParticleManager) {
                        const wasVisible = mag.visible; mag.visible = true; mag.updateMatrixWorld(true);
                        const worldPos = new THREE.Vector3(); const worldRot = new THREE.Quaternion();
                        mag.getWorldPosition(worldPos); mag.getWorldQuaternion(worldRot);
                        mag.visible = wasVisible;
                        
                        const type = (this.currentWeaponDef.effects && this.currentWeaponDef.effects.magType) ? this.currentWeaponDef.effects.magType : 'pistol';
                        const isExtended = this.currentWeaponDef.attachments && this.currentWeaponDef.attachments.includes('pistol_mag_ext'); 
                        window.TacticalShooter.ParticleManager.createDroppingMag(worldPos, worldRot, type, isExtended);
                    }
                };
                
                this.currentWeaponDef.animationLogic.updateParts(dt, playerState, { 
                    slide: this.slideMesh, trigger: this.triggerMesh, magazine: this.magGroup, handLeft: this.handLeft, handRight: this.handRight,
                    slideLeft: this.slideMeshLeft, triggerLeft: this.triggerMeshLeft, magazineLeft: this.magGroupLeft,
                    rightRoot: this.gunMeshGroup ? this.gunMeshGroup.children.find(c => c.children.includes(this.slideMesh)) : null,
                    leftRoot: this.gunMeshGroup ? this.gunMeshGroup.children.find(c => c.children.includes(this.slideMeshLeft)) : null,
                    bolt: this.currentWeaponDef.parts ? this.currentWeaponDef.parts.bolt : null,
                    shell: this.currentWeaponDef.parts ? this.currentWeaponDef.parts.shell : null
                }, this.currentWeaponDef, (side) => this.ejectShell(side), dropCallback); 
            }
            if (this.triggerMesh) {
                const targetRot = isFiring ? 0.6 : 0; const triggerSpeed = isFiring ? 40.0 : 10.0; 
                this.triggerMesh.rotation.x = THREE.MathUtils.lerp(this.triggerMesh.rotation.x, -targetRot, dt * triggerSpeed);
            }
        },
        
        updateFullBody(dt, playerState, charController, isFiring, animData) {
            if (!this.fullBodyAnimator || !this.fullBodyMesh) return;
            const pc = window.TacticalShooter.PlayerCamera; 
            const velocity = charController.velocity;
            const horizontalSpeed = new THREE.Vector3(velocity.x, 0, velocity.z).length();
            const forward = new THREE.Vector3(0,0,-1).applyQuaternion(pc.camera.quaternion); forward.y = 0; forward.normalize();
            const right = new THREE.Vector3(1,0,0).applyQuaternion(pc.camera.quaternion);
            const fwdSpeed = velocity.dot(forward); const strafeSpeed = velocity.dot(right);
            const isMoving = horizontalSpeed > 0.1; const isSprinting = isMoving && horizontalSpeed > (charController.config.walkSpeed + 1.0);
            const isStrafing = Math.abs(strafeSpeed) > Math.abs(fwdSpeed) && !isSprinting;
            
            const derivedStats = { isMoving, isSprinting, isStrafing, isSliding: charController.isSliding, isCrouching: charController.isCrouching, speed: horizontalSpeed, strafeSpeed, wallDistance: this.isBarrelBlocked ? 0.5 : 999 };
            
            this.fullBodyMesh.position.copy(charController.position); this.fullBodyMesh.rotation.y = pc.yaw;
            
            const weaponPosLocal = animData.pos.clone();
            weaponPosLocal.x += animData.bobPos.x; weaponPosLocal.y += animData.bobPos.y;
            const weaponRotLocal = new THREE.Euler(animData.rot.x + animData.bobRot.x, animData.rot.y, animData.rot.z + animData.bobRot.z);
            const weaponQuatLocal = new THREE.Quaternion().setFromEuler(weaponRotLocal);
            
            const recoilPos = new THREE.Vector3(0, 0, animData.recoil.z); recoilPos.applyQuaternion(weaponQuatLocal); weaponPosLocal.add(recoilPos);
            const recoilRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(animData.recoil.x, 0, animData.recoil.y)); weaponQuatLocal.multiply(recoilRot);
            
            const worldGunPos = weaponPosLocal.clone().applyMatrix4(this.camera.matrixWorld);
            const worldGunRot = weaponQuatLocal.clone().premultiply(this.camera.quaternion);
            
            this.fullBodyAnimator.update(dt, { lean: charController.effectiveLean, isCrouching: charController.isCrouching, isSliding: charController.isSliding, isProne: charController.isProne, isSprinting: isSprinting, isADS: playerState.isADS, currentAmmo: playerState.currentAmmo, lookPitch: pc.pitch, lookYaw: pc.yaw }, derivedStats, null, null, worldGunPos, worldGunRot);
        },
        
        applyToFPSHands(animData) {
            if (!this.weaponContainer) return;
            this.weaponContainer.position.copy(animData.pos);
            this.weaponContainer.position.x += animData.bobPos.x;
            this.weaponContainer.position.y += animData.bobPos.y;
            
            this.weaponContainer.rotation.x = animData.rot.x + animData.bobRot.x;
            this.weaponContainer.rotation.y = animData.rot.y;
            this.weaponContainer.rotation.z = animData.rot.z + animData.bobRot.z;
            
            this.recoilContainer.position.z = animData.recoil.z;
            this.recoilContainer.rotation.x = animData.recoil.x;
            this.recoilContainer.rotation.z = animData.recoil.y;
        },
        
        checkBarrelObstruction() {
            if (!this.scene || !this.camera) return;
            if (this.currentWeaponDef && this.currentWeaponDef.type === 'melee') { this.isBarrelBlocked = false; return; }
            
            this.obstructionCheckFrame++;
            if (this.obstructionCheckFrame % 4 !== 0) return;
            
            const origin = this.camera.position.clone();
            const camQuat = this.camera.quaternion;
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuat);
            const offsets = [ new THREE.Vector3(0, 0, 0), right.clone().multiplyScalar(0.1), right.clone().multiplyScalar(-0.1) ];
            
            let collidables = [];
            if (window.TacticalShooter.GameManager && window.TacticalShooter.GameManager.staticCollider) {
                collidables = [window.TacticalShooter.GameManager.staticCollider];
            } else if (window.TacticalShooter.GameManager && window.TacticalShooter.GameManager.currentMap) {
                collidables = window.TacticalShooter.GameManager.currentMap.geometry;
            } else { return; }
            
            this.isBarrelBlocked = false;
            this.barrelRaycaster.far = 0.8; 
            
            for (const offset of offsets) {
                const rayOrigin = origin.clone().add(offset);
                this.barrelRaycaster.set(rayOrigin, forward);
                const hits = this.barrelRaycaster.intersectObjects(collidables, true);
                if (hits.length > 0) { this.isBarrelBlocked = true; break; }
            }
        },
        
        triggerMuzzleFlash(weaponConfig, doEject = true) {
            let heatAdd = 0.2; 
            const smokeCfg = (this.visualConfig && this.visualConfig.barrelSmoke) ? this.visualConfig.barrelSmoke : {};
            if (smokeCfg.rampUp) heatAdd = 0.08; 
            else heatAdd = 0.6; 
            
            this.barrelHeat = Math.min(1.0, this.barrelHeat + heatAdd);
            
            if (!weaponConfig.effects || !weaponConfig.effects.muzzle) return;
            if (doEject) this.ejectShell('both');
            if (!this.muzzleFlashGroup) return;
            
            const baseIntensity = (this.visualConfig.muzzleFlashIntensity !== undefined) ? this.visualConfig.muzzleFlashIntensity : 1.0;
            const lightMult = this.muzzleFlashEnabled ? 1.0 : 0.0;
            const scale = (this.visualConfig.muzzleFlashScale !== undefined) ? this.visualConfig.muzzleFlashScale : 1.0;
            
            // STRICT SUPPRESSION CHECK
            if (scale <= 0.01 || baseIntensity <= 0.01) {
                this.muzzleFlashGroup.visible = false;
                if (this.flashLight) this.flashLight.intensity = 0;
                return;
            }
            
            this.muzzleFlashGroup.visible = true;
            if (this.muzzleFlashGroupLeft) this.muzzleFlashGroupLeft.visible = true;
            
            if (this.flashLight) this.flashLight.intensity = 40.0 * baseIntensity * lightMult; 
            if (this.flashMaterial) {
                this.flashMaterial.opacity = 1.0;
                if (weaponConfig.effects.muzzle.color) {
                    this.flashMaterial.color.setHex(weaponConfig.effects.muzzle.color);
                }
            }
            
            const randRot = Math.random() * Math.PI * 2;
            if (this.flashMesh) { this.flashMesh.rotation.z = randRot; this.flashMesh.scale.set(scale, scale, scale); }
            if (this.flashMeshLeft) { this.flashMeshLeft.rotation.z = randRot; this.flashMeshLeft.scale.set(scale, scale, scale); }
            
            this.flashTimer = this.visualConfig.muzzleFlashDuration || 0.05;
            
            if (window.TacticalShooter.ParticleManager) {
                const primary = this.getMuzzleState().primary;
                if (primary) {
                    window.TacticalShooter.ParticleManager.createMuzzleSmoke(primary.position, primary.direction);
                }
                const secondary = this.getMuzzleState().secondary;
                if (secondary) {
                     window.TacticalShooter.ParticleManager.createMuzzleSmoke(secondary.position, secondary.direction);
                }
            }
        },
        
        ejectShell(side) {
            if (!this.ejectionPoint || !window.TacticalShooter.ParticleManager) return;
            
            // FORCE MATRIX UPDATE: Sync physics spawn point with current visual frame
            if (this.useFullBody) {
                if (this.fullBodyMesh) this.fullBodyMesh.updateMatrixWorld(true);
            } else {
                if (this.weaponContainer) this.weaponContainer.updateMatrixWorld(true);
            }
            
            const pm = window.TacticalShooter.ParticleManager;
            const doEject = (point) => {
                const position = new THREE.Vector3(); point.getWorldPosition(position);
                const quaternion = new THREE.Quaternion(); point.getWorldQuaternion(quaternion);
                const direction = new THREE.Vector3(1.0, 0.5, 0.2).applyQuaternion(quaternion).normalize();
                
                let type = 'pistol';
                if (this.currentWeaponDef.effects && this.currentWeaponDef.effects.shellType) {
                    type = this.currentWeaponDef.effects.shellType;
                }
                
                pm.createShellCasing(position, direction, type);
            };
            const ejectRight = !side || side === 'right' || side === 'both';
            const ejectLeft = (side === 'left' || side === 'both') && this.ejectionPointLeft;
            if (ejectRight) doEject(this.ejectionPoint);
            if (ejectLeft) doEject(this.ejectionPointLeft);
        },
        
        getMuzzleState() {
            if (!this.muzzlePoint) return { position: new THREE.Vector3(), direction: new THREE.Vector3(0,0,-1) };
            if (this.useFullBody) { if (this.fullBodyMesh) this.fullBodyMesh.updateMatrixWorld(true); } 
            else { if (this.weaponContainer) this.weaponContainer.updateMatrixWorld(true); }
            const getState = (point) => {
                const position = new THREE.Vector3(); point.getWorldPosition(position);
                const quaternion = new THREE.Quaternion(); point.getWorldQuaternion(quaternion);
                const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion).normalize();
                return { position, direction };
            };
            const primary = getState(this.muzzlePoint);
            const secondary = this.muzzlePointLeft ? getState(this.muzzlePointLeft) : null;
            return { position: primary.position, direction: primary.direction, primary: primary, secondary: secondary };
        },
        
        _buildMuzzleFlash(point, isLeft) {
            if (!point) return; 
            this.warmup();
            const group = new THREE.Group(); point.add(group); group.visible = false;
            if (!isLeft) { this.flashLight = new THREE.PointLight(0xffaa33, 0, 10); group.add(this.flashLight); }
            const geom = new THREE.PlaneGeometry(0.3, 0.3);
            const plane1 = new THREE.Mesh(geom, this.flashMaterial); 
            const plane2 = new THREE.Mesh(geom, this.flashMaterial); 
            plane2.rotation.z = Math.PI / 2;
            const flashMesh = new THREE.Group(); flashMesh.add(plane1); flashMesh.add(plane2); group.add(flashMesh);
            if (isLeft) { this.muzzleFlashGroupLeft = group; this.flashMeshLeft = flashMesh; } else { this.muzzleFlashGroup = group; this.flashMesh = flashMesh; }
        }
    };
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.GunRenderer = GunRenderer;
})();
