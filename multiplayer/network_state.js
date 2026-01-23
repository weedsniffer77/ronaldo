
// js/multiplayer/network_state.js
(function() {
    const NetworkState = {
        /**
         * Collects all relevant local player data and formats it for transmission.
         * Returns null if dependencies aren't ready.
         */
        getLocalPacket() {
            const charController = window.TacticalShooter.CharacterController;
            const playerState = window.TacticalShooter.PlayerState;
            const playerCamera = window.TacticalShooter.PlayerCamera;
            const inputManager = window.TacticalShooter.InputManager;
            const gunRenderer = window.TacticalShooter.GunRenderer;
            const weaponManager = window.TacticalShooter.WeaponManager;
            
            if (!charController || !playerState || !playerCamera || !inputManager) {
                return null;
            }
            
            const currentWep = weaponManager && weaponManager.currentWeapon ? weaponManager.currentWeapon : null;

            return {
                position: {
                    x: Math.round(charController.position.x * 100) / 100,
                    y: Math.round(charController.position.y * 100) / 100,
                    z: Math.round(charController.position.z * 100) / 100
                },
                rotation: {
                    x: Math.round(playerCamera.pitch * 100) / 100,
                    y: Math.round(playerCamera.yaw * 100) / 100,
                    z: 0
                },
                lean: Math.round(charController.effectiveLean * 100) / 100, 
                
                // State Flags
                currentAmmo: playerState.currentAmmo,
                isADS: playerState.isADS,
                isCrouching: charController.isCrouching,
                isSliding: charController.isSliding,
                isProne: charController.isProne, 
                
                // Use robust state from controller instead of inferring from inputs
                isSprinting: charController.isSprinting, 
                
                isAttachmentOn: playerState.isAttachmentOn, 
                
                // Weapon State
                isGunBlocked: gunRenderer ? gunRenderer.isBarrelBlocked : false, 
                weaponId: currentWep ? currentWep.id : "PISTOL",
                attachments: currentWep ? currentWep.attachments : [],
                
                // Abstract Animation Action
                actionId: playerState.currentActionId,
                actionStartTime: playerState.actionStartTime, 
                
                health: playerState.health
            };
        }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.NetworkState = NetworkState;
})();
