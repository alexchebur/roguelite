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
     */
    function addEffect(entity, effect) {
        if (!entity.effects) entity.effects = [];

        // Проверяем, есть ли уже такой эффект
        const existing = entity.effects.find(e => e.id === effect.id);
        
        if (existing) {
            // Обновляем длительность (берем максимум)
            existing.duration = Math.max(existing.duration, effect.duration);
            // Если новый эффект сильнее, обновляем данные
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
     * Обрабатывает все активные эффекты существа.
     * Вызывать один раз за ход для каждого существа.
     */
    function processEffects(entity, logFn) {
        if (!entity.effects || entity.effects.length === 0) return;

        // Проходимся по копии массива, так как эффекты могут удаляться
        [...entity.effects].forEach(effect => {
            // 1. Применяем мгновенный эффект хода (урон/лечение)
            if (effect.type === EFFECT_TYPES.DOT) {
                const dmg = effect.data.power || 1;
                entity.hp -= dmg;
                if (logFn) logFn(`${entity.name} получает ${dmg} урона от ${effect.name}.`, "combat");
            } 
            else if (effect.type === EFFECT_TYPES.HOT) {
                const heal = effect.data.power || 1;
                const oldHp = entity.hp;
                entity.hp = Math.min(entity.maxHp, entity.hp + heal);
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
     */
    function getStatModifier(entity, statName) {
        if (!entity.effects) return 0;
        let mod = 0;
        entity.effects.forEach(e => {
            if ((e.type === EFFECT_TYPES.BUFF || e.type === EFFECT_TYPES.DEBUFF) && e.data.stats) {
                mod += (e.data.stats[statName] || 0);
            }
        });
        return mod;
    }

    // --- Фабрика стандартных эффектов (примеры) ---

    function createBurn(duration, power) {
        return createEffect('burn', 'Горение', EFFECT_TYPES.DOT, duration, { power: power }, '#ff5500');
    }

    function createPoison(duration, power) {
        return createEffect('poison', 'Яд', EFFECT_TYPES.DOT, duration, { power: power }, '#00ff00');
    }

    function createHaste(duration, speedBonus) {
        return createEffect('haste', 'Спешка', EFFECT_TYPES.BUFF, duration, { stats: { speed: speedBonus } }, '#ffff00');
    }

    function createWeakness(duration, atkPenalty) {
        return createEffect('weakness', 'Слабость', EFFECT_TYPES.DEBUFF, duration, { stats: { atk: -atkPenalty } }, '#888888');
    }

    function createRegen(duration, power) {
        return createEffect('regen', 'Регенерация', EFFECT_TYPES.HOT, duration, { power: power }, '#00ffaa');
    }

    // ПУБЛИЧНЫЙ ИНТЕРФЕЙС
    return {
        addEffect: addEffect,
        removeEffect: removeEffect,
        processEffects: processEffects,
        getStatModifier: getStatModifier,
        
        // Экспортируем фабрику для удобства вызова: EffectSystemModule.Effects.createBurn(...)
        Effects: {
            createBurn: createBurn,
            createPoison: createPoison,
            createHaste: createHaste,
            createWeakness: createWeakness,
            createRegen: createRegen
        }
    };
})();
