//SEA INVADERS - PERFORMANCE OPTIMIZER
//totowithon withtheme andfromandand frominandbutwithand game

class PerformanceOptimizer {
    constructor() {
        this.objectPools = new Map();
        this.spatialGrid = null;
        this.batchRenderer = null;
        this.playerSettings = null;
        
        this.stats = {
            pooledObjectsReused: 0,
            collisionChecksSkipped: 0,
            batchedRenders: 0,
            memoryUsage: 0
        };

        this.initializeOptimizations();
    }

    initializeOptimizations() {
        this.initObjectPools();
        this.initSpatialGrid();
        this.initBatchRenderer();
        this.initPlayerSettings();
    }

    //OBJECT POOLING SYSTEM
    initObjectPools() {
        //for andin objectin
        this.objectPools.set('playerBullets', new ObjectPool(() => this.createPlayerBullet(), 50));
        this.objectPools.set('crabBullets', new ObjectPool(() => this.createCrabBullet(), 100));
        this.objectPools.set('crabs', new ObjectPool(() => this.createCrab(), 60));
        this.objectPools.set('particles', new ObjectPool(() => this.createParticle(), 200));
        this.objectPools.set('explosions', new ObjectPool(() => this.createExplosion(), 20));
    }

    //Get object from
    getPooledObject(type, initParams = {}) {
        const pool = this.objectPools.get(type);
        if (!pool) {
            return null;
        }
        
        const obj = pool.get();
        this.resetObject(obj, initParams);
        this.stats.pooledObjectsReused++;
        return obj;
    }

    //in object in
    returnToPool(type, obj) {
        const pool = this.objectPools.get(type);
        if (pool && obj) {
            obj.active = false;
            pool.return(obj);
        }
    }

    //withwith object to onbut withwithand
    resetObject(obj, params) {
        obj.active = true;
        Object.assign(obj, params);
        
        //onand
        if (!obj.hasOwnProperty('x')) obj.x = 0;
        if (!obj.hasOwnProperty('y')) obj.y = 0;
        if (!obj.hasOwnProperty('width')) obj.width = 10;
        if (!obj.hasOwnProperty('height')) obj.height = 10;
        if (!obj.hasOwnProperty('vx')) obj.vx = 0;
        if (!obj.hasOwnProperty('vy')) obj.vy = 0;
    }

    //SPATIAL PARTITIONING SYSTEM
    initSpatialGrid() {
        this.spatialGrid = new SpatialGrid(800, 600, 100); //canvas width, height, cell size
    }

    //Update withwithin withto
    updateSpatialGrid(objects) {
        this.spatialGrid.clear();
        
        objects.forEach(obj => {
            if (obj.active) {
                this.spatialGrid.insert(obj);
            }
        });
    }

    //andfromandinon Check tofromand
    checkCollisionsOptimized(bullets, targets) {
        const collisions = [];
        
        bullets.forEach(bullet => {
            if (!bullet.active) return;
            
            //Get fromand and from withwithinbut withtoand
            const nearbyTargets = this.spatialGrid.getNearbyObjects(bullet);
            
            nearbyTargets.forEach(target => {
                if (target.active && this.fastCollisionCheck(bullet, target)) {
                    collisions.push({ bullet, target });
                }
            });
            
            this.stats.collisionChecksSkipped += Math.max(0, targets.length - nearbyTargets.length);
        });
        
        return collisions;
    }

    //with Check tofromandand (AABB)
    fastCollisionCheck(obj1, obj2) {
        return !(obj1.x >= obj2.x + obj2.width || 
                obj2.x >= obj1.x + obj1.width ||
                obj1.y >= obj2.y + obj2.height ||
                obj2.y >= obj1.y + obj1.height);
    }

    //BATCH RENDERING SYSTEM
    initBatchRenderer() {
        this.batchRenderer = new BatchRenderer();
    }

    //andinon Rendering objectin
    renderBatch(ctx, objects, imageMap) {
        this.batchRenderer.render(ctx, objects, imageMap);
        this.stats.batchedRenders++;
    }

    //PLAYER SETTINGS CACHE
    initPlayerSettings() {
        this.playerSettings = new PlayerSettingsCache();
    }

    //Save settings player
    savePlayerSettings(settings) {
        this.playerSettings.save(settings);
    }

    //Load settings player
    loadPlayerSettings() {
        return this.playerSettings.load();
    }

    //PERFORMANCE MONITORING
    getPerformanceStats() {
        return {
            ...this.stats,
            memoryUsage: this.calculateMemoryUsage(),
            poolStats: this.getPoolStats()
        };
    }

