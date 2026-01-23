
// js/render/shader/post_processor.js
(function() {
    const PostProcessor = {
        renderer: null,
        scene: null,
        camera: null,
        composer: null,
        
        // Active Passes
        renderPass: null,
        ssaoPass: null,
        bloomPass: null,
        damagePass: null,
        
        // Standby Passes (Disabled by default)
        bokehPass: null,
        vignettePass: null,
        chromaticPass: null,
        motionBlurPass: null,
        
        outputPass: null,
        enabled: true,
        
        // Damage Effect State
        damageIntensity: 0.0,
        vignetteState: 'clear', // clear, damaged, healing
        severeDamageTimer: 0,
        
        settings: {
            ssao: { enabled: false, kernelRadius: 16, minDistance: 0.005, maxDistance: 0.1 },
            bloom: { enabled: true, strength: 0.8, radius: 0.4, threshold: 0.9 },
            bokeh: { enabled: false, focus: 10.0, aperture: 0.0001, maxblur: 0.01 }, // Standby
            toneMapping: { enabled: true, exposure: 1.0 }
        },
        
        init(renderer, scene, camera, lightingData) {
            this.renderer = renderer;
            this.scene = scene;
            this.camera = camera;
            
            if (!renderer || !scene || !camera) {
                console.warn('PostProcessor: Invalid init params');
                return;
            }
            
            this.composer = new window.EffectComposer(renderer);
            
            // 1. Render Pass (Base)
            this.renderPass = new window.RenderPass(scene, camera);
            this.composer.addPass(this.renderPass);
            
            // 2. SSAO (Optional)
            if (window.SSAOPass && this.settings.ssao.enabled) {
                try { this.initSSAO(); } catch (e) { console.warn('SSAO Failed', e); }
            }
            
            // 3. Bloom
            const bConfig = (lightingData && lightingData.postProcessing && lightingData.postProcessing.bloom) 
                ? lightingData.postProcessing.bloom : this.settings.bloom;
            this.initBloom(bConfig);
            
            // 4. Bokeh / Depth of Field (STANDBY - Disabled)
            this.initBokeh(this.settings.bokeh);

            // 5. FX Library Passes (STANDBY - Disabled)
            this.initEffectsLibrary();

            // 6. Damage Effect (Active Logic)
            this.initDamagePass();
            
            // 7. Tone Mapping
            this.initToneMapping();
            
            // 8. Output
            this.outputPass = new window.OutputPass();
            this.composer.addPass(this.outputPass);
        },
        
        initSSAO() {
            this.ssaoPass = new window.SSAOPass(this.scene, this.camera);
            this.ssaoPass.kernelRadius = this.settings.ssao.kernelRadius;
            this.ssaoPass.minDistance = this.settings.ssao.minDistance;
            this.ssaoPass.maxDistance = this.settings.ssao.maxDistance;
            this.ssaoPass.enabled = this.settings.ssao.enabled;
            this.composer.addPass(this.ssaoPass);
        },
        
        initBloom(settings) {
            // OPTIMIZATION: Use half resolution for bloom buffer to save fill rate
            const width = Math.floor(window.innerWidth / 2);
            const height = Math.floor(window.innerHeight / 2);
            
            this.bloomPass = new window.UnrealBloomPass(
                new THREE.Vector2(width, height),
                settings.strength, settings.radius, settings.threshold
            );
            if (this.settings.bloom.enabled) this.composer.addPass(this.bloomPass);
        },
        
        initBokeh(settings) {
            if (!window.BokehPass) return;
            const width = window.innerWidth;
            const height = window.innerHeight;
            
            this.bokehPass = new window.BokehPass(this.scene, this.camera, {
                focus: settings.focus,
                aperture: settings.aperture,
                maxblur: settings.maxblur,
                width: width,
                height: height
            });
            this.bokehPass.enabled = settings.enabled; // False by default
            this.composer.addPass(this.bokehPass);
        },
        
        initEffectsLibrary() {
            if (!window.TacticalShooter.Shaders) return;
            
            // Vignette
            if (window.TacticalShooter.Shaders.Vignette) {
                this.vignettePass = new window.ShaderPass(window.TacticalShooter.Shaders.Vignette);
                this.vignettePass.enabled = false; // Standby
                this.composer.addPass(this.vignettePass);
            }
            
            // Chromatic Aberration
            if (window.TacticalShooter.Shaders.ChromaticAberration) {
                this.chromaticPass = new window.ShaderPass(window.TacticalShooter.Shaders.ChromaticAberration);
                this.chromaticPass.enabled = false; // Standby
                this.composer.addPass(this.chromaticPass);
            }
            
            // Motion Blur
            if (window.TacticalShooter.Shaders.MotionBlur) {
                this.motionBlurPass = new window.ShaderPass(window.TacticalShooter.Shaders.MotionBlur);
                
                // CRITICAL FIX: Ensure uniforms are THREE Types, not plain objects
                this.motionBlurPass.uniforms['resolution'].value = new THREE.Vector2(window.innerWidth, window.innerHeight);
                this.motionBlurPass.uniforms['velocity'].value = new THREE.Vector2(0, 0);
                
                this.motionBlurPass.enabled = false; // Standby
                this.composer.addPass(this.motionBlurPass);
            }
        },
        
        initDamagePass() {
            if (window.TacticalShooter.Shaders && window.TacticalShooter.Shaders.DamageShader) {
                this.damagePass = new window.ShaderPass(window.TacticalShooter.Shaders.DamageShader);
                this.damagePass.uniforms['intensity'].value = 0.0;
                this.composer.addPass(this.damagePass);
            }
        },
        
        initToneMapping() {
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = this.settings.toneMapping.exposure;
        },
        
        // NEW: Scaled Damage Impulse
        addDamageImpulse(amount) {
            const impulse = amount / 60.0;
            this.damageIntensity = Math.min(1.0, this.damageIntensity + impulse);
            if (amount > 50) {
                this.severeDamageTimer = 1.5; // Sustain effects for 1.5 seconds
            }
        },
        
        setVignetteState(state) {
            this.vignetteState = state;
        },
        
        reset() {
            this.damageIntensity = 0.0;
            this.severeDamageTimer = 0;
            this.vignetteState = 'clear';
            if (this.damagePass) {
                this.damagePass.uniforms['intensity'].value = 0.0;
            }
        },

        render(dt, activeScene, activeCamera) {
            // SYNC UPDATE: Ensure composer uses the currently active camera/scene
            if (activeScene && activeCamera) {
                if (this.renderPass) {
                    this.renderPass.scene = activeScene;
                    this.renderPass.camera = activeCamera;
                }
                // Bokeh also needs update if active
                if (this.bokehPass && this.bokehPass.enabled) {
                     this.bokehPass.scene = activeScene;
                     this.bokehPass.camera = activeCamera;
                }
            }

            if (!this.enabled || !this.composer) {
                if (this.renderer && activeScene && activeCamera) {
                    this.renderer.render(activeScene, activeCamera);
                }
                return;
            }
            
            // Logic for Damage/Healing
            let targetIntensity = 0;
            let targetColor = new THREE.Color(0.8, 0.0, 0.0); // Red
            let lerpSpeed = 1.5;

            if (this.vignetteState === 'damaged') {
                // Keep intensity high
                if (this.damageIntensity < 0.3) this.damageIntensity = 0.3; // Min floor
                // Decay down to floor if high
                this.damageIntensity = THREE.MathUtils.lerp(this.damageIntensity, 0.3, dt * 1.5);
                targetColor.setRGB(0.8, 0.0, 0.0); // Deep Red
            } 
            else if (this.vignetteState === 'healing') {
                // Pulse or Steady Pale - REDUCED INTENSITY
                const pulse = (Math.sin(performance.now() * 0.005) + 1) * 0.05; 
                this.damageIntensity = THREE.MathUtils.lerp(this.damageIntensity, 0.1 + pulse, dt * 2.0);
                targetColor.setRGB(0.9, 0.7, 0.7); // Pale Pink/White
            }
            else {
                // Clear
                let decayTarget = 0;
                if (this.severeDamageTimer > 0) {
                    this.severeDamageTimer -= dt;
                    decayTarget = 0.7; // Keep it blurry/red during severe trauma
                    targetColor.setRGB(0.6, 0.0, 0.0); // Bright Red Flash
                }
                
                // Decay towards target
                this.damageIntensity = THREE.MathUtils.lerp(this.damageIntensity, decayTarget, dt * 2.0);
            }

            if (this.damagePass) {
                this.damagePass.uniforms['intensity'].value = this.damageIntensity;
                // Interpolate Color
                const currentColor = this.damagePass.uniforms['vColor'].value;
                currentColor.lerp(targetColor, dt * 3.0);
            }
            
            this.composer.render(dt);
        },
        
        resize(width, height) {
            if (this.composer) {
                this.composer.setSize(width, height);
            }
            if (this.ssaoPass) this.ssaoPass.setSize(width, height);
            if (this.bloomPass) {
                // OPTIMIZATION: Maintain half-res scale on resize
                this.bloomPass.resolution.set(Math.floor(width/2), Math.floor(height/2));
            }
            if (this.bokehPass) {
                this.bokehPass.setSize(width, height);
                if (this.bokehPass.uniforms['aspect']) {
                    this.bokehPass.uniforms['aspect'].value = width / height;
                }
            }
            if (this.motionBlurPass) {
                // Now safe to call set because we initialized as Vector2
                this.motionBlurPass.uniforms['resolution'].value.set(width, height);
            }
        }
    };
    window.TacticalShooter = window.TacticalShooter || {};
    window.TacticalShooter.PostProcessor = PostProcessor;
})();
