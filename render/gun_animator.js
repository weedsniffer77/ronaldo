
// js/render/gun_animator.js
(function() {
    const GunAnimator = {
        // State (Initialized in init)
        currentPosition: null,
        currentRotation: null,
        
        curBobPos: null,
        curBobRot: null,
        
        recoilImpulse: null,
        
        bobTime: 0,
        inspectTime: 0,
        
        meleeAnim: { active: false, timer: 0, duration: 0.35, type: 0 },
        
        // Dangler (Charm/Ring) Physics
        danglerState: { angle: 0, velocity: 0, lastWorldPos: null },

        init(startPos) {
            // Lazy Init for THREE objects
            if (!this.currentPosition) {
                this.currentPosition = new THREE.Vector3();
                this.currentRotation = new THREE.Euler();
                this.curBobPos = { x: 0, y: 0 };
                this.curBobRot = { x: 0, z: 0 };
                this.recoilImpulse = { x: 0, y: 0, z: 0 };
                this.danglerState.lastWorldPos = new THREE.Vector3();
            }

            if (startPos) this.currentPosition.copy(startPos);
            this.currentRotation.set(0, 0, 0);
            this.curBobPos = { x: 0, y: 0 };
            this.curBobRot = { x: 0, z: 0 };
            this.recoilImpulse = { x: 0, y: 0, z: 0 };
        },
        
        triggerMelee() {
            this.meleeAnim.active = true;
            this.meleeAnim.timer = 0;
            this.meleeAnim.duration = 0.3;
        },
        
        applyRecoil(pitch, yaw, kickback) {
            if (!this.recoilImpulse) return;
            this.recoilImpulse.z += kickback || 0.15;
            this.recoilImpulse.x += pitch || 0.1;
            this.recoilImpulse.y += (Math.random() - 0.5) * (yaw || 0.05);
        },

        update(dt, playerState, characterController, inputManager, weaponDef, isFiring, isBarrelBlocked) {
            // Ensure initialized
            if (!this.currentPosition) this.init(weaponDef.visuals ? new THREE.Vector3(weaponDef.visuals.hipPosition.x, weaponDef.visuals.hipPosition.y, weaponDef.visuals.hipPosition.z) : new THREE.Vector3());

            const visuals = weaponDef.visuals;
            const velocity = characterController.velocity;
            const speed = new THREE.Vector3(velocity.x, 0, velocity.z).length();
            const isMoving = speed > 0.1;
            
            // Use dedicated state flag to properly handle heavy weapons (slow sprint)
            const isSprinting = characterController.isSprinting;
            const isSliding = characterController.isSliding;
            
            // 1. Determine Target Transform
            // Vectors
            const hipVec = new THREE.Vector3(visuals.hipPosition.x, visuals.hipPosition.y, visuals.hipPosition.z);
            const adsVec = new THREE.Vector3(visuals.adsPosition.x, visuals.adsPosition.y, visuals.adsPosition.z);
            const sprintVec = new THREE.Vector3(visuals.sprintPosition.x, visuals.sprintPosition.y, visuals.sprintPosition.z);
            const blockedVec = new THREE.Vector3(visuals.blockedPosition ? visuals.blockedPosition.x : 0, visuals.blockedPosition ? visuals.blockedPosition.y : 0, visuals.blockedPosition ? visuals.blockedPosition.z : 0);

            let targetPos = hipVec.clone();
            let targetRot = new THREE.Euler(0, 0, 0); 
            let moveSpeed = 10.0;
            
            const wm = window.TacticalShooter.WeaponManager;
            const isStowing = wm.pendingSwitchSlot !== null;
            const isDrawing = wm.drawTimer > 0;
            const holsterStyle = visuals.holsterStyle || 'side';
            
            const isGrenade = weaponDef.type === 'throwable';

            // --- STATE MACHINE ---
            if (isStowing) {
                const totalTime = weaponDef.holsterTime || 0.4;
                const progress = Math.max(0, 1.0 - (wm.switchTimer / totalTime));
                const p = progress * progress * (3 - 2 * progress); 
                if (holsterStyle === 'side') { targetPos.y -= 0.3 * p; targetPos.x += 0.2 * p; targetRot.z -= 0.5 * p; } 
                else if (holsterStyle === 'back') { targetPos.y -= 0.4 * p; targetPos.x -= 0.3 * p; targetRot.x += 1.2 * p; targetRot.z += 0.5 * p; } 
                else { targetPos.y -= 0.5 * p; targetRot.x += 0.5 * p; }
                moveSpeed = 20.0; 
            } 
            else if (isDrawing) {
                const totalTime = weaponDef.drawTime || 0.5;
                const progress = Math.max(0, 1.0 - (wm.drawTimer / totalTime));
                const p = 1.0 - Math.pow(1.0 - progress, 3);
                const startPos = targetPos.clone(); const startRot = targetRot.clone();
                if (holsterStyle === 'side') { startPos.y -= 0.3; startPos.x += 0.2; startRot.z -= 0.5; } 
                else if (holsterStyle === 'back') { startPos.y -= 0.4; startPos.x -= 0.3; startRot.x += 1.2; startRot.z += 0.5; } 
                else { startPos.y -= 0.5; startRot.x += 0.5; }
                targetPos.lerpVectors(startPos, targetPos, p);
                targetRot.x = THREE.MathUtils.lerp(startRot.x, targetRot.x, p);
                targetRot.y = THREE.MathUtils.lerp(startRot.y, targetRot.y, p);
                targetRot.z = THREE.MathUtils.lerp(startRot.z, targetRot.z, p);
                moveSpeed = 25.0; 
            }
            else if (weaponDef.animationLogic && weaponDef.animationLogic.getOffsets) {
                const offsets = weaponDef.animationLogic.getOffsets(playerState, weaponDef);
                if (offsets.pos) targetPos.add(offsets.pos);
                if (offsets.rot) { targetRot.x += offsets.rot.x; targetRot.y += offsets.rot.y; targetRot.z += offsets.rot.z; }
            }

            if (!isStowing && !isDrawing) {
                if (this.meleeAnim.active) {
                    this.meleeAnim.timer += dt;
                    const t = Math.min(1.0, this.meleeAnim.timer / this.meleeAnim.duration);
                    if (t >= 1.0) this.meleeAnim.active = false;
                    
                    // Throwing Animation (Push Forward)
                    const animT = Math.sin(t * Math.PI); 
                    // Move drastically forward and center
                    targetPos.z -= animT * 0.8; 
                    targetPos.x -= animT * 0.2;
                    targetRot.x -= animT * 0.2; 
                    moveSpeed = 20.0; 
                } 
                else if (isBarrelBlocked && !isGrenade) { // Grenades don't block
                    targetPos = blockedVec;
                    targetRot = new THREE.Euler(visuals.blockedRotation.x, visuals.blockedRotation.y, visuals.blockedRotation.z);
                    moveSpeed = 8.0;
                } 
                else if (isSliding) {
                    targetPos = hipVec.clone(); targetPos.x = 0.12; targetPos.y = -0.14; targetPos.z = -0.35; targetRot = new THREE.Euler(0.05, 0, -0.15); 
                    moveSpeed = 10.0;
                } 
                else if (characterController.isProne) {
                    targetPos = new THREE.Vector3(0.0, -0.12, -0.5); 
                    targetRot = new THREE.Euler(0, 0, 0); 
                    moveSpeed = 8.0;
                } 
                else if (playerState.isADS) {
                    // GRENADE ADS = PRIMED STANCE (Arm Back)
                    if (isGrenade) {
                        targetPos = adsVec.clone(); 
                        moveSpeed = visuals.adsInSpeed;
                        // Rotate to look like winding up
                        targetRot = new THREE.Euler(-0.2, 0.4, 0.2); 
                    }
                    else if (isSprinting) { 
                        targetPos = hipVec.clone(); targetPos.y += 0.04; targetPos.x += 0.05; targetRot = new THREE.Euler(0, 0, 0); moveSpeed = visuals.adsOutSpeed; 
                    } else { 
                        targetPos = adsVec.clone(); moveSpeed = visuals.adsInSpeed; 
                        if (visuals.adsRotationOffset) { 
                            targetRot.x += visuals.adsRotationOffset.x; 
                            targetRot.y += visuals.adsRotationOffset.y; 
                            targetRot.z += visuals.adsRotationOffset.z; 
                        }
                    }
                } 
                else if (isSprinting && !playerState.isReloading) {
                    moveSpeed = visuals.sprintTransitionSpeed || 10.0;
                    if (isFiring) { 
                        targetPos = hipVec; targetRot = new THREE.Euler(-0.1, 0, 0); moveSpeed = 20.0; 
                    } else { 
                        targetPos = sprintVec; targetRot = new THREE.Euler(visuals.sprintRotation.x, visuals.sprintRotation.y, visuals.sprintRotation.z); 
                    }
                } 
                else if (playerState.isInspecting) {
                    this.inspectTime += dt;
                    if (this.inspectTime < 2.0) { targetPos = new THREE.Vector3(0.05, -0.13, -0.32); targetRot = new THREE.Euler(0.1, 1.2, 0.2); moveSpeed = 3.0; } 
                    else if (this.inspectTime < 4.0) { targetPos = new THREE.Vector3(-0.02, -0.13, -0.32); targetRot = new THREE.Euler(0.3, -0.3, 0.9); moveSpeed = 2.0; } 
                    else { targetPos = hipVec; targetRot = new THREE.Euler(0, 0, 0); moveSpeed = 5.0; }
                } 
                else {
                    this.inspectTime = 0; moveSpeed = visuals.adsOutSpeed;
                }
                
                if (isFiring && !this.meleeAnim.active) moveSpeed = 25.0; 
            }
            
            // 2. Interpolate Base Transform
            this.currentPosition.lerp(targetPos, dt * moveSpeed);
            this.currentRotation.x = THREE.MathUtils.lerp(this.currentRotation.x, targetRot.x, dt * moveSpeed);
            this.currentRotation.y = THREE.MathUtils.lerp(this.currentRotation.y, targetRot.y, dt * moveSpeed);
            this.currentRotation.z = THREE.MathUtils.lerp(this.currentRotation.z, targetRot.z, dt * moveSpeed);
            
            // 3. Procedural Bob
            let targetBobX = 0, targetBobY = 0, targetRotBobX = 0, targetRotBobZ = 0;
            if (isMoving && !isBarrelBlocked && !playerState.isADS && !this.meleeAnim.active && !isStowing && !isDrawing) {
                let bobFreq = isSprinting ? visuals.sprintBobSpeed : visuals.walkBobSpeed;
                let bobAmp = isSprinting ? visuals.sprintBobAmount : visuals.walkBobAmount;
                if (isSliding) { bobFreq = 18.0; bobAmp = 0.0015; }
                
                this.bobTime += dt * bobFreq;
                targetBobX = Math.cos(this.bobTime) * bobAmp * 0.5;
                targetBobY = -Math.abs(Math.sin(this.bobTime)) * bobAmp;
                
                if (isSprinting) { targetRotBobZ = Math.cos(this.bobTime) * 0.05; targetRotBobX = Math.sin(this.bobTime * 2) * 0.04; } 
                else { targetRotBobZ = Math.cos(this.bobTime) * 0.02; }
            } else {
                this.bobTime += dt * 1.0;
                targetBobX = Math.cos(this.bobTime) * 0.0005; targetBobY = Math.sin(this.bobTime) * 0.0005;
                targetRotBobX = 0; targetRotBobZ = 0;
            }
            
            const smoothSpeed = 6.0;
            this.curBobPos.x = THREE.MathUtils.lerp(this.curBobPos.x, targetBobX, dt * smoothSpeed);
            this.curBobPos.y = THREE.MathUtils.lerp(this.curBobPos.y, targetBobY, dt * smoothSpeed);
            this.curBobRot.x = THREE.MathUtils.lerp(this.curBobRot.x, targetRotBobX, dt * smoothSpeed);
            this.curBobRot.z = THREE.MathUtils.lerp(this.curBobRot.z, targetRotBobZ, dt * smoothSpeed);

            // 4. Sway
            if (!this.meleeAnim.active && !isStowing) {
                const mouseDelta = inputManager.getMouseDelta();
                const swayStrength = 0.00015;
                const targetSwayZ = -mouseDelta.x * swayStrength * 10;
                const targetSwayX = -mouseDelta.y * swayStrength * 10;
                const targetSwayY = -mouseDelta.x * swayStrength * 5; 
                this.currentRotation.x = THREE.MathUtils.lerp(this.currentRotation.x, this.currentRotation.x + targetSwayX, dt * 10.0);
                this.currentRotation.y = THREE.MathUtils.lerp(this.currentRotation.y, this.currentRotation.y + targetSwayY, dt * 10.0);
                this.currentRotation.z = THREE.MathUtils.lerp(this.currentRotation.z, this.currentRotation.z + targetSwayZ, dt * 10.0);
            }

            // 5. Recoil Recovery
            const recoverSpeed = 15.0;
            this.recoilImpulse.x = THREE.MathUtils.lerp(this.recoilImpulse.x, 0, dt * recoverSpeed);
            this.recoilImpulse.y = THREE.MathUtils.lerp(this.recoilImpulse.y, 0, dt * recoverSpeed);
            this.recoilImpulse.z = THREE.MathUtils.lerp(this.recoilImpulse.z, 0, dt * recoverSpeed);
            
            // 6. Dangler Physics (Update state directly)
            const gravity = 15.0; const damping = 3.0; let accInput = 0;
            if (this.meleeAnim.active) accInput += Math.sin(this.meleeAnim.timer * 20) * 100.0;
            const force = -gravity * Math.sin(this.danglerState.angle) + accInput;
            this.danglerState.velocity += force * dt;
            this.danglerState.velocity *= Math.max(0, 1.0 - (damping * dt));
            this.danglerState.angle += this.danglerState.velocity * dt;

            return {
                pos: this.currentPosition,
                rot: this.currentRotation,
                bobPos: this.curBobPos,
                bobRot: this.curBobRot,
                recoil: this.recoilImpulse
            };
        }
    };
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.GunAnimator = GunAnimator;
})();