    getPoolStats() {
        const stats = {};
        this.objectPools.forEach((pool, type) => {
            stats[type] = {
                active: pool.activeCount,
                total: pool.totalCount,
                reused: pool.reusedCount
            };
        });
        return stats;
    }

    calculateMemoryUsage() {
        let usage = 0;
        this.objectPools.forEach(pool => {
            usage += pool.getTotalSize();
        });
        return usage;
    }

    //Clearing for toinand to memory
    cleanup() {
        this.objectPools.forEach(pool => pool.clear());
        this.objectPools.clear();
        if (this.spatialGrid) {
            this.spatialGrid.clear();
        }
        if (this.batchRenderer) {
            this.batchRenderer.cleanup();
        }
    }

    //inwithtoand method for creation objectin
    createPlayerBullet() {
        return {
            type: 'playerBullet',
            active: false,
            x: 0, y: 0, width: 4, height: 10,
            vx: 0, vy: -8,
            color: '#00ffff'
        };
    }

    createCrabBullet() {
        return {
            type: 'crabBullet', 
            active: false,
            x: 0, y: 0, width: 3, height: 8,
            vx: 0, vy: 3,
            color: '#ff6666'
        };
    }

    createCrab() {
        return {
            type: 'crab',
            active: false,
            x: 0, y: 0, width: 40, height: 30,
            vx: 1, vy: 0,
            color: 'green',
            health: 1,
            score: 20
        };
    }

    createParticle() {
        return {
            type: 'particle',
            active: false,
            x: 0, y: 0, width: 2, height: 2,
            vx: 0, vy: 0,
            life: 1.0,
            maxLife: 1.0,
            color: '#ffffff'
        };
    }

    createExplosion() {
        return {
            type: 'explosion',
            active: false,
            x: 0, y: 0, width: 20, height: 20,
            frame: 0,
            maxFrames: 10,
            scale: 1.0
        };
    }
}

//OBJECT POOL CLASS
class ObjectPool {
    constructor(createFn, initialSize = 10) {
        this.createFn = createFn;
        this.pool = [];
        this.activeCount = 0;
        this.totalCount = 0;
        this.reusedCount = 0;
        
        //inandbut Creating object
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
            this.totalCount++;
        }
    }

    get() {
        let obj;
        
        if (this.pool.length > 0) {
            obj = this.pool.pop();
            this.reusedCount++;
        } else {
            obj = this.createFn();
            this.totalCount++;
        }
        
        this.activeCount++;
        return obj;
    }

    return(obj) {
        if (obj) {
            this.pool.push(obj);
            this.activeCount = Math.max(0, this.activeCount - 1);
        }
    }

    getTotalSize() {
        return this.totalCount * 100; //at object in
    }

    clear() {
        this.pool.length = 0;
        this.activeCount = 0;
        this.totalCount = 0;
        this.reusedCount = 0;
    }
}

//SPATIAL GRID CLASS
class SpatialGrid {
    constructor(width, height, cellSize) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = new Array(this.cols * this.rows).fill(null).map(() => []);
    }

    clear() {
        this.grid.forEach(cell => cell.length = 0);
    }

    getCellIndex(x, y) {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
            return -1;
        }
        
        return row * this.cols + col;
    }

    insert(obj) {
        const index = this.getCellIndex(obj.x, obj.y);
        if (index >= 0) {
            this.grid[index].push(obj);
        }
    }

    getNearbyObjects(obj) {
        const nearby = new Set();
        
        //Checking to to and withwithand
        const centerCol = Math.floor(obj.x / this.cellSize);
        const centerRow = Math.floor(obj.y / this.cellSize);
        
        for (let row = centerRow - 1; row <= centerRow + 1; row++) {
            for (let col = centerCol - 1; col <= centerCol + 1; col++) {
                if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
                    const index = row * this.cols + col;
                    this.grid[index].forEach(item => nearby.add(item));
                }
            }
        }
        
        return Array.from(nearby);
    }
}

//BATCH RENDERER CLASS
class BatchRenderer {
    constructor() {
        this.batches = new Map();
        this.tempCanvas = null;
        this.tempCtx = null;
    }

    render(ctx, objects, imageMap) {
        //and object and fromand
        this.batches.clear();
        
        objects.forEach(obj => {
            if (!obj.active) return;
            
            const key = obj.imageKey || obj.type;
            if (!this.batches.has(key)) {
                this.batches.set(key, []);
            }
            this.batches.get(key).push(obj);
        });

        //frominin to
        this.batches.forEach((batch, key) => {
            this.renderBatchGroup(ctx, batch, imageMap.get(key));
        });
    }

