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
        
        // Если уже есть в кеше, просто возвращаем
        if (stairsCache.has(cacheKey)) {
            const cached = stairsCache.get(cacheKey);
            stairsUp = cached.stairsUp;
            stairsDown = cached.stairsDown;
            return;
        }
        
        // Генерируем лестницу вверх (всегда новая)
        const upSeed = `up_${gx}_${gy}_${depth}`;
        stairsUp = findRandomFloor(null, false, upSeed);
        
        // Генерируем лестницу вниз (если не город)
        if (currentDungeonType.name !== 'city') {
            // Пытаемся найти или создать stairsDown
            const downSeed = `down_${gx}_${gy}_${depth}`;
            stairsDown = findRandomFloor(stairsUp, true, downSeed);
        } else {
            stairsDown = null;
        }
        
        // Сохраняем в кеш
        stairsCache.set(cacheKey, { stairsUp, stairsDown });
        
        // Если есть stairsDown, связываем его с лестницей вверх следующего уровня
        if (stairsDown) {
            const nextKey = `${gx}_${gy}_${depth + 1}`;
            if (!stairsCache.has(nextKey)) {
                // Предварительно создаём запись для следующего уровня
                stairsCache.set(nextKey, { stairsUp: stairsDown, stairsDown: null });
            } else {
                // Обновляем существующую запись
                const nextCache = stairsCache.get(nextKey);
                nextCache.stairsUp = stairsDown;
                stairsCache.set(nextKey, nextCache);
            }
        }
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
