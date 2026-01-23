// js/ui/tactical_map/tactical_camera.js
(function() {
    const TacticalCamera = {
        camera: null,
        isActive: false,
        
        // Pan/Zoom State
        zoomLevel: 1.0,
        panOffset: { x: 0, z: 0 },
        isDragging: false,
        lastMouse: { x: 0, y: 0 },
        
        // Configuration
        minZoom: 0.5,
        maxZoom: 3.0,
        maxPan: 50, // World units limit
        frustumSize: 100, // Base size

        init() {
            // Frustum size 100 units wide
            const aspect = window.innerWidth / window.innerHeight;
            
            this.camera = new THREE.OrthographicCamera(
                this.frustumSize * aspect / -2,
                this.frustumSize * aspect / 2,
                this.frustumSize / 2,
                this.frustumSize / -2,
                1,
                1000
            );
            
            // Looking straight down
            this.camera.position.set(0, 100, 0);
            this.camera.lookAt(0, 0, 0);
            this.camera.rotation.z = Math.PI; 
            
            window.addEventListener('resize', () => this.onResize());
            
            // Bind input handlers
            this._onWheel = this._onWheel.bind(this);
            this._onMouseDown = this._onMouseDown.bind(this);
            this._onMouseMove = this._onMouseMove.bind(this);
            this._onMouseUp = this._onMouseUp.bind(this);
        },

        activate() {
            this.isActive = true;
            this.onResize(); 
            
            // Add listeners
            window.addEventListener('wheel', this._onWheel, { passive: false });
            window.addEventListener('mousedown', this._onMouseDown);
            window.addEventListener('mousemove', this._onMouseMove);
            window.addEventListener('mouseup', this._onMouseUp);
            window.addEventListener('mouseleave', this._onMouseUp);
        },

        deactivate() {
            this.isActive = false;
            
            // Remove listeners
            window.removeEventListener('wheel', this._onWheel);
            window.removeEventListener('mousedown', this._onMouseDown);
            window.removeEventListener('mousemove', this._onMouseMove);
            window.removeEventListener('mouseup', this._onMouseUp);
            window.removeEventListener('mouseleave', this._onMouseUp);
        },
        
        setZoom(level) {
            this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, level));
            this.updateCameraTransform();
        },
        
        _onWheel(e) {
            if (!this.isActive) return;
            
            // Allow UI scrolling to propagate if mouse is over UI
            if (e.target.closest('.settings-content') || e.target.closest('.team-list') || e.target.closest('.keybinds-container') || e.target.closest('.overlay-content')) {
                return;
            }
            
            // Check if user is scrolling inside a UI element (like settings or team list)
            if (e.target && (e.target.closest('.settings-content') || e.target.closest('.team-list'))) {
                return; // Let standard scrolling happen
            }
            
            e.preventDefault();
            
            const sensitivity = 0.001;
            const delta = e.deltaY * sensitivity;
            
            // Invert logic: Scroll Up (negative delta) = Zoom In (increase zoom val)
            this.zoomLevel -= delta; 
            this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel));
            
            this.updateCameraTransform();
        },
        
        _onMouseDown(e) {
            if (!this.isActive || e.button !== 0) return; // Left click only
            
            // Don't drag map if clicking UI
            if (e.target && (e.target.closest('.team-container') || e.target.closest('.settings-panel') || e.target.closest('button'))) return;

            this.isDragging = true;
            this.lastMouse.x = e.clientX;
            this.lastMouse.y = e.clientY;
        },
        
        _onMouseMove(e) {
            if (!this.isActive || !this.isDragging) return;
            
            const dx = e.clientX - this.lastMouse.x;
            const dy = e.clientY - this.lastMouse.y;
            
            this.lastMouse.x = e.clientX;
            this.lastMouse.y = e.clientY;
            
            // Convert pixels to world units
            const viewHeight = this.frustumSize / this.zoomLevel;
            const unitsPerPixel = viewHeight / window.innerHeight;
            
            // Ortho camera rotated 180 (PI) on Z:
            // Mouse X moves World X (inverted due to rot)
            // Mouse Y moves World Z (inverted)
            
            this.panOffset.x += dx * unitsPerPixel; 
            this.panOffset.z -= dy * unitsPerPixel; 
            
            // Clamp Pan (keep some part of map in view)
            this.panOffset.x = Math.max(-this.maxPan, Math.min(this.maxPan, this.panOffset.x));
            this.panOffset.z = Math.max(-this.maxPan, Math.min(this.maxPan, this.panOffset.z));
            
            this.updateCameraTransform();
        },
        
        _onMouseUp() {
            this.isDragging = false;
        },

        updateCameraTransform() {
            if (!this.camera) return;
            
            this.camera.zoom = this.zoomLevel;
            this.camera.position.x = -this.panOffset.x;
            this.camera.position.z = this.panOffset.z;
            this.camera.updateProjectionMatrix();
        },

        onResize() {
            if (!this.camera) return;
            const aspect = window.innerWidth / window.innerHeight;
            
            this.camera.left = -this.frustumSize * aspect / 2;
            this.camera.right = this.frustumSize * aspect / 2;
            this.camera.top = this.frustumSize / 2;
            this.camera.bottom = -this.frustumSize / 2;
            
            this.updateCameraTransform();
        }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.TacticalCamera = TacticalCamera;
})();