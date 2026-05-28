// =========================== Модуль сущностей (игрок, враги, предметы) ===========================
const EntityModule = (function() {
    function createPlayer(x, y) {
        return {
            x: x, y: y,
            char: "@", color: "#FFF",
            hp: 100, maxHp: 100,
            atk: 5, def: 3,
            level: 1, xp: 0,
            inventory: [],
            equipment: { weapon: null, armor: null }
        };
    }

    function createEnemy(template, x, y, difficultyMult) {
        // Используем среднее значение диапазона для более предсказуемой сложности
        const hp = Math.floor(((template.hp[0] + template.hp[1]) / 2) * difficultyMult);
        const atk = Math.floor(((template.atk[0] + template.atk[1]) / 2) * difficultyMult);
        const def = Math.floor(((template.def[0] + template.def[1]) / 2) * difficultyMult);

        return {
            x: x, y: y, name: template.name,
            char: template.char, color: template.color,
            hp: hp, maxHp: hp,
            atk: atk, def: def,
            isEnemy: true
        };
    }

    // === Вспомогательная функция: выбор формы прилагательного ===
    function getAdjectiveForm(adjObj, gender, plural) {
        if (!adjObj) return "";
        if (plural) return adjObj.plural;
        if (gender === "she") return adjObj.she;
        if (gender === "it") return adjObj.it;
        return adjObj.base; 
    }

    function createItem(template, x, y, itemPowerMult) {
        // 1. Генерация имени с учетом рода и числа
        const adjTemplate = DataModule.ITEM_ADJECTIVES[Math.floor(Math.random() * DataModule.ITEM_ADJECTIVES.length)];
        const adj = getAdjectiveForm(adjTemplate, template.gender, template.plural);
        const name = `${adj} ${template.baseName}`;

        // 2. Расчет базового значения (атаки/защиты/лечения)
        const baseVal = Math.floor(template.val[0] + Math.random() * (template.val[1] - template.val[0]));
        const finalVal = Math.max(1, Math.floor(baseVal * itemPowerMult));

        // 3. Создание объекта предмета
        return {
            x: x, y: y, 
            name: name,
            char: template.char, 
            color: template.color,
            type: template.type,
            stat: template.stat,
            effect: template.effect,
            val: finalVal,
            isItem: true,
            
            // === НОВЫЕ СВОЙСТВА ДЛЯ ОРУЖИЯ ===
            // Тип атаки: true - ближний бой, false - дальний
            meleeType: template.meleeType !== undefined ? template.meleeType : true,
            
            // Дальность атаки в клетках (для дальнего оружия)
            range: template.range || 1,
            
            // Максимальный боезапас (если 0 или не указано - бесконечно)
            maxAmmo: template.maxAmmo || 0,
            
            // Текущий боезапас (при создании равен максимальному)
            currentAmmo: template.maxAmmo || 0
        };
    }

    // === НОВАЯ ФУНКЦИЯ: Фильтрация врагов по уровню ===
    function getAvailableEnemies(depth) {
        // depth вычисляется как сумма модулей координат в game.js перед вызовом
        // Уровень 0-2: Только слабые
        // Уровень 3-6: Средние
        // Уровень 7+: Все, включая боссов
        
        if (depth <= 2) {
            return DataModule.ENEMY_TYPES.filter(e => 
                ["Крыса", "Гоблин", "Волк", "Слизень"].includes(e.name)
            );
        } else if (depth <= 6) {
            return DataModule.ENEMY_TYPES.filter(e => 
                ["Бандит", "Скелет", "Орк-разведчик", "Зомби", "Гарпия", "Призрак"].includes(e.name)
            );
        } else {
            // На глубоких уровнях добавляем всех остальных
            return DataModule.ENEMY_TYPES.filter(e => 
                ["Тролль", "Вампир", "Лич", "Голем", "Демон", "Дракон"].includes(e.name)
            );
        }
    }

    // Безопасное размещение врагов с проверкой дистанции
    function spawnEnemies(mapGrid, startPos, enemyTemplates, count, difficultyMult, minDist = 3, depth = 0) {
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        const validTiles = [];

        // 1. Фильтруем шаблоны врагов в зависимости от глубины
        const availableTemplates = getAvailableEnemies(depth);
        
        // Если вдруг фильтр вернул пустой массив (на всякий случай), берем всех
        const templatesToUse = availableTemplates.length > 0 ? availableTemplates : enemyTemplates;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mapGrid[y][x] === 0) {
                    const distToStart = Math.abs(x - startPos.x) + Math.abs(y - startPos.y);
                    if (distToStart >= 4) {
                        validTiles.push({ x, y });
                    }
                }
            }
        }

        // Fisher-Yates shuffle
        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }

        const placedEnemies = [];
        const occupiedCoords = [];

        for (const tile of validTiles) {
            if (placedEnemies.length >= count) break;

            let tooClose = false;
            for (const occ of occupiedCoords) {
                if (Math.abs(tile.x - occ.x) + Math.abs(tile.y - occ.y) < minDist) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                occupiedCoords.push({ x: tile.x, y: tile.y });
                // Выбираем врага ТОЛЬКО из доступных для этой глубины
                const template = templatesToUse[Math.floor(Math.random() * templatesToUse.length)];
                placedEnemies.push(createEnemy(template, tile.x, tile.y, difficultyMult));
            }
        }

        return placedEnemies;
    }

    // Размещение предметов на разных клетках
    function spawnItems(mapGrid, startPos, itemTemplates, count, itemPowerMult, minDistFromPlayer = 3) {
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        const validTiles = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mapGrid[y][x] === 0) {
                    const distToStart = Math.abs(x - startPos.x) + Math.abs(y - startPos.y);
                    if (distToStart >= minDistFromPlayer) {
                        validTiles.push({ x, y });
                    }
                }
            }
        }

        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }

        const placedItems = [];
        for (let i = 0; i < Math.min(count, validTiles.length); i++) {
            const tile = validTiles[i];
            const template = itemTemplates[Math.floor(Math.random() * itemTemplates.length)];
            placedItems.push(createItem(template, tile.x, tile.y, itemPowerMult));
        }

        return placedItems;
    }

    return {
        createPlayer,
        createEnemy,
        createItem,
        spawnEnemies,
        spawnItems
    };
})();
