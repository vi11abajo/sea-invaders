//BOOST EFFECTS
//Visual and game effects for boosts
console.log(' boost-effects.js v202510301330 loading...');

class BoostEffects {
    constructor() {
        this.particles = [];
        this.effects = [];
        this.nextEffectId = 1;
    }

    //Rapid Fire effect
    applyRapidFireEffect(player) {
        if (!window.boostManager.isBoostActive('RAPID_FIRE')) return;

        //Change bullet color to yellow with sparks
        const originalBulletColor = '#00ddff';
        return '#ffff00'; //Yellow color for bullets
    }

    //Shield Barrier effect
    renderShieldEffect(ctx, player) {
        if (!window.boostManager.isBoostActive('SHIELD_BARRIER')) return;

        const boost = window.boostManager.getActiveBoost('SHIELD_BARRIER');
        const shieldHits = BOOST_CONSTANTS.EFFECTS.SHIELD_BARRIER.hits - (boost.hitsBlocked || 0);

        if (shieldHits <= 0) return;

        //Draw shield
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#0088ff';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#0088ff';

        const radius = (Math.max(player.width, player.height) / 2 + 15) * 1.3; // Increased by 30%
        ctx.beginPath();
        ctx.arc(
            player.x + player.width / 2,
            player.y + player.height / 2,
            radius,
            0,
            Math.PI * 2
        );
        ctx.stroke();

        //Display number of remaining blocks
        ctx.globalAlpha = 1.0;
        ctx.font = '14px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(
            shieldHits.toString(),
            player.x + player.width / 2,
            player.y - 25
        );

