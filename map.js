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

    // Генерация уровня со случайным типом
    function generate(gx, gy) {
        const result = DungeonGeneratorModule.generateLevel(gx, gy, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;
        const levelSeed = `lvl_${gx}_${gy}`;
        stairsDown = findRandomFloor(result.startPos, false, levelSeed + '_down');
        stairsUp = findRandomFloor(result.startPos, true, levelSeed + '_up');
        return result.startPos;
    }

    // Генерация с принудительным типом подземелья
    function generateWithType(gx, gy, dungeonType) {
        const result = DungeonGeneratorModule.generateLevelWithType(
            gx, gy, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, dungeonType
        );
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;
        const levelSeed = `lvl_${gx}_${gy}_${dungeonType}`;
        stairsDown = findRandomFloor(result.startPos, false, levelSeed + '_down');
        stairsUp = findRandomFloor(result.startPos, true, levelSeed + '_up');
        return result.startPos;
    }

    // Генерация города (без лестницы вниз)
    function generateCity(gx, gy) {
        const result = DungeonGeneratorModule.generateLevel(gx, gy, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT);
        currentMapData = result.mapData;
        currentDungeonType = { 
            name: 'city', 
            wallChar: '#', floorChar: '.', 
            wallColor: '#555', floorColor: '#333' 
        };
        const levelSeed = `city_${gx}_${gy}`;
        stairsUp = findRandomFloor(result.startPos, false, levelSeed + '_up');
        stairsDown = null;
        return result.startPos;
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
