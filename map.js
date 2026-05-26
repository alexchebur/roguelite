// =========================== Модуль карты (генерация, стены, лестницы) ===========================
const MapModule = (function() {
    let currentMapData = null;
    let currentDungeonType = null;
    let stairsUp = null;
    let stairsDown = null;
    
    // Кеш для связанных лестниц
    const stairsCache = new Map();

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

    // Генерация уровня с поддержкой entryPoint
    function generateWithType(gx, gy, depth, dungeonType, entryPoint = null) {
        const result = DungeonGeneratorModule.generateLevelWithType(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, dungeonType);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;
    
        const cacheKey = `${gx}_${gy}_${depth}`;
        
        // Восстанавливаем или генерируем лестницы
        if (stairsCache.has(cacheKey)) {
            const cached = stairsCache.get(cacheKey);
            stairsUp = cached.stairsUp;
            stairsDown = cached.stairsDown;
        } else {
            // Генерируем лестницу вверх
            const upSeed = `up_${gx}_${gy}_${depth}`;
            stairsUp = findRandomFloor(null, false, upSeed);
            
            // Генерируем лестницу вниз (если не город)
            if (currentDungeonType.name !== 'city') {
                // Пытаемся связать с лестницей вверх следующего уровня
                const nextKey = `${gx}_${gy}_${depth + 1}`;
                if (stairsCache.has(nextKey) && stairsCache.get(nextKey).stairsUp) {
                    stairsDown = { ...stairsCache.get(nextKey).stairsUp };
                    // Проверяем, что клетка свободна и не совпадает со stairsUp
                    if (currentMapData[stairsDown.y][stairsDown.x] !== 0 ||
                        (stairsDown.x === stairsUp.x && stairsDown.y === stairsUp.y)) {
                        const downSeed = `down_${gx}_${gy}_${depth}`;
                        stairsDown = findRandomFloor(stairsUp, true, downSeed);
                    }
                } else {
                    const downSeed = `down_${gx}_${gy}_${depth}`;
                    stairsDown = findRandomFloor(stairsUp, true, downSeed);
                }
            } else {
                stairsDown = null;
            }
            
            stairsCache.set(cacheKey, { stairsUp, stairsDown });
            
            // Запоминаем для следующего уровня, что его stairsUp должен быть на месте текущего stairsDown
            if (stairsDown) {
                const nextKey = `${gx}_${gy}_${depth + 1}`;
                if (!stairsCache.has(nextKey)) {
                    stairsCache.set(nextKey, { stairsUp: stairsDown, stairsDown: null });
                } else {
                    const nextCache = stairsCache.get(nextKey);
                    nextCache.stairsUp = stairsDown;
                    stairsCache.set(nextKey, nextCache);
                }
            }
        }
        
        // Определяем стартовую позицию в зависимости от направления входа
        let startPos;
        if (entryPoint === 'up') {
            // Поднимаемся с нижнего уровня -> должны появиться на лестнице вниз
            startPos = stairsDown ? { x: stairsDown.x, y: stairsDown.y } : { x: stairsUp.x, y: stairsUp.y };
            console.log(`Подъём: появляемся на лестнице вниз (${startPos.x},${startPos.y})`);
        } else {
            // Спуск или первый вход -> появляемся на лестнице вверх
            startPos = { x: stairsUp.x, y: stairsUp.y };
            console.log(`Спуск/вход: появляемся на лестнице вверх (${startPos.x},${startPos.y})`);
        }
        
        return startPos;
    }

    // Обычная генерация (без указания типа) – для совместимости
    function generate(gx, gy, depth) {
        return generateWithType(gx, gy, depth, null);
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
