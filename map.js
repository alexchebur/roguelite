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

    // Основная функция генерации уровня
    function generateLevel(gx, gy, depth, dungeonType, entryPoint = null) {
        const result = DungeonGeneratorModule.generateLevelWithType(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, dungeonType);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;
        
        generateStaircase(gx, gy, depth);
        
        let startPos;
        
        // ЛОГИКА ВЫБОРА СТАРТОВОЙ ПОЗИЦИИ
        if (entryPoint === 'down') {
            // Спуск вниз: появляемся у верхней лестницы (>)
            startPos = getSafePosNearby(stairsUp, 5);
        } else if (entryPoint === 'up') {
            // Подъем вверх: появляемся у нижней лестницы (<)
            startPos = getSafePosNearby(stairsDown, 5);
        } else {
            // Первый вход в подземелье: появляемся у входа (>)
            // Используем startPos из генератора, но проверяем его близость к stairsUp
            // Если генератор вернул точку далеко от входа, принудительно ставим у входа
            const genStart = result.startPos;
            
            // Проверяем, есть ли пол в точке генератора
            if (genStart && currentMapData[genStart.y]?.[genStart.x] === 0) {
                 // Если точка валидна, используем её, НО только если она не слишком далеко от входа
                 // (для пещер лучше всегда ставить у входа, чтобы игрок не потерялся)
                 startPos = getSafePosNearby(stairsUp, 5);
            } else {
                 startPos = getSafePosNearby(stairsUp, 5);
            }
        }
        
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

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                grid[y][x] = 0;
            }
        }

        const STREET_W = 2;
        let y = 2; 

        while (y < height - 6) {
            const bh = rand.int(4, 8); 
            if (y + bh > height) break;

            let x = 2; 
            while (x < width - 6) {
                const bw = rand.int(5, 9); 
                if (rand.next() > density) {
                    x += bw + STREET_W;
                    continue;
                }
                if (x + bw + STREET_W >= width - 1) break;

                for (let dy = 0; dy < bh; dy++) {
                    for (let dx = 0; dx < bw; dx++) {
                        const isPerimeter = (dy === 0 || dy === bh - 1 || dx === 0 || dx === bw - 1);
                        const val = isPerimeter ? 1 : 0;
                        grid[y + dy][x + dx] = val;
                        if (val === 0) {
                            interiorCoords.push({ x: x + dx, y: y + dy });
                        }
                    }
                }

                const side = rand.int(0, 3); 
                let doorX = 0, doorY = 0;
                if (side === 0) { doorX = x + rand.int(1, bw - 2); doorY = y; }
                else if (side === 1) { doorX = x + bw - 1; doorY = y + rand.int(1, bh - 2); }
                else if (side === 2) { doorX = x + rand.int(1, bw - 2); doorY = y + bh - 1; }
                else { doorX = x; doorY = y + rand.int(1, bh - 2); }
                
                grid[doorY][doorX] = 0; 
                x += bw + STREET_W;
            }
            y += bh + STREET_W;
        }
        
        return { grid, interiorCoords };
    }

    function generateCity(gx, gy, depth) {
        const seedVal = createSeed(gx, gy, depth);
        const rand = new SeededRandom(seedVal);
        const density = rand.next() * 0.3 + 0.3; 
        
        const layoutResult = generateCityLayout(rand, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, density);
        
        currentMapData = layoutResult.grid;
        currentMapInteriorCoords = layoutResult.interiorCoords || [];
        
        currentDungeonType = { 
            name: 'city',
            wallChar: getChar('WALL_CITY'),
            floorChar: getChar('FLOOR_CITY'),
            wallColor: '#6b7280', 
            floorColor: '#374151' 
        };
    
        const upSeed = `up_city_${gx}_${gy}_${depth}`;
        const rng = new Math.seedrandom(upSeed);
        const w = DataModule.MAP_WIDTH;
        const h = DataModule.MAP_HEIGHT;
        
        const edgeTiles = [];
        for (let y = 1; y < h - 1; y++) {
            if (currentMapData[y][1] === 0) edgeTiles.push({x: 1, y});
            if (currentMapData[y][w-2] === 0) edgeTiles.push({x: w-2, y});
        }
        for (let x = 1; x < w - 1; x++) {
            if (currentMapData[1][x] === 0) edgeTiles.push({x, y: 1});
            if (currentMapData[h-2][x] === 0) edgeTiles.push({x, y: h-2});
        }
        
        if (edgeTiles.length > 0) {
            stairsUp = edgeTiles[Math.floor(rng() * edgeTiles.length)];
        } else {
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
