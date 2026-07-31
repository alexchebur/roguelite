/**
 * МОДУЛЬ ГЛОБАЛЬНОЙ КАРТЫ (globalMap.js)
 * Бесконечная карта, разбитая на чанки.
 */

// === ВАЖНО: ОЧИСТКА КЭША ПРИ ПЕРЕЗАГРУЗКЕ СКРИПТА ===
// Это гарантирует, что старые "багованные" чанки не будут использоваться
const chunkCache = new Map();


// ДОБАВИТЬ ЭТОТ БЛОК ДЛЯ ОТЛАДКИ:
console.log("🗺️ [GlobalMap] Кэш очищен для новой генерации армий.");

// В объект GLOBAL_CONFIG добавляем параметр плотности
const GLOBAL_CONFIG = {
    CHUNK_SIZE: 50,          
    WORLD_SEED: 193460752,       
    CITY_DENSITY: 0.010,      
    DUNGEON_DENSITY: 0.01,   
    ROAD_CONNECT_RADIUS: 40,
    GLOBAL_SCROLL_DENSITY: 0.001 // Шанс 0.5% на клетку для спавна свитка
};

const GLOBAL_TEXT_QUESTS_ROSTER = [
    'twine/refugees.html',
    'twine/werewolf.html',
    'twine/dragon.html'
];
// === ГРАНИЦЫ МИРА ===
const WORLD_BORDER_RADIUS = 1000; // Радиус "материка"
const BORDER_NOISE_SCALE = 0.02;  // Масштаб искривления берега (чем меньше, тем плавнее)
// === ВЫЧИСЛЕНИЕ КООРДИНАТ КРЕПОСТИ (ДЕТЕРМИНИРОВАННОЕ) ===
// Мы используем отдельный сид, чтобы крепость не зависела от генерации чанков
const FORTRESS_SEED = GLOBAL_CONFIG.WORLD_SEED + 999999;
const fortressRng = new SeededRandom(FORTRESS_SEED);

// Генерируем "идеальные" координаты в северной зоне
// Y должен быть между -800 и -900
const fortressTargetY = -800 - Math.floor(fortressRng.next() * 100); // От -800 до -899
// X должен быть недалеко от центра, например, от -200 до 200
const fortressTargetX = Math.floor((fortressRng.next() - 0.5) * 40); 

console.log(`🏰 [System] Запланированные координаты Крепости: X=${fortressTargetX}, Y=${fortressTargetY}`);
/**
 * Простая детерминированная функция шума для границы
 * Возвращает число от -1 до 1
 */
function getBorderNoise(x, y) {
    // Используем тот же SeededRandom, но с уникальным сидом для шума границы
    // Мы берем синус от координат, чтобы получить плавные волны, 
    // и добавляем случайность на основе сида клетки
    const seed = x * 12345 + y * 67890; 
    const rng = new SeededRandom(seed);
    
    // Комбинируем несколько синусоид для естественности
    const wave1 = Math.sin(x * 0.1) * Math.cos(y * 0.1);
    const wave2 = Math.sin(x * 0.05 + 100) * Math.cos(y * 0.05 + 100);
    
    // Случайный фактор для "шероховатости"
    const randomFactor = (rng.next() - 0.5) * 2; 
    
    // Смешиваем волны и случайность
    return (wave1 * 0.5 + wave2 * 0.3 + randomFactor * 0.2);
}

// Текущая позиция игрока
let playerGlobalX = 0;
let playerGlobalY = 0;
// В globalMap.js добавьте в начало файла:

// === МАССИВ АКТИВНЫХ АРМИЙ ===
let activeArmies = [];
let globalTurnCounter = 0;
// === КООРДИНАТЫ КРЕПОСТИ (Глобальный синглтон) ===
let fortressGlobalCoords = null; // { x, y } или null, если еще не найдена

