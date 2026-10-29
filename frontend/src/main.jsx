import { installRuntimeErrorOverlay } from './lib/runtimeErrorOverlay.js';
import { installHooksDevDiagnostics } from './lib/hooksDevDiagnostics.js';

installRuntimeErrorOverlay();
installHooksDevDiagnostics();

import './index.css';
import './styles/design-system.css';
import './styles/allmodelai-3-workspace.css';
import './styles/premium-ui.css';
import './styles/home-premium.css';
import './styles/home-visual-refinement.css';
import './styles/home-premium-polish.css';
import './styles/home-premium-next.css';
import './styles/style.css';
import './styles/platform-shell.css';

import { installNativeFetchInterceptor } from './lib/nativeFetch.js';
import { startRedirectPrerequisitesPreload } from './lib/authRedirectPreload.js';
import { ensureSocialAuthReady } from './lib/firebase.js';
import { reconcileStaleRedirectIntent } from './lib/socialRedirectState.js';
import { startAllModelAIApp } from './startApp.jsx';

installNativeFetchInterceptor();
void startRedirectPrerequisitesPreload().catch(() => {
  /* Redirect gate surfaces recovery errors. */
});
void ensureSocialAuthReady().catch(() => {});
void Promise.resolve().then(() => {
  reconcileStaleRedirectIntent();
});

startAllModelAIApp();
