
// js/visual/particle_manager.js
(function() {
    const ParticleManager = {
        scene: null,
        
        // Mesh & Data Pools
        maxSparks: 500, sparkMesh: null, sparkData: [], sparkIndex: 0,
        maxDebris: 300, debrisMesh: null, debrisData: [], debrisIndex: 0,
        
        smokePool: [], smokePoolSize: 100, smokeIndex: 0, smokeTexture: null,
        shellPool: [], shellPoolSize: 120, shellIndex: 0, 
        droppedMags: [], 
        
        // Settings
        casingsEnabled: true, 
        lightingEnabled: true,
        impactParticleCount: 12, 
        physicsStep: 1, 
        shellShadows: true,
        useCannonShells: false, 
        
        // Resources
        dummyObj: null, 
        attrAlpha: null, 
        attrAlphaDebris: null, 
        raycaster: null, 
        frameId: 0,
        
        // Geometries/Materials for Shells
        shotgunShellGeoBody: null, shotgunShellGeoHead: null, 
        rifleShellGroup: null, // Template for rifle shells
        matShellRed: null, matShellBrass: null, matShellGold: null,
        
        init(scene) {
            console.log('ParticleManager: Initializing System...');
            this.scene = scene;
            this.raycaster = new THREE.Raycaster();
            this.dummyObj = new THREE.Object3D();
            
            this.initSparks(); 
            this.initDebris(); 
            this.initShells(); 
            this.initSmoke();
            
            console.log('ParticleManager: ✓ Ready');
        },
        
        initSparks() {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            this.attrAlpha = new THREE.InstancedBufferAttribute(new Float32Array(this.maxSparks), 1);
            this.attrAlpha.setUsage(THREE.DynamicDrawUsage);
            geometry.setAttribute('aAlpha', this.attrAlpha);
            
            // Sparks use Additive Blending (Glowing)
            const material = new THREE.MeshBasicMaterial({ 
                color: 0xffffff, 
                transparent: true, 
                opacity: 1.0, 
                depthWrite: false, 
                blending: THREE.AdditiveBlending 
            });
            this.injectAlphaShader(material);
            
            this.sparkMesh = new THREE.InstancedMesh(geometry, material, this.maxSparks);
            this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.sparkMesh.frustumCulled = false; 
            this.scene.add(this.sparkMesh);
            
            this.sparkData = this.createParticleData(this.maxSparks);
            this.resetMesh(this.sparkMesh, this.attrAlpha, this.maxSparks);
        },
        
        initDebris() {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            this.attrAlphaDebris = new THREE.InstancedBufferAttribute(new Float32Array(this.maxDebris), 1);
            this.attrAlphaDebris.setUsage(THREE.DynamicDrawUsage);
            geometry.setAttribute('aAlpha', this.attrAlphaDebris);
            
            // Debris uses Normal Blending (Solid chunks)
            const material = new THREE.MeshPhongMaterial({ 
                color: 0xffffff, 
                transparent: true, 
                opacity: 1.0, 
                depthWrite: true, 
                blending: THREE.NormalBlending, 
                shininess: 30, 
                emissive: 0x111111 
            });
            this.injectAlphaShader(material);
            
            this.debrisMesh = new THREE.InstancedMesh(geometry, material, this.maxDebris);
            this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.debrisMesh.frustumCulled = false; 
            this.scene.add(this.debrisMesh);
            
            this.debrisData = this.createParticleData(this.maxDebris);
            this.resetMesh(this.debrisMesh, this.attrAlphaDebris, this.maxDebris);
        },
        
        initSmoke() {
            const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
            const ctx = canvas.getContext('2d');
            const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.5)'); 
            grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.2)'); 
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
            
            this.smokeTexture = new THREE.CanvasTexture(canvas);
            const mat = new THREE.SpriteMaterial({ map: this.smokeTexture, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.NormalBlending });
            
            for(let i=0; i<this.smokePoolSize; i++) {
                const s = new THREE.Sprite(mat.clone()); 
                s.visible = false; s.scale.set(1,1,1); this.scene.add(s);
                this.smokePool.push({ sprite: s, active: false, life: 0, maxLife: 1, velocity: new THREE.Vector3(), expandRate: 0, startScale: 1 });
            }
        },
        
        initShells() {
            // Shotgun Geometry
            this.shotgunShellGeoBody = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8); this.shotgunShellGeoBody.rotateZ(Math.PI / 2); this.shotgunShellGeoBody.translate(0.01, 0, 0);
            this.shotgunShellGeoHead = new THREE.CylinderGeometry(0.0125, 0.0125, 0.015, 8); this.shotgunShellGeoHead.rotateZ(Math.PI / 2); this.shotgunShellGeoHead.translate(-0.022, 0, 0);
            
            // Materials
            this.matShellRed = new THREE.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.8, metalness: 0.1 });
            this.matShellBrass = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.9, emissive: 0xffaa00, emissiveIntensity: 0.5 });
            this.matShellGold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 1.0, emissive: 0xff4400, emissiveIntensity: 2.0 });
            
            // Rifle Geometry (7.62mm style)
            const rifleGroupTemplate = new THREE.Group();
            const rBody = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 8).rotateZ(Math.PI/2), this.matShellBrass);
            const rNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.01, 8).rotateZ(Math.PI/2), this.matShellBrass);
            rNeck.position.x = 0.025;
            const rRim = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.002, 8).rotateZ(Math.PI/2), this.matShellBrass);
            rRim.position.x = -0.021;
            rifleGroupTemplate.add(rBody); rifleGroupTemplate.add(rNeck); rifleGroupTemplate.add(rRim);

            this.shellPool = [];
            for (let i = 0; i < this.shellPoolSize; i++) {
                const wrapper = new THREE.Group();
                
                // Pistol
                const pGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.02, 8);
                const pMesh = new THREE.Mesh(pGeo, this.matShellGold); 
                pMesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI); 
                pMesh.castShadow = true; pMesh.name = "PISTOL"; 
                wrapper.add(pMesh);
                
                // Shotgun
                const sGroup = new THREE.Group();
                const body = new THREE.Mesh(this.shotgunShellGeoBody, this.matShellRed); body.castShadow = true; sGroup.add(body);
                const head = new THREE.Mesh(this.shotgunShellGeoHead, this.matShellBrass); head.castShadow = true; sGroup.add(head);
                sGroup.rotateY(Math.PI); sGroup.name = "SHOTGUN"; sGroup.visible = false; 
                wrapper.add(sGroup);
                
                // Rifle
                const rGroup = rifleGroupTemplate.clone();
                rGroup.name = "RIFLE"; rGroup.visible = false;
                rGroup.children.forEach(c => c.castShadow = true);
                wrapper.add(rGroup);

                wrapper.visible = false; wrapper.position.set(0, -500, 0); 
                this.scene.add(wrapper);
                this.shellPool.push({ mesh: wrapper, pistolMesh: pMesh, shotgunMesh: sGroup, rifleMesh: rGroup, velocity: new THREE.Vector3(), rotVel: new THREE.Vector3(), life: 0, active: false, isSleeping: false, mode: 'simple', body: null });
            }
        },
        
        injectAlphaShader(material) {
            material.onBeforeCompile = (shader) => {
                shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;');
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAlpha = aAlpha;');
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;');
                shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vAlpha;');
            };
        },
        
        createParticleData(count) {
            const arr = []; for(let i=0; i<count; i++) arr.push({ active: false, pos: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, maxLife: 1, gravity: 0, sizeDecay: 1, currentSize: 0.1, color: new THREE.Color(1,1,1) }); return arr;
        },
        
        resetMesh(mesh, attr, count) {
            if (!mesh) return;
            for(let i=0; i<count; i++) { this.dummyObj.position.set(0, -1000, 0); this.dummyObj.updateMatrix(); mesh.setMatrixAt(i, this.dummyObj.matrix); attr.setX(i, 0); }
            mesh.instanceMatrix.needsUpdate = true; attr.needsUpdate = true;
        },
        
        setLightingEnabled(enabled) { this.lightingEnabled = enabled; },
        
        setConfig(config) { 
            if (config.impactCount !== undefined) this.impactParticleCount = config.impactCount; 
            if (config.physicsStep !== undefined) this.physicsStep = config.physicsStep; 
            if (config.shellShadows !== undefined) { 
                this.shellShadows = config.shellShadows; 
                this.shellPool.forEach(s => { s.pistolMesh.castShadow = this.shellShadows; s.shotgunMesh.children.forEach(c => c.castShadow = this.shellShadows); s.rifleMesh.children.forEach(c => c.castShadow = this.shellShadows); }); 
            } 
            if (config.useCannonShells !== undefined) {
                this.useCannonShells = config.useCannonShells;
            }
        },
        
        clear() { 
            this.droppedMags.forEach(m => { this.scene.remove(m.mesh); if (m.mesh.geometry) m.mesh.geometry.dispose(); if (m.mesh.material) m.mesh.material.dispose(); }); 
            this.droppedMags = []; 
            
            // Clean shells and physics
            this.shellPool.forEach(s => { 
                s.active = false; s.life = 0; s.isSleeping = false; s.mesh.visible = false; s.mesh.position.set(0, -500, 0); 
                if (s.body && window.TacticalShooter.RagdollManager && window.TacticalShooter.RagdollManager.world) {
                     window.TacticalShooter.RagdollManager.world.removeBody(s.body);
                }
            }); 
            
            this.smokePool.forEach(s => { s.active = false; s.sprite.visible = false; }); 
            this.resetMesh(this.sparkMesh, this.attrAlpha, this.maxSparks); 
            this.resetMesh(this.debrisMesh, this.attrAlphaDebris, this.maxDebris); 
        },
        
        // --- ANIMATION LOOP ---
        update(dt) {
            // 1. Update Sparks
            let updateSparks = false;
            for(let i=0; i<this.maxSparks; i++) {
                const p = this.sparkData[i];
                if(p.active) {
                    p.life -= dt;
                    if(p.life <= 0) {
                        p.active = false;
                        p.currentSize = 0;
                        this.attrAlpha.setX(i, 0);
                    } else {
                        p.velocity.y += p.gravity * dt;
                        p.pos.addScaledVector(p.velocity, dt);
                        p.currentSize *= Math.pow(p.sizeDecay, dt * 60); // frame-rate independent decay
                        this.attrAlpha.setX(i, p.life/p.maxLife);
                    }
                    this.updateInstance(this.sparkMesh, i, p);
                    updateSparks = true;
                }
            }
            if(updateSparks) {
                this.sparkMesh.instanceMatrix.needsUpdate = true;
                this.attrAlpha.needsUpdate = true;
            }

            // 2. Update Debris
            let updateDebris = false;
            for(let i=0; i<this.maxDebris; i++) {
                const p = this.debrisData[i];
                if(p.active) {
                    p.life -= dt;
                    if(p.life <= 0) {
                        p.active = false;
                        p.currentSize = 0;
                        this.attrAlphaDebris.setX(i, 0);
                    } else {
                        p.velocity.y += p.gravity * dt;
                        p.pos.addScaledVector(p.velocity, dt);
                        p.currentSize *= Math.pow(p.sizeDecay, dt * 60);
                        
                        // Floor Collision
                        if(p.pos.y < 0) {
                            p.pos.y = 0;
                            p.velocity.y *= -0.5;
                            p.velocity.x *= 0.8;
                            p.velocity.z *= 0.8;
                        }
                        this.attrAlphaDebris.setX(i, p.life/p.maxLife);
                    }
                    this.updateInstance(this.debrisMesh, i, p);
                    updateDebris = true;
                }
            }
            if(updateDebris) {
                this.debrisMesh.instanceMatrix.needsUpdate = true;
                this.attrAlphaDebris.needsUpdate = true;
            }

            // 3. Update Smoke
            this.smokePool.forEach(s => {
                if(s.active) {
                    s.life -= dt;
                    if(s.life <= 0) {
                        s.active = false;
                        s.sprite.visible = false;
                    } else {
                        s.sprite.position.addScaledVector(s.velocity, dt);
                        
                        const progress = 1.0 - (s.life / s.maxLife);
                        const scale = s.startScale + (s.endScale - s.startScale) * progress;
                        s.sprite.scale.set(scale, scale, 1);
                        
                        // Opacity Fade: Ramp In then Fade Out
                        let opacity = 0;
                        if(progress < 0.2) opacity = (progress / 0.2) * s.opacityPeak;
                        else opacity = (s.life / (s.maxLife * 0.8)) * s.opacityPeak;
                        s.sprite.material.opacity = Math.max(0, opacity);
                    }
                }
            });

            // 4. Update Shells
            this.shellPool.forEach(s => {
                if (!s.active) return;
                
                // Always decrement life to ensure cleanup
                s.life -= dt;
                
                if (s.life <= 0) {
                    s.active = false;
                    s.mesh.visible = false;
                    s.mesh.position.set(0, -500, 0); // Hide away
                    // Cleanup physics body if cannon mode
                    if (s.mode === 'cannon' && s.body && window.TacticalShooter.RagdollManager && window.TacticalShooter.RagdollManager.world) {
                        window.TacticalShooter.RagdollManager.world.removeBody(s.body);
                        s.body = null;
                    }
                    return;
                }
                
                // Fade out scaling effect in last second
                if (s.life < 1.0) {
                    const scale = Math.max(0.01, s.life);
                    s.mesh.scale.set(scale, scale, scale);
                }

                if (s.mode === 'simple' && !s.isSleeping) {
                    s.velocity.y -= 9.8 * dt; 
                    s.mesh.position.addScaledVector(s.velocity, dt);
                    s.mesh.rotation.x += s.rotVel.x * dt;
                    s.mesh.rotation.y += s.rotVel.y * dt;
                    s.mesh.rotation.z += s.rotVel.z * dt;
                    
                    // Simple Floor Bounce
                    if(s.mesh.position.y < 0.01) {
                        s.mesh.position.y = 0.01;
                        s.velocity.y *= -0.5;
                        s.velocity.x *= 0.6;
                        s.velocity.z *= 0.6;
                        s.rotVel.multiplyScalar(0.5);
                        if(s.velocity.lengthSq() < 0.01) s.isSleeping = true;
                    }
                }
                // Sync Physics Body to Mesh for Cannon Shells
                else if (s.mode === 'cannon' && s.body) {
                    s.mesh.position.copy(s.body.position);
                    s.mesh.quaternion.copy(s.body.quaternion);
                }
            });

            // 5. Update Dropped Mags
            for(let i=this.droppedMags.length-1; i>=0; i--) {
                const m = this.droppedMags[i];
                m.life -= dt;
                if(m.life <= 0) {
                    this.scene.remove(m.mesh);
                    if(m.mesh.geometry) m.mesh.geometry.dispose();
                    if(m.mesh.material) m.mesh.material.dispose();
                    this.droppedMags.splice(i, 1);
                } else {
                    m.velocity.y -= 9.8 * dt;
                    m.mesh.position.addScaledVector(m.velocity, dt);
                    m.mesh.rotation.x += m.rotVel.x * dt;
                    m.mesh.rotation.y += m.rotVel.y * dt;
                    
                    if(m.mesh.position.y < 0.05) {
                        m.mesh.position.y = 0.05;
                        m.velocity.set(0,0,0);
                        m.rotVel.set(0,0,0);
                    }
                }
            }
        },

        updateInstance(mesh, index, p) {
            if(p.active) {
                this.dummyObj.position.copy(p.pos);
                this.dummyObj.scale.set(p.currentSize, p.currentSize, p.currentSize);
                // Rotate to face camera? Or random spin?
                // Just random spin based on index for now
                this.dummyObj.rotation.set(index, index*2, index*3); 
                this.dummyObj.updateMatrix();
                mesh.setMatrixAt(index, this.dummyObj.matrix);
            } else {
                this.dummyObj.position.set(0, -1000, 0);
                this.dummyObj.updateMatrix();
                mesh.setMatrixAt(index, this.dummyObj.matrix);
            }
        },
        
        // --- PUBLIC API METHODS (Called by WeaponManager/GunRenderer) ---

        createImpactSparks(pos, normal, config) {
            // Default config if null/undefined
            const defaults = { 
                count: 8, 
                color: 0xffffaa, 
                size: 0.1, 
                speed: 5.0, 
                speedVariance: 2.0, 
                gravity: -12.0, 
                lifetime: 0.4, 
                sizeDecay: 0.92,
                useDebris: false // Default to glowing sparks
            };
            const cfg = { ...defaults, ...(config || {}) };
            
            if (cfg.useDebris) {
                // Use Debris Mesh (Normal Blending - for chips, dust, blood, etc)
                this.spawnParticles(this.debrisMesh, this.debrisData, this.maxDebris, this.attrAlphaDebris, pos, normal, cfg);
            } else {
                // Use Spark Mesh (Additive Blending - for glowing sparks)
                this.spawnParticles(this.sparkMesh, this.sparkData, this.maxSparks, this.attrAlpha, pos, normal, cfg);
            }
        },

        createBloodSparks(pos, normal) {
            const bloodConfig = {
                count: 6,
                lifetime: 0.5,
                speed: 2.0,
                speedVariance: 1.0,
                gravity: -18.0, // Drops fast
                color: 0xaa0000, // Deep Red
                size: 0.12,
                sizeDecay: 0.98
            };
            
            // Use Debris Mesh (Normal Blending - looks like liquid/chunks)
            this.spawnParticles(this.debrisMesh, this.debrisData, this.maxDebris, this.attrAlphaDebris, pos, normal, bloodConfig);
        },

        createGrenadeExplosion(pos, normal, materialType) {
            // 1. Core Blast Fire (Quick orange burst)
            this.createImpactDust(pos, normal, {
                count: 4,
                lifetime: 0.4,
                sizeStart: 0.5,
                sizeEnd: 2.5,
                speed: 3.0,
                opacity: 0.8,
                color: 0xffaa33 // Orange fire tint
            });

            // 2. Lingering Smoke Column (Rising)
            const smokeColor = 0x555555; 
            // Spawn larger, longer-lived smoke particles
            for(let i=0; i<6; i++) {
                const s = this.smokePool[this.smokeIndex]; 
                this.smokeIndex = (this.smokeIndex + 1) % this.smokePoolSize;
                
                s.active = true;
                s.life = 2.0 + Math.random() * 1.5; // Lasts 2-3.5 seconds
                s.maxLife = s.life;
                s.sprite.visible = true;
                // Scatter slightly around center
                s.sprite.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5), 0.5, (Math.random()-0.5)));
                
                s.startScale = 1.0;
                s.endScale = 4.0 + (Math.random() * 2.0); // Grow big
                s.startOpacity = 0.5;
                s.opacityPeak = 0.5;
                s.sprite.material.color.setHex(smokeColor);
                s.sprite.material.rotation = Math.random() * Math.PI * 2;
                
                // Rising velocity with slight drift
                const baseRise = (2.0 + Math.random() * 2.0) * 0.5;
                
                s.velocity.set(
                    (Math.random()-0.5) * 1.5,
                    baseRise, 
                    (Math.random()-0.5) * 1.5
                );
            }

            // 3. Material Specific Debris
            if (materialType === 'metal') {
                // Sparks!
                this.createImpactSparks(pos, normal, {
                    count: 30,
                    speed: 15.0,
                    speedVariance: 5.0,
                    lifetime: 0.8,
                    color: 0xffcc33, // Gold/Yellow
                    size: 0.15,
                    gravity: -15.0
                });
            } 
            else if (materialType === 'wood') {
                // Splinters (Brown Debris)
                this.spawnParticles(this.debrisMesh, this.debrisData, this.maxDebris, this.attrAlphaDebris, pos, normal, {
                    count: 15,
                    lifetime: 1.5,
                    speed: 8.0,
                    speedVariance: 4.0,
                    gravity: -9.8,
                    color: 0x8b5a2b, // Wood Brown
                    size: 0.12,
                    sizeDecay: 0.98
                });
                // Brown Dust
                this.createImpactDust(pos, normal, {
                    count: 8,
                    lifetime: 1.5,
                    sizeStart: 1.0,
                    sizeEnd: 3.0,
                    speed: 3.0,
                    color: 0x8b5a2b,
                    opacity: 0.4
                });
            }
            else {
                // Concrete/Dirt (Default)
                // Grey Chunks
                this.spawnParticles(this.debrisMesh, this.debrisData, this.maxDebris, this.attrAlphaDebris, pos, normal, {
                    count: 20,
                    lifetime: 1.5,
                    speed: 10.0,
                    speedVariance: 5.0,
                    gravity: -9.8,
                    color: 0x555555, // Grey
                    size: 0.15,
                    sizeDecay: 0.98
                });
                // Grey Dust Cloud
                this.createImpactDust(pos, normal, {
                    count: 10,
                    lifetime: 2.0,
                    sizeStart: 1.0,
                    sizeEnd: 4.0,
                    speed: 4.0,
                    color: 0x666666,
                    opacity: 0.5
                });
                // Some Sparks
                this.createImpactSparks(pos, normal, {
                    count: 10,
                    speed: 12.0,
                    speedVariance: 4.0,
                    lifetime: 0.5,
                    color: 0xffaa00
                });
            }
        },

        createMuzzleSmoke(pos, dir) {
            if (this.impactParticleCount < 12) return;
            const Effects = window.TacticalShooter.GameData.Effects || {};
            const cfg = Effects.MuzzleSmoke || { count: 6, lifetime: 0.35, sizeStart: 0.02, sizeEnd: 0.6, velocity: 6.0, forwardSpeed: 2.0, opacityStart: 0.05, opacityPeak: 0.3, color: 0x888888 };
            
            // Axis logic for spread ring
            const axis = new THREE.Vector3(0, 1, 0); if (Math.abs(dir.y) > 0.9) axis.set(1, 0, 0);
            const right = new THREE.Vector3().crossVectors(dir, axis).normalize();
            const up = new THREE.Vector3().crossVectors(right, dir).normalize();
            
            for(let i=0; i<cfg.count; i++) {
                const s = this.smokePool[this.smokeIndex]; 
                this.smokeIndex = (this.smokeIndex + 1) % this.smokePoolSize;
                
                const angle = Math.random() * Math.PI * 2; 
                const speed = cfg.velocity * (0.8 + Math.random()*0.4);
                
                const radialDir = right.clone().multiplyScalar(Math.cos(angle)).add(up.clone().multiplyScalar(Math.sin(angle)));
                const vel = radialDir.multiplyScalar(speed).add(dir.clone().multiplyScalar(cfg.forwardSpeed));
                
                s.active = true; 
                s.life = cfg.lifetime * (0.8 + Math.random()*0.4); 
                s.maxLife = s.life;
                s.sprite.visible = true; 
                s.sprite.position.copy(pos); 
                
                s.startScale = cfg.sizeStart; 
                s.endScale = cfg.sizeEnd; 
                s.startOpacity = cfg.opacityStart; 
                s.opacityPeak = cfg.opacityPeak;
                
                s.sprite.material.color.setHex(cfg.color); 
                s.sprite.material.rotation = Math.random() * Math.PI * 2;
                s.velocity.copy(vel);
            }
        },
        
        createBarrelWisp(pos, dir, intensity = 1.0) {
            if (this.impactParticleCount < 12) return;
            const Effects = window.TacticalShooter.GameData.Effects || {};
            const cfg = Effects.BarrelSmoke || { lifetime: 2.5, sizeStart: 0.03, sizeEnd: 0.4, speed: 0.4, drift: 0.1, opacity: 0.25, color: 0xcccccc };
            
            const s = this.smokePool[this.smokeIndex]; 
            this.smokeIndex = (this.smokeIndex + 1) % this.smokePoolSize;
            
            s.active = true; 
            s.life = cfg.lifetime * intensity; 
            s.maxLife = s.life;
            s.sprite.visible = true; 
            s.sprite.position.copy(pos);
            
            s.startScale = cfg.sizeStart * intensity; 
            s.endScale = cfg.sizeEnd * intensity; 
            s.startOpacity = cfg.opacity * intensity; 
            s.opacityPeak = s.startOpacity; 
            s.sprite.material.color.setHex(cfg.color);
            
            // Reduced vertical rise for barrel wisp too
            const up = new THREE.Vector3(0, (cfg.speed * intensity) * 0.5, 0); 
            const drift = new THREE.Vector3((Math.random()-0.5)*cfg.drift, 0, (Math.random()-0.5)*cfg.drift);
            s.velocity.copy(up).add(drift);
        },
        
        createImpactDust(pos, normal, config) {
            if (this.impactParticleCount < 12) return;
            const Effects = window.TacticalShooter.GameData.Effects || {};
            const cfg = config || Effects.ImpactDust || { count: 3, lifetime: 0.6, sizeStart: 0.1, sizeEnd: 0.4, speed: 1.5, opacity: 0.3, color: 0x777777 };
            
            for(let i=0; i<cfg.count; i++) {
                const s = this.smokePool[this.smokeIndex]; 
                this.smokeIndex = (this.smokeIndex + 1) % this.smokePoolSize;
                
                s.active = true; 
                s.life = cfg.lifetime * (0.8 + Math.random()*0.4); 
                s.maxLife = s.life; 
                s.sprite.visible = true;
                s.sprite.position.copy(pos).add(normal.clone().multiplyScalar(0.1));
                
                s.startScale = cfg.sizeStart; 
                s.endScale = cfg.sizeEnd; 
                s.startOpacity = cfg.opacity; 
                s.opacityPeak = cfg.opacity;
                s.sprite.material.color.setHex(cfg.color); 
                s.sprite.material.rotation = Math.random() * Math.PI * 2;
                
                const spreadDir = new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).normalize();
                const moveDir = normal.clone().lerp(spreadDir, 0.6).normalize();
                s.velocity.copy(moveDir).multiplyScalar(cfg.speed * (0.5 + Math.random()));
            }
        },

        createShellCasing(position, direction, type = 'pistol') {
            if (!this.casingsEnabled) return; if (type === 'none') return;
            if (window.TacticalShooter.PlayerCamera && window.TacticalShooter.PlayerCamera.camera) { 
                const distSq = window.TacticalShooter.PlayerCamera.camera.position.distanceToSquared(position); 
                if (distSq > 225) return; 
            }
            
            const shell = this.shellPool[this.shellIndex]; 
            this.shellIndex = (this.shellIndex + 1) % this.shellPoolSize;
            
            if (shell.body && window.TacticalShooter.RagdollManager && window.TacticalShooter.RagdollManager.world) {
                window.TacticalShooter.RagdollManager.world.removeBody(shell.body);
            }

            shell.active = true; 
            shell.isSleeping = false; 
            shell.life = 7.5; 
            shell.mesh.visible = true;
            shell.mesh.scale.set(1, 1, 1); 
            
            shell.mesh.position.copy(position); 
            shell.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0), direction.clone().normalize());
            
            // Hide all types first
            shell.pistolMesh.visible = false;
            shell.shotgunMesh.visible = false;
            shell.rifleMesh.visible = false;
            
            if (type === 'shotgun') { 
                shell.shotgunMesh.visible = true; 
                shell.mesh.rotateY(Math.PI); 
            } else if (type === 'rifle') {
                shell.rifleMesh.visible = true;
                // Rifle mesh is Z-aligned, need to handle rotation
                // Base mesh (wrapper) quaternion is set by direction.
                // Child rotation logic can go here.
            } else { 
                shell.pistolMesh.visible = true; 
                shell.pistolMesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI); 
                shell.pistolMesh.material.emissiveIntensity = 2.0; 
            }

            if (this.useCannonShells && window.TacticalShooter.RagdollManager && window.TacticalShooter.RagdollManager.world) {
                shell.mode = 'cannon';
                const world = window.TacticalShooter.RagdollManager.world;
                const CANNON = window.CANNON;

                if (!shell.body) {
                     shell.body = new CANNON.Body({ mass: 0.1, material: window.TacticalShooter.RagdollManager.matBody });
                     shell.body.linearDamping = 0.4;
                     shell.body.angularDamping = 0.4;
                }
                
                shell.body.shapes = [];
                shell.body.shapeOffsets = [];
                shell.body.shapeOrientations = [];
                shell.body.updateMassProperties();
                
                let shape;
                if (type === 'shotgun') {
                    shape = new CANNON.Cylinder(0.01, 0.01, 0.06, 8); 
                } else if (type === 'rifle') {
                    shape = new CANNON.Cylinder(0.006, 0.006, 0.05, 8);
                } else {
                     shape = new CANNON.Cylinder(0.005, 0.005, 0.02, 8);
                }
                
                const q = new CANNON.Quaternion();
                q.setFromAxisAngle(new CANNON.Vec3(1,0,0), Math.PI/2); 
                shell.body.addShape(shape, new CANNON.Vec3(0,0,0), q);

                shell.body.position.set(position.x, position.y, position.z);
                
                shell.body.velocity.set(0,0,0);
                shell.body.angularVelocity.set(0,0,0);
                shell.body.force.set(0,0,0);
                shell.body.torque.set(0,0,0);
                
                // Sleep Config
                shell.body.allowSleep = true;
                shell.body.sleepSpeedLimit = 0.1;
                shell.body.sleepTimeLimit = 0.5;
                
                const speed = 3.0 + Math.random(); 
                const v = direction.clone().multiplyScalar(speed);
                v.x += (Math.random()-0.5); v.y += (Math.random() * 1.5); v.z += (Math.random()-0.5);
                
                shell.body.velocity.set(v.x, v.y, v.z);
                shell.body.angularVelocity.set(Math.random()*15, Math.random()*15, Math.random()*15);
                shell.body.quaternion.set(shell.mesh.quaternion.x, shell.mesh.quaternion.y, shell.mesh.quaternion.z, shell.mesh.quaternion.w);
                
                shell.body.wakeUp(); 
                
                world.addBody(shell.body);

            } else {
                shell.mode = 'simple';
                shell.rotVel.set((Math.random()-0.5)*20, (Math.random()-0.5)*20, (Math.random()-0.5)*20);
                const speed = 3.0 + Math.random(); 
                shell.velocity.copy(direction).multiplyScalar(speed); 
                shell.velocity.x += (Math.random()-0.5) * 1.0; 
                shell.velocity.y += (Math.random()) * 1.5; 
                shell.velocity.z += (Math.random()-0.5) * 1.0;
            }
        },
        
        createDroppingMag(position, quaternion, type='pistol', isExtended=false) {
            if (!this.casingsEnabled) return; if (type === 'none') return;
            const mat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7, metalness: 0.3 });
            let w = 0.022; let d = 0.04; let h = isExtended ? 0.28 : 0.105;
            const geo = new THREE.BoxGeometry(w, h, d); const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position); mesh.quaternion.copy(quaternion); mesh.castShadow = this.shellShadows; mesh.receiveShadow = true; this.scene.add(mesh);
            const down = new THREE.Vector3(0, -1, 0).applyQuaternion(quaternion).normalize(); const vel = down.multiplyScalar(1.5); 
            this.droppedMags.push({ mesh: mesh, velocity: vel, rotVel: new THREE.Vector3(Math.random(), Math.random(), Math.random()), life: 5.0 });
        },
        
        // Internal Helper
        spawnParticles(mesh, data, max, attr, position, normal, config) {
            if (!mesh || config.count <= 0) return; 
            
            const reflection = normal.clone(); 
            const col = new THREE.Color(config.color);
            
            for (let i = 0; i < config.count; i++) {
                // Determine Index
                let currentIndex = 0;
                if (mesh === this.sparkMesh) { 
                    currentIndex = this.sparkIndex; 
                    this.sparkIndex = (this.sparkIndex + 1) % max; 
                } else { 
                    currentIndex = this.debrisIndex; 
                    this.debrisIndex = (this.debrisIndex + 1) % max; 
                }
                
                const p = data[currentIndex]; 
                p.active = true; 
                p.life = config.lifetime * (0.8 + Math.random() * 0.4); 
                p.maxLife = p.life; 
                p.pos.copy(position);
                
                const spreadFactor = 2.0; 
                const randomDir = new THREE.Vector3((Math.random() - 0.5), Math.random(), (Math.random() - 0.5)).normalize().multiplyScalar(spreadFactor);
                const dir = randomDir.lerp(reflection, 0.5).normalize(); 
                
                const speed = config.speed + (Math.random() - 0.5) * (config.speedVariance || 0);
                p.velocity.copy(dir.multiplyScalar(speed)); 
                
                p.gravity = config.gravity; 
                p.currentSize = config.size * (0.8 + Math.random()*0.4); 
                p.sizeDecay = config.sizeDecay; 
                p.color.copy(col);
                
                // Update Instance Matrix immediately
                this.dummyObj.position.copy(p.pos); 
                this.dummyObj.rotation.set(i + p.pos.x, i*2 + p.pos.y, i*3); 
                this.dummyObj.scale.set(p.currentSize, p.currentSize, p.currentSize); 
                this.dummyObj.updateMatrix(); 
                mesh.setMatrixAt(currentIndex, this.dummyObj.matrix); 
                
                if (mesh.setColorAt) mesh.setColorAt(currentIndex, p.color); 
                attr.setX(currentIndex, 1.0);
            }
            
            mesh.instanceMatrix.needsUpdate = true; 
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; 
            attr.needsUpdate = true;
        }
    };
    
    window.TacticalShooter = window.TacticalShooter || {}; 
    window.TacticalShooter.ParticleManager = ParticleManager;
})();
