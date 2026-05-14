/**
 * Animations Module
 * Lightweight CSS-first animation coordinator.
 * Manages a global toggle and provides a stagger helper for list/grid entries.
 */

const Animations = (function () {
    let enabled = true;

    // Respect OS-level reduced motion preference
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return {
        init: function () {
            const saved = localStorage.getItem('animationsEnabled');
            // Default to ON unless user explicitly disabled or OS says reduce
            enabled = prefersReduced ? false : (saved !== 'false');
            this._applyClass();
            console.log(`[Animations] Initialized. Enabled: ${enabled}, OS reduced-motion: ${prefersReduced}`);
        },

        isEnabled: function () {
            return enabled;
        },

        toggle: function (value) {
            enabled = !!value;
            localStorage.setItem('animationsEnabled', enabled);
            this._applyClass();
        },

        _applyClass: function () {
            document.body.classList.toggle('animations-enabled', enabled);
        },

        /**
         * Apply staggered entry animation to children of a container.
         * @param {HTMLElement} container - Parent element containing the items.
         * @param {string} selector - CSS selector for the items to animate.
         * @param {number} baseDelay - Delay increment per item in ms (default 25).
         */
        stagger: function (container, selector, baseDelay = 25) {
            if (!enabled || !container) return;

            const items = container.querySelectorAll(selector);
            const maxDelay = 600; // Cap total animation time

            items.forEach((item, i) => {
                const delay = Math.min(i * baseDelay, maxDelay);
                item.style.animationDelay = `${delay}ms`;
                item.style.willChange = 'opacity, transform';
                item.classList.add('anim-stagger-item');

                // Clean up will-change after animation completes to free GPU memory
                item.addEventListener('animationend', function cleanup() {
                    item.style.willChange = '';
                    item.style.animationDelay = '';
                    item.removeEventListener('animationend', cleanup);
                }, { once: true });
            });
        },

        /**
         * Apply a one-shot animation class to an element, removing it when done.
         * @param {HTMLElement} el - Target element.
         * @param {string} className - Animation class to add.
         */
        oneShot: function (el, className) {
            if (!enabled || !el) return;
            el.classList.remove(className); // Reset if already present
            void el.offsetWidth; // Force reflow to restart animation
            el.classList.add(className);
            el.addEventListener('animationend', function cleanup() {
                el.classList.remove(className);
                el.removeEventListener('animationend', cleanup);
            }, { once: true });
        }
    };
})();

window.Animations = Animations;
