/**
 * МОДУЛЬ ГЕНЕРАЦИИ NPC (npc_generator.js)
 * Создает нейтральных персонажей с диалогами и квестами.
 * Зависит от: name_generator.js (SeededRandom, createSeed)
 */

if (typeof SeededRandom === 'undefined') {
    console.error("Ошибка: name_generator.js должен быть загружен перед npc_generator.js");
}

const NpcGeneratorModule = (function() {
    'use strict';

    // Базы данных для генерации
    const NPC_DATA = {
        titles: ["Странник", "Торговец", "Изгнанник", "Мудрец", "Наемник", "Бродяга", "Кузнец", "Алхимик"],
        
        origins: [
            "из далеких земель", "из разрушенной деревни", "из глубоких пещер", 
            "из забытого храма", "с поверхности", "из другого измерения"
        ],

        dialogStart: [
            "Приветствую, путник.", "Осторожнее здесь.", "Редко вижу живых в этих местах.", 
            "У меня есть информация.", "Ты выглядишь сильным.", "Не доверяй теням."
        ],

        dialogMiddle: [
            "Говорят, на глубине скрыты сокровища.", "Воздух здесь становится тяжелее.", 
            "Я видел странные огни впереди.", "Мой товар редкий, но полезный.", 
            "Берегись красных глаз в темноте.", "Древние руны предупреждают об опасности."
        ],

        dialogEnd: [
            "Удачи тебе.", "Да пребудет с тобой сила.", "Возвращайся целым.", 
            "Помни о цене знаний.", "До встречи в хабе.", "Свет да осветит твой путь."
        ],

        questHints: [
            "Найди древний артефакт в следующей комнате.", 
            "Принеси мне голову вожака орков.", 
            "Исследуй скрытый проход за стеной.", 
            "Собери 3 лечебных травы в этой локации."
        ]
    };

    /**
     * Генерирует случайного NPC для конкретных координат
     * @param {number} x - глобальная X
     * @param {number} y - глобальная Y
     * @param {object} startPos - позиция спавна игрока (чтобы не спавнить NPC прямо на нем)
     * @returns {object|null} объект NPC или null, если NPC на этом уровне нет (шанс 70%)
     */
    function generateNPC(x, y, startPos) {
        // Уникальный сид для NPC этого уровня
        const seedVal = createSeed(x, y) + 777; 
        const rng = new SeededRandom(seedVal);

        // Шанс появления NPC на уровне (30%)
        if (rng.next() > 0.3) {
            return null;
        }

        // Генерация имени/титла
        const title = rng.choice(NPC_DATA.titles);
        const origin = rng.choice(NPC_DATA.origins);
        const name = `${title} ${origin}`; // Упрощенное имя

        // Генерация позиции (случайная точка на карте, но не на старте)
        // Примечание: точную позицию мы определим позже при спавне, 
        // здесь мы только решаем, "кто" это.
        
        // Генерация диалога
        const p1 = rng.choice(NPC_DATA.dialogStart);
        const p2 = rng.choice(NPC_DATA.middle ? NPC_DATA.dialogMiddle : NPC_DATA.dialogStart); // fallback
        const p3 = rng.choice(NPC_DATA.dialogEnd);
        const fullDialog = `${p1} ${p2} ${p3}`;

        // Шанс наличия квеста (если есть диалог)
        let quest = null;
        if (rng.next() < 0.4) { // 40% шанс квеста у NPC
            quest = {
                type: "fetch", // заглушка типа
                description: rng.choice(NPC_DATA.questHints),
                completed: false,
                reward: "gold" // заглушка награды
            };
        }

        return {
            name: name,
            char: "☺", // Символ на карте
            color: "#58a6ff", // Цвет (синий, как акцент)
            dialog: fullDialog,
            quest: quest,
            isNPC: true,
            x: null, y: null // Координаты будут назначены при размещении
        };
    }

    return {
        generateNPC: generateNPC
    };

})();
