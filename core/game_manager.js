
// js/core/game_manager.js
(function() {
    const GameManager = {
        scene: null,
        camera: null,
        renderer: null,
        cubeCamera: null,
        cubeRenderTarget: null,
        
        currentState: "INIT", 
        isMenuMode: true, 
        
        lastTime: 0,
        lastRenderTime: 0,
        fpsTime: 0,
        fpsFrames: 0,
        
        // Transition State
        transition: {
            active: false,
            timer: 0,
            duration: 2.0, 
            startPos: null,
            startRot: null,
            startFOV: 50,
            endPos: null,
            endRot: null,
            endFOV: 75,
            blackoutTriggered: false
        },
        
        // Menu Rotation State
        menuRotationAngle: 0,
        
        // Dynamic Map Ref
        currentMap: null,
        staticCollider: null, // BVH merged mesh
        
        config: { maxFPS: 250 },
        
        // Reverted to Deep Blue/Black Lobby Lighting (Match v27)
        lobbyLighting: {
            sun: { position: { x: 50, y: 80, z: 40 }, color: "#fff8e0", intensity: 4.0, visual: null },
            ambient: { color: "#aaccff", intensity: 2.0 },
            hemisphere: null,
            fog: { enabled: false }, 
            atmosphere: { horizonColor: "#0b0e14" }, // Deep Blue/Black
            postProcessing: { bloom: { strength: 0.6, radius: 0.4, threshold: 0.85 } } // Lowered threshold for Lobby
        },
        
        async init() {
            if (!window.THREE) {
                if (window.THREE_READY) { } else {
                    console.log('GameManager: Waiting for THREE.js...');
                    setTimeout(() => this.init(), 100);
                    return;
                }
            }
            if (this.scene) return; 

            // Wait for AssetLoader
            if (!window.TacticalShooter.AssetLoader) {
                // AssetLoader should be loaded by now, but if not, we proceed as it's optional bridge
            }

            console.log('GameManager: Initializing...');
            
            // --- PHASE 1: Initialize SceneController ---
            const SC = window.TacticalShooter.SceneController;
            SC.init();
            
            // Alias references for legacy compatibility
            this.scene = SC.scene;
            this.camera = SC.camera;
            this.renderer = SC.renderer;
            this.cubeCamera = SC.cubeCamera; // Aliased
            
            this.transition.startPos = new THREE.Vector3();
            this.transition.startRot = new THREE.Quaternion();
            this.transition.endPos = new THREE.Vector3();
            this.transition.endRot = new THREE.Quaternion();

            // Load Essentials (Async)
            if (window.TacticalShooter.AssetLoader) {
                await window.TacticalShooter.AssetLoader.loadCommon();
            }

            this.initSystems();
            
            // Load Default Map Async
            await this.loadMap("WAREHOUSE");
            
            if (window.TacticalShooter.MenuRenderer) {
                window.TacticalShooter.MenuRenderer.init(this.scene, this.camera);
            }
            
            console.log('GameManager: ✓ Ready');
            
            if (window.TacticalShooter.PlayroomManager) {
                window.TacticalShooter.PlayroomManager.init();
            }

            this.setSystemsActive(false);
            this.enterMenu();
            this.startLoop();
        },
        
        optimizeMapVisuals(chunkSize = 200) {
            if (window.TacticalShooter.MapOptimizer) {
                window.TacticalShooter.MapOptimizer.optimize(this.currentMap.mapGroup, chunkSize);
            }
        },

        generateStaticCollider() {
            if (this.staticCollider) {
                if (this.staticCollider.geometry.boundsTree) this.staticCollider.geometry.disposeBoundsTree();
                this.staticCollider.geometry.dispose();
                this.staticCollider = null;
            }
            if (!this.currentMap || !this.currentMap.mapGroup) return;
            
            if (window.TacticalShooter.MapOptimizer) {
                this.staticCollider = window.TacticalShooter.MapOptimizer.generateStaticCollider(this.currentMap.mapGroup);
            }
        },

        async loadMap(mapId = "WAREHOUSE") {
            // Dynamic Load via AssetLoader
            if (window.TacticalShooter.AssetLoader) {
                // If it's a variant (like WAREHOUSE_NIGHT), load the base map logic
                const baseId = mapId.includes('WAREHOUSE') ? 'WAREHOUSE' : mapId;
                await window.TacticalShooter.AssetLoader.loadMap(baseId);
            }

            if (this.currentMap) {
                this.currentMap.cleanup(this.scene);
                if (window.TacticalShooter.SkyRenderer) window.TacticalShooter.SkyRenderer.dispose();
                this.currentMap = null;
            }
            
            // Resolve Object from Registry
            let mapObj = null; 
            if (window.TacticalShooter.MapRegistry) {
                // Try direct lookup
                mapObj = window.TacticalShooter.MapRegistry.get(mapId);
                
                // Fallback for variants: WAREHOUSE_NIGHT uses WAREHOUSE geometry
                if (!mapObj && mapId.includes('WAREHOUSE')) {
                    mapObj = window.TacticalShooter.MapRegistry.get('WAREHOUSE');
                }
            }
            
            // Legacy Fallback
            if (!mapObj && mapId.includes('WAREHOUSE')) { mapObj = window.TacticalShooter.WarehouseMap; }
            
            if (!mapObj) {
                console.warn(`GameManager: Map ID "${mapId}" not found in registry! Defaulting to WAREHOUSE.`);
                mapObj = window.TacticalShooter.WarehouseMap;
            }
            
            this.currentMap = mapObj;
            
            // Store the ID we actually requested (e.g. WAREHOUSE_NIGHT) so we can check it later
            // But MapObj usually has its own ID property. We rely on the MatchState mapId for lighting config.
            
            this.currentMap.init(this.scene, window.TacticalShooter.MaterialLibrary);
            
            // --- PHYSICS UPDATE (CRITICAL FOR GRENADES) ---
            if (window.TacticalShooter.RagdollManager) {
                window.TacticalShooter.RagdollManager.resetStaticGeometry();
                if (this.currentMap.mapGroup) {
                    window.TacticalShooter.RagdollManager.scanStaticGeometry(this.currentMap.mapGroup);
                }
            }
            
            try {
                // Keep Killhouse/Depot as one chunk (200m) for now
                this.optimizeMapVisuals(200); 
                this.generateStaticCollider(); 
            } catch(e) {
                console.error("GameManager: Failed to optimize map", e);
            }
            
            // Use the requested ID to determine lighting, not just the map geometry ID
            const lighting = this.getActiveLighting(mapId); 
            
            window.TacticalShooter.Raytracer.applyLighting(this.scene, this.renderer, lighting);
            window.TacticalShooter.SkyRenderer.init(this.scene, lighting);
            window.TacticalShooter.PostProcessor.init(this.renderer, this.scene, this.camera, lighting);
            
            // Update reflections via SceneController
            window.TacticalShooter.SceneController.updateReflections();
            
            if (this.currentState === 'TACVIEW') this.enterTacView();
        },
        
        enterMenu() {
            this.currentState = "MENU";
            this.isMenuMode = true; 
            if (window.TacticalShooter.GunRenderer) window.TacticalShooter.GunRenderer.setVisible(false);
            
            // Force disable MenuRenderer to prevent gun in lobby
            if (window.TacticalShooter.MenuRenderer) {
                window.TacticalShooter.MenuRenderer.stop();
            }
            
            // Show the map for the cinematic background
            if (this.currentMap) this.currentMap.setVisible(true);
            
            // Use actual map lighting for the background
            const lighting = this.getActiveLighting();
            window.TacticalShooter.Raytracer.applyLighting(this.scene, this.renderer, lighting);
            window.TacticalShooter.SkyRenderer.init(this.scene, lighting);
            
            if (window.TacticalShooter.Raytracer.lights.sun) window.TacticalShooter.Raytracer.lights.sun.visible = true;
            if (window.TacticalShooter.SkyRenderer.skyMesh) window.TacticalShooter.SkyRenderer.skyMesh.visible = true;
            if (window.TacticalShooter.SkyRenderer.sunGroup) window.TacticalShooter.SkyRenderer.sunGroup.visible = true;
            if (window.TacticalShooter.SkyRenderer.starSystem) window.TacticalShooter.SkyRenderer.starSystem.visible = true;

            // Blur the canvas
            const canvas = document.getElementById('game-canvas');
            if (canvas) canvas.classList.add('canvas-blur');
            
            if (window.TacticalShooter.MultiplayerUI) window.TacticalShooter.MultiplayerUI.setHUDVisible(false);
        },
        
        enterTacView() {
            console.log("GameManager: Entering Tactical View (Lobby)");
            this.checkMapSync();
            this.currentState = "TACVIEW";
            this.isMenuMode = true; 
            
            if (window.TacticalShooter.GunRenderer) window.TacticalShooter.GunRenderer.setVisible(false);
            if (this.currentMap) this.currentMap.setVisible(true);
            
            window.TacticalShooter.Raytracer.applyLighting(this.scene, this.renderer, this.lobbyLighting);
            if (window.TacticalShooter.ShadowManager && window.TacticalShooter.Raytracer.lights.sun) {
                window.TacticalShooter.ShadowManager.setupDirectionalLight(window.TacticalShooter.Raytracer.lights.sun, this.camera);
            }

            // Restore correct Deep Blue (matches v27)
            window.TacticalShooter.SceneController.setBackground(0x0b0e14);
            
            if (window.TacticalShooter.SkyRenderer.skyMesh) window.TacticalShooter.SkyRenderer.skyMesh.visible = false;
            if (window.TacticalShooter.SkyRenderer.sunGroup) window.TacticalShooter.SkyRenderer.sunGroup.visible = false;
            if (window.TacticalShooter.SkyRenderer.starSystem) window.TacticalShooter.SkyRenderer.starSystem.visible = false;

            if (window.TacticalShooter.TacticalCamera) {
                window.TacticalShooter.TacticalCamera.activate();
                // Check if map ID indicates small map for zoom?
                if (this.currentMap && (this.currentMap.id === "WAREHOUSE" || this.currentMap.id === "DEPOT")) {
                    window.TacticalShooter.TacticalCamera.setZoom(0.5);
                } else {
                    window.TacticalShooter.TacticalCamera.setZoom(1.0);
                }
            }
            
            this.updateMapVisuals(true);
            if (window.TacticalShooter.LobbyUI) window.TacticalShooter.LobbyUI.show();
            this.setSystemsActive(false);
            
            if (window.TacticalShooter.TeamManager) window.TacticalShooter.TeamManager.init();
            if (window.TacticalShooter.MatchState) window.TacticalShooter.MatchState.init();
        },
        
        enterLobby() { this.enterTacView(); },
        
        enterGame() {
            if (document.hidden) {
                this._enterGameInternal();
                return;
            }
            if (this.currentState === 'TRANSITION') return;
            if (this.currentState === 'IN_GAME') return;

            // Direct Entry Logic (Bypassing Transition if needed for speed, but standard flow uses transition)
            // If already in TacView, transition. If in Menu, transition.
            this.startTransition();
        },
        
        calculateSpawnPoint() {
            const config = this.getActiveGameConfig();
            const TM = window.TacticalShooter.TeamManager;
            const MS = window.TacticalShooter.MatchState ? window.TacticalShooter.MatchState.state : null;
            
            if (TM && MS && MS.gamemode !== 'FFA' && !window.TacticalShooter.PlayroomManager.isHost) {
                TM.verifyTeamAssignment(MS.teamCount);
            }

            const myTeam = TM ? TM.getLocalTeamId() : 0;
            const teamData = config.teamSpawns ? config.teamSpawns[myTeam] : null;
            
            let spawnPos = new THREE.Vector3(0,0,0);
            let spawnRot = 0;
            const isFFA = MS && MS.gamemode === 'FFA';

            if (isFFA) {
                 const spawns = config.ffaSpawns || [];
                 if (spawns.length > 0) {
                     const idx = Math.floor(Math.random() * spawns.length);
                     const pt = spawns[idx];
                     spawnPos.set(pt.x, 0.5, pt.z); 
                     const center = new THREE.Vector3(0,0,0);
                     const lookDir = center.sub(spawnPos).normalize();
                     spawnRot = Math.atan2(lookDir.x, lookDir.z) + Math.PI;
                 } else {
                     spawnPos.set(0, 10, 0); 
                 }
            } else if (teamData) {
                spawnPos.set(teamData.origin.x, teamData.origin.y, teamData.origin.z);
                const offset = (Math.random() - 0.5) * (teamData.spreadWidth || 10);
                if (teamData.spreadAxis === 'x') spawnPos.x += offset; else spawnPos.z += offset; 
                
                const lookTarget = new THREE.Vector3(teamData.lookAt.x, teamData.lookAt.y, teamData.lookAt.z);
                const dir = lookTarget.sub(spawnPos).normalize();
                spawnRot = Math.atan2(dir.x, dir.z) + Math.PI;
            } else {
                spawnPos.set(config.playerSpawn.position.x, config.playerSpawn.position.y, config.playerSpawn.position.z);
                spawnRot = config.playerSpawn.rotation.y;
            }
            
            return { pos: spawnPos, rot: spawnRot };
        },
        
        startTransition() {
            this.currentState = "TRANSITION";
            this.transition.active = true;
            this.transition.timer = 0;
            this.transition.duration = 2.0; 
            this.transition.blackoutTriggered = false;
            
            if (window.TacticalShooter.TacticalCamera && window.TacticalShooter.TacticalCamera.isActive) {
                const tacCam = window.TacticalShooter.TacticalCamera.camera;
                window.TacticalShooter.TacticalCamera.deactivate();
                
                this.camera.position.copy(tacCam.position);
                this.camera.rotation.copy(tacCam.rotation);
                this.camera.updateMatrixWorld();
                
                this.transition.startFOV = 100;
                this.transition.endFOV = 75; 
                this.camera.fov = this.transition.startFOV;
            } else {
                // If skipping TacView (Instant Action), start high above or from menu cam pos
                this.transition.startPos.copy(this.camera.position);
                this.transition.startRot.copy(this.camera.quaternion);
                this.transition.startFOV = 75; // Or whatever menu cam fov is
                this.transition.endFOV = 75;
            }
            
            this.transition.startPos.copy(this.camera.position);
            this.transition.startRot.copy(this.camera.quaternion);
            
            const spawnData = this.calculateSpawnPoint();
            this.cachedSpawnData = spawnData; 
            
            if (window.TacticalShooter.CharacterController) {
                window.TacticalShooter.CharacterController.init(spawnData.pos);
                if (window.TacticalShooter.PlayerCamera) {
                    window.TacticalShooter.PlayerCamera.yaw = spawnData.rot;
                    window.TacticalShooter.PlayerCamera.pitch = 0;
                }
            }

            this.transition.endPos.set(spawnData.pos.x, spawnData.pos.y + 1.6, spawnData.pos.z);
            this.transition.endRot.setFromEuler(new THREE.Euler(0, spawnData.rot, 0, 'YXZ'));
        },
        
        updateTransition(dt) {
            if (!this.transition.active) return;
            
            this.transition.timer += dt;
            const progress = Math.min(1.0, this.transition.timer / this.transition.duration);
            const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
            
            this.camera.position.lerpVectors(this.transition.startPos, this.transition.endPos, ease);
            this.camera.quaternion.slerpQuaternions(this.transition.startRot, this.transition.endRot, ease);
            
            this.camera.fov = THREE.MathUtils.lerp(this.transition.startFOV, this.transition.endFOV, ease);
            this.camera.updateProjectionMatrix();
            
            const lobbyLayer = document.getElementById('lobby-ui-layer');
            const canvas = document.getElementById('game-canvas');
            
            if (lobbyLayer && canvas) {
                const fadeProgress = Math.min(1.0, progress * 2.0); 
                lobbyLayer.style.opacity = 1.0 - fadeProgress;
                
                if (fadeProgress < 1.0) {
                    // Retain blur if in menu/lobby transition, slowly sharpen
                    const gray = 100 * (1.0 - fadeProgress);
                    // Fade out blur if it exists
                    canvas.style.filter = `blur(${5 * (1.0-fadeProgress)}px)`;
                } else {
                    canvas.style.filter = "none";
                    canvas.classList.remove('canvas-blur');
                    lobbyLayer.style.display = 'none'; 
                }
            }

            const overlay = document.getElementById('transition-overlay');
            if (overlay && progress > 0.7) {
                const fadeProgress = (progress - 0.7) / 0.3; 
                overlay.style.opacity = fadeProgress;
            }
            
            if (progress >= 1.0 && !this.transition.blackoutTriggered) {
                this.transition.blackoutTriggered = true;
                if (overlay) overlay.style.opacity = 1;
                
                this._enterGameInternal();
                
                setTimeout(() => {
                    if (overlay) overlay.style.opacity = 0;
                }, 800);
                
                this.transition.active = false;
            }
        },

        async _enterGameInternal() {
            console.log("GameManager: Internal Game Entry - Loading Assets...");
            // Temporary loading state to prevent update loop from running prematurely
            this.currentState = "LOADING";
            
            // --- LOADOUT FIX: Force Equip Main Loadout and Wait for Assets ---
            if (window.TacticalShooter.LoadoutManager) {
                const lm = window.TacticalShooter.LoadoutManager;
                // If reloading into game, ensure we use the current active loadout OR reset to main?
                // The user is redeploying. Let's stick with current selection in manager.
                // However, ensure assets are loaded.
                
                const loadoutIdx = lm.currentLoadoutIndex; 
                if (loadoutIdx >= 0) {
                    console.log(`GameManager: Equipping Loadout (${loadoutIdx}) for spawn.`);
                    try {
                        if (window.TacticalShooter.AssetLoader) {
                            const l = lm.getLoadout(loadoutIdx);
                            await Promise.all([
                                window.TacticalShooter.AssetLoader.loadWeapon(l.primary.id),
                                window.TacticalShooter.AssetLoader.loadWeapon(l.secondary.id),
                                window.TacticalShooter.AssetLoader.loadWeapon(l.melee.id)
                            ]);
                        }
                        lm.equipLoadout(loadoutIdx);
                    } catch (e) {
                        console.error("GameManager: Failed to equip loadout", e);
                    }
                }
            }
            
            // Check if map needs to change
            await this.checkMapSync();
            
            this.isMenuMode = false;
            
            // RESET PLAYER STATE (Health, Ammo, etc)
            if (window.TacticalShooter.PlayerState) {
                window.TacticalShooter.PlayerState.respawn(); // This handles logic resets
            }
            
            if (window.TacticalShooter.MenuRenderer) window.TacticalShooter.MenuRenderer.stop();
            
            const mapLighting = this.getActiveLighting();
            window.TacticalShooter.Raytracer.applyLighting(this.scene, this.renderer, mapLighting);
            window.TacticalShooter.SkyRenderer.init(this.scene, mapLighting);

            if (window.TacticalShooter.ShadowManager && window.TacticalShooter.Raytracer.lights.sun) {
                window.TacticalShooter.ShadowManager.setupDirectionalLight(window.TacticalShooter.Raytracer.lights.sun, this.camera);
            }

            if (mapLighting && mapLighting.atmosphere) {
                window.TacticalShooter.SceneController.setBackground(mapLighting.atmosphere.horizonColor);
            }
            if (window.TacticalShooter.SkyRenderer.skyMesh) window.TacticalShooter.SkyRenderer.skyMesh.visible = true;
            if (window.TacticalShooter.SkyRenderer.sunGroup) window.TacticalShooter.SkyRenderer.sunGroup.visible = true;
            if (window.TacticalShooter.SkyRenderer.starSystem) window.TacticalShooter.SkyRenderer.starSystem.visible = true;
            
            if (window.TacticalShooter.LobbyUI) window.TacticalShooter.LobbyUI.hide();
            const lobbyLayer = document.getElementById('lobby-ui-layer');
            if (lobbyLayer) {
                lobbyLayer.style.display = 'none';
                lobbyLayer.style.opacity = 1; 
            }

            if (window.TacticalShooter.TacticalCamera) window.TacticalShooter.TacticalCamera.deactivate();
            
            this.updateMapVisuals(false);

            window.TacticalShooter.SceneController.updateReflections();
            
            if (window.TacticalShooter.MultiplayerUI) window.TacticalShooter.MultiplayerUI.setHUDVisible(true);
            if (window.TacticalShooter.UIManager) window.TacticalShooter.UIManager.applySettingsToDOM(); 
            
            this.spawnPlayer(); 
            
            if (window.TacticalShooter.GunRenderer) window.TacticalShooter.GunRenderer.setVisible(true);
            if (window.TacticalShooter.WeaponManager) window.TacticalShooter.WeaponManager.reset();
            
            if (window.TacticalShooter.MatchState && window.TacticalShooter.MatchState.state.status === 'PRE_ROUND') {
                if (window.TacticalShooter.PlayerState) window.TacticalShooter.PlayerState.toggleInGameLoadoutPicker(true);
            }
            
            // Assets loaded, scene prepped: GO!
            this.currentState = "IN_GAME";
            console.log("GameManager: Entered Game State.");
        },
        
        async checkMapSync() {
            const MS = window.TacticalShooter.MatchState ? window.TacticalShooter.MatchState.state : null;
            if (!MS) return;
            const targetMapId = MS.mapId;
            // Check if current ID matches target
            // NOTE: WAREHOUSE_NIGHT shares geometry with WAREHOUSE, but needs reloading to re-apply lighting/visuals correctly
            
            let needsLoad = false;
            
            if (!this.currentMap) {
                needsLoad = true;
            } else if (this.currentMap.id !== targetMapId) {
                // Special case: Variant Check
                if (targetMapId.includes(this.currentMap.id) || this.currentMap.id.includes(targetMapId)) {
                    // Logic to handle variants without full reload?
                    // For now, reload to be safe and catch lighting changes.
                    // Actually, let's just check equality.
                    if (this.currentMap.id === 'WAREHOUSE' && targetMapId === 'WAREHOUSE_NIGHT') needsLoad = true;
                    else if (this.currentMap.id === 'WAREHOUSE' && targetMapId === 'WAREHOUSE') needsLoad = false;
                    else needsLoad = true;
                } else {
                    needsLoad = true;
                }
            }
            
            if (needsLoad) {
                console.log(`GameManager: Syncing Map to ${targetMapId}`);
                await this.loadMap(targetMapId);
            }
        },

        updateMapVisuals(isTacView) {
            const mapGroup = this.currentMap ? this.currentMap.mapGroup : null;
            if (!mapGroup) return;
            const matLib = window.TacticalShooter.MaterialLibrary;
            
            if (this.currentMap && this.currentMap.updateVisuals) {
                const MS = window.TacticalShooter.MatchState ? window.TacticalShooter.MatchState.state : null;
                const isTDM = MS ? (MS.gamemode !== 'FFA') : true;
                const count = MS ? MS.teamCount : 2;
                this.currentMap.updateVisuals(isTacView, isTDM, count);
            }

            mapGroup.traverse((obj) => {
                if (!obj.isMesh) return; 
                let isBorder = obj.userData.isBorder;
                let isSpawnZone = obj.userData.isSpawnZone;
                let isProp = obj.userData.isProp;

                let curr = obj.parent;
                while (curr && curr !== mapGroup && curr !== null) {
                    if (curr.userData.isBorder) isBorder = true;
                    if (curr.userData.isSpawnZone) isSpawnZone = true;
                    if (curr.userData.isProp) isProp = true;
                    curr = curr.parent;
                }

                if (isSpawnZone) return;
                if (isBorder) { obj.visible = isTacView; return; }
                if (isProp) { obj.visible = !isTacView; return; }
                
                const mat = obj.material;
                if (!mat) return;
                
                if (isTacView) {
                    if (!obj.userData.originalMaterial) obj.userData.originalMaterial = mat;
                    const orig = obj.userData.originalMaterial;
                    const name = orig.name || '';
                    // Generic replacement logic
                    if (name.toLowerCase().includes('floor') || name.toLowerCase().includes('concrete')) {
                        obj.material = matLib.getMaterial('lobbyFloor');
                    } else if (name.toLowerCase().includes('container') || name === 'barrelRed') {
                        obj.material = matLib.getMaterial('lobbyContainer');
                    } else {
                        obj.material = matLib.getMaterial('lobbyBuilding');
                    }
                } else {
                    if (obj.userData.originalMaterial) obj.material = obj.userData.originalMaterial;
                }
            });
        },

        spawnPlayer() {
            let spawnData = this.cachedSpawnData;
            if (!spawnData) {
                spawnData = this.calculateSpawnPoint();
            }
            this.cachedSpawnData = null;

            window.TacticalShooter.CharacterController.init(spawnData.pos);
            if (window.TacticalShooter.PlayerCamera) {
                window.TacticalShooter.PlayerCamera.init(this.camera, { x: 0, y: spawnData.rot, z: 0 });
            }
            if (window.TacticalShooter.PlayerState) {
                // IMPORTANT: Ensure WeaponManager has a weapon before setting state
                const wm = window.TacticalShooter.WeaponManager;
                if (wm && wm.currentWeapon) {
                    window.TacticalShooter.PlayerState.setWeapon(wm.currentWeapon);
                }
            }
        },
        
        setSystemsActive(active) {
            if (window.TacticalShooter.GunRenderer) {
                window.TacticalShooter.GunRenderer.setVisible(active);
            }
        },
        
        initSystems() {
            if (window.TacticalShooter.Shaders && window.TacticalShooter.Shaders.init) window.TacticalShooter.Shaders.init();
            if (window.TacticalShooter.UIManager) window.TacticalShooter.UIManager.init();
            if (window.TacticalShooter.AudioManager) window.TacticalShooter.AudioManager.init();
            if (window.TacticalShooter.InventoryController) window.TacticalShooter.InventoryController.init();
            if (window.TacticalShooter.ThrowableManager) window.TacticalShooter.ThrowableManager.init(this.scene);
            
            window.TacticalShooter.InputManager.init();
            window.TacticalShooter.PlayerState.init();
            const spawnPos = new THREE.Vector3(0,10,0);
            window.TacticalShooter.CharacterController.init(spawnPos);
            window.TacticalShooter.PlayerCamera.init(this.camera, {x:0, y:0});
            
            if (window.TacticalShooter.GunRenderer) window.TacticalShooter.GunRenderer.init(this.camera);
            
            window.TacticalShooter.WeaponManager.init();
            window.TacticalShooter.ParticleManager.init(this.scene);
            window.TacticalShooter.MaterialLibrary.init();
            window.TacticalShooter.Raytracer.init(this.renderer);
            window.TacticalShooter.Ballistics.init(this.scene);
            if (window.TacticalShooter.RagdollManager) window.TacticalShooter.RagdollManager.init(this.scene);
            if (window.TacticalShooter.TacticalCamera) window.TacticalShooter.TacticalCamera.init();
            if (window.TacticalShooter.LobbyUI) window.TacticalShooter.LobbyUI.init();
            if (window.TacticalShooter.HitmarkerSystem) window.TacticalShooter.HitmarkerSystem.init();
        },
        
        getActiveGameConfig() {
            // Dynamic check for DEPOT
            if (this.currentMap && this.currentMap.id === "DEPOT") {
                return window.DEPOT_GAME_CONFIG;
            }
            if (this.currentMap && this.currentMap.id === "WAREHOUSE") {
                // If requesting Night config? MatchState usually holds truth.
                const MS = window.TacticalShooter.MatchState;
                if (MS && MS.state.nightMode) return window.WAREHOUSE_NIGHT_GAME_CONFIG;
                return window.WAREHOUSE_GAME_CONFIG;
            }
            return window.WAREHOUSE_GAME_CONFIG;
        },
        
        getActiveLighting(requestedMapId) {
            // Priority: Explicit ID passed in argument -> MatchState -> Default
            let mapId = requestedMapId;
            if (!mapId && this.currentMap) mapId = this.currentMap.id;
            
            const MS = window.TacticalShooter.MatchState;
            const useNight = (MS && MS.state.nightMode) || (mapId && mapId.includes('NIGHT'));
            
            if (mapId && mapId.includes("DEPOT")) {
                return window.DEPOT_LIGHTING;
            }
            if (mapId && mapId.includes("WAREHOUSE")) {
                if (useNight && window.WAREHOUSE_NIGHT_LIGHTING) return window.WAREHOUSE_NIGHT_LIGHTING;
                return window.WAREHOUSE_LIGHTING;
            }
            return window.WAREHOUSE_LIGHTING;
        },
        
        setMenuMode(enabled) { this.isMenuMode = enabled; },

        startLoop() {
            this.lastTime = performance.now();
            this.lastRenderTime = this.lastTime;
            this.fpsTime = this.lastTime;
            this.gameLoop();
        },
        
        gameLoop() {
            requestAnimationFrame(() => this.gameLoop());
            const currentTime = performance.now();
            if (this.config.maxFPS < 241) {
                const interval = 1000 / this.config.maxFPS;
                const elapsed = currentTime - this.lastRenderTime;
                if (elapsed < interval) return;
                this.lastRenderTime = currentTime - (elapsed % interval);
            } else { this.lastRenderTime = currentTime; }
            
            const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
            this.lastTime = currentTime;
            
            this.fpsFrames++;
            if (currentTime >= this.fpsTime + 1000) {
                const fpsDisplay = document.getElementById('fps-display');
                if (fpsDisplay && fpsDisplay.style.display !== 'none') fpsDisplay.textContent = `FPS: ${this.fpsFrames}`;
                this.fpsTime = currentTime;
                this.fpsFrames = 0;
            }
            this.update(deltaTime);
            this.render(deltaTime);
        },
        
        update(dt) {
            // Early exit if loading
            if (this.currentState === 'LOADING') return;

            // GLOBAL UPDATE: Match State (Timers, Logic) should run regardless of view state
            if (window.TacticalShooter.MatchState) {
                window.TacticalShooter.MatchState.update(dt);
            }

            if (this.currentState === 'TRANSITION') {
                this.updateTransition(dt);
                if (window.TacticalShooter.PlayroomManager) window.TacticalShooter.PlayroomManager.update(dt);
                return;
            }
            if (this.currentState === 'MENU') {
                // Cinematic Menu Rotation
                this.menuRotationAngle += dt * 0.1; // Slow rotation speed
                
                const center = new THREE.Vector3(0, 10, 0);
                let radius = 40.0;
                let targetY = 15.0; // center.y + 5.0
                
                // ADJUSTED: Warehouse Camera
                if (this.currentMap && (this.currentMap.id === 'WAREHOUSE' || this.currentMap.id === 'WAREHOUSE_NIGHT')) {
                    center.y = 7.5; // Look at reduced height
                    radius = 25.0;  // Reduced radius
                    targetY = 7.5;  // Camera same height
                }
                
                const camX = center.x + Math.sin(this.menuRotationAngle) * radius;
                const camZ = center.z + Math.cos(this.menuRotationAngle) * radius;
                
                this.camera.position.set(camX, targetY, camZ);
                this.camera.lookAt(center);
                this.camera.updateMatrixWorld();

                // CRITICAL FIX: Allow MenuRenderer to update so guns spin in Loadout UI
                if (window.TacticalShooter.MenuRenderer && window.TacticalShooter.MenuRenderer.active) {
                    window.TacticalShooter.MenuRenderer.update(dt);
                }

                if (window.TacticalShooter.PlayroomManager) window.TacticalShooter.PlayroomManager.update(dt);
                return;
            }
            if (this.currentState === 'TACVIEW') { 
                // Check map sync in lobby
                this.checkMapSync();
                window.TacticalShooter.SceneController.setBackground(0x0b0e14);
                if (window.TacticalShooter.PlayroomManager) window.TacticalShooter.PlayroomManager.update(dt);
                if (window.TacticalShooter.MenuRenderer && window.TacticalShooter.MenuRenderer.active) {
                    window.TacticalShooter.MenuRenderer.update(dt);
                }
                return;
            }
            
            if (window.TacticalShooter.MatchState) {
                const ms = window.TacticalShooter.MatchState.state;
                
                if (ms.status !== 'GAME_OVER' && !this.isMenuMode) {
                    if (window.TacticalShooter.InventoryController) window.TacticalShooter.InventoryController.update(window.TacticalShooter.InputManager, window.TacticalShooter.PlayerState);
                    window.TacticalShooter.CharacterController.update(dt, window.TacticalShooter.InputManager, window.TacticalShooter.PlayerState, this.scene);
                    window.TacticalShooter.PlayerCamera.update(dt, window.TacticalShooter.InputManager, window.TacticalShooter.CharacterController, window.TacticalShooter.PlayerState);
                    window.TacticalShooter.WeaponManager.update(dt, window.TacticalShooter.InputManager, window.TacticalShooter.PlayerState, window.TacticalShooter.PlayerCamera);
                    window.TacticalShooter.PlayerState.update(dt);
                    window.TacticalShooter.ParticleManager.update(dt);
                    if (window.TacticalShooter.ThrowableManager) window.TacticalShooter.ThrowableManager.update(dt);
                    if (window.TacticalShooter.RagdollManager) window.TacticalShooter.RagdollManager.update(dt);
                }
            } 
            
            if (window.TacticalShooter.SkyRenderer.update) window.TacticalShooter.SkyRenderer.update(this.camera);
            window.TacticalShooter.InputManager.update();
            if (window.TacticalShooter.PlayroomManager) window.TacticalShooter.PlayroomManager.update(dt);
        },
        
        render(dt) {
            if (this.currentState === 'LOADING') return;

            let currentState = this.currentState;
            let activeCam = this.camera;
            
            // Handle Tactical Camera override
            if (currentState === 'TACVIEW' && window.TacticalShooter.TacticalCamera && window.TacticalShooter.TacticalCamera.isActive) {
                activeCam = window.TacticalShooter.TacticalCamera.camera;
            }
            
            const PP = window.TacticalShooter.PostProcessor;
            
            if (PP && PP.enabled) {
                // Post Processing path
                // FIX: Actually call PP.render() to apply damage/vignette
                if (currentState === 'TACVIEW' || currentState === 'MENU' || currentState === 'TRANSITION') {
                    // Standard render for non-game states (skip PP overhead if possible, but keep consistent)
                    // Actually menu needs PP for bloom? Yes.
                    PP.render(dt, this.scene, activeCam);
                } else {
                    // In-Game with effects
                    PP.render(dt, this.scene, activeCam);
                }
            } else {
                // Standard path
                this.renderer.render(this.scene, activeCam);
            }
        },
        
        onResize() {}
    };
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.GameManager = GameManager;
})();
