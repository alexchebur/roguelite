// =========================== Модуль карты (генерация, стены, лестницы) ===========================
const MapModule = (function() {
    let currentMapData = null;
    let currentDungeonType = null;
    let stairsUp = null;
    let stairsDown = null;

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
    
        // 1. Генерируем лестницу вверх (выход на глобальную карту)
        const upSeed = `up_${gx}_${gy}_${depth}`;
        stairsUp = findRandomFloor(null, false, upSeed);
    
        // 2. Стартовая позиция игрока – клетка лестницы вверх
        const startPos = { x: stairsUp.x, y: stairsUp.y };
    
        // 3. Лестница вниз – далеко от старта (если не город)
        if (currentDungeonType.name !== 'city') {
            const downSeed = `down_${gx}_${gy}_${depth}`;
            stairsDown = findRandomFloor(stairsUp, true, downSeed);
        } else {
            stairsDown = null;
        }
    
        return startPos;
    }

    function generateWithType(gx, gy, depth, dungeonType) {
        const result = DungeonGeneratorModule.generateLevelWithType(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, dungeonType);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;
    
        const upSeed = `up_${gx}_${gy}_${depth}`;
        stairsUp = findRandomFloor(null, false, upSeed);
        const startPos = { x: stairsUp.x, y: stairsUp.y };
    
        if (currentDungeonType.name !== 'city') {
            const downSeed = `down_${gx}_${gy}_${depth}`;
            stairsDown = findRandomFloor(stairsUp, true, downSeed);
        } else {
            stairsDown = null;
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
        getRandomFloor
    };
})();