// === ФУНКЦИЯ СПАВНА АРМИЙ В ЧАНКЕ (ТЕСТОВАЯ ВЕРСИЯ) ===
function spawnArmiesInChunk(cx, cy, tiles) {
    const width = GLOBAL_CONFIG.CHUNK_SIZE;
    const height = GLOBAL_CONFIG.CHUNK_SIZE;
    const rand = getChunkRandom(cx, cy);
    
    // Получаем текущую позицию игрока, если она уже задана
    let playerX = 0, playerY = 0;
    if (typeof GlobalMapModule !== 'undefined' && typeof GlobalMapModule.getPlayerPosition === 'function') {
        const pPos = GlobalMapModule.getPlayerPosition();
        playerX = pPos.x;
        playerY = pPos.y;
    }

    // Определяем глобальные границы чанка
    const chunkStartX = cx * width;
    const chunkStartY = cy * height;

    // Шанс спавна армии в чанке: 100% для теста
    if (rand.next() < 0.5) {
        const armyCount = rand.int(1, 10); 
        
        for (let i = 0; i < armyCount; i++) {
            let x, y;
            let attempts = 0;
            
            // ПОПЫТКА 1: Спавн рядом с игроком (если игрок в этом чанке или рядом)
            // Мы берем координаты игрока и добавляем случайное смещение от -5 до +5
            let targetX = playerX + rand.int(-5, 5);
            let targetY = playerY + rand.int(-5, 5);
            
            // Проверяем, попадают ли эти координаты в текущий чанк
            const localTargetX = targetX - chunkStartX;
            const localTargetY = targetY - chunkStartY;

            if (localTargetX >= 0 && localTargetX < width && localTargetY >= 0 && localTargetY < height) {
                x = localTargetX;
                y = localTargetY;
            } else {
                // ПОПЫТКА 2: Если игрок далеко, спавним в центре чанка
                x = Math.floor(width / 2) + rand.int(-2, 2);
                y = Math.floor(height / 2) + rand.int(-2, 2);
            }
            
            // Проверка на воду/горы
            if (tiles[y][x] === 'water' || tiles[y][x] === 'mountain') {
                // Ищем ближайшую сухую клетку
                let found = false;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            if (tiles[ny][nx] !== 'water' && tiles[ny][nx] !== 'mountain') {
                                x = nx;
                                y = ny;
                                found = true;
                                break;
                            }
                        }
                    }
                    if (found) break;
                }
                if (!found) continue; // Пропускаем, если кругом вода/горы
            }

            const globalX = chunkStartX + x;
            const globalY = chunkStartY + y;
            // Сложность растет на 1 каждые 40 клеток от центра мира (0,0)
            const distFromStart = Math.abs(globalX) + Math.abs(globalY);
            const difficulty = 1 + Math.floor(distFromStart / 40); 
            
            const army = TacticalArmyModule.createGlobalArmy(globalX, globalY, difficulty);
            activeArmies.push(army);
            
            console.log(`⚔️ [Spawn] Армия ID:${army.id} создана в (${globalX}, ${globalY}). Игрок в (${playerX}, ${playerY})`);
        }
    }
}

// === ФУНКЦИЯ ОБНОВЛЕНИЯ ВСЕХ АРМИЙ ===
function updateAllArmies(playerX, playerY) {
    globalTurnCounter++;
    
    activeArmies.forEach(army => {
        TacticalArmyModule.updateArmyPosition(army, playerX, playerY, globalTurnCounter);
    });
}

// === ФУНКЦИЯ ПОЛУЧЕНИЯ АРМИИ НА КЛЕТКЕ ===
function getArmyAt(x, y) {
    return activeArmies.find(army => army.x === x && army.y === y);
}

// === ФУНКЦИЯ УДАЛЕНИЯ УНИЧТОЖЕННОЙ АРМИИ ===
function removeArmy(armyId) {
    activeArmies = activeArmies.filter(army => army.id !== armyId);
}
// === Вспомогательные функции ===

function getChunkRandom(cx, cy) {
    const seed = GLOBAL_CONFIG.WORLD_SEED + cx * 1000003 + cy * 1000033;
    return new SeededRandom(seed);
}

