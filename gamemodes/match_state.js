
// js/gamemodes/match_state.js
(function() {
    const MatchState = {
        // Local Mirror of Synced State
        state: {
            gamemode: "TDM", // TDM, FFA
            mapId: "WAREHOUSE", // Default Map updated to WAREHOUSE
            timeLimit: 10, // Minutes
            teamCount: 2, // 2, 3, 4
            friendlyFire: false, 
            nightMode: false, // NEW: Night Battle Toggle
            status: "LOBBY", // LOBBY, COUNTDOWN, PRE_ROUND, PLAYING, GAME_OVER
            launchTime: 0, // Unix timestamp when game starts
            matchEndTime: 0 // Unix timestamp when match ends
        },
        
        gameEndTimer: 0,
        preRoundTimer: 0,
        postGameTriggered: false,

        init() {
            console.log("MatchState: Initialized");
            this.triggerUpdates();
        },
        
        resetToDefaults() {
            console.log("MatchState: Resetting to Defaults");
            this.state.mapId = "WAREHOUSE";
            this.state.gamemode = "TDM";
            this.state.nightMode = false;
            this.state.status = "LOBBY";
        },

        // --- Host Actions (Updates Network Global State) ---
        
        setSetting(key, value) {
            if (!window.TacticalShooter.PlayroomManager.isHost) return;
            
            // Store old state to detect transitions locally on host
            const oldStatus = this.state.status;
            
            // 1. Update Local State immediately
            this.state[key] = value;
            
            // 2. Update Global Network State
            if (window.Playroom) {
                window.Playroom.setState(`MATCH_${key}`, value, true);
            }
            
            // 3. Rebalance check for Host
            if (key === 'teamCount' || key === 'gamemode') {
                this.checkLocalTeamValidity();
            }
            
            // 4. Trigger Logic & UI
            if (key === 'status' && value !== oldStatus) {
                this.handleStatusChange(oldStatus, value);
            }
            
            this.triggerUpdates();
        },

        startCountdown() {
            if (!window.TacticalShooter.PlayroomManager.isHost) return;
            console.log("MatchState: Starting Countdown...");
            // UPDATED: 5 Seconds Countdown
            const launchTime = Date.now() + 5000; 
            this.setSetting('launchTime', launchTime);
            this.setSetting('status', 'COUNTDOWN');
        },

        cancelCountdown() {
            if (!window.TacticalShooter.PlayroomManager.isHost) return;
            console.log("MatchState: Cancelling Countdown");
            this.setSetting('status', 'LOBBY');
            this.setSetting('launchTime', 0);
        },
        
        startPreRound() {
            if (!window.TacticalShooter.PlayroomManager.isHost) return;
            console.log("MatchState: Entering Pre-Round Phase...");
            
            // RESET ALL PLAYERS STATS
             const myPlayer = window.TacticalShooter.PlayroomManager.myPlayer;
             if (myPlayer) {
                 myPlayer.setState('kills', 0, true);
                 myPlayer.setState('deaths', 0, true);
                 myPlayer.setState('score', 0, true);
             }
             
            // Calculate End Time (Just a marker for now, we use a local timer)
            const preRoundEnd = Date.now() + 10000;
            this.setSetting('launchTime', preRoundEnd); // Reuse launchTime to sync pre-round end
            this.setSetting('status', 'PRE_ROUND');
        },

        startGame() {
             if (!window.TacticalShooter.PlayroomManager.isHost) return;
             console.log("MatchState: Starting Game Loop!");
             
             // Calculate End Time
             const durationMs = this.state.timeLimit * 60 * 1000;
             const endTime = Date.now() + durationMs;
             
             this.setSetting('matchEndTime', endTime);
             this.setSetting('status', 'PLAYING');
        },
        
        resetToLobby() {
            console.log("MatchState: Returning to Main Menu...");

            // Cleanup Particles/Blood
            if (window.TacticalShooter.ParticleManager) {
                window.TacticalShooter.ParticleManager.clear();
            }
            
            // Disconnect Networking
            if (window.TacticalShooter.PlayroomManager) {
                window.TacticalShooter.PlayroomManager.disconnect();
            }
            
            // Force Cleanup Locally
            const canvas = document.getElementById('game-canvas');
            if (canvas) canvas.classList.remove('canvas-blur');
            
            const postScr = document.getElementById('post-game-screen');
            if (postScr) postScr.style.display = 'none';
            
            const hudTimer = document.getElementById('game-timer');
            if (hudTimer) hudTimer.style.display = 'none';
            const prTimer = document.getElementById('pre-round-timer');
            if (prTimer) prTimer.style.display = 'none';
            
            // Reset Death State & Hide Redeploy
            if (window.TacticalShooter.PlayerState) {
                window.TacticalShooter.PlayerState.isDead = false;
                window.TacticalShooter.PlayerState.deathTimer = 0;
            }
            if (window.TacticalShooter.DeploymentScreen) {
                window.TacticalShooter.DeploymentScreen.hide(); 
                window.TacticalShooter.DeploymentScreen.hideDeathInfo();
            }
            
            // Route to Main Menu
            if (window.TacticalShooter.GameManager) {
                window.TacticalShooter.GameManager.enterMenu();
            }
            if (window.TacticalShooter.MultiplayerUI) {
                window.TacticalShooter.MultiplayerUI.showMainMenu();
            }

            this.postGameTriggered = false;
        },

        // --- Host Update Loop (Called by PlayroomManager background worker) ---
        hostUpdateLogic() {
            if (!window.TacticalShooter.PlayroomManager.isHost) return;
            
            const now = Date.now();

            // Check countdown expiration
            if (this.state.status === 'COUNTDOWN') {
                if (now >= this.state.launchTime) {
                    this.startPreRound();
                }
            }
            else if (this.state.status === 'PRE_ROUND') {
                if (now >= this.state.launchTime) {
                    this.startGame();
                }
            }
            // Check Match Time Expiry
            else if (this.state.status === 'PLAYING') {
                if (this.state.matchEndTime > 0 && now >= this.state.matchEndTime) {
                    console.log("MatchState: Time Expired!");
                    this.setSetting('status', 'GAME_OVER');
                }
            }
        },

        // --- Global Sync (Called by PlayroomManager.update) ---
        
        syncMatchState() {
            if (!window.Playroom) return;

            const keys = ['gamemode', 'mapId', 'timeLimit', 'teamCount', 'friendlyFire', 'nightMode', 'status', 'launchTime', 'matchEndTime'];
            let updated = false;
            let oldStatus = this.state.status;

            keys.forEach(k => {
                const val = window.Playroom.getState(`MATCH_${k}`);
                if (val !== undefined && val !== this.state[k]) {
                    this.state[k] = val;
                    updated = true;
                }
            });

            if (updated) {
                // Rebalance check for Clients
                this.checkLocalTeamValidity();
                
                // Handle State Transitions if status changed
                if (this.state.status !== oldStatus) {
                    this.handleStatusChange(oldStatus, this.state.status);
                }
                
                this.triggerUpdates();
            }
        },
        
        // CENTRAL STATE HANDLER
        handleStatusChange(oldStatus, newStatus) {
            console.log(`MatchState: Status Changed from ${oldStatus} to ${newStatus}`);
            
            if (newStatus === 'PRE_ROUND' || newStatus === 'PLAYING') {
                 // FORCE HIDE LOBBY COUNTDOWN STRIP
                 const strip = document.getElementById('lobby-countdown-strip');
                 if (strip) strip.style.display = 'none';
            }

            if (newStatus === 'PRE_ROUND') {
                 // RESET OWN STATS ON CLIENT SIDE
                 const myPlayer = window.TacticalShooter.PlayroomManager.myPlayer;
                 if (myPlayer) {
                     myPlayer.setState('kills', 0, true);
                     myPlayer.setState('deaths', 0, true);
                     myPlayer.setState('score', 0, true);
                 }
                 
                 // Show Loadout Picker UI for Pre-Round
                 if (window.TacticalShooter.PlayerState) {
                     window.TacticalShooter.PlayerState.toggleInGameLoadoutPicker(true);
                 }
            }
            else if (newStatus === 'PLAYING') {
                 // Hide Pre-Round UI
                 if (window.TacticalShooter.PlayerState) {
                     window.TacticalShooter.PlayerState.toggleInGameLoadoutPicker(false);
                 }
                 
                 // Hide post game UI if active (restarted)
                 const scr = document.getElementById('post-game-screen');
                 if (scr) scr.style.display = 'none';
                 this.postGameTriggered = false;
                 
                 // Force re-sync map if changed rapidly
                 if (window.TacticalShooter.GameManager) {
                     window.TacticalShooter.GameManager.checkMapSync();
                 }
            } 
            else if (newStatus === 'LOBBY') {
                // Force Lobby
                this.resetToLobby();
            }
        },
        
        update(dt) {
            const isUIHidden = window.TacticalShooter.UIManager && window.TacticalShooter.UIManager.uiHidden;
            const loadoutEl = document.getElementById('loadout-screen');
            const isLoadout = loadoutEl && loadoutEl.classList.contains('active');

            // Local Game Loop Update (For Timers & Game Over Sequence)
            if (this.state.status === 'PRE_ROUND') {
                this.updatePreRoundTimer();
                const hudTimer = document.getElementById('game-timer');
                if (hudTimer) hudTimer.style.display = 'none';
            }
            else if (this.state.status === 'PLAYING') {
                this.updateTimers();
                // Ensure HUD timer visible depending on UI hidden state
                const hudTimer = document.getElementById('game-timer');
                if (hudTimer) {
                    if (isUIHidden || isLoadout) {
                        hudTimer.style.display = 'none';
                    } else {
                        hudTimer.style.display = 'block';
                    }
                }
                const prTimer = document.getElementById('pre-round-timer');
                if (prTimer) prTimer.style.display = 'none';
            } 
            else if (this.state.status === 'GAME_OVER') {
                // Show 00:00
                const hudTimer = document.getElementById('game-timer');
                if (hudTimer) {
                    hudTimer.textContent = "00:00";
                    hudTimer.style.color = "#ff4444";
                    if (isUIHidden || isLoadout) {
                        hudTimer.style.display = 'none';
                    } else {
                        hudTimer.style.display = 'block';
                    }
                }
                
                if (!this.postGameTriggered) {
                    this.gameEndTimer += dt;
                    if (this.gameEndTimer >= 5.0) {
                        this.showPostGameUI();
                        this.postGameTriggered = true;
                    }
                }
            } else {
                this.gameEndTimer = 0;
                this.postGameTriggered = false;
                // Hide Timer in Lobby
                const hudTimer = document.getElementById('game-timer');
                if (hudTimer) hudTimer.style.display = 'none';
            }
        },
        
        updatePreRoundTimer() {
            const now = Date.now();
            let timeLeftMs = Math.max(0, this.state.launchTime - now);
            const seconds = Math.ceil(timeLeftMs / 1000);
            
            const timerEl = document.getElementById('pre-round-timer');
            if (timerEl) {
                // Only show from 10 down to 1, hide at 0 (or slightly before game starts)
                if (seconds > 0) {
                    timerEl.style.display = 'block';
                    timerEl.textContent = `${seconds}`;
                } else {
                    timerEl.style.display = 'none';
                }
            }
        },

        updateTimers() {
            const now = Date.now();
            let timeLeftMs = Math.max(0, this.state.matchEndTime - now);
            
            // Format MM:SS
            const totalSeconds = Math.ceil(timeLeftMs / 1000);
            const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            const s = (totalSeconds % 60).toString().padStart(2, '0');
            const timeStr = `${m}:${s}`;
            
            // Color Logic (Red if < 60s)
            const color = totalSeconds <= 60 ? "#ff4444" : "#ffffff";
            
            // Update HUD
            const hudTimer = document.getElementById('game-timer');
            if (hudTimer) {
                hudTimer.textContent = timeStr;
                hudTimer.style.color = color;
            }
            
            // Update Tab Menu
            const tabTimer = document.getElementById('sb-timer');
            if (tabTimer) {
                tabTimer.textContent = timeStr;
                tabTimer.style.color = color;
            }
        },
        
        showPostGameUI() {
            console.log("MatchState: Showing Post Game UI");
            const screen = document.getElementById('post-game-screen');
            if (screen) {
                screen.style.display = 'flex';
                screen.classList.add('active');
            }
            
            // Freeze controls via GameManager logic or simply unlocking cursor
            if (document.exitPointerLock) document.exitPointerLock();
            
            if (window.TacticalShooter.UIManager) {
                // Ensure cursor is visible
                if (window.TacticalShooter.UIManager.cursorElement) {
                    window.TacticalShooter.UIManager.cursorElement.style.display = 'block';
                }
                window.TacticalShooter.UIManager.closeMenu(); // Close ESC menu if open
            }
            
            // Blur Canvas
            const canvas = document.getElementById('game-canvas');
            if (canvas) canvas.classList.add('canvas-blur');
            
            // Hide HUD
            if (window.TacticalShooter.MultiplayerUI) {
                window.TacticalShooter.MultiplayerUI.setHUDVisible(false);
            }
        },
        
        checkLocalTeamValidity() {
             // Ensures players on Team 2 or 3 get moved if TeamCount drops to 2 (indices 0,1)
             if (window.TacticalShooter.TeamManager && this.state.gamemode !== 'FFA') {
                 const myTeam = window.TacticalShooter.TeamManager.getLocalTeamId();
                 // Valid indices are 0 to teamCount-1. If myTeam >= teamCount, it's invalid.
                 if (myTeam >= this.state.teamCount) {
                     console.log(`MatchState: Team ${myTeam} invalid for count ${this.state.teamCount}. Auto-balancing...`);
                     window.TacticalShooter.TeamManager.autoBalance(this.state.teamCount);
                 }
             }
        },
        
        triggerUpdates() {
            if (window.TacticalShooter.TeamManager) {
                window.TacticalShooter.TeamManager.resolveTeamNames(this.state.gamemode, this.state.mapId);
            }
            if (window.TacticalShooter.LobbyUI) {
                window.TacticalShooter.LobbyUI.updateUI();
            }
            // Update Map Visuals if in TacView
            if (window.TacticalShooter.GameManager && window.TacticalShooter.GameManager.currentState === 'TACVIEW') {
                window.TacticalShooter.GameManager.updateMapVisuals(true);
            }
        }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.MatchState = MatchState;
})();
