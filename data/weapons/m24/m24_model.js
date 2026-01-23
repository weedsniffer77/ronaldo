
// js/data/weapons/m24/m24_model.js
(function() {
    const weaponDef = window.TacticalShooter.GameData.Weapons["M24"];
    if (!weaponDef) return;

    weaponDef.buildMesh = function() {
        if (!window.THREE) return null;
        const THREE = window.THREE;
        const group = new THREE.Group();
        group.userData.bulletTransparent = true;
        
        const CommonParts = window.TacticalShooter.CommonParts;
        const atts = this.attachments || [];
        
        const mm = 0.001; // Millimeter to Meter conversion scale
        
        // --- MATERIALS ---
        const matStock = new THREE.MeshStandardMaterial({ 
            color: 0x1a1a1a, // Matte Black Polymer/Composite
            roughness: 0.9, 
            metalness: 0.1, 
            name: 'M24_Stock' 
        });
        const matGripTexture = new THREE.MeshStandardMaterial({ 
            color: 0x111111, 
            roughness: 1.0, 
            metalness: 0.0, 
            name: 'M24_Grip' 
        });
        const matBarrel = new THREE.MeshStandardMaterial({ 
            color: 0x222222, // Parkerized Steel
            roughness: 0.6, 
            metalness: 0.7, 
            name: 'M24_Steel' 
        });
        const matBolt = new THREE.MeshStandardMaterial({ 
            color: 0xeeeeee, // Polished Steel Bolt Body
            roughness: 0.2, 
            metalness: 0.9, 
            name: 'M24_Bolt' 
        });
        const matBoltHandle = new THREE.MeshStandardMaterial({ 
            color: 0x111111, // Black Handle
            roughness: 0.5, 
            metalness: 0.8 
        });
        const matScopeBase = new THREE.MeshStandardMaterial({ 
            color: 0x151515, 
            roughness: 0.7, 
            metalness: 0.4 
        });
        const matPad = new THREE.MeshStandardMaterial({
            color: 0x050505,
            roughness: 0.9,
            metalness: 0.0
        });

        const addMesh = (mesh, parent = group) => {
            mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.bulletTransparent = true;
            parent.add(mesh); return mesh;
        };

        // --- 1. STOCK (The defining shape) ---
        const stockGroup = new THREE.Group();
        addMesh(stockGroup);

        const stockLen = 800 * mm;
        const stockThick = 45 * mm;
        
        const shape = new THREE.Shape();
        shape.moveTo(0, 20*mm); 
        shape.lineTo(0, -110*mm); // Buttpad bottom
        shape.lineTo(30*mm, -110*mm); // Toe
        shape.bezierCurveTo(150*mm, -90*mm, 200*mm, -70*mm, 250*mm, -70*mm); // Grip bottom start
        shape.lineTo(290*mm, -80*mm); // Grip heel
        shape.bezierCurveTo(310*mm, -40*mm, 320*mm, -20*mm, 340*mm, -10*mm); // Behind trigger
        shape.lineTo(380*mm, -35*mm); // Trigger guard front area
        shape.lineTo(750*mm, -30*mm); // Forend tip bottom
        shape.lineTo(760*mm, 0*mm); 
        shape.lineTo(340*mm, 0*mm); // Receiver start
        shape.lineTo(250*mm, 15*mm); // Comb start slope
        shape.lineTo(20*mm, 20*mm); // Comb top (cheek weld)
        shape.lineTo(0, 20*mm); // Close

        const extrudeSettings = { steps: 4, depth: stockThick, bevelEnabled: true, bevelThickness: 3*mm, bevelSize: 3*mm, bevelSegments: 3 };
        const stockGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        stockGeo.translate(0, 0, -stockThick/2); 
        const stock = new THREE.Mesh(stockGeo, matStock);
        stock.position.set(-350*mm, 0, 0); 
        addMesh(stock, stockGroup);
        
        const padGeo = new THREE.BoxGeometry(20*mm, 130*mm, 46*mm);
        const pad = new THREE.Mesh(padGeo, matPad);
        pad.position.set(-350*mm, -45*mm, 0);
        addMesh(pad, stockGroup);
        
        const gripPatch = new THREE.Mesh(new THREE.BoxGeometry(50*mm, 60*mm, 48*mm), matGripTexture);
        gripPatch.position.set(-60*mm, -50*mm, 0);
        gripPatch.rotation.z = -0.3;
        addMesh(gripPatch, stockGroup);

        stockGroup.rotation.y = Math.PI / 2;
        
        // --- 2. BARREL & RECEIVER ---
        const barrelY = 14 * mm;
        
        const recLen = 220 * mm;
        const recRad = 17 * mm;
        const receiver = new THREE.Mesh(new THREE.CylinderGeometry(recRad, recRad, recLen, 16).rotateX(Math.PI/2), matBarrel);
        receiver.position.set(0, barrelY, -50*mm); 
        addMesh(receiver);
        
        const bLen = 610 * mm; 
        const bRadBase = 15 * mm;
        const bRadTip = 11 * mm;
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(bRadBase, bRadTip, bLen, 24).rotateX(Math.PI/2), matBarrel);
        barrel.position.set(0, barrelY, -recLen/2 - bLen/2 - 50*mm + 20*mm);
        addMesh(barrel);
        
        const lug = new THREE.Mesh(new THREE.BoxGeometry(35*mm, 40*mm, 35*mm), matBarrel);
        lug.position.set(0, barrelY, -recLen/2 - 50*mm);
        addMesh(lug);

        // --- 3. BOLT MECHANISM (Improved) ---
        // Bolt Group moves back and forth. Origin at rear face of closed bolt.
        // Closed position: Z=60mm (flush with receiver rear)
        const boltGroup = new THREE.Group();
        boltGroup.position.set(0, barrelY, 60*mm); 
        addMesh(boltGroup);
        
        // Bolt Body (Polished Cylinder)
        // Extends forward into receiver
        const boltLen = 150 * mm;
        const boltRad = 9 * mm; // Slightly smaller than receiver ID
        const boltBody = new THREE.Mesh(new THREE.CylinderGeometry(boltRad, boltRad, boltLen, 16).rotateX(Math.PI/2), matBolt);
        // Position relative to group origin (rear face). Center is at -Len/2
        boltBody.position.set(0, 0, -boltLen/2);
        addMesh(boltBody, boltGroup);
        
        // Bolt Handle Assembly (Rotates)
        // Pivot is at the group origin (0,0,0 local)
        const handleGroup = new THREE.Group();
        boltGroup.add(handleGroup);
        
        // Handle Arm (Angled down/back)
        const armLen = 60 * mm;
        const armGeo = new THREE.CylinderGeometry(4*mm, 5*mm, armLen).rotateZ(-Math.PI/2);
        const arm = new THREE.Mesh(armGeo, matBoltHandle);
        arm.position.set(armLen/2 + 8*mm, 0, 0); 
        // Default rotation: Sticking out right, slightly back
        arm.rotation.y = 0.3;
        addMesh(arm, handleGroup);
        
        // Handle Knob
        const knobGeo = new THREE.SphereGeometry(12*mm, 16, 16);
        const knob = new THREE.Mesh(knobGeo, matBoltHandle);
        knob.position.set(armLen + 12*mm, 0, 6*mm); // End of arm
        addMesh(knob, handleGroup);

        // Bolt Shroud (Rear Cap) - Moves with bolt group, does NOT rotate with handle
        // Add directly to boltGroup behind handle
        const shroud = new THREE.Mesh(new THREE.CylinderGeometry(12*mm, 12*mm, 30*mm, 16).rotateX(Math.PI/2), matBarrel);
        shroud.position.set(0, 0, 15*mm); // Behind 0
        addMesh(shroud, boltGroup);
        
        // Cocking Piece (Small pin)
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(3*mm, 3*mm, 10*mm).rotateX(Math.PI/2), matBolt);
        pin.position.set(0, 0, 32*mm);
        addMesh(pin, boltGroup);

        // --- 4. TRIGGER & GUARD ---
        const guardGroup = new THREE.Group();
        guardGroup.position.set(0, -25*mm, 0);
        addMesh(guardGroup);
        
        const plate = new THREE.Mesh(new THREE.BoxGeometry(26*mm, 5*mm, 150*mm), matBarrel);
        plate.position.set(0, 0, -20*mm);
        addMesh(plate, guardGroup);
        
        const loopShape = new THREE.Shape();
        loopShape.moveTo(0,0);
        loopShape.lineTo(0, -15*mm);
        loopShape.lineTo(40*mm, -25*mm); 
        loopShape.lineTo(60*mm, -5*mm);  
        loopShape.lineTo(60*mm, 0);
        
        const loopExt = new THREE.ExtrudeGeometry(loopShape, { depth: 14*mm, bevelEnabled: false });
        loopExt.translate(0, 0, -7*mm);
        const loop = new THREE.Mesh(loopExt, matBarrel);
        loop.position.set(-10*mm, -2*mm, 0);
        loop.rotation.y = -Math.PI/2;
        addMesh(loop, guardGroup);
        
        const trig = new THREE.Mesh(new THREE.BoxGeometry(5*mm, 20*mm, 5*mm), matBolt);
        trig.rotation.x = 0.4;
        trig.position.set(0, -10*mm, 15*mm);
        addMesh(trig, guardGroup);

        // --- 5. SCOPE RAIL ---
        const railLen = 140*mm;
        const railH = 8*mm;
        const railW = 21*mm;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(railW, railH, railLen), matScopeBase);
        rail.position.set(0, barrelY + recRad + railH/2, -30*mm);
        addMesh(rail, group);
        
        const fsBase = new THREE.Mesh(new THREE.BoxGeometry(10*mm, 12*mm, 20*mm), matBarrel);
        fsBase.position.set(0, barrelY + bRadTip, -recLen/2 - bLen + 10*mm);
        addMesh(fsBase, group);
        
        const stud = new THREE.Mesh(new THREE.CylinderGeometry(3*mm, 3*mm, 8*mm).rotateZ(Math.PI/2), matBarrel);
        stud.position.set(0, -32*mm, -350*mm);
        addMesh(stud, group);

        // --- RIGGING ---
        const muzzlePoint = new THREE.Object3D();
        muzzlePoint.position.set(0, barrelY, -recLen/2 - bLen); 
        group.add(muzzlePoint);
        
        const ejectionPoint = new THREE.Object3D();
        ejectionPoint.position.set(20*mm, barrelY, -20*mm);
        ejectionPoint.rotation.y = 0.5; // Angled out
        group.add(ejectionPoint);
        
        const handR = new THREE.Object3D();
        handR.position.set(0, -0.05, 0.15); 
        handR.rotation.x = -0.5;
        group.add(handR);
        
        const handL = new THREE.Object3D();
        handL.position.set(0, -0.04, -0.35); 
        group.add(handL);
        
        // --- SHELL FOR RELOAD ---
        const shellGroup = new THREE.Group();
        shellGroup.visible = false;
        shellGroup.name = "RELOAD_SHELL";
        
        // 7.62mm dummy
        const sCase = new THREE.Mesh(new THREE.CylinderGeometry(6*mm, 6*mm, 51*mm, 8).rotateX(Math.PI/2), 
            new THREE.MeshStandardMaterial({color:0xd4af37, roughness:0.3, metalness:0.8}));
        shellGroup.add(sCase);
        const sNeck = new THREE.Mesh(new THREE.CylinderGeometry(4*mm, 6*mm, 10*mm, 8).rotateX(Math.PI/2), 
            new THREE.MeshStandardMaterial({color:0xd4af37}));
        sNeck.position.z = -30*mm;
        shellGroup.add(sNeck);
        const sBullet = new THREE.Mesh(new THREE.CylinderGeometry(0, 3.8*mm, 20*mm, 8).rotateX(Math.PI/2), 
            new THREE.MeshStandardMaterial({color:0xb87333}));
        sBullet.position.z = -45*mm;
        shellGroup.add(sBullet);
        
        handL.add(shellGroup);
        shellGroup.rotation.y = -Math.PI / 2;

        return {
            mesh: group,
            parts: {
                muzzle: muzzlePoint,
                ejection: ejectionPoint,
                handRight: handR,
                handLeft: handL,
                slide: boltGroup, // Whole group moves
                handle: handleGroup, // Handle rotates
                magazine: null,
                shell: shellGroup
            }
        };
    };
})();
