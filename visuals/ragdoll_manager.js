
// js/visual/ragdoll_manager.js
(function() {
    // --- CANNON.JS RAGDOLL SYSTEM ---
    const RagdollManager = {
        scene: null,
        world: null,
        ragdolls: [],
        staticBodies: [], // Track static map objects to clear them on map switch
        
        // Materials
        matGround: null,
        matBody: null,
        
        init(scene) {
            console.log("RagdollManager: Initializing Cannon.js System...");
            this.scene = scene;
            
            if (typeof CANNON === 'undefined') {
                console.error("RagdollManager: Cannon.js not loaded!");
                return;
            }

            // 1. Init World
            this.world = new CANNON.World();
            this.world.gravity.set(0, -9.8, 0); // Realistic Gravity
            this.world.broadphase = new CANNON.NaiveBroadphase();
            this.world.solver.iterations = 10; // Optimized iterations
            this.world.solver.tolerance = 0.01;
            
            // Enable sleeping globally
            this.world.allowSleep = true;

            // 2. Materials
            this.matGround = new CANNON.Material();
            this.matBody = new CANNON.Material();
            
            // INCREASED FRICTION: Stop sliding (0.6 -> 0.9)
            const contactMat = new CANNON.ContactMaterial(this.matGround, this.matBody, {
                friction: 0.9,    
                restitution: 0.2  // Slight bounce, not too much
            });
            this.world.addContactMaterial(contactMat);

            // 3. Static Environment (Infinite Floor)
            // Note: Map geometry usually handles the floor, but this is a failsafe
            const groundShape = new CANNON.Plane();
            const groundBody = new CANNON.Body({ mass: 0, material: this.matGround });
            groundBody.addShape(groundShape);
            groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
            this.world.addBody(groundBody);
        },
        
        // Call this when loading a new map to clear old walls/floors
        resetStaticGeometry() {
            if (!this.world) return;
            this.staticBodies.forEach(b => this.world.removeBody(b));
            this.staticBodies = [];
            console.log("RagdollManager: Static geometry cleared.");
        },
        
        // Scans a specific Object3D (usually mapGroup) for collidables
        scanStaticGeometry(targetRoot) {
            if (!this.world || !targetRoot) return;
            
            console.log("RagdollManager: Scanning map for physics bodies...");
            let count = 0;
            
            // Force world matrix update to ensure nested objects have correct world transforms
            targetRoot.updateMatrixWorld(true);
            
            targetRoot.traverse(obj => {
                if (obj.userData.collidable && obj.isMesh && !obj.userData.type && !obj.userData.dynamic) {
                    
                    // Ensure bounding box exists
                    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
                    const bbox = obj.geometry.boundingBox;
                    const size = new THREE.Vector3();
                    bbox.getSize(size);
                    const center = new THREE.Vector3();
                    bbox.getCenter(center);
                    
                    // Transform center to WORLD space
                    // Using matrixWorld handles nested groups (like the wooden rooms) correctly
                    center.applyMatrix4(obj.matrixWorld);
                    
                    // Get World Quaternion
                    const quat = new THREE.Quaternion();
                    obj.getWorldQuaternion(quat);
                    
                    // Simple Box Approximation (Half Extents)
                    // Note: This assumes mesh hasn't been scaled non-uniformly in a rotated group
                    // For perfect collision, we'd need to extract world scale, but box approx is usually fine.
                    const worldScale = new THREE.Vector3();
                    obj.getWorldScale(worldScale);
                    const halfExtents = new CANNON.Vec3((size.x * worldScale.x)/2, (size.y * worldScale.y)/2, (size.z * worldScale.z)/2);
                    
                    const shape = new CANNON.Box(halfExtents);
                    const body = new CANNON.Body({ mass: 0, material: this.matGround });
                    
                    body.addShape(shape);
                    body.position.set(center.x, center.y, center.z);
                    body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
                    
                    this.world.addBody(body);
                    this.staticBodies.push(body);
                    count++;
                }
            });
            console.log(`RagdollManager: Added ${count} static bodies.`);
        },

        spawn(unusedMesh, color, startPos, rotationY, impulse, hitOffset, initialVelocity) {
            if (!this.world || !window.TacticalShooter.PlayerModelBuilder) return null;

            const builder = window.TacticalShooter.PlayerModelBuilder;
            const built = builder.build(color || '#555555'); 
            const root = built.mesh;
            const parts = built.parts;
            
            root.position.copy(startPos);
            root.rotation.y = rotationY;
            root.updateMatrixWorld(true);
            
            const bodies = {};
            const meshes = {};
            const constraints = [];
            
            const momentum = new CANNON.Vec3(0, 0, 0);
            if (initialVelocity) {
                momentum.set(initialVelocity.x, initialVelocity.y, initialVelocity.z);
            }

            // Helper: Create Body & Detach Mesh
            const createPart = (name, mesh, size, mass, shapeType = 'box') => {
                const pos = new THREE.Vector3();
                const quat = new THREE.Quaternion();
                mesh.getWorldPosition(pos);
                mesh.getWorldQuaternion(quat);
                
                if(mesh.parent) mesh.parent.remove(mesh);
                this.scene.add(mesh);
                
                mesh.visible = true; 
                mesh.frustumCulled = false;
                
                let shape;
                if (shapeType === 'box') {
                    shape = new CANNON.Box(new CANNON.Vec3(size.x/2, size.y/2, size.z/2));
                } else if (shapeType === 'sphere') {
                    shape = new CANNON.Sphere(size.x); 
                } else {
                    shape = new CANNON.Box(new CANNON.Vec3(size.x/2, size.y/2, size.z/2));
                }
                
                const body = new CANNON.Body({ mass: mass, material: this.matBody });
                body.addShape(shape);
                body.position.set(pos.x, pos.y, pos.z);
                body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
                
                body.velocity.copy(momentum);
                body.linearDamping = 0.5;  // Higher damping for bodies than grenades
                body.angularDamping = 0.5; 
                
                // Sleep Configuration
                body.allowSleep = true;
                body.sleepSpeedLimit = 0.2; 
                body.sleepTimeLimit = 0.5;

                this.world.addBody(body);
                
                bodies[name] = body;
                meshes[name] = mesh;
                
                return body;
            };
            
            // --- PARTS ---
            const hips = createPart('hips', parts.legs, {x:0.28, y:0.15, z:0.2}, 15);
            const torsoMesh = parts.torso.children.find(c => c.isMesh) || parts.torso;
            const torso = createPart('torso', torsoMesh, {x:0.3, y:0.35, z:0.22}, 20);
            const headMesh = parts.head.children.find(c => c.isMesh) || parts.head;
            const head = createPart('head', headMesh, {x:0.15}, 5, 'sphere');
            const lArm = createPart('lArm', parts.leftArm.children[0], {x:0.1, y:0.28, z:0.1}, 5); 
            const rArm = createPart('rArm', parts.rightArm.children[0], {x:0.1, y:0.28, z:0.1}, 5);
            const lForeMesh = parts.leftArm.userData.elbow.children[0];
            const rForeMesh = parts.rightArm.userData.elbow.children[0];
            const lFore = createPart('lFore', lForeMesh, {x:0.09, y:0.28, z:0.09}, 3);
            const rFore = createPart('rFore', rForeMesh, {x:0.09, y:0.28, z:0.09}, 3);
            const lLegMesh = parts.leftLeg.children[0]; 
            const rLegMesh = parts.rightLeg.children[0];
            const lLeg = createPart('lLeg', lLegMesh, {x:0.14, y:0.38, z:0.14}, 8);
            const rLeg = createPart('rLeg', rLegMesh, {x:0.14, y:0.38, z:0.14}, 8);
            const lShinMesh = parts.leftLeg.userData.knee.children[0];
            const rShinMesh = parts.rightLeg.userData.knee.children[0];
            const lShin = createPart('lShin', lShinMesh, {x:0.12, y:0.38, z:0.12}, 5);
            const rShin = createPart('rShin', rShinMesh, {x:0.12, y:0.38, z:0.12}, 5);

            // --- CONSTRAINTS (Simplified) ---
            const addJoint = (bodyA, bodyB, pivotA, pivotB, axisA, axisB) => {
                const c = new CANNON.ConeTwistConstraint(bodyA, bodyB, {
                    pivotA: new CANNON.Vec3(pivotA.x, pivotA.y, pivotA.z),
                    pivotB: new CANNON.Vec3(pivotB.x, pivotB.y, pivotB.z),
                    axisA: new CANNON.Vec3(axisA.x, axisA.y, axisA.z),
                    axisB: new CANNON.Vec3(axisB.x, axisB.y, axisB.z),
                    angle: 0.5, twistAngle: 0.3
                });
                c.collideConnected = false;
                this.world.addConstraint(c);
                constraints.push(c);
            };

            addJoint(hips, torso, {x:0, y:0.1, z:0}, {x:0, y:-0.22, z:0}, {x:0, y:1, z:0}, {x:0, y:-1, z:0});
            addJoint(torso, head, {x:0, y:0.20, z:0}, {x:0, y:-0.20, z:0}, {x:1, y:0, z:0}, {x:1, y:0, z:0});
            addJoint(torso, lArm, {x:-0.2, y:0.2, z:0}, {x:0, y:0.18, z:0}, {x:-1, y:0, z:0}, {x:0, y:1, z:0});
            addJoint(torso, rArm, {x:0.2, y:0.2, z:0},  {x:0, y:0.18, z:0}, {x:1, y:0, z:0},  {x:0, y:1, z:0});
            addJoint(lArm, lFore, {x:0, y:-0.18, z:0}, {x:0, y:0.16, z:0}, {x:1, y:0, z:0}, {x:1, y:0, z:0});
            addJoint(rArm, rFore, {x:0, y:-0.18, z:0}, {x:0, y:0.16, z:0}, {x:1, y:0, z:0}, {x:1, y:0, z:0});
            addJoint(hips, lLeg, {x:-0.1, y:-0.1, z:0}, {x:0, y:0.22, z:0}, {x:0, y:-1, z:0}, {x:0, y:1, z:0});
            addJoint(hips, rLeg, {x:0.1, y:-0.1, z:0},  {x:0, y:0.22, z:0}, {x:0, y:-1, z:0}, {x:0, y:1, z:0});
            addJoint(lLeg, lShin, {x:0.12, y:-0.22, z:0}, {x:0, y:0.22, z:0}, {x:1, y:0, z:0}, {x:1, y:0, z:0});
            addJoint(rLeg, rShin, {x:0.12, y:-0.22, z:0}, {x:0, y:0.22, z:0}, {x:1, y:0, z:0}, {x:1, y:0, z:0});

            // --- FORCE APPLICATION ---
            if (impulse) {
                let impactBody = torso;
                const strength = 100.0;
                const force = new CANNON.Vec3(impulse.x * strength, (impulse.y + 0.5) * strength, impulse.z * strength);
                impactBody.wakeUp();
                impactBody.applyImpulse(force, impactBody.position);
            }

            const ragdoll = { bodies, meshes, constraints, life: 10.0 };
            this.ragdolls.push(ragdoll);
            return ragdoll;
        },

        update(dt) {
            if (!this.world) return;
            this.world.step(Math.min(dt, 0.1));
            
            for (let i = this.ragdolls.length - 1; i >= 0; i--) {
                const rd = this.ragdolls[i];
                rd.life -= dt;
                
                if (rd.life <= 0) {
                    this.disposeRagdoll(rd);
                    this.ragdolls.splice(i, 1);
                    continue;
                }
                
                for (const name in rd.bodies) {
                    const b = rd.bodies[name];
                    const m = rd.meshes[name];
                    if (b && m) {
                        m.position.copy(b.position);
                        m.quaternion.copy(b.quaternion);
                    }
                }
            }
        },

        disposeRagdoll(rd) {
            for (const name in rd.bodies) {
                this.world.removeBody(rd.bodies[name]);
            }
            for (const name in rd.meshes) {
                const m = rd.meshes[name];
                this.scene.remove(m);
                if (m.geometry) m.geometry.dispose();
            }
        }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.RagdollManager = RagdollManager;
})();
