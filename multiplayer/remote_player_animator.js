
// js/multiplayer/remote_player_animator.js
(function() {
    class RemotePlayerAnimator {
        constructor(mesh, parts, weaponParts, weaponMesh, weaponDef) {
            this.mesh = mesh;
            this.parts = parts;
            this.weaponParts = weaponParts;
            this.weaponMesh = weaponMesh; 
            this.weaponDef = weaponDef; 
            
            this.animTime = 0;
            this.bobTime = 0;
            
            // Firing / Weapon Mechanics State
            this.lastProcessedFired = 0;
            this.flashTimer = 0;
            this.slideOffset = -0.02;
            this.muzzleFlashGroup = null;
            this.muzzleFlashLight = null;
            this.currentWeaponId = null;
            this.targetFlashIntensity = 5.0; // Default
            
            // Melee Animation
            this.meleeAnim = {
                active: false,
                timer: 0,
                duration: 0.4
            };
            
            // Flinch State
            this.flinch = {
                active: false,
                timer: 0,
                duration: 0.15, // Fast Speed
                part: 'Torso',
                intensity: 0.0,
                randX: 0,
                randY: 0,
                dirZ: -1, 
                dirX: 0   
            };
            
            this.upperArmLen = 0.35;
            this.lowerArmLen = 0.35;
            
            this.currentGunOffset = new THREE.Vector3(0.2, -0.25, 0.4); 
            this.currentGunRotOffset = new THREE.Quaternion();
            
            this.targets = {
                bodyPos: new THREE.Vector3(),
                torsoRot: new THREE.Euler(),
                headRot: new THREE.Euler(),
                
                leftLeg:  { rot: new THREE.Euler() },
                rightLeg: { rot: new THREE.Euler() },
                leftKnee: { rotX: 0 },
                rightKnee:{ rotX: 0 },
                leftFoot: { rotX: 0 },
                rightFoot:{ rotX: 0 }
            };

            // --- Safe Vector Pools (Instance Specific) ---
            // IK Solver Pool
            this._ik = {
                dir: new THREE.Vector3(),
                targetDir: new THREE.Vector3(),
                boneAxis: new THREE.Vector3(0, -1, 0), // Constant
                hintVec: new THREE.Vector3(),
                planeNormal: new THREE.Vector3(),
                axisX: new THREE.Vector3(),
                axisY: new THREE.Vector3(),
                axisZ: new THREE.Vector3(),
                qBase: new THREE.Quaternion(),
                qOrient: new THREE.Quaternion(),
                qBend: new THREE.Quaternion(),
                qUpper: new THREE.Quaternion(),
                qParentInv: new THREE.Quaternion(),
                mtx: new THREE.Matrix4()
            };

            // Update Loop Pool
            this._upd = {
                headPos: new THREE.Vector3(),
                viewQuat: new THREE.Quaternion(),
                targetOffset: new THREE.Vector3(),
                targetRotOffset: new THREE.Quaternion(),
                worldGunPos: new THREE.Vector3(),
                worldGunRot: new THREE.Quaternion(),
                bodyYawQuat: new THREE.Quaternion(),
                rElbowDir: new THREE.Vector3(),
                lElbowDir: new THREE.Vector3(),
                worldRElbowHint: new THREE.Vector3(),
                worldLElbowHint: new THREE.Vector3(),
                rShoulderPos: new THREE.Vector3(),
                lShoulderPos: new THREE.Vector3(),
                leftHandTargetPos: new THREE.Vector3(),
                handGripOffset: new THREE.Vector3(),
                wristLocalPos: new THREE.Vector3(),
                elbowWorldQuat: new THREE.Quaternion(),
                elbowInvQuat: new THREE.Quaternion(),
                weaponLocalRot: new THREE.Quaternion(),
                rotatedGripOffset: new THREE.Vector3(),
                tempVec: new THREE.Vector3(),
                tempQuat: new THREE.Quaternion(),
                tempEuler: new THREE.Euler()
            };
        }
        
        setWeaponContext(weaponMesh, weaponParts, weaponDef, muzzleFlashGroup, initialLastFired = 0) {
            this.weaponMesh = weaponMesh;
            this.weaponParts = weaponParts;
            this.weaponDef = weaponDef;
            this.muzzleFlashGroup = muzzleFlashGroup;
            
            if (muzzleFlashGroup) {
                this.muzzleFlashLight = muzzleFlashGroup.children.find(c => c.isPointLight);
            }
            if (weaponDef) this.currentWeaponId = weaponDef.id;
            
            // Sync firing state to prevent "catch-up" shots on equip
            this.lastProcessedFired = initialLastFired;
            
            // Determine Flash Intensity from Config
            if (weaponDef && weaponDef.visuals) {
                // If defined (0 for suppressor), use it. Scale by 5.0 for point light brightness.
                if (weaponDef.visuals.muzzleFlashIntensity !== undefined) {
                    this.targetFlashIntensity = weaponDef.visuals.muzzleFlashIntensity * 5.0;
                } else {
                    this.targetFlashIntensity = 5.0;
                }
                
                // Extra check: If scale is tiny (suppressor), force intensity 0
                if (weaponDef.visuals.muzzleFlashScale !== undefined && weaponDef.visuals.muzzleFlashScale < 0.1) {
                    this.targetFlashIntensity = 0;
                }
                
                let targetSlide = -0.02;
                if (weaponDef.visuals.slideTravel !== undefined) {
                    targetSlide = weaponDef.visuals.slideTravel;
                }
                this.slideOffset = targetSlide;
            }
        }
        
        updateWeaponMechanics(dt, lastFired) {
            const pm = window.TacticalShooter.ParticleManager;
            const parts = this.weaponParts;
            const def = this.weaponDef;
            
            // Firing Event Logic
            if (lastFired > this.lastProcessedFired) {
                this.lastProcessedFired = lastFired;
                
                if (def && def.type === 'melee') {
                    this.triggerMelee();
                } else if (def && def.type === 'throwable') {
                    this.triggerMelee(); // Use melee anim as throw anim for now
                } else {
                    // Muzzle Flash
                    this.flashTimer = 0.05;
                    if (this.muzzleFlashGroup && this.targetFlashIntensity > 0.1) {
                        this.muzzleFlashGroup.visible = true;
                        if (this.muzzleFlashLight) this.muzzleFlashLight.intensity = this.targetFlashIntensity;
                    }
                    
                    // Shell Ejection
                    if (parts && parts.ejection && pm && pm.casingsEnabled && def.effects) {
                        const ejPos = new THREE.Vector3(); const ejQuat = new THREE.Quaternion();
                        parts.ejection.getWorldPosition(ejPos);
                        parts.ejection.getWorldQuaternion(ejQuat);
                        const ejDir = new THREE.Vector3(1, 0.5, 0.2).applyQuaternion(ejQuat).normalize();
                        
                        const shellType = def.effects.shellType || 'pistol';
                        pm.createShellCasing(ejPos, ejDir, shellType);
                    }
                    
                    // Slide Kickback (Moves towards 0, rest is negative)
                    if (def && def.visuals) {
                        // Kick back slightly (towards 0 or positive)
                        // This logic assumes rest position is negative (e.g. -0.02) and kick pushes it to 0 or +0.02
                        this.slideOffset = 0.05; 
                    }
                }
            }
            
            // Slide Interpolation
            if (parts && parts.slide && def && def.visuals) {
                let targetSlide = -0.02; 
                if (def.visuals.slideTravel !== undefined) targetSlide = def.visuals.slideTravel;
                
                this.slideOffset = THREE.MathUtils.lerp(this.slideOffset, targetSlide, dt * 15.0);
                parts.slide.position.z = this.slideOffset;
            }
            
            // Flash Decay
            if (this.flashTimer > 0) {
                this.flashTimer -= dt;
                if (this.flashTimer <= 0 && this.muzzleFlashGroup) {
                    this.muzzleFlashGroup.visible = false;
                    if (this.muzzleFlashLight) this.muzzleFlashLight.intensity = 0;
                }
            }
            // Point flash at camera if visible
            if (this.muzzleFlashGroup && this.muzzleFlashGroup.visible) {
                const gameCamera = window.TacticalShooter.GameManager ? window.TacticalShooter.GameManager.camera : null;
                if (gameCamera) this.muzzleFlashGroup.lookAt(gameCamera.position);
            }
        }
        
        triggerMelee() {
            this.meleeAnim.active = true;
            this.meleeAnim.timer = 0;
        }
        
        triggerFlinch(part, normal) {
            this.flinch.active = true;
            this.flinch.duration = 0.2; 
            this.flinch.timer = this.flinch.duration;
            this.flinch.part = part || 'Torso';
            this.flinch.intensity = 4.0; 
            this.flinch.randX = (Math.random() - 0.5) * 2; 
            this.flinch.randY = (Math.random() - 0.5) * 2;
            
            if (normal && this.mesh) {
                // Use temp vector, don't create new
                const localNorm = normal.clone().applyQuaternion(this.mesh.quaternion.clone().invert());
                this.flinch.dirZ = localNorm.z; 
                this.flinch.dirX = localNorm.x; 
            } else {
                this.flinch.dirZ = -1; // Default Front Hit
                this.flinch.dirX = 0;
            }
        }
        
        update(dt, state, derivedStats, manualGunOffset = null, manualGunRot = null, overrideWorldGunPos = null, overrideWorldGunRot = null) {
            if (!this.parts) return;
            
            const { isMoving, isSprinting, speed } = derivedStats;
            const animRate = isSprinting ? (speed * 0.8) : (speed * 1.4);
            this.animTime += dt * animRate;
            
            // Update Melee
            if (this.meleeAnim.active) {
                this.meleeAnim.timer += dt;
                if (this.meleeAnim.timer >= this.meleeAnim.duration) {
                    this.meleeAnim.active = false;
                }
            }
            
            // Update Flinch
            if (this.flinch.active) {
                this.flinch.timer -= dt;
                if (this.flinch.timer <= 0) {
                    this.flinch.active = false;
                    this.flinch.intensity = 0;
                } else {
                    this.flinch.intensity = Math.pow(this.flinch.timer / this.flinch.duration, 2) * 4.0; 
                }
            }

            // 1. Base Body Animation
            this._updateProceduralMovement(dt, state, derivedStats);
            
            // 2. Head Look
            const targetHeadPitch = state.lookPitch - this.targets.torsoRot.x;
            this.targets.headRot.set(targetHeadPitch, 0, 0);
            
            // --- Apply Flinch Offsets ---
            if (this.flinch.active) {
                const i = this.flinch.intensity;
                const p = this.flinch.part;
                const rx = this.flinch.randX;
                const dz = this.flinch.dirZ; 
                const dx = this.flinch.dirX; 
                
                let torqueDir = Math.sign(dx * dz);
                if (Math.abs(dx) < 0.1) torqueDir = Math.sign(rx); 

                if (p === 'Head') {
                    const snapDir = (dz < 0) ? 1 : -1; 
                    this.targets.headRot.x += snapDir * 0.14 * i; 
                    this.targets.headRot.y += 0.12 * torqueDir * i; 
                    this.targets.torsoRot.x += snapDir * 0.06 * i;
                } 
                else if (p === 'Arm' || p === 'Hand') {
                    this.targets.torsoRot.y += 0.6 * torqueDir * i; 
                    this.targets.torsoRot.z += 0.15 * Math.sign(dx) * i; 
                } 
                else if (p === 'Leg') {
                    this.targets.bodyPos.y -= 0.15 * i; 
                    this.targets.torsoRot.x += 0.3 * i; 
                    if (rx > 0) this.targets.rightLeg.rot.x -= 0.8 * i; 
                    else this.targets.leftLeg.rot.x -= 0.8 * i;
                } 
                else {
                    this.targets.torsoRot.y += 0.7 * torqueDir * i; 
                    this.targets.torsoRot.x += 0.25 * i; 
                    this.targets.bodyPos.z -= 0.15 * i; 
                }
            }

            // 3. Apply Base Transforms
            this._applyBaseTransforms(dt, isMoving, state.isSliding);
            
            // 4. Force Matrix Update
            this.mesh.updateMatrixWorld(true);
            
            // 5. IK Solver
            this._updateIKArms(dt, state, derivedStats, manualGunOffset, manualGunRot, overrideWorldGunPos, overrideWorldGunRot);
        }

        _updateProceduralMovement(dt, state, stats) {
            const T = this.targets;
            const t = this.animTime;
            
            T.bodyPos.set(state.lean * 0.25, 0, 0);
            T.torsoRot.set(0, 0, -state.lean * 0.65);
            
            T.leftLeg.rot.set(0,0,0); T.rightLeg.rot.set(0,0,0);
            T.leftKnee.rotX = 0; T.rightKnee.rotX = 0;
            T.leftFoot.rotX = 0; T.rightFoot.rotX = 0;

            if (state.isProne) {
                T.bodyPos.y = -0.9; 
                T.bodyPos.z = 0.55;   
                T.torsoRot.x = -1.2; 
                T.headRot.x = 1.2; 
                T.leftLeg.rot.x = -1.7; 
                T.rightLeg.rot.x = -1.7;
                T.leftFoot.rotX = 0.5;
                T.rightFoot.rotX = 0.5;

                if (stats.isMoving) {
                    const crawlSpeed = t * 1.5;
                    T.bodyPos.x += Math.sin(crawlSpeed) * 0.1;
                    T.torsoRot.z += Math.cos(crawlSpeed) * 0.1;
                    T.leftKnee.rotX = Math.max(0, Math.sin(crawlSpeed)) * 1.5;
                    T.rightKnee.rotX = Math.max(0, Math.sin(crawlSpeed + Math.PI)) * 1.5;
                } else {
                    T.leftLeg.rot.y = -0.15;
                    T.rightLeg.rot.y = 0.15;
                }

            } else if (stats.isSliding) {
                T.bodyPos.y = -0.8; 
                T.bodyPos.z = 0.2;
                T.torsoRot.x = 0.5; 
                
                let yawDiff = state.lookYaw - this.mesh.rotation.y;
                while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
                T.headRot.y = yawDiff; 

                T.leftLeg.rot.x = 1.57; 
                T.rightLeg.rot.x = 1.9; 
                T.rightKnee.rotX = -1.7; 

            } else if (stats.isCrouching) {
                if (stats.isMoving) {
                    T.bodyPos.y = -0.25;
                    T.torsoRot.x = -0.6; 
                    const strideAmp = 0.6;
                    T.leftLeg.rot.x = 1.1 + Math.sin(t * 1.5) * strideAmp;
                    T.leftKnee.rotX = -1.9 + Math.sin(t * 1.5 - 0.5) * 0.4;
                    T.rightLeg.rot.x = 1.1 + Math.sin(t * 1.5 + Math.PI) * strideAmp;
                    T.rightKnee.rotX = -1.9 + Math.sin(t * 1.5 + Math.PI - 0.5) * 0.4;
                } else {
                    T.bodyPos.y = -0.48;
                    T.torsoRot.x = -0.3;
                    T.leftLeg.rot.x = 1.6; T.leftKnee.rotX = -1.6;
                    T.rightLeg.rot.y = -0.5; T.rightLeg.rot.x = 0.2; T.rightKnee.rotX = -2.0;
                }
            } else if (stats.isMoving) {
                if (stats.isSprinting) {
                    T.torsoRot.x = -0.3; 
                    const spT = this.animTime * 1.5;
                    T.leftLeg.rot.x = Math.sin(spT) * 1.2;
                    T.rightLeg.rot.x = Math.sin(spT + Math.PI) * 1.2;
                    T.leftKnee.rotX = -Math.max(0, Math.sin(spT)*2);
                    T.rightKnee.rotX = -Math.max(0, Math.sin(spT + Math.PI)*2);
                } else {
                    T.leftLeg.rot.x = Math.sin(t) * 0.9;
                    T.rightLeg.rot.x = Math.sin(t + Math.PI) * 0.9;
                    T.leftKnee.rotX = -Math.max(0, Math.sin(t + 0.5)) * 1.2;
                    T.rightKnee.rotX = -Math.max(0, Math.sin(t + 0.5 + Math.PI)) * 1.2;
                }
            } else {
                T.bodyPos.y = Math.sin(this.animTime * 1.5) * 0.005;
                T.leftKnee.rotX = -0.05;
                T.rightKnee.rotX = -0.05;
            }

            if (state.isADS && !stats.isCrouching && !stats.isSliding && !state.isProne) {
                T.torsoRot.x -= 0.3;
            }
        }

        _applyBaseTransforms(dt, isMoving, isSliding) {
            const P = this.parts;
            const T = this.targets;
            
            let smooth = isMoving ? (dt * 25.0) : (dt * 20.0);
            if (Math.abs(P.torso.rotation.x - T.torsoRot.x) > 0.5) smooth = dt * 3.0; 
            if (isSliding) smooth = dt * 40.0;

            const applyRot = (obj, target) => {
                obj.rotation.x = THREE.MathUtils.lerp(obj.rotation.x, target.x, smooth);
                obj.rotation.y = THREE.MathUtils.lerp(obj.rotation.y, target.y, smooth);
                obj.rotation.z = THREE.MathUtils.lerp(obj.rotation.z, target.z, smooth);
            };

            P.bodyGroup.position.x = THREE.MathUtils.lerp(P.bodyGroup.position.x, T.bodyPos.x, smooth);
            P.bodyGroup.position.y = THREE.MathUtils.lerp(P.bodyGroup.position.y, T.bodyPos.y, smooth);
            P.bodyGroup.position.z = THREE.MathUtils.lerp(P.bodyGroup.position.z, T.bodyPos.z, smooth);
            
            P.bodyGroup.rotation.y = THREE.MathUtils.lerp(P.bodyGroup.rotation.y, T.torsoRot.y, smooth);
            
            applyRot(P.torso, T.torsoRot);
            applyRot(P.head, T.headRot);
            applyRot(P.leftLeg, T.leftLeg.rot);
            applyRot(P.rightLeg, T.rightLeg.rot);
            
            P.leftLeg.userData.knee.rotation.x = THREE.MathUtils.lerp(P.leftLeg.userData.knee.rotation.x, T.leftKnee.rotX, smooth);
            P.rightLeg.userData.knee.rotation.x = THREE.MathUtils.lerp(P.rightLeg.userData.knee.rotation.x, T.rightKnee.rotX, smooth);
            
            if (P.leftLeg.userData.knee.userData.foot) {
                P.leftLeg.userData.knee.userData.foot.rotation.x = THREE.MathUtils.lerp(
                    P.leftLeg.userData.knee.userData.foot.rotation.x, T.leftFoot.rotX, smooth
                );
            }
            if (P.rightLeg.userData.knee.userData.foot) {
                P.rightLeg.userData.knee.userData.foot.rotation.x = THREE.MathUtils.lerp(
                    P.rightLeg.userData.knee.userData.foot.rotation.x, T.rightFoot.rotX, smooth
                );
            }
        }

        _updateIKArms(dt, state, stats, manualGunOffset, manualGunRot, overrideWorldGunPos, overrideWorldGunRot) {
            const P = this.parts;
            const U = this._upd; // Use pool

            U.headPos.set(0,0,0);
            P.head.getWorldPosition(U.headPos);
            
            if (overrideWorldGunPos && overrideWorldGunRot) {
                U.handGripOffset.set(0,0,0);
                if (this.weaponParts && this.weaponParts.handRight) {
                    U.handGripOffset.copy(this.weaponParts.handRight.position);
                }
                // rotatedOffset = handGripOffset.applyQuaternion(overrideWorldGunRot)
                U.rotatedGripOffset.copy(U.handGripOffset).applyQuaternion(overrideWorldGunRot);
                
                U.worldGunPos.copy(overrideWorldGunPos).add(U.rotatedGripOffset);
                U.worldGunRot.copy(overrideWorldGunRot);
                
            } else {
                let visualPitch = state.lookPitch;
                if (visualPitch > 1.4) visualPitch = 1.4; 
                if (visualPitch < -1.5) visualPitch = -1.5; 
                
                U.tempEuler.set(visualPitch, state.lookYaw, 0, 'YXZ');
                U.viewQuat.setFromEuler(U.tempEuler);
                
                U.targetOffset.set(0,0,0);
                U.targetRotOffset.set(0,0,0,1);

                if (manualGunOffset && manualGunRot) {
                    this.currentGunOffset.lerp(manualGunOffset, dt * 25);
                    this.currentGunRotOffset.slerp(manualGunRot, dt * 25);
                } else {
                    const isBlocked = stats.wallDistance < 0.6;
                    
                    // --- WEAPON SPECIFIC POSES (Data Driven) ---
                    const weaponType = this.weaponDef ? this.weaponDef.id : "PISTOL";
                    const isKnife = (weaponType === 'KNIFE');
                    const isShotgun = (weaponType.includes('SHOTGUN'));
                    const isGrenade = (this.weaponDef && this.weaponDef.type === 'throwable');
                    
                    if (isBlocked && !isGrenade) {
                        U.targetOffset.set(0.15, -0.2, -0.25); 
                        U.targetRotOffset.setFromAxisAngle(U.tempVec.set(1,0,0), 1.0);
                    } 
                    else if (state.isProne) {
                        U.targetOffset.set(0.0, -0.08, -0.65); 
                    } 
                    else if (stats.isSprinting && !state.isADS && !stats.isSliding) {
                        // Tactical Sprint
                        if (isKnife) {
                            U.targetOffset.set(0.2, -0.3, -0.2);
                            U.targetRotOffset.setFromAxisAngle(U.tempVec.set(0,1,0), -0.5);
                        } else if (isGrenade) {
                            U.targetOffset.set(0.2, -0.25, -0.3);
                            U.targetRotOffset.setFromAxisAngle(U.tempVec.set(0,1,0), -0.5);
                        } else {
                            U.targetOffset.set(0.25, -0.35, -0.45); 
                            U.tempQuat.setFromAxisAngle(U.tempVec.set(1,0,0), -0.8);
                            U.targetRotOffset.setFromAxisAngle(U.tempVec.set(0,1,0), -0.6);
                            U.targetRotOffset.multiply(U.tempQuat);
                        }
                    } 
                    else if (state.isADS || stats.isSliding) {
                        if (isGrenade) {
                            // Primed pose
                            U.targetOffset.set(0.25, 0.1, -0.3); // High, pulled back
                            U.targetRotOffset.setFromAxisAngle(U.tempVec.set(1, 0, 0), 0.5); // Tilted back
                        } else if (isShotgun) {
                            U.targetOffset.set(0.0, -0.19, -0.45); // Tighter to shoulder
                        } else {
                            U.targetOffset.set(0.0, -0.165, -0.70); 
                        }
                    } 
                    else {
                        // HIPFIRE STANCE
                        if (isShotgun) {
                            // Skeet Style: Forward, high elbow
                            U.targetOffset.set(0.15, -0.18, -0.3);
                            U.targetRotOffset.setFromAxisAngle(U.tempVec.set(1,0,0), 0.1);
                            this.targets.torsoRot.x += 0.2; 
                        } else if (isKnife) {
                            // TPV Knife Pose
                            U.targetOffset.set(0.25, -0.35, -0.4);
                            U.targetRotOffset.setFromAxisAngle(U.tempVec.set(0, 1, 0), -0.2);
                            U.tempQuat.setFromAxisAngle(U.tempVec.set(1, 0, 0), 0.3);
                            U.targetRotOffset.multiply(U.tempQuat);
                        } else if (isGrenade) {
                            // Idle Grenade Hold (Chest height)
                            U.targetOffset.set(0.2, -0.15, -0.35);
                            U.targetRotOffset.setFromAxisAngle(U.tempVec.set(1,0,0), 0.2); 
                        } else {
                            // Pistol default
                            U.targetOffset.set(0.2, -0.25, -0.62); 
                        }
                    }

                    if (!isBlocked && !state.isProne) {
                        if (visualPitch > 0.5) {
                            const lookDownIntensity = (visualPitch - 0.5);
                            U.targetOffset.z -= lookDownIntensity * 0.2; 
                            U.targetOffset.y -= lookDownIntensity * 0.1;
                        }
                        else if (visualPitch < -0.5) {
                            const lookUpIntensity = (Math.abs(visualPitch) - 0.5);
                            U.targetOffset.z -= lookUpIntensity * 0.2;
                            U.targetOffset.y += lookUpIntensity * 0.05;
                        }
                    }
                    
                    // MELEE/THROW ANIMATION OFFSET
                    if (this.meleeAnim.active) {
                        const t = this.meleeAnim.timer / this.meleeAnim.duration; // 0 to 1
                        const animT = Math.sin(t * Math.PI);
                        
                        if (isGrenade) {
                            // Throw motion: Pull back then thrust forward
                            // t=0 (start), t=0.2 (cock back), t=0.5 (release/forward), t=1 (done)
                            
                            // Simple linear approximation for throw
                            U.targetOffset.z -= animT * 0.6; // Thrust forward
                            U.targetOffset.y += animT * 0.3; // Upward arc
                            U.tempQuat.setFromAxisAngle(U.tempVec.set(1, 0, 0), -animT * 1.0); // Wrist flick down
                            U.targetRotOffset.multiply(U.tempQuat);
                        } else {
                            // Stab forward and rotate down
                            const stabAmt = animT * 0.4;
                            U.targetOffset.z -= stabAmt; 
                            U.targetOffset.y += stabAmt * 0.1;
                            U.tempQuat.setFromAxisAngle(U.tempVec.set(1, 0, 0), -stabAmt * 0.5);
                            U.targetRotOffset.multiply(U.tempQuat);
                        }
                    }

                    if (stats.isMoving && !isBlocked && !state.isADS) {
                        const visuals = this.weaponDef && this.weaponDef.visuals ? this.weaponDef.visuals : {};
                        const walkBobSpeed = visuals.walkBobSpeed || 8.0;
                        const walkBobAmount = visuals.walkBobAmount || 0.03;
                        const sprintBobSpeed = visuals.sprintBobSpeed || 13.0;
                        const sprintBobAmount = visuals.sprintBobAmount || 0.025;
                        
                        let bobFreq = stats.isSprinting ? sprintBobSpeed : walkBobSpeed;
                        let bobAmp = stats.isSprinting ? sprintBobAmount : walkBobAmount;
                        if (stats.isSliding) { bobFreq = 18.0; bobAmp = 0.0015; }
                        if (state.isProne) { bobFreq = 4.0; bobAmp = 0.04; }

                        this.bobTime = (this.bobTime || 0) + dt * bobFreq;
                        const bobX = Math.cos(this.bobTime) * bobAmp * 0.5;
                        const bobY = Math.abs(Math.sin(this.bobTime)) * bobAmp;
                        
                        U.targetOffset.x += bobX;
                        U.targetOffset.y -= bobY;
                        
                        let rotBobZ = 0;
                        let rotBobX = 0;
                        if (stats.isSprinting) {
                            rotBobZ = Math.cos(this.bobTime) * 0.05; 
                            rotBobX = Math.sin(this.bobTime * 2) * 0.04;
                        } else {
                            rotBobZ = Math.cos(this.bobTime) * 0.02;
                        }
                        
                        U.tempEuler.set(rotBobX, 0, rotBobZ);
                        U.tempQuat.setFromEuler(U.tempEuler);
                        U.targetRotOffset.multiply(U.tempQuat);
                    } else {
                        this.bobTime = (this.bobTime || 0) + dt * 1.0;
                        U.targetOffset.y += Math.sin(this.bobTime * 2.0) * 0.003;
                        U.targetOffset.x += Math.cos(this.bobTime * 1.5) * 0.002;
                    }

                    this.currentGunOffset.lerp(U.targetOffset, dt * 10);
                    this.currentGunRotOffset.slerp(U.targetRotOffset, dt * 10);
                }

                // worldGunPos = currentGunOffset.applyQuaternion(viewQuat).add(headPos)
                U.worldGunPos.copy(this.currentGunOffset).applyQuaternion(U.viewQuat).add(U.headPos);
                // worldGunRot = viewQuat.multiply(currentGunRotOffset)
                U.worldGunRot.copy(U.viewQuat).multiply(this.currentGunRotOffset);
                
                if (this.flinch.active && (this.flinch.part === 'Arm' || this.flinch.part === 'Hand')) {
                    U.worldGunPos.y -= 0.6 * this.flinch.intensity; 
                    U.worldGunPos.x += 0.4 * this.flinch.randX * this.flinch.intensity; 
                }
            }

            U.tempEuler.set(0, state.lookYaw, 0, 'YXZ');
            U.bodyYawQuat.setFromEuler(U.tempEuler);
            
            // --- DATA DRIVEN IK HINTS ---
            const remoteIK = this.weaponDef && this.weaponDef.visuals && this.weaponDef.visuals.remoteIK;
            const isGrenade = (this.weaponDef && this.weaponDef.type === 'throwable');
            
            if (remoteIK && remoteIK.rightElbow) {
                U.rElbowDir.copy(remoteIK.rightElbow).normalize();
            } else {
                U.rElbowDir.set(0.5, -1.0, 0.2).normalize();
            }
            
            if (remoteIK && remoteIK.leftElbow) {
                U.lElbowDir.copy(remoteIK.leftElbow).normalize();
            } else {
                U.lElbowDir.set(-0.5, -1.0, 0.2).normalize();
            }

            if (state.isProne) {
                U.rElbowDir.set(0.8, -0.2, 0).normalize();
                U.lElbowDir.set(-0.8, -0.2, 0).normalize();
            }

            // worldRElbowHint = rElbowDir.applyQuaternion(bodyYawQuat).add(headPos)
            U.worldRElbowHint.copy(U.rElbowDir).applyQuaternion(U.bodyYawQuat).add(U.headPos);
            U.worldLElbowHint.copy(U.lElbowDir).applyQuaternion(U.bodyYawQuat).add(U.headPos);

            U.rShoulderPos.set(0,0,0);
            P.rightArm.getWorldPosition(U.rShoulderPos);
            
            this._solveTwoBoneIK(P.rightArm, P.rightArm.userData.elbow, U.rShoulderPos, U.worldGunPos, U.worldRElbowHint);
            P.rightArm.updateMatrixWorld(true);
            
            // --- WEAPON MESH ATTACHMENT ---
            
            // Special case for Knife Hand IK target from Data, or default offset logic
            if (remoteIK && remoteIK.leftHandPos) {
                U.tempVec.set(remoteIK.leftHandPos.x, remoteIK.leftHandPos.y, remoteIK.leftHandPos.z).applyQuaternion(U.bodyYawQuat);
                U.leftHandTargetPos.copy(U.headPos).add(U.tempVec);
            } else if (isGrenade) {
                // Free hand for grenade pose (Lowered, relaxed)
                // Left hand not involved in holding grenade
                U.tempVec.set(-0.25, -0.4, 0.1).applyQuaternion(U.bodyYawQuat);
                U.leftHandTargetPos.copy(U.headPos).add(U.tempVec);
            } else {
                // Standard Rifle Grip
                U.tempVec.set(0, 0.05, -0.25).applyQuaternion(U.worldGunRot);
                U.leftHandTargetPos.copy(U.worldGunPos).add(U.tempVec);
            }

            if (this.weaponMesh) {
                U.handGripOffset.set(0, 0, 0);
                if (this.weaponParts && this.weaponParts.handRight) {
                    U.handGripOffset.copy(this.weaponParts.handRight.position);
                }

                U.wristLocalPos.set(0, -this.lowerArmLen, 0);
                P.rightArm.userData.elbow.getWorldQuaternion(U.elbowWorldQuat);
                U.elbowInvQuat.copy(U.elbowWorldQuat).invert();
                
                // weaponLocalRot = elbowInvQuat * worldGunRot
                U.weaponLocalRot.copy(U.elbowInvQuat).multiply(U.worldGunRot);
                this.weaponMesh.quaternion.copy(U.weaponLocalRot);
                
                // rotatedGripOffset = handGripOffset.applyQuaternion(weaponLocalRot)
                U.rotatedGripOffset.copy(U.handGripOffset).applyQuaternion(U.weaponLocalRot);
                
                this.weaponMesh.position.copy(U.wristLocalPos).sub(U.rotatedGripOffset);
                this.weaponMesh.updateMatrixWorld(true);
                
                // --- IK Left Hand Adjustment for Specific Weapons (if hand node exists on gun) ---
                if (this.weaponParts && this.weaponParts.handLeft && (!remoteIK || !remoteIK.leftHandPos) && !isGrenade) {
                    U.tempVec.set(0,0,0);
                    this.weaponParts.handLeft.getWorldPosition(U.tempVec);
                    U.leftHandTargetPos.copy(U.tempVec);
                    
                    if (this.weaponDef && this.weaponDef.visuals && this.weaponDef.visuals.leftHandOffset) {
                        const offsetConfig = this.weaponDef.visuals.leftHandOffset;
                        U.tempVec.set(offsetConfig.x, offsetConfig.y, offsetConfig.z);
                        U.tempVec.applyQuaternion(U.worldGunRot);
                        U.leftHandTargetPos.add(U.tempVec);
                    }
                }
            }

            U.lShoulderPos.set(0,0,0);
            P.leftArm.getWorldPosition(U.lShoulderPos);
            this._solveTwoBoneIK(P.leftArm, P.leftArm.userData.elbow, U.lShoulderPos, U.leftHandTargetPos, U.worldLElbowHint);
        }

        _solveTwoBoneIK(bone1, bone2, rootPos, targetPos, hintPos) {
            const K = this._ik;
            const l1 = this.upperArmLen;
            const l2 = this.lowerArmLen;
            
            // dir = targetPos - rootPos
            K.dir.subVectors(targetPos, rootPos);
            const dist = K.dir.length();
            const maxReach = (l1 + l2) * 0.999;
            
            if (dist > maxReach) {
                K.dir.normalize().multiplyScalar(maxReach);
            }
            
            const distSq = K.dir.lengthSq(); // Recalculate if clamped? Yes.
            
            // Law of Cosines
            const cos1 = (distSq + l1*l1 - l2*l2) / (2 * Math.sqrt(distSq) * l1);
            const angle1 = Math.acos(Math.min(1, Math.max(-1, cos1)));
            const cos2 = (l1*l1 + l2*l2 - distSq) / (2 * l1 * l2);
            const angle2 = Math.acos(Math.min(1, Math.max(-1, cos2)));
            
            K.targetDir.copy(K.dir).normalize();
            // boneAxis is (0, -1, 0)
            K.qBase.setFromUnitVectors(K.boneAxis, K.targetDir);
            
            // hintVec = hintPos - rootPos
            K.hintVec.subVectors(hintPos, rootPos);
            // planeNormal = targetDir cross hintVec
            K.planeNormal.crossVectors(K.targetDir, K.hintVec).normalize();
            
            // Construct Basis Matrix
            K.axisY.copy(K.targetDir).negate(); 
            K.axisX.copy(K.planeNormal); 
            K.axisZ.crossVectors(K.axisX, K.axisY).normalize();
            K.mtx.makeBasis(K.axisX, K.axisY, K.axisZ);
            K.qOrient.setFromRotationMatrix(K.mtx);
            
            // Bend Rotation
            K.qBend.setFromAxisAngle(K.axisX, angle1);
            
            // Combined Upper Arm Rotation
            K.qUpper.copy(K.qBend).multiply(K.qOrient);
            
            if (bone1.parent) {
                K.qParentInv.set(0,0,0,1);
                bone1.parent.getWorldQuaternion(K.qParentInv);
                K.qParentInv.invert();
                bone1.quaternion.copy(K.qParentInv).multiply(K.qUpper);
            } else {
                bone1.quaternion.copy(K.qUpper);
            }
            
            // Lower Arm Bend
            const bendAngle = -(Math.PI - angle2);
            // Local axis X is typically the bend axis if initialized correctly, 
            // but previous code used global X (1,0,0) which implies bone2 is aligned.
            // Let's assume (1,0,0) works for local space of bone2.
            bone2.quaternion.setFromAxisAngle(K.axisX.set(1, 0, 0), bendAngle);
        }
    }

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.RemotePlayerAnimator = RemotePlayerAnimator;
})();
