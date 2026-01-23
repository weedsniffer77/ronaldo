
// js/ui/hud/rifle_hud.js
(function() {
    const RifleHUD = {
        container: null,
        counterEl: null,
        shellsEl: null,
        
        init() {
            // Reusing the shotgun container structure but changing ID/classes slightly to keep logic clean
            // Actually, we can reuse the same DOM element and just style the shells differently via JS
            
            let hud = document.getElementById('shotgun-hud'); // Reuse location
            if (!hud) {
                hud = document.createElement('div');
                hud.id = 'shotgun-hud'; // Keep ID for CSS position
                hud.style.display = 'none';
                hud.innerHTML = `<div id="shotgun-counter"></div><div id="shotgun-shells"></div>`;
                const parent = document.getElementById('hud');
                if (parent) parent.appendChild(hud);
            }
            
            this.container = hud;
            this.counterEl = document.getElementById('shotgun-counter');
            this.shellsEl = document.getElementById('shotgun-shells');
        },
        
        show() {
            if (this.container) this.container.style.display = 'block';
        },
        
        hide() {
            if (this.container) this.container.style.display = 'none';
        },
        
        update(playerState, weaponDef) {
            if (!this.container) return;
            
            // 1. Update Text
            let color = '#ccc';
            if (playerState.isReloading) color = '#888';
            else if (playerState.currentAmmo === 0) color = '#ff4444';
            
            this.counterEl.innerHTML = `${playerState.currentAmmo} <span class="mag-cap">/ ${playerState.maxAmmo}</span> <span class="ammo-reserve">${playerState.reserveAmmo}</span>`;
            this.counterEl.style.color = color;
            
            // 2. Render Rifle Rounds
            this.shellsEl.innerHTML = '';
            const maxShells = playerState.maxAmmo;
            
            // Check readiness (Not reloading, not cycling)
            const wm = window.TacticalShooter.WeaponManager;
            const isCycling = wm && wm.fireTimer > 0;
            const isReadyToFire = !playerState.isReloading && !isCycling && playerState.currentAmmo > 0;

            // Limit visual shells if mag is huge (not the case for M24 with 5)
            const countToRender = Math.min(maxShells, 10);
            
            for (let i = 0; i < countToRender; i++) {
                const div = document.createElement('div');
                div.className = 'shell-icon rifle-icon'; // Add rifle class
                
                if (i < playerState.currentAmmo) {
                    div.classList.add('loaded');
                    if (i === (playerState.currentAmmo - 1) && isReadyToFire) {
                        div.classList.add('chambered');
                    }
                }
                this.shellsEl.appendChild(div);
            }
        }
    };
    
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.RifleHUD = RifleHUD;
})();
