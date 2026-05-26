// =========================== Модуль карты (генерация, стены, лестницы) ===========================
const MapModule = (function() {
    let currentMapData = null;
    let currentDungeonType = null;
    let stairsUp = null;
    let stairsDown = null;

    function generate(gx, gy) {
        // Используем DungeonGeneratorModule из dungeon_generator.js
        const result = DungeonGeneratorModule.generateLevel(gx, gy, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;

        const levelSeed = `lvl_${gx}_${gy}`;
        stairsDown = findRandomFloor(result.startPos, false, levelSeed + '_down');
        stairsUp = findRandomFloor(result.startPos, true, levelSeed + '_up');

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



    // Добавьте в объект MapModule (после существующих методов)

    generateWithType: function(gx, gy, dungeonType) {
        const result = DungeonGeneratorModule.generateLevelWithType(
            gx, gy, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, dungeonType
        );
        this.currentMapData = result.mapData;
        this.currentDungeonType = result.dungeonType;
    
        const levelSeed = `lvl_${gx}_${gy}_${dungeonType}`;
        this.stairsDown = this.findRandomFloor(result.startPos, false, levelSeed + '_down');
        this.stairsUp = this.findRandomFloor(result.startPos, true, levelSeed + '_up');
    
        return result.startPos;
    },

    generateCity: function(gx, gy) {
        // Для города используем обычную генерацию подземелья (тип dungeon)
        // но удаляем stairsDown (выход только на поверхность)
        const result = DungeonGeneratorModule.generateLevel(gx, gy, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT);
        this.currentMapData = result.mapData;
        // Создаём фиктивный тип для города (визуально как dungeon)
        this.currentDungeonType = { 
            name: 'city', 
            wallChar: '#', floorChar: '.', 
            wallColor: '#555', floorColor: '#333' 
        };
    
        const levelSeed = `city_${gx}_${gy}`;
        // В городе есть только лестница вверх (выход)
        this.stairsUp = this.findRandomFloor(result.startPos, false, levelSeed + '_up');
        this.stairsDown = null; // нет спуска вниз
    
        return result.startPos;
    },

    // Вспомогательный метод (перенесите существующий findRandomFloor и сделайте его доступным)
    findRandomFloor: function(excludePos, far = false, seed = null) {
        if (!seed) seed = `stairs_${this.currentDungeonType?.name || 'default'}`;
        const rng = new Math.seedrandom(seed);
        let attempts = 0;
        while (attempts < 1000) {
            const x = Math.floor(rng() * DataModule.MAP_WIDTH);
            const y = Math.floor(rng() * DataModule.MAP_HEIGHT);
            if (this.currentMapData[y][x] === 0) {
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

    return {
        get currentMapData() { return currentMapData; },
        get currentDungeonType() { return currentDungeonType; },
        get stairsUp() { return stairsUp; },
        get stairsDown() { return stairsDown; },
        generate,
        isWall,
        getRandomFloor
    };
})();
