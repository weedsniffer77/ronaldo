
// js/data/map_assets.js
(function() {
    const MapAssets = {
        
        rng: Math.random, 

        setRNG(fn) {
            this.rng = fn || Math.random;
        },

        scaleUVs(geometry, w, h, d) {
            const uvs = geometry.attributes.uv;
            for (let i = 0; i < uvs.count; i += 4) {
                let uScale = 1;
                let vScale = 1;
                const faceIndex = i / 4;
                if (faceIndex === 0 || faceIndex === 1) { uScale = d; vScale = h; }
                else if (faceIndex === 2 || faceIndex === 3) { uScale = w; vScale = d; }
                else { uScale = w; vScale = h; }
                for (let j = 0; j < 4; j++) {
                    uvs.setXY(i + j, uvs.getX(i + j) * uScale, uvs.getY(i + j) * vScale);
                }
            }
            uvs.needsUpdate = true;
        },

        createBarrel(scene, library, x, y, z, geometryList) {
            const mat = library.getMaterial('barrelRed');
            const h = 1.45;
            const r = 0.4;
            const geo = new THREE.CylinderGeometry(r, r, h, 16);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y + h/2 - 0.02, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Barrel is thick enough, visual collision is fine
            mesh.userData.collidable = true;
            mesh.userData.isProp = true; 
            mesh.rotation.y = this.rng() * Math.PI; 
            scene.add(mesh);
            if (geometryList) geometryList.push(mesh);
            return mesh;
        },
        
        createPalletStack(scene, library, x, y, z, count, scale = 1.2, geometryList) {
            const mat = library.getMaterial('palletWood');
            const w = scale;
            const d = scale * 0.8;
            const hPerPallet = 0.15;
            const totalH = count * hPerPallet;
            
            // Visual Mesh
            const geo = new THREE.BoxGeometry(w, totalH, d);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y + totalH/2 - 0.02, z);
            mesh.rotation.y = this.rng() * 0.5; 
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Use visual mesh for collision (simple box)
            mesh.userData.collidable = true; 
            mesh.userData.isProp = true; 
            scene.add(mesh);
            if (geometryList) geometryList.push(mesh);
            return mesh;
        },

        createLargePalletCube(scene, library, x, y, z, geometryList) {
            const mat = library.getMaterial('palletWood');
            const dim = 2.0;
            const group = new THREE.Group();
            group.position.set(x, y, z);
            group.rotation.y = this.rng() * Math.PI;

            const geo = new THREE.BoxGeometry(dim, dim, dim);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = dim/2;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.collidable = true;
            mesh.userData.isProp = true;
            group.add(mesh);
            if (geometryList) geometryList.push(mesh);

            scene.add(group);
            return group;
        },
        
        createTallPalletStack(scene, library, x, y, z, geometryList) {
            const mat = library.getMaterial('palletWood');
            const group = new THREE.Group();
            group.position.set(x, y, z);
            group.rotation.y = this.rng() * Math.PI;
            
            const W = 2.0;
            const H = 1.5;
            
            const pL = 2.0; 
            const pW = 0.4; 
            const pH = 0.12; 
            
            const layerCount = Math.floor(H / pH);
            const plankGeo = new THREE.BoxGeometry(pW, pH, pL); 
            
            // Visual Planks (No Collision)
            for(let i = 0; i < layerCount; i++) {
                const yPos = (i * pH) + (pH/2);
                const isRotated = (i % 2 !== 0);
                const offsets = [-0.8, 0, 0.8];
                
                offsets.forEach(offset => {
                    const mesh = new THREE.Mesh(plankGeo, mat);
                    const rX = (this.rng() - 0.5) * 0.1;
                    const rZ = (this.rng() - 0.5) * 0.1;
                    const rRot = (this.rng() - 0.5) * 0.15;
                    
                    if (isRotated) {
                        mesh.rotation.y = (Math.PI / 2) + rRot;
                        mesh.position.set(rX, yPos, offset + rZ); 
                    } else {
                        mesh.rotation.y = rRot;
                        mesh.position.set(offset + rX, yPos, rZ);
                    }
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.userData.collidable = false; // Disable individual plank collision
                    group.add(mesh);
                });
            }
            
            // --- UPDATED COLLISION: Single Smooth Box ---
            const colGeo = new THREE.BoxGeometry(2.0, H, 2.0);
            const colMat = new THREE.MeshBasicMaterial({ visible: false });
            const colMesh = new THREE.Mesh(colGeo, colMat);
            colMesh.position.y = H / 2;
            colMesh.userData.collidable = true;
            colMesh.userData.isProp = true;
            
            group.add(colMesh);
            if(geometryList) geometryList.push(colMesh);
            
            scene.add(group);
            return group;
        },

        createStairs(scene, library, x, y, z, width, height, length, rotationY, geometryList) {
            const mat = library.getMaterial('concrete');
            const group = new THREE.Group();
            group.position.set(x, y, z);
            group.rotation.y = rotationY;

            const steps = 10;
            const stepRise = height / steps;
            const stepRun = length / steps;

            // Visual Steps
            for(let i=0; i<steps; i++) {
                const sH = stepRise * (i+1);
                const geo = new THREE.BoxGeometry(width, stepRise, stepRun);
                const mesh = new THREE.Mesh(geo, mat);
                // Position steps visually
                mesh.position.set(0, (i * stepRise) + stepRise/2, (i * stepRun) + stepRun/2);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.userData.isProp = true;
                mesh.userData.collidable = false; 
                group.add(mesh);
            }

            // --- COLLISION WEDGE (Solid Ramp) ---
            // Construct a wedge manually to fill the space under the stairs completely
            // Vertices for a wedge (width x height x length)
            const w = width / 2;
            const l = length;
            const h = height;
            
            // 6 vertices for wedge
            const vertices = new Float32Array([
                // Bottom Rectangle (Triangle 1)
                -w, 0, 0,   w, 0, 0,   -w, 0, l,
                // Bottom Rectangle (Triangle 2)
                w, 0, 0,    w, 0, l,   -w, 0, l,
                
                // Back Vertical Face (Triangle 1)
                -w, 0, l,   w, 0, l,   -w, h, l,
                // Back Vertical Face (Triangle 2)
                w, 0, l,    w, h, l,   -w, h, l,
                
                // Slope Face (Triangle 1)
                -w, 0, 0,   -w, h, l,  w, 0, 0,
                // Slope Face (Triangle 2)
                w, 0, 0,    -w, h, l,  w, h, l,
                
                // Side Left
                -w, 0, 0,   -w, 0, l,  -w, h, l,
                // Side Right
                w, 0, 0,    w, h, l,   w, 0, l
            ]);
            
            const wedgeGeo = new THREE.BufferGeometry();
            wedgeGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            wedgeGeo.computeVertexNormals();
            
            const wedgeMat = new THREE.MeshBasicMaterial({ visible: false });
            const wedge = new THREE.Mesh(wedgeGeo, wedgeMat);
            wedge.userData.collidable = true;
            
            group.add(wedge);
            if(geometryList) geometryList.push(wedge);

            scene.add(group);
            return group;
        },

        createKillhouseWall(scene, library, x, y, z, rotY, hasWindow, geometryList) {
            const mat = library.getMaterial('plywood');
            const matFrame = library.getMaterial('wood'); 
            
            const group = new THREE.Group();
            group.position.set(x, y, z);
            group.rotation.y = rotY;
            
            const W = 2.5;
            const H = 2.5;
            const T = 0.1;

            if (hasWindow) {
                const wW = 1.0; 
                const wH = 1.0;
                const sideW = (W - wW) / 2;
                const botH = (H - wH) / 2; 
                const topH = (H - wH) / 2;
                
                // Visuals (Collidable FALSE)
                const bGeo = new THREE.BoxGeometry(W, botH, T);
                const bMesh = new THREE.Mesh(bGeo, mat); bMesh.position.set(0, botH/2, 0); 
                bMesh.castShadow = true; bMesh.receiveShadow = true; bMesh.userData.collidable = false;
                group.add(bMesh);
                
                const tMesh = new THREE.Mesh(bGeo, mat); tMesh.position.set(0, H - botH/2, 0);
                tMesh.castShadow = true; tMesh.receiveShadow = true; tMesh.userData.collidable = false;
                group.add(tMesh);
                
                const sGeo = new THREE.BoxGeometry(sideW, wH, T);
                const lMesh = new THREE.Mesh(sGeo, mat); lMesh.position.set(-W/2 + sideW/2, H/2, 0);
                lMesh.castShadow = true; lMesh.receiveShadow = true; lMesh.userData.collidable = false;
                group.add(lMesh);
                
                const rMesh = new THREE.Mesh(sGeo, mat); rMesh.position.set(W/2 - sideW/2, H/2, 0);
                rMesh.castShadow = true; rMesh.receiveShadow = true; rMesh.userData.collidable = false;
                group.add(rMesh);
                
                const sillGeo = new THREE.BoxGeometry(wW, 0.05, 0.15);
                const sill = new THREE.Mesh(sillGeo, matFrame); sill.position.set(0, botH, 0); 
                group.add(sill);

                // --- OVERHAULED THICK COLLIDERS (0.6 width) ---
                // Prevents clipping by acting as a thick block
                const colThick = 0.6;
                const matCol = new THREE.MeshBasicMaterial({visible:false});

                const colBot = new THREE.Mesh(new THREE.BoxGeometry(W, botH, colThick), matCol);
                colBot.position.set(0, botH/2, 0); colBot.userData.collidable = true; 
                group.add(colBot); if(geometryList) geometryList.push(colBot);

                const colTop = new THREE.Mesh(new THREE.BoxGeometry(W, topH, colThick), matCol);
                colTop.position.set(0, H - topH/2, 0); colTop.userData.collidable = true;
                group.add(colTop); if(geometryList) geometryList.push(colTop);

                const colLeft = new THREE.Mesh(new THREE.BoxGeometry(sideW, wH, colThick), matCol);
                colLeft.position.set(-W/2 + sideW/2, H/2, 0); colLeft.userData.collidable = true;
                group.add(colLeft); if(geometryList) geometryList.push(colLeft);

                const colRight = new THREE.Mesh(new THREE.BoxGeometry(sideW, wH, colThick), matCol);
                colRight.position.set(W/2 - sideW/2, H/2, 0); colRight.userData.collidable = true;
                group.add(colRight); if(geometryList) geometryList.push(colRight);

            } else {
                // Visual
                const geo = new THREE.BoxGeometry(W, H, T);
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(0, H/2, 0);
                mesh.castShadow = true; 
                mesh.receiveShadow = true;
                mesh.userData.collidable = false;
                group.add(mesh);

                // Thick Collider
                const col = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.6), new THREE.MeshBasicMaterial({visible:false}));
                col.position.set(0, H/2, 0);
                col.userData.collidable = true;
                col.userData.isProp = true;
                group.add(col);
                if(geometryList) geometryList.push(col);
            }
            
            scene.add(group);
            return group;
        },
        
        createContainer(scene, library, x, y, z, matName, rotationY, geometryList, doorConfig = null) {
            const matCorrugated = library.getMaterial(matName);
            const matFrame = library.getMaterial(`${matName}Flat`) || matCorrugated; 
            
            const containerGroup = new THREE.Group();
            containerGroup.position.set(x, y, z);
            containerGroup.rotation.y = rotationY;
            containerGroup.userData.collidable = false; 
            
            const W = 2.44;
            const H = 2.59;
            const L = 6.06;
            const frameSize = 0.15; 
            const panelThick = 0.05; 
            
            const addPart = (geo, mat, px, py, pz, rotX=0, rotY=0, rotZ=0) => {
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(px, py, pz);
                if (rotX) mesh.rotation.x = rotX;
                if (rotY) mesh.rotation.y = rotY;
                if (rotZ) mesh.rotation.z = rotZ;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.userData.collidable = false; // Purely visual
                containerGroup.add(mesh);
            };

            // --- VISUALS ---
            const postGeo = new THREE.BoxGeometry(frameSize, H, frameSize);
            addPart(postGeo, matFrame, -W/2 + frameSize/2, H/2, -L/2 + frameSize/2);
            addPart(postGeo, matFrame, W/2 - frameSize/2, H/2, -L/2 + frameSize/2);
            addPart(postGeo, matFrame, -W/2 + frameSize/2, H/2, L/2 - frameSize/2);
            addPart(postGeo, matFrame, W/2 - frameSize/2, H/2, L/2 - frameSize/2);
            
            const longRailGeo = new THREE.BoxGeometry(frameSize, frameSize, L - 2*frameSize);
            addPart(longRailGeo, matFrame, -W/2 + frameSize/2, frameSize/2, 0); 
            addPart(longRailGeo, matFrame, W/2 - frameSize/2, frameSize/2, 0); 
            addPart(longRailGeo, matFrame, -W/2 + frameSize/2, H - frameSize/2, 0); 
            addPart(longRailGeo, matFrame, W/2 - frameSize/2, H - frameSize/2, 0); 
            
            const shortRailGeo = new THREE.BoxGeometry(W - 2*frameSize, frameSize, frameSize);
            addPart(shortRailGeo, matFrame, 0, frameSize/2, -L/2 + frameSize/2); 
            addPart(shortRailGeo, matFrame, 0, frameSize/2, L/2 - frameSize/2); 
            addPart(shortRailGeo, matFrame, 0, H - frameSize/2, -L/2 + frameSize/2); 
            addPart(shortRailGeo, matFrame, 0, H - frameSize/2, L/2 - frameSize/2); 
            
            const sidePanelGeo = this.createCorrugatedPlane(L - 2*frameSize, H - 2*frameSize, panelThick);
            addPart(sidePanelGeo, matCorrugated, -W/2 + frameSize/2, H/2, 0, 0, Math.PI/2, 0);
            addPart(sidePanelGeo, matCorrugated, W/2 - frameSize/2, H/2, 0, 0, Math.PI/2, 0);
            
            const roofGeo = this.createCorrugatedPlane(W - 2*frameSize, L - 2*frameSize, panelThick);
            addPart(roofGeo, matCorrugated, 0, H - frameSize/2, 0, -Math.PI/2, 0, 0);
            
            const floorGeo = new THREE.BoxGeometry(W - 2*frameSize, panelThick, L - 2*frameSize);
            addPart(floorGeo, matFrame, 0, frameSize/2, 0);
            
            const backGeo = this.createCorrugatedPlane(W - 2*frameSize, H - 2*frameSize, panelThick);
            addPart(backGeo, matCorrugated, 0, H/2, -L/2 + frameSize/2);
            
            // --- OPTIMIZED COLLIDERS (Thick Walls, Thin Floor/Ceiling) ---
            const matCollider = new THREE.MeshBasicMaterial({ visible: false });
            
            // Use 0.8 thick walls for invisible physics collision
            const colThick = 0.8; 
            
            // ADJUSTED: Floor and Ceiling are thinner to allow standing (H=2.59, Player=1.85)
            // Available space = H - floorH - roofH. 
            // Was 2.59 - 0.4 - 0.4 = 1.79 (Too small)
            // Now 2.59 - 0.1 - 0.1 = 2.39 (Plenty)
            
            const floorCol = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, L), matCollider);
            floorCol.position.set(0, 0.05, 0); 
            floorCol.userData.collidable = true; 
            containerGroup.add(floorCol); if(geometryList) geometryList.push(floorCol);
            
            const roofCol = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, L), matCollider);
            roofCol.position.set(0, H - 0.05, 0); 
            roofCol.userData.collidable = true; 
            containerGroup.add(roofCol); if(geometryList) geometryList.push(roofCol);
            
            const lCol = new THREE.Mesh(new THREE.BoxGeometry(colThick, H, L), matCollider);
            lCol.position.set(-W/2, H/2, 0); lCol.userData.collidable = true; containerGroup.add(lCol); if(geometryList) geometryList.push(lCol);
            
            const rCol = new THREE.Mesh(new THREE.BoxGeometry(colThick, H, L), matCollider);
            rCol.position.set(W/2, H/2, 0); rCol.userData.collidable = true; containerGroup.add(rCol); if(geometryList) geometryList.push(rCol);
            
            const bCol = new THREE.Mesh(new THREE.BoxGeometry(W, H, colThick), matCollider);
            bCol.position.set(0, H/2, -L/2); bCol.userData.collidable = true; containerGroup.add(bCol); if(geometryList) geometryList.push(bCol);

            // --- DOORS ---
            const doorW = (W / 2) - 0.05; 
            const doorH = H - 0.2;
            const doorThick = 0.08;
            const doorGeo = new THREE.BoxGeometry(doorW, doorH, doorThick);
            
            const createDoor = (isLeft, angle) => {
                const pivotGroup = new THREE.Group();
                const px = isLeft ? (-W/2 + frameSize) : (W/2 - frameSize);
                pivotGroup.position.set(px, H/2, L/2);
                pivotGroup.rotation.y = angle;
                
                const doorMesh = new THREE.Mesh(doorGeo, matCorrugated);
                const visualOffset = isLeft ? (doorW/2) : (-doorW/2);
                doorMesh.position.set(visualOffset, 0, 0);
                doorMesh.castShadow = true;
                doorMesh.receiveShadow = true;
                doorMesh.userData.collidable = false; 
                pivotGroup.add(doorMesh);
                
                // Door Collider (0.6 Thick)
                const dCol = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.6), matCollider);
                dCol.position.set(visualOffset, 0, 0);
                dCol.userData.collidable = true;
                pivotGroup.add(dCol);
                if(geometryList) geometryList.push(dCol);
                
                containerGroup.add(pivotGroup);
            };

            createDoor(true, doorConfig ? (doorConfig.left || 0) : 0);
            createDoor(false, doorConfig ? (doorConfig.right || 0) : 0);
            
            scene.add(containerGroup);
            containerGroup.updateMatrixWorld(true);
            return containerGroup;
        },
        
        createConcreteBarrier(scene, library, x, y, z, rotation, geometryList) {
            const mat = library.getMaterial('concrete');
            const shape = new THREE.Shape();
            shape.moveTo(0.3, 0);
            shape.lineTo(0.15, 0.30);
            shape.lineTo(0.1, 1.47); 
            shape.lineTo(-0.1, 1.47); 
            shape.lineTo(-0.15, 0.30);
            shape.lineTo(-0.3, 0);
            shape.lineTo(0.3, 0);
            
            const extrudeSettings = { steps: 1, depth: 3.0, bevelEnabled: false };
            const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            geo.translate(0, 0, -1.5);
            
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y - 0.02, z);
            mesh.rotation.y = rotation;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            mesh.userData.collidable = true;
            scene.add(mesh);
            if (geometryList) geometryList.push(mesh);
            return mesh;
        }
    };
    
    // Functions for pallets...
    MapAssets.createPalletLong = function(scene, library, x, y, z, rot, geometryList) {
         const mat = library.getMaterial('palletWood');
         const w = 2.4; const d = 1.0; const h = 0.45; 
         const geo = new THREE.BoxGeometry(w, h, d);
         const mesh = new THREE.Mesh(geo, mat);
         mesh.position.set(x, y + h/2 - 0.02, z);
         mesh.rotation.y = rot;
         mesh.castShadow = true; mesh.receiveShadow = true;
         mesh.userData.collidable = true; mesh.userData.isProp = true; 
         scene.add(mesh); if (geometryList) geometryList.push(mesh); return mesh;
    };
    
    MapAssets.createPlankStack = function(scene, library, x, y, z, rotation, geometryList) {
        const mat = library.getMaterial('palletWood');
        const pL = 3.2; const pW = 0.4; const pH = 0.12; 
        const spawnPlank = (ox, oy, oz, r) => {
             const geo = new THREE.BoxGeometry(pW, pH, pL);
             const mesh = new THREE.Mesh(geo, mat);
             mesh.position.set(x + ox, y + oy + pH/2 - 0.02, z + oz);
             mesh.rotation.y = r + (this.rng()-0.5)*0.08; 
             mesh.castShadow = true; mesh.receiveShadow = true;
             // Disable detailed collision
             mesh.userData.collidable = false;
             scene.add(mesh); 
        };
        const cos = Math.cos(rotation); const sin = Math.sin(rotation);
        const offset = (localX, localY, localZ) => {
             const rx = localX * cos - localZ * sin;
             const rz = localX * sin + localZ * cos;
             return {x: rx, y: localY, z: rz};
        };
        const stride = pW + 0.05; 
        const b1 = offset(-stride, 0, 0); spawnPlank(b1.x, 0, b1.z, rotation);
        const b2 = offset(0, 0, 0); spawnPlank(b2.x, 0, b2.z, rotation);
        const b3 = offset(stride, 0, 0); spawnPlank(b3.x, 0, b3.z, rotation);
        const m1 = offset(-stride/2, pH, 0); spawnPlank(m1.x, m1.y, m1.z, rotation);
        const m2 = offset(stride/2, pH, 0); spawnPlank(m2.x, m2.y, m2.z, rotation);
        const t1 = offset(0, pH*2, 0); spawnPlank(t1.x, t1.y, t1.z, rotation);

        // Single collider box
        const colGeo = new THREE.BoxGeometry(stride*3, pH*3, pL);
        const col = new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({visible:false}));
        col.position.set(x, pH*1.5, z);
        col.rotation.y = rotation;
        col.userData.collidable = true;
        scene.add(col);
        if(geometryList) geometryList.push(col);
    };
    
    MapAssets.createPalletPyramid = function(scene, library, x, y, z, isLarge, geometryList) {
        const pW = 1.2; const pD = 1.0; const pH = 0.15;
        const spawnOne = (ox, oy, oz, r) => {
            const geo = new THREE.BoxGeometry(pW, pH*2, pD); 
            const mesh = new THREE.Mesh(geo, library.getMaterial('palletWood'));
            mesh.position.set(x + ox, y + oy + pH - 0.02, z + oz);
            mesh.rotation.y = r + (this.rng()-0.5)*0.1; 
            mesh.castShadow = true; mesh.receiveShadow = true;
            mesh.userData.collidable = false; // Visual only
            scene.add(mesh); 
        };
        const baseRot = this.rng() * Math.PI; 
        const cos = Math.cos(baseRot); const sin = Math.sin(baseRot);
        const offset = (lx, lz) => ({ x: lx * cos - lz * sin, z: lx * sin + lz * cos });
        
        let totalW = pW * 2;
        let totalH = pH * 4;
        
        if (isLarge) {
            const o1 = offset(-pW, 0); const o2 = offset(0, 0); const o3 = offset(pW, 0);
            spawnOne(o1.x, 0, o1.z, baseRot); spawnOne(o2.x, 0, o2.z, baseRot); spawnOne(o3.x, 0, o3.z, baseRot);
            const m1 = offset(-pW/2, 0); const m2 = offset(pW/2, 0);
            spawnOne(m1.x, pH*2, m1.z, baseRot); spawnOne(m2.x, pH*2, m2.z, baseRot);
            const t1 = offset(0, 0); spawnOne(t1.x, pH*4, t1.z, baseRot);
            totalW = pW * 3;
            totalH = pH * 6;
        } else {
            const o1 = offset(-pW/2, 0); const o2 = offset(pW/2, 0);
            spawnOne(o1.x, 0, o1.z, baseRot); spawnOne(o2.x, 0, o2.z, baseRot);
            const t1 = offset(0, 0); spawnOne(t1.x, pH*2, t1.z, baseRot);
        }

        // Collider Pyramid (Simplified to Box for stability)
        const col = new THREE.Mesh(new THREE.BoxGeometry(totalW * 0.8, totalH * 0.8, pD), new THREE.MeshBasicMaterial({visible:false}));
        col.position.set(x, totalH * 0.4, z);
        col.rotation.y = baseRot;
        col.userData.collidable = true;
        scene.add(col);
        if(geometryList) geometryList.push(col);
    };
    
    MapAssets.createCorrugatedPlane = function(width, height, amplitude) {
        const pitch = 0.15;
        const segments = Math.max(2, Math.round(width / pitch)); 
        const geo = new THREE.PlaneGeometry(width, height, segments, 1);
        const pos = geo.attributes.position;
        for(let i = 0; i < pos.count; i++) {
            const col = i % (segments + 1);
            const zOffset = (col % 2 === 0) ? amplitude * 0.5 : -amplitude * 0.5;
            pos.setZ(i, zOffset);
        }
        geo.computeVertexNormals();
        return geo;
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.MapAssets = MapAssets;
})();
