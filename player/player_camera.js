
// js/player/player_camera.js
(function() {
    const PlayerCamera = {
        camera: null,
        raycaster: null,
        
        // Look rotation
        yaw: 0,
        pitch: 0,
        
        // Recoil state
        recoilPending: { pitch: 0, yaw: 0 },
        flinchOffset: { pitch: 0, yaw: 0 },
        
        // Explosion Shake
        shakeOffset: { x: 0, y: 0 },
        shakeIntensity: 0,
        
        // State for smoothing
        currentMaxLeanRoll: Math.PI / 9,
        currentOffsetZ: -0.15,

        // Slide Constraint
        wasSliding: false,
        slideAnchorYaw: 0,
        
        // Config
        config: {
            mouseSensitivity: 0.002,
            maxPitch: Math.PI / 2 - 0.1,
            
            normalFOV: 75,
            adsFOV: 50,
            slideFOV: 85,
            fovTransitionSpeed: 10.0,
            
            recoilSmoothSpeed: 20.0,
            flinchRecoverySpeed: 10.0,
            
            bobFrequency: 0.08,
            bobAmplitude: 0.03,
            bobPhase: 0,

            maxLeanRollWall: Math.PI / 4,
            maxLeanRollOpen: Math.PI / 9,
            leanAngleTransitionSpeed: 3.0,
            
            slideRollAngle: -0.05,
            slideLookLimit: 2.1,
            
            grenadeZoom: false // Default
        },
        
        currentFOV: 75,
        
        init(camera, startRotation) {
            this.camera = camera;
            this.raycaster = new THREE.Raycaster();
            
            if (startRotation) {
                this.yaw = startRotation.y || 0;
                this.pitch = startRotation.x || 0;
            }
            
            this.camera.fov = this.config.normalFOV;
            this.currentFOV = this.config.normalFOV;
            this.currentMaxLeanRoll = this.config.maxLeanRollOpen;
            
            this.camera.near = 0.1;
            this.camera.far = 1000;
            this.camera.updateProjectionMatrix();
        },
        
        setSensitivity(val) {
            this.config.mouseSensitivity = val;
        },
        
        addRecoil(pitch, yaw) {
            this.recoilPending.pitch += pitch;
            this.recoilPending.yaw += yaw;
        },
        
        applyFlinch() {
            const flinchPitch = 0.02 + Math.random() * 0.02;
            const flinchYaw = (Math.random() - 0.5) * 0.05;
            this.flinchOffset.pitch += flinchPitch;
            this.flinchOffset.yaw += flinchYaw;
        },
        
        applyExplosionShake(intensity) {
            // Add raw trauma
            this.shakeIntensity = Math.min(2.0, this.shakeIntensity + intensity);
        },
        
        update(dt, inputManager, characterController, playerState) {
            if (playerState.isDead) {
                if (window.TacticalShooter.DeathCameraController && window.TacticalShooter.DeathCameraController.active) {
                    window.TacticalShooter.DeathCameraController.update(dt, this.camera);
                }
                return;
            }

            const mouseDelta = inputManager.getMouseDelta();
            
            this.yaw -= mouseDelta.x * this.config.mouseSensitivity;
            this.pitch -= mouseDelta.y * this.config.mouseSensitivity;
            
            // Recoil
            if (Math.abs(this.recoilPending.pitch) > 0.0001 || Math.abs(this.recoilPending.yaw) > 0.0001) {
                const pitchStep = this.recoilPending.pitch * dt * this.config.recoilSmoothSpeed;
                const yawStep = this.recoilPending.yaw * dt * this.config.recoilSmoothSpeed;
                this.pitch += pitchStep;
                this.yaw += yawStep;
                this.recoilPending.pitch -= pitchStep;
                this.recoilPending.yaw -= yawStep;
            } else {
                this.recoilPending.pitch = 0;
                this.recoilPending.yaw = 0;
            }
            
            // Flinch
            this.flinchOffset.pitch = THREE.MathUtils.lerp(this.flinchOffset.pitch, 0, dt * this.config.flinchRecoverySpeed);
            this.flinchOffset.yaw = THREE.MathUtils.lerp(this.flinchOffset.yaw, 0, dt * this.config.flinchRecoverySpeed);
            
            // Explosion Shake
            if (this.shakeIntensity > 0) {
                this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.0); // Decay
                const shakePower = this.shakeIntensity * this.shakeIntensity;
                this.shakeOffset.x = (Math.random() - 0.5) * 0.1 * shakePower;
                this.shakeOffset.y = (Math.random() - 0.5) * 0.1 * shakePower;
            } else {
                this.shakeOffset.x = 0;
                this.shakeOffset.y = 0;
            }
            
            // Slide Clamp
            if (characterController.isSliding) {
                if (!this.wasSliding) {
                    this.slideAnchorYaw = this.yaw;
                    this.wasSliding = true;
                }
                const diff = this.yaw - this.slideAnchorYaw;
                if (diff > this.config.slideLookLimit) this.yaw = this.slideAnchorYaw + this.config.slideLookLimit;
                else if (diff < -this.config.slideLookLimit) this.yaw = this.slideAnchorYaw - this.config.slideLookLimit;
            } else {
                this.wasSliding = false;
            }
            
            // Pitch Clamp
            let minPitch = -this.config.maxPitch;
            if (characterController.isProne) minPitch = -0.25; 
            this.pitch = Math.max(minPitch, Math.min(this.config.maxPitch, this.pitch));
            
            this.camera.rotation.order = 'YXZ';
            this.camera.rotation.y = this.yaw + this.flinchOffset.yaw + this.shakeOffset.x;
            this.camera.rotation.x = this.pitch + this.flinchOffset.pitch + this.shakeOffset.y;

            // Roll
            let targetRoll = 0;
            const targetMaxLean = characterController.isSupported ? this.config.maxLeanRollWall : this.config.maxLeanRollOpen;
            this.currentMaxLeanRoll = THREE.MathUtils.lerp(this.currentMaxLeanRoll, targetMaxLean, dt * this.config.leanAngleTransitionSpeed);

            if (characterController.effectiveLean) targetRoll = -characterController.effectiveLean * this.currentMaxLeanRoll;
            else if (characterController.isSliding) targetRoll = this.config.slideRollAngle;
            
            this.camera.rotation.z = THREE.MathUtils.lerp(this.camera.rotation.z, targetRoll, dt * 5.0);
            
            // Position
            const eyePos = characterController.getEyePosition();
            this.camera.position.copy(eyePos);
            
            // Head Bob
            if (characterController.isGrounded && characterController.velocity.length() > 0.1 && !characterController.isSliding) {
                this.config.bobPhase += dt * this.config.bobFrequency * characterController.velocity.length();
                this.camera.position.y += Math.sin(this.config.bobPhase * 10) * this.config.bobAmplitude;
                this.camera.position.x += Math.cos(this.config.bobPhase * 5) * this.config.bobAmplitude * 0.5;
            } else {
                this.config.bobPhase = 0;
            }
            
            // Body Offset (Full body view adjustments)
            if (window.TacticalShooter.GunRenderer && window.TacticalShooter.GunRenderer.useFullBody) {
                let targetOffset = -0.15; 
                const forward = this.getForwardDirection(); forward.y = 0; forward.normalize();
                const vel = characterController.velocity.clone(); vel.y = 0;
                const isMovingFwd = vel.length() > 0.1 && vel.dot(forward) > 0;
                const isSprinting = inputManager.isActionActive('Sprint') && isMovingFwd && !characterController.isCrouching && !characterController.isProne;

                if (characterController.isProne) targetOffset = 0.05; 
                else if (characterController.isSliding) targetOffset = 0.20; 
                else if (isSprinting) targetOffset = -0.45; 
                else if (characterController.isCrouching && isMovingFwd) targetOffset = -0.40; 
                
                this.currentOffsetZ = THREE.MathUtils.lerp(this.currentOffsetZ, targetOffset, dt * 8.0);
                this.camera.translateZ(this.currentOffsetZ);
            } else {
                this.currentOffsetZ = 0;
            }
            
            // --- ANTI-CLIP ---
            this.checkWallCollision(eyePos);

            // FOV
            let targetFOV = this.config.normalFOV;
            const wm = window.TacticalShooter.WeaponManager;
            const isGrenade = (wm && wm.currentWeapon && wm.currentWeapon.type === 'throwable');
            
            if (playerState.isADS) {
                // Check if Grenade and if setting allows zoom
                if (isGrenade && !this.config.grenadeZoom) {
                    targetFOV = this.config.normalFOV; // No Zoom
                } else {
                    targetFOV = this.config.adsFOV;
                    if (wm && wm.currentWeapon && wm.currentWeapon.attachments) {
                        const hasOptic = wm.currentWeapon.attachments.some(id => id.startsWith('optic_'));
                        if (hasOptic) {
                            targetFOV = this.config.adsFOV / 1.5;
                        }
                    }
                }
            }
            else if (characterController.isSliding) targetFOV = this.config.slideFOV;
            
            this.currentFOV += (targetFOV - this.currentFOV) * dt * this.config.fovTransitionSpeed;
            this.camera.fov = this.currentFOV;
            this.camera.updateProjectionMatrix();
        },
        
        checkWallCollision(pivotPoint) {
            if (!window.TacticalShooter.GameManager || !window.TacticalShooter.GameManager.scene) return;
            const scene = window.TacticalShooter.GameManager.scene;
            const camPos = this.camera.position.clone();
            const dir = new THREE.Vector3().subVectors(camPos, pivotPoint);
            const dist = dir.length();
            if (dist < 0.05) return; 
            dir.normalize();
            this.raycaster.set(pivotPoint, dir);
            this.raycaster.far = dist + 0.1; 
            let collidables = [];
            const currentMap = window.TacticalShooter.GameManager.currentMap;
            if (currentMap && currentMap.geometry) collidables = currentMap.geometry;
            else collidables = scene.children.filter(o => o.userData.collidable);
            const hits = this.raycaster.intersectObjects(collidables, false);
            if (hits.length > 0) {
                const hitDist = hits[0].distance;
                const buffer = 0.25; 
                const safeDist = Math.max(0, hitDist - buffer);
                this.camera.position.copy(pivotPoint).add(dir.multiplyScalar(safeDist));
            }
        },

        getForwardDirection() {
            const direction = new THREE.Vector3(0, 0, -1);
            direction.applyQuaternion(this.camera.quaternion);
            return direction;
        },
        
        getRightDirection() {
            const direction = new THREE.Vector3(1, 0, 0);
            direction.applyQuaternion(this.camera.quaternion);
            return direction;
        }
    };
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.PlayerCamera = PlayerCamera;
})();
