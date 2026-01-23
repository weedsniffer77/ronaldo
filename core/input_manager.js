
// js/core/input_manager.js
(function() {
    const InputManager = {
        keys: {},
        justPressed: {}, 
        
        mouse: {
            movementX: 0,
            movementY: 0
        },
        
        // Event Handlers
        _boundKeyDown: null,
        _boundKeyUp: null,
        _boundMouseMove: null,
        _boundMouseDown: null,
        _boundMouseUp: null,
        _boundContextMenu: null,
        _boundPointerLock: null,
        
        // Default Bindings
        bindings: {
            Forward: 'KeyW',
            Backward: 'KeyS',
            Left: 'KeyA',
            Right: 'KeyD',
            Jump: 'Space',
            Crouch: 'KeyC', 
            Prone: 'KeyP', 
            Sprint: 'ShiftLeft',
            ADS: 'KeyV', 
            Shoot: 'Mouse0', 
            LeanLeft: 'KeyQ',
            LeanRight: 'KeyE',
            Reload: 'KeyR',
            Inspect: 'KeyI',
            AttachmentFunctionality: 'KeyL', 
            FreeCursor: 'Semicolon', 
            Scoreboard: 'Tab', 
            Menu: 'Escape',
            ToggleUI: 'Backslash', 
            
            // Weapon Slots
            Slot1: 'Digit1',
            Slot2: 'Digit2',
            Slot3: 'Digit3',
            Slot4: 'Digit4',
            Slot5: 'Digit5',
            
            // Cycling
            CycleUp: 'KeyZ',   
            CycleDown: 'KeyX'  
        },
        
        defaultBindings: null,

        init() {
            if (this._boundKeyDown) this.cleanup();
            
            console.log('InputManager: Initializing...');
            
            this.defaultBindings = { ...this.bindings };
            
            this._boundKeyDown = this._onKeyDown.bind(this);
            this._boundKeyUp = this._onKeyUp.bind(this);
            this._boundMouseMove = this._onMouseMove.bind(this);
            this._boundMouseDown = this._onMouseDown.bind(this);
            this._boundMouseUp = this._onMouseUp.bind(this);
            this._boundContextMenu = (e) => e.preventDefault();
            this._boundPointerLock = this._onPointerLockChange.bind(this);
            
            document.addEventListener('keydown', this._boundKeyDown);
            document.addEventListener('keyup', this._boundKeyUp);
            document.addEventListener('mousemove', this._boundMouseMove);
            document.addEventListener('mousedown', this._boundMouseDown);
            document.addEventListener('mouseup', this._boundMouseUp);
            document.addEventListener('contextmenu', this._boundContextMenu);
            
            const canvas = document.getElementById('game-canvas');
            const overlay = document.getElementById('pointer-lock-overlay');
            
            if (canvas && overlay) {
                overlay.onclick = () => { canvas.requestPointerLock(); };
            }
            
            document.addEventListener('pointerlockchange', this._boundPointerLock);
            
            console.log('InputManager: ✓ Ready');
        },
        
        cleanup() {
            if (this._boundKeyDown) {
                document.removeEventListener('keydown', this._boundKeyDown);
                document.removeEventListener('keyup', this._boundKeyUp);
                document.removeEventListener('mousemove', this._boundMouseMove);
                document.removeEventListener('mousedown', this._boundMouseDown);
                document.removeEventListener('mouseup', this._boundMouseUp);
                document.removeEventListener('contextmenu', this._boundContextMenu);
                document.removeEventListener('pointerlockchange', this._boundPointerLock);
                
                this._boundKeyDown = null;
            }
        },
        
        _onKeyDown(e) {
            if (!this.keys[e.code]) {
                this.justPressed[e.code] = true;
            }
            this.keys[e.code] = true;
            
            // CHECK SETTINGS MANAGER FOR REBINDING STATE
            if (window.TacticalShooter.SettingsManager && window.TacticalShooter.SettingsManager.listeningForKey) {
                window.TacticalShooter.SettingsManager.handleRebind(e.code);
                return;
            }

            if (e.code === 'Tab') {
                e.preventDefault();
                if (window.TacticalShooter.MatchState && window.TacticalShooter.MatchState.state.status === 'LOBBY') {
                    return;
                }
                if (window.TacticalShooter.UIManager) window.TacticalShooter.UIManager.toggleScoreboard(true);
            }
            
            if (e.code === this.bindings.ToggleUI) {
                if (window.TacticalShooter.UIManager) window.TacticalShooter.UIManager.toggleUI();
            }

            if (e.code === this.bindings.Menu || e.code === 'Escape') {
                const settingsEl = document.getElementById('settings-menu');
                if (settingsEl && settingsEl.classList.contains('active')) {
                    if (window.TacticalShooter.UIManager) window.TacticalShooter.UIManager.closeSettings();
                    return;
                }

                const GM = window.TacticalShooter.GameManager;
                if (GM && GM.currentState === 'MENU') return;
                
                if (window.TacticalShooter.UIManager) {
                    window.TacticalShooter.UIManager.toggleMenu();
                }
            }
        },
        
        _onKeyUp(e) {
            this.keys[e.code] = false;
            this.justPressed[e.code] = false;
            
            if (e.code === 'Tab') {
                if (window.TacticalShooter.UIManager) window.TacticalShooter.UIManager.toggleScoreboard(false);
            }
        },
        
        _onMouseMove(e) {
            if (document.pointerLockElement === document.getElementById('game-canvas')) {
                this.mouse.movementX = e.movementX || 0;
                this.mouse.movementY = e.movementY || 0;
            }
        },
        
        _onMouseDown(e) {
            const code = `Mouse${e.button}`;
            if (!this.keys[code]) {
                this.justPressed[code] = true;
            }
            this.keys[code] = true;

            if (window.TacticalShooter.SettingsManager && window.TacticalShooter.SettingsManager.listeningForKey) {
                e.preventDefault(); 
                e.stopPropagation();
                window.TacticalShooter.SettingsManager.handleRebind(code);
                return;
            }
        },
        
        _onMouseUp(e) {
            const code = `Mouse${e.button}`;
            this.keys[code] = false;
            this.justPressed[code] = false;
        },
        
        _onPointerLockChange() {
            const canvas = document.getElementById('game-canvas');
            const overlay = document.getElementById('pointer-lock-overlay');
            
            if (document.pointerLockElement === canvas) {
                if(overlay) overlay.classList.add('hidden');
                if (window.TacticalShooter.UIManager) {
                    window.TacticalShooter.UIManager.closeMenu();
                }
            } else {
                const MS = window.TacticalShooter.MatchState;
                if (MS && MS.state.status === 'GAME_OVER') {
                    if (window.TacticalShooter.UIManager && window.TacticalShooter.UIManager.cursorElement) {
                        window.TacticalShooter.UIManager.cursorElement.style.display = 'block';
                    }
                    return;
                }
                
                if (window.TacticalShooter.PlayerState && window.TacticalShooter.PlayerState.isDead) {
                    if (window.TacticalShooter.UIManager && window.TacticalShooter.UIManager.cursorElement) {
                        window.TacticalShooter.UIManager.cursorElement.style.display = 'block';
                    }
                    return; 
                }

                const freeCursorKey = this.bindings.FreeCursor;
                if (this.keys[freeCursorKey]) {
                } else {
                    const GM = window.TacticalShooter.GameManager;
                    if (GM && GM.currentState === 'MENU') return;
                    
                    if (window.TacticalShooter.UIManager) {
                        if (overlay && overlay.classList.contains('hidden')) {
                            window.TacticalShooter.UIManager.openMenu();
                        } else if(overlay) {
                            overlay.classList.remove('hidden');
                        }
                    } else if(overlay) {
                        overlay.classList.remove('hidden');
                    }
                }
            }
        },
        
        resetBindings() {
            if (this.defaultBindings) {
                this.bindings = { ...this.defaultBindings };
            }
        },
        
        update() {
            this.mouse.movementX = 0;
            this.mouse.movementY = 0;
            
            for (const key in this.justPressed) {
                this.justPressed[key] = false;
            }

            const freeCode = this.bindings.FreeCursor;
            
            if (this.keys[freeCode]) {
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
            }
        },
        
        isKeyPressed(code) {
            if (window.TacticalShooter.UIManager && window.TacticalShooter.UIManager.isMenuOpen) return false;
            return this.keys[code] || false;
        },
        
        isActionActive(actionName) {
            if (window.TacticalShooter.UIManager && window.TacticalShooter.UIManager.isMenuOpen) return false;
            const code = this.bindings[actionName];
            return code ? (this.keys[code] || false) : false;
        },

        wasActionJustPressed(actionName) {
            if (window.TacticalShooter.UIManager && window.TacticalShooter.UIManager.isMenuOpen) return false;
            const code = this.bindings[actionName];
            return code ? (this.justPressed[code] || false) : false;
        },

        getBinding(actionName) {
            return this.bindings[actionName] || '???';
        },
        
        setBinding(actionName, code) {
            this.bindings[actionName] = code;
        },
        
        getMouseDelta() {
            if (window.TacticalShooter.UIManager && window.TacticalShooter.UIManager.isMenuOpen) return { x: 0, y: 0 };
            return { x: this.mouse.movementX, y: this.mouse.movementY };
        }
    };
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.InputManager = InputManager;
})();
