
// js/visuals/menu_renderer.js
(function() {
    const MenuRenderer = {
        scene: null,
        menuGroup: null, 
        gunMesh: null,
        camera: null,
        renderer: null, 
        
        active: false,
        
        // Viewer State (Smoothed)
        cameraAngle: 0,
        cameraPitch: 0.3,
        radius: 0.6,
        
        // Target State (Input drives this)
        targetAngle: 0,
        targetPitch: 0.3,
        targetRadius: 0.6,
        
        // Focus / Pan State
        lookAtTarget: null,
        currentLookAt: null,
        isFocused: false, // NEW: Tracks if we are locked onto an attachment
        
        // Interactive state
        isDragging: false,
        lastMouseX: 0,
        lastMouseY: 0,
        
        targetElementId: null,
        
        init(unusedScene, unusedCamera) {
            console.log("MenuRenderer: Initializing dedicated scene & renderer...");
            
            if (!window.THREE) {
                console.error("MenuRenderer: THREE.js not loaded!");
                return;
            }

            // Init Vectors
            this.lookAtTarget = new THREE.Vector3(0, 0, 0);
            this.currentLookAt = new THREE.Vector3(0, 0, 0);
            
            // 1. Setup Scene
            this.scene = new THREE.Scene();
            this.scene.background = null; 
            
            this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
            
            this.menuGroup = new THREE.Group();
            this.scene.add(this.menuGroup);
            
            // 2. Dedicated Renderer
            const canvas = document.getElementById('menu-canvas');
            if (canvas) {
                this.renderer = new THREE.WebGLRenderer({
                    canvas: canvas,
                    alpha: true, // Crucial for transparency
                    antialias: true
                });
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                this.renderer.outputColorSpace = THREE.SRGBColorSpace;
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            } else {
                console.error("MenuRenderer: #menu-canvas not found! Retrying deferred init...");
            }
            
            // 3. Lighting
            const keyLight = new THREE.DirectionalLight(0xffffff, 4.0);
            keyLight.position.set(1, 2, 2);
            keyLight.castShadow = true; 
            keyLight.shadow.mapSize.width = 1024;
            keyLight.shadow.mapSize.height = 1024;
            this.scene.add(keyLight);
            
            const rimLight = new THREE.SpotLight(0x4488ff, 7.0);
            rimLight.position.set(-2, 1, -2);
            rimLight.lookAt(0, 0, 0);
            this.scene.add(rimLight);
            
            const fillLight = new THREE.PointLight(0xffaa55, 2.0);
            fillLight.position.set(2, 0, -1);
            this.scene.add(fillLight);
            
            const ambient = new THREE.AmbientLight(0x444444);
            this.scene.add(ambient);
            
            // Input Handlers
            this._onMouseDown = this._onMouseDown.bind(this);
            this._onMouseMove = this._onMouseMove.bind(this);
            this._onMouseUp = this._onMouseUp.bind(this);
            this._onWheel = this._onWheel.bind(this);
            this._onResize = this._onResize.bind(this);
            
            window.addEventListener('resize', this._onResize);
        },
        
        setTargetElement(elementId) {
            this.targetElementId = elementId;
            this.resetFocus();
        },
        
        // Focus camera on a specific local point (e.g. attachment node)
        focusOn(localTargetPos) {
            if (!this.gunMesh || !this.lookAtTarget) return;
            
            // Transform local target to world space (considering gun rotation)
            const worldTarget = localTargetPos.clone().applyMatrix4(this.gunMesh.matrixWorld);
            
            this.lookAtTarget.copy(worldTarget);
            this.targetRadius = 0.35; // Zoom in
            this.isFocused = true;
        },
        
        resetFocus() {
            if (this.lookAtTarget) this.lookAtTarget.set(0, 0, 0);
            this.isFocused = false;
            
            if (this.targetElementId === 'ls-preview-container') { // Gunsmith
                this.targetRadius = 0.6;
                this.targetPitch = 0.3;
            } else { // Main Menu
                this.targetRadius = 0.9;
                this.targetPitch = 0.15;
            }
            // Do NOT snap. Let update() lerp to these new targets.
        },
        
        start() {
            if (this.active) return;
            this.active = true;
            this.menuGroup.visible = true;
            
            const canvas = document.getElementById('menu-canvas');
            if (canvas) canvas.classList.add('active');
            
            document.addEventListener('mousedown', this._onMouseDown);
            document.addEventListener('mousemove', this._onMouseMove);
            document.addEventListener('mouseup', this._onMouseUp);
            document.addEventListener('wheel', this._onWheel, { passive: false });
        },
        
        stop() {
            if (!this.active) return;
            this.active = false;
            
            if (this.gunMesh) {
                this.menuGroup.remove(this.gunMesh);
                this.gunMesh = null;
            }
            
            const canvas = document.getElementById('menu-canvas');
            if (canvas) {
                canvas.classList.remove('active');
                if (this.renderer) this.renderer.clear();
            }
            
            this.targetElementId = null;
            
            document.removeEventListener('mousedown', this._onMouseDown);
            document.removeEventListener('mousemove', this._onMouseMove);
            document.removeEventListener('mouseup', this._onMouseUp);
            document.removeEventListener('wheel', this._onWheel);
        },
        
        spawnWeapon(weaponDef) {
            // Robust Clear: Ensure no previous meshes exist
            while(this.menuGroup.children.length > 0){ 
                this.menuGroup.remove(this.menuGroup.children[0]); 
            }
            this.gunMesh = null;

            if (!weaponDef || !weaponDef.buildMesh) return;
            
            const built = weaponDef.buildMesh.call(weaponDef);
            this.gunMesh = built.mesh;
            
            this.gunMesh.position.set(0, 0, 0);
            this.gunMesh.rotation.set(0, Math.PI / 2, 0);
            
            this.menuGroup.add(this.gunMesh);
            this.gunMesh.updateMatrixWorld();
        },
        
        update(dt) {
            if (!this.active) return;
            if (!this.lookAtTarget || !this.currentLookAt) return; 
            
            // Auto Rotation (Only in Main Menu, and when NOT interacting/focused)
            if (!this.isDragging && !this.isFocused && this.targetElementId === 'menu-weapon-preview') { 
                this.targetAngle += dt * 0.15; 
            }
            
            // --- SMOOTHING (MOMENTUM/FOLLOWING) ---
            const smoothSpeed = dt * 8.0; // Adjustable "tightness" of the follow
            
            this.cameraAngle = THREE.MathUtils.lerp(this.cameraAngle, this.targetAngle, smoothSpeed);
            this.cameraPitch = THREE.MathUtils.lerp(this.cameraPitch, this.targetPitch, smoothSpeed);
            this.radius = THREE.MathUtils.lerp(this.radius, this.targetRadius, smoothSpeed);
            this.currentLookAt.lerp(this.lookAtTarget, smoothSpeed);
            
            // Orbit Math
            const yOffset = Math.sin(this.cameraPitch) * this.radius;
            const hRadius = Math.cos(this.cameraPitch) * this.radius; 
            const xOffset = Math.sin(this.cameraAngle) * hRadius;
            const zOffset = Math.cos(this.cameraAngle) * hRadius;
            
            this.camera.position.set(
                this.currentLookAt.x + xOffset,
                this.currentLookAt.y + yOffset,
                this.currentLookAt.z + zOffset
            );
            
            this.camera.lookAt(this.currentLookAt);
            this.render(); 
        },
        
        render() {
            if (!this.active || !this.renderer) return;
            
            this.renderer.clear();

            if (!this.targetElementId) {
                this.renderer.render(this.scene, this.camera);
                return;
            }
            
            const element = document.getElementById(this.targetElementId);
            if (!element) return;
            
            const rect = element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            
            const width = rect.width;
            const height = rect.height;
            const left = rect.left;
            const bottom = window.innerHeight - rect.bottom;
            
            this.renderer.setScissorTest(true);
            this.renderer.setViewport(left, bottom, width, height);
            this.renderer.setScissor(left, bottom, width, height);
            
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            
            this.renderer.render(this.scene, this.camera);
            
            this.renderer.setScissorTest(false);
        },
        
        _onResize() {
            if (this.renderer) {
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            }
        },

        // --- INPUT ---
        _onMouseDown(e) {
            if (this.targetElementId) {
                const el = document.getElementById(this.targetElementId);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    if (e.clientX < rect.left || e.clientX > rect.right || 
                        e.clientY < rect.top || e.clientY > rect.bottom) {
                        return;
                    }
                }
            }
            if (e.button === 0) {
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        },
        
        _onMouseMove(e) {
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                const sensitivity = 0.005;
                
                // Update TARGETS, not current values directly
                this.targetAngle -= dx * sensitivity;
                this.targetPitch += dy * sensitivity;
                this.targetPitch = Math.max(-1.0, Math.min(1.0, this.targetPitch));
                
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        },
        
        _onMouseUp() { this.isDragging = false; },
        
        _onWheel(e) {
             // Block Manual Zoom if Locked on Attachment
             if (this.isFocused) return;
             
             // Allow UI scrolling to propagate if mouse is over UI
             if (e.target.closest('.settings-content') || e.target.closest('.team-list') || e.target.closest('.keybinds-container') || e.target.closest('.overlay-content')) {
                 return;
             }

             if (this.targetElementId) {
                const el = document.getElementById(this.targetElementId);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    if (e.clientX >= rect.left && e.clientX <= rect.right && 
                        e.clientY >= rect.top && e.clientY <= rect.bottom) {
                         e.preventDefault();
                         const sensitivity = 0.001;
                         // Update TARGET radius
                         this.targetRadius += e.deltaY * sensitivity;
                         this.targetRadius = Math.max(0.2, Math.min(1.5, this.targetRadius));
                    }
                }
            }
        }
    };
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.MenuRenderer = MenuRenderer;
})();
