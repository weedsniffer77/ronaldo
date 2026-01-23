
// js/player/inventory_controller.js
(function() {
    const InventoryController = {
        slots: ['primary', 'secondary', 'melee', 'equipment1', 'equipment2'],
        throwCooldown: 0,
        
        // [ { id: 'FRAG', count: 2 }, null ]
        grenadeInventory: [null, null], 
        
        init() {
            console.log('InventoryController: Initializing...');
            this.initInventoryFromLoadout();
        },
        
        initInventoryFromLoadout() {
            const LM = window.TacticalShooter.LoadoutManager;
            if (!LM) return;
            
            const active = LM.activeLoadout;
            if (!active) return;
            
            const GD = window.TacticalShooter.GameData;
            
            const s1 = active.equipment1 ? active.equipment1.id : null;
            const s2 = active.equipment2 ? active.equipment2.id : null;
            
            const def1 = s1 ? GD.Throwables[s1] : null;
            const def2 = s2 ? GD.Throwables[s2] : null;
            
            this.grenadeInventory = [null, null];
            
            // Slot 4
            if (def1) {
                this.grenadeInventory[0] = { id: def1.id, count: def1.count || 2, def: def1 };
            }
            
            // Slot 5
            if (def2) {
                // If identical to Slot 4, merge count
                if (def1 && def1.id === def2.id) {
                    this.grenadeInventory[0].count += (def2.count || 2);
                    console.log(`Inventory: Merged ${def2.id} into Slot 4.`);
                } else {
                    // Distinct item
                    this.grenadeInventory[1] = { id: def2.id, count: def2.count || 2, def: def2 };
                    console.log(`Inventory: Slot 5 set to ${def2.id}`);
                }
            }
        },
        
        update(inputManager, playerState) {
            if (this.throwCooldown > 0) this.throwCooldown -= 0.016; 
            
            if (window.TacticalShooter.MatchState && window.TacticalShooter.MatchState.state.status === 'PRE_ROUND') {
                return;
            }
            if (playerState.isDead) return;

            // --- EQUIP GRENADE ---
            // Slot 4 (Digit4) -> Index 0
            if (inputManager.wasActionJustPressed('Slot4')) {
                this.equipGrenadeSlot(0); 
                return;
            }
            // Slot 5 (Digit5) -> Index 1
            if (inputManager.wasActionJustPressed('Slot5')) {
                this.equipGrenadeSlot(1); 
                return;
            }

            // --- WEAPON SWITCHING ---
            let requestedSlot = null;
            const currentSlot = window.TacticalShooter.LoadoutManager.activeSlot || 'primary';
            const activeLoadout = window.TacticalShooter.LoadoutManager.activeLoadout;

            if (inputManager.wasActionJustPressed('Slot1')) requestedSlot = 'primary';
            else if (inputManager.wasActionJustPressed('Slot2')) requestedSlot = 'secondary';
            else if (inputManager.wasActionJustPressed('Slot3')) requestedSlot = 'melee'; 
            
            const findNextValidSlot = (dir) => {
                const currentIndex = this.slots.indexOf(currentSlot);
                let checkIndex = currentIndex;
                for (let i = 0; i < this.slots.length; i++) {
                    checkIndex += dir;
                    if (checkIndex >= this.slots.length) checkIndex = 0;
                    if (checkIndex < 0) checkIndex = this.slots.length - 1;
                    
                    const slotName = this.slots[checkIndex];
                    
                    if (slotName.startsWith('equipment')) {
                        const gIdx = slotName === 'equipment1' ? 0 : 1;
                        if (this.grenadeInventory[gIdx] && this.grenadeInventory[gIdx].count > 0) {
                            return slotName;
                        }
                        continue;
                    }
                    
                    if (activeLoadout[slotName] && activeLoadout[slotName].id) {
                        return slotName;
                    }
                }
                return null;
            };

            if (inputManager.wasActionJustPressed('CycleUp')) requestedSlot = findNextValidSlot(-1);
            else if (inputManager.wasActionJustPressed('CycleDown')) requestedSlot = findNextValidSlot(1);

            if (requestedSlot && requestedSlot !== currentSlot) {
                if (playerState.isReloading) playerState.cancelReload();
                const WM = window.TacticalShooter.WeaponManager;
                if (WM) WM.initiateSwitch(requestedSlot);
            }
        },
        
        equipGrenadeSlot(slotIndex) {
            const LM = window.TacticalShooter.LoadoutManager;
            if (!LM || !LM.activeLoadout) return;
            
            const slotName = (slotIndex === 0) ? 'equipment1' : 'equipment2';
            const item = this.grenadeInventory[slotIndex];
            
            if (item && item.count > 0) {
                const WM = window.TacticalShooter.WeaponManager;
                if (WM) WM.initiateSwitch(slotName);
            }
        },
        
        getGrenadeCount(slotName) {
            let idx = -1;
            if (slotName === 'equipment1') idx = 0;
            else if (slotName === 'equipment2') idx = 1;
            
            if (idx === -1) return 0;
            const item = this.grenadeInventory[idx];
            return item ? item.count : 0;
        },
        
        consumeGrenade(slotName) {
            let idx = -1;
            if (slotName === 'equipment1') idx = 0;
            else if (slotName === 'equipment2') idx = 1;
            
            if (idx === -1) return false;
            
            const item = this.grenadeInventory[idx];
            if (item && item.count > 0) {
                item.count--;
                
                // --- SLOT PROMOTION LOGIC ---
                // If Slot 4 (index 0) becomes empty, and Slot 5 (index 1) has items,
                // move Slot 5 items to Slot 4.
                if (idx === 0 && item.count <= 0) {
                    const nextItem = this.grenadeInventory[1];
                    if (nextItem && nextItem.count > 0) {
                        console.log(`Inventory: Promoting ${nextItem.id} from Slot 5 to Slot 4`);
                        
                        // 1. Move Internal Inventory Data
                        this.grenadeInventory[0] = nextItem;
                        this.grenadeInventory[1] = null;
                        
                        // 2. Sync LoadoutManager State
                        // This ensures WeaponManager picks up the new definition when it refreshes
                        const LM = window.TacticalShooter.LoadoutManager;
                        if (LM && LM.activeLoadout) {
                            // Deep copy properties from eq2 to eq1
                            LM.activeLoadout.equipment1 = JSON.parse(JSON.stringify(LM.activeLoadout.equipment2));
                            // Clear eq2
                            LM.activeLoadout.equipment2 = { id: null, attachments: [] };
                        }
                    }
                }
                
                return true;
            }
            return false;
        }
    };
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.InventoryController = InventoryController;
})();