// Генерация ландшафта
// Генерация ландшафта
function generateTerrain(rand, width, height, cx, cy) { // <--- ДОБАВИЛИ cx, cy для расчета глобальных координат
    const tiles = Array(height).fill().map(() => Array(width).fill('plain'));
    
    // 1. Горы
    const mountainCount = rand.int(5, 15);
    for (let i = 0; i < mountainCount; i++) {
        const mx = rand.int(0, width-1);
        const my = rand.int(0, height-1);
        const radius = rand.int(1, 3);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = mx+dx, y = my+dy;
                if (x >= 0 && x < width && y >= 0 && y < height && Math.abs(dx)+Math.abs(dy) <= radius) {
                    tiles[y][x] = 'mountain';
                }
            }
        }
    }
    
    // 2. Леса
    const forestClusterCount = rand.int(20, 40); 
    for (let i = 0; i < forestClusterCount; i++) {
        const fx = rand.int(0, width-1);
        const fy = rand.int(0, height-1);
        const radius = rand.int(1, 3); 
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = fx + dx;
                const y = fy + dy;
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    if (tiles[y][x] === 'plain') {
                        if (rand.next() < 0.8) {
                            tiles[y][x] = 'forest';
                        }
                    }
                }
            }
        }
    }
    
    // 3. Реки
    const riverCount = rand.int(1, 3);
    for (let r = 0; r < riverCount; r++) {
        let x = rand.int(0, width-1);
        let y = rand.int(0, height-1);
        for (let step = 0; step < 30; step++) {
            if (x >= 0 && x < width && y >= 0 && y < height) {
                if (tiles[y][x] !== 'mountain') {
                    tiles[y][x] = 'water';
                }
            }
            const dir = rand.int(0, 3);
            if (dir === 0) x++;
            else if (dir === 1) x--;
            else if (dir === 2) y++;
            else y--;
        }
    }

    // === НОВОЕ: ПРИМЕНЕНИЕ ГРАНИЦ МИРА ===
    const chunkStartX = cx * GLOBAL_CONFIG.CHUNK_SIZE;
    const chunkStartY = cy * GLOBAL_CONFIG.CHUNK_SIZE;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Вычисляем глобальные координаты этой клетки
            const globalX = chunkStartX + x;
            const globalY = chunkStartY + y;
            
            // Расстояние от центра мира (0,0)
            const dist = Math.sqrt(globalX * globalX + globalY * globalY);
            
            // Получаем значение шума для этой точки (-1 ... 1)
            const noise = getBorderNoise(globalX, globalY);
            
            // Эффективный радиус границы с учетом шума
            // Если noise положительный, граница отодвигается дальше (залив)
            // Если noise отрицательный, граница приближается (мыс)
            const effectiveRadius = WORLD_BORDER_RADIUS + (noise * 100); // 100 - амплитуда искривления
            
            if (dist > effectiveRadius) {
                tiles[y][x] = 'water';
            }
        }
    }

    return tiles;
}
/**
 * Находит единственные координаты для Крепости на Севере.
 * Вызывается лениво (только когда игрок приближается к зоне).
 */
