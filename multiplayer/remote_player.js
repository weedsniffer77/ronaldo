
// js/multiplayer/remote_player.js
(function() {
    class RemotePlayer {
        constructor(player, visualConfig) {
            this.id = player.id;
            this.player = player;
            
            // Visual Components (Passed from Visuals Factory)
            this.name = visualConfig.name;
            this.teamId = visualConfig.teamId;
            this.teamColor = visualConfig.teamColor;
            this.symbol = visualConfig.symbol;
            this.mesh = visualConfig.mesh;
            this.parts = visualConfig.parts;
            this.collisionBox = visualConfig.collisionBox;
            this.tagGroup = visualConfig.tagGroup;
            
            // UI Sprites
            this.nameSprite = visualConfig.nameSprite;
            this.markerSprite = visualConfig.markerSprite;
            this.hpBgSprite = visualConfig.hpBgSprite;
            this.hpDamageSprite = visualConfig.hpDamageSprite;
            this.hpFillSprite = visualConfig.hpFillSprite;
            this.hpWidthBase = visualConfig.hpWidthBase;
            this.hpHeightBase = visualConfig.hpHeightBase;
            
            // State
            this.targetPosition = new THREE.Vector3();
            this.targetRotationY = 0;
            this.damageHealth = 100;
            this.prevHealth = 100;
            this.damageTimer = 0;
            this.isRagdolled = false;
            this.initialHideTimer = 2.0;
            this.joinTime = Date.now();
            
            // Weapon System
            this.currentWeaponId = null;
            this.currentAttachmentsHash = "";
            this.weaponMesh = null;
            this.weaponParts = null;
            this.weaponDef = null;
            this.animator = null;
            this.muzzleFlashGroup = null;
            this.muzzleFlashLight = null;
            
            // STEALTH CACHE
            this.isSuppressed = false;
            
            // Attachments
            this.attachmentLights = [];
            this.attachmentLasers = [];
            this.attachmentLensMeshes = [];
            this.attachmentEmitterMeshes = [];
            this.attachmentGlares = [];
            
            // Hit Reg
            this.processedHitIds = new Set();
            
            // LOD
            this.lodOffset = Math.floor(Math.random() * 4); // To stagger updates
            
            // Init Position
            const pos = player.getState('position');
            const rot = player.getState('rotation');
            if (pos) {
                this.targetPosition.set(pos.x, pos.y, pos.z);
                this.mesh.position.copy(this.targetPosition);
            }
            if (rot) {
                this.targetRotationY = rot.y;
                this.mesh.rotation.y = this.targetRotationY;
            }
        }
        
        cleanup() {
            const scene = window.TacticalShooter.GameManager ? window.TacticalShooter.GameManager.scene : null;
            
            // 1. Cleanup Weapon
            window.TacticalShooter.RemotePlayerVisuals.cleanupWeapon(this);
            
            // 2. Cleanup Mesh
            if (scene && this.mesh) {
                scene.remove(this.mesh);
                // Dispose UI Materials
                [this.nameSprite, this.markerSprite, this.hpBgSprite, this.hpDamageSprite, this.hpFillSprite].forEach(s => {
                    if(s && s.material.map) s.material.map.dispose();
                    if(s) s.material.dispose();
                });
            }
        }
        
        update(dt) {
            // High Frequency Update (Position Interpolation)
            // This runs every frame regardless of LOD
            
            if (this.initialHideTimer > 0) this.initialHideTimer -= dt;
            
            // Update Position Targets
            const pos = this.player.getState('position');
            const rot = this.player.getState('rotation');
            
            if (pos) this.targetPosition.set(pos.x, pos.y, pos.z);
            
            // Smooth Move
            const smoothFactor = 1.0 - Math.exp(-12.0 * dt);
            const prevPos = this.mesh.position.clone();
            this.mesh.position.lerp(this.targetPosition, smoothFactor);
            
            // Velocity calculation for animation
            const moveDelta = this.mesh.position.clone().sub(prevPos);
            const worldVelocity = moveDelta.divideScalar(dt);
            
            // Rotation Logic
            const lookYaw = (rot && typeof rot.y === 'number') ? rot.y : 0;
            const isSliding = this.player.getState('isSliding');
            
            let targetBodyYaw = lookYaw;
            if (isSliding && worldVelocity.length() > 0.5) {
                targetBodyYaw = Math.atan2(worldVelocity.x, worldVelocity.z) + Math.PI;
            }
            
            this.targetRotationY = targetBodyYaw;
            let diff = this.targetRotationY - this.mesh.rotation.y;
            while (diff > Math.PI) diff -= Math.PI * 2; 
            while (diff < -Math.PI) diff += Math.PI * 2;
            this.mesh.rotation.y += diff * smoothFactor;
            
            return worldVelocity;
        }
        
        updateAnim(dt, worldVelocity) {
            // Low Frequency Update (IK / Limbs) - Called based on LOD
            
            const state = {
                lean: this.player.getState('lean') || 0,
                isCrouching: this.player.getState('isCrouching'),
                isSliding: this.player.getState('isSliding'),
                isSprinting: this.player.getState('isSprinting'),
                isADS: this.player.getState('isADS'),
                isProne: this.player.getState('isProne'),
                currentAmmo: this.player.getState('currentAmmo'),
                lookPitch: (this.player.getState('rotation') || {}).x || 0,
                lookYaw: (this.player.getState('rotation') || {}).y || 0
            };
            
            const speed = worldVelocity.length();
            const forwardDir = new THREE.Vector3(0, 0, -1).applyEuler(this.mesh.rotation);
            const fwdSpeed = worldVelocity.dot(forwardDir);
            
            const isMoving = speed > 0.1;
            // Fallback sprinting check if state missing
            const isSprinting = (typeof state.isSprinting === 'boolean') ? state.isSprinting : (fwdSpeed > 5.5);
            
            const isGunBlocked = this.player.getState('isGunBlocked');
            const wallDistance = (isGunBlocked === true) ? 0.5 : 999.0;
            
            const derivedStats = { 
                isMoving, 
                isSprinting, 
                isStrafing: false, 
                isSliding: state.isSliding, 
                isCrouching: state.isCrouching, 
                speed, 
                wallDistance 
            };
            
            if (this.animator) {
                this.animator.update(dt, state, derivedStats);
            }
        }
    }
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.RemotePlayer = RemotePlayer;
})();