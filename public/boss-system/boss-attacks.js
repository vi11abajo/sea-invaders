//SEA INVADERS - BOSS ATTACKS
//fromand inwith andto to for toto from 5 within

//Adding method to in class BossSystemV2
Object.assign(BossSystemV2.prototype, {
    //🟢 boss 1 - EMERALD WARLORD - withbutinon withon attack
    emeraldWarlordAttack(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height;
        
        //withbutinon attack - inwithyes andbuton bullet
        switch(boss.currentPhase) {
            case 1: //1 - on bullet
                this.createStraightBullet(centerX, centerY, boss.color);
                break;
        }
        
    },

    //🟢 toandon attack Emerald Warlord - "Claw Strike" (NOTinand)
    emeraldWarlordSecondaryAttack(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height;
        
        switch(boss.currentPhase) {
            case 1: //1 - and toand
                this.createZigzagBullet(centerX - 50, centerY, boss.color, 'left', 'A');
                this.createZigzagBullet(centerX + 50, centerY, boss.color, 'right', 'B');
                break;
        }
        
    },

    //boss 2 - AZURE LEVIatHAN - "Tidal Wave" (inon bullets withandwithandto)
    azureLeviathan(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height;
        
        switch(boss.currentPhase) {
            case 1: //1 - and bullets
                this.createLargeBullet(centerX, centerY, boss.color);
                break;
                
            case 2: //2 - inon from 7 bullets
                this.createTidalWave(centerX, centerY, boss.color);
                break;
        }
        
    },

    //withattack at andand and - Azure Leviathan
    azureLeviathanceShieldBreakAttack(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height;
        
        //on toin attack at andand and
        const bulletCount = 12;
        for (let i = 0; i < bulletCount; i++) {
            const angle = (i / bulletCount) * Math.PI * 2;
            const bullet = {
                x: centerX - this.getBossConfig().BULLET_SIZE / 2,
                y: centerY,
                width: this.getBossConfig().BULLET_SIZE + 3,
                height: this.getBossConfig().BULLET_SIZE + 3,
                vx: Math.cos(angle) * this.getBossConfig().BULLET_SPEED * 1.2,
                vy: Math.sin(angle) * this.getBossConfig().BULLET_SPEED * 1.2,
                color: boss.color,
                type: 'shield_break',
                trail: []
            };
            
            this.bossBullets.push(bullet);
        }

        //sound inwith boss
        if (window.soundManager) {
            window.soundManager.playSound('bossShoot');
        }

        //Creating toand effect inin and
        this.createShieldBreakEffect(boss);
        
    },

    //🟡 boss 3 - SOLAR KRAKEN - "Solar Flare" (ininandwith bullets)
    solarKrakenAttack(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height;
        
        switch(boss.currentPhase) {
            case 1: //1 - inwith (speed +22%)
                this.createStraightBullet(centerX, centerY, boss.color, 1.22);
                break;
                
            case 2: //2 - toin attack (speed bullets +11%)
                this.createCircularAttack(centerX, centerY, boss.color, 1.11);
                break;
                
            case 3: //3 - inin bullets (to infrom)
                this.createExplosiveBullets(centerX, centerY, boss.color, 5);
                break;
        }
        
    },

    //boss 4 - CRIMSON BEHEMOTH - "Crimson Meteor" (and with rage mode)
    crimsonBehemothAttack(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height;
        
        //Checking mode withand for inandand withtowithand bullets on 55%
        const speedMultiplier = boss.uniqueData.rageMode ? 1.55 : 1.0;
        
        switch(boss.currentPhase) {
            case 1: //1 - andbut and
                this.createMeteorBullet(centerX, centerY, boss.color, speedMultiplier);
                break;
                
            case 2: //2 - in and
                this.createMeteorBullet(centerX - 40, centerY, boss.color, speedMultiplier);
                this.createMeteorBullet(centerX + 40, centerY, boss.color, speedMultiplier);
                break;
                
            case 3: //3 - and
                this.createMeteorBullet(centerX - 60, centerY, boss.color, speedMultiplier);
                this.createMeteorBullet(centerX, centerY, boss.color, speedMultiplier);
                this.createMeteorBullet(centerX + 60, centerY, boss.color, speedMultiplier);
                break;
                
            case 4: //4 - withto mode
                this.createBerserkAttack(centerX, centerY, boss.color, speedMultiplier);
                break;
        }
        
    },

    //🟣 boss 5 - VOID SOVEREIGN - "Void Rift" (and toand)
    voidSovereignAttack(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height;
        
        switch(boss.currentPhase) {
            case 1: //1 - and + inwith
                this.createTeleportAttack(boss, centerX, centerY);
                break;
                
            case 2: //2 - and + withand toand
                this.createTeleportAttack(boss, centerX, centerY);
                setTimeout(() => {
                    this.createSpiralAttack(boss.x + boss.width/2, boss.y + boss.height, boss.color);
                }, 200);
                break;
                
            case 3: //3 - and + toandinand
                this.createTeleportAttack(boss, centerX, centerY);
                setTimeout(() => {
                    this.createCloneAttack(boss);
                }, 300);
                break;
                
            case 4: //4 - and + inandand waves
                this.createTeleportAttack(boss, centerX, centerY);
                setTimeout(() => {
                    this.createGravityWave(boss.x + boss.width/2, boss.y + boss.height, boss.color);
                }, 250);
                break;
                
            case 5: //5 - andon with ( andand)
                this.createChaosAttack(boss);
                break;
        }
        
    },

    //====== fromand withand andin bullets ======

    //and bullets (for Emerald Warlord)
    createZigzagBullet(x, y, color, direction, zigzagPattern) {
        const config = this.getBossConfig();
        
        const bullet = {
            x: x - config.BULLET_SIZE / 2,
            y: y,
            width: config.BULLET_SIZE,
            height: config.BULLET_SIZE,
            vx: zigzagPattern === 'A' ? -2.0 : 2.0, //inin speed
            vy: config.BULLET_SPEED, //inin withyes inandto speed
            color: color,
            type: 'zigzag',
            zigzagTime: 0, //inwith onandon with 0
            zigzagPattern: zigzagPattern, //andto ID on
            zigzagCounter: 0, //scoreandto with oninand
            trail: []
        };

        this.bossBullets.push(bullet);

        //sound inwith boss
        if (window.soundManager) {
            window.soundManager.playSound('bossShoot');
        }
    },

    //atandinon inon (for Azure Leviathan)
    createTidalWave(centerX, centerY, color) {
        const config = this.getBossConfig();
        const bulletCount = 7;
        
        for (let i = 0; i < bulletCount; i++) {
            const angle = (i - 3) * 0.5; //from -1.5 to +1.5 and (~172° in)
            const bullet = {
                x: centerX - config.BULLET_SIZE / 2,
                y: centerY,
                width: config.BULLET_SIZE,
                height: config.BULLET_SIZE,
                vx: Math.sin(angle) * config.BULLET_SPEED * 0.73,
                vy: Math.cos(angle) * config.BULLET_SPEED,
                color: color,
                type: 'wave',
                waveTime: i * 200,
                trail: []
            };
            
            this.bossBullets.push(bullet);
        }

        //sound inwith boss
        if (window.soundManager) {
            window.soundManager.playSound('bossShoot');
        }
    },

    //bullet for in
    createLargeBullet(centerX, centerY, color) {
        const config = this.getBossConfig();
        const bullet = {
            x: centerX - (config.BULLET_SIZE + 10) / 2,
            y: centerY,
            width: config.BULLET_SIZE + 10,
            height: config.BULLET_SIZE + 10,
            vx: 0,
            vy: config.BULLET_SPEED * 0.85,
            color: color,
            type: 'large',
            trail: []
        };
        
        this.bossBullets.push(bullet);

        //sound inwith boss
        if (window.soundManager) {
            window.soundManager.playSound('bossShoot');
        }
    },

    //bullet
    createStraightBullet(centerX, centerY, color, speedMultiplier = 1) {
        const config = this.getBossConfig();
        const bullet = {
            x: centerX - config.BULLET_SIZE / 2,
            y: centerY,
            width: config.BULLET_SIZE,
            height: config.BULLET_SIZE,
            vx: 0,
            vy: config.BULLET_SPEED * speedMultiplier,
            color: color,
            type: 'straight',
            trail: []
        };
        
        this.bossBullets.push(bullet);

        //sound inwith boss
        if (window.soundManager) {
            window.soundManager.playSound('bossShoot');
        }
    },

    //toin attack
    createCircularAttack(centerX, centerY, color, speedMultiplier = 0.8) {
        const config = this.getBossConfig();
        const bulletCount = 8;
        
        for (let i = 0; i < bulletCount; i++) {
            const angle = (i / bulletCount) * Math.PI * 2;
            const bullet = {
                x: centerX - config.BULLET_SIZE / 2,
                y: centerY,
                width: config.BULLET_SIZE,
                height: config.BULLET_SIZE,
                vx: Math.cos(angle) * config.BULLET_SPEED * speedMultiplier,
                vy: Math.sin(angle) * config.BULLET_SPEED * speedMultiplier,
                color: color,
                type: 'circular',
                trail: []
            };
            
            this.bossBullets.push(bullet);
        }

        //sound inwith boss
        if (window.soundManager) {
            window.soundManager.playSound('bossShoot');
        }
    },

    //inin bullets
    createExplosiveBullets(centerX, centerY, color, count) {
        const config = this.getBossConfig();
        
        for (let i = 0; i < count; i++) {
            //andandin to andNOT with (from 0 to π)
            const angle = Math.random() * Math.PI; //to infrom (0-180°)
            const speedVariation = 0.5 + Math.random() * 0.5; //to withtowithand 0.5-1.0
            const bullet = {
                x: centerX - config.BULLET_SIZE / 2,
                y: centerY,
                width: config.BULLET_SIZE + 4,
                height: config.BULLET_SIZE + 4,
                vx: Math.cos(angle) * config.BULLET_SPEED * speedVariation,
                vy: Math.abs(Math.sin(angle) * config.BULLET_SPEED * speedVariation), //inwithyes and (infrom)
                color: color,
                type: 'explosive',
                timer: 2000 + Math.random() * 1000,
                trail: []
            };
            
            this.bossBullets.push(bullet);
        }

        //sound inwith boss
        if (window.soundManager) {
            window.soundManager.playSound('bossShoot');
        }
    },

    //( bullet with NOT withto)
    createMeteorBullet(x, y, color, speedMultiplier = 1) {
        const config = this.getBossConfig();
        const bullet = {
            x: x - (config.BULLET_SIZE + 8) / 2,
            y: y,
            width: config.BULLET_SIZE + 8,
            height: config.BULLET_SIZE + 8,
            vx: 0,
            vy: config.BULLET_SPEED * 1.0 * speedMultiplier, //inandor with 0.7 to 1.0
            color: color,
            type: 'meteor',
            trail: []
        };
        
        this.bossBullets.push(bullet);

        //sound inwith boss
        if (window.soundManager) {
            window.soundManager.playSound('bossShoot');
        }
    },

    //withto attack (but bullets in inwith with)
    createBerserkAttack(centerX, centerY, color, speedMultiplier = 1) {
        const config = this.getBossConfig();
        const bulletCount = 12;
        
        for (let i = 0; i < bulletCount; i++) {
            const angle = (i / bulletCount) * Math.PI * 2;
            const speed = config.BULLET_SPEED * (1 + Math.random() * 0.5) * speedMultiplier;
            
            const bullet = {
                x: centerX - config.BULLET_SIZE / 2,
                y: centerY,
                width: config.BULLET_SIZE,
                height: config.BULLET_SIZE,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: color,
                type: 'berserk',
                trail: []
            };
            
            this.bossBullets.push(bullet);
        }

        //sound inwith boss
        if (window.soundManager) {
            window.soundManager.playSound('bossShoot');
        }
    },

    //withandon attack
    createSpiralAttack(centerX, centerY, color) {
        const config = this.getBossConfig();
        const bulletCount = 6;
        const spiralTime = Date.now() * 0.001;
        
        for (let i = 0; i < bulletCount; i++) {
            const angle = spiralTime + (i / bulletCount) * Math.PI * 2;
            const bullet = {
                x: centerX - config.BULLET_SIZE / 2,
                y: centerY,
                width: config.BULLET_SIZE,
                height: config.BULLET_SIZE,
                vx: Math.cos(angle) * config.BULLET_SPEED * 0.8,
                vy: Math.sin(angle) * config.BULLET_SPEED * 0.8 + config.BULLET_SPEED * 0.3,
                color: color,
                type: 'spiral',
                trail: []
            };
            
            this.bossBullets.push(bullet);
        }

        //sound inwith boss
        if (window.soundManager) {
            window.soundManager.playSound('bossShoot');
        }
    },

    //and + attack
    createTeleportAttack(boss, oldX, oldY) {
        //and boss in withbut with
        const newX = Math.random() * (this.canvas.width - boss.width);
        boss.x = newX;
        
        //Creating effect andand
        this.createTeleportEffect(oldX + boss.width/2, oldY + boss.height/2);
        this.createTeleportEffect(newX + boss.width/2, boss.y + boss.height/2);
        
        //with with butin andandand
        this.createStraightBullet(newX + boss.width/2, boss.y + boss.height, boss.color);
    },

    //inandandon inon
    createGravityWave(centerX, centerY, color) {
        const config = this.getBossConfig();
        const bulletCount = 16;
        
        for (let i = 0; i < bulletCount; i++) {
            const angle = (i / bulletCount) * Math.PI * 2;
            const radius = 50 + i * 10;
            
            const bullet = {
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
                width: config.BULLET_SIZE,
                height: config.BULLET_SIZE,
                vx: Math.cos(angle) * config.BULLET_SPEED * 0.5,
                vy: Math.sin(angle) * config.BULLET_SPEED * 0.5,
                color: color,
                type: 'gravity',
                trail: []
            };
            
            this.bossBullets.push(bullet);
        }
    },

    //Creating tobutin
    createCloneAttack(boss) {
        //while with Creating but bullets
        this.createCircularAttack(boss.x + boss.width/2, boss.y + boss.height, boss.color);
    },

    //andonon fromandon attack
    createChaosAttack(boss) {
        //toandand NOTwithtoto andin to
        this.createSpiralAttack(boss.x + boss.width/2, boss.y + boss.height, boss.color);
        
        setTimeout(() => {
            this.createBerserkAttack(boss.x + boss.width/2, boss.y + boss.height, boss.color);
        }, 500);
        
        setTimeout(() => {
            this.createExplosiveBullets(boss.x + boss.width/2, boss.y + boss.height, boss.color, 3);
        }, 1000);
    },

    //inin bullets
    explodeBullet(bullet) {
        if (!this.bossBullets || !Array.isArray(this.bossBullets)) {
            console.warn(' bossBullets array not available for explosion');
            return;
        }

        //Creating 4 withtoto in with
        const fragmentCount = 4;
        for (let i = 0; i < fragmentCount; i++) {
            const angle = (i / fragmentCount) * Math.PI * 2;
            const fragment = {
                x: bullet.x,
                y: bullet.y,
                width: bullet.width / 2,
                height: bullet.height / 2,
                vx: Math.cos(angle) * 2,
                vy: Math.sin(angle) * 2,
                color: bullet.color,
                type: 'fragment',
                trail: []
            };

            this.bossBullets.push(fragment);
        }

        //Creating effect inin
        this.createExplosionParticles(bullet.x + bullet.width/2, bullet.y + bullet.height/2, bullet.color);

        //Deleting andandon bullet
        const index = this.bossBullets.indexOf(bullet);
        if (index > -1) {
            this.bossBullets.splice(index, 1);
        }
    }
});

