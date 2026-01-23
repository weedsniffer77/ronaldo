
// js/ui/ui_elements.js
(function() {
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.UIElements = {
        getHTML() {
            return `
    <!-- Transition Overlay (Fade to Black) -->
    <div id="transition-overlay"></div>
    
    <div id="custom-cursor"></div>
    <div id="ui-tooltip"></div>
    
    <!-- UI HIDDEN WARNING -->
    <div id="ui-hidden-warning" style="display:none; position:fixed; top:10px; left:10px; font-family:'Rajdhani',sans-serif; color:rgba(255,255,255,0.4); font-size:12px; font-weight:600; text-transform:uppercase; z-index:9000; pointer-events:none;"></div>
    
    <div id="game-timer">00:00</div>
    <!-- PRE ROUND TIMER -->
    <div id="pre-round-timer" style="display:none;">MATCH STARTS IN 10</div>

    <div id="killfeed-container"></div>
    <div id="hitmarker-container"></div>
    <div id="damage-indicator-container"></div>
    
    <div id="crosshair">
        <div class="crosshair-line crosshair-h"></div>
        <div class="crosshair-line crosshair-v"></div>
    </div>
    
    <!-- GRENADE CHARGE BAR -->
    <div id="grenade-charge-container" style="position: fixed; top: 55%; left: 50%; transform: translate(-50%, -50%); width: 100px; height: 6px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; display: none; pointer-events: none; z-index: 12;">
        <div id="grenade-charge-fill" style="width: 0%; height: 100%; background: #ffaa00; box-shadow: 0 0 5px rgba(255, 170, 0, 0.8); transition: width 0.05s linear;"></div>
    </div>
    
    <div id="hud">
        <div id="ammo-display">15 <span class="ammo-reserve">/ 90</span></div>
        <div id="player-status">
            <!-- Username display removed per request -->
            <div id="player-name-display" style="display:none;">OPERATOR</div>
            <div id="health-track">
                <div id="health-damage"></div>
                <div id="health-fill"></div>
                <div class="health-segment" style="left: 25%"></div>
                <div class="health-segment" style="left: 50%"></div>
                <div class="health-segment" style="left: 75%"></div>
            </div>
        </div>
        <!-- IN GAME LOADOUT PICKER (Replaces Status) -->
        <div id="ingame-loadout-picker">
            <div style="font-family: 'Rajdhani', sans-serif; font-size: 12px; color: #888; text-align: left; margin-bottom: 5px; letter-spacing: 1px; padding-left: 5px;">SWITCH LOADOUT WITH KEYS 1-5</div>
            <div id="ilp-list"></div>
        </div>
    </div>
    
    <div id="room-code-display" style="display:none;">
        <span class="code-label">CODE:</span> <span class="code-value" id="room-code-value">----</span>
    </div>

    <div id="scoreboard">
        <div class="scoreboard-info">
            <div id="sb-mode">GAME MODE</div>
            <div id="sb-timer">00:00</div>
            <div id="sb-map">on MAP NAME</div>
        </div>
        <div id="sb-status-container"></div>
        <div id="scoreboard-content"></div>
    </div>

    <div id="fps-display">FPS: 0</div>
    <div id="notification-area"></div>
    <div id="instructions"></div>
    <div id="pointer-lock-overlay"></div>

    <div id="death-cam-overlay" class="overlay-nobg" style="display:none; pointer-events:none; flex-direction:column; justify-content:flex-end; padding-bottom: 100px; z-index: 6000;">
        <div class="kia-title" style="font-size: 80px; color: #ff3333; margin-bottom: 5px; font-family: 'Teko', sans-serif; letter-spacing: 5px; text-shadow: 0 0 30px rgba(255,0,0,0.4);">KIA</div>
        <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 20px;">
            <span style="font-family: 'Rajdhani', sans-serif; font-size: 24px; color: #888; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">KILLED BY:</span>
            <span id="death-killer-name" style="font-family: 'Teko', sans-serif; font-size: 56px; color: #fff; text-transform: uppercase; line-height: 1; text-shadow: 0 0 10px rgba(255,255,255,0.2);">UNKNOWN</span>
        </div>
        <div style="font-family: 'Rajdhani', sans-serif; font-size: 18px; color: #aaa; margin-top: 10px; letter-spacing: 2px;">[ENTER] TO SKIP</div>
    </div>

    <!-- DEPLOYMENT SCREEN (Full Menu Style) -->
    <div id="deployment-screen" class="overlay" style="z-index: 6000;">
        <div class="overlay-panel" style="width: 500px;">
            <div class="overlay-header" style="display:flex; justify-content:space-between; align-items:center;">
                <span class="overlay-title">DEPLOYMENT</span>
            </div>
            <div class="overlay-content">
                <!-- Buttons similar to ESC Menu but with Redeploy -->
                <button class="menu-btn" onclick="window.TacticalShooter.PlayerState.respawn()">REDEPLOY</button>
                <button class="menu-btn" onclick="window.TacticalShooter.UIManager.openSettings()">SETTINGS</button>
                <button class="menu-btn" onclick="window.TacticalShooter.UIManager.confirmLeave()">RESPAWN SCREEN</button>
                
                <div style="height: 1px; background: #333; margin: 10px 0;"></div>
                
                <!-- Integrated Loadout Picker -->
                <div style="display:flex; flex-direction:column; gap:5px;">
                    <span class="lobby-label" style="margin:0; font-size:12px;">SELECT LOADOUT</span>
                    <div id="deployment-loadout-container" style="display:flex; flex-direction:column; gap:2px;">
                        <!-- Injected via JS -->
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="post-game-screen" class="deployment-overlay" style="z-index: 6500; display: none;">
        <div class="deployment-info"></div> 
        <div class="deployment-controls">
            <button id="btn-return-lobby" class="btn-endgame" onclick="window.TacticalShooter.MatchState.resetToLobby()">
                RETURN TO LOBBY
            </button>
        </div>
    </div>

    <div id="esc-menu" class="overlay" style="z-index: 6000;">
        <div class="overlay-panel">
            <div class="overlay-header">
                <span class="overlay-title">MENU</span>
            </div>
            <div class="overlay-content">
                <button class="menu-btn" onclick="window.TacticalShooter.UIManager.closeMenu()">BACK TO GAME</button>
                <button class="menu-btn" onclick="window.TacticalShooter.UIManager.openSettings()">SETTINGS</button>
                <button class="menu-btn" onclick="window.TacticalShooter.UIManager.confirmLeave()">RESPAWN SCREEN</button>
            </div>
        </div>
    </div>

    <div id="confirm-modal" class="overlay" style="z-index: 7000;">
        <div class="confirm-ribbon-panel">
            <div class="confirm-text">DIE AND RETURN TO MENU?</div>
            <div class="confirm-actions">
                <button class="menu-btn small" onclick="window.TacticalShooter.UIManager.closeConfirm()">CANCEL</button>
                <button class="menu-btn small danger" onclick="window.TacticalShooter.UIManager.finalizeLeave()">DIE</button>
            </div>
        </div>
    </div>

    <!-- SETTINGS (Existing) -->
    <div id="settings-menu" class="overlay" style="z-index: 6000;">
        <!-- ... (Existing Settings HTML maintained) ... -->
        <div class="settings-panel">
            <div class="settings-header">
                <div class="back-arrow" onclick="window.TacticalShooter.UIManager.navigateBack()">&#8592;</div>
                <div class="settings-tabs">
                    <button id="tab-btn-controls" class="tab-btn active" onclick="window.TacticalShooter.UIManager.switchTab('controls')">CONTROLS</button>
                    <button id="tab-btn-graphics" class="tab-btn" onclick="window.TacticalShooter.UIManager.switchTab('graphics')">GRAPHICS</button>
                    <button id="tab-btn-hud" class="tab-btn" onclick="window.TacticalShooter.UIManager.switchTab('hud')">HUD</button>
                </div>
                <button class="reset-settings-btn" onclick="window.TacticalShooter.UIManager.resetAllSettings()">RESET DEFAULTS</button>
            </div>
            <div class="settings-content">
                <div id="tab-controls" class="tab-content active" style="height:100%;">
                    <div class="split-view">
                        <div class="split-left">
                            <div class="keybinds-header">CONTROL PRESETS</div>
                            <div class="presets-row">
                                <button class="preset-btn" onclick="window.TacticalShooter.UIManager.applyPreset('trackpad')">TRACKPAD</button>
                                <button class="preset-btn" onclick="window.TacticalShooter.UIManager.applyPreset('mouse')">MOUSE</button>
                                <button class="preset-btn" onclick="window.TacticalShooter.UIManager.applyPreset('testing')">LEGACY</button>
                            </div>
                            <div style="height: 20px; border-bottom: 1px solid #333; margin-bottom: 20px;"></div>
                            <div class="control-group slider-container">
                                <div class="slider-header"><span class="setting-label">MOUSE SENSITIVITY</span> <span id="sens-value" class="setting-value">0.002</span></div>
                                <input type="range" min="0.0005" max="0.01" step="0.0001" value="0.002" class="slider" id="sensitivity-slider" oninput="window.TacticalShooter.UIManager.updateSensitivity(this.value)">
                            </div>
                        </div>
                        <div class="split-divider"></div>
                        <div class="split-right">
                            <div class="keybinds-header">KEYBINDS</div>
                            <div id="keybinds-list" class="keybinds-container"></div>
                        </div>
                    </div>
                </div>
                <div id="tab-graphics" class="tab-content">
                    <div class="split-view">
                        <div class="split-left">
                            <div class="keybinds-header">GRAPHICS PRESETS</div>
                            <div class="presets-row">
                                <button class="preset-btn" onclick="window.TacticalShooter.UIManager.setGraphicsPreset('low')">LOW</button>
                                <button class="preset-btn" onclick="window.TacticalShooter.UIManager.setGraphicsPreset('medium')">MED</button>
                                <button class="preset-btn" onclick="window.TacticalShooter.UIManager.setGraphicsPreset('high')">HIGH</button>
                            </div>
                            <div style="height: 20px; border-bottom: 1px solid #333; margin-bottom: 20px;"></div>
                            <div class="control-group toggle-row" data-tooltip="affects magazines and bullet casings"><span class="setting-label">GUN PARTICLES</span><label class="toggle-switch"><input type="checkbox" id="casings-toggle" onchange="window.TacticalShooter.UIManager.toggleSetting('casingsEnabled', this.checked)"><span class="toggle-slider"></span></label></div>
                            <div class="control-group toggle-row" data-tooltip="affects muzzle flash and hit particles"><span class="setting-label">DYNAMIC WEAPON LIGHTING</span><label class="toggle-switch"><input type="checkbox" id="muzzleflash-toggle" onchange="window.TacticalShooter.UIManager.toggleSetting('muzzleFlashEnabled', this.checked)"><span class="toggle-slider"></span></label></div>
                            <div class="control-group toggle-row"><span class="setting-label">PLAYER MODEL</span><label class="toggle-switch"><input type="checkbox" id="body-toggle" onchange="window.TacticalShooter.UIManager.toggleSetting('bodyEnabled', this.checked)"><span class="toggle-slider"></span></label></div>
                        </div>
                        <div class="split-divider"></div>
                        <div class="split-right">
                            <div class="control-group slider-container" id="max-fps-container" data-tooltip="limited by browser refresh rate">
                                <div class="slider-header"><span><span class="setting-label">MAX FRAMERATE</span><span style="font-size: 10px; color: #555; margin-left: 5px; text-transform: none;">(refresh rate dependent)</span></span><span id="max-fps-value" class="setting-value">UNLIMITED</span></div>
                                <input type="range" min="30" max="250" step="10" value="250" class="slider" id="max-fps-slider" oninput="window.TacticalShooter.UIManager.updateMaxFPS(this.value)">
                            </div>
                            <div class="control-group slider-container" id="render-scale-container" data-tooltip="Lower for better performance on slow devices">
                                <div class="slider-header">
                                    <span class="setting-label">RENDER SCALE</span>
                                    <span id="render-scale-value" class="setting-value">100%</span>
                                </div>
                                <input type="range" min="10" max="100" step="5" value="100" class="slider" id="render-scale-slider" oninput="window.TacticalShooter.UIManager.updateRenderScale(this.value)">
                            </div>
                        </div>
                    </div>
                </div>
                <div id="tab-hud" class="tab-content">
                    <div class="split-view">
                        <div class="split-left">
                            <div class="control-group toggle-row"><span class="setting-label">SHOW CONTROLS</span><label class="toggle-switch"><input type="checkbox" id="controls-toggle" onchange="window.TacticalShooter.UIManager.toggleSetting('showControls', this.checked)"><span class="toggle-slider"></span></label></div>
                            <div class="control-group toggle-row"><span class="setting-label">SHOW NAMETAGS</span><label class="toggle-switch"><input type="checkbox" id="nametags-toggle" onchange="window.TacticalShooter.UIManager.toggleSetting('showNametags', this.checked)"><span class="toggle-slider"></span></label></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="settings-footer">
                <div class="config-io-container">
                    <input type="text" id="config-string" readonly placeholder="CONFIG STRING WILL APPEAR HERE" onclick="this.select()">
                    <button class="footer-btn" onclick="window.TacticalShooter.UIManager.copyConfigString()">COPY</button>
                    <button class="footer-btn" onclick="window.TacticalShooter.UIManager.importSettingsString(document.getElementById('config-string').value)">IMPORT</button>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="footer-btn" onclick="window.TacticalShooter.UIManager.closeSettings()">CANCEL</button>
                    <button class="footer-btn save-btn" onclick="window.TacticalShooter.UIManager.saveSettings()">APPLY & SAVE</button>
                </div>
            </div>
        </div>
    </div>
            `;
        }
    };
})();
