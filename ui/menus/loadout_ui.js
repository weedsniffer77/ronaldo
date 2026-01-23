
// js/ui/menus/loadout_ui.js
(function() {
    const LoadoutUI = {
        activeSlotIndex: 0,
        activeSlotType: null, 
        activeCategoryTab: 'ASSAULT', 
        
        currentWeaponId: "SMG",
        currentAttachments: [],
        
        loopRunning: false,
        _boundCloseHandler: null,
        _boundEscHandler: null, 
        _tempPos: null,
        
        init() { 
            if (window.THREE) {
                this._tempPos = new window.THREE.Vector3();
            }
        },
        
        getCategoryForWeapon(wid) {
            const tDef = window.TacticalShooter.GameData.Throwables[wid];
            if (tDef) {
                return tDef.slotType === 'tactical' ? 'TACTICAL' : 'LETHAL';
            }
            const wDef = window.TacticalShooter.GameData.Weapons[wid];
            if (wDef) {
                if (wDef.type === 'secondary') return 'PISTOL';
                if (wDef.type === 'melee') return 'MELEE';
            }
            
            // ID-based fallbacks if type isn't sufficient
            if (wid === 'SMG') return 'SMG';
            if (wid === 'PISTOL') return 'PISTOL';
            if (wid.includes('SHOTGUN')) return 'SHOTGUN';
            if (wid === 'KNIFE') return 'MELEE';
            if (wid === 'M24' || wid.includes('SNIPER')) return 'SNIPER';
            
            return 'ASSAULT';
        },

        open() {
            const el = document.getElementById('loadout-screen');
            if (el) {
                el.classList.add('active');
                el.innerHTML = '';
                this.buildUI(el);
            }
            
            // Hide Main Menu UI
            const mmUI = document.getElementById('multiplayer-menu');
            if (mmUI) mmUI.style.display = 'none';
            
            const bg = document.getElementById('loadout-bg-cover');
            if (bg) bg.classList.add('active');
            const lobbyLayer = document.getElementById('lobby-ui-layer');
            if (lobbyLayer) lobbyLayer.style.display = 'none';
            const mm = document.getElementById('multiplayer-menu');
            if (mm) mm.classList.add('blurred');
            document.body.classList.add('loadout-mode');
            
            const LM = window.TacticalShooter.LoadoutManager;
            if (LM) LM.ensureDefaults();
            
            const targetSlot = LM.activeSlot;
            this.activeSlotIndex = LM.currentLoadoutIndex;
            
            this.activeSlotType = targetSlot;
            
            this.renderLoadoutList();
            
            // Sync internal state to current slot
            const L = LM.getLoadout(this.activeSlotIndex);
            const slotData = L[targetSlot] || L['primary'];
            this.currentWeaponId = slotData.id || "SMG";
            this.currentAttachments = [...(slotData.attachments || [])];
            this.activeCategoryTab = this.getCategoryForWeapon(this.currentWeaponId);

            this.renderSlotGrid(); 
            this.renderWeaponSelector();
            
            // Init Stats - Attach to main UI layer for custom positioning
            if (window.TacticalShooter.LoadoutStats && el) {
                const layer = el.querySelector('.ls-ui-layer');
                if (layer) window.TacticalShooter.LoadoutStats.init(layer);
            }
            this.updateStats(); // Initial render
            
            this.spawnPreview();
            this.updateAttachmentNodes(); 
            
            this._boundEscHandler = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    const activeNode = document.querySelector('.att-node.active');
                    if (activeNode) {
                        activeNode.classList.remove('active');
                        if (window.TacticalShooter.MenuRenderer) window.TacticalShooter.MenuRenderer.resetFocus();
                    } else {
                        this.close();
                    }
                }
            };
            document.addEventListener('keydown', this._boundEscHandler);
        },
        
        buildUI(container) {
            container.innerHTML = `
                <div id="ls-preview-container"><div id="ls-3d-target"></div></div>
                <div id="ls-attachment-overlay"></div>
                <div class="ls-ui-layer">
                    <div id="ls-header-area">
                        <button class="ls-back-btn" onclick="window.TacticalShooter.LoadoutUI.close()">
                            <span class="ls-back-symbol">&#8592;</span> CLOSE
                        </button>
                        <div class="ls-screen-title" id="ls-main-title">CUSTOMIZE</div>
                    </div>
                    <div id="ls-sidebar"></div>
                    <div id="ls-slots-grid"></div>
                    
                    <!-- Unsaved Warning Text - UPDATED -->
                    <div id="ls-unsaved-warning">CLICK SLOT TO SAVE &gt;&gt;</div>
                    
                    <div id="ls-bottom-bar">
                        <div id="ls-tabs-container"></div>
                        <div id="ls-weapon-scroller"></div>
                    </div>
                </div>
            `;
        },
        
        close() {
            const el = document.getElementById('loadout-screen');
            if (el) el.classList.remove('active');
            
            // Restore Main Menu UI if we are in MENU state
            const gm = window.TacticalShooter.GameManager;
            if (gm && gm.currentState === 'MENU') {
                const mmUI = document.getElementById('multiplayer-menu');
                if (mmUI) mmUI.style.display = 'block';
            }
            
            const bg = document.getElementById('loadout-bg-cover');
            if (bg) bg.classList.remove('active');
            const lobbyLayer = document.getElementById('lobby-ui-layer');
            if (lobbyLayer && gm && gm.currentState === 'TACVIEW') {
                lobbyLayer.style.display = 'block';
            }
            const mm = document.getElementById('multiplayer-menu');
            if (mm) mm.classList.remove('blurred');
            document.body.classList.remove('loadout-mode');
            
            if (this._boundCloseHandler) {
                document.removeEventListener('click', this._boundCloseHandler);
                this._boundCloseHandler = null;
            }
            if (this._boundEscHandler) {
                document.removeEventListener('keydown', this._boundEscHandler);
                this._boundEscHandler = null;
            }
            
            if (window.TacticalShooter.MenuRenderer) {
                window.TacticalShooter.MenuRenderer.resetFocus();
                window.TacticalShooter.MenuRenderer.stop();
            }
            this.loopRunning = false;
        },
        
        renderLoadoutList() {
            const container = document.getElementById('ls-sidebar');
            if (!container) return;
            
            let btnContainer = container.querySelector('.ls-loadout-buttons');
            if (!btnContainer) {
                container.innerHTML = `<div class="ls-loadout-buttons"></div>`;
                btnContainer = container.querySelector('.ls-loadout-buttons');
            }
            btnContainer.innerHTML = '';
            
            const LM = window.TacticalShooter.LoadoutManager;
            if (!LM) return;
            
            LM.savedLoadouts.forEach((l, i) => {
                const row = document.createElement('div');
                row.className = 'ls-sidebar-row';
                
                const isMain = (i === LM.mainLoadoutIndex);
                const mainBtn = document.createElement('div');
                mainBtn.className = `ls-main-select-btn ${isMain ? 'is-main' : ''}`;
                mainBtn.innerHTML = `<div class="ls-main-text">MAIN</div><div class="ls-main-circle"></div>`;
                mainBtn.onclick = () => this.setMain(i);
                
                const editBtn = document.createElement('button');
                editBtn.className = `ls-slot-btn ${i === this.activeSlotIndex ? 'active' : ''}`;
                const num = (i + 1).toString().padStart(2, '0');
                editBtn.innerHTML = `${num} <span class="ls-slot-label">LOADOUT ${i+1}</span>`;
                editBtn.onclick = () => this.selectLoadout(i);
                
                row.appendChild(mainBtn);
                row.appendChild(editBtn);
                btnContainer.appendChild(row);
            });
        },
        
        setMain(index) {
            const LM = window.TacticalShooter.LoadoutManager;
            if (LM) {
                LM.setMainLoadout(index);
                this.renderLoadoutList();
                this.selectLoadout(index);
            }
        },
        
        selectLoadout(index) {
            this.activeSlotIndex = index;
            this.activeSlotType = 'primary'; 
            
            const LM = window.TacticalShooter.LoadoutManager;
            if (LM) {
                const L = LM.getLoadout(index);
                this.currentWeaponId = L.primary.id;
                this.currentAttachments = [...(L.primary.attachments || [])];
                this.activeCategoryTab = this.getCategoryForWeapon(this.currentWeaponId);
            }
            
            this.renderLoadoutList();
            this.renderSlotGrid();
            this.renderWeaponSelector();
            this.updateStats();
            
            this.spawnPreview();
            this.updateAttachmentNodes();
            if (window.TacticalShooter.MenuRenderer) window.TacticalShooter.MenuRenderer.resetFocus();
        },
        
        hasPendingChanges(type) {
            const LM = window.TacticalShooter.LoadoutManager;
            const L = LM.getLoadout(this.activeSlotIndex);
            const savedData = L[type];
            if (!savedData) return false;
            
            // Check if this type is the one currently being edited
            if (this.activeSlotType !== type) return false;
            
            // Compare ID
            if (this.currentWeaponId !== savedData.id) return true;
            
            // Compare Attachments
            const savedAtts = savedData.attachments || [];
            if (this.currentAttachments.length !== savedAtts.length) return true;
            
            const sortedCurrent = [...this.currentAttachments].sort();
            const sortedSaved = [...savedAtts].sort();
            return JSON.stringify(sortedCurrent) !== JSON.stringify(sortedSaved);
        },

        renderSlotGrid() {
            const container = document.getElementById('ls-slots-grid');
            if (!container) return;
            container.innerHTML = '';
            
            const LM = window.TacticalShooter.LoadoutManager;
            if (!LM) return;

            const L = LM.getLoadout(this.activeSlotIndex);
            const W = window.TacticalShooter.GameData.Weapons;
            const T = window.TacticalShooter.GameData.Throwables;
            
            const getName = (id) => {
                if (W[id]) return W[id].name;
                if (T[id]) return T[id].name;
                return id || "EMPTY";
            };
            
            const getGrenadeLabel = (slotName, id) => {
                const def = T[id];
                const base = (slotName === 'equipment1') ? "SLOT 4" : "SLOT 5";
                if (def && def.slotType) return `${base} (${def.slotType.toUpperCase()})`;
                return `${base} (EMPTY)`;
            };
            
            let anyPending = false;
            
            const createBox = (type, label, weaponId, onClick, isSmall = false) => {
                const wName = getName(weaponId);
                const isEditing = (this.activeSlotType === type);
                let extraClass = isEditing ? 'active' : '';
                
                // Add pending-save class if this slot has unsaved changes
                if (this.hasPendingChanges(type)) {
                    extraClass += ' pending-save';
                    if (this.activeSlotType === type) anyPending = true;
                }

                const box = document.createElement('div');
                box.className = `ls-slot-box ${isSmall?'small':''} ${extraClass}`;
                box.id = `slot-box-${type}`;
                box.onclick = onClick;
                
                let displayName = wName;
                if (isEditing && this.currentWeaponId !== weaponId) {
                    displayName = getName(this.currentWeaponId) + "*"; // Show pending name
                }

                box.innerHTML = `
                    <div class="ls-box-label" style="${isSmall?'font-size:8px;':''}">${label}</div>
                    <div class="ls-box-name" style="${isSmall?'font-size:16px;':''}">${displayName}</div>
                `;
                return box;
            };

            container.appendChild(createBox('primary', 'PRIMARY', L.primary.id, () => this.selectSlotType('primary')));
            container.appendChild(createBox('secondary', 'SECONDARY', L.secondary.id, () => this.selectSlotType('secondary')));
            container.appendChild(createBox('melee', 'MELEE', L.melee.id, () => this.selectSlotType('melee')));
            
            const grenadeGroup = document.createElement('div');
            grenadeGroup.className = 'ls-split-group';
            
            const g1Id = L.equipment1 ? L.equipment1.id : 'FRAG';
            const g2Id = L.equipment2 ? L.equipment2.id : 'FLASH';
            
            grenadeGroup.appendChild(createBox('equipment1', getGrenadeLabel('equipment1', g1Id), g1Id, () => this.selectSlotType('equipment1'), true));
            grenadeGroup.appendChild(createBox('equipment2', getGrenadeLabel('equipment2', g2Id), g2Id, () => this.selectSlotType('equipment2'), true));
            
            container.appendChild(grenadeGroup);
            
            // Toggle Unsaved Warning Text
            const warningEl = document.getElementById('ls-unsaved-warning');
            if (warningEl) {
                if (anyPending) warningEl.classList.add('visible');
                else warningEl.classList.remove('visible');
            }
        },
        
        selectSlotType(type) {
            const el = document.getElementById(`slot-box-${type}`);
            
            // Save Check: If clicking the ACTIVE slot that has CHANGES, Save it.
            if (this.activeSlotType === type && this.hasPendingChanges(type)) {
                this.saveLoadout(true);
                return;
            }
            
            // If switching AWAY from a slot with changes, revert those changes?
            if (this.activeSlotType && this.activeSlotType !== type && this.hasPendingChanges(this.activeSlotType)) {
                if (window.TacticalShooter.UIManager) window.TacticalShooter.UIManager.showNotification("CHANGES DISCARDED", "red");
            }
            
            this.activeSlotType = type;
            document.querySelectorAll('.ls-slot-box.suggested').forEach(e => e.classList.remove('suggested'));
            
            // --- UPDATE WEAPON & TAB BASED ON SAVED SLOT CONTENT ---
            const LM = window.TacticalShooter.LoadoutManager;
            const L = LM.getLoadout(this.activeSlotIndex);
            const data = L[type];
            
            if (data) {
                this.currentWeaponId = data.id;
                this.currentAttachments = [...(data.attachments || [])];
                
                // Determine Category for the item in this slot
                this.activeCategoryTab = this.getCategoryForWeapon(this.currentWeaponId);
                
                this.spawnPreview();
                this.updateAttachmentNodes();
                this.updateStats(); // Refresh stats to baseline
            }
            
            this.renderSlotGrid();
            this.renderWeaponSelector();
            
            if (window.TacticalShooter.MenuRenderer) window.TacticalShooter.MenuRenderer.resetFocus();
        },

        renderWeaponSelector() {
            const container = document.getElementById('ls-weapon-scroller');
            const tabsContainer = document.getElementById('ls-tabs-container');
            if (!container || !tabsContainer) return;
            
            container.innerHTML = '';
            tabsContainer.innerHTML = '';
            
            let tabs = [];
            // Dynamically show Lethal/Tactical tabs for both equipment slots
            if (this.activeSlotType.startsWith('equipment')) {
                tabs = ['LETHAL', 'TACTICAL'];
            } else if (this.activeSlotType === 'primary') {
                tabs = ['ASSAULT', 'SHOTGUN', 'SNIPER', 'SMG'];
            } else if (this.activeSlotType === 'secondary') {
                tabs = ['PISTOL'];
            } else if (this.activeSlotType === 'melee') {
                tabs = ['MELEE'];
            }
            
            tabs.forEach(tab => {
                const btn = document.createElement('button');
                btn.className = `ls-cat-tab ${this.activeCategoryTab === tab ? 'active' : ''}`;
                btn.textContent = tab;
                btn.onclick = () => {
                    this.activeCategoryTab = tab;
                    this.renderWeaponSelector(); 
                };
                tabsContainer.appendChild(btn);
            });
            
            // Render Cards based on active Tab
            if (this.activeCategoryTab === 'LETHAL' || this.activeCategoryTab === 'TACTICAL') {
                const throwables = window.TacticalShooter.GameData.Throwables;
                if (throwables) {
                    for (const id in throwables) {
                        const t = throwables[id];
                        // Filter by type (Lethal vs Tactical)
                        if (t.slotType.toUpperCase() === this.activeCategoryTab) {
                             this.renderCard(container, id, t.name, t.slotType.toUpperCase());
                        }
                    }
                }
            } else {
                // Weapons
                const weapons = window.TacticalShooter.GameData.Weapons;
                for (const id in weapons) {
                    const w = weapons[id];
                    let wCat = 'ASSAULT'; 
                    // Simplified logic
                    if (w.type === 'secondary') wCat = 'PISTOL';
                    else if (w.type === 'melee') wCat = 'MELEE';
                    else if (id.includes('SHOTGUN')) wCat = 'SHOTGUN';
                    else if (id === 'M24' || id.includes('SNIPER')) wCat = 'SNIPER';
                    else if (id.includes('SMG')) wCat = 'SMG';
                    
                    if (wCat === this.activeCategoryTab) {
                        this.renderCard(container, id, w.name, w.type);
                    }
                }
            }
        },
        
        renderCard(container, id, name, type) {
            const isActive = (this.currentWeaponId === id);
            const card = document.createElement('div');
            card.className = `ls-weapon-card ${isActive ? 'active' : ''}`;
            card.innerHTML = `<div class="ls-wep-name">${name}</div><div class="ls-wep-type">${type}</div>`;
            card.onclick = () => this.switchWeapon(id);
            container.appendChild(card);
        },
        
        switchWeapon(id) {
            this.currentWeaponId = id;
            
            // Check if we are switching back to the saved weapon to restore attachments
            const LM = window.TacticalShooter.LoadoutManager;
            const L = LM.getLoadout(this.activeSlotIndex);
            const saved = L[this.activeSlotType];
            
            if (saved && saved.id === id) {
                this.currentAttachments = [...(saved.attachments || [])];
            } else {
                this.currentAttachments = []; // Reset on new weapon type
            }
            
            this.renderWeaponSelector(); 
            this.spawnPreview();
            this.updateAttachmentNodes(); 
            this.updateStats(); // Update stats
            this.renderSlotGrid(); // Update pending UI on slot
            
            if (window.TacticalShooter.MenuRenderer) window.TacticalShooter.MenuRenderer.resetFocus();
        },

        saveLoadout(force = false) {
            const LM = window.TacticalShooter.LoadoutManager;
            let def = window.TacticalShooter.GameData.Weapons[this.currentWeaponId];
            if (!def) def = window.TacticalShooter.GameData.Throwables[this.currentWeaponId];
            if (!def) return;
            
            let targetType = this.activeSlotType;
            if (!targetType) return;
            
            LM.commitWeaponChanges(this.activeSlotIndex, targetType, this.currentWeaponId, this.currentAttachments);
            this.renderSlotGrid();
            
            // Force refresh sidebar immediately
            this.renderLoadoutList();
            
            // Also refresh quick-select menus elsewhere in UI
            if (window.TacticalShooter.PlayerState) {
                window.TacticalShooter.PlayerState.renderLoadoutPicker('menu-loadout-quick-select');
                window.TacticalShooter.PlayerState.renderLoadoutPicker('deployment-loadout-container');
            }
            
            LM.equipLoadout(this.activeSlotIndex);
            LM.activeSlot = targetType;
            
            // Re-spawn the preview for the weapon we JUST saved (overwriting the equipLoadout reset)
            this.spawnPreview();
            
            // Update stats to clear "deltas" since Saved == Current now
            this.updateStats();
            
            if (window.TacticalShooter.UIManager) window.TacticalShooter.UIManager.showNotification(`LOADOUT SAVED`, "blue");
        },
        
        spawnPreview() {
            if (window.TacticalShooter.MenuRenderer) {
                const LM = window.TacticalShooter.LoadoutManager;
                let def = null;
                if (window.TacticalShooter.GameData.Weapons[this.currentWeaponId]) {
                    def = LM.generateModifiedDef(this.currentWeaponId, this.currentAttachments);
                } else if (window.TacticalShooter.GameData.Throwables[this.currentWeaponId]) {
                    def = window.TacticalShooter.GameData.Throwables[this.currentWeaponId];
                }
                
                window.TacticalShooter.MenuRenderer.setTargetElement('ls-preview-container'); 
                window.TacticalShooter.MenuRenderer.spawnWeapon(def);
                window.TacticalShooter.MenuRenderer.start();
                
                const loop = () => {
                    const screen = document.getElementById('loadout-screen');
                    if (!screen || !screen.classList.contains('active')) {
                        this.loopRunning = false; return;
                    }
                    this.updateNodePositions();
                    requestAnimationFrame(loop);
                };
                if (!this.loopRunning) {
                    this.loopRunning = true;
                    requestAnimationFrame(loop);
                }
            }
        },
        
        updateAttachmentNodes() {
            const container = document.getElementById('ls-attachment-overlay');
            if (!container) return;
            container.innerHTML = '';
            if (window.TacticalShooter.GameData.Throwables[this.currentWeaponId]) return;
            const LM = window.TacticalShooter.LoadoutManager;
            const def = LM.generateModifiedDef(this.currentWeaponId, this.currentAttachments);
            if (!def || !def.attachmentSlots) return;
            if (!window.TacticalShooter.StatSystem) return;
            
            def.attachmentSlots.forEach(slot => {
                if (['rail_left', 'rail_right', 'rail_bottom'].includes(slot.type)) {
                    if (this.currentWeaponId === 'SMG' && !this.currentAttachments.includes('smg_hg_rail')) return;
                }
                if (this.currentWeaponId === 'PISTOL' && this.currentAttachments.includes('pistol_akimbo') && slot.type === 'optic') return;

                const node = document.createElement('div');
                node.className = 'att-node';
                node.dataset.slotType = slot.type;
                const dot = document.createElement('div'); dot.className = 'att-dot'; node.appendChild(dot);
                const label = document.createElement('div'); label.className = 'att-label'; label.textContent = slot.name; node.appendChild(label);
                
                const dd = document.createElement('div'); dd.className = 'att-dropdown';
                const options = this.getAttachmentsForSlot(slot.type);
                options.forEach(opt => {
                    const row = document.createElement('div');
                    row.className = `att-option ${this.currentAttachments.includes(opt.id) ? 'selected' : ''}`;
                    row.textContent = opt.name;
                    
                    // Tooltip Injection for Attachments
                    if (opt.description) {
                        row.setAttribute('data-tooltip', opt.description);
                    }
                    
                    row.onclick = (e) => { e.stopPropagation(); this.toggleAttachment(opt.id, slot.type); node.classList.remove('active'); if (window.TacticalShooter.MenuRenderer) window.TacticalShooter.MenuRenderer.resetFocus(); };
                    dd.appendChild(row);
                });
                node.appendChild(dd);

                dot.onclick = (e) => { e.stopPropagation(); const wasActive = node.classList.contains('active'); document.querySelectorAll('.att-node').forEach(n => n.classList.remove('active')); if (!wasActive) { node.classList.add('active'); if (window.TacticalShooter.MenuRenderer) { const pos = { ...slot.pos }; const localPos = new window.THREE.Vector3(pos.x, pos.y, pos.z); window.TacticalShooter.MenuRenderer.focusOn(localPos); } } else { if (window.TacticalShooter.MenuRenderer) window.TacticalShooter.MenuRenderer.resetFocus(); } };
                container.appendChild(node);
            });
            
            const closeHandler = (e) => { if (!e.target.closest('.att-node')) { document.querySelectorAll('.att-node.active').forEach(n => n.classList.remove('active')); if (window.TacticalShooter.MenuRenderer) window.TacticalShooter.MenuRenderer.resetFocus(); } };
            if (this._boundCloseHandler) document.removeEventListener('click', this._boundCloseHandler);
            this._boundCloseHandler = closeHandler;
            document.addEventListener('click', this._boundCloseHandler);
        },

        updateNodePositions() {
            if (window.TacticalShooter.GameData.Throwables[this.currentWeaponId]) return;
            const renderer = window.TacticalShooter.MenuRenderer;
            if (!renderer || !renderer.active) return;
            const camera = renderer.camera;
            const weaponMesh = renderer.gunMesh;
            const LM = window.TacticalShooter.LoadoutManager;
            const def = LM.generateModifiedDef(this.currentWeaponId, this.currentAttachments);
            if (!weaponMesh || !camera || !def || !def.attachmentSlots) return;
            
            const container = document.getElementById('ls-attachment-overlay');
            const width = container.clientWidth;
            const height = container.clientHeight;
            const nodes = Array.from(container.querySelectorAll('.att-node'));
            if (!this._tempPos) this._tempPos = new window.THREE.Vector3();
            
            const hasTriRail = this.currentAttachments.includes('smg_hg_rail');
            const hasAkimbo = this.currentWeaponId === 'PISTOL' && this.currentAttachments.includes('pistol_akimbo');

            const validSlots = def.attachmentSlots.filter(s => {
                if (['rail_left', 'rail_right', 'rail_bottom'].includes(s.type)) {
                    if (this.currentWeaponId === 'SMG' && !hasTriRail) return false;
                }
                if (this.currentWeaponId === 'PISTOL' && hasAkimbo && s.type === 'optic') return false;
                return true;
            });

            validSlots.forEach((slotConfig, i) => {
                const node = nodes[i];
                if (!node) return;
                this._tempPos.set(slotConfig.pos.x, slotConfig.pos.y, slotConfig.pos.z);
                weaponMesh.updateMatrixWorld();
                this._tempPos.applyMatrix4(weaponMesh.matrixWorld);
                this._tempPos.project(camera);
                const x = (this._tempPos.x * .5 + .5) * width;
                const y = (this._tempPos.y * -.5 + .5) * height;
                if (this._tempPos.z > 1) { node.style.display = 'none'; } 
                else { node.style.display = 'flex'; node.style.left = `${x}px`; node.style.top = `${y}px`; }
            });
        },
        
        getAttachmentsForSlot(type) {
            const StatSystem = window.TacticalShooter.StatSystem;
            const GameData = window.TacticalShooter.GameData;
            const allAtts = StatSystem ? StatSystem.getAllAttachmentsForWeapon(this.currentWeaponId, GameData) : (GameData.Attachments || {});
            let noneLabel = "NONE";
            if (type === 'optic') noneLabel = "DEFAULT SIGHT";
            if (type === 'handguard') noneLabel = "POLYMER (DEFAULT)";
            if (type === 'stock') noneLabel = "STANDARD STOCK";
            if (type === 'magazine') {
                if (this.currentWeaponId === 'SMG') noneLabel = "30 ROUND MAG";
                else if (this.currentWeaponId === 'PISTOL') noneLabel = "15 ROUND MAG";
                else if (this.currentWeaponId.includes('SHOTGUN')) noneLabel = "TUBE (6 SHELLS)";
                else if (this.currentWeaponId === 'M24') noneLabel = "5 ROUND INTERNAL";
                else noneLabel = "STANDARD MAG";
            }
            if (type === 'conversion') noneLabel = "STANDARD BARREL";
            if (type === 'barrel') noneLabel = "NONE";

            const list = [{ id: null, name: noneLabel }];
            const isSmg = this.currentWeaponId === 'SMG';
            const isPistol = this.currentWeaponId === 'PISTOL';
            const isShotgun = this.currentWeaponId.includes('SHOTGUN');
            const hasPDW = this.currentAttachments.includes('smg_conversion_pdw');
            
            // --- M24 RESTRICTION FILTER ---
            const isM24 = (this.currentWeaponId === 'M24');

            for (const id in allAtts) {
                const att = allAtts[id];
                if (att.type !== type) continue;
                
                // Exclude Red Dot / Holo / Suppressors from M24
                if (isM24) {
                    if (id.includes('optic_')) continue; // Removes Red Dot, Holo
                    if (att.name.toLowerCase().includes('suppressor')) continue; 
                }

                if (id.startsWith('smg_') && !isSmg) continue;
                if (id.startsWith('pistol_') && !isPistol) continue;
                if (id.startsWith('shotgun_') && !isShotgun) continue;
                if (att.requirements) {
                    const reqsMet = att.requirements.every(reqId => this.currentAttachments.includes(reqId));
                    if (!reqsMet) continue;
                }
                if (hasPDW) {
                    if (id === 'smg_hg_rail') continue;
                    if (id === 'smg_stock_fixed') continue; 
                }
                // Include description from attribute data
                list.push({ id: id, name: att.name, description: att.description });
            }
            return list;
        },
        
        toggleAttachment(id, type) {
            const StatSystem = window.TacticalShooter.StatSystem;
            const GameData = window.TacticalShooter.GameData;
            const allAtts = StatSystem ? StatSystem.getAllAttachmentsForWeapon(this.currentWeaponId, GameData) : (GameData.Attachments || {});
            this.currentAttachments = this.currentAttachments.filter(currId => {
                const a = allAtts[currId]; return a ? a.type !== type : true; 
            });
            if (id) {
                const newAtt = allAtts[id];
                if (newAtt && newAtt.excludes) { this.currentAttachments = this.currentAttachments.filter(currId => !newAtt.excludes.includes(currId)); }
                if (id === 'smg_conversion_pdw') {
                    this.currentAttachments = this.currentAttachments.filter(cid => cid !== 'smg_hg_rail');
                    this.currentAttachments = this.currentAttachments.filter(cid => cid !== 'smg_stock_fixed');
                    this.currentAttachments = this.currentAttachments.filter(cid => { const a = allAtts[cid]; return !(a && a.type.startsWith('rail_')); });
                }
                if (id === 'pistol_akimbo') { this.currentAttachments = this.currentAttachments.filter(cid => { const a = allAtts[cid]; return !(a && a.type === 'optic'); }); }
                this.currentAttachments.push(id);
            }
            let changed = true;
            while(changed) {
                changed = false;
                this.currentAttachments = this.currentAttachments.filter(currId => {
                    const att = allAtts[currId];
                    if (att && att.requirements) {
                        const reqsMet = att.requirements.every(reqId => this.currentAttachments.includes(reqId));
                        if (!reqsMet) { changed = true; return false; }
                    }
                    return true;
                });
            }
            
            this.spawnPreview();
            this.updateAttachmentNodes();
            this.renderSlotGrid(); 
            this.updateStats(); 
        },
        
        updateStats() {
            if (window.TacticalShooter.LoadoutStats) {
                const LM = window.TacticalShooter.LoadoutManager;
                
                let currentDef = null;
                if (window.TacticalShooter.GameData.Weapons[this.currentWeaponId]) {
                    currentDef = LM.generateModifiedDef(this.currentWeaponId, this.currentAttachments);
                } else if (window.TacticalShooter.GameData.Throwables[this.currentWeaponId]) {
                    currentDef = window.TacticalShooter.GameData.Throwables[this.currentWeaponId];
                }
                
                const L = LM.getLoadout(this.activeSlotIndex);
                const savedData = L[this.activeSlotType];
                let savedDef = null;
                if (savedData && savedData.id) {
                    if (window.TacticalShooter.GameData.Weapons[savedData.id]) {
                        savedDef = LM.generateModifiedDef(savedData.id, savedData.attachments);
                    } else if (window.TacticalShooter.GameData.Throwables[savedData.id]) {
                        savedDef = window.TacticalShooter.GameData.Throwables[savedData.id];
                    }
                }
                
                window.TacticalShooter.LoadoutStats.update(currentDef, savedDef);
            }
        }
    };
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.LoadoutUI = LoadoutUI;
})();
