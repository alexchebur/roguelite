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

    // Генерация или восстановление лестниц для уровня
    function generateStaircase(gx, gy, depth) {
        const cacheKey = `${gx}_${gy}_${depth}`;
        const prevKey  = `${gx}_${gy}_${depth - 1}`;

        // 1. Пытаемся восстановить из полного кеша
        if (stairsCache.has(cacheKey)) {
            const cached = stairsCache.get(cacheKey);
            // Если кеш полный (есть и up, и down), используем его без перегенерации
            if (cached.stairsUp && cached.stairsDown) {
                stairsUp = cached.stairsUp;
                stairsDown = cached.stairsDown;
                return;
            }
            // Если в кеше только stairsUp (предкеш со старого уровня), берём его
            stairsUp = cached.stairsUp;
        } else if (depth > 0 && stairsCache.has(prevKey)) {
            // Первый вход на уровень: stairsUp должен совпадать с stairsDown предыдущего уровня
            stairsUp = stairsCache.get(prevKey).stairsDown;
        }

        // 2. Если stairsUp всё ещё нет (глубина 0 или кеш стёрт), генерируем его
        if (!stairsUp) {
            const upSeed = `up_${gx}_${gy}_${depth}`;
            stairsUp = findRandomFloor(null, false, upSeed);
        }

        // 3. Всегда генерируем stairsDown заново для текущего уровня (кроме городов)
        if (currentDungeonType.name !== 'city') {
            const downSeed = `down_${gx}_${gy}_${depth}`;
            stairsDown = findRandomFloor(stairsUp, true, downSeed);
        } else {
            stairsDown = null;
        }

        // 4. Сохраняем полную пару в кеш для будущих возвратов
        stairsCache.set(cacheKey, { stairsUp, stairsDown });
        
        console.log(`🪜 Лестницы ур.${depth+1}: up=(${stairsUp.x},${stairsUp.y}), down=(${stairsDown ? stairsDown.x : 'null'},${stairsDown ? stairsDown.y : 'null'})`);
    }

    // Основная функция генерации уровня
    function generateLevel(gx, gy, depth, dungeonType, entryPoint = null) {
        // Генерируем карту подземелья
        const result = DungeonGeneratorModule.generateLevelWithType(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, dungeonType);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;
        
        // Генерируем или восстанавливаем лестницы
        generateStaircase(gx, gy, depth);
        
        // Проверяем, нужно ли корректировать stairsDown при подъёме
        if (entryPoint === 'up' && stairsDown) {
            // Убеждаемся, что stairsDown не null и доступен
            console.log(`Подъём на уровень ${depth}: используем stairsDown (${stairsDown.x},${stairsDown.y})`);
        }
        
        // Определяем стартовую позицию
        let startPos;
        if (entryPoint === 'down') {
            // При спуске на следующий уровень - появляемся у лестницы вниз (<)
            startPos = stairsDown ? { x: stairsDown.x, y: stairsDown.y } : result.startPos;
            console.log(`✅ Спуск: появляемся у лестницы вниз (${startPos.x},${startPos.y})`);
        } else if (entryPoint === 'up') {
            // При подъёме на предыдущий уровень - появляемся у лестницы вверх (>)
            startPos = stairsUp ? { x: stairsUp.x, y: stairsUp.y } : result.startPos;
            console.log(`✅ Подъём: появляемся у лестницы вверх (${startPos.x},${startPos.y})`);
        } else {
            // Первый вход в подземелье или город (по умолчанию у лестницы вверх)
            startPos = stairsUp ? { x: stairsUp.x, y: stairsUp.y } : result.startPos;
            console.log(`✅ Вход: появляемся у лестницы вверх (${startPos.x},${startPos.y})`);
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