    renderBatchGroup(ctx, objects, image) {
        if (!objects.length) return;

        //Saving state totext
        ctx.save();

        if (image && image.complete) {
            //Rendering with fromand for toin
            objects.forEach(obj => {
                //centerX, centerY and bobbing for inandbut andandandinand
                const maxSize = 43; //inandbut on 7% (was 40)

                //Saving andand fromand
                const aspectRatio = image.naturalWidth / image.naturalHeight;
                let drawWidth, drawHeight;

                if (aspectRatio > 1) {
                    //andandon no longer
                    drawWidth = maxSize;
                    drawHeight = maxSize / aspectRatio;
                } else {
                    //inwithfrom no longer or inon
                    drawHeight = maxSize;
                    drawWidth = maxSize * aspectRatio;
                }

                const x = (obj.centerX !== undefined) ? obj.centerX - drawWidth/2 : obj.x;
                const y = (obj.centerY !== undefined) ? obj.centerY - drawHeight/2 + (obj.bobbing || 0) : obj.y;

                ctx.drawImage(image, x, y, drawWidth, drawHeight);

                //ICE FREEZE - bulletswithand into enemy
                if (window.boostManager && window.boostManager.isBoostActive('ICE_FREEZE')) {
                    const centerX = obj.centerX || (obj.x + obj.width/2);
                    const centerY = obj.centerY || (obj.y + obj.height/2);
                    const time = performance.now() * 0.002;

                    ctx.save();

                    //Pulsing effect
                    const radius = 28 + Math.sin(time * 3) * 3;
                    const alpha = 0.25 + Math.sin(time * 4) * 0.05;

                    //Creating and for
                    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
                    gradient.addColorStop(0, `rgba(170, 238, 255, ${alpha})`);
                    gradient.addColorStop(0.7, `rgba(100, 200, 255, ${alpha * 0.6})`);
                    gradient.addColorStop(1, `rgba(50, 150, 255, 0)`);

                    //Draw withbutin
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                    ctx.fill();

                    //toandbut inNOT to
                    ctx.globalAlpha = alpha * 0.8;
                    ctx.strokeStyle = '#aaeeff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
                    ctx.stroke();

                    //toand and points
                    ctx.globalAlpha = Math.sin(time * 6) * 0.5 + 0.5;
                    ctx.fillStyle = '#ffffff';

                    for (let i = 0; i < 6; i++) {
                        const angle = (time + i * Math.PI / 3) % (Math.PI * 2);
                        const sparkleX = centerX + Math.cos(angle) * (radius * 0.8);
                        const sparkleY = centerY + Math.sin(angle) * (radius * 0.8);

                        ctx.beginPath();
                        ctx.arc(sparkleX, sparkleY, 1.5, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    ctx.restore();
                }
            });
        } else {
            //Rendering withand formand (fallback)
            objects.forEach(obj => {
                if (obj.type === 'crab' || obj.imageKey) {
                    //for toin and
                    ctx.font = '25px Arial';
                    ctx.fillText('', obj.x, obj.y + 20 + (obj.bobbing || 0));
                } else {
                    //for and objectin with andtoand
                    ctx.fillStyle = obj.color || '#ffffff';
                    ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
                }
            });
        }
        
        ctx.restore();
    }

    cleanup() {
        this.batches.clear();
        if (this.tempCanvas) {
            this.tempCanvas = null;
            this.tempCtx = null;
        }
    }
}

//PLAYER SETTINGS CACHE CLASS
class PlayerSettingsCache {
    constructor() {
        this.storageKey = 'seaInvadersSettings';
        this.defaultSettings = {
            volume: 0.7,
            difficulty: 'normal',
            graphics: 'high',
            controls: {
                left: 'ArrowLeft',
                right: 'ArrowRight', 
                shoot: 'Space'
            },
            playerName: '',
            highScore: 0,
            gamesPlayed: 0
        };
    }

    save(settings) {
        try {
            const merged = { ...this.defaultSettings, ...settings };
            merged.lastUpdated = Date.now();
            localStorage.setItem(this.storageKey, JSON.stringify(merged));
            return true;
        } catch (error) {
            return false;
        }
    }

    load() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const settings = JSON.parse(saved);
                return { ...this.defaultSettings, ...settings };
            }
        } catch (error) {
        }
        
        return { ...this.defaultSettings };
    }

    clear() {
        try {
            localStorage.removeItem(this.storageKey);
            return true;
        } catch (error) {
            return false;
        }
    }

    updateHighScore(score) {
        const settings = this.load();
        if (score > settings.highScore) {
            settings.highScore = score;
            settings.gamesPlayed = (settings.gamesPlayed || 0) + 1;
            this.save(settings);
            return true;
        }
        return false;
    }
}

//towith
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceOptimizer;
} else if (typeof window !== 'undefined') {
    window.PerformanceOptimizer = PerformanceOptimizer;
}