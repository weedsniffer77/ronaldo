
// js/weapons/throwable_manager.js
(function() {
    const ThrowableManager = {
        scene: null,
        projectiles: [],
        raycaster: null,
        
        init(scene) {
            console.log('ThrowableManager: Initializing (Cannon.js Enabled)...');
            this.scene = scene;
            this.projectiles = [];
            this.raycaster = new THREE.Raycaster();
        },
        
        throwItem(origin, direction, type, powerMultiplier = 1.0, ownerId = null) {
            // Load Data
            const GD = window.TacticalShooter.GameData.Throwables;
            const def = GD[type] || GD['FRAG']; 
            
            // SCALE SPEED BY POWER (Charge)
            const baseSpeed = (def.physics && def.physics.throwSpeed) ? def.physics.throwSpeed : 18.0;
            const speed = baseSpeed * powerMultiplier;
            
            // Calculate velocity vector explicitly
            const velocity = direction.clone().normalize().multiplyScalar(speed);
            
            // Spawn local instance
            this.spawnProjectile(origin, velocity, type, ownerId);
            
            // Return velocity so WeaponManager can broadcast it
            return velocity;
        },
        
        spawnRemote(origin, velocity, type, ownerId) {
            // Convert simple object vectors (from network) to THREE vectors if needed
            const start = new THREE.Vector3(origin.x, origin.y, origin.z);
            const vel = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
            
            this.spawnProjectile(start, vel, type, ownerId);
        },
        
        spawnProjectile(origin, velocity, type, ownerId) {
            if (!this.scene) return;
            
            const ragdollMgr = window.TacticalShooter.RagdollManager;
            if (!ragdollMgr || !ragdollMgr.world) return;
            
            const CANNON = window.CANNON;
            
            const GD = window.TacticalShooter.GameData.Throwables;
            const def = GD[type] || GD['FRAG']; 
            
            const mass = (def.physics && def.physics.mass) ? def.physics.mass : 0.8;
            const fuse = def.fuseTime || 4.0;
            
            // 1. Visual Mesh 
            let mesh;
            if (def.buildMesh) {
                const buildResult = def.buildMesh.call(def);
                mesh = buildResult.mesh ? buildResult.mesh : buildResult;
            } else {
                const geo = new THREE.CapsuleGeometry(0.06, 0.12, 4, 8);
                const mat = new THREE.MeshStandardMaterial({ color: 0x445522 });
                mesh = new THREE.Mesh(geo, mat);
            }
            
            mesh.castShadow = true;
            mesh.position.copy(origin);
            this.scene.add(mesh);
            
            // 2. Physics Body
            const radius = 0.05; 
            const shape = new CANNON.Sphere(radius); 
            
            const body = new CANNON.Body({
                mass: mass,
                material: ragdollMgr.matBody 
            });
            body.addShape(shape);
            body.position.set(origin.x, origin.y, origin.z);
            
            // Set Velocity
            body.velocity.set(velocity.x, velocity.y, velocity.z);
            
            // Add Spin
            const spin = new CANNON.Vec3(Math.random()*10, Math.random()*10, Math.random()*10);
            body.angularVelocity.copy(spin);
            
            body.linearDamping = 0.5;
            body.angularDamping = 0.7; 
            body.ccdSpeedThreshold = 1.0; 
            body.ccdIterations = 10;      

            ragdollMgr.world.addBody(body);
            
            // 3. Register Projectile
            const id = Math.random().toString(36).substr(2, 9);
            
            mesh.userData.isGrenade = true;
            mesh.userData.projectileId = id;
            mesh.traverse(child => {
                child.userData.isGrenade = true;
                child.userData.projectileId = id;
            });

            this.projectiles.push({
                id: id,
                mesh: mesh,
                body: body,
                def: def, 
                type: type,
                timer: fuse, 
                active: true,
                ownerId: ownerId // Track owner for damage authority
            });
        },
        
        getMeshes() {
            return this.projectiles.map(p => p.mesh);
        },
        
        detonateByMesh(mesh) {
            const pId = mesh.userData.projectileId;
            const p = this.projectiles.find(item => item.id === pId);
            if (p && p.active) {
                this.explode(p);
                const index = this.projectiles.indexOf(p);
                if (index !== -1) this.removeProjectile(index);
            }
        },
        
        update(dt) {
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const p = this.projectiles[i];
                
                if (p.body && p.mesh) {
                    p.mesh.position.copy(p.body.position);
                    p.mesh.quaternion.copy(p.body.quaternion);
                }
                
                p.timer -= dt;
                if (p.timer <= 0) {
                    this.explode(p);
                    this.removeProjectile(i);
                } else if (p.mesh.position.y < -50) {
                    this.removeProjectile(i);
                }
            }
        },
        
        explode(p) {
            if (!p.active) return;
            p.active = false; 

            const pm = window.TacticalShooter.ParticleManager;
            const pos = p.mesh.position;
            const normal = new THREE.Vector3(0, 1, 0); 
            const exp = p.def.explosion;
            
            // Determine Material Type
            let materialType = 'concrete';
            if (this.raycaster) {
                const down = new THREE.Vector3(0, -1, 0);
                this.raycaster.set(pos, down);
                this.raycaster.far = 2.0; 
                
                let collidables = [];
                if (window.TacticalShooter.GameManager && window.TacticalShooter.GameManager.currentMap) {
                     collidables = window.TacticalShooter.GameManager.currentMap.mapGroup.children;
                }
                
                if (collidables.length > 0) {
                    const hits = this.raycaster.intersectObjects(collidables, true);
                    if (hits.length > 0) {
                        const hitObj = hits[0].object;
                        const matName = (hitObj.material && hitObj.material.name) ? hitObj.material.name.toLowerCase() : '';
                        if (matName.includes('steel') || matName.includes('metal') || matName.includes('barrel') || matName.includes('container') || matName.includes('rust')) {
                            materialType = 'metal';
                        } else if (matName.includes('wood') || matName.includes('plywood') || matName.includes('pallet')) {
                            materialType = 'wood';
                        } else if (matName.includes('dirt') || matName.includes('grass')) {
                            materialType = 'dirt';
                        }
                    }
                }
            }

            // 1. Visuals (Always play for everyone)
            if (pm && exp && exp.vfx) {
                if (exp.type === 'frag') {
                    pm.createGrenadeExplosion(pos, normal, materialType);
                } else {
                    if (exp.vfx.sparks) pm.createImpactSparks(pos, normal, exp.vfx.sparks);
                    if (exp.vfx.dust) pm.createImpactDust(pos, normal);
                }
            }
            
            // 2. Gameplay Logic (DAMAGE AUTHORITY CHECK)
            // Only deal damage if I AM THE OWNER of this grenade
            // If ownerId is null, assume local/singleplayer/self
            const myId = window.TacticalShooter.PlayroomManager.myPlayer ? window.TacticalShooter.PlayroomManager.myPlayer.id : "SELF";
            
            if (p.ownerId === myId || p.ownerId === null || p.ownerId === "SELF") {
                if (exp.type === 'frag' || exp.type === 'flash') {
                    this.dealAreaDamage(pos, exp.radius || 10.0, exp.maxDamage || 250, exp.impulse || 18);
                }
            }
        },
        
        isBlocked(start, end) {
            let collidables = [];
            if (window.TacticalShooter.GameManager && window.TacticalShooter.GameManager.staticCollider) {
                collidables = [window.TacticalShooter.GameManager.staticCollider];
            } else if (window.TacticalShooter.GameManager && window.TacticalShooter.GameManager.currentMap) {
                collidables = window.TacticalShooter.GameManager.currentMap.geometry;
            }
            
            if (collidables.length === 0) return false;
            
            const dir = new THREE.Vector3().subVectors(end, start);
            const dist = dir.length();
            if (dist < 0.1) return false;
            dir.normalize();
            
            this.raycaster.set(start, dir);
            this.raycaster.far = dist; 
            
            const hits = this.raycaster.intersectObjects(collidables, true);
            return hits.length > 0;
        },

        dealAreaDamage(origin, maxRadius, maxDmg, maxImp) {
            // A. Hurt Local Player
            if (window.TacticalShooter.PlayerState) {
                const ps = window.TacticalShooter.PlayerState;
                const cc = window.TacticalShooter.CharacterController;
                const cam = window.TacticalShooter.PlayerCamera;
                
                const feetPos = cc.position.clone();
                const headPos = cam ? cam.camera.position.clone() : feetPos.clone().add(new THREE.Vector3(0, 1.6, 0));
                const centerPos = feetPos.clone().add(new THREE.Vector3(0, 1.0, 0)); 
                const dist = centerPos.distanceTo(origin);
                
                if (dist < maxRadius) {
                    let stanceMult = 1.0;
                    if (dist > 1.5) {
                        if (cc.isProne) stanceMult = 0.5;
                        else if (cc.isCrouching) stanceMult = 0.75;
                    }
                    
                    const checkOrigin = origin.clone().add(new THREE.Vector3(0, 0.1, 0));
                    const headBlocked = this.isBlocked(checkOrigin, headPos);
                    const feetBlocked = this.isBlocked(checkOrigin, feetPos);
                    
                    let coverMult = 1.0;
                    if (headBlocked && feetBlocked) coverMult = 0.0; 
                    else if (headBlocked || feetBlocked) coverMult = 0.7; 
                    
                    if (coverMult > 0) {
                        let rawDmg = 0;
                        if (dist <= 2.0) {
                            const t = dist / 2.0;
                            rawDmg = maxDmg * (1.0 - t) + (maxDmg * 0.5) * t;
                        } else {
                            const t = (dist - 2.0) / (maxRadius - 2.0); 
                            rawDmg = (maxDmg * 0.5) * (1.0 - t);
                        }
                        
                        const damage = Math.floor(rawDmg * stanceMult * coverMult);
                        
                        if (damage > 0) {
                            const blastDir = new THREE.Vector3().subVectors(centerPos, origin).normalize();
                            blastDir.y += 0.5; blastDir.normalize();
                            const impulse = maxImp * (1.0 - (dist/maxRadius)); 
                            
                            const myId = window.TacticalShooter.PlayroomManager.myPlayer ? window.TacticalShooter.PlayroomManager.myPlayer.id : "SELF";
                            // STEALTH HIT: Treat grenade damage as stealth (visual)
                            const isStealth = true; 
                            
                            // Pass origin to allow death cam to focus on it
                            ps.takeDamage(damage, myId, 'Torso', impulse, isStealth, origin.clone());
                            
                            if (!ps.isDead && cam) {
                                const shake = Math.max(0, 2.0 * (1.0 - (dist / 15.0))); 
                                cam.applyExplosionShake(shake);
                            }
                        }
                    }
                }
            }
            
            // B. Hurt Remote Players
            if (window.TacticalShooter.RemotePlayerManager && window.TacticalShooter.PlayroomManager) {
                const remotes = window.TacticalShooter.RemotePlayerManager.remotePlayers;
                for (const id in remotes) {
                    const rp = remotes[id];
                    if (!rp.mesh) continue;
                    const dist = rp.mesh.position.distanceTo(origin);
                    if (dist < maxRadius) {
                        const pct = 1.0 - (dist / maxRadius);
                        const damage = Math.floor(maxDmg * 0.5 * pct); 
                        if (damage > 0) {
                            const impulse = maxImp * pct;
                            const blastDir = new THREE.Vector3().subVectors(rp.mesh.position, origin).normalize();
                            blastDir.y += 0.5; blastDir.normalize();
                            
                            // STEALTH HIT: Grenades are stealth
                            // IMPORTANT: Pass origin (last argument) so remote player death cam can focus on explosion
                            window.TacticalShooter.PlayroomManager.broadcastBulletHit(
                                rp.mesh.position, blastDir, id, damage, "Torso", impulse, true, origin
                            );
                        }
                    }
                }
            }
        },
        
        removeProjectile(index) {
            const p = this.projectiles[index];
            if (p.mesh) {
                this.scene.remove(p.mesh);
                p.mesh.traverse(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) c.material.dispose();
                });
            }
            if (p.body) {
                const ragdollMgr = window.TacticalShooter.RagdollManager;
                if (ragdollMgr && ragdollMgr.world) {
                    ragdollMgr.world.removeBody(p.body);
                }
            }
            this.projectiles.splice(index, 1);
        }
    };
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.ThrowableManager = ThrowableManager;
})();
