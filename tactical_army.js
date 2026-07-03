/**
 * МОДУЛЬ ФАБРИКИ АРМИЙ (tactical_army.js)
 * Создаёт армии для глобальной карты и тактического боя.
 */

const TacticalArmyModule = (function() {
    'use strict';

    let armyIdCounter = 0;

    // === СОЗДАНИЕ АРМИИ ДЛЯ ГЛОБАЛЬНОЙ КАРТЫ ===
    function createGlobalArmy(x, y, difficulty) {
        const army = {
            id: armyIdCounter++,
            x: x,
            y: y,
            strength: difficulty, // общая сила армии (влияет на состав)
            units: [], // массив отрядов
            strategy: TacticalDataModule.ARMY_STRATEGIES.AGGRESSIVE,
            sprite: 'ARMY_ENEMY', // спрайт на глобальной карте
            lastMoveTurn: 0 // для оптимизации движения
        };

        // Генерируем состав армии
        // Генерируем состав армии
        const unitCount = Math.min(
            TacticalDataModule.MAX_UNITS_PER_ARMY,
            Math.floor(3 + Math.random() * difficulty * 2)
        );
        for (let i = 0; i < unitCount; i++) {
            const unitType = getRandomUnitType();
            const count = Math.floor(5 + Math.random() * 10); 
            
            army.units.push({
                type: unitType,
                count: count,       // Количество бойцов в отряде (для логики глобальной карты)
                hp: unitType.hp,    // <--- ИСПРАВЛЕНО: HP одного бойца, а не всего отряда
                maxHp: unitType.hp, // <--- ИСПРАВЛЕНО
                x: 0, 
                y: 0
            });
        }
        return army;
    }

    // === СЛУЧАЙНЫЙ ТИП ЮНИТА ===
    function getRandomUnitType() {
        const types = Object.values(TacticalDataModule.UNIT_TYPES);
        return types[Math.floor(Math.random() * types.length)];
    }

    // === ОБНОВЛЕНИЕ ПОЗИЦИИ АРМИИ НА ГЛОБАЛЬНОЙ КАРТЕ ===
    function updateArmyPosition(army, playerX, playerY, currentTurn) {
        // Оптимизация: армии двигаются не каждый ход, а раз в 5 ходов
        if (currentTurn - army.lastMoveTurn < 5) return;
        army.lastMoveTurn = currentTurn;

        const dx = playerX - army.x;
        const dy = playerY - army.y;
        const dist = Math.abs(dx) + Math.abs(dy);

        // Стратегия "орбиты" вокруг игрока
        const ORBIT_RADIUS = 150; // радиус орбиты в клетках (3 чанка)
        const SAFE_DISTANCE = 50; // минимальная дистанция до игрока

        let moveX = 0, moveY = 0;

        if (dist > ORBIT_RADIUS) {
            // Слишком далеко — идём к игроку
            moveX = Math.sign(dx);
            moveY = Math.sign(dy);
        } else if (dist < SAFE_DISTANCE) {
            // Слишком близко — отходим
            moveX = -Math.sign(dx);
            moveY = -Math.sign(dy);
        } else {
            // Патрулируем в пределах орбиты
            if (Math.random() < 0.3) {
                moveX = Math.floor(Math.random() * 3) - 1;
                moveY = Math.floor(Math.random() * 3) - 1;
            }
        }

        // Применяем движение
        army.x += moveX;
        army.y += moveY;
    }

    // === ПРОВЕРКА СТОЛКНОВЕНИЯ С ИГРОКОМ ===
    function checkCollision(army, playerX, playerY) {
        return army.x === playerX && army.y === playerY;
    }

    // === ПОЛУЧЕНИЕ ЦВЕТА СПРАЙТА В ЗАВИСИМОСТИ ОТ HP ===
    function getUnitColor(unit) {
        const hpPercent = unit.hp / unit.maxHp;
        if (hpPercent > 0.66) return '#ff69b4'; // Hot Pink (здоров)
        if (hpPercent > 0.33) return '#db7093'; // Pale Violet Red (ранен)
        return '#c71585';                       // Medium Violet Red (при смерти)
    }

    return {
        createGlobalArmy,
        updateArmyPosition,
        checkCollision,
        getUnitColor,
        getRandomUnitType // <--- ДОБАВЬ ЭТУ СТРОКУ
    };
})();
// В конце каждого из этих файлов добавьте:

window.TacticalArmyModule = TacticalArmyModule;

