
// js/ui/prematch/launch_control.js
(function() {
    const LaunchControl = {
        container: null,
        overlay: null, // New top overlay for countdown
        
        init() {
            this.container = document.getElementById('lobby-launch-control');
            
            // Create dedicated countdown overlay if missing
            if (!document.getElementById('lobby-countdown-strip')) {
                this.overlay = document.createElement('div');
                this.overlay.id = 'lobby-countdown-strip';
                this.overlay.style.cssText = `
                    position: fixed;
                    top: 10%;
                    left: 0;
                    width: 100%;
                    height: 40px; /* Reduced Height */
                    display: none;
                    justify-content: center;
                    align-items: center;
                    background: transparent; /* Removed black gradient */
                    z-index: 6000; /* Above Loadout/Settings */
                    pointer-events: none;
                `;
                this.overlay.innerHTML = `
                    <div id="lcd-timer" style="
                        font-family: 'Teko', sans-serif;
                        font-size: 32px; /* Reduced Size */
                        color: #ff4444;
                        text-shadow: 0 0 10px rgba(255, 50, 50, 0.6);
                        letter-spacing: 3px;
                        font-weight: 400;
                        line-height: 1;
                    ">0:00</div>
                `;
                document.body.appendChild(this.overlay);
            } else {
                this.overlay = document.getElementById('lobby-countdown-strip');
            }
        },

        render() {
            if (!this.container) return;
            
            const isHost = window.TacticalShooter.PlayroomManager.isHost;
            const status = window.TacticalShooter.MatchState.state.status;
            
            let btnText = "WAITING FOR HOST";
            let btnClass = "";
            let onClick = null;
            let disabled = true;

            if (isHost) {
                disabled = false;
                if (status === 'LOBBY') {
                    btnText = "START GAME"; 
                    btnClass = "host-idle";
                    onClick = "window.TacticalShooter.MatchState.startCountdown()";
                } else if (status === 'COUNTDOWN') {
                    btnText = "CANCEL"; 
                    btnClass = "counting";
                    onClick = "window.TacticalShooter.MatchState.cancelCountdown()";
                }
            } else {
                if (status === 'COUNTDOWN') {
                    btnText = "GAME STARTING"; 
                    btnClass = "counting";
                    disabled = false; 
                }
            }
            
            this.container.innerHTML = `
                <button id="btn-launch" class="${btnClass}" ${disabled ? 'disabled' : ''} onclick="${onClick || ''}">
                    ${btnText}
                </button>
            `;
        },

        update() {
            const MS = window.TacticalShooter.MatchState;
            const status = MS.state.status;
            
            if (status === 'COUNTDOWN') {
                const now = Date.now();
                const timeLeft = Math.max(0, MS.state.launchTime - now);
                
                // Show Strip
                if (this.overlay) {
                    this.overlay.style.display = 'flex';
                    
                    const sec = Math.floor(timeLeft / 1000);
                    const cs = Math.floor((timeLeft % 1000) / 10); // Centiseconds (00-99)
                    
                    const secStr = sec.toString();
                    const csStr = cs.toString().padStart(2, '0');
                    
                    const display = document.getElementById('lcd-timer');
                    if (display) {
                        display.textContent = `${secStr}:${csStr}`;
                        
                        // Optional: Intensify glow near 0
                        if (sec < 2) {
                            display.style.color = '#ffaaaa';
                            display.style.textShadow = '0 0 20px rgba(255, 100, 100, 0.9)';
                        } else {
                            display.style.color = '#ff4444';
                            display.style.textShadow = '0 0 10px rgba(255, 50, 50, 0.6)';
                        }
                    }
                }
                
                // Hide button text timer since we have the big one
                const btn = document.getElementById('btn-launch');
                if (btn && !window.TacticalShooter.PlayroomManager.isHost) {
                    btn.textContent = "PREPARING...";
                }

            } else {
                if (this.overlay) this.overlay.style.display = 'none';
            }
        }
    };

    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.LaunchControl = LaunchControl;
})();
