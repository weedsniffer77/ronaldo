
// js/core/ui_manager.js
(function() {
    const UIManager = {
        isMenuOpen: false,
        uiHidden: false,
        
        menuElement: null,
        settingsElement: null,
        confirmElement: null,
        cursorElement: null,
        tooltipElement: null,
        scoreboardElement: null,
        
        init() {
            console.log('UIManager: Initializing...');
            
            // Inject UI HTML
            if (window.TacticalShooter.UIElements) {
                const uiContainer = document.createElement('div');
                uiContainer.id = 'ui-container';
                uiContainer.innerHTML = window.TacticalShooter.UIElements.getHTML();
                document.body.appendChild(uiContainer);
            }
            
            this.menuElement = document.getElementById('esc-menu');
            this.settingsElement = document.getElementById('settings-menu');
            this.confirmElement = document.getElementById('confirm-modal');
            this.cursorElement = document.getElementById('custom-cursor');
            this.tooltipElement = document.getElementById('ui-tooltip');
            this.scoreboardElement = document.getElementById('scoreboard');
            
            if (window.TacticalShooter.ScoreboardManager) {
                window.TacticalShooter.ScoreboardManager.init();
            }
            
            this.isMenuOpen = false;
            this.uiHidden = false;
            
            this.initCursor();
            this.injectNewSettingsUI();
            
            if (window.TacticalShooter.SettingsManager) {
                window.TacticalShooter.SettingsManager.init();
                
                // Load Saved Settings via Manager
                const savedStr = localStorage.getItem('ts_settings_string');
                if (savedStr) {
                    console.log("UIManager: Loading saved settings...");
                    window.TacticalShooter.SettingsManager.importSettingsString(savedStr, true);
                } else {
                    this.updateInstructionsDisplay(); 
                    this.applySettingsToDOM(); 
                }
            }
        },
        
        // --- PROXIES FOR SETTINGS MANAGER (Preserves existing API for HTML onclicks) ---
        get tempSettings() { return window.TacticalShooter.SettingsManager ? window.TacticalShooter.SettingsManager.settings : {}; },
        get listeningForKey() { return window.TacticalShooter.SettingsManager ? window.TacticalShooter.SettingsManager.listeningForKey : false; },
        
        switchTab(tab) { if(window.TacticalShooter.SettingsManager) window.TacticalShooter.SettingsManager.switchTab(tab); },
        applyPreset(p) { if(window.TacticalShooter.SettingsManager) window.TacticalShooter.SettingsManager.applyPreset(p); },
        updateSensitivity(v) { if(window.TacticalShooter.SettingsManager) window.TacticalShooter.SettingsManager.updateSensitivity(v); },
        toggleSetting(k, v) { if(window.TacticalShooter.SettingsManager) window.TacticalShooter.SettingsManager.toggleSetting(k, v); },
        updateMaxFPS(v) { if(window.TacticalShooter.SettingsManager) window.TacticalShooter.SettingsManager.updateMaxFPS(v); },
        updateRenderScale(v) { if(window.TacticalShooter.SettingsManager) window.TacticalShooter.SettingsManager.updateRenderScale(v); },
        setGraphicsPreset(m) { if(window.TacticalShooter.SettingsManager) window.TacticalShooter.SettingsManager.setGraphicsPreset(m); },
        copyConfigString() { if(window.TacticalShooter.SettingsManager) window.TacticalShooter.SettingsManager.copyConfigString(); },
        importSettingsString(s) { if(window.TacticalShooter.SettingsManager) window.TacticalShooter.SettingsManager.importSettingsString(s); },
        saveSettings() { if(window.TacticalShooter.SettingsManager) window.TacticalShooter.SettingsManager.save(); },
        resetAllSettings() { if(window.TacticalShooter.SettingsManager) window.TacticalShooter.SettingsManager.reset(); },
        handleRebind(code) { if(window.TacticalShooter.SettingsManager) window.TacticalShooter.SettingsManager.handleRebind(code); },
        formatKeyName(code) { return window.TacticalShooter.SettingsManager ? window.TacticalShooter.SettingsManager.formatKeyName(code) : code; },

        injectNewSettingsUI() {
            // 1. Add Gameplay Tab Button
            const tabHeader = document.querySelector('.settings-tabs');
            if (tabHeader && !document.getElementById('tab-btn-gameplay')) {
                const btn = document.createElement('button');
                btn.id = 'tab-btn-gameplay';
                btn.className = 'tab-btn';
                btn.textContent = 'GAMEPLAY';
                btn.onclick = () => this.switchTab('gameplay');
                tabHeader.appendChild(btn);
            }
            
            // 2. Add Gameplay Content
            const contentArea = document.querySelector('.settings-content');
            if (contentArea && !document.getElementById('tab-gameplay')) {
                const div = document.createElement('div');
                div.id = 'tab-gameplay';
                div.className = 'tab-content';
                div.innerHTML = `
                    <div class="split-view">
                        <div class="split-left">
                            <div class="control-group toggle-row"><span class="setting-label">AUTO RELOAD</span><label class="toggle-switch"><input type="checkbox" id="auto-reload-toggle" onchange="window.TacticalShooter.UIManager.toggleSetting('autoReload', this.checked)"><span class="toggle-slider"></span></label></div>
                            <div class="control-group toggle-row" data-tooltip="Zoom in while priming grenade"><span class="setting-label">GRENADE THROW ZOOM</span><label class="toggle-switch"><input type="checkbox" id="grenade-zoom-toggle" onchange="window.TacticalShooter.UIManager.toggleSetting('grenadeThrowZoom', this.checked)"><span class="toggle-slider"></span></label></div>
                            <div class="control-group toggle-row" data-tooltip="Use ADS key to prime grenade. Default: Hold Fire Key"><span class="setting-label">GRENADE USES ADS KEY</span><label class="toggle-switch"><input type="checkbox" id="grenade-ads-toggle" onchange="window.TacticalShooter.UIManager.toggleSetting('grenadeUseADS', this.checked)"><span class="toggle-slider"></span></label></div>
                            <div class="control-group toggle-row" data-tooltip="Press C to toggle crouch instead of holding"><span class="setting-label">CROUCH TOGGLE</span><label class="toggle-switch"><input type="checkbox" id="crouch-toggle-setting" onchange="window.TacticalShooter.UIManager.toggleSetting('toggleCrouch', this.checked)"><span class="toggle-slider"></span></label></div>
                        </div>
                    </div>
                `;
                contentArea.appendChild(div);
            }

            // 3. Inject Graphics Presets and Shadow Toggle
            const gfxTab = document.getElementById('tab-graphics');
            if (gfxTab) {
                const leftCol = gfxTab.querySelector('.split-left');
                if (leftCol) {
                    if (!leftCol.querySelector('.presets-row')) {
                        const container = document.createElement('div');
                        container.innerHTML = `
                            <div class="keybinds-header">GRAPHICS PRESETS</div>
                            <div class="presets-row">
                                <button class="preset-btn" onclick="window.TacticalShooter.UIManager.setGraphicsPreset('low')">LOW</button>
                                <button class="preset-btn" onclick="window.TacticalShooter.UIManager.setGraphicsPreset('medium')">MED</button>
                                <button class="preset-btn" onclick="window.TacticalShooter.UIManager.setGraphicsPreset('high')">HIGH</button>
                            </div>
                            <div style="height: 20px; border-bottom: 1px solid #333; margin-bottom: 20px;"></div>
                        `;
                        if (leftCol.firstChild) leftCol.insertBefore(container, leftCol.firstChild);
                        else leftCol.appendChild(container);
                    }
                    if (!document.getElementById('simple-shadows-toggle')) {
                        const shadowRow = document.createElement('div');
                        shadowRow.className = 'control-group toggle-row';
                        shadowRow.setAttribute('data-tooltip', 'Use faster, unfiltered shadows');
                        shadowRow.innerHTML = `<span class="setting-label">SIMPLE SHADOWS (FAST)</span><label class="toggle-switch"><input type="checkbox" id="simple-shadows-toggle" onchange="window.TacticalShooter.UIManager.toggleSetting('simpleShadows', this.checked)"><span class="toggle-slider"></span></label>`;
                        leftCol.appendChild(shadowRow);
                    }
                    if (!document.getElementById('reflections-toggle')) {
                        const row = document.createElement('div');
                        row.className = 'control-group toggle-row';
                        row.setAttribute('data-tooltip', 'Real-time reflections (Expensive)');
                        row.innerHTML = `<span class="setting-label">REAL-TIME REFLECTIONS</span><label class="toggle-switch"><input type="checkbox" id="reflections-toggle" onchange="window.TacticalShooter.UIManager.toggleSetting('reflectionsEnabled', this.checked)"><span class="toggle-slider"></span></label>`;
                        leftCol.appendChild(row);
                    }
                }
            }
        },
        
        toggleUI() {
            const GM = window.TacticalShooter.GameManager;
            if (!GM || GM.currentState !== 'IN_GAME') return;
            this.uiHidden = !this.uiHidden;
            const warningEl = document.getElementById('ui-hidden-warning');
            const targets = [
                { id: 'hud', display: 'block' },                 
                { id: 'room-code-display', display: 'flex' },    
                { id: 'instructions', display: 'block', checkSetting: true },
                { id: 'game-timer', display: 'block' }
            ];
            targets.forEach(t => {
                const el = document.getElementById(t.id);
                if (!el) return;
                if (this.uiHidden) { el.style.display = 'none'; } 
                else {
                    if (t.checkSetting && this.tempSettings && !this.tempSettings.showControls) { el.style.display = 'none'; } 
                    else { el.style.display = t.display; }
                }
            });
            if (this.uiHidden) {
                if (warningEl) {
                    warningEl.style.display = 'block';
                    const key = window.TacticalShooter.InputManager.getBinding('ToggleUI');
                    const keyName = this.formatKeyName(key);
                    warningEl.textContent = `UI HIDDEN. [${keyName}] TO RESTORE`;
                }
            } else { if (warningEl) warningEl.style.display = 'none'; }
        },
        
        initCursor() {
            document.addEventListener('mousemove', (e) => {
                if (this.cursorElement && !document.pointerLockElement) {
                    this.cursorElement.style.left = `${e.clientX}px`;
                    this.cursorElement.style.top = `${e.clientY}px`;
                }
                if (this.tooltipElement && this.tooltipElement.style.display === 'block') {
                    this.tooltipElement.style.left = `${e.clientX}px`;
                    this.tooltipElement.style.top = `${e.clientY}px`;
                }
            });
            document.addEventListener('mouseover', (e) => {
                if (e.target.closest('button, input, .toggle-switch, .slider, .keybind-btn')) { this.cursorElement.classList.add('hover'); }
                const tooltipTarget = e.target.closest('[data-tooltip]');
                if (tooltipTarget && this.tooltipElement) {
                    const text = tooltipTarget.getAttribute('data-tooltip');
                    if (text) { this.tooltipElement.textContent = text; this.tooltipElement.style.display = 'block'; }
                }
            });
            document.addEventListener('mouseout', (e) => {
                if (e.target.closest('button, input, .toggle-switch, .slider, .keybind-btn')) { this.cursorElement.classList.remove('hover'); }
                const tooltipTarget = e.target.closest('[data-tooltip]');
                if (tooltipTarget && this.tooltipElement) { this.tooltipElement.style.display = 'none'; }
            });
            document.addEventListener('pointerlockchange', () => {
                if (document.pointerLockElement) {
                    this.cursorElement.style.display = 'none';
                    if (this.tooltipElement) this.tooltipElement.style.display = 'none';
                } else { this.cursorElement.style.display = 'block'; }
            });
            if (!document.pointerLockElement) { this.cursorElement.style.display = 'block'; }
        },
        
        toggleMenu() { if (this.isMenuOpen) this.closeMenu(); else this.openMenu(); },
        toggleScoreboard(show) { if (window.TacticalShooter.ScoreboardManager) { window.TacticalShooter.ScoreboardManager.toggle(show); } },
        openMenu() { if (!this.menuElement) return; this.isMenuOpen = true; this.menuElement.classList.add('active'); this.cursorElement.style.display = 'block'; if (document.pointerLockElement) document.exitPointerLock(); },
        closeMenu() { if (!this.menuElement) return; this.isMenuOpen = false; this.menuElement.classList.remove('active'); this.settingsElement.classList.remove('active'); this.confirmElement.classList.remove('active'); const mm = document.getElementById('multiplayer-menu'); if (mm) mm.classList.remove('blurred'); if (this.tooltipElement) this.tooltipElement.style.display = 'none'; const canvas = document.getElementById('game-canvas'); if (canvas) { const isMenuMode = window.TacticalShooter.GameManager && window.TacticalShooter.GameManager.isMenuMode; if (!isMenuMode) canvas.requestPointerLock(); } },
        confirmLeave() { if (this.confirmElement) { this.menuElement.classList.remove('active'); this.confirmElement.classList.add('active'); } },
        closeConfirm() { if (this.confirmElement) { this.confirmElement.classList.remove('active'); this.menuElement.classList.add('active'); } },
        
        finalizeLeave() { 
            // Suicide Action (Resets to Deployment Screen)
            const PS = window.TacticalShooter.PlayerState;
            if (PS) {
                // Force fatal damage
                PS.takeDamage(10000, null, 'Suicide');
                // Skip death cam delay for intentional reset
                PS.deathTimer = 0.5;
            }
            this.closeConfirm();
            this.closeMenu();
        },
        
        showNotification(message, type = 'blue') { const container = document.getElementById('notification-area'); if (!container) return; const toast = document.createElement('div'); let className = `notification-toast`; if (type === 'blue' || type === 'red') className += ` ${type}`; toast.className = className; if (type.startsWith('#')) toast.style.borderLeftColor = type; toast.innerHTML = `<span style="letter-spacing: 1px;">${message}</span><button onclick="this.parentElement.remove()" style="background:none; border:none; color:#666; cursor:none; font-weight:bold; font-size:14px;">×</button>`; container.appendChild(toast); setTimeout(() => { if (toast.parentElement) { toast.style.transition = 'opacity 0.5s'; toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); } }, 4000); },
        
        openSettings() {
            if (!this.settingsElement) return;
            const mm = document.getElementById('multiplayer-menu');
            if (mm && mm.style.display !== 'none') mm.classList.add('blurred');
            this.menuElement.classList.remove('active');
            this.settingsElement.classList.add('active');
            this.cursorElement.style.display = 'block';
            
            if (window.TacticalShooter.SettingsManager) {
                window.TacticalShooter.SettingsManager.open();
            }
        },
        
        navigateBack() {
            if (!this.settingsElement) return;
            this.settingsElement.classList.remove('active');
            const gm = window.TacticalShooter.GameManager;
            if (gm && gm.currentState === 'MENU') {
                const mm = document.getElementById('multiplayer-menu');
                if (mm) mm.classList.remove('blurred');
            } else {
                this.openMenu();
            }
        },
        
        closeSettings() {
            if (!this.settingsElement) return;
            this.settingsElement.classList.remove('active');
            this.isMenuOpen = false;
            const mm = document.getElementById('multiplayer-menu');
            if (mm) mm.classList.remove('blurred');
            this.closeMenu();
        },

        applySettingsToDOM() {
            if (!this.tempSettings) return;
            const instructions = document.getElementById('instructions');
            if (instructions) instructions.style.display = this.tempSettings.showControls ? 'block' : 'none';
            const fpsDisplay = document.getElementById('fps-display');
            if (fpsDisplay) fpsDisplay.style.display = 'block';
            if (window.TacticalShooter.config) window.TacticalShooter.config.showNametags = this.tempSettings.showNametags;
            this.updateInstructionsDisplay();
        },
        
        updateInstructionsDisplay() {
            if (!this.tempSettings) return;
            const el = document.getElementById('instructions');
            if (!el) return;
            if (window.TacticalShooter.GameManager && window.TacticalShooter.GameManager.isMenuMode) { el.style.display = 'none'; return; }
            if (!this.tempSettings.showControls) { el.style.display = 'none'; return; } else { el.style.display = 'block'; }
            const b = window.TacticalShooter.InputManager.bindings;
            const fmt = this.formatKeyName;
            const k = (code) => code ? fmt(code) : '?';
            el.innerHTML = `${k(b.Forward)}${k(b.Left)}${k(b.Backward)}${k(b.Right)} - MOVE | ${k(b.Jump)} - JUMP | ${k(b.Crouch)} - CROUCH | ${k(b.Prone)} - PRONE<br>${k(b.Sprint)} - SPRINT | ${k(b.ADS)} - ADS<br>${k(b.LeanLeft)} / ${k(b.LeanRight)} - LEAN | ${k(b.FreeCursor)} - FREE CURSOR<br>${k(b.Reload)} - RELOAD | ${k(b.Shoot)} - SHOOT | ${k(b.Inspect)} - INSPECT<br>ESC - MENU | TAB - SCOREBOARD`;
        },
        
        isUIActive() { return this.isMenuOpen; }
    };
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.UIManager = UIManager;
})();
