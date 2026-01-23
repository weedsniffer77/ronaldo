
// js/ui/prematch/lobby_ui.js
(function() {
    const LobbyUI = {
        container: null,
        
        init() {
            console.log("LobbyUI: Initializing...");
            if (!document.getElementById('lobby-ui-layer')) {
                const div = document.createElement('div');
                div.id = 'lobby-ui-layer';
                div.innerHTML = `
                    <div id="lobby-tint-layer"></div>
                    <div id="lobby-targeting-cross">
                        <div class="reticle-line ret-top"></div>
                        <div class="reticle-line ret-bot"></div>
                        <div class="reticle-line ret-left"></div>
                        <div class="reticle-line ret-right"></div>
                        <div class="grid-line grid-h-1"></div>
                        <div class="grid-line grid-h-2"></div>
                        <div class="grid-line grid-v-1"></div>
                        <div class="grid-line grid-v-2"></div>
                    </div>
                    
                    <!-- Settings Button Removed -->

                    <div id="lobby-settings-bar"></div>
                    <div id="lobby-teams-container"></div>
                    <div id="lobby-launch-control"></div>
                    
                    <!-- LOADOUT BUTTON (Holo Style) -->
                    <div style="position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); pointer-events: auto; z-index: 5000;">
                        <button onclick="window.TacticalShooter.LoadoutUI.open()" class="holo-btn" style="width: 200px;">LOADOUT</button>
                    </div>
                `;
                document.body.appendChild(div);
            }
            
            this.container = document.getElementById('lobby-ui-layer');
            
            if (window.TacticalShooter.LobbySettings) window.TacticalShooter.LobbySettings.init();
            if (window.TacticalShooter.TeamSelector) window.TacticalShooter.TeamSelector.init();
            if (window.TacticalShooter.LaunchControl) window.TacticalShooter.LaunchControl.init();
        },

        show() {
            if (this.container) {
                this.container.classList.add('active');
                // Ensure opacity is reset if it was faded out before
                this.container.style.opacity = 1;
                this.container.style.display = 'block'; 
            }
            
            document.body.classList.add('lobby-active');
            
            let filter = "grayscale(100%) contrast(1.2) brightness(1.2)";
            
            // Dynamic Config Check
            const GM = window.TacticalShooter.GameManager;
            const activeConfig = GM ? GM.getActiveGameConfig() : null;
            
            if (activeConfig && activeConfig.lobbyVisuals && activeConfig.lobbyVisuals.filter) {
                filter = activeConfig.lobbyVisuals.filter;
            } else if (window.TESTING_GAME_CONFIG && window.TESTING_GAME_CONFIG.lobbyVisuals && window.TESTING_GAME_CONFIG.lobbyVisuals.filter) {
                filter = window.TESTING_GAME_CONFIG.lobbyVisuals.filter;
            }

            const canvas = document.getElementById('game-canvas');
            if (canvas) canvas.style.filter = filter;
            
            document.getElementById('hud').style.display = 'none';
            document.getElementById('crosshair').style.display = 'none';
            
            const rc = document.getElementById('room-code-display');
            if (rc) { rc.style.display = 'flex'; rc.style.zIndex = '3000'; }
            
            this.updateUI();
            this.updateLoop();
        },

        hide() {
            if (this.container) this.container.classList.remove('active');
            document.body.classList.remove('lobby-active');
            const canvas = document.getElementById('game-canvas');
            if (canvas) canvas.style.filter = "none";
            
            // Force close editor if game starts
            if (window.TacticalShooter.LoadoutUI) window.TacticalShooter.LoadoutUI.close();
        },
        
        updateUI() {
            if (window.TacticalShooter.LobbySettings) window.TacticalShooter.LobbySettings.render();
            if (window.TacticalShooter.TeamSelector) window.TacticalShooter.TeamSelector.render();
            if (window.TacticalShooter.LaunchControl) window.TacticalShooter.LaunchControl.render();
        },
        
        updateLoop() {
            if (!this.container.classList.contains('active')) return;
            requestAnimationFrame(() => this.updateLoop());
            if (window.TacticalShooter.LaunchControl) window.TacticalShooter.LaunchControl.update();
            const cam = window.TacticalShooter.TacticalCamera;
            if (cam) {
                const isMoving = cam.isDragging;
                const zoom = cam.zoomLevel; 
                const zoomGap = (3.0 - zoom) * 6; 
                const moveGap = isMoving ? 15 : 0; 
                const totalGap = Math.max(0, zoomGap + moveGap);
                const cross = document.getElementById('lobby-targeting-cross');
                if (cross) { cross.style.setProperty('--reticle-gap', `${totalGap}px`); }
            }
            if (window.performance.now() % 500 < 20) {
                 if (window.TacticalShooter.TeamSelector) window.TacticalShooter.TeamSelector.render();
            }
        }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.LobbyUI = LobbyUI;
})();
