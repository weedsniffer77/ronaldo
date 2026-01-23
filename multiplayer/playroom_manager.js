
// js/multiplayer/playroom_manager.js
(function() {
    const PlayroomManager = {
        myPlayer: null,
        isHost: false,
        roomCode: null,
        lastUpdate: 0,
        updateInterval: 30, 
        
        localPlayerName: "Player",
        connectionTime: 0,
        initialLoadDone: false,
        
        // Auto-Balance Logic
        hasInitialBalance: false,
        
        // Sync Logic
        lastSyncCheck: 0,
        syncInterval: 1000,
        
        // Network State
        hasJoinedActiveGame: false,
        
        // Background Sync Worker
        worker: null,
        
        hitQueue: [],
        playerBuffer: [],

        // NEW: Stores code from URL for UI to use
        requestedRoomCode: null,
        
        init() {
            if (document.getElementById('playroom-sdk-script')) {
                console.log('PlayroomManager: SDK already loading/loaded.');
                return;
            }

            console.log('PlayroomManager: Initializing Logic...');
            
            // 1. Capture params BEFORE cleaning URL
            this.captureURLParams();
            
            // 2. Clean URL to hide params
            this.cleanURL();
            
            this.initBackgroundWorker();
            
            // CLEANUP HANDLER
            window.addEventListener('beforeunload', () => {
                if (this.isHost && window.TacticalShooter.FirebaseManager) {
                    window.TacticalShooter.FirebaseManager.removeLobby();
                }
            });

            const script = document.createElement('script');
            script.id = 'playroom-sdk-script'; 
            script.src = 'https://unpkg.com/playroomkit/multiplayer.full.umd.js';
            script.crossOrigin = 'anonymous';
            script.onload = () => {
                console.log('PlayroomManager: ✓ SDK Loaded');
                if (window.TacticalShooter.MultiplayerUI) {
                    window.TacticalShooter.MultiplayerUI.init();
                }
            };
            script.onerror = () => {
                console.error('PlayroomManager: Failed to load SDK');
            };
            document.head.appendChild(script);
        },

        captureURLParams() {
            try {
                const url = new URL(window.location.href);
                const code = url.searchParams.get('roomCode') || url.searchParams.get('room') || url.searchParams.get('r');
                if (code) {
                    console.log("PlayroomManager: Captured requested room code from URL:", code);
                    this.requestedRoomCode = code;
                }
            } catch (e) {
                console.warn("PlayroomManager: Error capturing URL params", e);
            }
        },
        
        initBackgroundWorker() {
            const workerCode = `
            self.interval = null;
            self.onmessage = function(e) {
                if (e.data === 'start') {
                    if (self.interval) clearInterval(self.interval);
                    self.interval = setInterval(() => {
                        self.postMessage('tick');
                    }, 33);
                } else if (e.data === 'stop') {
                    if (self.interval) clearInterval(self.interval);
                    self.interval = null;
                }
            };
            `;
            const blob = new Blob([workerCode], {type: 'application/javascript'});
            this.worker = new Worker(URL.createObjectURL(blob));
            this.worker.onmessage = () => { if (document.hidden) this.update(0.033); };
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) { this.update(0.016); this.worker.postMessage('start'); } 
                else { this.worker.postMessage('stop'); }
            });
        },
        
        cleanURL() {
            try {
                const url = new URL(window.location.href);
                const paramsToRemove = ['player_name', 'room', 'roomCode', 'r', 'playroom_kit_room_code'];
                let changed = false;
                paramsToRemove.forEach(p => { if (url.searchParams.has(p)) { url.searchParams.delete(p); changed = true; }});
                if (changed) window.history.replaceState({}, '', url);
            } catch (e) {}
        },

        async _waitForSDK() {
            if (window.Playroom) return;
            let attempts = 0;
            while (!window.Playroom && attempts < 50) { 
                await new Promise(r => setTimeout(r, 100));
                attempts++;
            }
            if (!window.Playroom) throw new Error("Multiplayer SDK not ready.");
        },

        async createRoom(name) {
            await this._waitForSDK();
            this.localPlayerName = name;
            await Playroom.insertCoin({
                skipLobby: true,
                maxPlayersPerRoom: 16,
                allowGameStates: true, 
                defaultPlayerStates: { name: "", teamId: 0, hitQueue: [], kills: 0, deaths: 0 } 
            });
            this._onSessionStart();
        },

        async joinRoom(name, code) {
            await this._waitForSDK();
            this.localPlayerName = name;
            console.log(`PlayroomManager: Attempting to join room ${code}...`);
            await Playroom.insertCoin({
                skipLobby: true,
                roomCode: code,
                maxPlayersPerRoom: 16,
                allowGameStates: true, 
                defaultPlayerStates: { name: "", teamId: 0, hitQueue: [], kills: 0, deaths: 0 }
            });
            this._onSessionStart();
        },

        _onSessionStart() {
            if (!window.Playroom) return; 
            
            this.isHost = Playroom.isHost();
            this.myPlayer = Playroom.myPlayer();
            this.roomCode = Playroom.getRoomCode();
            this.connectionTime = Date.now();
            this.initialLoadDone = false;
            this.hasJoinedActiveGame = false;
            this.hasInitialBalance = this.isHost;
            
            this.myPlayer.setState('name', this.localPlayerName, true);
            this.myPlayer.setState('hitQueue', [], true);
            
            console.log(`PlayroomManager: Connected. Role: ${this.isHost ? 'HOST' : 'CLIENT'}`);
            
            if (this.isHost) {
                this.forceLobbyUpdate(); 
            }

            if (!this.isHost) {
                const teamCount = Playroom.getState('MATCH_teamCount');
                const gamemode = Playroom.getState('MATCH_gamemode');
                if (teamCount && gamemode !== 'FFA') {
                    if (window.TacticalShooter.TeamManager) {
                        window.TacticalShooter.TeamManager.balancePlayer(teamCount);
                    }
                }
            }
            
            if (window.TacticalShooter.MultiplayerUI) {
                window.TacticalShooter.MultiplayerUI.onGameStarted(this.roomCode, this.isHost);
            }

            this._setupNetworkListeners();
            
            setTimeout(() => { this.initialLoadDone = true; }, 1000);
        },

        _setupNetworkListeners() {
            Playroom.onPlayerJoin((player) => {
                this._handlePlayerJoin(player);
                if (this.isHost) this.forceLobbyUpdate();
            });
            
            if (Playroom.RPC && Playroom.RPC.register) {
                Playroom.RPC.register('ON_DEATH', (data, sender) => {
                    this._handleKillfeedEvent(data, sender);
                });
                Playroom.RPC.register('ON_THROW', (data, sender) => {
                    if (sender.id === this.myPlayer.id) return; 
                    if (window.TacticalShooter.ThrowableManager) {
                        window.TacticalShooter.ThrowableManager.spawnRemote(data.origin, data.velocity, data.type, sender.id);
                    }
                });
            }
        },
        
        // --- API FOR OTHER MODULES ---
        broadcastDeath(killerId) {
            if (!window.Playroom || !Playroom.RPC) return;
            Playroom.RPC.call('ON_DEATH', { killerId: killerId }, Playroom.RPC.Mode.ALL);
        },
        
        broadcastThrow(origin, velocity, type) {
            if (!window.Playroom || !Playroom.RPC) return;
            Playroom.RPC.call('ON_THROW', { origin, velocity, type }, Playroom.RPC.Mode.OTHERS);
        },
        
        // CRITICAL FIX: Exposed for WeaponManager
        broadcastBulletHit(position, normal, targetId, damage = 0, hitPart = null, ragdollImpulse = 2.0, isStealth = false, damageOrigin = null) {
            if (!this.myPlayer) return;

            const hitData = {
                id: Math.random().toString(36).substr(2, 9),
                x: Math.round(position.x * 100) / 100,
                y: Math.round(position.y * 100) / 100,
                z: Math.round(position.z * 100) / 100,
                nx: Math.round(normal.x * 100) / 100,
                ny: Math.round(normal.y * 100) / 100,
                nz: Math.round(normal.z * 100) / 100,
                targetId: targetId || null,
                dmg: damage,
                part: hitPart,
                imp: ragdollImpulse,
                stealth: isStealth ? true : undefined,
                t: Date.now()
            };

            // Add Origin if provided (for grenade death cam focus)
            if (damageOrigin) {
                hitData.ox = Math.round(damageOrigin.x * 100) / 100;
                hitData.oy = Math.round(damageOrigin.y * 100) / 100;
                hitData.oz = Math.round(damageOrigin.z * 100) / 100;
            }

            this.hitQueue.push(hitData);
            if (this.hitQueue.length > 10) this.hitQueue.shift();
            this.myPlayer.setState('hitQueue', this.hitQueue);
        },
        
        forceLobbyUpdate() {
            if (!this.isHost) return;
            if (this._updateTimeout) clearTimeout(this._updateTimeout);
            this._updateTimeout = setTimeout(() => {
                this._updateFirebaseLobby();
            }, 500);
        },
        
        _handleKillfeedEvent(data, victimPlayer) {
            const victimName = victimPlayer.getState('name') || "Unknown";
            const killerId = data.killerId;
            let killerName = "Unknown";
            
            if (killerId === this.myPlayer.id) {
                killerName = this.localPlayerName;
                if (victimPlayer.id !== this.myPlayer.id) {
                    const currentKills = this.myPlayer.getState('kills') || 0;
                    this.myPlayer.setState('kills', currentKills + 1, true);
                    if (window.TacticalShooter.HitmarkerSystem) window.TacticalShooter.HitmarkerSystem.show('kill');
                }
            } else {
                if (window.TacticalShooter.RemotePlayerManager && window.TacticalShooter.RemotePlayerManager.remotePlayers[killerId]) {
                    killerName = window.TacticalShooter.RemotePlayerManager.remotePlayers[killerId].name;
                }
            }
            
            if (window.TacticalShooter.Killfeed) {
                let type = 'red';
                const myId = this.myPlayer.id;
                if (killerId === myId) type = 'gold';
                else if (victimPlayer.id === myId) type = 'red';
                else {
                    type = 'blue';
                }
                
                const verb = (killerId === victimPlayer.id) ? "COMMITTED SUICIDE" : "KILLED";
                window.TacticalShooter.Killfeed.show(killerName, (killerId===victimPlayer.id ? "" : victimName), type, verb);
            }
        },
        
        _handlePlayerJoin(player) {
            if (!this.myPlayer) return;
            if (player.id === this.myPlayer.id) return;
            
            if (window.TacticalShooter.RemotePlayerManager) {
                window.TacticalShooter.RemotePlayerManager.addPlayer(player);
            } else {
                this.playerBuffer.push(player);
            }
            
            if (this.initialLoadDone) this._waitForNameAndNotify(player, 0, Date.now());

            player.onQuit(() => {
                this.playerBuffer = this.playerBuffer.filter(p => p.id !== player.id);
                if (window.TacticalShooter.RemotePlayerManager) {
                    const rpm = window.TacticalShooter.RemotePlayerManager;
                    const p = rpm.remotePlayers[player.id];
                    const name = (p && p.name !== '...') ? p.name : 'PLAYER';
                    rpm.removePlayer(player.id);
                    if (this.initialLoadDone && window.TacticalShooter.MultiplayerUI) {
                        window.TacticalShooter.MultiplayerUI.showNotification(`${name} LEFT`, 'red');
                    }
                }
                if (this.isHost) this.forceLobbyUpdate();
            });
        },
        
        _waitForNameAndNotify(player, attempts = 0, startTime = 0) {
            if (startTime > 0 && (Date.now() - startTime) < 1500) {
                setTimeout(() => this._waitForNameAndNotify(player, attempts, startTime), 250);
                return;
            }
            const name = player.getState('name');
            if (name && name.length > 0) {
                if (window.TacticalShooter.MultiplayerUI) {
                    window.TacticalShooter.MultiplayerUI.showNotification(`${name} JOINED`, 'blue');
                }
                return;
            }
            if (attempts < 20) setTimeout(() => this._waitForNameAndNotify(player, attempts + 1, startTime), 250);
        },
        
        syncPlayers() {
            if (!this.myPlayer) return;
            const rpm = window.TacticalShooter.RemotePlayerManager;
            if (!rpm) return;
            
            if (this.playerBuffer.length > 0) {
                 this.playerBuffer.forEach(p => rpm.addPlayer(p));
                 this.playerBuffer = [];
            }
            
            for (let id in rpm.remotePlayers) {
                const rp = rpm.remotePlayers[id];
                if (!rp.mesh && rp.player) {
                    rpm.removePlayer(id); 
                    rpm.addPlayer(rp.player); 
                }
            }
        },

        update(dt) {
            if (!window.Playroom || !this.myPlayer) return;

            if (this.playerBuffer.length > 0 && window.TacticalShooter.RemotePlayerManager) {
                this.playerBuffer.forEach(p => window.TacticalShooter.RemotePlayerManager.addPlayer(p));
                this.playerBuffer = [];
            }

            const now = performance.now();
            if (now - this.lastUpdate < this.updateInterval) return;
            this.lastUpdate = now;
            
            if (window.TacticalShooter.MatchState) {
                window.TacticalShooter.MatchState.syncMatchState();
                if (this.isHost) window.TacticalShooter.MatchState.hostUpdateLogic();
            }

            if (now - this.lastSyncCheck > this.syncInterval) {
                this.syncPlayers();
                this.lastSyncCheck = now;
            }

            const currentStateName = this.myPlayer.getState('name');
            if (currentStateName !== this.localPlayerName) {
                this.myPlayer.setState('name', this.localPlayerName, true);
            }

            if (!this.isHost) {
                const MS = window.TacticalShooter.MatchState.state;
                if (!this.hasInitialBalance && this.initialLoadDone) {
                    if (window.TacticalShooter.TeamManager && MS.gamemode !== 'FFA') {
                        window.TacticalShooter.TeamManager.balancePlayer(MS.teamCount);
                        this.hasInitialBalance = true;
                    }
                }

                if (!this.hasJoinedActiveGame && this.roomCode) {
                    this.hasJoinedActiveGame = true;
                    setTimeout(() => {
                        if (window.TacticalShooter.MultiplayerUI) {
                            window.TacticalShooter.MultiplayerUI.showNotification(`CONNECTED TO ${this.roomCode}`, 'blue');
                        }
                    }, 1500);
                }
            } 
            else {
                const globalStatus = Playroom.getState('MATCH_status');
                if (!globalStatus) {
                    const MS = window.TacticalShooter.MatchState;
                    MS.setSetting('mapId', 'WAREHOUSE');
                    MS.setSetting('gamemode', 'TDM');
                    MS.setSetting('status', 'PLAYING');
                    MS.setSetting('timeLimit', 10);
                    MS.setSetting('matchEndTime', Date.now() + 600000);
                }
                if (!this.hasJoinedActiveGame) this.hasJoinedActiveGame = true;
            }

            if (window.TacticalShooter.GameManager.currentState === 'IN_GAME') {
                if (window.TacticalShooter.NetworkState) {
                    const packet = window.TacticalShooter.NetworkState.getLocalPacket();
                    if (packet) {
                        for (const key in packet) {
                            this.myPlayer.setState(key, packet[key]);
                        }
                    }
                }
            }

            if (window.TacticalShooter.RemotePlayerManager) {
                window.TacticalShooter.RemotePlayerManager.update(dt);
            }
        },
        
        _updateFirebaseLobby() {
            if (!this.isHost || !window.TacticalShooter.FirebaseManager || !window.TacticalShooter.MatchState) return;
            
            const MS = window.TacticalShooter.MatchState.state;
            let count = 1; 
            if (window.TacticalShooter.RemotePlayerManager) {
                count += Object.keys(window.TacticalShooter.RemotePlayerManager.remotePlayers).length;
            }
            
            const mapName = (MS.mapId === 'DEPOT') ? 'WAREHOUSE 2' : MS.mapId;
            console.log("PlayroomManager: Syncing Lobby Metadata to Firebase...");
            window.TacticalShooter.FirebaseManager.updateLobby(this.roomCode, count, mapName, MS.gamemode);
        },

        disconnect() {
            if (this.isHost && window.TacticalShooter.FirebaseManager) {
                window.TacticalShooter.FirebaseManager.removeLobby();
            }
            if (window.TacticalShooter.RemotePlayerManager) {
                window.TacticalShooter.RemotePlayerManager.removeAll();
            }
            this.myPlayer = null;
            this.isHost = false;
            this.roomCode = null;
            this.hasInitialBalance = false;
            this.playerBuffer = [];
            
            if (window.TacticalShooter.MatchState) {
                window.TacticalShooter.MatchState.resetToDefaults();
            }
            
            try { 
                Object.keys(localStorage).forEach(key => { 
                    if (key.startsWith('playroom') || key.includes('roomCode')) localStorage.removeItem(key); 
                }); 
                Object.keys(sessionStorage).forEach(key => { 
                    if (key.startsWith('playroom')) sessionStorage.removeItem(key); 
                });
            } catch(e) {}
            
            this.cleanURL();
        },
        
        onPlayerFired() {
            if (this.myPlayer) this.myPlayer.setState('lastFired', Date.now());
        }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.PlayroomManager = PlayroomManager;
})();