function findUniqueFortressLocation() {
    if (fortressGlobalCoords) return fortressGlobalCoords;

    // Диапазон поиска по Y (северная зона)
    const startY = -800;
    const endY = -900;
    
    // Центр мира по X, чтобы крепость была посередине севера
    const centerX = 0; 
    const searchRadiusX = 200; // Ищем в пределах +/- 200 клеток от центра по X

    let bestDist = Infinity;
    let bestPos = null;

    // Сканируем зону. Так как мир бесконечен, мы не можем проверить ВСЕ чанки сразу.
    // Но мы можем использовать детерминированный сид для каждой клетки в этой зоне,
    // чтобы найти "идеальное" место, которое всегда будет одним и тем же.
    
    // Для оптимизации мы будем проверять только те чанки, которые уже сгенерированы или генерируются.
    // Но для гарантии "одного экземпляра" лучше всего использовать жесткий алгоритм выбора.
    
    // Упрощенный подход: Мы будем искать крепость динамически при генерации чанков в этой зоне.
    // Но чтобы она была ОДНА, мы используем глобальный флаг.
    
    // Поскольку у нас нет единого момента "генерации всего мира", мы сделаем так:
    // При генерации любого чанка в зоне Y[-800, -900] мы проверяем, не занята ли уже крепость.
    // Если нет, мы используем детерминированный алгоритм, чтобы решить, должна ли крепость быть ЗДЕСЬ.
    
    return null; // Логика перенесена в generatePOIs для корректной работы с чанками
}
// Генерация точек интереса (ПОЛНАЯ ВЕРСИЯ С КРЕПОСТЬЮ)
// Генерация точек интереса (ФИНАЛЬНАЯ ВЕРСИЯ С КРЕПОСТЬЮ)
function generatePOIs(rand, cx, cy, tiles) {
    const pois = [];
    const width = GLOBAL_CONFIG.CHUNK_SIZE;
    const height = GLOBAL_CONFIG.CHUNK_SIZE;
    let globalQuestIndex = 0;     
    const MIN_POI_DISTANCE = 7; 

    // Функция проверки расстояния до уже созданных POI
    const isTooClose = (localX, localY) => {
        const globalX = cx * width + localX;
        const globalY = cy * height + localY;
        for (const p of pois) {
            const dist = Math.abs(p.x - globalX) + Math.abs(p.y - globalY);
            if (dist < MIN_POI_DISTANCE) return true;
        }
        return false;
    };

    // === 1. Города (Стандартная генерация) ===
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const currentTile = tiles[y][x];
            const isValidCityTerrain = (currentTile === 'plain' || currentTile === 'forest');
            if (isValidCityTerrain && rand.next() < GLOBAL_CONFIG.CITY_DENSITY) {
                if (isTooClose(x, y)) continue;
                tiles[y][x] = 'city';
                const globalX = cx * width + x;
                const globalY = cy * height + y;
                const cityName = NameGeneratorModule.generateCityName(globalX, globalY);
                pois.push({ x: globalX, y: globalY, type: 'city', name: cityName });
            }
        }
    }
    
    // === 2. Входы в подземелья (Стандартная генерация) ===
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const currentTile = tiles[y][x];
            const isValidTerrain = (currentTile === 'plain' || currentTile === 'forest' || currentTile === 'road');
            if (isValidTerrain && rand.next() < GLOBAL_CONFIG.DUNGEON_DENSITY) {
                if (currentTile !== 'city') {
                    if (isTooClose(x, y)) continue;
                    tiles[y][x] = 'dungeon_entrance';
                    const globalX = cx * width + x;
                    const globalY = cy * height + y;
                    const dungeonType = DungeonGeneratorModule.getRandomDungeonType(rand).name;
                    const { fullName } = NameGeneratorModule.generateLocationData(globalX, globalY, dungeonType);
                    pois.push({ x: globalX, y: globalY, type: 'dungeon', dungeonType: dungeonType, name: fullName });
                }
            }
        }
    }

    // === 3. Глобальные свитки (Стандартная генерация) ===
    if (typeof GLOBAL_TEXT_QUESTS_ROSTER !== 'undefined' && GLOBAL_TEXT_QUESTS_ROSTER.length > 0) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const currentTile = tiles[y][x];
                const isValidScrollTerrain = (currentTile === 'plain' || currentTile === 'forest' || currentTile === 'road');
                if (isValidScrollTerrain && rand.next() < GLOBAL_CONFIG.GLOBAL_SCROLL_DENSITY) {
                    if (isTooClose(x, y)) continue;
                    const globalX = cx * width + x;
                    const globalY = cy * height + y;
                    const questIndex = globalQuestIndex % GLOBAL_TEXT_QUESTS_ROSTER.length;
                    const questFile = GLOBAL_TEXT_QUESTS_ROSTER[questIndex];
                    globalQuestIndex++;
                    pois.push({ x: globalX, y: globalY, type: 'global_scroll', questFile: questFile });
                }
            }
        }
    }

    // === 4. ГЕНЕРАЦИЯ КРЕПОСТИ (В САМОМ КОНЦЕ, ПО ЖЕСТКИМ КООРДИНАТАМ) ===
    // Мы используем отдельный детерминированный расчет, чтобы крепость была ВСЕГДА в одном месте мира
    const FORTRESS_SEED = GLOBAL_CONFIG.WORLD_SEED + 999999;
    const fortressRng = new SeededRandom(FORTRESS_SEED);
    
    // Вычисляем целевые координаты крепости один раз для всего мира
    // Y между -800 и -900 (как в изначальной задумке) или -100/-200 по вашему новому запросу
    // Давайте используем диапазон -100 ... -200, как вы просили
    const targetY = -800 - Math.floor(fortressRng.next() * 100); // От -100 до -199
    const targetX = Math.floor((fortressRng.next() - 0.5) * 40); // От -200 до 200 по X
    
    // Проверяем, попадают ли эти координаты в ТЕКУЩИЙ чанк
    const chunkStartX = cx * width;
    const chunkStartY = cy * height;
    
    if (targetX >= chunkStartX && targetX < chunkStartX + width &&
        targetY >= chunkStartY && targetY < chunkStartY + height) {
        
        const localX = targetX - chunkStartX;
        const localY = targetY - chunkStartY;
        
        // Проверяем, свободна ли клетка и подходит ли ландшафт
        const currentTile = tiles[localY][localX];
        const isFree = (currentTile === 'plain' || currentTile === 'forest') && 
                       !isTooClose(localX, localY) &&
                       currentTile !== 'city' && 
                       currentTile !== 'dungeon_entrance';

        if (isFree) {
            tiles[localY][localX] = 'fortress';
            pois.push({ 
                x: targetX, 
                y: targetY, 
                type: 'fortress', 
                name: "Крепость, Выросшая Из-Под Земли" 
            });
            console.log(`🏰 [DEBUG] Крепость размещена в чанке (${cx},${cy}) на координатах: X=${targetX}, Y=${targetY}`);
        } else {
            // Если идеальная точка занята, ищем ближайшую свободную вокруг неё
            let found = false;
            for (let r = 1; r < 10; r++) {
                for (let dy = -r; dy <= r; dy++) {
                    for (let dx = -r; dx <= r; dx++) {
                        const nx = localX + dx;
                        const ny = localY + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const t = tiles[ny][nx];
                            if ((t === 'plain' || t === 'forest') && !isTooClose(nx, ny) && t !== 'city' && t !== 'dungeon_entrance') {
                                tiles[ny][nx] = 'fortress';
                                const gx = chunkStartX + nx;
                                const gy = chunkStartY + ny;
                                pois.push({ x: gx, y: gy, type: 'fortress', name: "Крепость, Выросшая Из-Под Земли" });
                                console.log(`🏰 [DEBUG] Крепость смещена на: X=${gx}, Y=${gy}`);
                                found = true;
                                break;
                            }
                        }
                    }
                    if (found) break;
                }
                if (found) break;
            }
        }
    }

    return pois;
}