        ctx.restore();
    }

    //Score Multiplier effect
    createScoreMultiplierEffect(x, y, totalPoints) {
        console.log(` createScoreMultiplierEffect called: (${x}, ${y}), points: ${totalPoints}`);

        if (!window.boostManager || !window.boostManager.isBoostActive('SCORE_MULTIPLIER')) {
            console.log(' Score Multiplier not active, skipping visual effect');
            return;
        }

        //Display total points with multiplier
        const multiplier = BOOST_CONSTANTS.EFFECTS.SCORE_MULTIPLIER.multiplier;
        console.log(` Creating floating text: +${totalPoints} (${multiplier}x)`);
        this.createFloatingText(x, y, `+${totalPoints} (${multiplier}x)`, '#ffd700', 1500);
    }

    //⏰ Points Freeze effect
    renderPointsFreezeEffect(ctx) {
        if (!window.boostManager.isBoostActive('POINTS_FREEZE')) return;

        //Visual effects disabled
        //if (Math.random() < 0.01) {
        //this.createParticle({
        //x: Math.random() * window.canvas.width,
        //y: Math.random() * window.canvas.height,
        //color: '#88ddff',
        //size: 2 + Math.random() * 4,
        //life: 2000,
        //vx: (Math.random() - 0.5) * 2,
        //vy: (Math.random() - 0.5) * 2
        //});
        //}
    }

    //Multi-Shot effect
    getMultiShotBullets(playerX, playerY) {
        if (!window.boostManager.isBoostActive('MULTI_SHOT')) {
            return [{ x: playerX, y: playerY, vx: 0, vy: -8, color: '#00ddff' }];
        }

        //Return 3 bullets in fan pattern with angle ±15° (30° between extremes)
        const speed = 8; //same speed as regular bullets
        const angleLeft = -15 * Math.PI / 180; //-15 degrees in radians
        const angleRight = 15 * Math.PI / 180;  //+15 degrees in radians
        
        return [
            { 
                x: playerX - 8, 
                y: playerY, 
                vx: speed * Math.sin(angleLeft), 
                vy: -speed * Math.cos(angleLeft), //Negative for upward movement
                color: '#ff4444' 
            },
            { 
                x: playerX, 
                y: playerY, 
                vx: 0, 
                vy: -speed, 
                color: '#ff4444' 
            },
            { 
                x: playerX + 8, 
                y: playerY, 
                vx: speed * Math.sin(angleRight), 
                vy: -speed * Math.cos(angleRight), //Negative for upward movement
                color: '#ff4444' 
            }
        ];
    }

    //effect Health Boost
    createHealthBoostEffect(playerX, playerY) {
        console.log(' [HEALTH_BOOST] creating particles');
        //Create blue healing particles
        for (let i = 0; i < 5; i++) {
            this.createParticle({
                x: playerX + Math.random() * 60,
                y: playerY + Math.random() * 60,
                color: '#0088ff',
                size: 3 + Math.random() * 3,
                life: 1.5,  //1.5 seconds (was 1500)
                vx: (Math.random() - 0.5) * 100,  //px/s (was 4)
                vy: -Math.random() * 100  //px/s (was 4)
            });
        }

        //Display text +1
        this.createFloatingText(playerX + 30, playerY - 20, '+1', '#0088ff', 2.0);  //2 seconds (was 2000)
    }

    //effect Piercing Bullets
    applyPiercingEffect() {
        if (!window.boostManager.isBoostActive('PIERCING_BULLETS')) return false;
        return true; //Bullets pierce enemies
    }

    //effect Invincibility
    renderInvincibilityEffect(ctx, player) {
        if (!window.boostManager.isBoostActive('INVINCIBILITY')) return;

        //DEBUG: log that effect is active
        if (Math.random() < 0.05) { //5% chance
            console.log(' [INVINCIBILITY] rendering effect');
        }

        //Rainbow shimmer
        const time = Date.now() * 0.01;
        const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#0000ff', '#8800ff'];
        const colorIndex = Math.floor(time) % colors.length;

        ctx.save();
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time);
        ctx.shadowBlur = 20;
        ctx.shadowColor = colors[colorIndex];
        ctx.fillStyle = colors[colorIndex];
        
        //Draw player outline
        ctx.fillRect(player.x - 2, player.y - 2, player.width + 4, player.height + 4);

        //Sparks - only while boost active
        if (Math.random() < 0.3) {
            const particleParams = {
                x: player.x + Math.random() * player.width,
                y: player.y + Math.random() * player.height,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 2 + Math.random() * 2,
                life: 18,  //18 frames = ~0.3 seconds at 60 FPS
                vx: (Math.random() - 0.5) * 6,  //px/frame (-3 to +3)
                vy: -3 - Math.random() * 6  //Always upward (-3 to -9 px/frame)
            };

            //DEBUG: logging parameters for particle creation
            console.log(' [INVINCIBILITY] CREATE PARTICLE PARAMS:', 'life:', particleParams.life, 'vy:', particleParams.vy, 'vx:', particleParams.vx);

            this.createParticle(particleParams);
        }

        ctx.restore();
    }

    //effect Gravity Well
    applyGravityWellEffect(bullets) {
        if (!window.boostManager.isBoostActive('GRAVITY_WELL')) return;

        //Get gravity well data
        const gravityWellData = window.boostManager.getActiveBoost('GRAVITY_WELL');
        if (!gravityWellData || !gravityWellData.centerX || !gravityWellData.centerY) {
            return;
        }

        const centerX = gravityWellData.centerX;
        const centerY = gravityWellData.centerY;
        const pullStrength = 0.5;

        //Redirect enemy bullets straight to well center
        let affectedBullets = 0;
        let absoredBullets = 0;
        let totalBullets = bullets.length;
        
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i];
            if (bullet.fromCrab || bullet.owner === 'invader') {
                //Debug: Check that bullet not already absorbed
                if (bullet.absorbed) {
                    //Found already absorbed bullet
                    continue;
                }
                const dx = centerX - bullet.x;
                const dy = centerY - bullet.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                //Bullet distance from center calculated

                //If bullet close to well center - absorb it
                if (distance <= 15) { //Reduced absorption radius
                    //Mark bullet for removal
                    bullet.absorbed = true;
                    absoredBullets++;
                    //Bullet absorbed at distance from center
                    continue;
                }

                if (distance > 0) {
                    //Direct targeting to well center with constant speed
                    const speed = 4; //Fixed speed of movement to center
                    bullet.vx = (dx / distance) * speed;
                    bullet.vy = (dy / distance) * speed;
                    affectedBullets++;
                    
                    //Bullet redirected to center
                }
            }
        }
        
        //Gravity Well: bullets processed
    }

    //rendering Gravity Well
    renderGravityWellEffect(ctx) {
        if (!window.boostManager || !window.boostManager.isBoostActive('GRAVITY_WELL')) return;

        //Get gravity well center coordinates
        const gravityWellData = window.boostManager.getActiveBoost('GRAVITY_WELL');
        if (!gravityWellData || !gravityWellData.centerX || !gravityWellData.centerY) {
            return;
        }
        
        //Rendering Gravity Well

        const centerX = gravityWellData.centerX;
        const centerY = gravityWellData.centerY;
        const time = Date.now() * 0.005;

        ctx.save();
        
        //Pulsing black hole
        const pulseIntensity = 0.5 + 0.5 * Math.sin(time * 3); //Pulsation
        const coreRadius = 15 + 5 * pulseIntensity;
        const glowRadius = 40 + 15 * pulseIntensity;
        
        //Create radial gradient for black hole
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');      //Black center
        gradient.addColorStop(0.3, 'rgba(20, 20, 50, 0.9)'); //Dark blue
        gradient.addColorStop(0.6, `rgba(0, 100, 255, ${0.6 * pulseIntensity})`); //Blue glow
        gradient.addColorStop(1, 'rgba(0, 100, 255, 0)');   //Transparent edge
        
        //Draw main black hole
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        //Draw Black center
        ctx.fillStyle = 'rgba(0, 0, 0, 1)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
        ctx.fill();
        
        //Blue pulsing ring
        ctx.globalAlpha = pulseIntensity;
        ctx.strokeStyle = `rgba(0, 150, 255, ${pulseIntensity})`;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgba(0, 150, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, coreRadius + 10, 0, Math.PI * 2);
        ctx.stroke();
        
        //Outer pulsing ring
        ctx.globalAlpha = pulseIntensity * 0.5;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius - 10, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }

    //effect Ricochet
    applyRicochetEffect(bullets, player) {
        if (!window.boostManager || !window.boostManager.isBoostActive('RICOCHET')) return;

        //Arc shield parameters (same as in renderRicochetShield)
        const centerX = player.x + player.width / 2;
        const centerY = player.y + player.height / 2;
        const radius = 50;
        const arcAngle = Math.PI * 0.75; //135 degrees
        const startAngle = -Math.PI/2 - arcAngle / 2; //Start angle (from top of player)
        const endAngle = startAngle + arcAngle;
        const shieldThickness = 15; //Arc thickness for collisions

        for (let i = 0; i < bullets.length; i++) {
            const bullet = bullets[i];
            
            if ((bullet.fromCrab || bullet.owner === 'invader') && !bullet.ricochet && !bullet.justCreated) {
                //Check collision with arc shield
                const dx = bullet.x - centerX;
                const dy = bullet.y - centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);
                
                //Simple angle check relative to shield arc
                //Check that bullet is in upper part in front of player
                const isAbovePlayer = bullet.y <= centerY; //Bullet above player center
                const horizontalDistance = Math.abs(bullet.x - centerX);
                const verticalDistance = Math.abs(bullet.y - centerY);
                const inArcRange = isAbovePlayer && horizontalDistance <= radius * 0.8;
                const inRadiusRange = (distance >= radius - shieldThickness/2 && distance <= radius + shieldThickness/2);
                
                if (inArcRange && inRadiusRange) {
                    
                    //RICOCHET: Bullet hit shield
                    
                    //Full 180 degree turn
                    if (bullet.vy !== undefined) {
                        bullet.vy = -bullet.vy; //Invert Y direction
                    } else if (bullet.speed !== undefined) {
                        //for crab bullets use standard speed property
                        bullet.speed = -bullet.speed; //Invert speed
                    }
                    
                    if (bullet.vx !== undefined) {
                        bullet.vx = -bullet.vx; //Invert X direction if exists
                    }
                    
                    //DO NOT change fromCrab and owner - let it remain enemy bullet
                    //Only mark as reflected and change color
                    if (!bullet.ricochet) { //Only if not yet reflected
                        bullet.color = '#0088ff'; //Blue color of reflected bullet
                        bullet.ricochet = true; //Mark as reflected
                    }
                    
                    //Move bullet from shield arc to player center
                    const moveDistance = 10;
                    const moveAngle = Math.atan2(centerY - bullet.y, centerX - bullet.x);
                    bullet.x += Math.cos(moveAngle) * moveDistance;
                    bullet.y += Math.sin(moveAngle) * moveDistance;
                    
                    //Creating spark effect on reflection
                    if (window.createExplosion) {
                        window.createExplosion(bullet.x, bullet.y, '#00ff44', false, 0.3);
                    }
                }
            }
        }
    }

    //Visual shield effect Ricochet
    renderRicochetShield(ctx, player) {
        if (!window.boostManager.isBoostActive('RICOCHET') || !player) return;

        const boostData = window.boostManager.getActiveBoost('RICOCHET');
        if (!boostData) return;

        ctx.save();

        //Arc shield parameters
        const centerX = player.x + player.width / 2;
        const centerY = player.y + player.height / 2;
        const radius = 50; //Arc radius
        const arcAngle = Math.PI * 0.75; //135 degrees in radians
        const startAngle = -Math.PI/2 - arcAngle / 2; //Start angle (from top of player)
        const endAngle = startAngle + arcAngle; //End angle

        //Pulsing effect
        const elapsed = Date.now() - boostData.startTime;
        const pulseIntensity = 0.7 + 0.3 * Math.sin(elapsed * 0.01);

        //Draw arc shield
        ctx.globalAlpha = pulseIntensity * 0.6;
        ctx.strokeStyle = `rgba(0, 255, 68, ${pulseIntensity})`;
        ctx.lineWidth = 8;
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgba(0, 255, 68, 0.8)';
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.stroke();

        //Inner arc
        ctx.lineWidth = 4;
        ctx.globalAlpha = pulseIntensity * 0.8;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 5, startAngle, endAngle);
        ctx.stroke();

        //Outer arc
        ctx.lineWidth = 3;
        ctx.globalAlpha = pulseIntensity * 0.4;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 5, startAngle, endAngle);
        ctx.stroke();

        //Energy sparks along shield arc
        if (Math.random() < 0.3) {
            const sparkAngle = startAngle + Math.random() * arcAngle;
            const sparkRadius = radius + (Math.random() - 0.5) * 10;
            const sparkX = centerX + Math.cos(sparkAngle) * sparkRadius;
            const sparkY = centerY + Math.sin(sparkAngle) * sparkRadius;
            
            ctx.fillStyle = `rgba(255, 255, 255, ${pulseIntensity})`;
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, 1 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    //effect Ice Freeze
    renderIceFreezeEffect(ctx) {
        if (!window.boostManager.isBoostActive('ICE_FREEZE')) return;

        //Check mobile device
        const isMobile = window.isMobileDevice || false;

        if (isMobile) {
            //SIMPLIFIED VERSION FOR MOBILE - only light fog without particles
            ctx.save();
            ctx.globalAlpha = 0.05; //Half as weak
            ctx.fillStyle = '#aaeeff';
            ctx.fillRect(0, 0, window.canvas.width, window.canvas.height);
            ctx.restore();
        } else {
            //FULL VERSION FOR DESKTOP - with crystals and fog
            //Create ice crystals
            if (Math.random() < 0.2) {
                console.log(' [ICE_FREEZE] creating particle');
                this.createParticle({
                    x: Math.random() * window.canvas.width,
                    y: Math.random() * window.canvas.height,
                    color: '#aaeeff',
                    size: 1 + Math.random() * 3,
                    life: 3.0,  //3 seconds (was 3000)
                    vx: (Math.random() - 0.5) * 25,  //px/s (was 0.5)
                    vy: Math.random() * 50,  //px/s (was 2)
                    type: 'crystal'
                });
            }

            //Blue fog
            ctx.save();
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = '#aaeeff';
            ctx.fillRect(0, 0, window.canvas.width, window.canvas.height);
            ctx.restore();
        }
    }

    //effect Auto-Target
    applyAutoTargetEffect(bullet, enemies) {
        if (!window.boostManager.isBoostActive('AUTO_TARGET')) {
            //Reset auto-targeting if boost inactive, but ONLY for already marked bullets
            if (bullet.autoTargeted) {
                //AUTO_TARGET: Resetting auto-targeting for bullet
                delete bullet.vx; //Remove horizontal movement
                delete bullet.vy; //Remove vertical deviation - bullet will return to normal movement via bullet.speed
                delete bullet.autoTargeted;
                delete bullet.originalVx;
                delete bullet.originalVy;
            }
            //Do NOT apply auto-targeting to new bullets
            return;
        }

        //Save original speed only once
        if (!bullet.autoTargeted) {
            //AUTO_TARGET: Applying auto-targeting to new bullet
            bullet.originalVx = bullet.vx;
            bullet.originalVy = bullet.vy;
            bullet.autoTargeted = true;
        }

        //Find nearest enemy
        let closestEnemy = null;
        let closestDistance = Infinity;

        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            
            const dx = enemy.x - bullet.x;
            const dy = enemy.y - bullet.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < closestDistance) {
                closestDistance = distance;
                closestEnemy = enemy;
            }
        }

        //Target bullet at nearest enemy
        if (closestEnemy) {
            const dx = closestEnemy.x - bullet.x;
            const dy = closestEnemy.y - bullet.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0) {
                //Full auto-targeting as before
                const speed = bullet.speed || 8;
                bullet.vx = (dx / distance) * speed * 0.3;
                bullet.vy = (dy / distance) * speed * 0.3 - speed * 0.7; //Adjust but keep upward movement
                //AUTO_TARGET: Targeting bullet at enemy
            }
        }
    }

    //effect Coin Shower
    createCoinShowerEffect(points) {
        console.log(' [COIN_SHOWER] creating particles');
        //Create falling coins (FAST!)
        for (let i = 0; i < 20; i++) {
            this.createParticle({
                x: Math.random() * window.canvas.width,
                y: -20,
                color: '#ffd700',
                size: 8 + Math.random() * 4,
                life: 3,  //3 seconds (was 3000)
                vx: (Math.random() - 0.5) * 100,  //Horizontal speed: -50 to +50 px/s
                vy: 200 + Math.random() * 100,  //Vertical speed: 200-300 px/s (was 2-5)
                type: 'coin'
            });
        }

        //Display earned points
        this.createFloatingText(
            window.canvas.width / 2,
            window.canvas.height / 2,
            `+${points} `,
            '#ffd700',
            2.5  //2.5 seconds (was 2500)
        );
    }

    //effect Wave Blast
    createWaveBlastEffect(playerX = window.canvas.width / 2, playerY = window.canvas.height - 50) {
        //Create expanding shockwave from player (SUPER FAST!)
        this.effects.push({
            id: this.nextEffectId++,
            type: 'wave_blast',
            x: playerX,
            y: playerY,
            radius: 0,
            maxRadius: Math.max(window.canvas.width, window.canvas.height),
            life: 0.5,  //0.5 seconds (was 50)
            age: 0,
            color: '#0088ff',
            intensity: 1.0
        });

        //Adding additional waves for effect amplification
        setTimeout(() => {
            this.effects.push({
                id: this.nextEffectId++,
                type: 'wave_blast',
                x: playerX,
                y: playerY,
                radius: 0,
                maxRadius: Math.max(window.canvas.width, window.canvas.height) * 0.7,
                life: 0.4,  //0.4 seconds (was 40)
                age: 0,
                color: '#00aaff',
                intensity: 0.6
            });
        }, 10);

        setTimeout(() => {
            this.effects.push({
                id: this.nextEffectId++,
                type: 'wave_blast',
                x: playerX,
                y: playerY,
                radius: 0,
                maxRadius: Math.max(window.canvas.width, window.canvas.height) * 0.5,
                life: 0.3,  //0.3 seconds (was 30)
                age: 0,
                color: '#66ccff',
                intensity: 0.3
            });
        }, 20);
    }

    //Creating particle
    createParticle(params) {
        const particle = {
            id: this.nextEffectId++,
            x: params.x,
            y: params.y,
            vx: params.vx || 0,
            vy: params.vy || 0,
            color: params.color,
            size: params.size,
            life: params.life,
            age: 0,
            type: params.type || 'default'
        };

        this.particles.push(particle);
    }

    //Creating floating text
    createFloatingText(x, y, text, color, life) {
        this.effects.push({
            id: this.nextEffectId++,
            type: 'text',
            x: x,
            y: y,
            text: text,
            color: color,
            life: life,
            age: 0,
            vy: -30
        });
    }

    //Updating effects
    update(deltaTime) {
        this.updateParticles(deltaTime);
        this.updateEffects(deltaTime);
    }

    //Updating particles
    updateParticles(deltaTime) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];

            //IMPORTANT: multiply by deltatime for FPS independence
            particle.x += particle.vx * deltaTime;
            particle.y += particle.vy * deltaTime;
            particle.age += deltaTime;

            if (particle.age >= particle.life) {
                this.particles.splice(i, 1);
            }
        }
    }

    //Updating effects
    updateEffects(deltaTime) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.age += deltaTime;

            if (effect.type === 'wave') {
                effect.width = (effect.age / effect.life) * effect.maxWidth;
            } else if (effect.type === 'wave_blast') {
                const progress = effect.age / effect.life;
                effect.radius = progress * effect.maxRadius;
            } else if (effect.type === 'text') {
                effect.y += effect.vy * deltaTime;
            }

            if (effect.age >= effect.life) {
                this.effects.splice(i, 1);
            }
        }
    }

    //Rendering all effects
    render(ctx) {
        this.renderParticles(ctx);
        this.renderEffects(ctx);
    }

    //rendering particles
    renderParticles(ctx) {
        for (const particle of this.particles) {
            const alpha = 1 - (particle.age / particle.life);
            
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = particle.color;
            
            if (particle.type === 'coin') {
                ctx.font = `${particle.size}px Arial`;
                ctx.textAlign = 'center';
                ctx.fillText('', particle.x, particle.y);
            } else if (particle.type === 'crystal') {
                ctx.font = `${particle.size}px Arial`;
                ctx.textAlign = 'center';
                ctx.fillText('', particle.x, particle.y);
            } else {
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.restore();
        }
    }

    //Rendering effects
    renderEffects(ctx) {
        for (const effect of this.effects) {
            const alpha = 1 - (effect.age / effect.life);

            ctx.save();
            ctx.globalAlpha = alpha;

            if (effect.type === 'wave') {
                ctx.strokeStyle = effect.color;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(0, effect.y);
                ctx.lineTo(effect.width, effect.y);
                ctx.stroke();
            } else if (effect.type === 'wave_blast') {
                //Draw expanding wave circle
                const intensity = effect.intensity || 1.0;
                const glowIntensity = alpha * intensity;

                ctx.strokeStyle = effect.color;
                ctx.lineWidth = Math.max(1, 8 * intensity);
                ctx.shadowBlur = 20 * glowIntensity;
                ctx.shadowColor = effect.color;

                //main wave
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                ctx.stroke();

                //Inner brighter wave
                if (effect.radius > 20) {
                    ctx.globalAlpha = alpha * intensity * 0.5;
                    ctx.lineWidth = Math.max(1, 4 * intensity);
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, effect.radius * 0.8, 0, Math.PI * 2);
                    ctx.stroke();
                }

                ctx.shadowBlur = 0;
            } else if (effect.type === 'text') {
                ctx.font = 'bold 13px Arial';
                ctx.textAlign = 'center';

                //Glow effect
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#ffd700';

                //Black outline
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.strokeText(effect.text, effect.x, effect.y);

                //Gold text
                ctx.fillStyle = '#ffd700';
                ctx.fillText(effect.text, effect.x, effect.y);

                //Remove glow
                ctx.shadowBlur = 0;
            }

            ctx.restore();
        }
    }

    //Clearing effects
    clear() {
        this.particles = [];
        this.effects = [];
    }
}

//Creating global instance
window.boostEffects = new BoostEffects();