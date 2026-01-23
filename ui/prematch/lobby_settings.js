
// js/ui/prematch/lobby_settings.js
(function() {
    const LobbySettings = {
        container: null,
        activeDropdown: null,
        
        init() {
            this.container = document.getElementById('lobby-settings-bar');
            
            // Global click listener to close dropdowns when clicking outside
            document.addEventListener('click', (e) => {
                const trigger = e.target.closest('.custom-select-trigger');
                const options = e.target.closest('.custom-options');
                
                if (!trigger && !options) {
                    this.closeAllDropdowns();
                }
            });
        },

        render() {
            if (!this.container) return;
            
            const state = window.TacticalShooter.MatchState.state;
            const isHost = window.TacticalShooter.PlayroomManager.isHost;
            const isLocked = state.status !== 'LOBBY';

            // Helper to create setting block
            const createBlock = (label, value, options, onChange) => {
                let html = `<div class="lobby-setting-group"><div class="lobby-label">${label}</div>`;
                
                if (isHost && !isLocked && options) {
                    // --- Custom Dropdown ---
                    const currentOpt = options.find(o => o.val == value) || options[0];
                    const displayTxt = currentOpt ? currentOpt.txt : value;
                    
                    html += `
                        <div class="custom-select-container" id="dd-${label}">
                            <!-- Pointer Events only on parent div to catch all clicks reliably -->
                            <div class="custom-select-trigger" onclick="window.TacticalShooter.LobbySettings.toggleDropdown(event, 'dd-${label}')">
                                <span style="pointer-events: none;">${displayTxt}</span>
                            </div>
                            <div class="custom-options">
                    `;
                    
                    options.forEach(opt => {
                        const isSelected = (opt.val == value) ? 'selected' : '';
                        html += `
                            <div class="custom-option ${isSelected}" 
                                 onclick="window.TacticalShooter.LobbySettings.selectOption('${label}', '${opt.val}')">
                                 ${opt.txt}
                            </div>
                        `;
                    });
                    
                    html += `   </div>
                        </div>`;
                } else {
                    // Read-only
                    let txt = value;
                    if (options) {
                        const found = options.find(o => o.val == value);
                        if (found) txt = found.txt;
                    }
                    html += `<div class="lobby-value-box">${txt}</div>`;
                }
                html += `</div>`;
                return html;
            };

            // Helper for Toggle Switch
            const createToggle = (label, checked, onChangeFn, trueText = "ON", falseText = "OFF", showLabelForClient = true) => {
                // If client and unchecked and we hide on false, return empty
                if (!isHost && !checked && !showLabelForClient) return "";

                let html = `<div class="lobby-setting-group">`;
                
                if (isHost || showLabelForClient) {
                     html += `<div class="lobby-label">${label}</div>`;
                } else {
                     // For Night Battle client side: No Label, just the box
                     html += `<div class="lobby-label" style="height:19px;"></div>`; 
                }

                if (isHost && !isLocked) {
                    html += `
                        <label class="toggle-switch" style="margin-top: 5px;">
                            <input type="checkbox" ${checked ? 'checked' : ''} onchange="${onChangeFn}(this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    `;
                } else {
                    // Read Only
                    if (checked) {
                        html += `<div class="lobby-value-box" style="width:auto; min-width:80px; justify-content:center;">${trueText}</div>`;
                    } else if (showLabelForClient) {
                         html += `<div class="lobby-value-box" style="width:auto; min-width:80px; justify-content:center;">${falseText}</div>`;
                    }
                }
                html += `</div>`;
                return html;
            };

            // Dynamic Map Options from Registry
            let mapOpts = [];
            if (window.TacticalShooter.MapRegistry) {
                mapOpts = Object.values(window.TacticalShooter.MapRegistry.maps).map(m => ({
                    val: m.id,
                    txt: m.name || m.id
                }));
            } else {
                // Fallback
                mapOpts = [{val: "WAREHOUSE", txt: "KILLHOUSE"}];
            }

            const modeOpts = [{val: "TDM", txt: "TEAM DEATHMATCH"}, {val: "FFA", txt: "FREE FOR ALL"}];
            const timeOpts = [{val: 1, txt: "1 MIN"}, {val: 5, txt: "5 MIN"}, {val: 10, txt: "10 MIN"}, {val: 20, txt: "20 MIN"}];
            
            // --- NIGHT MODE VISIBILITY ---
            // Only show Night Mode option if map supports it (Warehouse)
            // Ideally maps should declare support, for now kept simple
            const mapSupportsNight = (state.mapId === "WAREHOUSE");

            this.container.innerHTML = 
                createBlock("MAP", state.mapId, mapOpts) +
                createBlock("MODE", state.gamemode, modeOpts) +
                createBlock("TIME LIMIT", state.timeLimit, timeOpts) +
                // Removed TEAMS dropdown
                createToggle("FRIENDLY FIRE", state.friendlyFire, "window.TacticalShooter.LobbySettings.toggleFriendlyFire") +
                (mapSupportsNight ? createToggle("NIGHT BATTLE", state.nightMode, "window.TacticalShooter.LobbySettings.toggleNightMode", "NIGHT", "", false) : "");
        },

        toggleDropdown(event, id) {
            if (event) event.stopPropagation();

            const container = document.getElementById(id);
            if (!container) return;
            const options = container.querySelector('.custom-options');
            
            const wasOpen = options.classList.contains('open');
            
            // Close others first
            this.closeAllDropdowns();
            
            // Toggle this one
            if (!wasOpen) {
                options.classList.add('open');
                this.activeDropdown = options;
            }
        },
        
        closeAllDropdowns() {
            document.querySelectorAll('.custom-options.open').forEach(el => el.classList.remove('open'));
            this.activeDropdown = null;
        },

        selectOption(label, value) {
            const MS = window.TacticalShooter.MatchState;
            let finalVal = value;
            if (label === 'TIME LIMIT' || label === 'TEAMS') finalVal = parseInt(value);
            
            if (label === 'MAP') {
                // Set the Map ID immediately
                MS.setSetting('mapId', finalVal);
                
                // Reset night mode if switching to non-supported map
                if (finalVal !== "WAREHOUSE") {
                    MS.setSetting('nightMode', false);
                }
                
                // Force team count to 2 just in case
                MS.setSetting('teamCount', 2);
            }
            else if (label === 'MODE') MS.setSetting('gamemode', finalVal);
            else if (label === 'TIME LIMIT') MS.setSetting('timeLimit', finalVal);
            
            this.closeAllDropdowns();
        },
        
        toggleFriendlyFire(checked) {
            const MS = window.TacticalShooter.MatchState;
            MS.setSetting('friendlyFire', checked);
            this.render();
        },
        
        toggleNightMode(checked) {
            const MS = window.TacticalShooter.MatchState;
            MS.setSetting('nightMode', checked);
            this.render();
        }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.LobbySettings = LobbySettings;
})();
