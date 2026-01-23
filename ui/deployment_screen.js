
// js/ui/deployment_screen.js
(function() {
    const DeploymentScreen = {
        element: null,
        deathInfoElement: null,
        
        init() {
            // Check if exists
            this.element = document.getElementById('deployment-screen');
            this.deathInfoElement = document.getElementById('death-cam-overlay');
        },
        
        // Shows the 5-second death camera info (Killer name + Skip)
        showDeathInfo(killerName) {
            if (!this.deathInfoElement) this.init();
            
            const nameEl = document.getElementById('death-killer-name');
            if (nameEl) {
                nameEl.textContent = killerName || 'UNKNOWN';
            }
            
            // Force display (Overrides inline style="display:none")
            this.deathInfoElement.style.display = 'flex';
            this.deathInfoElement.classList.add('active');
        },
        
        hideDeathInfo() {
            if (this.deathInfoElement) {
                this.deathInfoElement.classList.remove('active');
                this.deathInfoElement.style.display = 'none';
            }
        },
        
        // Shows the final redeploy menu
        show() {
            if (!this.element) this.init();
            this.element.classList.add('active');
            
            // Ensure mouse is unlocked
            if (document.exitPointerLock) document.exitPointerLock();
            
            // Hide HUD
            if (window.TacticalShooter.MultiplayerUI) {
                window.TacticalShooter.MultiplayerUI.setHUDVisible(false);
            }
        },
        
        hide() {
            if (this.element) this.element.classList.remove('active');
            if (this.deathInfoElement) {
                this.deathInfoElement.classList.remove('active');
                this.deathInfoElement.style.display = 'none';
            }
        }
    };
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.DeploymentScreen = DeploymentScreen;
})();
