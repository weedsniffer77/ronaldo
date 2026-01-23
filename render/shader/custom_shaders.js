
// js/render/shader/custom_shaders.js
(function() {
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.Shaders = {
        init: function() {
            if (!window.THREE) return;
            const THREE = window.THREE;

            this.DamageShader = {
                uniforms: {
                    "tDiffuse": { value: null },
                    "intensity": { value: 0.0 },
                    "vColor": { value: new THREE.Color(0.8, 0.0, 0.0) } // Default Red
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D tDiffuse;
                    uniform float intensity;
                    uniform vec3 vColor;
                    varying vec2 vUv;

                    void main() {
                        vec2 center = vec2(0.5, 0.5);
                        vec2 toCenter = center - vUv;
                        float dist = length(toCenter);
                        
                        vec3 color = vec3(0.0);
                        if (intensity > 0.01) {
                            // Increased multiplier from 0.08 to 0.3 for stronger peripheral blur
                            float blurStrength = intensity * 0.3 * dist;
                            float total = 0.0;
                            for(float t = 0.0; t <= 4.0; t++) {
                                float percent = t / 4.0;
                                color += texture2D(tDiffuse, vUv + toCenter * percent * blurStrength).rgb;
                                total += 1.0;
                            }
                            color /= total;
                        } else {
                            color = texture2D(tDiffuse, vUv).rgb;
                        }

                        float vignette = dist * dist * 4.0 * intensity;
                        color = mix(color, vColor, clamp(vignette, 0.0, 0.7));

                        gl_FragColor = vec4(color, 1.0);
                    }
                `
            };

            this.RedDotShader = {
                uniforms: { "reticleColor": { value: new THREE.Color(0xff0000) } },
                vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
                fragmentShader: `
                    uniform vec3 reticleColor;
                    varying vec2 vUv;
                    void main() {
                        vec2 uv = vUv - 0.5;
                        float d = length(uv);
                        
                        // Very sharp inner dot
                        float dot = 1.0 - smoothstep(0.02, 0.04, d);
                        
                        // Faint Glow
                        float glow = (1.0 - smoothstep(0.0, 0.25, d)) * 0.15;
                        
                        float alpha = dot + glow;
                        
                        // ABSOLUTE DISCARD: If no dot/glow, don't render pixel at all
                        if (alpha < 0.05) discard;
                        
                        gl_FragColor = vec4(reticleColor * 3.0, alpha); 
                    }
                `
            };

            this.HoloShader = {
                uniforms: { "reticleColor": { value: new THREE.Color(0xffffff) } },
                vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
                fragmentShader: `
                    uniform vec3 reticleColor;
                    varying vec2 vUv;
                    void main() {
                        vec2 uv = vUv - 0.5;
                        uv.y += 0.05; 
                        
                        float d = length(uv);
                        
                        float dot = 1.0 - smoothstep(0.015, 0.025, d);
                        float ring = smoothstep(0.25, 0.26, d) * (1.0 - smoothstep(0.28, 0.29, d));
                        
                        float angle = atan(uv.y, uv.x);
                        float tickMask = step(0.9, abs(sin(angle * 2.0))); 
                        float tick = ring * tickMask;
                        
                        float shape = max(dot, ring);
                        
                        if (shape < 0.05) discard;

                        gl_FragColor = vec4(reticleColor * 2.0, shape);
                    }
                `
            };
            
            // Post Effects
            this.Vignette = window.TacticalShooter.Shaders.Vignette || {};
            this.ChromaticAberration = window.TacticalShooter.Shaders.ChromaticAberration || {};
            this.MotionBlur = window.TacticalShooter.Shaders.MotionBlur || {};
            
            console.log('CustomShaders: Initialized.');
        }
    };
})();
