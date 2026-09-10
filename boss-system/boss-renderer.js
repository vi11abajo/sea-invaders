//SEA INVADERS - BOSS RENDERER

Object.assign(BossSystemV2.prototype, {
    //in method renderand
    render(ctx) {
        if (!ctx || !this.currentBoss) return;
        
        //renderand withand effect toon
        this.renderScreenEffects(ctx);
        
        //renderand particle ( boss)
        this.renderParticles(ctx);
        
        //renderand and and
        this.renderMeteorWarnings(ctx);
        
        //renderand bullets boss
        this.renderBossBullets(ctx);
        
        //renderand with boss
        this.renderBoss(ctx);
        
        //renderand UI elements
        this.renderBossUI(ctx);
    },

    //renderand with
    renderBoss(ctx) {
        const boss = this.currentBoss;
        if (!boss) {
            //withtoin overlay if boss NOT
            if (this.bossGifOverlay) {
                this.bossGifOverlay.style.display = 'none';
            }
            return;
        }
        
        ctx.save();
        
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height / 2;
        
        //effect andand at andand damage
        if (boss.damageFlash > 0) {
            const flashIntensity = boss.damageFlash / 300;
            ctx.globalAlpha = 0.7 + Math.sin(Date.now() * 0.02) * 0.3 * flashIntensity;
            
            ctx.shadowColor = '#ff6666';
            ctx.shadowBlur = 20 * flashIntensity;
        }
        
        //effect withinand and andand for Rage Mode (boss 4)
        if (boss.bossNumber === 4 && boss.uniqueData.rageMode) {
            const rageTime = Date.now() * 0.015; //speed andand
            const rageIntensity = 0.8 + Math.sin(rageTime) * 0.2; //andwithandinbutwith 0.6-1.0
            
            ctx.globalAlpha = Math.min(ctx.globalAlpha, rageIntensity);
            ctx.shadowColor = '#ff3300'; //towithbut-in Glow effect
            ctx.shadowBlur = 25 + Math.sin(rageTime * 1.3) * 15; //bulletswithand Glow effect 10-40px
        }
        
        //withand effect in inandwithand from states
        switch(boss.state) {
            case 'appearing':
                ctx.globalAlpha = Math.min(1, (boss.baseY - boss.y + boss.height) / boss.height);
                break;
                
            case 'phase_transition':
                ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.01) * 0.4;
                ctx.shadowColor = boss.color;
                ctx.shadowBlur = 30;
                break;
                
            case 'dying':
                ctx.globalAlpha = Math.max(0.1, 1 - (Date.now() - (boss.deathStartTime || Date.now())) / 3000);
                break;
        }
        
        //Rendering fromand boss
        if (this.bossImagesLoaded[boss.bossNumber] && this.bossImages[boss.bossNumber]) {
            const img = this.bossImages[boss.bossNumber];
            const gifData = this.bossGifData && this.bossGifData[boss.bossNumber];

            //for fromintoand
            const aspectRatio = img.naturalWidth / img.naturalHeight || 1;
            let renderWidth, renderHeight;

            // Boss drawn 40% larger
            const sizeMultiplier = 1.4;

            if (aspectRatio > 1) {
                renderWidth = boss.width * sizeMultiplier;
                renderHeight = (boss.width / aspectRatio) * sizeMultiplier;
            } else {
                renderHeight = boss.height * sizeMultiplier;
                renderWidth = (boss.height * aspectRatio) * sizeMultiplier;
            }

            const renderX = centerX - renderWidth / 2;
            const renderY = centerY - renderHeight / 2;

            //ALWAYS draw the PNG as a fallback (the GIF overlay goes on top)
            //This keeps the boss visible even if the GIF failed to load
            ctx.drawImage(img, renderX, renderY, renderWidth, renderHeight);

            //Updating GIF overlay if with animation
            this.updateGifOverlay(boss, gifData, renderX, renderY, renderWidth, renderHeight);
        } else {
            //Fallback - with andto with and
            ctx.fillStyle = boss.color;
            ctx.fillRect(boss.x, boss.y, boss.width, boss.height);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = '60px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('', centerX, centerY + 20);
        }
        
        //withand effect for within
        this.renderBossSpecialEffects(ctx, boss);

        ctx.restore();
    },

    //Updating GIF OVERLAY
    updateGifOverlay(boss, gifData, renderX, renderY, renderWidth, renderHeight) {
        if (!this.bossGifOverlay) return;

        //if boss NOT, withtoin overlay
        if (!boss) {
            this.bossGifOverlay.style.display = 'none';
            return;
        }

        if (gifData && gifData.isGif && gifData.gifPath) {
            //Getting andand canvas frombutwithandbut withand
            const canvas = this.getCanvas();
            if (!canvas) return;

            const canvasRect = canvas.getBoundingClientRect();

            //Calculate withand ratio (display and / logical and)
            const scaleX = canvasRect.width / canvas.width;
            const scaleY = canvasRect.height / canvas.height;

            //Converting logical coordinates to display coordinates andwithand
            const displayX = renderX * scaleX;
            const displayY = renderY * scaleY;
            const displayWidth = renderWidth * scaleX;
            const displayHeight = renderHeight * scaleY;

            //CRITICAL: Calculate position relative to canvas parent (for position: absolute inside relative parent)
            //If GIF overlay is inside .game-canvas-wrapper (position: relative), use canvas-relative coordinates
            let absoluteX, absoluteY;
            const canvasWrapper = canvas.closest('.game-canvas-wrapper');
            if (canvasWrapper && this.bossGifOverlay.parentElement === canvasWrapper) {
                //Position relative to canvas within wrapper (no need for canvasRect offset)
                absoluteX = displayX;
                absoluteY = displayY;
            } else {
                //Position relative to viewport (for position: absolute in body or fixed parent)
                absoluteX = canvasRect.left + window.scrollX + displayX;
                absoluteY = canvasRect.top + window.scrollY + displayY;
            }

            //whilein and andandand GIF overlay
            this.bossGifOverlay.style.display = 'block';
            this.bossGifOverlay.style.left = absoluteX + 'px';
            this.bossGifOverlay.style.top = absoluteY + 'px';
            this.bossGifOverlay.style.width = displayWidth + 'px';
            this.bossGifOverlay.style.height = displayHeight + 'px';
            this.bossGifOverlay.style.backgroundImage = `url('${gifData.gifPath}')`;
            this.bossGifOverlay.style.backgroundSize = 'contain';
            this.bossGifOverlay.style.backgroundRepeat = 'no-repeat';
            this.bossGifOverlay.style.backgroundPosition = 'center';

            //at effect and to canvas boss
            if (boss.damageFlash > 0) {
                const flashIntensity = boss.damageFlash / 300;
                this.bossGifOverlay.style.filter = `brightness(${1 + flashIntensity * 0.4}) drop-shadow(0 0 ${20 * flashIntensity}px #ff6666)`;
            } else if (boss.bossNumber === 4 && boss.uniqueData && boss.uniqueData.rageMode) {
                const rageTime = Date.now() * 0.015;
                const rageIntensity = 0.8 + Math.sin(rageTime) * 0.2;
                this.bossGifOverlay.style.filter = `brightness(${rageIntensity * 0.5}) drop-shadow(0 0 25px #ff3300)`;
            } else {
                this.bossGifOverlay.style.filter = 'none';
            }

            //in states boss
            switch(boss.state) {
                case 'appearing':
                    const appearAlpha = Math.min(1, (boss.baseY - boss.y + boss.height) / boss.height);
                    this.bossGifOverlay.style.opacity = appearAlpha;
                    break;
                case 'phase_transition':
                    const transitionAlpha = 0.3 + Math.sin(Date.now() * 0.01) * 0.4;
                    this.bossGifOverlay.style.opacity = transitionAlpha;
                    break;
                case 'dying':
                    const dyingAlpha = Math.max(0.1, 1 - (Date.now() - (boss.deathStartTime || Date.now())) / 3000);
                    this.bossGifOverlay.style.opacity = dyingAlpha;

                    //withtoin overlay if animation withand inon
                    if (dyingAlpha <= 0.1) {
                        this.bossGifOverlay.style.display = 'none';
                    }
                    break;
                default:
                    this.bossGifOverlay.style.opacity = 1;
                    break;
            }
        } else {
            //withtoin overlay if GIF NOT
            this.bossGifOverlay.style.display = 'none';
        }
    },

    //withand effect within
    renderBossSpecialEffects(ctx, boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height / 2;
        
        switch(boss.bossNumber) {
            case 2: //Azure Leviathan - and
                if (boss.uniqueData.shieldHP > 0) {
                    this.renderWaterShield(ctx, centerX, centerY, boss.width * 0.574);
                }
                break;
                
            case 4: //Crimson Behemoth - mode withand ( infrom to)
                //infrom to request - to andand boss
                break;
        }
    },

    //renderand inbut and
    renderWaterShield(ctx, centerX, centerY, radius) {
        ctx.save();
        
        const time = Date.now() * 0.005;
        const alpha = 0.3 + Math.sin(time) * 0.2;
        
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#0099ff';
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + Math.sin(time * 2) * 5, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.lineWidth = 1;
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 10, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    },

    //renderand withand
    renderRageAura(ctx, centerX, centerY, radius) {
        ctx.save();
        
        const time = Date.now() * 0.01;
        
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(255, 51, 51, 0)');
        gradient.addColorStop(0.7, 'rgba(255, 51, 51, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 136, 0, 0.1)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6 + Math.sin(time) * 0.4;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.8 + Math.sin(time * 2) * 8, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    },

    //renderand bullets with
    renderBossBullets(ctx) {
        for (const bullet of this.bossBullets) {
            ctx.save();
            
            const centerX = bullet.x + bullet.width / 2;
            const centerY = bullet.y + bullet.height / 2;
            
            if (bullet.trail && bullet.trail.length > 1) {
                this.renderBulletTrail(ctx, bullet);
            }
            
            switch(bullet.type) {
                case 'meteor':
                    this.renderMeteorBullet(ctx, bullet, centerX, centerY);
                    break;
                case 'explosive':
                    this.renderExplosiveBullet(ctx, bullet, centerX, centerY);
                    break;
                default:
                    this.renderStandardBullet(ctx, bullet, centerX, centerY);
                    break;
            }
            
            ctx.restore();
        }
    },

    //renderand withyes bullets
    renderBulletTrail(ctx, bullet) {
        if (!bullet.trail || bullet.trail.length < 2) return;
        
        ctx.strokeStyle = bullet.color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.6;
        
        ctx.beginPath();
        for (let i = 0; i < bullet.trail.length - 1; i++) {
            const alpha = i / bullet.trail.length;
            ctx.globalAlpha = alpha * 0.6;
            
            if (i === 0) {
                ctx.moveTo(bullet.trail[i].x, bullet.trail[i].y);
            } else {
                ctx.lineTo(bullet.trail[i].x, bullet.trail[i].y);
            }
        }
        ctx.stroke();
        
        ctx.globalAlpha = 1;
    },

    //renderand but bullets
    renderMeteorBullet(ctx, bullet, centerX, centerY) {
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, bullet.width);
        gradient.addColorStop(0, bullet.color);
        gradient.addColorStop(0.5, 'rgba(255, 136, 0, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0.3)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, bullet.width / 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, bullet.width / 4, 0, Math.PI * 2);
        ctx.fill();
    },

    //renderand inin bullets
    renderExplosiveBullet(ctx, bullet, centerX, centerY) {
        const flashRate = Math.max(0.1, bullet.timer / 1000);
        const alpha = 0.7 + Math.sin(Date.now() * 0.02 / flashRate) * 0.3;
        
        ctx.globalAlpha = alpha;
        ctx.fillStyle = bullet.color;
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, bullet.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.shadowColor = bullet.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, bullet.width / 6, 0, Math.PI * 2);
        ctx.fill();
    },

    //renderand withyesbut bullets
    renderStandardBullet(ctx, bullet, centerX, centerY) {
        ctx.strokeStyle = bullet.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, bullet.width / 2, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.shadowColor = bullet.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = bullet.color;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(centerX, centerY, bullet.width / 2 - 1, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
        ctx.fill();
    },

    //renderand particles
    renderParticles(ctx) {
        for (const particle of this.bossParticles) {
            ctx.save();

            const alpha = particle.life / particle.maxLife;
            ctx.globalAlpha = alpha;

            //withandon Rendering for to (Halloween theme)
            if (particle.type === 'candy') {
                ctx.translate(particle.x, particle.y);
                ctx.rotate(particle.rotation || 0);

                //if with fromand to -
                if (particle.candyImage) {
                    //Creating or Getting Image object
                    if (!particle.imageObject) {
                        particle.imageObject = new Image();
                        particle.imageObject.src = particle.candyImage;
                    }

                    //Draw fromand to if but but
                    if (particle.imageObject.complete && particle.imageObject.naturalWidth > 0) {
                        ctx.drawImage(
                            particle.imageObject,
                            -particle.size / 2, //and
                            -particle.size / 2,
                            particle.size,
                            particle.size
                        );
                    } else {
                        //Fallback: with to while fromand with
                        ctx.fillStyle = '#ff6600';
                        ctx.beginPath();
                        ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else {
                    //Fallback: if NOT fromand
                    ctx.shadowColor = '#ff6600';
                    ctx.shadowBlur = 15;
                    ctx.fillStyle = '#ff6600';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;

                    ctx.beginPath();
                    ctx.moveTo(0, -particle.size / 2);
                    ctx.lineTo(particle.size * 0.35, 0);
                    ctx.lineTo(0, particle.size / 2);
                    ctx.lineTo(-particle.size * 0.35, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                }
            } else {
                //on Rendering for and andin particles
                switch (particle.type) {
                    case 'regeneration':
                    case 'shield':
                    case 'shield_hit':
                    case 'flash':
                    case 'rage':
                    case 'freeze':
                        ctx.fillStyle = particle.color;
                        ctx.shadowColor = particle.color;
                        ctx.shadowBlur = 8;
                        break;
                    default:
                        ctx.fillStyle = particle.color;
                        break;
                }

                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    },

    //renderand effectin toon
    renderScreenEffects(ctx) {
        if (!this.canvas) return;
        
        //effect withand player
        if (this.playerBlindness > 0) {
            const blindnessAlpha = Math.min(0.8, this.playerBlindness / 2000);
            ctx.save();
            ctx.fillStyle = `rgba(255, 255, 255, ${blindnessAlpha})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.restore();
        }
        
        //effect inwithtoand toon
        if (this.screenFlashEffect > 0) {
            const flashAlpha = this.screenFlashEffect / 30;
            ctx.save();
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.6})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.screenFlashEffect--;
            ctx.restore();
        }
        
        //effect toand inand
        if (this.frozenBulletsTime > 0) {
            ctx.save();
            ctx.fillStyle = 'rgba(153, 102, 255, 0.1)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.renderFreezeOverlay(ctx);
            ctx.restore();
        }
    },

    //renderand effect toand
    renderFreezeOverlay(ctx) {
        const time = Date.now() * 0.002;
        ctx.strokeStyle = 'rgba(153, 102, 255, 0.4)';
        ctx.lineWidth = 2;
        
        const corners = [
            {x: 50, y: 50},
            {x: this.canvas.width - 50, y: 50},
            {x: 50, y: this.canvas.height - 50},
            {x: this.canvas.width - 50, y: this.canvas.height - 50}
        ];
        
        corners.forEach((corner, i) => {
            const offset = Math.sin(time + i) * 10;
            
            ctx.beginPath();
            ctx.moveTo(corner.x - 20, corner.y + offset);
            ctx.lineTo(corner.x + 20, corner.y - offset);
            ctx.moveTo(corner.x + offset, corner.y - 20);
            ctx.lineTo(corner.x - offset, corner.y + 20);
            ctx.stroke();
        });
    },

    //renderand UI with
    renderBossUI(ctx) {
        if (!this.currentBoss || this.currentBoss.state === 'dying') return;
        
        this.renderHealthBar(ctx);
        this.renderAbilityStatus(ctx);
    },

    //renderand with toin
    renderHealthBar(ctx) {
        const boss = this.currentBoss;

        // Responsive UI sizes for all screens
        const isMobile = this.canvas.width < 800;
        const maxWidth = isMobile ? (this.canvas.width - 80) : 400; // 40px margin on each side
        const barWidth = Math.min(maxWidth, isMobile ? 500 : 400);
        const barHeight = isMobile ? 32 : 25;
        const barX = this.canvas.width / 2 - barWidth / 2;
        const barY = isMobile ? 60 : 50;
        
        ctx.save();
        
        //background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(barX - 5, barY - 5, barWidth + 10, barHeight + 10);
        
        //to
        ctx.strokeStyle = '#00ddff';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX - 3, barY - 3, barWidth + 6, barHeight + 6);
        
        //background toin
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        //to health
        const healthPercentage = boss.currentHP / boss.maxHP;
        const healthWidth = barWidth * healthPercentage;
        
        //and toin
        const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
        if (healthPercentage > 0.6) {
            gradient.addColorStop(0, '#00ff00');
            gradient.addColorStop(1, '#88ff00');
        } else if (healthPercentage > 0.3) {
            gradient.addColorStop(0, '#ffff00');
            gradient.addColorStop(1, '#ff8800');
        } else {
            gradient.addColorStop(0, '#ff0000');
            gradient.addColorStop(1, '#ff4444');
        }
        
        ctx.fillStyle = gradient;
        ctx.fillRect(barX, barY, healthWidth, barHeight);

        //and boss (responsive font)
        const fontSize = isMobile ? 22 : 18;
        ctx.fillStyle = boss.color;
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(boss.name, this.canvas.width / 2, barY - 30);

        //towith toin (responsive font)
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${fontSize - 2}px Arial`;
        ctx.fillText(`${Math.ceil(boss.currentHP)} / ${boss.maxHP} HP`, this.canvas.width / 2, barY + barHeight + 8);
        
        ctx.restore();
    },

    //renderand status withwithbutwith
    renderAbilityStatus(ctx) {
        const boss = this.currentBoss;
        let statusText = '';
        
        switch(boss.bossNumber) {
            case 2:
                if (boss.uniqueData.shieldHP > 0) {
                    statusText = ` Water Shield: ${boss.uniqueData.shieldHP}`;
                }
                break;
            case 4:
                if (boss.uniqueData.rageMode) {
                    statusText = ' RAGE';
                }
                break;
        }
        
        if (statusText) {
            ctx.save();
            ctx.fillStyle = '#ffff00';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(statusText, this.canvas.width / 2, 95);
            ctx.restore();
        }
    },

    //renderand and and
    renderMeteorWarnings(ctx) {
        if (!this.meteorWarnings || this.meteorWarnings.length === 0) return;
        
        ctx.save();
        
        //Updating and renderand toto and
        for (let i = this.meteorWarnings.length - 1; i >= 0; i--) {
            const warning = this.meteorWarnings[i];
            warning.timer -= 16.67; //atbut 60 FPS
            
            if (warning.timer <= 0) {
                //Deleting toand and
                this.meteorWarnings.splice(i, 1);
                continue;
            }
            
            //in butwith (andand to to)
            const timeRatio = warning.timer / warning.maxTimer;
            let alpha = warning.alpha;
            
            if (timeRatio < 0.5) {
                //afterand 0.75 seconds - andand
                alpha = Math.sin(Date.now() * 0.02) * 0.5 + 0.5;
            }
            
            //renderand towith andandto infrom toon
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ff3333';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            
            //withbutinbut to
            ctx.beginPath();
            ctx.arc(warning.x, warning.y, warning.size / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            //inand towith
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            const crossSize = warning.size * 0.3;
            ctx.beginPath();
            ctx.moveTo(warning.x - crossSize, warning.y);
            ctx.lineTo(warning.x + crossSize, warning.y);
            ctx.moveTo(warning.x, warning.y - crossSize);
            ctx.lineTo(warning.x, warning.y + crossSize);
            ctx.stroke();
            
            //toand effect - bulletswithandand to
            if (timeRatio < 0.3) {
                const pulseSize = warning.size * (1 + (1 - timeRatio) * 0.5);
                ctx.globalAlpha = alpha * 0.3;
                ctx.fillStyle = '#ff6666';
                ctx.beginPath();
                ctx.arc(warning.x, warning.y, pulseSize / 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.restore();
    }
});

