// =========================== Модуль карты (генерация, стены, лестницы) =========================== 
const MapModule = (function() {
    let currentMapData = null;
    let currentDungeonType = null;
    let stairsUp = null;
    let stairsDown = null;
    
    // Кеш для связанных лестниц между уровнями
    const stairsCache = new Map();

    // Вспомогательная функция поиска случайной клетки пола (для спавна врагов/предметов)
    function findRandomFloor(excludePos, far = false, seed = null) {
        if (!seed) seed = `stairs_${currentDungeonType?.name || 'default'}`;
        const rng = new Math.seedrandom(seed);
        let attempts = 0;
        while (attempts < 1000) {
            const x = Math.floor(rng() * DataModule.MAP_WIDTH);
            const y = Math.floor(rng() * DataModule.MAP_HEIGHT);
            if (currentMapData && currentMapData[y][x] === 0) {
                if (excludePos && x === excludePos.x && y === excludePos.y) {
                    attempts++;
                    continue;
                }
                if (far && excludePos) {
                    const dist = Math.abs(x - excludePos.x) + Math.abs(y - excludePos.y);
                    if (dist < 10) {
                        attempts++;
                        continue;
                    }
                }
                return { x, y };
            }
            attempts++;
        }
        return excludePos || { x: 0, y: 0 };
    }

    // === НОВАЯ ФУНКЦИЯ: Поиск безопасного места РЯДОМ с точкой ===
    function getSafePosNearby(targetPos, maxRadius = 5) {
        if (!targetPos) return { x: 2, y: 2 };
        
        // 1. Проверяем саму точку
        if (currentMapData[targetPos.y] && currentMapData[targetPos.y][targetPos.x] === 0) {
            return targetPos;
        }

        // 2. Ищем по спирали вокруг точки в заданном радиусе
        for (let r = 1; r <= maxRadius; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    // Пропускаем углы квадрата, чтобы сохранить форму круга/ромба (опционально)
                    // if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; 
                    
                    const nx = targetPos.x + dx;
                    const ny = targetPos.y + dy;
                    
                    if (ny >= 0 && ny < DataModule.MAP_HEIGHT && nx >= 0 && nx < DataModule.MAP_WIDTH) {
                        if (currentMapData[ny][nx] === 0) {
                            return { x: nx, y: ny };
                        }
                    }
                }
            }
        }
        
        // 3. Если совсем рядом нет места (редкий случай в пещерах), ищем глобально
        console.warn("⚠️ Не удалось найти место рядом с целью, ищу глобально...");
        return getSafePosGlobal(targetPos);
    }

    // Старая функция глобального поиска (как запасной вариант)
    function getSafePosGlobal(pos) {
        if (!pos) return { x: 2, y: 2 };
        if (currentMapData[pos.y] && currentMapData[pos.y][pos.x] === 0) return pos;
        
        for (let r = 1; r < 20; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = pos.x + dx, ny = pos.y + dy;
                    if (ny >= 0 && ny < DataModule.MAP_HEIGHT && nx >= 0 && nx < DataModule.MAP_WIDTH) {
                        if (currentMapData[ny][nx] === 0) return { x: nx, y: ny };
                    }
                }
            }
        }
        return pos;
    }

    // Генерация или восстановление лестниц для уровня
    function generateStaircase(gx, gy, depth) {
        const cacheKey = `${gx}_${gy}_${depth}`;
        let cached = stairsCache.get(cacheKey);

        if (cached) {
            const upValid = cached.stairsUp && currentMapData[cached.stairsUp.y]?.[cached.stairsUp.x] === 0;
            const downValid = cached.stairsDown && currentMapData[cached.stairsDown.y]?.[cached.stairsDown.x] === 0;

            if (upValid && (currentDungeonType.name === 'city' || downValid)) {
                stairsUp = cached.stairsUp;
                stairsDown = cached.stairsDown;
                return;
            }
            stairsCache.delete(cacheKey);
        }

        // 1. Определяем stairsUp
        if (depth > 0) {
            const prevKey = `${gx}_${gy}_${depth - 1}`;
            const prevCached = stairsCache.get(prevKey); 
            if (prevCached?.stairsDown) {
                stairsUp = prevCached.stairsDown;
                if (currentMapData[stairsUp.y]?.[stairsUp.x] !== 0) {
                    stairsUp = findRandomFloor(null, false, `up_fb_${gx}_${gy}_${depth}`);
                }
            } else {
                stairsUp = findRandomFloor(null, false, `up_${gx}_${gy}_${depth}`);
            }
        } else {
            stairsUp = findRandomFloor(null, false, `up_${gx}_${gy}_${depth}`);
        }

        // 2. Определяем stairsDown
        if (currentDungeonType.name !== 'city') {
            stairsDown = findRandomFloor(stairsUp, true, `down_${gx}_${gy}_${depth}`);
        } else {
            stairsDown = null;
        }

        stairsCache.set(cacheKey, { stairsUp, stairsDown });
    }

    // Основная функция генерации уровня (в map.js)
    function generateLevel(gx, gy, depth, dungeonType, entryPoint = null) {
        const result = DungeonGeneratorModule.generateLevelWithType(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, dungeonType);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;
        window.currentShopCoords = [];
        window.currentInnCoords = []; // <--- ДОБАВИТЬ ЭТУ СТРОКУ

        
        generateStaircase(gx, gy, depth);
        
        let startPos;
        
        // ЛОГИКА ВЫБОРА СТАРТОВОЙ ПОЗИЦИИ
        if (entryPoint === 'down') {
            startPos = getSafePosNearby(stairsUp, 5);
        } else if (entryPoint === 'up') {
            startPos = getSafePosNearby(stairsDown, 5);
        } else {
            const genStart = result.startPos;
            if (genStart && currentMapData[genStart.y]?.[genStart.x] === 0) {
                 startPos = getSafePosNearby(stairsUp, 5);
            } else {
                 startPos = getSafePosNearby(stairsUp, 5);
            }
        }

        // ==========================================================
        // 🛠️ НОВОЕ: ГАРАНТИЯ СВЯЗНОСТИ (FIX ЗАМКНУТЫХ ПОЛОСТЕЙ)
        // ==========================================================
        if (stairsDown && startPos) {
            // Проверяем, существует ли путь от старта до лестницы вниз
            const astar = new ROT.Path.AStar(stairsDown.x, stairsDown.y,
                (x, y) => !isWall(x, y), { topology: 8 });
            
            let isReachable = false;
            astar.compute(startPos.x, startPos.y, (x, y) => {
                if (x === stairsDown.x && y === stairsDown.y) {
                    isReachable = true;
                }
            });

            // Если путь не найден (изолированная полость), принудительно прокладываем коридор
            if (!isReachable) {
                console.warn(`⚠️ [MapModule] Обнаружена изолированная полость на уровне ${depth}! Прокладываем аварийный коридор.`);
                let cx = startPos.x;
                let cy = startPos.y;
                
                // Двигаемся по оси X
                while (cx !== stairsDown.x) {
                    cx += (cx < stairsDown.x) ? 1 : -1;
                    if (cy >= 0 && cy < currentMapData.length && cx >= 0 && cx < currentMapData[0].length) {
                        currentMapData[cy][cx] = 0;
                        // Делаем коридор чуть шире (2x2) для надежности и эстетики
                        if (cy + 1 < currentMapData.length) currentMapData[cy + 1][cx] = 0;
                        if (cx + 1 < currentMapData[0].length) currentMapData[cy][cx + 1] = 0;
                        if (cy + 1 < currentMapData.length && cx + 1 < currentMapData[0].length) currentMapData[cy + 1][cx + 1] = 0;
                    }
                }
                // Двигаемся по оси Y
                while (cy !== stairsDown.y) {
                    cy += (cy < stairsDown.y) ? 1 : -1;
                    if (cy >= 0 && cy < currentMapData.length && cx >= 0 && cx < currentMapData[0].length) {
                        currentMapData[cy][cx] = 0;
                        if (cy + 1 < currentMapData.length) currentMapData[cy + 1][cx] = 0;
                        if (cx + 1 < currentMapData[0].length) currentMapData[cy][cx + 1] = 0;
                        if (cy + 1 < currentMapData.length && cx + 1 < currentMapData[0].length) currentMapData[cy + 1][cx + 1] = 0;
                    }
                }
            }
        }
        // ==========================================================
        
        return startPos;
    }

    function generate(gx, gy, depth) {
        return generateLevel(gx, gy, depth, null);
    }

    function generateWithType(gx, gy, depth, dungeonType, entryPoint = null) {
        return generateLevel(gx, gy, depth, dungeonType, entryPoint);
    } 

    // === ГЕНЕРАТОР ПЛАНИРОВКИ ГОРОДА ===
    let currentMapInteriorCoords = [];

    function generateCityLayout(rand, width, height, density = 0.7) {
        const grid = Array(height).fill().map(() => Array(width).fill(1));
        const interiorCoords = []; 
        const shopCoords = []; // Теперь это массив объектов {x, y, decor}

        // Список символов для декора магазина (оружие, броня, зелья из sprite_registry)
        const shopDecorSymbols = ['/', 'P', ')', '*', 'Y', '(', '=', '|', ']', '[', '}', '{', 'H', '!', '+', '%', '~', '?'];

        // 1. Очищаем карту (делаем все полом)
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                grid[y][x] = 0;
            }
        }

        // 2. Генерируем здания и собираем их список, чтобы потом выбрать одно под магазин
        const buildings = [];
        const STREET_W = 2;
        let y = 2; 

        while (y < height - 6) {
            const bh = rand.int(4, 8); 
            if (y + bh > height) break;

            let x = 2; 
            while (x < width - 6) {
                const bw = rand.int(5, 9); 
                
                // Пропускаем здание, если не хватает места или выпал шанс пропуска
                if (rand.next() > density) {
                    x += bw + STREET_W;
                    continue;
                }
                if (x + bw + STREET_W >= width - 1) break;

                // Сохраняем параметры здания для последующей отрисовки
                buildings.push({ x, y, w: bw, h: bh });

                x += bw + STREET_W;
            }
            y += bh + STREET_W;
        }

        // 3. Выбираем ОДНО здание под МАГАЗИН и ОДНО под ПОСТОЯЛЫЙ ДВОР
        let shopBuildingIndex = -1;
        let innBuildingIndex = -1;
        
        if (buildings.length > 0) {
            shopBuildingIndex = rand.int(0, buildings.length - 1);
        }
        if (buildings.length > 1) {
            innBuildingIndex = rand.int(0, buildings.length - 1);
            while (innBuildingIndex === shopBuildingIndex) {
                innBuildingIndex = rand.int(0, buildings.length - 1);
            }
        }

        const innCoords = []; // Теперь здесь будут ВСЕ клетки пола постоялого двора

        // 4. Отрисовываем стены зданий и заполняем списки координат
        buildings.forEach((b, index) => {
            const isShop = (index === shopBuildingIndex);
            const isInn = (index === innBuildingIndex);

            for (let dy = 0; dy < b.h; dy++) {
                for (let dx = 0; dx < b.w; dx++) {
                    const isPerimeter = (dy === 0 || dy === b.h - 1 || dx === 0 || dx === b.w - 1);
                    const val = isPerimeter ? 1 : 0; 
                    
                    const wx = b.x + dx;
                    const wy = b.y + dy;
                    
                    grid[wy][wx] = val;

                    if (val === 0) { // Если это пол
                        if (isShop) {
                            // Для магазина оставляем случайный декор
                            const decorChar = shopDecorSymbols[Math.floor(rand.next() * shopDecorSymbols.length)];
                            shopCoords.push({ x: wx, y: wy, decor: decorChar });
                        } else if (isInn) {
                            // Для постоялого двора сохраняем ВСЕ клетки пола
                            // В качестве 'decor' используем символ кровати '8'
                            innCoords.push({ x: wx, y: wy, decor: '8' });
                        } else {
                            // Обычные здания
                            interiorCoords.push({ x: wx, y: wy });
                        }
                    }
                }
            }

            // 5. Делаем дверь
            const side = rand.int(0, 3); 
            let doorX = 0, doorY = 0;
            if (side === 0) { doorX = b.x + rand.int(1, b.w - 2); doorY = b.y; }
            else if (side === 1) { doorX = b.x + b.w - 1; doorY = b.y + rand.int(1, b.h - 2); }
            else if (side === 2) { doorX = b.x + rand.int(1, b.w - 2); doorY = b.y + b.h - 1; }
            else { doorX = b.x; doorY = b.y + rand.int(1, b.h - 2); }
            
            grid[doorY][doorX] = 0; 
        });
         
        return { grid, interiorCoords, shopCoords, innCoords };
    }
    function generateCity(gx, gy, depth) {
        // 1. Генерация планировки города (используем наш класс SeededRandom)
        const seedVal = createSeed(gx, gy, depth);
        const rand = new SeededRandom(seedVal);
        const density = rand.next() * 0.3 + 0.3; 
        
        // Генерируем здания, улицы, магазин и постоялый двор
        const layoutResult = generateCityLayout(rand, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, density);
        
        currentMapData = layoutResult.grid;
        currentMapInteriorCoords = layoutResult.interiorCoords || [];
        
        // === Сохраняем координаты для отрисовки декора ===
        window.currentShopCoords = layoutResult.shopCoords || [];
        window.currentInnCoords = layoutResult.innCoords || [];

        currentDungeonType = { 
            name: 'city',
            wallChar: getChar('WALL_CITY'),
            floorChar: getChar('FLOOR_CITY'),
            wallColor: '#6b7280', 
            floorColor: '#374151' 
        };
    
        // 2. Определяем точку входа/выхода (лестницу вверх)
        // Здесь используем библиотеку seedrandom.min.js через Math.seedrandom
        const upSeed = `up_city_${gx}_${gy}_${depth}`;
        
        // ВАЖНО: Без ключевого слова 'new', так как seedrandom возвращает функцию
        const rng = Math.seedrandom(upSeed);
        
        const w = DataModule.MAP_WIDTH;
        const h = DataModule.MAP_HEIGHT;
        
        const edgeTiles = [];
        // Ищем проходимые клетки по краям карты
        for (let y = 1; y < h - 1; y++) {
            if (currentMapData[y][1] === 0) edgeTiles.push({x: 1, y});
            if (currentMapData[y][w-2] === 0) edgeTiles.push({x: w-2, y});
        }
        for (let x = 1; x < w - 1; x++) {
            if (currentMapData[1][x] === 0) edgeTiles.push({x, y: 1});
            if (currentMapData[h-2][x] === 0) edgeTiles.push({x, y: h-2});
        }
        
        // Выбираем случайную клетку из найденных
        if (edgeTiles.length > 0) {
            // rng() возвращает число от 0 до 1
            stairsUp = edgeTiles[Math.floor(rng() * edgeTiles.length)];
        } else {
            // Фолбэк, если края полностью закрыты стенами (редко)
            stairsUp = { x: 2, y: 2 };
        }
        
        stairsDown = null; 
        return { x: stairsUp.x, y: stairsUp.y };
    } 

    function clearCache() {
        stairsCache.clear();
        currentMapInteriorCoords = [];
        console.log("🗑️ Кеш лестниц очищен");
    }

    function isWall(x, y) {
        if (!currentMapData) return true;
        if (x < 0 || x >= DataModule.MAP_WIDTH || y < 0 || y >= DataModule.MAP_HEIGHT) return true;
        return currentMapData[y][x] === 1;
    }

    function getRandomFloor(excludePos) {
        return findRandomFloor(excludePos);
    } 

    function debugCache() {
        console.log("=== Текущий кеш лестниц ===");
        for (let [key, value] of stairsCache.entries()) {
            console.log(`${key}: up=(${value.stairsUp?.x},${value.stairsUp?.y}), down=(${value.stairsDown?.x},${value.stairsDown?.y})`);
        }
    }

    return {
        get currentMapData() { return currentMapData; },
        get currentDungeonType() { return currentDungeonType; },
        get stairsUp() { return stairsUp; },
        get stairsDown() { return stairsDown; },
        get interiorCoords() { return currentMapInteriorCoords; },
        
        generate,
        generateWithType,
        generateCity,
        isWall,
        getRandomFloor,
        clearCache,
        debugCache
    };
})();
