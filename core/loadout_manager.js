
// js/core/loadout_manager.js
(function() {
    window.TacticalShooter = window.TacticalShooter || {};
    
    const LoadoutManager = {
        // Active "In-Match" Loadout
        activeLoadout: {
            primary: { id: "SHOTGUN", attachments: [] }, 
            secondary: { id: "PISTOL", attachments: [] }, 
            melee: { id: "KNIFE", attachments: [] },
            equipment1: { id: "FRAG", attachments: [] },
            equipment2: { id: "FLASH", attachments: [] }
        },
        
        // Active "In-Match" Slot Key
        activeSlot: "primary", 
        slots: ["primary", "secondary", "melee", "equipment1", "equipment2"],
        
        // --- STORAGE SYSTEM ---
        savedLoadouts: [], // Array of 5
        currentLoadoutIndex: 0,
        mainLoadoutIndex: 0, // Preferred Spawn Loadout
        
        init() {
            console.log('LoadoutManager: Initializing...');
            this.loadFromStorage();
            
            // If storage was empty or incomplete, ensure we have defaults
            if (this.savedLoadouts.length === 0) {
                this.savedLoadouts[0] = this.createDefaultLoadout();
            }
            
            // Ensure we have 5 slots
            while(this.savedLoadouts.length < 5) {
                this.savedLoadouts.push(this.createDefaultLoadout());
            }
            
            // Truncate if legacy data has more than 5
            if (this.savedLoadouts.length > 5) {
                this.savedLoadouts = this.savedLoadouts.slice(0, 5);
            }
            
            // Force reset active slot to primary on initialization
            this.activeSlot = "primary";
            
            // Equip Main Loadout by default on startup
            this.equipLoadout(this.mainLoadoutIndex); 
        },
        
        ensureDefaults() {
             if (this.savedLoadouts.length === 0) {
                this.savedLoadouts[0] = this.createDefaultLoadout();
            }
             while(this.savedLoadouts.length < 5) {
                this.savedLoadouts.push(this.createDefaultLoadout());
            }
             if (this.savedLoadouts.length > 5) {
                this.savedLoadouts = this.savedLoadouts.slice(0, 5);
            }
        },
        
        loadFromStorage() {
            try {
                const data = localStorage.getItem('ts_loadouts');
                if (data) {
                    this.savedLoadouts = JSON.parse(data);
                }
                const mainIdx = localStorage.getItem('ts_main_loadout');
                if (mainIdx !== null) {
                    this.mainLoadoutIndex = parseInt(mainIdx);
                    if (isNaN(this.mainLoadoutIndex) || this.mainLoadoutIndex < 0 || this.mainLoadoutIndex > 4) {
                        this.mainLoadoutIndex = 0;
                    }
                }
            } catch(e) { console.error("Loadout load error", e); }
        },
        
        saveToStorage() {
            try {
                localStorage.setItem('ts_loadouts', JSON.stringify(this.savedLoadouts));
                localStorage.setItem('ts_main_loadout', this.mainLoadoutIndex.toString());
                console.log("Loadouts Saved.");
            } catch(e) { console.error("Loadout save error", e); }
        },
        
        createDefaultLoadout() {
            return {
                name: "ASSAULT",
                primary: { id: "SHOTGUN", attachments: [] },
                secondary: { id: "PISTOL", attachments: [] },
                melee: { id: "KNIFE", attachments: [] },
                equipment1: { id: "FRAG", attachments: [] }, // Slot 4 default
                equipment2: { id: "FLASH", attachments: [] }  // Slot 5 default
            };
        },

        getLoadout(index) {
            const l = this.savedLoadouts[index] || this.createDefaultLoadout();
            // Migration for old saves without equipment
            if (!l.equipment1) l.equipment1 = { id: "FRAG", attachments: [] };
            if (!l.equipment2) l.equipment2 = { id: "FLASH", attachments: [] };
            return l;
        },
        
        equipLoadout(index) {
            if (index < 0 || index >= 5) return;
            this.currentLoadoutIndex = index;
            const L = this.getLoadout(index); // Use getter to ensure defaults
            
            // DEEP COPY to Active Loadout
            this.activeLoadout = {
                primary: { ...L.primary, attachments: [...(L.primary.attachments || [])] },
                secondary: { ...L.secondary, attachments: [...(L.secondary.attachments || [])] },
                melee: { ...L.melee, attachments: [...(L.melee.attachments || [])] },
                equipment1: { ...L.equipment1 },
                equipment2: { ...L.equipment2 }
            };
            
            // Force reset active slot
            this.activeSlot = "primary";
            
            // Update menu renderer if active
            if (window.TacticalShooter.MenuRenderer && window.TacticalShooter.MenuRenderer.active) {
                const def = this.getActiveWeaponDef();
                if (def) window.TacticalShooter.MenuRenderer.spawnWeapon(def);
            }
            
            // Re-init inventory to process stacking logic
            if (window.TacticalShooter.InventoryController) {
                window.TacticalShooter.InventoryController.initInventoryFromLoadout();
            }
            
            console.log(`LoadoutManager: Equipped Loadout ${index+1}`);
        },
        
        setMainLoadout(index) {
            if (index < 0 || index >= 5) return;
            this.mainLoadoutIndex = index;
            this.saveToStorage();
            this.equipLoadout(index); 
        },
        
        // Returns the Weapon Definition WITH applied modifications
        getActiveWeaponDef() {
            const slotKey = this.activeSlot;
            const slotData = this.activeLoadout[slotKey];
            
            if (!slotData || !slotData.id) return null;
            
            // Check Weapons Registry
            if (window.TacticalShooter.GameData.Weapons[slotData.id]) {
                return this.generateModifiedDef(slotData.id, slotData.attachments);
            }
            // Check Throwables Registry
            if (window.TacticalShooter.GameData.Throwables[slotData.id]) {
                // IMPORTANT: Return a copy to prevent mutation of global registry
                const tDef = window.TacticalShooter.GameData.Throwables[slotData.id];
                const newTDef = { ...tDef };
                if (tDef.visuals) newTDef.visuals = JSON.parse(JSON.stringify(tDef.visuals));
                if (tDef.preview) newTDef.preview = JSON.parse(JSON.stringify(tDef.preview));
                return newTDef;
            }
            
            return null;
        },
        
        generateModifiedDef(weaponId, attachments) {
            const baseDef = window.TacticalShooter.GameData.Weapons[weaponId];
            if (!baseDef) return null;
            
            const newDef = { ...baseDef };
            
            if (baseDef.visuals) newDef.visuals = JSON.parse(JSON.stringify(baseDef.visuals));
            if (baseDef.ballistics) newDef.ballistics = JSON.parse(JSON.stringify(baseDef.ballistics));
            if (baseDef.effects) newDef.effects = JSON.parse(JSON.stringify(baseDef.effects));
            if (baseDef.damageFalloff) newDef.damageFalloff = JSON.parse(JSON.stringify(baseDef.damageFalloff));
            
            newDef.attachments = attachments || [];
            
            newDef.attachments = newDef.attachments.filter(attId => {
                if (attId.startsWith('smg_') && weaponId !== 'SMG') return false;
                if (attId.startsWith('pistol_') && weaponId !== 'PISTOL') return false;
                return true;
            });
            
            const AttRegistry = window.TacticalShooter.GameData.Attachments || {};
            
            newDef.attachments.forEach(attId => {
                const mod = AttRegistry[attId];
                if (mod && mod.apply) {
                    mod.apply(newDef);
                }
            });
            
            return newDef;
        },
        
        switchWeapon(slotName) {
            if (!this.slots.includes(slotName)) return null;
            
            const slotData = this.activeLoadout[slotName];
            if (!slotData) return null;
            
            // Force reload for grenades to ensure we get fresh state
            if (this.activeSlot !== slotName || slotName.startsWith('equipment')) {
                this.activeSlot = slotName;
                console.log(`LoadoutManager: Switched to ${slotName} (${slotData.id})`);
                return this.getActiveWeaponDef();
            }
            return null; 
        },
        
        // --- EDITOR LOGIC ---
        
        commitWeaponChanges(slotIndex, type, weaponId, attachments) {
            if (this.savedLoadouts[slotIndex]) {
                this.savedLoadouts[slotIndex][type] = {
                    id: weaponId,
                    attachments: [...attachments]
                };
                this.saveToStorage();
                if (this.currentLoadoutIndex === slotIndex) {
                    this.equipLoadout(slotIndex);
                }
            }
        },
        
        cyclePreview(direction) {
            const visualSlots = ['primary', 'secondary', 'melee', 'equipment1', 'equipment2'];
            
            let idx = visualSlots.indexOf(this.activeSlot);
            if (idx === -1) idx = 0;
            
            idx += direction;
            if (idx >= visualSlots.length) idx = 0;
            if (idx < 0) idx = visualSlots.length - 1;
            
            const newSlot = visualSlots[idx];
            
            if (this.activeLoadout[newSlot]) {
                this.activeSlot = newSlot;
                const def = this.getActiveWeaponDef();
                if (window.TacticalShooter.MenuRenderer && def) {
                    window.TacticalShooter.MenuRenderer.spawnWeapon(def);
                }
            }
        }
    };
    
    window.TacticalShooter.LoadoutManager = LoadoutManager;
})();
