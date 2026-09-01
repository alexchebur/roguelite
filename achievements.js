/**
 * МОДУЛЬ ДОСТИЖЕНИЙ И СТАТИСТИКИ (achievements.js)
 */
const AchievementsModule = (function() {
    'use strict';

    // === БАЗА ДОСТИЖЕНИЙ ===
    const ACHIEVEMENTS_DB = [
        {
            id: 'first_blood',
            title: 'Первая Кровь',
            desc: 'Убейте своего первого монстра.',
            icon: '💀',
            condition: (stats) => stats.kills >= 1
        },
        {
            id: 'hunter_100',
            title: 'Охотник',
            desc: 'Убейте 100 монстров.',
            icon: '🏹',
            condition: (stats) => stats.kills >= 100
        },
        {
            id: 'explorer',
            title: 'Исследователь',
            desc: 'Посетите 10 разных подземелий.',
            icon: '🗺️',
            condition: (stats) => stats.dungeonsVisited >= 10
        },
        {
            id: 'cleaner',
            title: 'Чистильщик',
            desc: 'Полностью зачистите 5 уровней подземелий.',
            icon: '🧹',
            condition: (stats) => stats.levelsCleared >= 5
        },
        {
            id: 'rich',
            title: 'Богач',
            desc: 'Заработайте суммарно 10,000 золота.',
            icon: '💰',
            condition: (stats) => stats.totalGoldEarned >= 10000
        },
        {
            id: 'quest_master',
            title: 'Герой Гильдии',
            desc: 'Выполните 20 квестов.',
            icon: '📜',
            condition: (stats) => stats.questsCompleted >= 20
        }
    ];

    // Состояние игрока (загружается/сохраняется)
    let playerStats = {
        kills: 0,
        dungeonsVisited: 0,
        levelsCleared: 0,
        totalGoldEarned: 0,
        questsCompleted: 0,
        unlockedAchievements: [] // Массив ID полученных ачивок
    };

    // Внутренний флаг, чтобы не спамить уведомлениями при загрузке
    let isInitialized = false;

    /**
     * Инициализация (можно добавить загрузку из localStorage в будущем)
     */
    function init() {
        console.log("✅ AchievementsModule initialized.");
        isInitialized = true;
    }

    /**
     * Обновление статистики и проверка ачивок
     * @param {string} key - ключ статистики (kills, gold и т.д.)
     * @param {number} amount - сколько добавить
     */
    function addStat(key, amount) {
        if (!playerStats.hasOwnProperty(key)) return;
        
        const oldValue = playerStats[key];
        playerStats[key] += amount;

        // Проверяем все ачивки, которые еще не получены
        checkAchievements();
    }

    /**
     * Прямое присвоение значения (для сложных счетчиков, например, посещенные данжи)
     */
    function setStat(key, value) {
        if (!playerStats.hasOwnProperty(key)) return;
        playerStats[key] = value;
        checkAchievements();
    }

    /**
     * Проверка условий всех доступных достижений
     */
    function checkAchievements() {
        if (!isInitialized) return;

        ACHIEVEMENTS_DB.forEach(ach => {
            // Если ачивка еще не открыта
            if (!playerStats.unlockedAchievements.includes(ach.id)) {
                // Проверяем условие
                if (ach.condition(playerStats)) {
                    unlockAchievement(ach);
                }
            }
        });
    }

    /**
     * Выдача достижения
     */
    function unlockAchievement(ach) {
        playerStats.unlockedAchievements.push(ach.id);
        
        // Уведомление в лог игры
        if (typeof RenderModule !== 'undefined' && RenderModule.log) {
            RenderModule.log(`🏆 ДОСТИЖЕНИЕ: ${ach.title}! (${ach.desc})`, "event");
        }
        
        // Здесь можно добавить звук или визуальный эффект
        console.log(`Unlocked: ${ach.title}`);
    }

    /**
     * Получение данных для отображения в окне
     */
    function getData() {
        return {
            stats: { ...playerStats }, // Копия объекта
            achievements: ACHIEVEMENTS_DB.map(ach => ({
                ...ach,
                unlocked: playerStats.unlockedAchievements.includes(ach.id)
            }))
        };
    }

    return {
        init,
        addStat,
        setStat,
        getData
    };
})();