// Построение дорог
function connectPOIsWithRoads(tiles, poisLocal, rand) {
    if (poisLocal.length < 2) return;
    
    const edges = [];
    for (let i = 0; i < poisLocal.length; i++) {
        let closest = null;
        let minDist = Infinity;
        for (let j = 0; j < poisLocal.length; j++) {
            if (i === j) continue;
            const dist = Math.abs(poisLocal[i].x - poisLocal[j].x) + Math.abs(poisLocal[i].y - poisLocal[j].y);
            if (dist < minDist) {
                minDist = dist;
                closest = j;
            }
        }
        if (closest !== null) {
            edges.push([i, closest]);
        }
    }
    
    const uniqueEdges = [];
    for (const [a,b] of edges) {
        if (!uniqueEdges.some(e => (e[0]===a && e[1]===b) || (e[0]===b && e[1]===a))) {
            uniqueEdges.push([a,b]);
        }
    }
    
    for (const [i,j] of uniqueEdges) {
        const p1 = poisLocal[i];
        const p2 = poisLocal[j];
        
        const stepX = p1.x <= p2.x ? 1 : -1;
        for (let x = p1.x; stepX > 0 ? x <= p2.x : x >= p2.x; x += stepX) {
            if (x >= 0 && x < tiles[0].length && p1.y >= 0 && p1.y < tiles.length) {
                // Дороги не строятся через горы и воду
                if (tiles[p1.y][x] !== 'mountain' && tiles[p1.y][x] !== 'water') {
                    tiles[p1.y][x] = 'road';
                }
            }
        }
        const stepY = p1.y <= p2.y ? 1 : -1;
        for (let y = p1.y; stepY > 0 ? y <= p2.y : y >= p2.y; y += stepY) {
            if (y >= 0 && y < tiles.length && p2.x >= 0 && p2.x < tiles[0].length) {
                if (tiles[y][p2.x] !== 'mountain' && tiles[y][p2.x] !== 'water') {
                    tiles[y][p2.x] = 'road';
                }
            }
        }
    }
}

