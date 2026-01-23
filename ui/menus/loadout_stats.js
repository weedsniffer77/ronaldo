
// js/ui/menus/loadout_stats.js
(function() {
    const LoadoutStats = {
        container: null,
        
        init(parentElement) {
            this.container = document.createElement('div');
            this.container.id = 'ls-stats-panel';
            parentElement.appendChild(this.container);
        },
        
        update(currentDef, savedDef) {
            if (!this.container) return;
            
            const StatSystem = window.TacticalShooter.StatSystem;
            if (!StatSystem) return;

            const curr = StatSystem.getDisplayStats(currentDef);
            const saved = StatSystem.getDisplayStats(savedDef);
            
            let labels = {};
            
            if (curr.isThrowable) {
                labels = {
                    damage: "DAMAGE",
                    radius: "EFFECT RADIUS"
                };
            } else if (curr.isMelee) {
                labels = {
                    damage: "DAMAGE",
                    mobility: "MOBILITY",
                    attackSpeed: "ATTACK SPEED"
                };
            } else {
                labels = {
                    damage: "DAMAGE",
                    fireRate: "FIRE RATE",
                    range: "RANGE",
                    accuracy: "ACCURACY",
                    control: "CONTROL",
                    mobility: "MOBILITY",
                    reload: "RELOAD SPEED"
                };
            }
            
            let html = `<div class="stats-grid">`;
            
            for (const key in labels) {
                const valCurr = curr[key];
                const valSaved = saved[key] !== undefined ? saved[key] : valCurr; 
                
                // --- BAR SCALE ---
                // Clamp to 100%
                const pctCurr = Math.min(100, valCurr / 2);
                const pctSaved = Math.min(100, valSaved / 2);
                
                let diffHtml = '';
                let valueHtml = `<span class="stat-num">${valCurr}</span>`;
                
                // --- SPECIAL FORMATTING ---
                if (key === 'reload' && !curr.isThrowable && !curr.isMelee) {
                    valueHtml = `<span class="stat-num">${curr.rawReload.toFixed(1)}s</span>`;
                }
                else if (key === 'attackSpeed' && curr.isMelee) {
                    valueHtml = `<span class="stat-num">${curr.rawSpeed.toFixed(2)}s</span>`;
                }
                else if (key === 'radius') {
                    valueHtml = `<span class="stat-num">${curr.rawRadius}m</span>`;
                }
                else if (key === 'damage' && !curr.isMelee) {
                    valueHtml = `<span class="stat-num">${curr.rawDamage}</span>`;
                }
                else if (key === 'range' && !curr.isMelee) {
                    valueHtml = `<span class="stat-num">${curr.rawRange}m</span>`;
                }
                else if (key === 'mobility') {
                    // Show Sprint Speed % (True Number), but bar is composite
                    valueHtml = `<span class="stat-num">${curr.rawSprint || valCurr}%</span>`;
                }

                // Delta Logic
                if (valCurr > valSaved) {
                    // Gain (Green)
                    const diffPct = Math.max(0, pctCurr - pctSaved);
                    diffHtml = `<div class="stat-delta gain" style="left: ${pctSaved}%; width: ${diffPct}%;"></div>`;
                    valueHtml = `<span class="stat-num gain">${valueHtml.replace(/<[^>]*>/g, '')}</span>`; 
                } else if (valCurr < valSaved) {
                    // Loss (Red)
                    const diffPct = Math.max(0, pctSaved - pctCurr);
                    diffHtml = `<div class="stat-delta loss" style="left: ${pctCurr}%; width: ${diffPct}%;"></div>`;
                    valueHtml = `<span class="stat-num loss">${valueHtml.replace(/<[^>]*>/g, '')}</span>`;
                }
                
                const whiteWidth = (valCurr > valSaved) ? pctSaved : pctCurr;

                html += `
                    <div class="stat-row">
                        <div class="stat-label">${labels[key]}</div>
                        <div class="stat-track">
                            <div class="stat-bar-bg"></div>
                            <div class="stat-bar-fill" style="width: ${whiteWidth}%"></div>
                            ${diffHtml}
                            ${key === 'mobility' ? '<div class="stat-marker" style="left: 50%;"></div>' : ''}
                        </div>
                        <div class="stat-value-box">${valueHtml}</div>
                    </div>
                `;
            }
            
            html += `</div>`;
            this.container.innerHTML = html;
        }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.LoadoutStats = LoadoutStats;
})();
