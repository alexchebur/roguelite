/**
 * МОДУЛЬ СИСТЕМЫ ЭФФЕКТОВ (effect_system.js)
 * Управляет временными состояниями существ (баффы, дебаффы, DoT - damage over time).
 */

const EffectSystemModule = (function() {
    'use strict';

    // Типы эффектов
    const EFFECT_TYPES = {
        BUFF: 'buff',       // Усиление (увеличивает статы)
        DEBUFF: 'debuff',   // Ослабление (уменьшает статы)
        DOT: 'dot',         // Урон со временем (горение, яд)
        HOT: 'hot'          // Лечение со временем (регенерация)
    };

    /**
     * Создает объект эффекта
     * @param {string} id - уникальный идентификатор (напр. 'burn', 'haste')
     * @param {string} name - отображаемое имя
     * @param {string} type - тип эффекта из EFFECT_TYPES
     * @param {number} duration - сколько ходов осталось
     * @param {object} data - дополнительные данные (сила урона, модификаторы статов)
     * @param {string} color - цвет для отображения в логе/UI
     */
    function createEffect(id, name, type, duration, data, color) {
        return {
            id: id,
            name: name,
            type: type,
            duration: duration,
            data: data || {},
            color: color || '#fff'
        };
    }

    /**
     * Добавляет эффект к существу.
     * Если такой же эффект уже есть, обновляет длительность (или силу, если нужно).
     * @param {object} entity - существо (игрок или враг)
     * @param {object} effect - объект эффекта
     */
    function addEffect(entity, effect) {
        if (!entity.effects) entity.effects = [];

        // Проверяем, есть ли уже такой эффект
        const existing = entity.effects.find(e => e.id === effect.id);
        
        if (existing) {
            // Обновляем длительность (берем максимум или сумму - на выбор, здесь максимум)
            existing.duration = Math.max(existing.duration, effect.duration);
            // Можно также обновить силу (data), если эффект стал сильнее
            if (effect.data.power > existing.data.power) {
                existing.data = effect.data;
            }
        } else {
            entity.effects.push(effect);
        }
    }

    /**
     * Удаляет эффект по ID
     */
    function removeEffect(entity, effectId) {
        if (!entity.effects) return;
        entity.effects = entity.effects.filter(e => e.id !== effectId);
    }

    /**
     * Обрабатывает все активные эффекты существа в конце/начале хода.
     * Вызывать один раз за ход для каждого активного существа.
     * @param {object} entity - существо
     * @param {function} logFn - функция логирования (опционально)
     * @returns {object} результат обработки { damageTaken: 0, healed: 0, statChanges: {} }
     */
    function processEffects(entity, logFn) {
        if (!entity.effects || entity.effects.length === 0) return;

        const results = { damageTaken: 0, healed: 0 };

        // Проходимся по копии массива, так как эффекты могут удаляться
        [...entity.effects].forEach(effect => {
            // 1. Применяем мгновенный эффект хода (урон/лечение)
            if (effect.type === EFFECT_TYPES.DOT) {
                const dmg = effect.data.power || 1;
                entity.hp -= dmg;
                results.damageTaken += dmg;
                if (logFn) logFn(`${entity.name} получает ${dmg} урона от ${effect.name}.`, "combat");
            } 
            else if (effect.type === EFFECT_TYPES.HOT) {
                const heal = effect.data.power || 1;
                const oldHp = entity.hp;
                entity.hp = Math.min(entity.maxHp, entity.hp + heal);
                results.healed += (entity.hp - oldHp);
                if (logFn && (entity.hp - oldHp) > 0) logFn(`${entity.name} восстанавливает ${heal} HP.`, "info");
            }

            // 2. Уменьшаем длительность
            effect.duration--;

            // 3. Удаляем, если истек
            if (effect.duration <= 0) {
                removeEffect(entity, effect.id);
                if (logFn) logFn(`Действие ${effect.name} на ${entity.name} закончилось.`, "info");
            }
        });
    }

    /**
     * Получает суммарный модификатор к стату от всех активных баффов/дебаффов
     * Например, если есть 'haste' (+2 speed) и 'slow' (-1 speed), вернет +1.
     * @param {object} entity 
     * @param {string} statName - 'atk', 'def', 'speed' и т.д.
     */
    getStatModifier(entity, statName) {
        if (!entity.effects) return 0;
        let mod = 0;
        entity.effects.forEach(e => {
            if ((e.type === EFFECT_TYPES.BUFF || e.type === EFFECT_TYPES.DEBUFF) && e.data.stats) {
                mod += (e.data.stats[statName] || 0);
            }
        });
        return mod;
    },

    // --- Фабрика стандартных эффектов (примеры) ---

    createBurn: function(duration, power) {
        return createEffect('burn', 'Горение', EFFECT_TYPES.DOT, duration, { power: power }, '#ff5500');
    },

    createPoison: function(duration, power) {
        return createEffect('poison', 'Яд', EFFECT_TYPES.DOT, duration, { power: power }, '#00ff00');
    },

    createHaste: function(duration, speedBonus) {
        return createEffect('haste', 'Спешка', EFFECT_TYPES.BUFF, duration, { stats: { speed: speedBonus } }, '#ffff00');
    },

    createWeakness: function(duration, atkPenalty) {
        return createEffect('weakness', 'Слабость', EFFECT_TYPES.DEBUFF, duration, { stats: { atk: -atkPenalty } }, '#888888');
    },

    createRegen: function(duration, power) {
        return createEffect('regen', 'Регенерация', EFFECT_TYPES.HOT, duration, { power: power }, '#00ffaa');
    }

    return {
        addEffect: addEffect,
        removeEffect: removeEffect,
        processEffects: processEffects,
        getStatModifier: getStatModifier,
        
        // Экспортируем фабрику для удобства
        Effects: {
            createBurn: this.createBurn,
            createPoison: this.createPoison,
            createHaste: this.createHaste,
            createWeakness: this.createWeakness,
            createRegen: this.createRegen
        }
    };
})();
