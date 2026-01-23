
// js/data/maps/depot/map.js
(function() {
    const DepotMap = {
        id: "DEPOT",
        name: "WAREHOUSE 2", // Renamed
        mapGroup: null, 
        geometry: [],
        
        // Extended perimeter: 100m Wide x 195m Long
        // Adding slight buffer: +/- 52, +/- 100
        perimeter: [ 
            { x: -52, z: -100 }, 
            { x: -52, z: 100 }, 
            { x: 52, z: 100 }, 
            { x: 52, z: -100 } 
        ],
        
        spawnZoneGroups: {
            blue: null,
            red: null
        },
        
        init(scene, materialLibrary) {
            console.log('DepotMap: Building Depot (Extended)...');
            this.geometry = [];
            this.mapGroup = new THREE.Group();
            scene.add(this.mapGroup);
            
            const MapAssets = window.TacticalShooter.MapAssets;

            // --- SEEDED RNG ---
            let seed = 9999;
            const seededRandom = () => { 
                seed = (seed * 9301 + 49297) % 233280; 
                return seed / 233280; 
            };
            if (MapAssets && MapAssets.setRNG) MapAssets.setRNG(seededRandom);
            
            // Materials
            const matFloor = materialLibrary.getMaterial('concrete');
            // Changed from 'wall' (grid) to 'trainingWall' (concrete)
            const matWall = materialLibrary.getMaterial('trainingWall'); 
            const matRoof = materialLibrary.getMaterial('containerGrey');
            const matStructure = materialLibrary.getMaterial('steel');
            
            // --- SPAWN ZONES ---
            this.createSpawnZones(this.mapGroup, materialLibrary);
            
            // --- 1. FLOOR (100m Width, 195m Length) ---
            // Slightly oversize floor for clean edges: 102 x 197
            this.createBlock(this.mapGroup, matFloor, 0, -1, 0, 102, 2, 197);
            
            // --- 2. PERIMETER WALLS (18m High) ---
            const H = 18.0; // Increased by 50% (was 12)
            const T = 1.0;
            const halfW = 50;   // 100m width / 2
            const halfL = 97.5; // 195m length / 2
            
            // Side Walls
            this.createBlock(this.mapGroup, matWall, -halfW, H/2, 0, T, H, 195); // Left
            this.createBlock(this.mapGroup, matWall, halfW, H/2, 0, T, H, 195);  // Right
            
            // End Walls
            this.createBlock(this.mapGroup, matWall, 0, H/2, -halfL, 100, H, T); // North
            this.createBlock(this.mapGroup, matWall, 0, H/2, halfL, 100, H, T);  // South
            
            // --- 3. ROOF SYSTEMS ---
            // Total width 100. Split into two sections of 50 width.
            // Left Center X = -25. Right Center X = 25.
            
            this.buildGableRoof(-25, 0, 50, 195, 18, matRoof, matStructure, seededRandom);
            this.buildFlatRoof(25, 0, 50, 195, 18, matRoof, matStructure, seededRandom);
            
            // --- 4. CENTRAL PILLARS (Divider at X=0) ---
            const pillarGeo = new THREE.BoxGeometry(1.5, H, 1.5);
            // Space them out along the new 195m length
            for(let z = -90; z <= 90; z += 30) {
                const mesh = new THREE.Mesh(pillarGeo, matStructure);
                mesh.position.set(0, H/2, z);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.userData.collidable = true;
                this.mapGroup.add(mesh);
                this.geometry.push(mesh);
            }

            this.mapGroup.updateMatrixWorld(true);
            console.log('DepotMap: ✓ Geometry built');
        },
        
        // --- COMPLEX GABLE ROOF (Scaled) ---
        buildGableRoof(centerX, centerZ, width, length, wallHeight, matRoof, matSteel, rng) {
            const halfW = width / 2; // 25
            const rise = 9.0; // Proportional rise for wider span
            const roofBaseY = wallHeight;
            const roofPeakY = roofBaseY + rise;
            const slopeLength = Math.sqrt(halfW*halfW + rise*rise);
            const slopeAngle = Math.atan2(rise, halfW);
            
            // A. Steel Beams (Longitudinal)
            const beamGeo = new THREE.BoxGeometry(0.5, 0.5, length); // Thicker beams
            const beamCount = 3;
            for(let i=0; i<beamCount; i++) {
                const ratio = (i + 0.5) / beamCount;
                const dist = ratio * slopeLength;
                const dx = dist * Math.cos(slopeAngle);
                const dy = dist * Math.sin(slopeAngle);
                
                // Left Slope Beam
                const bL = new THREE.Mesh(beamGeo, matSteel);
                bL.position.set(centerX - halfW + dx, roofBaseY + dy - 0.3, centerZ); 
                bL.rotation.z = slopeAngle;
                bL.userData.isProp = true; this.mapGroup.add(bL);
                
                // Right Slope Beam
                const bR = new THREE.Mesh(beamGeo, matSteel);
                bR.position.set(centerX + halfW - dx, roofBaseY + dy - 0.3, centerZ);
                bR.rotation.z = -slopeAngle;
                bR.userData.isProp = true; this.mapGroup.add(bR);
            }

            // B. Rafters (Perpendicular)
            const rafterCount = 20; // More rafters for longer roof
            const rafterGeo = new THREE.BoxGeometry(slopeLength, 0.3, 0.3); 
            for(let i=0; i<=rafterCount; i++) {
                const z = (centerZ - length/2) + (i * (length/rafterCount));
                
                // Left Rafter
                const rL = new THREE.Mesh(rafterGeo, matSteel);
                rL.position.set(centerX - halfW/2, roofBaseY + rise/2, z);
                rL.rotation.z = slopeAngle;
                rL.userData.isProp = true; this.mapGroup.add(rL);
                
                // Right Rafter
                const rR = new THREE.Mesh(rafterGeo, matSteel);
                rR.position.set(centerX + halfW/2, roofBaseY + rise/2, z);
                rR.rotation.z = -slopeAngle;
                rR.userData.isProp = true; this.mapGroup.add(rR);
            }
            
            // C. Roof Grid (Panels with holes)
            const rows = 40; // More rows for 195m length
            const cols = 8;  // Wider span
            const rowLen = length / rows; 
            const colLen = slopeLength / cols; 
            const roofGeo = new THREE.BoxGeometry(colLen, 0.15, rowLen - 0.2);
            if (window.TacticalShooter.MapAssets.scaleUVs) window.TacticalShooter.MapAssets.scaleUVs(roofGeo, colLen, 0.15, rowLen);

            const gridL = Array(rows).fill().map(() => Array(cols).fill(true));
            const gridR = Array(rows).fill().map(() => Array(cols).fill(true));
            
            const carveHoles = (grid) => {
                for(let r=0; r<rows; r++) {
                    for(let c=0; c<cols; c++) {
                        if (rng() < 0.25) {
                            grid[r][c] = false;
                            if (c < cols-1 && rng() < 0.6) grid[r][c+1] = false;
                            if (r < rows-1 && rng() < 0.6) grid[r+1][c] = false;
                        }
                    }
                }
            };
            carveHoles(gridL);
            carveHoles(gridR);

            for (let r = 0; r < rows; r++) {
                const zPos = (centerZ - length/2) + (rowLen * r) + (rowLen/2);
                
                // Left Slope Panels
                for(let c = 0; c < cols; c++) {
                    if (!gridL[r][c]) continue; 
                    const dist = (c * colLen) + (colLen/2);
                    const dx = dist * Math.cos(slopeAngle);
                    const dy = dist * Math.sin(slopeAngle);
                    const mesh = new THREE.Mesh(roofGeo, matRoof);
                    mesh.position.set(centerX - halfW + dx, roofBaseY + dy, zPos);
                    mesh.rotation.z = slopeAngle; 
                    mesh.castShadow = true; mesh.userData.isProp = true; mesh.userData.collidable = true; 
                    this.mapGroup.add(mesh); this.geometry.push(mesh);
                }
                
                // Right Slope Panels
                for(let c = 0; c < cols; c++) {
                    if (!gridR[r][c]) continue;
                    const dist = (c * colLen) + (colLen/2);
                    const dx = dist * Math.cos(slopeAngle);
                    const dy = dist * Math.sin(slopeAngle);
                    const mesh = new THREE.Mesh(roofGeo, matRoof);
                    mesh.position.set(centerX + halfW - dx, roofBaseY + dy, zPos);
                    mesh.rotation.z = -slopeAngle; 
                    mesh.castShadow = true; mesh.userData.isProp = true; mesh.userData.collidable = true; 
                    this.mapGroup.add(mesh); this.geometry.push(mesh);
                }
            }
            
            // Gables (Triangles at ends)
            const thickness = 0.5;
            this.createGable(this.mapGroup, matRoof, centerX, roofBaseY, centerZ - length/2, width, rise, thickness);
            this.createGable(this.mapGroup, matRoof, centerX, roofBaseY, centerZ + length/2, width, rise, thickness);
        },
        
        // --- BROKEN FLAT ROOF ---
        buildFlatRoof(centerX, centerZ, width, length, height, matRoof, matSteel, rng) {
            // Support Beams (Horizontal Grid)
            const beamThick = 0.5;
            // Cross Beams (X Axis)
            const zSpacing = 12.0;
            const xBeamGeo = new THREE.BoxGeometry(width, beamThick, beamThick);
            for (let z = -length/2; z <= length/2; z += zSpacing) {
                const beam = new THREE.Mesh(xBeamGeo, matSteel);
                beam.position.set(centerX, height - beamThick, centerZ + z);
                beam.userData.isProp = true; this.mapGroup.add(beam);
            }
            
            // Long Beams (Z Axis)
            const xSpacing = 12.0;
            const zBeamGeo = new THREE.BoxGeometry(beamThick, beamThick, length);
            for (let x = -width/2; x <= width/2; x += xSpacing) {
                const beam = new THREE.Mesh(zBeamGeo, matSteel);
                beam.position.set(centerX + x, height - beamThick*2, centerZ);
                beam.userData.isProp = true; this.mapGroup.add(beam);
            }

            // Roof Panels
            const rows = 40;
            const cols = 10;
            const tileW = width / cols;
            const tileL = length / rows;
            const tileGeo = new THREE.BoxGeometry(tileW - 0.1, 0.1, tileL - 0.1);
            if (window.TacticalShooter.MapAssets.scaleUVs) window.TacticalShooter.MapAssets.scaleUVs(tileGeo, tileW, 0.1, tileL);

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    let isHole = false;
                    if (rng() < 0.3) isHole = true;
                    
                    if (!isHole) {
                        const x = (centerX - width/2) + (c * tileW) + (tileW/2);
                        const z = (centerZ - length/2) + (r * tileL) + (tileL/2);
                        
                        const mesh = new THREE.Mesh(tileGeo, matRoof);
                        mesh.position.set(x, height, z);
                        
                        // Jitter slightly for "broken" look
                        mesh.rotation.y = (rng() - 0.5) * 0.05;
                        mesh.rotation.x = (rng() - 0.5) * 0.02;
                        
                        mesh.castShadow = true; 
                        mesh.receiveShadow = true; 
                        mesh.userData.collidable = true; 
                        mesh.userData.isProp = true;
                        
                        this.mapGroup.add(mesh);
                        this.geometry.push(mesh);
                    }
                }
            }
        },
        
        setVisible(visible) { if (this.mapGroup) this.mapGroup.visible = visible; },
        
        updateVisuals(isTacView, isTDM, teamCount) {
            Object.values(this.spawnZoneGroups).forEach(g => { if(g) g.visible = false; });
            if (!isTacView || !isTDM) return;
            if (this.spawnZoneGroups.blue) this.spawnZoneGroups.blue.visible = true;
            if (this.spawnZoneGroups.red) this.spawnZoneGroups.red.visible = true;
        },

        createBorder(parent, library, points, materialName, thicknessOverride = null) {
            const material = library.getMaterial(materialName);
            const borderGroup = new THREE.Group();
            borderGroup.userData.isBorder = true; 
            const thickness = thicknessOverride || 0.6; 
            const height = 15.0; const yPos = 3.0; 
            const cornerGeo = new THREE.BoxGeometry(thickness, height, thickness);
            for (let i = 0; i < points.length; i++) {
                const p1 = points[i]; const p2 = points[(i + 1) % points.length];
                const corner = new THREE.Mesh(cornerGeo, material);
                corner.position.set(p1.x, yPos, p1.z);
                corner.userData.isBorder = true;
                borderGroup.add(corner);
                const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2));
                const midX = (p1.x + p2.x) / 2; const midZ = (p1.z + p2.z) / 2;
                const angle = Math.atan2(p2.x - p1.x, p2.z - p1.z); 
                const wallLength = Math.max(0.01, dist - thickness);
                const wallGeo = new THREE.BoxGeometry(thickness, height, wallLength);
                const wall = new THREE.Mesh(wallGeo, material);
                wall.position.set(midX, yPos, midZ); wall.rotation.y = angle; wall.userData.isBorder = true;
                borderGroup.add(wall);
            }
            parent.add(borderGroup);
            return borderGroup;
        },
        
        createGable(parent, material, x, y, z, width, height, thickness) {
            const shape = new THREE.Shape();
            const halfW = width / 2;
            shape.moveTo(-halfW, 0);
            shape.lineTo(halfW, 0);
            shape.lineTo(0, height);
            shape.lineTo(-halfW, 0);
            
            const extrudeSettings = { steps: 1, depth: thickness, bevelEnabled: false };
            const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            geo.translate(0, 0, -thickness/2);
            
            const mesh = new THREE.Mesh(geo, material);
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.collidable = true;
            
            parent.add(mesh);
            this.geometry.push(mesh);
            return mesh;
        },
        
        createSpawnZones(parent, library) {
            const createZoneGroup = (pts, matName) => {
                const g = this.createBorder(parent, library, pts, matName, 0.2);
                g.userData.isSpawnZone = true; g.visible = false; return g;
            };
            // Spawns pushed out to reflect larger map
            this.spawnZoneGroups.blue = createZoneGroup([ {x:-40, z:-95}, {x:-40, z:-75}, {x:40, z:-75}, {x:40, z:-95} ], 'zoneBlue');
            this.spawnZoneGroups.red = createZoneGroup([ {x:40, z:95}, {x:40, z:75}, {x:-40, z:75}, {x:-40, z:95} ], 'zoneRed');
        },
        
        createBlock(parent, material, x, y, z, w, h, d) { 
            const geo = new THREE.BoxGeometry(w, h, d); 
            if (material.map) window.TacticalShooter.MapAssets.scaleUVs(geo, w, h, d); 
            const mesh = new THREE.Mesh(geo, material); 
            mesh.position.set(x, y, z); 
            mesh.castShadow = true; 
            mesh.receiveShadow = true; 
            mesh.userData.collidable = true; 
            parent.add(mesh); 
            this.geometry.push(mesh); 
            return mesh; 
        },
        
        cleanup(scene) { if (this.mapGroup) { scene.remove(this.mapGroup); } this.geometry = []; }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.MapRegistry.register(DepotMap.id, DepotMap);
})();