// В функции generateChunk добавьте в конец:
function generateChunk(cx, cy) {
     const rand = getChunkRandom(cx, cy);
     // === ИЗМЕНЕНИЕ ЗДЕСЬ: передаем cx и cy ===
     const tiles = generateTerrain(rand, GLOBAL_CONFIG.CHUNK_SIZE, GLOBAL_CONFIG.CHUNK_SIZE, cx, cy);
     
     const pois = generatePOIs(rand, cx, cy, tiles);
     const poisLocal = pois.map(p => ({ 
         x: p.x - cx * GLOBAL_CONFIG.CHUNK_SIZE, 
         y: p.y - cy * GLOBAL_CONFIG.CHUNK_SIZE 
     }));
     connectPOIsWithRoads(tiles, poisLocal, rand);
     
     // === НОВОЕ: Спавн армий в чанке ===
     spawnArmiesInChunk(cx, cy, tiles);
     
     return { tiles, pois };
 }

// Получить чанк по глобальной клетке
function getChunkForCell(globalX, globalY) {
    const cx = Math.floor(globalX / GLOBAL_CONFIG.CHUNK_SIZE);
    const cy = Math.floor(globalY / GLOBAL_CONFIG.CHUNK_SIZE);
    const key = `${cx},${cy}`;
    
    // Если чанка нет в кэше, генерируем новый
    if (!chunkCache.has(key)) {
        chunkCache.set(key, generateChunk(cx, cy));
    }
    return chunkCache.get(key);
}

// === НОВАЯ ФУНКЦИЯ: поиск безопасной стартовой позиции ===
function findSafeStartPosition(startX, startY, radius = 3) {
    for (let r = 0; r <= radius; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const testX = startX + dx;
                const testY = startY + dy;
                
                if (GlobalMapModule.isWalkable(testX, testY)) {
                    let obstacleCount = 0;
                    for (let ny = -1; ny <= 1; ny++) {
                        for (let nx = -1; nx <= 1; nx++) {
                            if (!GlobalMapModule.isWalkable(testX + nx, testY + ny)) {
                                obstacleCount++;
                            }
                        }
                    }
                    if (obstacleCount <= 4) {
                        return { x: testX, y: testY };
                    }
                }
            }
        }
    }
    return { x: startX, y: startY };
}

// === Публичный API ===

// === Публичный API ===

