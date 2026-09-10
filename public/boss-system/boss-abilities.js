//SEA INVADERS - BOSS ABILITIES

Object.assign(BossSystemV2.prototype, {
    //🟢 boss 1 - EMERALD WARLORD - "Regeneration" (inwithwithbutinand HP)
    regenerationAbility(boss) {
        const now = Date.now();
        
        if (now - boss.uniqueData.lastRegenTime < boss.uniqueData.regenCooldown) {
            return;
        }
        
        const regenAmount = Math.ceil(boss.maxHP * 0.1);
        boss.currentHP = Math.min(boss.maxHP, boss.currentHP + regenAmount);
        
        this.createRegenerationEffect(boss);
        
        boss.uniqueData.lastRegenTime = now;
        //Setting new to interval for with NOTandand
        boss.uniqueData.regenCooldown = 5000 + Math.random() * 5000; //from 5 to 10 withto
        
    },

    //boss 2 - AZURE LEVIatHAN - "Water Shield" (toand 3 yesand)
    waterShieldAbility(boss) {
        if (boss.uniqueData.shieldHP <= 0) {
            boss.uniqueData.shieldHP = boss.uniqueData.maxShieldHP;
            
            this.createWaterShieldEffect(boss);
            
        }
    },

    //🟡 boss 3 - SOLAR KRAKEN - "Meteor Shower" (and to)
    meteorShowerAbility(boss) {
        const meteorCount = 8 + Math.floor(Math.random() * 5); //8-12 andin
        
        //Creating yesand andandto
        for (let i = 0; i < meteorCount; i++) {
            const x = Math.random() * (this.canvas.width - 60) + 30; //fromwith from toin
            
            //Adding andandto and
            this.meteorWarnings = this.meteorWarnings || [];
            this.meteorWarnings.push({
                x: x,
                y: this.canvas.height - 10, //infrom toon
                timer: 1500, //1.5 seconds to and
                maxTimer: 1500,
                size: 30,
                alpha: 1.0
            });
            
            //and and and 1.5 seconds
            setTimeout(() => {
                this.createMeteorBullet(x, -20, boss.color, 0.8); //to and
            }, 1500);
        }
        
        this.createMeteorShowerEffect(boss);
        
    },

    //boss 4 - CRIMSON BEHEMOTH - "Rage" (toon toandinand 7-15 withto, +30% to inwith)
    rageModeAbility(boss) {
        boss.uniqueData.rageMode = true;
        boss.uniqueData.rageDuration = 6000 + Math.random() * 3000; //6-9 withto
        boss.uniqueData.rageStartTime = Date.now();
        
        //inandandin inwith whileand on 55% (1.55x)
        boss.speed = this.getBossConfig().SPEED * 1.55;
        boss.uniqueData.rageSpeedMultiplier = 1.55; //for bullets
        boss.uniqueData.rageFrequencyMultiplier = 1.55; //for withfrom to
        boss.uniqueData.immunetoSlowdown = true; //andand to and to in rage
        
        this.createRageModeEffect(boss);
        
    },

    //🟣 boss 5 - VOID SOVEREIGN - "Temporal Freeze" (andin bullets player on 3 seconds)
    temporalFreezeAbility(boss) {
        if (window.bullets && window.bullets.length > 0) {
            this.playerFrozenBullets = [...window.bullets];
            this.frozenBulletsTime = 3000; //3 seconds
            
            window.bullets.forEach(bullet => {
                bullet.frozenVy = bullet.vy || bullet.speed || 8;
                bullet.vy = 0;
                bullet.speed = 0;
            });
            
            this.createTemporalFreezeEffect();
            
        }
    },

    //andinand bullets player
    unfreezeBullets() {
        if (window.bullets) {
            window.bullets.forEach(bullet => {
                if (bullet.frozenVy !== undefined) {
                    bullet.vy = bullet.frozenVy;
                    bullet.speed = bullet.frozenVy;
                    delete bullet.frozenVy;
                }
            });
        }
        
        this.playerFrozenBullets = [];
    },

    //====== infrom effect for withwithwithbutwith ======

    //effect inwithwithbutinand
    createRegenerationEffect(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height / 2;

        //on and particles for frominandbutwithand
        const particleCount = this.isRealMobile ? 10 : 20;

        for (let i = 0; i < particleCount; i++) {
            this.bossParticles.push({
                x: centerX + (Math.random() - 0.5) * boss.width,
                y: centerY + (Math.random() - 0.5) * boss.height,
                vx: (Math.random() - 0.5) * 2,
                vy: -Math.random() * 3 - 1,
                life: 60,
                maxLife: 60,
                size: Math.random() * 3 + 2,
                color: '#00ff88',
                type: 'regeneration'
            });
        }
    },

    //effect inbut and
    createWaterShieldEffect(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height / 2;
        
        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2;
            const radius = boss.width * 0.344; //or on 18% from 0.42 (0.42 * 0.82 = 0.344)
            
            this.bossParticles.push({
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
                vx: Math.cos(angle) * 0.5,
                vy: Math.sin(angle) * 0.5,
                life: 90,
                maxLife: 90,
                size: 4,
                color: '#0099ff',
                type: 'shield'
            });
        }
    },

    //effect andbut to
    createMeteorShowerEffect(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height / 2;

        //on and particles for frominandbutwithand
        const auraCount = this.isRealMobile ? 12 : 25;
        const sparksCount = this.isRealMobile ? 8 : 15;

        //Creating NOTandwithto into boss
        for (let i = 0; i < auraCount; i++) {
            this.bossParticles.push({
                x: centerX + (Math.random() - 0.5) * boss.width,
                y: centerY + (Math.random() - 0.5) * boss.height,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3,
                life: 80,
                maxLife: 80,
                size: Math.random() * 4 + 2,
                color: Math.random() > 0.5 ? '#ff6600' : '#ffaa00',
                type: 'meteor_aura'
            });
        }

        //toand sparks andandwith inin
        for (let i = 0; i < sparksCount; i++) {
            this.bossParticles.push({
                x: centerX + (Math.random() - 0.5) * boss.width * 0.8,
                y: centerY + boss.height / 2,
                vx: (Math.random() - 0.5) * 2,
                vy: -Math.random() * 4 - 2,
                life: 60,
                maxLife: 60,
                size: Math.random() * 3 + 1,
                color: '#ffcc33',
                type: 'meteor_sparks'
            });
        }
    },
    
    //Creating andbut bullets (useswith in boss-attacks.js)
    createMeteorBullet(x, y, color, speedMultiplier = 1) {
        const config = this.getBossConfig();
        const bullet = {
            x: x - (config.BULLET_SIZE + 8) / 2,
            y: y,
            width: config.BULLET_SIZE + 8,
            height: config.BULLET_SIZE + 8,
            vx: 0,
            vy: config.BULLET_SPEED * 0.7 * speedMultiplier,
            color: color,
            type: 'meteor',
            trail: []
        };
        
        this.bossBullets.push(bullet);
    },

    //effect mode withand
    createRageModeEffect(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height / 2;

        //on and particles for frominandbutwithand
        const particleCount = this.isRealMobile ? 15 : 30;

        for (let i = 0; i < particleCount; i++) {
            this.bossParticles.push({
                x: centerX,
                y: centerY,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 45,
                maxLife: 45,
                size: Math.random() * 4 + 2,
                color: Math.random() > 0.5 ? '#ff3333' : '#ff8800',
                type: 'rage'
            });
        }
    },

    //effect toand inand
    createTemporalFreezeEffect() {
        if (!this.canvas) return;

        //on and particles for frominandbutwithand
        const particleCount = this.isRealMobile ? 15 : 40;

        for (let i = 0; i < particleCount; i++) {
            this.bossParticles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height * 0.8,
                vx: (Math.random() - 0.5) * 2,
                vy: Math.random() * 2 + 1,
                life: 120,
                maxLife: 120,
                size: Math.random() * 3 + 1,
                color: '#9966ff',
                type: 'freeze'
            });
        }
    },

    //effect and and
    createShieldBreakEffect(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height / 2;

        //on and particles for frominandbutwithand
        const explosionCount = this.isRealMobile ? 12 : 24;
        const flashCount = this.isRealMobile ? 6 : 12;

        //inin particles
        for (let i = 0; i < explosionCount; i++) {
            const angle = (i / explosionCount) * Math.PI * 2;
            const speed = 3 + Math.random() * 4;

            this.bossParticles.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 60,
                maxLife: 60,
                size: Math.random() * 5 + 3,
                color: '#0099ff',
                type: 'shield_break'
            });
        }

        //toand toand particle
        for (let i = 0; i < flashCount; i++) {
            this.bossParticles.push({
                x: centerX + (Math.random() - 0.5) * 40,
                y: centerY + (Math.random() - 0.5) * 40,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 45,
                maxLife: 45,
                size: Math.random() * 4 + 2,
                color: '#ffffff',
                type: 'shield_break_flash'
            });
        }

    },

    //Getting states witheffects (for UI and renderand)
    getSpecialEffectsState() {
        return {
            frozenBulletsTime: this.frozenBulletsTime
        };
    }
});

