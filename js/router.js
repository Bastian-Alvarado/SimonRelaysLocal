/**
 * SimonRelays Router Module
 * Manages browser history, view visibility toggling, and routing state.
 */
const Router = (() => {
    let callbacks = {
        onRouteChanged: (viewId, stateData) => {}
    };

    let views = {};

    function hideAllViews() {
        Object.values(views).forEach(el => {
            if (el) {
                el.classList.remove('active');
                el.classList.add('hidden');
            }
        });
    }

    function hideOverlays(except = null) {
        if (except !== 'queue' && typeof window.hideQueueOverlay === 'function') window.hideQueueOverlay();
        if (except !== 'immersive' && typeof window.hideImmersiveOverlay === 'function') window.hideImmersiveOverlay();
        if (typeof window.hideContextMenu === 'function') window.hideContextMenu();
        if (except !== 'settings' && typeof window.closeSettings === 'function') window.closeSettings();
    }

    function openViewAnimated(viewNode) {
        if (!viewNode) return;
        viewNode.classList.remove('hidden');
        setTimeout(() => viewNode.classList.add('active'), 10);
        if (typeof Animations !== 'undefined' && Animations.oneShot) {
            Animations.oneShot(viewNode, 'anim-view-enter');
        }
    }

    function closeViewAnimated(viewNode, duration = 500) {
        if (!viewNode || !viewNode.classList.contains('active')) return;
        viewNode.classList.remove('active');
        setTimeout(() => {
            if (!viewNode.classList.contains('active')) {
                viewNode.classList.add('hidden');
            }
        }, duration);
    }

    function switchToView(viewId) {
        hideOverlays();
        hideAllViews();
        
        const viewNode = views[viewId];
        if (viewNode) {
            openViewAnimated(viewNode);
        }
    }

    return {
        init(config) {
            views = config.views || {};
            if (config.onRouteChanged) callbacks.onRouteChanged = config.onRouteChanged;

            window.addEventListener('popstate', (e) => {
                if (!window.isAppInitialized) return;
                if (e.state && e.state.viewId) {
                    callbacks.onRouteChanged(e.state.viewId, e.state.stateData, false);
                } else {
                    callbacks.onRouteChanged('home', {}, false);
                }
            });

            // Backwards compatibility for search.js
            window.switchToSearchView = (push = true) => this.navigate('search', {}, push);
            window.switchToHomeView = (push = true) => this.navigate('home', {}, push);

            this.openViewAnimated = openViewAnimated;
            this.closeViewAnimated = closeViewAnimated;
            this.hideAllViews = hideAllViews;
            this.hideOverlays = hideOverlays;
            this.switchToView = switchToView;
        },

        navigate(viewId, stateData = {}, push = true) {
            if (push) {
                history.pushState({ viewId, stateData }, '', '#' + viewId);
            }
            callbacks.onRouteChanged(viewId, stateData, push);
        }
    };
})();

window.Router = Router;
