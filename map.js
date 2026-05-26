// =========================== Модуль карты (генерация, стены, лестницы) ===========================
const MapModule = (function() {
    let currentMapData = null;
    let currentDungeonType = null;
    let stairsUp = null;
    let stairsDown = null;
    
    // Кеш для связанных лестниц между уровнями
    const stairsCache = new Map(); // ключ: `${gx}_${gy}_${depth}`

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

    function generate(gx, gy, depth) {
        const result = DungeonGeneratorModule.generateLevel(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;
    
        const cacheKey = `${gx}_${gy}_${depth}`;
        
        // Пытаемся получить лестницы из кеша
        if (stairsCache.has(cacheKey)) {
            const cached = stairsCache.get(cacheKey);
            stairsUp = cached.stairsUp;
            stairsDown = cached.stairsDown;
            return { x: stairsUp.x, y: stairsUp.y };
        }
        
        // Генерируем лестницу вверх
        const upSeed = `up_${gx}_${gy}_${depth}`;
        stairsUp = findRandomFloor(null, false, upSeed);
        
        // Генерируем лестницу вниз
        if (currentDungeonType.name !== 'city') {
            // Пытаемся найти позицию для лестницы вниз, связанную с лестницей вверх следующего уровня
            const nextLevelKey = `${gx}_${gy}_${depth + 1}`;
            const nextLevelCache = stairsCache.get(nextLevelKey);
            
            if (nextLevelCache && nextLevelCache.stairsUp) {
                // Если следующий уровень уже сгенерирован, используем его stairsUp как stairsDown текущего
                stairsDown = { x: nextLevelCache.stairsUp.x, y: nextLevelCache.stairsUp.y };
                
                // Проверяем, что клетка свободна и не совпадает со stairsUp
                if (currentMapData[stairsDown.y][stairsDown.x] !== 0 || 
                    (stairsDown.x === stairsUp.x && stairsDown.y === stairsUp.y)) {
                    // Если занята, генерируем новую
                    const downSeed = `down_${gx}_${gy}_${depth}`;
                    stairsDown = findRandomFloor(stairsUp, true, downSeed);
                }
            } else {
                // Иначе генерируем новую
                const downSeed = `down_${gx}_${gy}_${depth}`;
                stairsDown = findRandomFloor(stairsUp, true, downSeed);
            }
        } else {
            stairsDown = null;
        }
        
        // Сохраняем в кеш
        stairsCache.set(cacheKey, { stairsUp, stairsDown });
        
        return { x: stairsUp.x, y: stairsUp.y };
    }

    // В map.js - исправленная версия generateWithType

    function generateWithType(gx, gy, depth, dungeonType, entryPoint = null) {
        const result = DungeonGeneratorModule.generateLevelWithType(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, dungeonType);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;

        const cacheKey = `${gx}_${gy}_${depth}`;
    
        // Пытаемся получить лестницы из кеша
        if (stairsCache.has(cacheKey)) {
            const cached = stairsCache.get(cacheKey);
            stairsUp = cached.stairsUp;
            stairsDown = cached.stairsDown;
        
            // Определяем позицию игрока на основе точки входа
            let startPos;
            if (entryPoint === 'up') {
                // Пришли сверху (нажали >) → нужно появиться на stairsDown
                startPos = stairsDown || stairsUp;
            } else if (entryPoint === 'down') {
                // Пришли снизу (нажали <) → нужно появиться на stairsUp
                startPos = stairsUp || stairsDown;
            } else {
                startPos = stairsUp; // по умолчанию
            }
            return startPos;
        }
    
        // Генерируем лестницу вверх
        const upSeed = `up_${gx}_${gy}_${depth}`;
        stairsUp = findRandomFloor(null, false, upSeed);
    
        // Генерируем лестницу вниз (связываем с уровнем выше/ниже)
        if (currentDungeonType.name !== 'city') {
            const downSeed = `down_${gx}_${gy}_${depth}`;
            stairsDown = findRandomFloor(stairsUp, true, downSeed);
        
            // Связываем с соседними уровнями через кеш
            const prevLevelKey = `${gx}_${gy}_${depth - 1}`;
            const nextLevelKey = `${gx}_${gy}_${depth + 1}`;
        
            if (depth > 0 && stairsCache.has(prevLevelKey)) {
                const prevCache = stairsCache.get(prevLevelKey);
                // Убеждаемся, что stairsDown текущего уровня совпадает с stairsUp предыдущего
                prevCache.stairsDown = stairsUp;
                stairsCache.set(prevLevelKey, prevCache);
            }
        
            if (stairsCache.has(nextLevelKey)) {
                const nextCache = stairsCache.get(nextLevelKey);
                nextCache.stairsUp = stairsDown;
                stairsCache.set(nextLevelKey, nextCache);
            }
        } else {
            stairsDown = null;
        }
    
        // Сохраняем в кеш
        stairsCache.set(cacheKey, { stairsUp, stairsDown });
    
        // Определяем позицию игрока на основе точки входа
        let startPos;
        if (entryPoint === 'up') {
            startPos = stairsDown || stairsUp;
        } else if (entryPoint === 'down') {
            startPos = stairsUp || stairsDown;
        } else {
            startPos = stairsUp;
        }
    
        return startPos;
    }

    function generateCity(gx, gy, depth) {
        const result = DungeonGeneratorModule.generateLevel(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT);
        currentMapData = result.mapData;
        currentDungeonType = { 
            name: 'city', 
            wallChar: '#', floorChar: '.', 
            wallColor: '#555', floorColor: '#333' 
        };
    
        const upSeed = `up_city_${gx}_${gy}_${depth}`;
        stairsUp = findRandomFloor(null, false, upSeed);
        const startPos = { x: stairsUp.x, y: stairsUp.y };
        stairsDown = null;
    
        return startPos;
    }
    
    // Очистка кеша при выходе из подземелья
    function clearCache() {
        stairsCache.clear();
    }

    function isWall(x, y) {
        if (!currentMapData) return true;
        if (x < 0 || x >= DataModule.MAP_WIDTH || y < 0 || y >= DataModule.MAP_HEIGHT) return true;
        return currentMapData[y][x] === 1;
    }

    function getRandomFloor(excludePos) {
        return findRandomFloor(excludePos);
    }

    // Публичный API
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
        clearCache
    };
})();
