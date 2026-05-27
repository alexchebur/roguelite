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
    // === ГЕНЕРАТОР ПЛАНИРОВКИ ГОРОДА (исправленный) ===
    function generateCityLayout(rand, width, height) {
        // 1. Стартуем с полной сетки стен
        const grid = Array(height).fill().map(() => Array(width).fill(1));

        // 2. Вырезаем внутреннее пространство (улицы по всей карте)
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                grid[y][x] = 0;
            }
        }

        const STREET_W = 2; // Ширина улиц
        let y = 2; // Отступ от верхней стены

        // 3. Размещаем здания по упорядоченной сетке
        while (y < height - 6) {
            const bh = rand.int(4, 6); // Высота здания (4..6)
            let x = 2; // Отступ от левой стены

            while (x < width - 6) {
                const bw = rand.int(5, 8); // Ширина здания (5..8)
                if (x + bw + STREET_W >= width - 1) break;

                // Рисуем здание: стены по периметру, пол внутри
                for (let dy = 0; dy < bh; dy++) {
                    for (let dx = 0; dx < bw; dx++) {
                        const isPerimeter = (dy === 0 || dy === bh - 1 || dx === 0 || dx === bw - 1);
                        grid[y + dy][x + dx] = isPerimeter ? 1 : 0;
                    }
                }

                // 4. Вырезаем дверь на случайной стороне
                const side = rand.int(0, 3); // 0:верх, 1:право, 2:низ, 3:лево
                let doorX = 0, doorY = 0;
                
                if (side === 0) { // Верх
                    doorX = x + rand.int(1, bw - 2);
                    doorY = y;
                } else if (side === 1) { // Право
                    doorX = x + bw - 1;
                    doorY = y + rand.int(1, bh - 2);
                } else if (side === 2) { // Низ
                    doorX = x + rand.int(1, bw - 2);
                    doorY = y + bh - 1;
                } else { // Лево
                    doorX = x;
                    doorY = y + rand.int(1, bh - 2);
                }
                
                grid[doorY][doorX] = 0; // Прорезаем проход

                // Сдвигаемся вправо: здание + улица
                x += bw + STREET_W;
            }
            // Сдвигаемся вниз: здание + улица
            y += bh + STREET_W;
        }
        return grid;
    }
    
    function generateCity(gx, gy, depth) {
        const seedVal = createSeed(gx, gy, depth);
        const rand = new SeededRandom(seedVal);
        
        // Генерируем планировку
        currentMapData = generateCityLayout(rand, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT);
        
        currentDungeonType = { 
            name: 'city',
            wallChar: '█',  
            floorChar: '·', 
            wallColor: '#6b7280', 
            floorColor: '#374151' 
        };
        
        // === ЛЕСТНИЦА ">" СТРОГО У ВНЕШНЕЙ СТЕНЫ ===
        const upSeed = `up_city_${gx}_${gy}_${depth}`;
        const rng = new Math.seedrandom(upSeed);
        const w = DataModule.MAP_WIDTH;
        const h = DataModule.MAP_HEIGHT;
        
        // Собираем все клетки пола, прилегающие к границе карты
        const edgeTiles = [];
        
        // Левый и правый край (x=1 и x=w-2)
        for (let y = 1; y < h - 1; y++) {
            if (currentMapData[y][1] === 0) edgeTiles.push({x: 1, y});
            if (currentMapData[y][w-2] === 0) edgeTiles.push({x: w-2, y});
        }
        // Верхний и нижний край (y=1 и y=h-2)
        for (let x = 1; x < w - 1; x++) {
            if (currentMapData[1][x] === 0) edgeTiles.push({x, y: 1});
            if (currentMapData[h-2][x] === 0) edgeTiles.push({x, y: h-2});
        }
        
        // Выбираем случайную клетку у края
        if (edgeTiles.length > 0) {
            stairsUp = edgeTiles[Math.floor(rng() * edgeTiles.length)];
        } else {
            // Fallback на случай крайне редкой конфигурации
            stairsUp = { x: 2, y: 2 };
        }
        
        stairsDown = null;
        return { x: stairsUp.x, y: stairsUp.y };
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