const GlobalMapModule = {
    getTileType(globalX, globalY) {
        const cx = Math.floor(globalX / GLOBAL_CONFIG.CHUNK_SIZE);
        const cy = Math.floor(globalY / GLOBAL_CONFIG.CHUNK_SIZE);
        const chunk = getChunkForCell(globalX, globalY);
        const localX = globalX - cx * GLOBAL_CONFIG.CHUNK_SIZE;
        const localY = globalY - cy * GLOBAL_CONFIG.CHUNK_SIZE;
        if (localY >= 0 && localY < chunk.tiles.length && localX >= 0 && localX < chunk.tiles[0].length) {
            return chunk.tiles[localY][localX];
        }
        return 'plain';
    },

// В GlobalMapModule.getDisplayTileType
     getDisplayTileType(globalX, globalY) {
         // 1. Сначала проверяем наличие POI (Point of Interest) в этой клетке
         const poi = this.getPOI(globalX, globalY);
         
         if (poi) {
             // Обработка глобальных свитков (текстовые квесты)
             if (poi.type === 'global_scroll') {
                 // Если квест уже выполнен, скрываем свиток и показываем обычный ландшафт
                 if (typeof GameModule !== 'undefined' && GameModule.isTextQuestCompleted(poi.questFile)) {
                     return this.getTileType(globalX, globalY);
                 }
                 return 'global_scroll';
             }
             
             // === НОВОЕ: Обработка Крепости ===
             if (poi.type === 'fortress') {
                 return 'fortress';
             }

             // Стандартная обработка городов и входов в подземелья
             if (poi.type === 'city') {
                 return 'city';
             }
             
             if (poi.type === 'dungeon') {
                 return 'dungeon_entrance';
             }
         }

         // 2. Если POI нет, возвращаем базовый тип тайла местности (равнина, лес, вода и т.д.)
         // Это также сработает, если крепость была сгенерирована в tiles, но по какой-то причине 
         // не попала в массив pois (дополнительная защита)
         const baseTileType = this.getTileType(globalX, globalY);
         if (baseTileType === 'fortress') {
             return 'fortress';
         }

         return baseTileType; 
     },
    isWalkable(globalX, globalY) {
        const type = this.getTileType(globalX, globalY);
        return type !== 'mountain' && type !== 'water';
    },

    getPOI(globalX, globalY) {
        const chunk = getChunkForCell(globalX, globalY);
        if (!chunk || !chunk.pois) return null;
        return chunk.pois.find(p => p.x === globalX && p.y === globalY);
    },
    
    tryMove(dx, dy) {
        const newX = playerGlobalX + dx;
        const newY = playerGlobalY + dy;
        if (this.isWalkable(newX, newY)) {
            playerGlobalX = newX;
            playerGlobalY = newY;
            return true;
        }
        return false;
    },
    
    getPlayerPosition() {
        return { x: playerGlobalX, y: playerGlobalY };
    },
    
    setPlayerPosition(x, y) {
        playerGlobalX = x;
        playerGlobalY = y;
    },
    
    initSafeStart(startX, startY, radius = 3) {
        const safePos = findSafeStartPosition(startX, startY, radius);
        playerGlobalX = safePos.x;
        playerGlobalY = safePos.y;
        return { x: playerGlobalX, y: playerGlobalY };
    },
    
    getChunkSize() { 
        return GLOBAL_CONFIG.CHUNK_SIZE; 
    },
    
    getConfig() {
        return GLOBAL_CONFIG;
    },

    // === МЕТОДЫ ДЛЯ АРМИЙ (НОВОЕ) ===
    updateAllArmies: function(playerX, playerY) {
        updateAllArmies(playerX, playerY);
    },
    getArmyAt: function(x, y) {
        return getArmyAt(x, y);
    },
    removeArmy: function(armyId) {
        removeArmy(armyId);
    },
    getActiveArmies: function() {
        return activeArmies;
    }, // <--- ВОТ ЭТА ЗАПЯТАЯ БЫЛА ПРОПУЩЕНА!

    // === СТАРЫЙ МЕТОД УДАЛЕНИЯ POI ===
    removePOI(globalX, globalY) {
        const cx = Math.floor(globalX / GLOBAL_CONFIG.CHUNK_SIZE);
        const cy = Math.floor(globalY / GLOBAL_CONFIG.CHUNK_SIZE);
        const key = `${cx},${cy}`;
        const chunk = chunkCache.get(key);
        
        if (chunk && chunk.pois) {
            // Фильтруем массив, оставляя все POI, КРОМЕ того, что совпадает с координатами
            chunk.pois = chunk.pois.filter(p => !(p.x === globalX && p.y === globalY));
        }
    }
};
