
// js/player/character_controller.js
(function() {
    const CharacterController = {
        position: null,
        velocity: null,
        
        config: {
            walkSpeed: 5.4,   
            sprintSpeed: 7.5, 
            crouchSpeed: 2.3, 
            proneSpeed: 1.35, 
            adsSpeed: 2.7,    
            
            jumpForce: 9.5, 
            gravity: -25.0,
            
            standingHeight: 1.85, 
            crouchHeight: 0.9,
            slideHeight: 0.7, 
            proneHeight: 0.4, 
            radius: 0.6, 
            
            acceleration: 30.0,
            friction: 12.0,
            airControl: 0.2,

            leanMaxDistance: 0.6, 
            leanSmoothing: 4.0,

            slideSpeedThreshold: 5.5, 
            slideForce: 12.0,         
            slideFriction: 1.5,       
            slideDuration: 1.2,       
            slideCooldown: 0.5        
        },
        
        isGrounded: false,
        isCrouching: false,
        isProne: false, 
        forcedProne: false, 
        isSliding: false,
        isSprinting: false, 
        
        // Crouch Toggle State
        crouchToggleActive: false,
        
        currentHeight: 1.85,
        targetHeight: 1.85,
        
        headOffset: 0, 
        leanFactor: 0, 
        effectiveLean: 0, 
        leanOffset: null, 
        isSupported: false, 
        
        slideTimer: 0,
        slideCooldownTimer: 0,
        slideDirection: null,
        
        init(startPosition) {
            this.position = startPosition.clone();
            this.velocity = new THREE.Vector3();
            this.currentHeight = this.config.standingHeight;
            this.targetHeight = this.config.standingHeight;
            
            this.leanOffset = new THREE.Vector3();
            this.slideDirection = new THREE.Vector3();
            
            this.forcedProne = false;
            this.isProne = false;
            this.isCrouching = false;
            this.isSliding = false;
            this.isSprinting = false;
            this.crouchToggleActive = false;
            
            if (window.TacticalShooter.PhysicsController) {
                window.TacticalShooter.PhysicsController.init();
            }
        },
        
        applyImpulse(vector) {
            this.velocity.add(vector);
        },
        
        update(dt, inputManager, playerState, scene) {
            if (this.slideCooldownTimer > 0) this.slideCooldownTimer -= dt;
            
            let movementBlocked = false;
            if (window.TacticalShooter.MatchState && window.TacticalShooter.MatchState.state.status === 'PRE_ROUND') {
                movementBlocked = true;
            }

            const yaw = window.TacticalShooter.PlayerCamera ? window.TacticalShooter.PlayerCamera.yaw : 0;
            
            const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).negate(); 
            const right = new THREE.Vector3(Math.sin(yaw - Math.PI/2), 0, Math.cos(yaw - Math.PI/2)).negate();
            
            const wishDir = new THREE.Vector3();
            
            if (!movementBlocked) {
                if (inputManager.isActionActive('Forward')) wishDir.add(forward);
                if (inputManager.isActionActive('Backward')) wishDir.sub(forward);
                if (inputManager.isActionActive('Left')) wishDir.sub(right);
                if (inputManager.isActionActive('Right')) wishDir.add(right);
                if (wishDir.length() > 0) wishDir.normalize();
            }

            const horizontalVelocity = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
            const currentSpeed = horizontalVelocity.length();
            
            const isPronePressed = !movementBlocked && inputManager.wasActionJustPressed('Prone');

            this.updateStance(dt, isPronePressed, currentSpeed, horizontalVelocity, inputManager, scene, forward, movementBlocked);
            
            this.updateVelocity(dt, wishDir, playerState, forward, inputManager, scene);
            
            if (window.TacticalShooter.PhysicsController) {
                const result = window.TacticalShooter.PhysicsController.move(
                    this.position, 
                    this.velocity, 
                    this.config.radius, 
                    this.currentHeight, 
                    dt, 
                    scene,
                    this.isCrouching,
                    this.isSliding
                );
                
                this.isGrounded = result.isGrounded;
                this.isSupported = result.isSupported;
                
                this.headOffset = THREE.MathUtils.lerp(this.headOffset, result.headOffset, 0.2);
                
                let leanInput = 0;
                if (!movementBlocked) {
                    leanInput = (inputManager.isActionActive('LeanRight') ? 1 : 0) - (inputManager.isActionActive('LeanLeft') ? 1 : 0);
                }
                this.leanFactor += (leanInput - this.leanFactor) * dt * this.config.leanSmoothing;
                
                const leanData = window.TacticalShooter.PhysicsController.getLeanOffset(
                    this.position, 
                    this.currentHeight + this.headOffset, 
                    this.leanFactor, 
                    this.config.leanMaxDistance, 
                    scene, 
                    right
                );
                this.leanOffset.copy(leanData.offset);
                this.effectiveLean = leanData.effective;
            }
            
            if (this.position.y < -50) {
                this.position.set(0, 10, 0);
                this.velocity.set(0, 0, 0);
            }
            
            return this.position;
        },
        
        updateStance(dt, isPronePressed, currentSpeed, horizontalVelocity, inputManager, scene, forwardDir, movementBlocked) {
            const pc = window.TacticalShooter.PhysicsController;
            const hasHeadroomForStand = pc ? pc.hasHeadroom(this.position, this.config.standingHeight, scene) : true;
            const hasHeadroomForCrouch = pc ? pc.hasHeadroom(this.position, this.config.crouchHeight, scene) : true;

            let isCrouchHeld = false;
            
            if (!movementBlocked) {
                // UPDATE: Access SettingsManager
                const settings = window.TacticalShooter.SettingsManager ? window.TacticalShooter.SettingsManager.settings : {};
                const isToggleMode = settings.toggleCrouch;
                
                if (isToggleMode) {
                    if (inputManager.wasActionJustPressed('Crouch')) {
                        this.crouchToggleActive = !this.crouchToggleActive;
                    }
                    if (this.isSprinting && currentSpeed > this.config.walkSpeed) {
                        this.crouchToggleActive = false;
                    }
                    isCrouchHeld = this.crouchToggleActive;
                } else {
                    isCrouchHeld = inputManager.isActionActive('Crouch');
                }
            }

            if (isPronePressed && this.isGrounded && !this.isSliding) {
                this.isProne = !this.isProne;
                this.forcedProne = false; 
                if (this.isProne) {
                    this.isCrouching = false;
                    this.crouchToggleActive = false; 
                } else {
                    if (!hasHeadroomForStand) {
                        if (hasHeadroomForCrouch) {
                            this.isCrouching = true;
                            this.isProne = false;
                        } else {
                            this.isProne = true; 
                        }
                    } else {
                        this.isProne = false;
                        this.isCrouching = false;
                    }
                }
            }

            let attemptSlide = false;
            const isSprintingInput = inputManager.isActionActive('Sprint');
            
            let isMovingForward = false;
            if (currentSpeed > 0.1 && forwardDir) {
                const moveDir = horizontalVelocity.clone().normalize();
                if (moveDir.dot(forwardDir) > 0.1) isMovingForward = true;
            }

            if (isCrouchHeld && !this.isSliding && !this.isProne && this.slideCooldownTimer <= 0) {
                if (this.isGrounded && isSprintingInput && currentSpeed > this.config.slideSpeedThreshold && isMovingForward) {
                    attemptSlide = true;
                }
            }

            if (attemptSlide) {
                this.isSliding = true;
                this.isCrouching = false; 
                this.isProne = false;
                this.forcedProne = false;
                this.slideTimer = this.config.slideDuration;
                this.slideDirection.copy(horizontalVelocity.normalize());
                this.velocity.x += this.slideDirection.x * 2.0;
                this.velocity.z += this.slideDirection.z * 2.0;
                this.targetHeight = this.config.slideHeight; 
            }

            if (this.isSliding) {
                this.slideTimer -= dt;
                this.isCrouching = false; 
                this.isProne = false;
                
                if (inputManager.isActionActive('Jump')) {
                    if (hasHeadroomForStand) {
                        this.velocity.y = this.config.jumpForce;
                        this.isGrounded = false;
                        this.position.y += 0.1;
                        this.isSliding = false;
                        this.slideCooldownTimer = 0; 
                        this.isCrouching = false;
                        this.isProne = false;
                        this.crouchToggleActive = false; 
                    }
                }
                else if (this.slideTimer <= 0 || currentSpeed < 1.0 || !isCrouchHeld) {
                    this.isSliding = false;
                    this.slideCooldownTimer = this.config.slideCooldown;
                    
                    if (!hasHeadroomForCrouch) {
                        this.isProne = true; this.forcedProne = true; this.isCrouching = false;
                    } else if (isCrouchHeld || !hasHeadroomForStand) {
                        this.isCrouching = true; this.isProne = false;
                    } else {
                        this.isCrouching = false; this.isProne = false;
                    }
                } 
                else {
                    this.targetHeight = this.config.slideHeight;
                }
            } 
            else {
                if (this.isProne) {
                    this.targetHeight = this.config.proneHeight;
                    this.isCrouching = false;
                    if (this.forcedProne) {
                        if (isCrouchHeld && hasHeadroomForCrouch) { this.isProne = false; this.forcedProne = false; this.isCrouching = true; } 
                        else if (!isCrouchHeld && hasHeadroomForStand) { this.isProne = false; this.forcedProne = false; this.isCrouching = false; }
                    }
                    if (inputManager.wasActionJustPressed('Jump')) {
                         if (hasHeadroomForStand) { this.isProne = false; this.forcedProne = false; }
                         else if (hasHeadroomForCrouch) { this.isProne = false; this.forcedProne = false; this.isCrouching = true; }
                    }
                } 
                else if (isCrouchHeld) {
                    this.isCrouching = true;
                    this.targetHeight = this.config.crouchHeight;
                } 
                else {
                    if (hasHeadroomForStand) { this.isCrouching = false; this.targetHeight = this.config.standingHeight; } 
                    else if (hasHeadroomForCrouch) { this.isCrouching = true; this.targetHeight = this.config.crouchHeight; } 
                    else { if (!this.isProne) this.forcedProne = true; this.isProne = true; this.targetHeight = this.config.proneHeight; }
                }
            }

            let speed = 10.0;
            if (this.isSliding) speed = 15.0; 
            else if (this.isProne || this.targetHeight === this.config.proneHeight) speed = 4.0; 
            else if (!this.isGrounded) speed = 15.0; 
            
            this.currentHeight += (this.targetHeight - this.currentHeight) * dt * speed;
        },
        
        updateVelocity(dt, wishDir, playerState, forward, inputManager, scene) {
            this.isSprinting = false; 

            if (this.isSliding) {
                const friction = this.config.slideFriction * dt;
                this.velocity.x *= Math.max(0, 1 - friction);
                this.velocity.z *= Math.max(0, 1 - friction);
                const steerForce = 5.0 * dt;
                this.velocity.x += wishDir.x * steerForce;
                this.velocity.z += wishDir.z * steerForce;
            } else {
                const weapon = window.TacticalShooter.WeaponManager ? window.TacticalShooter.WeaponManager.currentWeapon : null;
                const mobilityMult = (weapon && weapon.sprintMultiplier) ? weapon.sprintMultiplier : 1.0;
                
                let targetSpeed = this.config.walkSpeed * mobilityMult;
                
                if (this.isProne) {
                    targetSpeed = this.config.proneSpeed * mobilityMult;
                } else if (this.isCrouching) {
                    targetSpeed = this.config.crouchSpeed * mobilityMult;
                } else {
                    const isMovingForward = wishDir.length() > 0 && wishDir.dot(forward) > 0.5;
                    const isSprintingInput = inputManager.isActionActive('Sprint');
                    
                    if (isSprintingInput && isMovingForward) {
                        const excessiveLean = Math.abs(this.leanFactor) > 0.1;
                        if (!playerState.isADS && !excessiveLean) {
                            targetSpeed = this.config.sprintSpeed * mobilityMult;
                            this.isSprinting = true; 
                        }
                    } else if (!isMovingForward && wishDir.length() > 0) {
                        targetSpeed = (this.config.walkSpeed * mobilityMult) * 0.7; 
                    }
                }

                if (playerState.isADS) {
                    targetSpeed = Math.min(targetSpeed, this.config.adsSpeed * mobilityMult);
                }
                
                if (Math.abs(this.leanFactor) > 0.1) {
                    targetSpeed *= 0.8;
                }

                if (!this.isGrounded) {
                    const currentHorzSpeed = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).length();
                    if (currentHorzSpeed > targetSpeed) {
                        targetSpeed = currentHorzSpeed; 
                    }
                }

                const targetVelocity = wishDir.multiplyScalar(targetSpeed);
                
                if (this.isGrounded) {
                    const accel = this.config.acceleration * dt;
                    this.velocity.x += (targetVelocity.x - this.velocity.x) * Math.min(1, accel);
                    this.velocity.z += (targetVelocity.z - this.velocity.z) * Math.min(1, accel);
                    
                    if (wishDir.length() === 0) {
                        const friction = this.config.friction * dt;
                        this.velocity.x *= Math.max(0, 1 - friction);
                        this.velocity.z *= Math.max(0, 1 - friction);
                    }
                    
                    if (inputManager.isActionActive('Jump') && !this.isCrouching && !this.isProne) {
                        const canJump = window.TacticalShooter.PhysicsController ? window.TacticalShooter.PhysicsController.checkJumpClearance(this.position, this.currentHeight, scene) : true;
                        if (canJump) {
                            this.velocity.y = this.config.jumpForce;
                            this.isGrounded = false;
                            this.position.y += 0.1;
                        }
                    }
                } else {
                    const airAccel = this.config.acceleration * this.config.airControl * dt;
                    this.velocity.x += (targetVelocity.x - this.velocity.x) * Math.min(1, airAccel);
                    this.velocity.z += (targetVelocity.z - this.velocity.z) * Math.min(1, airAccel);
                }
            }
            this.velocity.y += this.config.gravity * dt;
        },
        
        getEyePosition() {
            let eyeY = this.currentHeight * 0.9;
            
            if (window.TacticalShooter.GunRenderer && 
                window.TacticalShooter.GunRenderer.useFullBody) {
                
                if (this.isProne) {
                    eyeY = 0.3; 
                } else if (this.isCrouching && !this.isSliding) {
                    eyeY = Math.max(eyeY, 1.2); 
                }
                eyeY -= 0.05;
            }

            return new THREE.Vector3(
                this.position.x + this.leanOffset.x,
                this.position.y + eyeY + this.headOffset,
                this.position.z + this.leanOffset.z
            );
        },
        
        getHeight() { return this.currentHeight; }
    };
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.CharacterController = CharacterController;
})();
