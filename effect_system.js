/**
 * МОДУЛЬ СИСТЕМЫ ЭФФЕКТОВ (effect_system.js)
 * Управляет временными состояниями существ (баффы, дебаффы, DoT).
 */

const EffectSystemModule = (function() {
    'use strict';

    // Типы эффектов
    const EFFECT_TYPES = {
        BUFF_ATK: 'buff_atk',   // Временное увеличение атаки
        BUFF_DEF: 'buff_def',   // Временное увеличение защиты
        DOT: 'dot',             // Урон со временем
        HOT: 'hot'              // Лечение со временем
    };

    /**
     * Создает объект эффекта
     */
    function createEffect(id, name, type, duration, value, color) {
        return {
            id: id + '_' + Date.now(), // Уникальный ID для каждого применения
            name: name,
            type: type,
            duration: duration, // Осталось ходов
            maxDuration: duration, // Для визуализации (опционально)
            value: value,       // Значение бонуса (например, +2 к атаке)
            color: color || '#fff'
        };
    }

    /**
     * Добавляет эффект к существу (игроку или врагу)
     * Если такой же тип эффекта уже есть, он перезаписывается (продлевается/усиливается)
     */
    function addEffect(entity, effect) {
        if (!entity.effects) entity.effects = [];

        // Проверяем, есть ли уже активный эффект этого ТИПА
        const existingIndex = entity.effects.findIndex(e => e.type === effect.type);

        if (existingIndex !== -1) {
            // Эффект уже есть. 
            // Логика: заменяем старое значение и сбрасываем таймер (продлеваем действие)
            // Можно также суммировать значения, если хотите stacking, но обычно баффы перезаписываются.
            const oldEffect = entity.effects[existingIndex];
            
            // Если новое значение больше старого, обновляем его, иначе оставляем старое (или всегда берем новое)
            // Здесь мы просто заменяем эффект на новый (как бы "выпили свежее зелье")
            entity.effects[existingIndex] = effect;
            
            console.log(`Эффект ${effect.name} обновлен. Осталось ходов: ${effect.duration}`);
        } else {
            // Нового эффекта нет, добавляем
            entity.effects.push(effect);
            console.log(`Новый эффект ${effect.name} добавлен.`);
        }
    }

    /**
     * Обрабатывает тики эффектов (уменьшает длительность, применяет DoT/HoT)
     * Вызывать в конце каждого хода игрока/врага.
     */
    function processEffects(entity, logFn) {
        if (!entity.effects || entity.effects.length === 0) return;

        // Проходим по копии массива, чтобы безопасно удалять
        [...entity.effects].forEach(effect => {
            
            // 1. Применяем мгновенные эффекты (урон/лечение каждый ход)
            if (effect.type === EFFECT_TYPES.DOT) {
                const dmg = effect.value || 1;
                entity.hp -= dmg;
                if (logFn) logFn(`${entity.name} получает ${dmg} урона от ${effect.name}.`, "combat");
            } 
            else if (effect.type === EFFECT_TYPES.HOT) {
                const heal = effect.value || 1;
                entity.hp = Math.min(entity.maxHp, entity.hp + heal);
                if (logFn) logFn(`${entity.name} восстанавливает ${heal} HP.`, "info");
            }

            // 2. Уменьшаем длительность
            effect.duration--;

            // 3. Если время вышло - удаляем и сбрасываем статы
            if (effect.duration <= 0) {
                removeEffect(entity, effect.type); // Удаляем по типу
                
                // Если это был бафф статов, нужно пересчитать итоговый стат
                if (effect.type === EFFECT_TYPES.BUFF_ATK || effect.type === EFFECT_TYPES.BUFF_DEF) {
                    recalculateStats(entity);
                }

                if (logFn && entity === GameModule.getPlayer()) {
                     logFn(`Действие ${effect.name} закончилось.`, "info");
                }
            }
        });
    }

    /**
     * Удаляет эффект определенного типа
     */
    function removeEffect(entity, type) {
        if (!entity.effects) return;
        entity.effects = entity.effects.filter(e => e.type !== type);
    }

    /**
     * Получает суммарный бонус к конкретному типу эффекта
     */
    function getActiveEffectValue(entity, type) {
        if (!entity.effects) return 0;
        const effect = entity.effects.find(e => e.type === type);
        return effect ? effect.value : 0;
    }
    
    /**
     * Получает оставшуюся длительность эффекта
     */
    function getEffectDuration(entity, type) {
        if (!entity.effects) return 0;
        const effect = entity.effects.find(e => e.type === type);
        return effect ? effect.duration : 0;
    }

    /**
     * Пересчитывает итоговые статы игрока на основе базовых + экипировки + активных эффектов
     */
    function recalculateStats(player) {
        if (!player) return;

        // 1. Базовые статы от уровня
        const baseAtk = WorldCurveModule.getPlayerBaseAtk(player.level);
        const baseDef = WorldCurveModule.getPlayerBaseDef(player.level);

        // 2. Бонусы от экипировки (они хранятся в bonusAtk/bonusDef постоянно)
        // Примечание: в текущей архитектуре bonusAtk уже включает экипировку.
        // Нам нужно отделить "постоянные" бонусы от "временных".
        // Но проще всего: пересчитать Atk = Base + EquipmentBonus + ActiveEffectBonus
        
        // Чтобы это работало корректно, нам нужно знать "чистый" бонус от вещей.
        // В текущем коде player.bonusAtk меняется при надевании. 
        // Давайте считать, что player.bonusAtk - это бонус ОТ ВЕЩЕЙ.
        
        const equipAtkBonus = player.bonusAtk || 0;
        const equipDefBonus = player.bonusDef || 0;

        // 3. Бонусы от активных эффектов
        const buffAtk = getActiveEffectValue(player, EFFECT_TYPES.BUFF_ATK);
        const buffDef = getActiveEffectValue(player, EFFECT_TYPES.BUFF_DEF);

        // Итоговые значения
        player.atk = baseAtk + equipAtkBonus + buffAtk;
        player.def = baseDef + equipDefBonus + buffDef;

        // Защита от отрицательных значений
        if (player.atk < 1) player.atk = 1;
        if (player.def < 0) player.def = 0;
    }

    // --- Конструкторы стандартных эффектов ---

    function createBuffAtk(duration, value) {
        return createEffect('buff_atk', 'Ярость', EFFECT_TYPES.BUFF_ATK, duration, value, '#ff9800');
    }

    function createBuffDef(duration, value) {
        return createEffect('buff_def', 'Каменная кожа', EFFECT_TYPES.BUFF_DEF, duration, value, '#00bcd4');
    }

    function createBurn(duration, power) {
        return createEffect('burn', 'Горение', EFFECT_TYPES.DOT, duration, power, '#ff5500');
    }

    function createRegen(duration, power) {
        return createEffect('regen', 'Регенерация', EFFECT_TYPES.HOT, duration, power, '#00ffaa');
    }

    // === ПУБЛИЧНЫЙ ИНТЕРФЕЙС ===
    return {
        addEffect: addEffect,
        processEffects: processEffects,
        recalculateStats: recalculateStats,
        getEffectDuration: getEffectDuration,
        
        Effects: {
            createBuffAtk: createBuffAtk,
            createBuffDef: createBuffDef,
            createBurn: createBurn,
            createRegen: createRegen
        },
        TYPES: EFFECT_TYPES // Экспортируем типы для использования в combat.js
    };

})();
