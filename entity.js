// =========================== Модуль сущностей (игрок, враги, предметы) ===========================
const EntityModule = (function() {
    function createPlayer(x, y) {
        return {
            x: x, y: y,
            char: "@", color: "#FFF",
            hp: 100, maxHp: 100, // Ваше значение
            atk: 5, def: 3,      // <-- Увеличили защиту с 2 до 3
            level: 1, xp: 0,
            inventory: [],
            equipment: { weapon: null, armor: null }
        };
    }

    function createEnemy(template, x, y, difficultyMult) {
        const hp = Math.floor(template.hp[0] * difficultyMult);
        const atk = Math.floor(template.atk[0] * difficultyMult);
        const def = Math.floor(template.def[0] * difficultyMult);

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
        return adjObj.base; // по умолчанию — мужской род
    }

    
    function createItem(template, x, y, itemPowerMult) {
        const adjTemplate = DataModule.ITEM_ADJECTIVES[Math.floor(Math.random() * DataModule.ITEM_ADJECTIVES.length)];
        const adj = getAdjectiveForm(adjTemplate, template.gender, template.plural);
        const name = `${adj} ${template.baseName}`;

        const baseVal = Math.floor(template.val[0] + Math.random() * (template.val[1] - template.val[0]));
        const finalVal = Math.max(1, Math.floor(baseVal * itemPowerMult));

        return {
            x: x, y: y, name: name,
            char: template.char, color: template.color,
            type: template.type,
            stat: template.stat,
            effect: template.effect,
            val: finalVal,
            isItem: true
        };
    }

    // Безопасное размещение врагов с проверкой дистанции
    function spawnEnemies(mapGrid, startPos, enemyTemplates, count, difficultyMult, minDist = 3) {
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        const validTiles = [];

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
                const template = enemyTemplates[Math.floor(Math.random() * enemyTemplates.length)];
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

        // Собираем все клетки пола, исключая близкие к игроку
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

        // Перемешиваем массив
        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }

        // Размещаем предметы на первых count уникальных клетках
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
