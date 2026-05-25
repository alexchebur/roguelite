// =========================== Модуль игры (управление, ходы, загрузка уровней) ===========================
const GameModule = (function() {
    let player = null;
    let enemies = [];
    let items = [];
    let globalX = 0;
    let globalY = 0;
    let currentLocData = null;
    let currentWorldTrend = null;
    let explored = new Set();
    let busy = false;
    let lastGlobalX = null;
    let lastGlobalY = null;
    let animationFrame = null;

    function init() {
        try {
            RenderModule.init();
        } catch (e) {
            console.error(e);
            return;
        }

        globalX = Math.floor(Math.random() * 10);
        globalY = Math.floor(Math.random() * 10);

        loadLevel(globalX, globalY);

        window.addEventListener("keydown", (e) => handleInput(e));
        
        // Добавляем обработчики сенсорного управления
        addTouchControls();
        
        RenderModule.log("Игра загружена. Используйте стрелки или касайтесь карты для движения.", "info");
    }

    // НОВЫЙ МЕТОД: добавление сенсорного управления
    function addTouchControls() {
        const mapContainer = document.getElementById("map-container");
        const canvas = mapContainer.querySelector("canvas");
        
        if (!canvas) {
            console.warn("Canvas не найден для сенсорного управления");
            return;
        }
        
        canvas.addEventListener("touchstart", (e) => {
            e.preventDefault(); // предотвращаем прокрутку страницы
            
            if (busy || player.hp <= 0) return;
            
            // Получаем координаты касания относительно canvas
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            
            // Определяем масштаб canvas
            const scale = parseFloat(canvas.style.transform.replace("scale(", "").replace(")", "")) || 1;
            
            // Вычисляем координаты касания в пикселях canvas
            const canvasX = (touch.clientX - rect.left) / scale;
            const canvasY = (touch.clientY - rect.top) / scale;
            
            // Определяем размер ячейки в пикселях
            const cellWidth = canvas.width / RenderModule.COLS;
            const cellHeight = canvas.height / RenderModule.ROWS;
            
            // Получаем индекс клетки на экране (относительно камеры)
            const screenCol = Math.floor(canvasX / cellWidth);
            const screenRow = Math.floor(canvasY / cellHeight);
            
            // Получаем смещение камеры
            const cam = RenderModule.getCameraOffset(player);
            
            // Вычисляем мировые координаты целевой клетки
            const targetX = screenCol + cam.x;
            const targetY = screenRow + cam.y;
            
            // Проверяем, не за пределами ли карты
            if (targetX < 0 || targetX >= DataModule.MAP_WIDTH || 
                targetY < 0 || targetY >= DataModule.MAP_HEIGHT) {
                return;
            }
            
            // Запускаем движение к цели
            startMovementToTarget(targetX, targetY);
        });
        
        // Добавляем подсказку для мобильных устройств
        if (isMobileDevice()) {
            RenderModule.log("💡 Подсказка: коснитесь любой клетки на карте, чтобы двигаться к ней", "info");
        }
    }
    
    // НОВЫЙ МЕТОД: движение по прямой к цели
    function startMovementToTarget(targetX, targetY) {
        if (busy || player.hp <= 0) return;
        
        // Останавливаем предыдущую анимацию
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }
        
        // Проверяем, достижима ли цель (не стена)
        if (MapModule.isWall(targetX, targetY)) {
            RenderModule.log("Нельзя двигаться сквозь стены!", "combat");
            return;
        }
        
        // Вычисляем направление к цели
        let dx = 0, dy = 0;
        if (targetX > player.x) dx = 1;
        else if (targetX < player.x) dx = -1;
        if (targetY > player.y) dy = 1;
        else if (targetY < player.y) dy = -1;
        
        // Если цель совпадает с текущей позицией
        if (dx === 0 && dy === 0) return;
        
        // Анимируем движение
        function moveStep() {
            if (busy || player.hp <= 0) {
                animationFrame = null;
                return;
            }
            
            // Проверяем, достигли ли цели
            if (player.x === targetX && player.y === targetY) {
                animationFrame = null;
                return;
            }
            
            // Проверяем, не нужно ли скорректировать направление
            let newDx = dx, newDy = dy;
            
            // Если дошли до координаты цели по X, двигаемся только по Y
            if ((dx === 1 && player.x >= targetX) || (dx === -1 && player.x <= targetX)) {
                newDx = 0;
            }
            // Если дошли до координаты цели по Y, двигаемся только по X
            if ((dy === 1 && player.y >= targetY) || (dy === -1 && player.y <= targetY)) {
                newDy = 0;
            }
            
            // Если обнулились оба направления - достигли цели
            if (newDx === 0 && newDy === 0) {
                animationFrame = null;
                return;
            }
            
            // Делаем один шаг
            processTurn(newDx, newDy);
            
            // Если игрок жив и ещё не достиг цели, продолжаем движение
            if (player.hp > 0 && (player.x !== targetX || player.y !== targetY) && !busy) {
                animationFrame = requestAnimationFrame(() => moveStep());
            } else {
                animationFrame = null;
            }
        }
        
        // Запускаем движение
        moveStep();
    }
    
    // НОВАЯ ФУНКЦИЯ: определение мобильного устройства
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function loadLevel(gx, gy) {
        lastGlobalX = globalX;
        lastGlobalY = globalY;
        globalX = gx;
        globalY = gy;
        enemies = [];
        items = [];
        explored.clear();

        currentLocData = NameGeneratorModule.generateLocationData(gx, gy);
        currentWorldTrend = WorldCurveModule.getWorldTrend(gx, gy);

        const startPos = MapModule.generate(gx, gy);

        document.getElementById("ui-loc-coords").textContent = `X: ${gx}, Y: ${gy}`;
        RenderModule.log(`Локация: ${currentLocData.fullName}`, "info");
        if (currentWorldTrend.name !== "Обычный уровень") {
            RenderModule.log(`Тренд мира: ${currentWorldTrend.name}`, "event");
        }

        let spawnPos;

        if (!player) {
            spawnPos = startPos;
            player = EntityModule.createPlayer(spawnPos.x, spawnPos.y);
        } else {
            const dx = gx - lastGlobalX;
            const dy = gy - lastGlobalY;

            if (dx > 0 || dy > 0) {
                spawnPos = MapModule.stairsDown;
            } else if (dx < 0 || dy < 0) {
                spawnPos = MapModule.stairsUp;
            } else {
                spawnPos = startPos;
            }

            if (!spawnPos) {
                spawnPos = startPos;
                RenderModule.log("Ошибка навигации: лестница не найдена, спавн в центре.", "combat");
            }

            player.x = spawnPos.x;
            player.y = spawnPos.y;
        }

        spawnEntities(gx, gy);
        renderFrame();
    }

    function spawnEntities(gx, gy) {
        const enemyCount = 8;
        const enemyMult = WorldCurveModule.getEnemyMultiplier(gx, gy);

        enemies = EntityModule.spawnEnemies(
            MapModule.currentMapData,
            player,
            DataModule.ENEMY_TYPES,
            enemyCount,
            enemyMult,
            3
        );

        const rng = new Math.seedrandom(`ent_${gx}_${gy}`);
        const oldRand = Math.random;
        Math.random = rng;

        const itemMult = WorldCurveModule.getItemPowerMultiplier(gx, gy);
        // Используем новый метод спавна предметов, если он есть в EntityModule
        if (EntityModule.spawnItems) {
            items = EntityModule.spawnItems(
                MapModule.currentMapData,
                player,
                DataModule.ITEM_TYPES,
                4,
                itemMult,
                3
            );
        } else {
            // Fallback на старую логику
            for (let i = 0; i < 4; i++) {
                const pos = MapModule.getRandomFloor(player);
                const type = DataModule.ITEM_TYPES[Math.floor(Math.random() * DataModule.ITEM_TYPES.length)];
                items.push(EntityModule.createItem(type, pos.x, pos.y, itemMult));
            }
        }

        Math.random = oldRand;
    }

    function handleInput(e) {
        if (busy || player.hp <= 0) return;
        
        let dx=0, dy=0;
        if (e.key==="ArrowUp") dy=-1;
        if (e.key==="ArrowDown") dy=1;
        if (e.key==="ArrowLeft") dx=-1;
        if (e.key==="ArrowRight") dx=1;
        
        if (dx!==0 || dy!==0 || e.key===" ") {
            e.preventDefault();
            // Останавливаем анимацию при ручном управлении
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }
            processTurn(dx, dy);
        }
    }

    function processTurn(dx, dy) {
        const nx = player.x + dx;
        const ny = player.y + dy;

        if (MapModule.isWall(nx, ny)) return;

        const enemy = enemies.find(e => e.hp>0 && e.x===nx && e.y===ny);
        if (enemy) {
            CombatModule.attack(player, enemy, (m,t)=>RenderModule.log(m,t));
        } else {
            player.x = nx;
            player.y = ny;

            const idx = items.findIndex(i => i.x===nx && i.y===ny);
            if (idx !== -1) {
                const item = items[idx];
                player.inventory.push(item);
                RenderModule.log(`Подобрано: ${item.name}`, "loot");
                items.splice(idx, 1);
            }

            if (MapModule.stairsUp && nx===MapModule.stairsUp.x && ny===MapModule.stairsUp.y) {
                RenderModule.log("Вы поднимаетесь выше...", "info");
                if (animationFrame) cancelAnimationFrame(animationFrame);
                setTimeout(()=>loadLevel(globalX+1, globalY+1), 100);
                return;
            }
            if (MapModule.stairsDown && nx===MapModule.stairsDown.x && ny===MapModule.stairsDown.y) {
                RenderModule.log("Вы спускаетесь ниже...", "info");
                if (animationFrame) cancelAnimationFrame(animationFrame);
                setTimeout(()=>loadLevel(globalX-1, globalY-1), 100);
                return;
            }
        }

        // Движение врагов
        enemies.forEach(e => {
            if (e.hp<=0) return;
            const dist = Math.abs(e.x-player.x) + Math.abs(e.y-player.y);
            if (dist < 8) {
                if (dist===1) {
                    CombatModule.attack(e, player, (m,t)=>RenderModule.log(m,t));
                } else {
                    const astar = new ROT.Path.AStar(player.x, player.y, 
                        (x,y)=>!MapModule.isWall(x,y), {topology:8});
                    let next = null;
                    astar.compute(e.x, e.y, (x,y) => {
                        if (!next && (x!==e.x||y!==e.y)) next={x,y};
                    });
                    if (next) {
                        if (!enemies.some(other => other!==e && other.hp>0 && other.x===next.x && other.y===next.y)) {
                            e.x = next.x; e.y = next.y;
                        }
                    }
                }
            }
        });

        if (player.hp <= 0) {
            RenderModule.log("ВЫ ПОГИБЛИ. F5 для рестарта.", "combat");
            if (animationFrame) cancelAnimationFrame(animationFrame);
        }
        
        renderFrame();
    }

    function renderFrame() {
        const vis = RenderModule.draw(player, enemies, items);
        vis.forEach(k => explored.add(k));
        RenderModule.updateUI(player, currentLocData, currentWorldTrend);
        RenderModule.drawMinimap(player, explored);
    }

    return {
        init
    };
})();

// Запуск
window.onload = () => GameModule.init();
