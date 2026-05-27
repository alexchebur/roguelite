// =========================== Модуль карты (генерация, стены, лестницы) ===========================
const MapModule = (function() {
    let currentMapData = null;
    let currentDungeonType = null;
    let stairsUp = null;
    let stairsDown = null;
    
    // Кеш для связанных лестниц между уровнями
    const stairsCache = new Map();

    // Вспомогательная функция поиска случайной клетки пола
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
    // Вспомогательная функция: гарантирует, что позиция будет на полу, а не в стене
    function getSafePos(pos) {
        if (!pos) return { x: 2, y: 2 };
        // Если координата уже на полу, возвращаем её
        if (currentMapData[pos.y] && currentMapData[pos.y][pos.x] === 0) return pos;
        
        // Иначе ищем ближайший пол по спирали
        for (let r = 1; r < 15; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = pos.x + dx, ny = pos.y + dy;
                    if (ny >= 0 && ny < DataModule.MAP_HEIGHT && nx >= 0 && nx < DataModule.MAP_WIDTH) {
                        if (currentMapData[ny][nx] === 0) return { x: nx, y: ny };
                    }
                }
            }
        }
        return pos; // fallback, если всё заполнено стенами (почти невозможно)
    }

    // Генерация или восстановление лестниц для уровня
    function generateStaircase(gx, gy, depth) {
        const cacheKey = `${gx}_${gy}_${depth}`;
        let cached = stairsCache.get(cacheKey);

        // Если есть кеш, строго проверяем валидность координат на ТЕКУЩЕЙ карте
        if (cached) {
            const upValid = cached.stairsUp && currentMapData[cached.stairsUp.y]?.[cached.stairsUp.x] === 0;
            const downValid = cached.stairsDown && currentMapData[cached.stairsDown.y]?.[cached.stairsDown.x] === 0;

            // Если обе лестницы на полу (или в городе, где down=null), используем кеш
            if (upValid && (currentDungeonType.name === 'city' || downValid)) {
                stairsUp = cached.stairsUp;
                stairsDown = cached.stairsDown;
                return;
            }
            // Кеш повреждён или карта изменилась → очищаем и генерируем заново
            stairsCache.delete(cacheKey);
        }

        // 1. Определяем stairsUp
        if (depth > 0) {
            // Связываем с лестницей вниз предыдущего уровня
            const prevKey = `${gx}_${gy}_${depth - 1}`;
            const prevCached = stairsCache.get(prevKey);
            if (prevCached?.stairsDown) {
                stairsUp = prevCached.stairsDown;
                // Проверяем, не стала ли она стеной на новом уровне
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

        // 3. Сохраняем корректную пару в кеш
        stairsCache.set(cacheKey, { stairsUp, stairsDown });
    }

    // Основная функция генерации уровня
    function generateLevel(gx, gy, depth, dungeonType, entryPoint = null) {
        const result = DungeonGeneratorModule.generateLevelWithType(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, dungeonType);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;
        
        generateStaircase(gx, gy, depth);
        
        let startPos;
        if (entryPoint === 'down') {
            // Наступили на < (спуск) → появляемся у > (stairsUp)
            startPos = getSafePos(stairsUp);
            console.log(`✅ Спуск: появляемся у > (${startPos.x},${startPos.y})`);
        } else if (entryPoint === 'up') {
            // Наступили на > (подъём) → появляемся у < (stairsDown)
            startPos = getSafePos(stairsDown);
            console.log(`✅ Подъём: появляемся у < (${startPos.x},${startPos.y})`);
        } else {
            // Первый вход в подземелье
            startPos = getSafePos(stairsUp);
            console.log(`✅ Вход: появляемся у > (${startPos.x},${startPos.y})`);
        }
        
        return startPos;
    }
    // Публичные методы
    function generate(gx, gy, depth) {
        return generateLevel(gx, gy, depth, null);
    }

    function generateWithType(gx, gy, depth, dungeonType, entryPoint = null) {
        return generateLevel(gx, gy, depth, dungeonType, entryPoint);
    }

    // === ГЕНЕРАТОР ПЛАНИРОВКИ ГОРОДА ===
    function generateCityLayout(rand, width, height) {
        // 1. Создаём карту: по краям стены, внутри всё пол (улицы)
        const grid = Array(height).fill().map(() => Array(width).fill(1));
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                grid[y][x] = 0;
            }
        }

        const STREET_W = 2; // Ширина улиц между зданиями
        let y = 2;
        
        // 2. Размещаем здания по рядам
        while (y < height - 6) {
            const bh = rand.int(4, 6); // Высота здания (небольшой разброс)
            let x = 2;
            
            while (x < width - 6) {
                const bw = rand.int(4, 9); // Ширина здания
                if (x + bw + STREET_W >= width) break; // Не вылезаем за границу

                // Рисуем здание (стены)
                for (let dy = 0; dy < bh; dy++) {
                    for (let dx = 0; dx < bw; dx++) {
                        grid[y + dy][x + dx] = 1;
                    }
                }

                // 3. Вырезаем дверь на случайной стороне здания
                const side = rand.int(0, 3); // 0:верх, 1:право, 2:низ, 3:лево
                let doorX = x, doorY = y;
                
                if (side === 0) { doorX = x + rand.int(1, bw - 2); doorY = y - 1; }
                else if (side === 1) { doorX = x + bw; doorY = y + rand.int(1, bh - 2); }
                else if (side === 2) { doorX = x + rand.int(1, bw - 2); doorY = y + bh; }
                else { doorX = x - 1; doorY = y + rand.int(1, bh - 2); }
                
                // Убеждаемся, что дверь не выходит за границы карты
                if (doorX >= 0 && doorX < width && doorY >= 0 && doorY < height) {
                    grid[doorY][doorX] = 0;
                }

                // Сдвигаемся вправо: ширина здания + улица
                x += bw + STREET_W;
            }
            // Сдвигаемся вниз: высота здания + улица
            y += bh + STREET_W;
        }
        return grid;
    }
    
    function generateCity(gx, gy, depth) {
        const result = DungeonGeneratorModule.generateLevel(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT);
        currentMapData = result.mapData;
        currentDungeonType = { 
            name: 'city', 
            wallChar: '#', floorChar: '.', 
            wallColor: '#555', floorColor: '#333' 
        };
        
        // Город: только лестница вверх (выход на глобальную карту)
        const upSeed = `up_city_${gx}_${gy}_${depth}`;
        stairsUp = findRandomFloor(null, false, upSeed);
        stairsDown = null;
        
        const startPos = { x: stairsUp.x, y: stairsUp.y };
        return startPos;
    }
    
    function clearCache() {
        stairsCache.clear();
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

    // Отладочная функция для просмотра кеша
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
        generate,
        generateWithType,
        generateCity,
        isWall,
        getRandomFloor,
        clearCache,
        debugCache
    };
})();
