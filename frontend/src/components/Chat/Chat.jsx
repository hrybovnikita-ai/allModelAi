import { splitChatSse } from '../../lib/chatSse';
import { parseGeneratedFile } from '../../lib/generatedFiles';
import { FileCard } from '../GeneratedFile/GeneratedFile';
import { createVoiceInput } from '../../lib/voiceInput';
import GeneratedImageCard from './GeneratedImageCard';
import GeneratedVideoCard from './GeneratedVideoCard';
import VideoGenerationPanel from './VideoGenerationPanel';
import './VideoGenerationPanel.css';
import { useLanguage } from '../../lib/useLanguage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams, useOutletContext } from 'react-router-dom';
import ChatMessageContent from './ChatMessageContent';
import { dashboardModels } from '../../data/dashboardModels';
import {
  markModelOnline,
  mergeModelVariantCatalog,
  normalizeModelStatusMap,
  resolveModelOnlineStatus,
} from '../../data/ollamaCloudVariants';
import { historicalProviderErrorPresentation } from '../../lib/historicalProviderErrors';
import { apiFetch, checkChatResponse } from '../../lib/api';
import {
  fetchChatConversation,
  fetchChatHistoryList,
  invalidateChatHistoryListCache,
  setConversationLifecycle,
} from '../../lib/chatHistoryApi';
import { createChatStreamDiagnostics } from '../../lib/chatStreamDiagnostics';
import { isNearScrollBottom } from '../../lib/chatScroll';
import { formatChatVisionError, prepareChatImageAttachment } from '../../lib/imageAttachment';
import {
  buildImageRequestBody,
  downloadOriginalImage,
  fetchImageGenerationStatus,
  IMAGE_ASPECTS,
  IMAGE_COUNT_OPTIONS,
  IMAGE_QUALITIES,
  requestImageGeneration,
} from '../../lib/imageGeneration';
import {
  buildVideoRequestBody,
  clampVideoSettings,
  fetchActiveVideoJobs,
  fetchVideoGenerationStatus,
  formatVideoJobStatus,
  pollVideoJob,
  readPendingVideoJobId,
  rememberPendingVideoJobId,
  requestVideoGeneration,
  resolveVideoUiOptions,
  VIDEO_DEFAULTS,
  videoNetworkErrorMessage,
} from '../../lib/videoGeneration';
import {
  buildAssistantVideoMessage,
  messageHasPlayableVideo,
  messageHasVideoReference,
  normalizeConversationMessages,
  normalizeVideoMessage,
} from '../../lib/chatMessageVideo';
import {
  extractAssistantText,
  patchAssistantMessage,
  responseBelongsToOpenChat as conversationOwnsResponse,
  shouldBootstrapOpenConversation,
  shouldShowBackgroundReplyNotice,
} from '../../lib/chatResponseOwnership';
import { finalizeAssistantMessage, stickerFieldsForPersist } from '../../lib/aiStickers/enhanceMessage';
import AiCreditsPurchaseDialog from '../Credits/AiCreditsPurchaseDialog';
import UsageLimitWarning from './UsageLimitWarning';
import { isUserQuotaExceeded } from '../../lib/usageLimitMessages';
import { readAiStickersEnabled, AI_STICKERS_ENABLED_KEY } from '../../lib/aiStickers/settings';
import ChatAiSticker from './ChatAiSticker';
import ChatEmptyState from './ChatEmptyState';
import { useChatContextSuggestions } from './useChatContextSuggestions';
import { logger, timingElapsed, timingNow } from '../../lib/logger';
import { submitResponseFeedback } from '../../lib/aiImprovement';
import { deleteUserAccountAndSignOut } from '../../lib/clientAuthReset';
import SessionRecovery from './SessionRecovery';
import WebSources, { WebSearchStatus } from './WebSources';
import DeepResearchMessageBlock from './DeepResearchMessageBlock';
import {
  applyDeepResearchSseEvent,
  consumeDeepResearchStream,
  fetchResearchClarification,
} from '../../lib/deepResearchClient.js';
import './Chat.css';
import './ChatApi.css';
import './ChatDarkViolet.css';
import './ChatSidebarCollapse.css';
import './ChatPremium.css';
import './ComposerInput.css';
import './ComposerModern.css';
import './ComposerToolSurfaces.css';
import './ChatMobileLayout.css';
import './ChatRoundedTheme.css';
import './ChatWorkspaceLayout.css';
import './ChatModelSelector.css';
import './AnoninMessageReveal.css';
import {
  IconArrowRight,
  IconCamera,
  IconFileCode,
  IconGitBranch,
  IconGlobe,
  IconImage,
  IconMessageSquare,
  IconMic,
  IconPaperclip,
  IconPlus,
  IconSearchDeep,
  IconSendUp,
  IconStar,
  IconVideo,
  IconVolume,
} from './ComposerIcons';
import CreateProjectModal, { ProjectIconBadge } from './CreateProjectModal';
import AccountDeleteModal from '../AccountDeleteModal';
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog';
import { isStandaloneApp } from '../../lib/appMode';
import { readResponsePrefs } from '../../lib/responseLanguagePrefs.js';
import { formatPaymentError } from '../../lib/formatPaymentError';
import { normalizeCreditStatus } from '../../lib/creditStatus';
import WayforpayPaymentModal from '../Checkout/WayforpayPaymentModal';
import './SubscribeModalPremium.css';
import { copyToClipboard } from '../../lib/clipboard';
import MessageActions from './MessageActions';
import AnoninMessageReveal from './AnoninMessageReveal';
import { fetchAnoninRevealedIds } from '../../lib/anoninClient';
import { isAnoninModelSlug, normalizeAnoninModelSlug } from '../../lib/anoninModelSlug';
import {
  buildProCheckoutPath,
  canUseChatModel,
  freeModelsLabel,
  isPaidPlanAccess,
  isPremiumLockedModel,
} from '../../lib/modelEntitlements';
import PremiumUpgradeModal from './PremiumUpgradeModal';
import ModelEntitlementBadge from './ModelEntitlementBadge';
import ChatSidebar from './ChatSidebar';
import TemporaryChatBanner from './TemporaryChatBanner';
import { IconToolKnowledgeBase } from './ChatSidebarIcons';
import KnowledgeSourceChips from './KnowledgeSourceChips';

const CHAT_PLAN_TO_CHECKOUT = { starter: 'starter', pro: 'pro', unlimited: 'unlimited' };

function ModelSpeedBadge({ speed }) {
  if (!speed || !['Fast', 'Medium', 'High'].includes(speed)) return null;
  return <em className={`model-speed-badge speed-${speed.toLowerCase()}`}>{speed}</em>;
}

function IconSlidersHorizontal() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M1 14h6M9 8h6M17 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function formatModelSelectorTriggerLabel(selectedModel, selectedVersion) {
  if (selectedVersion) {
    const name = `${selectedVersion.name}${selectedVersion.label ? ` ${selectedVersion.label}` : ''}`.trim();
    if (selectedVersion.speed) return `${name} - ${selectedVersion.speed}`;
    return name;
  }
  return `${selectedModel.name} — ${selectedModel.provider}`;
}

// const quickPrompts = [
// 'Write a short story about a time traveler.',
//  'Summarize the main benefits of daily exercise.',
//  'Help me plan a budget for a trip to Europe.',
// ];

const suggestions = [
  { icon: 'idea', title: 'Create an idea', prompt: 'Give me three original product ideas for students.' },
  { icon: 'code', title: 'Explain code', prompt: 'Explain React useEffect with a simple example.' },
  {
    icon: 'ai',
    title: 'Compare models',
    prompt: 'Compare Claude, Gemini, GPT, and Llama.',
    action: 'arena',
  },
];

const chatTextColors = [
  ['Blue', '#3b82f6'], ['Yellow', '#facc15'], ['Purple', '#a855f7'],
  ['Lime', '#a3e635'], ['Orange', '#f97316'], ['Red', '#ef4444'],
  ['Red orange', '#ff4500'], ['Violet', '#8b5cf6'], ['Gray', '#9ca3af'],
  ['Green yellow', '#adff2f'],
];

function safeStorageGet(storageName, key, fallback = null) {
  try {
    const storage = globalThis[storageName];
    if (!storage) return fallback;

    const value = storage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function safeStorageSet(storageName, key, value) {
  try {
    globalThis[storageName]?.setItem(key, value);
  } catch {
    // Safari may block storage.
  }
}

const SIDEBAR_WIDTH_MIN = 200;
const SIDEBAR_WIDTH_MAX = 520;
const SIDEBAR_WIDTH_DEFAULT = 272;
const SIDEBAR_WIDTH_STORAGE_KEY = 'allmodelai_sidebar_width';

function readSidebarWidth() {
  const saved = parseInt(safeStorageGet('localStorage', SIDEBAR_WIDTH_STORAGE_KEY, ''), 10);
  if (!Number.isFinite(saved)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, saved));
}

function safeJSON(value, fallback) {
  try {
    const parsed = value ? JSON.parse(value) : fallback;
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
    if (fallback && typeof fallback === 'object') {
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    }
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}


const fallbackModel = dashboardModels.find((model) => model.slug === 'gpt') || dashboardModels[0];
function validModelSlug(slug) {
  const normalized = normalizeAnoninModelSlug(slug);
  if (dashboardModels.some((model) => model.slug === normalized)) {
    if (normalized === 'anonin' && normalized !== String(slug || '').trim().toLowerCase()) {
      safeStorageSet('localStorage', 'allmodelai_selected_model', 'anonin');
    }
    return normalized;
  }
  return fallbackModel.slug;
}

function subscribeVoices(synthesis, onVoices) {
  if (!synthesis || typeof synthesis.getVoices !== 'function') return undefined;
  const loadVoices = () => {
    try { onVoices(Array.from(synthesis.getVoices() || [])); } catch { onVoices([]); }
  };
  loadVoices();
  if (typeof synthesis.addEventListener === 'function' && typeof synthesis.removeEventListener === 'function') {
    synthesis.addEventListener('voiceschanged', loadVoices);
    return () => synthesis.removeEventListener('voiceschanged', loadVoices);
  }
  const previous = synthesis.onvoiceschanged;
  const handler = (event) => {
    try { if (typeof previous === 'function') previous.call(synthesis, event); }
    finally { loadVoices(); }
  };
  synthesis.onvoiceschanged = handler;
  return () => { if (synthesis.onvoiceschanged === handler) synthesis.onvoiceschanged = previous; };
}

export default function Chat() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const messagesEnd = useRef(null);
  const messagesContainer = useRef(null);
  const stickToBottomRef = useRef(true);
  const fileInput = useRef(null);
  const composerInputRef = useRef(null);
  const composerShellRef = useRef(null);
  const activeRequest = useRef(null);
  const deepResearchPendingRef = useRef(null);
  const speechRecognition = useRef(null);
  const { user, sessionVerified } = useOutletContext();
  const isGuest = user?.guest === true;
  const [selectedSlug, setSelectedSlug] = useState(() => {
    const requested =
      searchParams.get('model') ||
      safeStorageGet('localStorage', 'allmodelai_selected_model', 'gpt');
    return validModelSlug(requested);
  });
  const [anoninStrategy, setAnoninStrategy] = useState(() => (
    safeStorageGet('localStorage', 'allmodelai_anonin_strategy', 'random') || 'random'
  ));
  const [prompt, setPrompt] = useState(location.state?.starterPrompt || '');
  const [isSending, setIsSending] = useState(false);
  const [isStreamingResponse, setIsStreamingResponse] = useState(false);
  const [chatError, setChatError] = useState('');
  const [usageLimitNotice, setUsageLimitNotice] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [creditStatus, setCreditStatus] = useState(null);
  const [accessModeSaving, setAccessModeSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarToggleRef = useRef(null);
  const CHAT_SIDEBAR_DRAWER_ID = 'chat-sidebar-drawer';

  const isMobileSidebarViewport = useCallback(
    () => globalThis.matchMedia?.('(max-width: 900px)').matches ?? false,
    [],
  );

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (!isMobileSidebarViewport()) return;
    setSidebarOpen((previous) => !previous);
  }, [isMobileSidebarViewport]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => safeStorageGet('localStorage', 'allmodelai_sidebar_collapsed') === 'true'
  );
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);
  const sidebarResizeActiveRef = useRef(false);
  const [messages, setMessages] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [archivedHistory, setArchivedHistory] = useState([]);
  const [trashedHistory, setTrashedHistory] = useState([]);
  const [historyLoadError, setHistoryLoadError] = useState('');
  const [chatMeta, setChatMeta] = useState(() =>
    safeJSON(safeStorageGet('localStorage', 'allmodelai_chat_meta'), {})
  );
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyFeedOpen, setHistoryFeedOpen] = useState(false);
  const [historyFeedQuery, setHistoryFeedQuery] = useState('');
  const [messageRatings, setMessageRatings] = useState(() =>
    safeJSON(safeStorageGet('localStorage', 'allmodelai_message_ratings'), {})
  );
  const [, setMessageLikes] = useState(() =>
    safeJSON(safeStorageGet('localStorage', 'allmodelai_message_likes'), {})
  );

  const [messageFeedback, setMessageFeedback] = useState(() =>
    safeJSON(safeStorageGet('localStorage', 'allmodelai_message_feedback'), {})
  );
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(
    () => safeStorageGet('localStorage', 'allmodelai_use_knowledge') === 'true',
  );
  const [aiStickersEnabled, setAiStickersEnabled] = useState(() => readAiStickersEnabled());

  const [backgroundNotification, setBackgroundNotification] = useState(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackMessageIndex, setFeedbackMessageIndex] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [favorites, setFavorites] = useState(() =>
    safeJSON(safeStorageGet('localStorage', 'allmodelai_favorites'), []).filter((item) => item && typeof item.text === 'string')
  );
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [chatMenuId, setChatMenuId] = useState(null);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [webSearchFilters, setWebSearchFilters] = useState({
    topic: 'general',
    days: '',
    language: '',
    region: '',
  });
  const contextSuggestions = useChatContextSuggestions({
    prompt,
    messages,
    activeConversationId,
    selectedSkill,
    isSending,
    isGuest,
  });
  const [researchDepth, setResearchDepth] = useState('deep');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const confirmInFlightRef = useRef(false);
  const [temporaryChat, setTemporaryChat] = useState(false);
  const [temporaryHistory, setTemporaryHistory] = useState([]);
  const [temporaryExpiresAt, setTemporaryExpiresAt] = useState(null);
  const [projects, setProjects] = useState(() =>
    safeJSON(safeStorageGet('localStorage', 'allmodelai_projects'), []).filter((item) => item && typeof item.name === 'string')
  );
  const [activeProject, setActiveProject] = useState(() => {
    const list = safeJSON(safeStorageGet('localStorage', 'allmodelai_projects'), []).filter((item) => item && typeof item.name === 'string');
    const activeId = safeStorageGet('localStorage', 'allmodelai_active_project_id');
    return list.find((item) => item.id === activeId) || null;
  });
  const [projectMenuId, setProjectMenuId] = useState(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [arenaOpen, setArenaOpen] = useState(false);
  const [arenaTask, setArenaTask] = useState('');
  const [variantCatalog, setVariantCatalog] = useState({});
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [premiumUpgradeOpen, setPremiumUpgradeOpen] = useState(false);
  const [premiumUpgradeTarget, setPremiumUpgradeTarget] = useState({ name: '', slug: '', variantId: '' });
  const [aiCreditsPurchaseOpen, setAiCreditsPurchaseOpen] = useState(false);
  const [subscribePlan, setSubscribePlan] = useState(null);
  const [subscribeForm, setSubscribeForm] = useState({ cardNumber: '', holder: '', email: '', city: '', birthDate: '', expiry: '', cvc: '' });
  const [subscribeBusy, setSubscribeBusy] = useState(false);
  const [subscribeError, setSubscribeError] = useState('');
  const [primaryPaymentProvider, setPrimaryPaymentProvider] = useState(null);
  const [wayforpayTestMode, setWayforpayTestMode] = useState(false);
  const [wayforpayCurrency, setWayforpayCurrency] = useState('USD');
  const [paymentsConfigLoaded, setPaymentsConfigLoaded] = useState(false);
  const [wayforpayPayOpen, setWayforpayPayOpen] = useState(false);
  const [wayforpayCheckoutCtx, setWayforpayCheckoutCtx] = useState(null);
  const wayforpayPaySucceededRef = useRef(false);

  const standaloneApp = useMemo(() => isStandaloneApp(), []);

  const subscriptionPlans = [
    {
      id: 'starter',
      icon: '🌱',
      name: t('Starter'),
      price: '$5',
      period: t('per month'),
      features: [t('Core AI models'), t('800 requests per month'), t('Standard response speed'), t('Email support')],
    },
    {
      id: 'pro',
      icon: '🚀',
      name: t('Pro'),
      price: '$9.99',
      period: t('per month'),
      popular: true,
      features: [t('Premium model access'), t('3,000 requests per month'), t('Priority routing'), t('Image generation'), t('Priority support')],
    },
    {
      id: 'unlimited',
      icon: '♾️',
      name: t('Unlimited'),
      price: '$30',
      period: t('per month'),
      features: [t('All connected providers'), t('6,000 requests per month'), t('Highest routing priority'), t('Image generation'), t('Dedicated support')],
    },
  ];

  const navigateToProCheckout = (returnModel, returnVariant) => {
    const path = buildProCheckoutPath({
      returnModel: returnModel || selectedSlug,
      returnVariant: returnVariant || premiumUpgradeTarget.variantId || selectedVersion?.id,
    });
    setModelMenuOpen(false);
    setPremiumUpgradeOpen(false);
    if (isGuest || !user?.email) {
      navigate('/login', { state: { from: path } });
      return;
    }
    navigate(path);
  };

  const openPremiumUpgrade = (model, version) => {
    const name = typeof model === 'string'
      ? model
      : [model?.name, version?.name].filter(Boolean).join(' · ') || model?.name || '';
    const slug = typeof model === 'object' && model?.slug ? model.slug : selectedSlug;
    const variantId = version?.id || '';
    setPremiumUpgradeTarget({ name, slug, variantId });
    setPremiumUpgradeOpen(true);
    setModelMenuOpen(false);
  };

  const openSubscribe = (returnModel) => {
    if (!creditStatus?.isDeveloper) {
      navigateToProCheckout(returnModel);
      return;
    }
    setSubscribeError('');
    setSubscribePlan(null);
    setPaymentsConfigLoaded(false);
    setSubscribeForm({ cardNumber: '', holder: '', email: user.email || '', city: '', birthDate: '', expiry: '', cvc: '' });
    setSubscribeModalOpen(true);
  };

  const updateSubscribeForm = (field, value) => setSubscribeForm((form) => ({ ...form, [field]: value }));

  const refreshCreditsAfterPayment = async () => {
    const creditsRes = await apiFetch(`/api/credits?email=${encodeURIComponent(user.email)}`);
    if (creditsRes.ok) setCreditStatus(normalizeCreditStatus(await creditsRes.json()));
  };

  const submitSubscription = async () => {
    if (subscribeBusy || !subscribePlan) return;
    setSubscribeError('');
    setSubscribeBusy(true);
    try {
      if (creditStatus?.isDeveloper) {
        if (subscribeForm.cardNumber.replace(/\D/g, '').length < 12 || !subscribeForm.holder.trim() || !subscribeForm.email.trim()) {
          throw new Error(t('Please fill in the payment details.'));
        }
        const response = await apiFetch('/api/payments/mock-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: subscribePlan.id, ...subscribeForm }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || t('Could not complete the test subscription.'));
        setCreditStatus(data);
        setSubscribeModalOpen(false);
        logger.success('Developer test subscription activated (no charge)');
      } else {
        const checkoutPlan = CHAT_PLAN_TO_CHECKOUT[subscribePlan.id] || 'pro';
        setSubscribeModalOpen(false);
        navigate(`/checkout?plan=${encodeURIComponent(checkoutPlan)}`);
        return;
      }
      setSubscribeForm({ cardNumber: '', holder: '', email: '', city: '', birthDate: '', expiry: '', cvc: '' });
    } catch (error) {
      setSubscribeError(error.message);
    } finally {
      setSubscribeBusy(false);
    }
  };

  const [chosenVersions, setChosenVersions] = useState(() => {
    return safeJSON(safeStorageGet('localStorage', 'allmodelai_model_versions'), {});
  });
  const selectedVersion = variantCatalog[selectedSlug]?.find((item) => item.id === chosenVersions[selectedSlug]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [headerOverflowOpen, setHeaderOverflowOpen] = useState(false);
  const [voiceInputState, setVoiceInputState] = useState('idle');
  const isListening = voiceInputState === 'listening';
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeSpeechMessageIndex, setActiveSpeechMessageIndex] = useState(null);
  const [regeneratingMessageIndex, setRegeneratingMessageIndex] = useState(null);
  const [voiceMode, setVoiceMode] = useState(() => safeStorageGet('localStorage', 'allmodelai_voice_mode') === 'true');
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState(() => safeStorageGet('localStorage', 'allmodelai_voice_language') || globalThis.navigator?.language || 'en-US');
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(() => safeStorageGet('localStorage', 'allmodelai_voice_name') || '');
  const [videoAspectRatio, setVideoAspectRatio] = useState(VIDEO_DEFAULTS.aspectRatio);
  const [videoResolution, setVideoResolution] = useState(VIDEO_DEFAULTS.resolution);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState(VIDEO_DEFAULTS.durationSeconds);
  const [videoUseLastImage, setVideoUseLastImage] = useState(false);
  const [videoMode, setVideoMode] = useState('text-to-video');
  const [videoDraftPrompt, setVideoDraftPrompt] = useState('');
  const [videoReferenceImage, setVideoReferenceImage] = useState('');
  const [videoProvider, setVideoProvider] = useState('');
  const [videoProviderStatus, setVideoProviderStatus] = useState(null);
  const [activeVideoJobs, setActiveVideoJobs] = useState([]);
  const videoSubmitLockRef = useRef(false);
  const [imageGenerationCount, setImageGenerationCount] = useState(1);
  const [imageGenerationQuality, setImageGenerationQuality] = useState('hd');
  const [imageGenerationAspect, setImageGenerationAspect] = useState('1:1');
  const [imageProviderStatus, setImageProviderStatus] = useState(null);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [modelStatus, setModelStatus] = useState({});
  const [themePreference] = useState(() => {
    const preference = safeJSON(safeStorageGet('localStorage', 'allmodelai_appearance'), {}).theme;
    return ['dark', 'light', 'auto'].includes(preference) ? preference : 'dark';
  });
  const [textColor] = useState(() => {
    const savedColor = safeJSON(safeStorageGet('localStorage', 'allmodelai_appearance'), {}).textColor;
    return typeof savedColor !== 'string' || !savedColor || savedColor.toLowerCase() === '#ffffff' ? '#8b5cf6' : savedColor;
  });
  const [attachedImage, setAttachedImage] = useState(null);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [previewModalImage, setPreviewModalImage] = useState(null);
  const activeConversationIdRef = useRef(null);
  const historyBootstrappedRef = useRef(false);
  const isSendingRef = useRef(false);
  const messagesCountRef = useRef(0);
  const activeProjectRef = useRef(null);
  const selectedModel = dashboardModels.find((model) => model.slug === selectedSlug) || fallbackModel;
  const lastAssistantImageUrl = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'assistant' && message.imageUrl) return message.imageUrl;
    }
    return '';
  }, [messages]);

  useEffect(() => {
    if (selectedSkill !== 'video') return undefined;
    let alive = true;
    void Promise.all([
      fetchVideoGenerationStatus(),
      fetchActiveVideoJobs(),
    ]).then(([status, jobs]) => {
      if (!alive) return;
      setVideoProviderStatus(status);
      setActiveVideoJobs(jobs);
      const ui = resolveVideoUiOptions(status);
      const clamped = clampVideoSettings({
        resolution: videoResolution,
        durationSeconds: videoDurationSeconds,
      }, ui);
      setVideoResolution(clamped.resolution);
      setVideoDurationSeconds(clamped.durationSeconds);
    });
    return () => { alive = false; };
  }, [selectedSkill, videoDurationSeconds, videoResolution]);

  useEffect(() => {
    const syncStickerPref = (event) => {
      if (event.key === AI_STICKERS_ENABLED_KEY || event.key === null) {
        setAiStickersEnabled(readAiStickersEnabled());
      }
    };
    window.addEventListener('storage', syncStickerPref);
    return () => window.removeEventListener('storage', syncStickerPref);
  }, []);

  const refreshHistory = useCallback(async ({ includeArchive = false, force = false } = {}) => {
    if (!user?.email || isGuest) return null;
    const fetches = [
      fetchChatHistoryList(apiFetch, { scope: 'active' }, { force }),
      fetchChatHistoryList(apiFetch, { temporary: true }, { force }),
    ];
    if (includeArchive) {
      fetches.push(
        fetchChatHistoryList(apiFetch, { scope: 'archived' }, { force }),
        fetchChatHistoryList(apiFetch, { scope: 'trashed' }, { force }),
      );
    }
    const results = await Promise.all(fetches);
    const [activeResult, tempResult, archivedResult, trashedResult] = results;
    if (!activeResult?.ok) {
      setHistoryLoadError(activeResult.message || 'Could not load saved chats.');
      return null;
    }
    setHistoryLoadError('');
    const history = activeResult.conversations;
    const temps = tempResult?.ok ? tempResult.conversations : [];
    setChatHistory(history);
    setTemporaryHistory(Array.isArray(temps) ? temps : []);
    if (includeArchive) {
      setArchivedHistory(archivedResult?.ok ? archivedResult.conversations : []);
      setTrashedHistory(trashedResult?.ok ? trashedResult.conversations : []);
    }
    const activeId = activeConversationIdRef.current;
    const active = history.find((item) => String(item.id) === String(activeId))
      || (Array.isArray(temps) ? temps.find((item) => String(item.id) === String(activeId)) : null);
    if (active?.expiresAt && active.isTemporary) {
      setTemporaryExpiresAt(active.expiresAt);
    }
    return {
      active: history,
      temporary: temps,
      archived: archivedResult?.ok ? archivedResult.conversations : undefined,
      trashed: trashedResult?.ok ? trashedResult.conversations : undefined,
    };
  }, [user?.email, isGuest]);

  /** Faster sidebar sync after each message — skips archive/trash round-trips. */
  const syncHistoryAfterSend = useCallback(async () => {
    if (!user?.email || isGuest) return;
    const [activeResult, tempResult] = await Promise.all([
      fetchChatHistoryList(apiFetch, { scope: 'active' }),
      fetchChatHistoryList(apiFetch, { temporary: true }),
    ]);
    if (activeResult.ok) setChatHistory(activeResult.conversations);
    if (tempResult.ok) setTemporaryHistory(tempResult.conversations);
    if (!activeResult.ok) {
      setHistoryLoadError(activeResult.message || 'Could not refresh chat list.');
    }
  }, [user?.email, isGuest]);

  const resumedVideoJobIdsRef = useRef(new Set());

  const resumeVideoJob = useCallback(async (jobId, { assistantIndex: resumeAssistantIndex } = {}) => {
    if (!jobId || isSending) return;
    setIsSending(true);
    setChatError('');
    const controller = new AbortController();
    activeRequest.current = controller;
    const index = Number.isInteger(resumeAssistantIndex)
      ? resumeAssistantIndex
      : messages.length;
    try {
      const finalVideo = await pollVideoJob(jobId, {
        signal: controller.signal,
        onUpdate: (job) => {
          setMessages((current) => {
            if (!current.length) return current;
            const copy = [...current];
            const target = copy[index];
            if (!target) return current;
            copy[index] = {
              ...target,
              role: 'assistant',
              generatingVideo: true,
              text: `${formatVideoJobStatus(job.status)}…`,
              videoJobStatus: job.status,
              videoJobId: job.jobId || jobId,
            };
            return copy;
          });
        },
      });
      const answer = buildAssistantVideoMessage(finalVideo, {
        conversationId: activeConversationIdRef.current,
      });
      setMessages((current) => {
        const copy = [...current];
        if (copy[index]) copy[index] = answer;
        else copy.push(answer);
        if (activeConversationIdRef.current) {
          void apiFetch(`/api/chat/history/${activeConversationIdRef.current}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: normalizeConversationMessages(copy) }),
          }).then(() => refreshHistory()).catch(() => {});
        }
        return copy;
      });
      setActiveVideoJobs((current) => current.filter((job) => job.jobId !== jobId && job.id !== jobId));
    } catch (error) {
      if (error.name !== 'AbortError') {
        setChatError(error.message || videoNetworkErrorMessage(error));
      }
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      setIsSending(false);
      videoSubmitLockRef.current = false;
    }
  }, [isSending, messages.length, refreshHistory, temporaryChat]);

  useEffect(() => {
    if (isSending || !activeConversationId || !messages.length) return undefined;
    const pending = messages.find(
      (message) => message.role === 'assistant'
        && message.videoJobId
        && message.generatingVideo
        && !message.videoUrl,
    );
    if (!pending?.videoJobId || resumedVideoJobIdsRef.current.has(pending.videoJobId)) {
      return undefined;
    }
    resumedVideoJobIdsRef.current.add(pending.videoJobId);
    const index = messages.indexOf(pending);
    void resumeVideoJob(pending.videoJobId, { assistantIndex: index });
    return undefined;
  }, [activeConversationId, isSending, messages, resumeVideoJob]);

  useEffect(() => {
    if (selectedSkill !== 'image') return undefined;
    let active = true;
    void fetchImageGenerationStatus().then((status) => {
      if (active) setImageProviderStatus(status);
    });
    return () => { active = false; };
  }, [selectedSkill]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);

  useEffect(() => {
    messagesCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeConversationId || isGuest) return;
      const revealedIds = await fetchAnoninRevealedIds(activeConversationId);
      if (cancelled || !revealedIds.length) return;
      setMessages((current) => current.map((message) => (
        message.id && revealedIds.includes(message.id)
          ? { ...message, anoninRevealed: true }
          : message
      )));
    })();
    return () => { cancelled = true; };
  }, [activeConversationId, isGuest]);

  useEffect(() => {
    activeProjectRef.current = activeProject;
  }, [activeProject]);

  const persistActiveProjectId = useCallback((project) => {
    safeStorageSet('localStorage', 'allmodelai_active_project_id', project?.id || '');
  }, []);

  const updateChatMeta = useCallback((conversationId, patch) => {
    if (!conversationId) return;
    setChatMeta((current) => {
      const next = {
        ...current,
        [conversationId]: { ...current[conversationId], ...patch },
      };
      safeStorageSet('localStorage', 'allmodelai_chat_meta', JSON.stringify(next));
      return next;
    });
  }, []);

  const removeChatMeta = useCallback((conversationId) => {
    if (!conversationId) return;
    setChatMeta((current) => {
      if (!current[conversationId]) return current;
      const next = { ...current };
      delete next[conversationId];
      safeStorageSet('localStorage', 'allmodelai_chat_meta', JSON.stringify(next));
      return next;
    });
  }, []);

  const linkConversationToProject = useCallback((conversationId) => {
    const projectId = activeProjectRef.current?.id;
    if (!conversationId || !projectId) return;
    updateChatMeta(conversationId, { projectId });
  }, [updateChatMeta]);

  const openConversation = useCallback(async (conversation) => {
    if (!conversation?.id) return;
    let resolved = conversation;
    const needsFetch = !Array.isArray(resolved.messages)
      || (!resolved.messages.length && Number(resolved.messageCount) > 0);
    if (needsFetch) {
      const loaded = await fetchChatConversation(apiFetch, resolved.id);
      if (!loaded.ok) {
        setChatError(loaded.message || 'Could not open this conversation.');
        setHistoryLoadError(loaded.message || '');
        return;
      }
      resolved = loaded.conversation;
      setChatHistory((current) => current.map((item) => (
        String(item.id) === String(resolved.id) ? { ...item, ...resolved } : item
      )));
    }
    const isTemp = Boolean(resolved?.isTemporary || resolved?.temporary);
    setTemporaryChat(isTemp);
    setTemporaryExpiresAt(isTemp ? (resolved.expiresAt || resolved.expires_at || null) : null);
    if (!isTemp) {
      const projectId = chatMeta[conversation.id]?.projectId;
      let project = projectId ? projects.find((item) => item.id === projectId) : null;
      if (!project && activeProject) {
        updateChatMeta(conversation.id, { projectId: activeProject.id });
        project = activeProject;
      }
      setActiveProject(project || null);
      persistActiveProjectId(project || null);
    } else {
      setActiveProject(null);
    }
    setActiveConversationId(resolved.id);
    activeConversationIdRef.current = resolved.id;
    setMessages(normalizeConversationMessages(resolved.messages || []));
    setSelectedSlug(validModelSlug(resolved.model));
    setPrompt('');
    setChatError('');
    setChatMenuId(null);
    setSidebarOpen(false);
  }, [activeProject, chatMeta, projects, updateChatMeta, persistActiveProjectId]);

  useEffect(() => {
    linkConversationToProject(activeConversationId);
  }, [activeConversationId, activeProject?.id, linkConversationToProject]);

  useEffect(() => {
    const el = composerInputRef.current;
    if (!el) return;
    el.style.setProperty('color', '#ffffff', 'important');
    el.style.setProperty('-webkit-text-fill-color', '#ffffff', 'important');
    el.style.setProperty('opacity', '1', 'important');
    el.style.setProperty('opacity', '1', 'important');
    el.style.setProperty('caret-color', '#c4b5fd', 'important');
    document.documentElement.style.setProperty('--composer-text', '#ffffff');
  }, [prompt, isSending, selectedSkill, attachedImage]);

  useEffect(() => {
    const el = composerInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt, selectedSkill, attachedImage, isSending]);

  useEffect(() => {
    if (!composerMenuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setComposerMenuOpen(false);
    };
    const onPointerDown = (event) => {
      if (composerShellRef.current && !composerShellRef.current.contains(event.target)) {
        setComposerMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [composerMenuOpen]);

  const composerPlaceholder = useMemo(() => {
    if (selectedSkill === 'file' && !isSending) {
      return 'For example: create a Python script, an HTML page, or a project plan in Markdown...';
    }
    if (isSending) {
      if (selectedSkill === 'image') return 'Generating image…';
      if (selectedSkill === 'web') return 'Searching the web…';
      return 'You can type your next message while the answer is being generated…';
    }
    if (attachedImage) return 'Ask anything about this screenshot (e.g. "What do you see?")';
    if (selectedSkill === 'image') {
      return 'Describe the image and press Send — for example: a golden dragon with purple lightning…';
    }
    if (selectedSkill === 'video') return 'Describe the video you want to create...';
    if (selectedSkill === 'web') return 'What do you want to find on the internet?';
    if (selectedSkill === 'deep-research') return 'What should Deep Research investigate?';
    return 'Ask AllModelAI anything...';
  }, [attachedImage, isSending, selectedSkill]);

  const composerStatusText = useMemo(() => {
    if (selectedSkill === 'web') return 'Web search enabled';
    if (selectedSkill === 'image' && isSending) return 'Generating image…';
    if (selectedSkill === 'image') return 'Image mode — describe and send';
    if (selectedSkill === 'deep-research') return 'Deep Research — ask your research question';
    if (selectedSkill === 'file') return 'Create file mode';
    if (selectedSkill === 'video') return 'Video mode';
    if (voiceInputState === 'requesting') return 'Allow microphone access...';
    if (isListening) return t('Listening…');
    if (isSending) return t('Generating — you can keep typing');
    if (attachedImage) return t('Screenshot ready to send');
    return `${selectedModel.name} · ${t('Ready · replies in your language')}`;
  }, [attachedImage, isListening, isSending, selectedModel.name, selectedSkill, t, voiceInputState]);

  const modelIsOnline = (slug) => {
    if (isAnoninModelSlug(slug)) return true;
    return resolveModelOnlineStatus(slug, modelStatus);
  };

  const modelVersionAllowed = (slug, variantId) => canUseChatModel(creditStatus, slug, variantId);
  const modelFamilyLocked = (slug) => {
    if (slug === 'smart' || isAnoninModelSlug(slug)) return !modelVersionAllowed(slug);
    if (slug === 'gemini') return false;
    return !isPaidPlanAccess(creditStatus);
  };

  const changeAccessMode = async (mode) => {
    if (!creditStatus?.canUseDeveloper || isSending || accessModeSaving) return;
    setAccessModeSaving(true);
    setChatError('');
    try {
      const response = await apiFetch('/api/access-mode', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const access = await response.json();
      if (!response.ok) throw new Error(access.message || 'Could not change the access mode.');
      setCreditStatus(normalizeCreditStatus(access) || access);
      globalThis.dispatchEvent(new CustomEvent('allmodelai:access-mode-updated', { detail: access }));
      if (!access.models.includes('all') && !modelVersionAllowed(selectedSlug, selectedVersion?.id)) {
        setSelectedSlug('gemini');
        setChosenVersions((prev) => {
          const next = { ...prev, gemini: '3.5-flash-lite' };
          safeStorageSet('localStorage', 'allmodelai_model_versions', JSON.stringify(next));
          return next;
        });
        safeStorageSet('localStorage', 'allmodelai_selected_model', 'gemini');
        navigate('/chat?model=gemini', { replace: true });
      }
      setModelMenuOpen(false);
    } catch (error) {
      setChatError(error.message);
    } finally {
      setAccessModeSaving(false);
    }
  };

  const openPlusSubscription = () => {
    openSubscribe(selectedSlug);
  };

  const chooseModel = (model, version) => {

    if (version) {
      const next = { ...chosenVersions, [model.slug]: version.id };
      setChosenVersions(next);
      if (!temporaryChat) {
        safeStorageSet('localStorage', 'allmodelai_model_versions', JSON.stringify(next));
      }
    }

    if (!modelVersionAllowed(model.slug, version?.id)) {
      openPremiumUpgrade(model, version);
      return;
    }
    const online = modelIsOnline(model.slug);
    setSelectedSlug(model.slug);
    // Temporary Chat must not overwrite the user's persistent model preference.
    if (!temporaryChat) {
      safeStorageSet('localStorage', 'allmodelai_selected_model', model.slug);
    }
    navigate(`/chat?model=${encodeURIComponent(model.slug)}`, { replace: true });
    if (model.slug === 'smart') {
      logger.action('Smart Router selected');
      logger.router('Chat mode selected', { provider: 'Smart Router' });
    } else if (model.slug === 'anonin') {
      logger.action('Anonin Model selected');
    } else {
      logger.action('Chat mode selected', { model: model.slug, version: version?.id });
      logger.router('Provider selected', { model: model.name, slug: model.slug, version: version?.name });
    }
    setChatError('');
    logger.router('Model selection updated', {
      model: model.slug,
      version: version?.id,
      online,
    });
    setModelMenuOpen(false);
  };

  const refreshModelStatus = useCallback(() => {
    apiFetch('/api/status/models')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.models || data?.providers) {
          setModelStatus(normalizeModelStatusMap(data?.models || {}, data?.providers || {}));
        }
        if (data?.variants) setVariantCatalog(mergeModelVariantCatalog(data.variants));
        else if (data) setVariantCatalog(mergeModelVariantCatalog({}));
      })
      .catch(() => {
        setVariantCatalog((current) => (Object.keys(current || {}).length ? current : mergeModelVariantCatalog({})));
      });
  }, []);

  useEffect(() => {
    refreshModelStatus();
    const onFocus = () => refreshModelStatus();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshModelStatus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const intervalId = window.setInterval(refreshModelStatus, 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(intervalId);
    };
  }, [refreshModelStatus]);

  useEffect(() => {
    if (modelMenuOpen) refreshModelStatus();
  }, [modelMenuOpen, refreshModelStatus]);

  useEffect(() => {
    const legacyVariantIds = {
      'claude-haiku-4.5': 'haiku',
      'claude-sonnet-4.6': 'sonnet',
      'claude-opus-4.1': 'opus',
      'claude-opus-4.6': 'opus',
    };
    setChosenVersions((previous) => {
      let changed = false;
      const next = { ...previous };
      Object.entries(variantCatalog).forEach(([slug, versions]) => {
        const storedId = next[slug];
        if (!storedId) {
          // Prefer GPT-4.1 Mini as the default GPT version when none is stored.
          const preferred = slug === 'gpt'
            ? (versions.find((item) => item.id === 'mini')?.id || versions[0]?.id)
            : versions[0]?.id;
          if (preferred) {
            next[slug] = preferred;
            changed = true;
          }
          return;
        }
        if (versions.some((item) => item.id === storedId)) return;
        const mapped = legacyVariantIds[storedId] || versions[0]?.id;
        if (mapped && versions.some((item) => item.id === mapped)) {
          next[slug] = mapped;
          changed = true;
        }
      });
      if (changed) {
        safeStorageSet('localStorage', 'allmodelai_model_versions', JSON.stringify(next));
      }
      return changed ? next : previous;
    });
  }, [variantCatalog]);

  useEffect(() => {
    document.documentElement.dataset.themePreference = themePreference;
    document.documentElement.dataset.theme = themePreference === 'auto'
      ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : themePreference;
  }, [themePreference]);

  useEffect(() => subscribeVoices(globalThis.speechSynthesis, setAvailableVoices), []);

  useEffect(() => () => {
    speechRecognition.current?.cancel();
    globalThis.speechSynthesis?.cancel?.();
  }, []);

  const speakText = (text) => {
    if (!globalThis.speechSynthesis?.speak || !globalThis.SpeechSynthesisUtterance) { setChatError('Speech playback is not supported in this browser.'); return; }
    globalThis.speechSynthesis.cancel?.();
    const cleanText = String(text || '')
      .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
      .replace(/https?:\/\/\S+/g, ' link ')
      .replace(/[#*_`>~-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanText) return;
    const utterance = new globalThis.SpeechSynthesisUtterance(cleanText);
    utterance.lang = speechLanguage;
    const voice = availableVoices.find((item) => item.name === selectedVoice)
      || availableVoices.find((item) => item.lang.toLowerCase().startsWith(speechLanguage.split('-')[0].toLowerCase()));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    globalThis.speechSynthesis?.cancel?.();
    setIsSpeaking(false);
  };

  const changeVoiceMode = () => {
    setVoiceMode((enabled) => {
      safeStorageSet('localStorage', 'allmodelai_voice_mode', String(!enabled));
      if (enabled) stopSpeaking();
      return !enabled;
    });
  };

  const toggleVoiceInput = () => {
    if (speechRecognition.current) { speechRecognition.current.stop(); return; }
    logger.action('Microphone activated', { language: speechLanguage });
    stopSpeaking();
    setChatError('');
    const draft = prompt.trimEnd();
    const combine = (text) => [draft, text].filter(Boolean).join(' ');
    const controller = createVoiceInput({
      language: speechLanguage,
      onState: (state) => {
        setVoiceInputState(state);
        if (state === 'idle') speechRecognition.current = null;
      },
      onText: (text) => setPrompt(combine(text)),
      onError: setChatError,
      onComplete: (text) => { if (voiceMode && !isSending) sendMessage(null, combine(text)); },
    });
    speechRecognition.current = controller;
    controller.start();
  };

  const conversationPreview = (conversation) => {
    if (conversation?.preview) {
      return String(conversation.preview).replace(/\s+/g, ' ').trim().slice(0, 54);
    }
    const firstUserMessage = conversation.messages?.find((message) => message.role === 'user');
    return String(firstUserMessage?.content ?? firstUserMessage?.text ?? conversation.title ?? 'Saved conversation').replace(/\s+/g, ' ').trim().slice(0, 54);
  };
  const matchesHistoryQuery = useCallback((conversation) => {
    const haystack = `${conversation.title} ${conversationPreview(conversation)} ${(conversation.messages || []).map((message) => message.text || message.content || '').join(' ')} ${(Array.isArray(chatMeta[conversation.id]?.tags) ? chatMeta[conversation.id].tags : []).join(' ')}`.toLowerCase();
    return haystack.includes(historyQuery.toLowerCase());
  }, [chatMeta, historyQuery]);

  const belongsToActiveProject = useCallback((conversation) => {
    if (!activeProject) return true;
    const projectId = chatMeta[conversation.id]?.projectId;
    if (!projectId) return true;
    return projectId === activeProject.id;
  }, [activeProject, chatMeta]);

  const visibleHistory = useMemo(() => chatHistory
    .filter((conversation) => belongsToActiveProject(conversation) && matchesHistoryQuery(conversation))
    .sort((first, second) => Number(Boolean(chatMeta[second.id]?.pinned)) - Number(Boolean(chatMeta[first.id]?.pinned))),
  [belongsToActiveProject, chatHistory, chatMeta, matchesHistoryQuery]);

  const historyFeed = useMemo(() => {
    const rows = [];
    chatHistory.forEach((conversation) => {
      const messageList = conversation.messages || [];
      if (!messageList.length) {
        const text = String(conversation.preview || conversation.title || '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        rows.push({
          id: `${conversation.id}-0`,
          conversation,
          messageIndex: 0,
          text,
          title: conversation.title || conversationPreview(conversation),
          model: conversation.model,
          updatedAt: conversation.updatedAt || conversation.createdAt || '',
        });
        return;
      }
      messageList.forEach((message, messageIndex) => {
        if (message.role !== 'user') return;
        const text = String(message.content ?? message.text ?? '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        rows.push({
          id: `${conversation.id}-${messageIndex}`,
          conversation,
          messageIndex,
          text,
          title: conversation.title || conversationPreview(conversation),
          model: conversation.model,
          updatedAt: conversation.updatedAt || conversation.createdAt || '',
        });
      });
    });
    return rows.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  }, [chatHistory]);

  const visibleHistoryFeed = historyFeed.filter((item) => {
    const haystack = `${item.text} ${item.title} ${item.model}`.toLowerCase();
    return haystack.includes(historyFeedQuery.trim().toLowerCase());
  });

  useEffect(() => {
    if (!historyFeedOpen) return undefined;
    refreshHistory();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setHistoryFeedOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyFeedOpen, user?.email, refreshHistory]);
  const handleImageUpload = async (file) => {
    if (!file || imageUploadBusy) return;
    setImageUploadBusy(true);
    setChatError('');
    try {
      const prepared = await prepareChatImageAttachment(file);
      setAttachedImage({
        url: prepared.dataUrl,
        name: prepared.name,
        size: prepared.sizeLabel,
        type: prepared.type,
      });
      logger.action('Attachment selected', { name: prepared.name, type: prepared.type, sizeKb: prepared.sizeLabel });
    } catch (error) {
      setChatError(error.message || 'Could not prepare the image for upload.');
    } finally {
      setImageUploadBusy(false);
    }
  };

  const readFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(file.name)) {
      handleImageUpload(file);
      event.target.value = '';
      return;
    }
    if (file.size > 25 * 1024 * 1024) { setChatError('Files must be smaller than 25 MB.'); event.target.value = ''; return; }
    const textLike = /^(text\/|application\/(json|xml|javascript|csv))/.test(file.type) || /\.(txt|md|csv|json|js|jsx|ts|tsx|py|html|css)$/i.test(file.name);
    logger.action('Attachment selected', { name: file.name, type: file.type || 'unknown', sizeKb: Math.round(file.size / 1024), textLike });
    const content = textLike ? (await file.text()).slice(0, 12000) : `[Attached ${file.type || 'file'}: ${file.name}, ${(file.size / 1024).toFixed(1)} KB. Analyze it using available multimodal/file capabilities.]`;
    setPrompt((current) => `${current}${current ? '\n\n' : ''}[${file.name}]\n${content}`);
    event.target.value = '';
  };

  const handlePaste = (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          const file = new File([blob], `screenshot-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.png`, { type: blob.type });
          handleImageUpload(file);
          return;
        }
      }
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDraggingImage) setIsDraggingImage(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingImage(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingImage(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageUpload(file);
    }
  };

  const copyMessage = (text) => copyToClipboard(text);
  const shareMessage = async (text) => {
    try {
      if (!activeConversationId) { await copyMessage(text); return; }
      const response = await apiFetch(`/api/chat/history/${activeConversationId}/share`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not create sharing link');
      const url = new URL(data.url, window.location.origin);
      if (await copyToClipboard(`${window.location.origin}${url.pathname}`)) {
        setChatError('Read-only link copied to clipboard.');
      }
    } catch (error) { setChatError(error.message || 'Could not share this message.'); }
  };
  const mapFeedbackCategory = (reason) => {
    const value = String(reason || '').toLowerCase();
    if (value.includes('incorrect')) return 'incorrect';
    if (value.includes('not helpful') || value.includes('incomplete')) return 'incomplete';
    if (value.includes('outdated')) return 'incorrect';
    if (value.includes("didn't follow") || value.includes('instructions')) return 'off_topic';
    if (value.startsWith('other')) return 'other';
    return value ? 'other' : null;
  };

  const persistServerFeedback = (index, { rating, reasonCategory, correctionText }) => {
    void submitResponseFeedback({
      conversationId: activeConversationId,
      messageIndex: index,
      rating,
      reasonCategory,
      correctionText,
      modelSlug: selectedSlug,
      routedModel: messages[index]?.modelSlug || selectedSlug,
    }).catch(() => {});
  };

  const rateMessage = (index, rating) => {
    setMessageRatings((ratings) => {
      const next = { ...ratings };
      if (rating) next[index] = rating;
      else delete next[index];
      safeStorageSet('localStorage', 'allmodelai_message_ratings', JSON.stringify(next));
      return next;
    });
    if (rating === 'up') {
      setMessageLikes((likes) => {
        const next = { ...likes, [index]: true };
        safeStorageSet('localStorage', 'allmodelai_message_likes', JSON.stringify(next));
        return next;
      });
      persistServerFeedback(index, { rating: 'up' });
      setFeedbackMessageIndex(index);
      setFeedbackText('');
      setFeedbackModalOpen(true);
    }
  };
  const setFeedbackReason = (index, reason) => {
    setMessageFeedback((feedback) => {
      const next = { ...feedback };
      if (reason) next[index] = reason;
      else delete next[index];
      safeStorageSet('localStorage', 'allmodelai_message_feedback', JSON.stringify(next));
      return next;
    });
    if (reason) {
      persistServerFeedback(index, {
        rating: 'down',
        reasonCategory: mapFeedbackCategory(reason),
        correctionText: reason,
      });
    }
  };
  const submitFeedback = () => {
    if (feedbackMessageIndex === null) return;
    const text = feedbackText.trim();
    if (!text) { setFeedbackModalOpen(false); return; }
    setMessageFeedback((feedback) => {
      const next = { ...feedback, [feedbackMessageIndex]: text };
      safeStorageSet('localStorage', 'allmodelai_message_feedback', JSON.stringify(next));
      return next;
    });
    setFeedbackModalOpen(false);
    setFeedbackText('');
  };
  const toggleFavorite = (text, modelSlug = selectedSlug) => {
    setFavorites((current) => {
      const existing = current.some((item) => item.text === text);
      const next = existing
        ? current.filter((item) => item.text !== text)
        : [{ id: Date.now().toString(), text, modelSlug, createdAt: new Date().toISOString() }, ...current].slice(0, 30);
      safeStorageSet('localStorage', 'allmodelai_favorites', JSON.stringify(next));
      return next;
    });
  };
  const editSystemInstructions = () => {
    const current = safeStorageGet('localStorage', 'allmodelai_system_instructions') || '';
    const value = window.prompt('How should AI behave in every chat?', current);
    if (value === null) return;
    safeStorageSet('localStorage', 'allmodelai_system_instructions', value.trim().slice(0, 2000));
    logger.action('AI instructions updated', { length: value.trim().length });
  };
  const branchCurrentConversation = async () => {
    if (!activeConversationId || !messages.length) return;
    const response = await apiFetch(`/api/chat/history/${activeConversationId}/branch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageCount: messages.length, model: selectedSlug }) });
    const branch = await response.json().catch(() => null);
    if (!response.ok || !branch) { setChatError(branch?.message || 'Could not create a conversation branch.'); return; }
    setChatHistory((current) => [branch, ...current]);
    openConversation(branch);
  };
  const backupWorkspace = () => {
    const local = {};
    try {
      const storage = globalThis.localStorage;
      for (let index = 0; index < (storage?.length || 0); index += 1) {
        const key = storage.key(index);
        if (key?.startsWith('allmodelai_')) local[key] = safeStorageGet('localStorage', key);
      }
    } catch { /* Chat history can still be exported when Safari blocks storage. */ }
    const content = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), conversations: chatHistory, local }, null, 2);
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'application/json' })); link.download = 'allmodelai-backup.json'; link.click(); URL.revokeObjectURL(link.href);
    logger.action('Backup workspace', { conversations: chatHistory.length });
  };
  const regenerateResponse = async (index) => {
    if (isSending) return;
    const previousUserMessage = messages.slice(0, index).reverse().find((message) => message.role === 'user');
    if (!previousUserMessage) return;
    const cutIndex = messages.slice(0, index).findLastIndex((message) => message.role === 'user');
    const attachment = previousUserMessage.imageUrl || previousUserMessage.image
      ? { url: previousUserMessage.imageUrl || previousUserMessage.image }
      : null;
    setRegeneratingMessageIndex(index);
    try {
      await sendMessage(
        null,
        previousUserMessage.content ?? previousUserMessage.text ?? '',
        messages.slice(0, cutIndex),
        attachment,
      );
    } finally {
      setRegeneratingMessageIndex(null);
    }
  };
  const exportAssistantMessage = (message, modelName) => {
    const body = message.content ?? message.text ?? '';
    const content = `${modelName}:\n${body}`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    link.download = `allmodelai-response-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const editMessage = (index) => {
    const message = messages[index];
    setEditingMessageIndex(index);
    setEditDraft(message.content ?? message.text ?? '');
    setChatError('');
  };

  const exportConversation = () => {
    const content = messages.map((message) => `${message.role === 'user' ? 'You' : selectedModel.name}:\n${message.content ?? message.text ?? ''}`).join('\n\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); link.download = `${conversationPreview({ messages }) || 'allmodelai-chat'}.txt`; link.click(); URL.revokeObjectURL(link.href);
    logger.action('Export chat', { messages: messages.length, model: selectedSlug });
  };

  useEffect(() => {
    const container = messagesContainer.current;
    if (!container) return;
    const onScroll = () => {
      stickToBottomRef.current = isNearScrollBottom(container, 140);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const container = messagesContainer.current;
    if (!container || !stickToBottomRef.current) return;
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight, behavior: isSending ? 'smooth' : 'auto' });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isSending]);

  useEffect(() => {
    if (!user?.email || isGuest) return;
    apiFetch(`/api/credits?email=${encodeURIComponent(user.email)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((status) => {
        if (!status) return;
        const normalized = normalizeCreditStatus(status) || status;
        setCreditStatus(normalized);
        setSelectedSlug((current) => normalized.models.includes('all') || normalized.models.includes(current) || current === 'smart' ? current : 'gemini');
      })
      .catch(() => setCreditStatus(null));
  }, [user?.email, isGuest]);

  useEffect(() => {
    const onAccessModeUpdated = (event) => {
      const next = normalizeCreditStatus(event.detail) || event.detail;
      if (!next) return;
      setCreditStatus(next);
    };
    globalThis.addEventListener('allmodelai:access-mode-updated', onAccessModeUpdated);
    return () => globalThis.removeEventListener('allmodelai:access-mode-updated', onAccessModeUpdated);
  }, []);

  useEffect(() => {
    const subscribeSuccess = searchParams.get('subscribe');
    const sessionId = searchParams.get('session_id');
    if (subscribeSuccess !== 'success' || !sessionId || !user?.email || isGuest) return;

    (async () => {
      try {
        const verifyRes = await apiFetch(`/api/payments/session/${encodeURIComponent(sessionId)}`);
        if (!verifyRes.ok) throw new Error('Payment verification failed');
        const creditsRes = await apiFetch(`/api/credits?email=${encodeURIComponent(user.email)}`);
        if (creditsRes.ok) setCreditStatus(await creditsRes.json());
        setSubscribeModalOpen(false);
        logger.success('Subscription activated via Stripe');
      } catch (error) {
        setSubscribeError(error.message);
      } finally {
        navigate('/chat', { replace: true });
      }
    })();
  }, [searchParams, user?.email, isGuest, navigate]);

  useEffect(() => {
    if (!subscribeModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [subscribeModalOpen]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const root = document.querySelector('.chat-page');
    if (!root || !isMobileSidebarViewport()) return undefined;

    const syncHeaderOffset = () => {
      const header = root.querySelector('.chat-header');
      const height = header?.getBoundingClientRect().height ?? 0;
      root.style.setProperty('--chat-mobile-header-offset', `${Math.ceil(height)}px`);
    };

    syncHeaderOffset();
    root.classList.toggle('sidebar-drawer-open', sidebarOpen);
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncHeaderOffset)
      : null;
    const header = root.querySelector('.chat-header');
    observer?.observe(header ?? root);
    globalThis.addEventListener('resize', syncHeaderOffset);
    return () => {
      root.classList.remove('sidebar-drawer-open');
      observer?.disconnect();
      globalThis.removeEventListener('resize', syncHeaderOffset);
    };
  }, [sidebarOpen, isMobileSidebarViewport]);

  useEffect(() => {
    if (!sidebarOpen || !isMobileSidebarViewport()) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeSidebar();
      sidebarToggleRef.current?.focus();
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen, closeSidebar, isMobileSidebarViewport]);

  useEffect(() => {
    if (!subscribeModalOpen || isGuest) return undefined;
    let cancelled = false;
    (async () => {
      setSubscribeError('');
      try {
        const configRes = await apiFetch('/api/payments/config');
        const config = configRes.ok ? await configRes.json() : {};
        if (cancelled) return;
        setPrimaryPaymentProvider(config.primaryProvider || null);
        setWayforpayTestMode(Boolean(config.wayforpayTestMode));
        if (config.wayforpayDefaultCurrency) {
          setWayforpayCurrency(config.wayforpayDefaultCurrency);
        }
        if (config.primaryProvider === 'stripe' && !config.stripeConfiguration?.ok) {
          setSubscribeError(formatPaymentError(config, t('Secure checkout is temporarily unavailable.')));
        }
      } catch {
        if (!cancelled) setSubscribeError(t('Secure checkout is temporarily unavailable.'));
      } finally {
        if (!cancelled) setPaymentsConfigLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [subscribeModalOpen, isGuest, t]);

  useEffect(() => {
    if (!user?.email || isGuest || !sessionVerified) return;
    let cancelled = false;
    (async () => {
      const lists = await refreshHistory();
      if (cancelled || !lists) return;
      const list = lists.active;
      const requestedId = new URLSearchParams(window.location.search).get('conversation');
      const requested = requestedId
        ? list.find((item) => String(item.id) === String(requestedId))
        : null;
      const latest = list[0];
      const conversation = requested || latest;
      const allowBootstrap = shouldBootstrapOpenConversation({
        hasBootstrapped: historyBootstrappedRef.current,
        activeId: activeConversationIdRef.current,
        isSending: isSendingRef.current,
        localMessageCount: messagesCountRef.current,
        requestedId,
        historyFirstId: latest?.id || null,
      });
      historyBootstrappedRef.current = true;
      if (!allowBootstrap || !conversation) return;
      if (!(conversation.messageCount > 0 || conversation.messages?.length)) return;
      const loaded = conversation.messages?.length
        ? { ok: true, conversation }
        : await fetchChatConversation(apiFetch, conversation.id);
      if (cancelled || !loaded.ok) return;
      const full = loaded.conversation;
      activeConversationIdRef.current = full.id;
      setActiveConversationId(full.id);
      setMessages(normalizeConversationMessages(full.messages || []));
      setSelectedSlug(validModelSlug(full.model));
    })();
    return () => { cancelled = true; };
  }, [user?.email, isGuest, sessionVerified, refreshHistory]);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const finishSidebarResize = useCallback(() => {
    if (!sidebarResizeActiveRef.current) return;
    sidebarResizeActiveRef.current = false;
    setSidebarResizing(false);
    document.body.classList.remove('chat-sidebar-resizing');
    safeStorageSet('localStorage', SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidthRef.current));
  }, []);

  useEffect(() => {
    if (!sidebarResizing) return undefined;

    const onMove = (event) => {
      const next = Math.round(
        Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, event.clientX))
      );
      setSidebarWidth(next);
    };

    const onUp = () => finishSidebarResize();

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [sidebarResizing, finishSidebarResize]);

  if (!user) return <Navigate to="/" replace />;

  async function runWebOrDeepResearchStream({
    text,
    nextMessages,
    assistantIndex,
    isDeepResearch,
    startedConversationId,
    controller,
    requestStartedAt,
    clarificationAnswers = null,
    skipClarification = false,
  }) {
    let assistantText = '';
    let webSources = [];
    let webSearchComplete = false;
    let researchMeta = null;
    setIsStreamingResponse(false);
    setMessages((current) => current.map((message, index) => (
      index === assistantIndex
        ? {
          ...message,
          text: '',
          webSearching: true,
          deepResearch: isDeepResearch,
          deepResearchClarification: null,
          deepResearchError: null,
          webSearchStatus: isDeepResearch ? 'understanding' : 'searching',
          deepResearchLabel: isDeepResearch ? 'Understanding your goal' : undefined,
          researchDepth: isDeepResearch ? researchDepth : undefined,
        }
        : message
    )));

    const webSearchQueryPreview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
    const loggedWebStages = new Set();
    const logWebStage = (stage, meta) => {
      if (loggedWebStages.has(stage)) return;
      loggedWebStages.add(stage);
      logger.search(stage, meta);
    };
    logger.group(`${isDeepResearch ? '🔎' : '🌐'} AllModelAI ${isDeepResearch ? 'Deep Research' : 'Web Search'} · ${webSearchQueryPreview}`, () => {
      logWebStage('Search enabled');
      logger.search('Query', { query: webSearchQueryPreview });
      logWebStage('Request started');
    });

    const researchResponse = await apiFetch('/api/research/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: text,
        model: selectedSlug === 'smart' ? 'gemini' : selectedSlug,
        ...(isDeepResearch ? {
          deepResearch: true,
          depth: researchDepth,
          clarificationAnswers,
          skipClarification,
          useKnowledge: useKnowledgeBase,
        } : {}),
      }),
      signal: controller.signal,
    });

    if (researchResponse.status === 404) {
      logger.search('Dedicated route unavailable — falling back to chat web search');
      return { webSearchViaChat: true, assistantText, webSources, webSearchComplete };
    }

    await checkChatResponse(researchResponse);

    if (isDeepResearch) {
      const streamResult = await consumeDeepResearchStream(researchResponse, {
        signal: controller.signal,
        onEvent: (event) => {
          if (event.researchEvent) logWebStage(event.researchEvent, { count: event.sourceCount ?? event.count });
          setMessages((current) => current.map((message, index) => (
            index === assistantIndex
              ? applyDeepResearchSseEvent(message, event)
              : message
          )));
          if (event.text) setIsStreamingResponse(true);
        },
      });
      assistantText = streamResult.assistantText;
      webSources = streamResult.webSources;
      webSearchComplete = streamResult.webSearchComplete;
      researchMeta = streamResult.researchMeta;
    } else {
      if (researchResponse.headers.get('content-type')?.includes('application/json')) {
        const errorData = await researchResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Could not search the web.');
      }
      const reader = researchResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.replaceAll('\r\n', '\n').split('\n\n');
        buffer = events.pop() || '';
        for (const eventData of events) {
          const dataLine = eventData.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine || dataLine.slice(6) === '[DONE]') continue;
          const event = JSON.parse(dataLine.slice(6));
          if (event.error) throw new Error(event.message || event.error);
          if (event.code && event.message) throw new Error(event.message);
          if (event.webSearchStatus || event.deepResearchStage) {
            const status = event.deepResearchStage || event.webSearchStatus;
            setMessages((current) => current.map((message, index) => (
              index === assistantIndex
                ? {
                  ...message,
                  webSearchStatus: status,
                  deepResearchLabel: event.deepResearchLabel || message.deepResearchLabel,
                  webSearchCount: event.count ?? message.webSearchCount,
                }
                : message
            )));
          }
          if (event.text) {
            assistantText += event.text;
            setIsStreamingResponse(true);
            setMessages((current) => current.map((message, index) => (
              index === assistantIndex
                ? { ...message, text: (message.text || '') + event.text, webSearching: false }
                : message
            )));
          }
          if (Array.isArray(event.webSources)) webSources = event.webSources;
          if (event.webSearchComplete === true && webSources.length) webSearchComplete = true;
        }
        if (done) break;
      }
    }

    const researchFinal = finalizeAssistantMessage(
      {
        text: assistantText || '',
        modelSlug: selectedSlug,
        webSearching: false,
        webSearchStatus: null,
        webSources,
        webSearchComplete,
        deepResearch: isDeepResearch,
        deepResearchLabel: null,
        researchMeta: researchMeta || undefined,
        researchDepth: isDeepResearch ? researchDepth : undefined,
        clarificationAnswers: clarificationAnswers || undefined,
      },
      { userText: text, enabled: aiStickersEnabled },
    );

    setMessages((current) => current.map((message, index) => (
      index === assistantIndex
        ? { ...message, ...researchFinal, text: researchFinal.text || message.text }
        : message
    )));

    {
      let conversationId = activeConversationId;
      if (!conversationId) {
        const historyResponse = await apiFetch('/api/chat/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            model: selectedSlug,
            messages: nextMessages,
            temporary: Boolean(temporaryChat),
          }),
        });
        if (historyResponse.ok) {
          const conversation = await historyResponse.json();
          conversationId = conversation.id;
          if (activeConversationIdRef.current === startedConversationId) {
            activeConversationIdRef.current = conversation.id;
            setActiveConversationId(conversation.id);
          }
          if (temporaryChat || conversation.isTemporary) {
            setTemporaryExpiresAt(conversation.expiresAt || temporaryExpiresAt);
            setTemporaryHistory((history) => [conversation, ...history.filter((item) => String(item.id) !== String(conversation.id))]);
          } else {
            setChatHistory((history) => [conversation, ...history]);
          }
        }
      }
      if (conversationId) {
        await apiFetch(`/api/chat/history/${conversationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            messages: [...nextMessages, {              role: 'assistant',
              text: researchFinal.text,
              modelSlug: selectedSlug,
              ...stickerFieldsForPersist(researchFinal),
              webSources,
              webSearchComplete,
              deepResearch: isDeepResearch,
              researchMeta,
              researchDepth: isDeepResearch ? researchDepth : undefined,
              clarificationAnswers,
            }],
          }),
        });
        await refreshHistory();
      }
    }

    setSelectedSkill(null);
    if (voiceMode && assistantText) speakText(assistantText);
    logger.searchSuccess('Search completed', { sources: webSources.length });
    logger.success('Assistant response completed', {
      mode: isDeepResearch ? 'deep-research' : 'web-search',
      durationMs: timingElapsed(requestStartedAt),
    });
    deepResearchPendingRef.current = null;
    return { webSearchViaChat: false, assistantText, webSources, webSearchComplete };
  }

  async function handleDeepResearchClarification(assistantIndex, answers, skipClarification) {
    const pending = deepResearchPendingRef.current;
    if (!pending || pending.assistantIndex !== assistantIndex) return;
    setIsSending(true);
    setChatError('');
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestStartedAt = timingNow();
    try {
      await runWebOrDeepResearchStream({
        text: pending.text,
        nextMessages: pending.nextMessages,
        assistantIndex,
        isDeepResearch: true,
        startedConversationId: pending.startedConversationId,
        controller,
        requestStartedAt,
        clarificationAnswers: answers,
        skipClarification,
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        setChatError(error.message || 'Deep Research failed.');
        setMessages((current) => current.map((message, index) => (
          index === assistantIndex
            ? { ...message, webSearching: false, deepResearchError: error.message }
            : message
        )));
      }
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      setIsStreamingResponse(false);
      setIsSending(false);
    }
  }

  const sendMessage = async (event, overrideText, overrideMessages, overrideAttachment, options = {}) => {
    event?.preventDefault();
    const rawText = String(overrideText ?? prompt).trim();
    const currentAttachment = overrideAttachment ?? attachedImage;
    const attachmentSnapshot = currentAttachment?.url ? { ...currentAttachment } : null;
    const hadImageAttachment = Boolean(attachmentSnapshot?.url);
    const text = rawText || (currentAttachment ? 'Analyze this screenshot: describe in detail what is shown here and give me step-by-step guidance on where to click and what to do.' : '');
    if (!text || isSending) return;
    if (usageLimitNotice?.resetAt && Date.parse(usageLimitNotice.resetAt) > Date.now()) return;
    const generatingFile = selectedSkill === 'file';
    const generatingVideo = !generatingFile && (options.forceVideo || selectedSkill === 'video');
    const generatingImage = !generatingFile && !generatingVideo && (options.forceImage || selectedSkill === 'image' || (!currentAttachment && /^(?:нарисуй|сгенерируй\s+(?:изображение|картинку|фото)|создай\s+(?:изображение|картинку)|draw|generate\s+(?:an?\s+)?(?:image|picture|photo)|намалюй|згенеруй\s+зображення)/i.test(rawText)));
    const userMessage = {
      role: 'user',
      text,
      content: text,
      ...(currentAttachment?.url ? { image: currentAttachment.url, imageUrl: currentAttachment.url } : {})
    };
    const nextMessages = [...(overrideMessages ?? messages), userMessage];
    const startedConversationId = activeConversationIdRef.current;
    setMessages(nextMessages);
    setPrompt('');
    setAttachedImage(null);
    setChatError('');
    setUsageLimitNotice(null);
    setIsSending(true);
    setIsStreamingResponse(false);
    const controller = new AbortController();
    activeRequest.current = controller;
    const streamDiagnostics = createChatStreamDiagnostics();
    const releaseComposerBusy = () => {
      setIsStreamingResponse(false);
      setIsSending(false);
      if (activeRequest.current === controller) activeRequest.current = null;
    };
    stickToBottomRef.current = true;
    const assistantIndex = nextMessages.length;
    const assistantMessageId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setMessages([...nextMessages, {
      id: assistantMessageId,
      role: 'assistant',
      text: generatingVideo ? 'Creating your video… This can take several minutes.' : generatingImage ? 'Generating image…' : hadImageAttachment ? 'Analyzing your screenshot with vision AI…' : selectedSkill === 'web' ? 'Searching the web…' : selectedSkill === 'deep-research' ? 'Starting Deep Research…' : '',
      content: generatingVideo ? 'Creating your video… This can take several minutes.' : generatingImage ? 'Generating image…' : hadImageAttachment ? 'Analyzing your screenshot with vision AI…' : selectedSkill === 'web' ? 'Searching the web…' : selectedSkill === 'deep-research' ? 'Starting Deep Research…' : '',
      modelSlug: selectedSlug,
      status: 'pending',
      createdAt: new Date().toISOString(),
      generatingFile,
      generatingVideo,
      generatingImage,
      visionAnalyzing: hadImageAttachment,
      webSearching: options.forceWebSearch || selectedSkill === 'web' || selectedSkill === 'deep-research',
      deepResearch: selectedSkill === 'deep-research',
    }]);

    const requestStartedAt = timingNow();
    logger.chat('Message submitted', {
      model: selectedSlug,
      skill: selectedSkill || 'chat',
      webSearch: selectedSkill === 'web',
      hasAttachment: Boolean(currentAttachment?.url),
      promptLength: text.length,
      temporaryChat,
    });
    if (selectedSlug === 'smart') {
      logger.router('Processing request', { webSearch: selectedSkill === 'web' });
    }

    try {
      if (isGuest) {
        const guestReply = `Guest preview: I received “${text.slice(0, 240)}”. Sign up or sign in to connect live AI models, save history, upload documents, generate images, and use the Arena.`;
        await new Promise((resolve) => setTimeout(resolve, 350));
        const guestFinal = finalizeAssistantMessage(
          { text: guestReply, modelSlug: selectedSlug, webSearching: false },
          { userText: text, enabled: aiStickersEnabled },
        );
        setMessages((current) => current.map((message, index) => (
          index === assistantIndex ? { ...message, ...guestFinal, text: guestFinal.text } : message
        )));
        setSelectedSkill(null);
        return;
      }
      let webSearchViaChat = false;
      if (selectedSkill === 'web' || selectedSkill === 'deep-research') {
        const isDeepResearch = selectedSkill === 'deep-research';
        if (isDeepResearch) {
          const clarify = await fetchResearchClarification(apiFetch, { query: text });
          if (!clarify.searchAvailable) {
            setMessages((current) => current.map((message, index) => (
              index === assistantIndex
                ? {
                  ...message,
                  webSearching: false,
                  deepResearch: true,
                  deepResearchError: 'Web research is temporarily unavailable.',
                }
                : message
            )));
            return;
          }
          if (clarify.needsClarification) {
            deepResearchPendingRef.current = {
              text,
              nextMessages,
              assistantIndex,
              startedConversationId,
            };
            setMessages((current) => current.map((message, index) => (
              index === assistantIndex
                ? {
                  ...message,
                  webSearching: false,
                  deepResearch: true,
                  deepResearchClarification: {
                    questions: clarify.questions,
                    topicTitle: clarify.topicTitle,
                  },
                }
                : message
            )));
            return;
          }
        }

        const streamResult = await runWebOrDeepResearchStream({
          text,
          nextMessages,
          assistantIndex,
          isDeepResearch,
          startedConversationId,
          controller,
          requestStartedAt,
        });
        webSearchViaChat = streamResult.webSearchViaChat;
        if (!webSearchViaChat) return;
      }
      if (generatingImage) {
        logger.action('Generate image', { promptLength: text.length });
        const imageStatus = await fetchImageGenerationStatus().catch(() => null);
        const requestedCount = options.imageCount || imageGenerationCount || 1;
        const imageData = await requestImageGeneration(
          buildImageRequestBody({
            prompt: text,
            quality: options.quality || imageGenerationQuality || 'hd',
            aspectRatio: options.aspectRatio || imageGenerationAspect || '1:1',
            count: requestedCount,
            style: options.style || 'auto',
            ...(imageStatus?.configured && imageStatus?.cloudflare ? { provider: 'cloudflare' } : {}),
          }),
          controller.signal,
          {
            onPoll: ({ polls, progress }) => {
              let imageStatusLabel = requestedCount > 1
                ? `Generating image 1 of ${requestedCount}…`
                : 'Generating your image…';
              if (progress?.completed != null && progress?.total) {
                imageStatusLabel = `Generated ${progress.completed} of ${progress.total} images…`;
              } else if (polls >= 5) {
                imageStatusLabel = requestedCount > 1
                  ? `Still generating your images (${requestedCount} requested)…`
                  : 'Still generating your image…';
              }
              setMessages((current) => current.map((message, index) => (
                index === assistantIndex
                  ? {
                    ...message,
                    text: imageStatusLabel,
                    generatingImage: true,
                    imageStatusLabel,
                    imageGenerationProgress: progress || null,
                    requestedImageCount: requestedCount,
                  }
                  : message
              )));
            },
          },
        );
        if (!imageData?.imageUrl) {
          throw new Error('The server did not return an image. Tap Retry to try again.');
        }
        const imageCount = imageData.images?.length || 1;
        const answer = {
          role: 'assistant',
          text: imageCount > 1 ? `Done! Here are your ${imageCount} images.` : 'Done! Here is your image.',
          imageUrl: imageData.imageUrl,
          images: imageData.images,
          requestedImageCount: requestedCount,
          partial: imageData.partial === true,
          imageGenerationWarning: imageData.warnings?.[0],
          imageQuality: imageData.quality,
          imageAspect: imageData.aspectRatio,
          imageSize: imageData.size,
          imageModel: imageData.model,
          imageMimeType: imageData.mimeType,
          upscaleSupported: imageData.upscaleSupported,
        };
        const stillOpen = () => activeConversationIdRef.current === startedConversationId;
        if (stillOpen()) setMessages([...nextMessages, answer]);
        if (!temporaryChat) {
          // The gallery is an optional device cache; storage limits must not discard a generated image.
          try {
            const cached = safeJSON(safeStorageGet('localStorage', 'allmodelai_image_gallery'), []);
            const gallery = Array.isArray(cached) ? cached : [];
            const galleryEntries = (imageData.images?.length ? imageData.images : [{ imageUrl: imageData.imageUrl }]).map((item, idx) => ({
              id: `${text.slice(0, 24)}-${idx}-${item.imageUrl.slice(-16)}`,
              prompt: text,
              imageUrl: item.imageUrl,
            }));
            safeStorageSet('localStorage', 'allmodelai_image_gallery', JSON.stringify([...galleryEntries, ...gallery].slice(0, 8)));
          } catch { /* The server history remains the durable copy. */ }
        }
        try {
          const saved = await apiFetch(startedConversationId ? `/api/chat/history/${startedConversationId}` : '/api/chat/history', {
            method: startedConversationId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: selectedSlug,
              messages: [...nextMessages, answer],
              temporary: Boolean(temporaryChat),
            }),
          });
          if (!saved.ok) throw new Error('save failed');
          const conversation = await saved.json();
          if (stillOpen() && !startedConversationId) {
            activeConversationIdRef.current = conversation.id;
            setActiveConversationId(conversation.id);
          }
          if (temporaryChat || conversation.isTemporary) {
            setTemporaryExpiresAt(conversation.expiresAt || temporaryExpiresAt);
          }
          void syncHistoryAfterSend();
        } catch {
          if (stillOpen() || !startedConversationId) setChatError('The image is ready, but saving history failed. Download the picture before closing the chat.');
        }
        releaseComposerBusy();
        logger.success('Assistant response completed', { mode: 'image', durationMs: timingElapsed(requestStartedAt) });
        return;
      }
      if (generatingVideo) {
        if (videoSubmitLockRef.current) {
          setChatError('A video job is already starting. Use “Resume video job” if the connection dropped.');
          return;
        }
        videoSubmitLockRef.current = true;
        logger.action('Generate video', { promptLength: text.length });
        const stillOpen = () => activeConversationIdRef.current === startedConversationId;
        const imageToVideo = options.videoMode === 'image-to-video' || videoMode === 'image-to-video';
        const referenceImage = imageToVideo
          ? (options.imageUrl
            || (videoUseLastImage ? lastAssistantImageUrl : '')
            || videoReferenceImage
            || '')
          : '';
        const { data: videoData } = await requestVideoGeneration(
          buildVideoRequestBody({
            prompt: text,
            aspectRatio: options.aspectRatio || videoAspectRatio,
            resolution: options.resolution || videoResolution,
            durationSeconds: options.durationSeconds || videoDurationSeconds,
            imageUrl: referenceImage,
            wait: options.wait === true,
            provider: options.provider || videoProvider,
            conversationId: startedConversationId || activeConversationIdRef.current || '',
          }),
          controller.signal,
        );
        if (videoData.jobId) rememberPendingVideoJobId(videoData.jobId);
        let finalVideo = videoData;
        if (finalVideo.jobId && finalVideo.status !== 'completed') {
          finalVideo = await pollVideoJob(finalVideo.jobId, {
            signal: controller.signal,
            onUpdate: (job) => {
              if (!stillOpen()) return;
              setMessages((current) => {
                if (!current.length) return current;
                const copy = [...current];
                const last = copy[copy.length - 1];
                if (!last?.generatingVideo) return current;
                copy[copy.length - 1] = {
                  ...last,
                  text: `${formatVideoJobStatus(job.status)}…`,
                  videoJobStatus: job.status,
                  creditsEstimated: job.creditsEstimated,
                  creditsCharged: job.creditsCharged,
                };
                return copy;
              });
            },
          });
        }
        const answer = buildAssistantVideoMessage(finalVideo, {
          conversationId: startedConversationId || activeConversationIdRef.current || '',
        });
        if (stillOpen()) setMessages([...nextMessages, answer]);
        try {
          const saved = await apiFetch(startedConversationId ? `/api/chat/history/${startedConversationId}` : '/api/chat/history', {
            method: startedConversationId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: selectedSlug,
              messages: [...nextMessages, answer],
              temporary: Boolean(temporaryChat),
            }),
          });
          if (!saved.ok) throw new Error('save failed');
          const conversation = await saved.json();
          if (stillOpen() && !startedConversationId) {
            activeConversationIdRef.current = conversation.id;
            setActiveConversationId(conversation.id);
          }
          if (temporaryChat || conversation.isTemporary) {
            setTemporaryExpiresAt(conversation.expiresAt || temporaryExpiresAt);
          }
          void syncHistoryAfterSend();
        } catch {
          if (stillOpen() || !startedConversationId) {
            setChatError('The video is ready, but saving history failed. Download it before closing the chat.');
          }
        }
        releaseComposerBusy();
        logger.success('Assistant response completed', { mode: 'video', durationMs: timingElapsed(requestStartedAt) });
        videoSubmitLockRef.current = false;
        setSelectedSkill(null);
        return;
      }
      let conversationId = activeConversationId;
      if (!conversationId) {
        const historyResponse = await apiFetch('/api/chat/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            model: selectedSlug,
            messages: nextMessages,
            temporary: Boolean(temporaryChat),
          }),
        });
        if (historyResponse.status === 401) await checkChatResponse(historyResponse);
        if (historyResponse.ok) {
          const conversation = await historyResponse.json();
          conversationId = conversation.id;
          const stillOnStartedThread = startedConversationId == null
            || String(activeConversationIdRef.current || '') === String(startedConversationId || '');
          if (stillOnStartedThread || activeConversationIdRef.current == null) {
            activeConversationIdRef.current = conversation.id;
            setActiveConversationId(conversation.id);
          }
          if (temporaryChat || conversation.isTemporary) {
            setTemporaryExpiresAt(conversation.expiresAt || temporaryExpiresAt);
            setTemporaryHistory((history) => [
              conversation,
              ...history.filter((item) => String(item.id) !== String(conversation.id)),
            ]);
          } else {
            setChatHistory((history) => [conversation, ...history.filter((item) => String(item.id) !== String(conversation.id))]);
          }
        }
      }

      const responseBelongsToOpenChat = (currentMessages) => conversationOwnsResponse({
        activeId: activeConversationIdRef.current,
        requestId: conversationId,
        startedId: startedConversationId,
        assistantMessageId,
        messages: currentMessages,
      });

      const applyAssistantPatch = (patch) => {
        setMessages((current) => {
          if (!responseBelongsToOpenChat(current)) return current;
          return patchAssistantMessage(current, { id: assistantMessageId, index: assistantIndex }, patch);
        });
      };

      const webSearchFlag = options.forceWebSearch || webSearchViaChat || selectedSkill === 'web' ? true : selectedSlug === 'smart' ? 'auto' : false;
      if (webSearchViaChat) {
        logger.search('Request started via chat fallback', { query: text.length > 120 ? `${text.slice(0, 120)}…` : text });
      }
      if (selectedSlug === 'smart') {
        logger.router('Sending request', { webSearch: webSearchFlag, responseMode: generatingFile ? 'file' : 'chat' });
      }

      const response = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseMode: generatingFile ? 'file' : 'chat',
          maxTokens: generatingFile ? 4096 : undefined,
          model: normalizeAnoninModelSlug(selectedSlug) || selectedSlug,
          variant: selectedVersion?.id,
          messages: nextMessages,
          userEmail: user.email,
          conversationId,
          temporary: temporaryChat,
          webSearch: webSearchFlag,
          webSearchFilters: webSearchFlag
            ? {
                topic: webSearchFilters.topic || 'general',
                days: webSearchFilters.days ? Number(webSearchFilters.days) : null,
                language: webSearchFilters.language || null,
                region: webSearchFilters.region || null,
              }
            : undefined,
          useKnowledge: useKnowledgeBase,
          routerMode: location.state?.routerMode || safeStorageGet('localStorage', 'allmodelai_router_mode') || 'balanced',
          responsePrefs: readResponsePrefs(typeof localStorage !== 'undefined' ? localStorage : null),
          systemInstructions: safeStorageGet('localStorage', 'allmodelai_system_instructions') || '',
          fallbackEnabled: !selectedVersion,
          assistantMessageId: isAnoninModelSlug(selectedSlug) ? assistantMessageId : undefined,
          anoninStrategy: isAnoninModelSlug(selectedSlug) ? anoninStrategy : undefined,
        }),
        signal: controller.signal,
      });

      await checkChatResponse(response);

      if (!response.body) throw new Error('The AI server did not return a stream.');

      if (response.headers.get('content-type')?.includes('application/json')) {
        const responseData = await response.json();
        const responseText = extractAssistantText(responseData) || responseData.message || '';
        if (generatingFile && !parseGeneratedFile(responseText)) setChatError('The model did not return a complete file. Retry in Create file mode or request a smaller file.');
        const jsonFinal = finalizeAssistantMessage(
          { id: assistantMessageId, text: responseText, modelSlug: selectedSlug },
          { userText: text, enabled: aiStickersEnabled },
        );
        applyAssistantPatch({
          text: jsonFinal.text,
          content: jsonFinal.text,
          aiSticker: jsonFinal.aiSticker,
          status: 'completed',
          webSearching: false,
        });
        streamDiagnostics.markComplete({ model: selectedSlug, chars: responseText.length, streaming: false });
        releaseComposerBusy();
        if (conversationId) {
          void apiFetch(`/api/chat/history/${conversationId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              messages: [...nextMessages, {
                id: assistantMessageId,
                role: 'assistant',
                text: jsonFinal.text,
                content: jsonFinal.text,
                modelSlug: selectedSlug,
                ...stickerFieldsForPersist(jsonFinal),
              }],
            }),
          }).then(() => syncHistoryAfterSend()).catch(() => {});
        } else {
          void syncHistoryAfterSend();
        }
        if (shouldShowBackgroundReplyNotice({
          belongsToOpenChat: responseBelongsToOpenChat(),
          hasAssistantText: Boolean(String(responseText || '').trim()),
        })) {
          setBackgroundNotification({ conversationId, title: `${selectedModel.name} replied`, text: responseText.slice(0, 140) || 'Your answer is ready.' });
        }
        if (voiceMode && !generatingFile) speakText(responseText);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let webSourcesForMessage = [];
      let routerGroupOpened = false;
      let fallbackProvider = null;
      let pendingStreamText = '';
      let streamRevealFrame = null;
      const flushStreamReveal = () => {
        streamRevealFrame = null;
        const chunkText = pendingStreamText;
        pendingStreamText = '';
        if (!chunkText) return;
        setIsStreamingResponse(true);
        setMessages((current) => {
          if (!responseBelongsToOpenChat(current)) return current;
          const target = current.find((message) => message?.role === 'assistant' && String(message.id || '') === String(assistantMessageId))
            || current[assistantIndex];
          const nextText = `${target?.text || ''}${chunkText}`;
          return patchAssistantMessage(current, { id: assistantMessageId, index: assistantIndex }, {
            text: nextText,
            content: nextText,
            status: 'streaming',
            webSearching: false,
          });
        });
      };
      const enqueueReveal = (chunkText) => {
        if (!chunkText) return;
        streamDiagnostics.markFirstToken({ model: selectedSlug });
        pendingStreamText += chunkText;
        if (streamRevealFrame == null) {
          streamRevealFrame = requestAnimationFrame(flushStreamReveal);
        }
      };
      const flushPendingStreamReveal = () => {
        if (streamRevealFrame != null) {
          cancelAnimationFrame(streamRevealFrame);
          streamRevealFrame = null;
        }
        flushStreamReveal();
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const parsed = splitChatSse(buffer, done);
        buffer = parsed.buffer;

        for (const eventData of parsed.data) {
          const event = JSON.parse(eventData);
          if (event.creditsRemaining !== undefined) {
            setCreditStatus((current) => ({
              ...current,
              ...event,
              remaining: event.creditsRemaining,
              aiCredits: {
                ...(current?.aiCredits || {}),
                enabled: true,
                balance: event.creditsRemaining,
              },
            }));
          }
          if (event.unlimited) setCreditStatus((current) => ({ ...current, ...event, unlimited: true }));
          if (event.routedModel) {
            streamDiagnostics.setProvider(event.routedModel);
            if (event.routedModel === 'ollama' || event.providerLabel === 'Ollama Cloud' || /^Ollama Cloud/i.test(String(event.routeDisplayName || ''))) {
              setModelStatus((current) => markModelOnline(current, 'ollama'));
            } else if (event.routedModel && event.actualModelId) {
              setModelStatus((current) => markModelOnline(current, event.routedModel));
            }
            if (selectedSlug !== 'smart' && !isAnoninModelSlug(selectedSlug) && event.actualModelId) {
              logger.router('Alternate model answering', { selected: selectedModel.name, actual: event.actualModelId });
            }
            if (selectedSlug === 'smart' && !routerGroupOpened) {
              routerGroupOpened = true;
              logger.group('🤖 AllModelAI Smart Router', () => {
                if (event.routeReason) logger.router('Intent detected', { intent: String(event.routeReason).slice(0, 80) });
                logger.router('Preferred provider', { provider: event.routedModel });
                if (event.actualModelId) logger.router('Model selected', { model: event.actualModelId });
                if (Array.isArray(event.knowledgeSources) && event.knowledgeSources.length) {
                  logger.router('Knowledge sources attached', { count: event.knowledgeSources.length });
                }
                if (webSearchFlag === true || webSearchFlag === 'auto') {
                  logger.router('Web Search required', { enabled: webSearchFlag === true ? true : 'auto' });
                }
              });
            } else if (selectedSlug === 'smart') {
              logger.router('Preferred provider', { provider: event.routedModel });
            }
          }
          if (event.fallback) {
            fallbackProvider = event.actualModel;
            logger.router(`${event.requestedModel} unavailable`);
            logger.router('Trying fallback', { provider: event.actualModel });
            if (!isAnoninModelSlug(selectedSlug)) {
              applyAssistantPatch({
                recoveryNotice: event.notice
                  || `Answered with ${event.actualModel} after the preferred model was unavailable.`,
                actualProviderModel: event.actualModel,
              });
            }
          }
          if (!isAnoninModelSlug(selectedSlug) && (event.router || event.knowledgeSources || event.routeDisplayName)) {
            applyAssistantPatch({
              router: event.router || {
                taskType: event.routeTaskType,
                reason: event.routeReason,
                selectedModel: event.routeDisplayName,
                fallbacks: event.routeFallbacks,
              },
              routeDisplayName: event.routeDisplayName,
              ...(event.knowledgeSources ? { knowledgeSources: event.knowledgeSources } : {}),
            });
          }
          if (isAnoninModelSlug(selectedSlug) && event.knowledgeSources) {
            applyAssistantPatch({ knowledgeSources: event.knowledgeSources });
          }
          if (isAnoninModelSlug(selectedSlug) && event.assistantMessageId && !event.anoninMode) {
            /* ignore leaked routing metadata */
          }
          if (event.agentProgress?.agent) {
            applyAssistantPatch({
              deepResearch: true,
              agentProgress: event.agentProgress,
              deepResearchLabel: event.agentProgress.summary,
            });
          }
          if (event.error) throw new Error(event.error);
          if (event.webSearchStatus) {
            applyAssistantPatch({
              webSearching: !['no_sources', 'search_unavailable', 'generating'].includes(event.webSearchStatus)
                || !assistantText,
              webSearchStatus: event.webSearchStatus,
              webSearchCount: event.count ?? undefined,
              webSearchPreviewSources: Array.isArray(event.sources) ? event.sources : undefined,
              webSearchRetrievedAt: event.retrievedAt || undefined,
              webSearchError: event.message || undefined,
            });
          }
          if (Array.isArray(event.webSources)) {
            webSourcesForMessage = event.webSources;
            if (event.webSources.length) {
              logger.search(`Results received: ${event.webSources.length}`, { count: event.webSources.length });
            }
            applyAssistantPatch({
              webSources: event.webSources,
              webSearchComplete: event.webSearchComplete === true && event.webSources.length > 0,
              webSearchUnavailable: event.webSearchComplete === false && event.webSearchStatus === 'no_sources',
              webSearchStatus: event.webSearchStatus || (event.webSearchComplete ? 'generating' : undefined),
              webSearchRetrievedAt: event.retrievedAt || undefined,
              webSearching: event.webSearchComplete !== true,
            });
          }
          const eventText = extractAssistantText(event);
          if (event.replace && eventText) {
            assistantText = eventText;
            applyAssistantPatch({ text: eventText, content: eventText, status: 'streaming' });
            continue;
          }
          const partialText = eventText;
          if (partialText) {
            assistantText += partialText;
            if (webSearchViaChat) {
              applyAssistantPatch({ webSearching: false, webSearchStatus: null });
            }
            enqueueReveal(partialText);
          }
        }

        if (done) break;
      }
      flushPendingStreamReveal();
      if (webSearchViaChat || selectedSkill === 'web' || options.forceWebSearch) {
        setSelectedSkill(null);
      }
      applyAssistantPatch({ webSearching: false, webSearchStatus: null });
      if (generatingFile && !parseGeneratedFile(assistantText)) setChatError('The model did not return a complete file. Retry in Create file mode or request a smaller file.');
      const streamFinal = !generatingFile && !generatingImage && !generatingVideo
        ? finalizeAssistantMessage(
          {
            id: assistantMessageId,
            text: assistantText,
            content: assistantText,
            modelSlug: selectedSlug,
            status: 'completed',
            ...(webSourcesForMessage.length ? { webSources: webSourcesForMessage, webSearchComplete: true } : {}),
          },
          { userText: text, enabled: aiStickersEnabled },
        )
        : null;
      if (streamFinal) {
        applyAssistantPatch({
          text: streamFinal.text,
          content: streamFinal.text,
          aiSticker: streamFinal.aiSticker,
          status: 'completed',
          ...(webSourcesForMessage.length ? { webSources: webSourcesForMessage, webSearchComplete: true } : {}),
        });
      } else if (assistantText) {
        applyAssistantPatch({
          text: assistantText,
          content: assistantText,
          status: 'completed',
          ...(webSourcesForMessage.length ? { webSources: webSourcesForMessage, webSearchComplete: true } : {}),
        });
      }
      streamDiagnostics.markComplete({
        model: selectedSlug,
        chars: assistantText.length,
        streaming: true,
      });
      releaseComposerBusy();
      const persistPayload = streamFinal ? {
        id: assistantMessageId,
        role: 'assistant',
        text: streamFinal.text,
        content: streamFinal.text,
        modelSlug: selectedSlug,
        ...stickerFieldsForPersist(streamFinal),
        ...(webSourcesForMessage.length ? { webSources: webSourcesForMessage, webSearchComplete: true } : {}),
      } : {
        id: assistantMessageId,
        role: 'assistant',
        text: assistantText,
        content: assistantText,
        modelSlug: selectedSlug,
        ...(webSourcesForMessage.length ? { webSources: webSourcesForMessage, webSearchComplete: true } : {}),
      };
      if (conversationId) {
        void apiFetch(`/api/chat/history/${conversationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            messages: [...nextMessages, persistPayload],
          }),
        }).then(() => syncHistoryAfterSend()).catch((error) => {
          logger.apiError('Conversation save failed', { message: error?.message || 'unknown' });
        });
      } else {
        void syncHistoryAfterSend();
      }
      if (voiceMode && !generatingFile) speakText(assistantText);
      if (shouldShowBackgroundReplyNotice({
        belongsToOpenChat: responseBelongsToOpenChat(),
        hasAssistantText: Boolean(String(assistantText || '').trim()),
      })) {
        setBackgroundNotification({ conversationId, title: `${selectedModel.name} replied`, text: assistantText.slice(0, 140) || 'Your answer is ready.' });
      }
      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`${selectedModel.name} finished`, { body: assistantText.slice(0, 120) || 'Your answer is ready.' });
      }
      if (fallbackProvider) logger.router(`${fallbackProvider} succeeded`);
      if (selectedSlug === 'smart') logger.router('Response completed');
      if (selectedSlug === 'ollama' || assistantText) {
        void refreshModelStatus();
      }
      logger.success('Assistant response completed', {
        mode: generatingFile ? 'file' : 'chat',
        durationMs: timingElapsed(requestStartedAt),
        chars: assistantText.length,
      });
    } catch (requestError) {
      if (requestError.name === 'AbortError') {
        streamDiagnostics.markAborted();
        setMessages((current) => current.filter((message, index) => index !== assistantIndex || String(message.text || message.content || '').trim()));
      } else {
        if (generatingImage && activeConversationIdRef.current === startedConversationId) setPrompt((current) => current || rawText);
        setSessionExpired(requestError.sessionExpired === true);
        const wasWebSearch = messages[assistantIndex]?.webSearching || messages[assistantIndex]?.webSearchStatus;
        const fallbackMessage = wasWebSearch
          ? 'Web search is temporarily unavailable. I can still answer using the AI model\'s existing knowledge.'
          : formatChatVisionError(requestError, { hadImage: hadImageAttachment });
        if (wasWebSearch) {
          logger.searchError('Search failed', { message: requestError.message, name: requestError.name });
          setMessages((current) => patchAssistantMessage(
            current,
            { id: assistantMessageId, index: assistantIndex },
            {
              text: fallbackMessage,
              content: fallbackMessage,
              status: 'error',
              webSearching: false,
              webSearchStatus: null,
              webSearchComplete: false,
            },
          ));
          setSelectedSkill(null);
        } else if (requestError.code === 'AI_CREDITS_EXHAUSTED') {
          setAiCreditsPurchaseOpen(true);
          setChatError('');
          setMessages((current) => current.filter((_, index) => index !== assistantIndex));
        } else if (isUserQuotaExceeded(requestError)) {
          setUsageLimitNotice({
            resetAt: requestError.resetAt || requestError.error?.resetAt || null,
            at: Date.now(),
          });
          setChatError('');
          setMessages((current) => current.filter((_, index) => index !== assistantIndex));
        } else if (generatingImage) {
          logger.apiError('Image generation failed', { message: requestError.message });
          const imageErrorText = requestError.retryable === false
            ? fallbackMessage
            : `${fallbackMessage} Tap Retry below to try again.`;
          setChatError(imageErrorText);
          setMessages((current) => current.map((message, index) => (
            index === assistantIndex
              ? {
                ...message,
                text: imageErrorText,
                generatingImage: false,
                imageGenerationFailed: true,
              }
              : message
          )));
        } else if (generatingVideo) {
          videoSubmitLockRef.current = false;
          const networkMessage = requestError.code === 'VIDEO_NETWORK_ERROR'
            ? requestError.message
            : videoNetworkErrorMessage(requestError);
          logger.apiError('Video generation failed', { message: networkMessage, code: requestError.code });
          const pendingId = readPendingVideoJobId();
          void fetchActiveVideoJobs().then((jobs) => {
            setActiveVideoJobs(jobs);
            const recoverId = jobs[0]?.jobId || pendingId;
            const hint = recoverId
              ? `${networkMessage} Open Make video and tap “Resume video job” (${recoverId.slice(0, 12)}…).`
              : networkMessage;
            setChatError(hint);
            setMessages((current) => current.map((message, index) => (
              index === assistantIndex
                ? {
                  ...message,
                  text: hint,
                  generatingVideo: Boolean(recoverId),
                  videoJobId: recoverId || undefined,
                }
                : message
            )));
          });
          if (!pendingId) {
            setMessages((current) => current.map((message, index) => (
              index === assistantIndex
                ? {
                  ...message,
                  text: networkMessage,
                  generatingVideo: false,
                }
                : message
            )));
          }
          setSelectedSkill('video');
        } else {
          setChatError(fallbackMessage);
          if (hadImageAttachment && attachmentSnapshot?.url) {
            setAttachedImage(attachmentSnapshot);
          }
          setMessages((current) => patchAssistantMessage(
            current,
            { id: assistantMessageId, index: assistantIndex },
            {
              text: fallbackMessage,
              content: fallbackMessage,
              status: 'error',
              visionAnalyzing: false,
              visionFailed: hadImageAttachment,
            },
          ));
        }
      }
    } finally {
      releaseComposerBusy();
    }
  };

  const stopGenerating = () => {
    activeRequest.current?.abort();
    setIsSending(false);
    setIsStreamingResponse(false);
    setTimeout(() => document.querySelector('.chat-composer textarea')?.focus(), 0);
  };

  const saveEditedMessage = async () => {
    const text = editDraft.trim();
    const index = editingMessageIndex;
    if (!text || index === null || isSending) return;
    if (activeConversationId) {
      await apiFetch(`/api/chat/history/${activeConversationId}/branch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, messageCount: messages.length, model: selectedSlug }),
      }).catch(() => {});
    }
    const previousMessages = messages.slice(0, index);
    setEditingMessageIndex(null);
    setEditDraft('');
    await sendMessage(null, text, previousMessages);
  };

  const chooseSuggestion = (text, item) => {
    if (item?.action === 'arena') {
      logger.action('Suggestion opened AI Arena');
      setArenaOpen(true);
      if (text) setArenaTask(String(text));
      return;
    }
    logger.action('Suggestion prompt clicked', { length: String(text).length });
    setPrompt(text);
    document.querySelector('.chat-composer textarea')?.focus();
  };

  const toggleImageSkill = () => {
    if (selectedSkill === 'image') {
      logger.action('Create image mode disabled');
      setSelectedSkill(null);
      return;
    }
    setAttachedImage(null);
    chooseSkill('image');
  };

  const chooseSkill = (skill) => {
    const labels = {
      image: 'Create image selected',
      file: 'Create file selected',
      video: 'Make video selected',
      web: 'Web Search enabled',
      'deep-research': 'Deep Research enabled',
    };
    logger.action(labels[skill] || 'Chat mode selected', { skill });
    if (skill === 'web') logger.search('Search enabled');
    if (skill === 'deep-research') logger.search('Deep Research enabled');
    setSelectedSkill(skill);
    setComposerMenuOpen(false);
    if (isMobileSidebarViewport()) closeSidebar();
    document.querySelector('.chat-composer textarea')?.focus();
  };

  const setKnowledgeBaseActive = (active) => {
    setUseKnowledgeBase(active);
    safeStorageSet('localStorage', 'allmodelai_use_knowledge', active ? 'true' : 'false');
    if (active) {
      logger.action('Knowledge Base enabled for chat', { useKnowledge: true });
    }
  };

  const toggleKnowledgeBaseFromMenu = () => {
    setKnowledgeBaseActive(!useKnowledgeBase);
    setComposerMenuOpen(false);
    composerInputRef.current?.focus();
  };

  const goTo = (path, label) => {
    logger.action(`Open: ${label}`, { path });
    navigate(path);
    if (isMobileSidebarViewport()) closeSidebar();
  };

  const openSmartRouter = () => {
    logger.action('Smart Router selected');
    setSelectedSlug('smart');
    setTemporaryChat(false);
    setActiveProject(null);
    newChat();
  };

  const pinConversation = (conversation) => {
    const pinned = !chatMeta[conversation.id]?.pinned;
    updateChatMeta(conversation.id, { pinned });
    setChatMenuId(null);
  };

  const renameConversation = async (conversation) => {
    const title = window.prompt('Rename conversation', conversation.title || conversationPreview(conversation))?.trim();
    if (!title) return;
    const response = await apiFetch(`/api/chat/history/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, title }),
    });
    if (response.ok) await refreshHistory();
    setChatMenuId(null);
  };

  const closeConfirmDialog = () => {
    if (confirmBusy || confirmInFlightRef.current) return;
    setConfirmDialog(null);
    setConfirmError('');
  };

  const requestDeleteConversation = (conversation) => {
    if (!conversation?.id) return;
    setChatMenuId(null);
    setConfirmError('');
    const title = String(conversation.title || 'Untitled').trim() || 'Untitled';
    setConfirmDialog({
      kind: 'delete-chat',
      payload: conversation,
      title: t('Delete chat?') || 'Delete chat?',
      description: `"${title}" will move to Trash. You can restore it from Trash or delete it permanently later.`,
      confirmLabel: t('Delete chat') || 'Delete chat',
      cancelLabel: t('Cancel') || 'Cancel',
      destructive: true,
    });
  };

  const archiveConversation = async (conversation) => {
    if (!conversation?.id) return;
    await setConversationLifecycle(apiFetch, conversation.id, 'archived');
    setChatMenuId(null);
    await refreshHistory({ includeArchive: true, force: true });
    if (activeConversationId === conversation.id) newChat();
  };

  const restoreConversation = async (conversation, targetStatus = 'active') => {
    if (!conversation?.id) return;
    await setConversationLifecycle(apiFetch, conversation.id, targetStatus);
    await refreshHistory({ includeArchive: true, force: true });
  };

  const performDeleteConversation = async (conversation) => {
    const response = await apiFetch(`/api/chat/history/${conversation.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || t('Could not delete chat.') || 'Could not delete chat.');
    }
    setChatHistory((history) => history.filter((item) => item.id !== conversation.id));
    setTemporaryHistory((history) => history.filter((item) => item.id !== conversation.id));
    removeChatMeta(conversation.id);
    if (activeConversationId === conversation.id) {
      setActiveConversationId(null);
      activeConversationIdRef.current = null;
      setTemporaryChat(false);
      setTemporaryExpiresAt(null);
      setMessages([]);
      setPrompt('');
      setChatError('');
    }
    setChatMenuId(null);
  };

  /** Opens the custom confirmation modal (replaces native window.confirm). */
  const deleteConversation = requestDeleteConversation;

  const renameFeedQuestion = async (item) => {
    const nextText = window.prompt(t('Rename question'), item.text)?.trim();
    if (!nextText || nextText === item.text) return;
    const conversation = item.conversation;
    const nextMessages = (conversation.messages || []).map((message, index) => {
      if (index !== item.messageIndex) return message;
      return { ...message, content: nextText, text: nextText };
    });
    const body = { email: user.email, messages: nextMessages };
    if (item.messageIndex === 0) body.title = nextText.slice(0, 60);
    const response = await apiFetch(`/api/chat/history/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      invalidateChatHistoryListCache();
      const updated = await response.json().catch(() => null);
      await refreshHistory({ force: true });
      if (activeConversationId === conversation.id) {
        setMessages(updated?.messages || nextMessages);
      }
    }
  };

  const requestDeleteFeedQuestion = (item) => {
    if (!item?.conversation) return;
    setConfirmError('');
    setConfirmDialog({
      kind: 'delete-feed-question',
      payload: item,
      title: t('Delete question?') || 'Delete question?',
      description: t('Delete this question from history?') || 'Delete this question from history?',
      confirmLabel: t('Delete') || 'Delete',
      cancelLabel: t('Cancel') || 'Cancel',
      destructive: true,
    });
  };

  const performDeleteFeedQuestion = async (item) => {
    const conversation = item.conversation;
    const messages = [...(conversation.messages || [])];
    const removeIndexes = new Set([item.messageIndex]);
    if (messages[item.messageIndex + 1]?.role === 'assistant') {
      removeIndexes.add(item.messageIndex + 1);
    }
    const nextMessages = messages.filter((_, index) => !removeIndexes.has(index));
    if (!nextMessages.length) {
      await performDeleteConversation(conversation);
      return;
    }
    const response = await apiFetch(`/api/chat/history/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, messages: nextMessages }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || t('Could not delete question.') || 'Could not delete question.');
    }
    await refreshHistory();
    if (activeConversationId === conversation.id) setMessages(nextMessages);
  };

  const deleteFeedQuestion = requestDeleteFeedQuestion;

  const openFeedQuestion = (item) => {
    openConversation(item.conversation);
    setHistoryFeedOpen(false);
  };

  const collapseSidebar = () => {
    setIsSidebarCollapsed(true);
    safeStorageSet('localStorage', 'allmodelai_sidebar_collapsed', 'true');
  };

  const expandSidebar = () => {
    setIsSidebarCollapsed(false);
    safeStorageSet('localStorage', 'allmodelai_sidebar_collapsed', 'false');
  };

  const handleSidebarResizePointerDown = (event) => {
    if (isSidebarCollapsed) return;
    event.preventDefault();
    event.stopPropagation();
    sidebarResizeActiveRef.current = true;
    setSidebarResizing(true);
    document.body.classList.add('chat-sidebar-resizing');
  };

  const handleSidebarResizeDoubleClick = () => {
    setSidebarWidth(SIDEBAR_WIDTH_DEFAULT);
    safeStorageSet('localStorage', SIDEBAR_WIDTH_STORAGE_KEY, String(SIDEBAR_WIDTH_DEFAULT));
  };

  const newChat = () => {
    logger.action('New conversation');
    historyBootstrappedRef.current = true;
    setTemporaryChat(false);
    setTemporaryExpiresAt(null);
    setActiveConversationId(null);
    activeConversationIdRef.current = null;
    setMessages([]);
    setPrompt('');
    setSelectedSkill(null);
    setChatError('');
    setBackgroundNotification(null);
    setSidebarOpen(false);
  };
  const startTemporaryChat = async () => {
    logger.action('Temporary chat');
    historyBootstrappedRef.current = true;
    setTemporaryChat(true);
    setActiveProject(null);
    persistActiveProjectId(null);
    setActiveConversationId(null);
    activeConversationIdRef.current = null;
    setMessages([]);
    setPrompt('');
    setSelectedSkill(null);
    setChatError('');
    setBackgroundNotification(null);
    setSidebarOpen(false);
    try {
      const response = await apiFetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          model: selectedSlug,
          temporary: true,
          messages: [],
        }),
      });
      if (!response.ok) {
        setTemporaryExpiresAt(new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString());
        return;
      }
      const conversation = await response.json();
      activeConversationIdRef.current = conversation.id;
      setActiveConversationId(conversation.id);
      setTemporaryExpiresAt(conversation.expiresAt || null);
      setTemporaryHistory((history) => [
        conversation,
        ...history.filter((item) => String(item.id) !== String(conversation.id)),
      ]);
    } catch {
      setTemporaryExpiresAt(new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString());
    }
  };
  const createProject = () => {
    setProjectModalOpen(true);
    setSidebarOpen(false);
  };

  const finalizeCreateProject = ({ name, icon, color }) => {
    logger.action('New project', { name, icon, color });
    const project = { id: crypto.randomUUID(), name, icon, color };
    const nextProjects = [...projects, project];
    setProjects(nextProjects);
    setProjectModalOpen(false);
    safeStorageSet('localStorage', 'allmodelai_projects', JSON.stringify(nextProjects));
    enterProject(project);
  };

  const enterProject = (project) => {
    logger.action('Open project', { name: project.name });
    setActiveProject(project);
    persistActiveProjectId(project);
    setTemporaryChat(false);
    setProjectMenuId(null);
    setSidebarOpen(false);
    setActiveConversationId(null);
    activeConversationIdRef.current = null;
    setMessages([]);
    setPrompt('');
    setSelectedSkill(null);
    setChatError('');
    refreshHistory();
  };

  const leaveProject = () => {
    logger.action('Leave project');
    setActiveProject(null);
    persistActiveProjectId(null);
    newChat();
  };
  const renameProject = (project) => {
    const name = window.prompt('Rename project', project.name)?.trim();
    if (!name) return;
    const nextProjects = projects.map((item) => item.id === project.id ? { ...item, name } : item);
    setProjects(nextProjects);
    if (activeProject?.id === project.id) setActiveProject({ ...project, name });
    safeStorageSet('localStorage', 'allmodelai_projects', JSON.stringify(nextProjects));
    setProjectMenuId(null);
  };
  const requestDeleteProject = (project) => {
    if (!project?.id) return;
    setProjectMenuId(null);
    setConfirmError('');
    const name = String(project.name || 'Untitled').trim() || 'Untitled';
    setConfirmDialog({
      kind: 'delete-project',
      payload: project,
      title: t('Delete project?') || 'Delete project?',
      description: `This will permanently delete "${name}". This action cannot be undone.`,
      confirmLabel: t('Delete project') || 'Delete project',
      cancelLabel: t('Cancel') || 'Cancel',
      destructive: true,
    });
  };

  const performDeleteProject = (project) => {
    const nextProjects = projects.filter((item) => item.id !== project.id);
    setProjects(nextProjects);
    safeStorageSet('localStorage', 'allmodelai_projects', JSON.stringify(nextProjects));
    if (activeProject?.id === project.id) {
      setActiveProject(null);
      newChat();
    }
    setProjectMenuId(null);
  };

  const deleteProject = requestDeleteProject;

  const runConfirmDialogAction = async () => {
    if (!confirmDialog || confirmBusy || confirmInFlightRef.current) return;
    confirmInFlightRef.current = true;
    setConfirmBusy(true);
    setConfirmError('');
    try {
      if (confirmDialog.kind === 'delete-chat') {
        await performDeleteConversation(confirmDialog.payload);
      } else if (confirmDialog.kind === 'delete-project') {
        performDeleteProject(confirmDialog.payload);
      } else if (confirmDialog.kind === 'delete-feed-question') {
        await performDeleteFeedQuestion(confirmDialog.payload);
      }
      setConfirmDialog(null);
    } catch (error) {
      setConfirmError(error?.message || t('Something went wrong.') || 'Something went wrong.');
      setChatError(error?.message || '');
    } finally {
      confirmInFlightRef.current = false;
      setConfirmBusy(false);
    }
  };
  const launchArena = () => {
    const task = arenaTask.trim();
    if (!task) return;
    setArenaOpen(false); setTemporaryChat(false); setActiveProject(null); setSelectedSlug('smart'); newChat();
    setPrompt(`Compare how GPT, Claude, Gemini, and Grok would approach this task: ${task}`);
    setArenaTask('');
    setTimeout(() => document.querySelector('.chat-composer textarea')?.focus(), 0);
  };
  const deleteAccount = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      const { deleted, message } = await deleteUserAccountAndSignOut(user.email);
      setDeleteModalOpen(false);
      if (message) {
        try {
          sessionStorage.setItem('allmodelai_auth_notice', message);
        } catch {
          /* ignore */
        }
        if (!deleted) {
          setDeleteError(message);
        }
      }
      navigate('/', { replace: true });
    } catch (error) {
      setDeleteError(error?.message || 'Could not complete account deletion.');
      navigate('/', { replace: true });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main
      className={`chat-page ${standaloneApp ? 'chat-page--standalone' : ''} ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${sidebarResizing ? 'sidebar-width-resizing' : ''} ${isSending ? 'chat-busy' : ''}`}
      style={!isSidebarCollapsed ? { '--chat-sidebar-width': `${sidebarWidth}px` } : undefined}
    >
      <button
        type="button"
        className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
        aria-label={t('Close sidebar')}
        aria-hidden={sidebarOpen ? 'false' : 'true'}
        tabIndex={sidebarOpen ? 0 : -1}
        onClick={closeSidebar}
      />
      <ChatSidebar
        t={t}
        user={user}
        isSidebarCollapsed={isSidebarCollapsed}
        sidebarOpen={sidebarOpen}
        sidebarDrawerId={CHAT_SIDEBAR_DRAWER_ID}
        expandSidebar={expandSidebar}
        collapseSidebar={collapseSidebar}
        closeSidebar={closeSidebar}
        setSidebarOpen={setSidebarOpen}
        isMobileSidebarViewport={isMobileSidebarViewport}
        newChat={newChat}
        openSmartRouter={openSmartRouter}
        chooseSkill={chooseSkill}
        createProject={createProject}
        goTo={goTo}
        logger={logger}
        temporaryChat={temporaryChat}
        startTemporaryChat={startTemporaryChat}
        temporaryHistory={temporaryHistory}
        selectedSlug={selectedSlug}
        messages={messages}
        exportConversation={exportConversation}
        editSystemInstructions={editSystemInstructions}
        backupWorkspace={backupWorkspace}
        projects={projects}
        activeProject={activeProject}
        enterProject={enterProject}
        projectMenuId={projectMenuId}
        setProjectMenuId={setProjectMenuId}
        renameProject={renameProject}
        deleteProject={deleteProject}
        favorites={favorites}
        chooseSuggestion={chooseSuggestion}
        dashboardModels={dashboardModels}
        chatHistory={chatHistory}
        visibleHistory={visibleHistory}
        historyQuery={historyQuery}
        setHistoryQuery={setHistoryQuery}
        chatMeta={chatMeta}
        activeConversationId={activeConversationId}
        openConversation={openConversation}
        chatMenuId={chatMenuId}
        setChatMenuId={setChatMenuId}
        pinConversation={pinConversation}
        renameConversation={renameConversation}
        deleteConversation={deleteConversation}
        archiveConversation={archiveConversation}
        restoreConversation={restoreConversation}
        archivedHistory={archivedHistory}
        trashedHistory={trashedHistory}
        themePreference={themePreference}
        textColor={textColor}
        chatTextColors={chatTextColors}
        setDeleteModalOpen={setDeleteModalOpen}
      />

      {!isSidebarCollapsed && (
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_WIDTH_MIN}
          aria-valuemax={SIDEBAR_WIDTH_MAX}
          aria-valuenow={sidebarWidth}
          aria-label={t('Resize sidebar')}
          title={t('Drag to resize sidebar')}
          style={{ left: `${sidebarWidth}px` }}
          onPointerDown={handleSidebarResizePointerDown}
          onDoubleClick={handleSidebarResizeDoubleClick}
        />
      )}

      <section className="chat-workspace" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        {historyFeedOpen && (
          <div className="history-feed-overlay" role="presentation" onClick={() => setHistoryFeedOpen(false)}>
            <section
              className="history-feed-panel"
              role="dialog"
              aria-modal="true"
              aria-label={t("Question history")}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="history-feed-header">
                <div>
                  <p>{t("Saved conversations")}</p>
                  <h2>{t("Your question history")}</h2>
                  <small>{visibleHistoryFeed.length} {t("questions")}</small>
                </div>
                <button type="button" className="history-feed-close" onClick={() => setHistoryFeedOpen(false)} aria-label={t("Close")}>×</button>
              </header>
              <input
                className="history-feed-search"
                value={historyFeedQuery}
                onChange={(event) => setHistoryFeedQuery(event.target.value)}
                placeholder={t("Search saved chats")}
                aria-label={t("Search saved chats")}
              />
              <div className="history-feed-list" tabIndex={0}>
                {visibleHistoryFeed.length === 0 && (
                  <p className="history-feed-empty">{historyFeed.length ? t("No matching conversations.") : t("Your saved chats will appear here.")}</p>
                )}
                {visibleHistoryFeed.map((item) => (
                  <article className="history-feed-item" key={item.id}>
                    <button type="button" className="history-feed-open" onClick={() => openFeedQuestion(item)}>
                      <span className="history-feed-badge">{item.model || 'AI'}</span>
                      <strong>{item.text}</strong>
                      <small>{item.title} · {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : t("Saved conversation")}</small>
                    </button>
                    <div className="history-feed-actions">
                      <button type="button" onClick={() => renameFeedQuestion(item)}>{t("Edit")}</button>
                      <button type="button" className="danger" onClick={() => deleteFeedQuestion(item)}>{t("Delete")}</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
        {isDraggingImage && (
          <div className="drag-drop-overlay">
            <div className="drag-drop-card">
              <span className="drag-drop-icon">📷</span>
              <h3>Drop screenshot or image here</h3>
              <p>AI will analyze your screen, explain what is shown, and provide step-by-step guidance on where to click</p>
            </div>
          </div>
        )}
        <header className="chat-header">
          <div className="chat-header-toolbar">
            <div className="chat-header-left">
              <button
                ref={sidebarToggleRef}
                type="button"
                className={`sidebar-toggle${sidebarOpen ? ' sidebar-toggle--open' : ''}`}
                onClick={toggleSidebar}
                aria-label={sidebarOpen ? t('Close sidebar') : t('Open sidebar')}
                aria-expanded={sidebarOpen}
                aria-controls={CHAT_SIDEBAR_DRAWER_ID}
              >
                <span className="sidebar-toggle-icon" aria-hidden="true">{sidebarOpen ? '×' : '☰'}</span>
              </button>
              <div className="chat-header-brand">
                <strong className="chat-header-title">{t('AllModelAI Chat')}</strong>
              </div>
              <div className="chat-header-model-meta active-model">
                <img src={selectedModel.image} alt="" />
                <span>
                  <small>{temporaryChat ? t('Temporary chat') : activeProject ? activeProject.name : t('Chatting with')}</small>
                  <strong>{selectedModel.name}{selectedVersion ? ` · ${selectedVersion.name}` : ''}</strong>
                </span>
                <i className={modelIsOnline(selectedSlug) ? '' : 'offline'}>{modelIsOnline(selectedSlug) ? t('Online') : t('API needed')}</i>
              </div>
              {temporaryChat && (
                <TemporaryChatBanner t={t} expiresAt={temporaryExpiresAt} />
              )}
            </div>
            {!isGuest && creditStatus && (
              <div className="chat-header-center">
                <div className="access-mode-control">
                  {creditStatus.plusTestMode && (
                    <span className="plus-test-mode-badge" role="status" title={t('Local developer Plus Test Mode')}>
                      Plus Test Mode
                    </span>
                  )}
                  <div className="access-mode-switch" role="group" aria-label="Access mode">
                    <button
                      type="button"
                      aria-pressed={(creditStatus.mode || 'user') === 'user'}
                      disabled={isSending || accessModeSaving}
                      onClick={() => creditStatus.canUseDeveloper && changeAccessMode('user')}
                    >
                      {t('User')}
                    </button>
                    {creditStatus.canUseDeveloper ? (
                      <button
                        type="button"
                        className={creditStatus.isOwner || creditStatus.plusBranding ? 'access-mode-plus' : ''}
                        aria-pressed={creditStatus.mode === 'developer'}
                        disabled={isSending || accessModeSaving}
                        onClick={() => changeAccessMode('developer')}
                        title={creditStatus.isOwner ? t('Owner Plus entitlement') : creditStatus.plusTestMode ? t('Plus Test Mode — all models') : t('All models')}
                      >
                        {creditStatus.isOwner
                          ? (<><span aria-hidden="true">✦ </span>{t('Plus')}</>)
                          : (creditStatus.plusTestEligible && !creditStatus.hasSubscription ? t('Plus Test') : t('Developer'))}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="access-mode-plus"
                        aria-pressed={false}
                        disabled={isSending}
                        onClick={openPlusSubscription}
                        title={t('Upgrade subscription')}
                      >
                        Plus
                      </button>
                    )}
                  </div>
                  <small>
                    {accessModeSaving
                      ? t('Saving…')
                      : creditStatus.isOwner
                        ? (creditStatus.plusActive ? t('Owner · Plus') : t('Owner · User preview'))
                        : creditStatus.plusTestMode
                          ? t('Plus Test Mode · all models')
                          : creditStatus.mode === 'developer' && creditStatus.hasSubscription
                            ? t('All models')
                            : freeModelsLabel(creditStatus, t)}
                    {creditStatus.canAccessModelDiagnostics && (
                      <>
                        {' · '}
                        <Link to="/developer/model-diagnostics" className="access-subscribe-inline">{t('Model diagnostics')}</Link>
                        {' · '}
                        <Link to="/developer/ai-learning" className="access-subscribe-inline">{t('AI Learning')}</Link>
                      </>
                    )}
                    {!creditStatus.canUseDeveloper && !creditStatus.hasSubscription && (
                      <button type="button" className="access-subscribe-inline" onClick={openPlusSubscription}>
                        {t('Subscription')} ↗
                      </button>
                    )}
                  </small>
                </div>
              </div>
            )}
            <div className="chat-header-right">
            <div className="chat-header-model-slot">
          <div className={`model-select custom-model-select ${modelMenuOpen ? 'open' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape') setModelMenuOpen(false); }} onBlur={(event) => { const root = event.currentTarget; window.setTimeout(() => { if (!root.contains(document.activeElement) && !root.matches(':hover')) setModelMenuOpen(false); }, 180); }}>
            <div className="model-select-eyebrow" id="chat-model-select-label">{t('Model')}</div>
            <button
              type="button"
              className="model-select-trigger"
              onClick={() => setModelMenuOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={modelMenuOpen}
              aria-labelledby="chat-model-select-label"
            >
              <span className="model-select-trigger__icon">
                <img src={selectedModel.image} alt="" />
              </span>
              <span className="model-select-trigger__label">{formatModelSelectorTriggerLabel(selectedModel, selectedVersion)}</span>
              <span className="model-select-trigger__sliders">
                <IconSlidersHorizontal />
              </span>
            </button>
            {modelMenuOpen && <div className="model-options model-family-options" role="listbox" aria-label={t("Choose AI model")}>
              {dashboardModels.map((model) => {
                const online = modelIsOnline(model.slug);
                const paid = isPaidPlanAccess(creditStatus);
                if (model.slug === 'smart') {
                  return (
                    <button type="button" role="option" aria-selected={selectedSlug === 'smart'} className={selectedSlug === 'smart' ? 'selected' : ''} key={model.slug} onClick={() => chooseModel(model)}>
                      <img src={model.image} alt="" />
                      <span><strong>{model.name}</strong><small>{model.provider} · {t('Ready')}</small></span>
                      {!paid && <ModelEntitlementBadge tier="free" />}
                      {selectedSlug === 'smart' && <b>✓</b>}
                    </button>
                  );
                }
                if (model.slug === 'anonin') {
                  return (
                    <button type="button" role="option" aria-selected={isAnoninModelSlug(selectedSlug)} className={isAnoninModelSlug(selectedSlug) ? 'selected' : ''} key={model.slug} onClick={() => chooseModel(model)}>
                      <img src={model.image} alt="" />
                      <span><strong>{model.name}</strong><small>{t('Mystery AI · reveal after reply')}</small></span>
                      {!paid && <ModelEntitlementBadge tier="free" />}
                      {isAnoninModelSlug(selectedSlug) && <b>✓</b>}
                    </button>
                  );
                }
                const familyLocked = modelFamilyLocked(model.slug);
                return <div className="model-family-group" role="group" aria-labelledby={`model-family-${model.slug}`} key={model.slug}>
                  <div
                    className={`model-family-heading${familyLocked ? ' model-family-heading--locked' : ''}`}
                    id={`model-family-${model.slug}`}
                    role={familyLocked ? 'button' : undefined}
                    tabIndex={familyLocked ? 0 : undefined}
                    onClick={familyLocked ? () => openPremiumUpgrade(model) : undefined}
                    onKeyDown={familyLocked ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPremiumUpgrade(model); } } : undefined}
                  >
                    <img src={model.image} alt="" />
                    <span>
                      <strong>{model.name}</strong>
                      <small>
                        {model.provider}
                        {' · '}
                        {familyLocked ? t('Pro subscription required') : online ? t('Ready') : t('API needed')}
                      </small>
                    </span>
                    {familyLocked && <ModelEntitlementBadge tier="pro" locked />}
                    {familyLocked && (
                      <button
                        type="button"
                        className="subscribe-btn"
                        onClick={(event) => { event.stopPropagation(); openSubscribe(model.slug); }}
                      >
                        <span aria-hidden="true">🔒</span> {t('Subscribe')}
                      </button>
                    )}
                  </div>
                  {(variantCatalog[model.slug] || []).map((version) => {
                    const selected = selectedSlug === model.slug && selectedVersion?.id === version.id;
                    const versionAllowed = modelVersionAllowed(model.slug, version.id);
                    const locked = isPremiumLockedModel(creditStatus, model.slug, version.id);
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={!versionAllowed}
                        key={version.id}
                        className={`model-family-version${selected ? ' selected' : ''}${locked ? ' model-family-version--locked' : ''}`}
                        onClick={() => chooseModel(model, version)}
                      >
                        <img src={model.image} alt="" />
                        <span>
                          <strong>
                            {version.name}{version.label ? ` ${version.label}` : ''}
                            <ModelSpeedBadge speed={version.speed} />
                            {!paid && versionAllowed && <ModelEntitlementBadge tier="free" />}
                            {(paid || locked) && <ModelEntitlementBadge tier="pro" locked={locked && !paid} />}
                          </strong>
                          {version.description && <small>{version.description}</small>}
                        </span>
                        <b>{selected ? '✓' : locked && !paid ? '🔒' : '›'}</b>
                      </button>
                    );
                  })}
                  {!variantCatalog[model.slug]?.length && (
                    <p className="model-versions-note">
                      {model.slug === 'ollama'
                        ? (online
                          ? t('Versions are unavailable. Reload the page to try again.')
                          : t('Ollama Cloud needs OLLAMA_API_KEY on the server. Versions will appear once the backend is configured.'))
                        : t('Versions are unavailable. Reload the page to try again.')}
                    </p>
                  )}
                </div>;
              })}
            </div>}
          </div>
            </div>
            <button type="button" className="chat-header-action chat-header-action--pill chat-header-desktop-only" onClick={newChat}>
              {t('New Chat')}
            </button>
            <Link className="chat-header-action chat-header-action--pill dashboard-link chat-header-desktop-only" to="/dashboard">{t('Dashboard')}</Link>
            <Link className="chat-header-action chat-header-action--icon chat-header-desktop-only" to="/chat/settings" aria-label={t('Settings')} title={t('Settings')}>
              <span aria-hidden="true">⚙</span>
            </Link>
            <div className="chat-header-overflow">
              <button
                type="button"
                className="chat-header-action chat-header-action--icon"
                aria-label={t('More actions')}
                aria-expanded={headerOverflowOpen}
                aria-haspopup="menu"
                onClick={() => setHeaderOverflowOpen((open) => !open)}
              >
                <span aria-hidden="true">⋯</span>
              </button>
              {headerOverflowOpen && (
                <div className="chat-header-overflow-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { newChat(); setHeaderOverflowOpen(false); }}>{t('New Chat')}</button>
                  <Link to="/dashboard" role="menuitem" onClick={() => setHeaderOverflowOpen(false)}>{t('Dashboard')}</Link>
                  <Link to="/chat/settings" role="menuitem" onClick={() => setHeaderOverflowOpen(false)}>{t('Settings')}</Link>
                </div>
              )}
            </div>
            </div>
          </div>
        </header>
        {(activeProject && !temporaryChat) || backgroundNotification ? (
          <div className="chat-statuses">
            {activeProject && !temporaryChat && (
              <div className="chat-project-banner" role="status" lang="en">
                <ProjectIconBadge project={activeProject} className="chat-project-banner-icon" />
                <span>
                  <small>{t('You are currently in this folder')}</small>
                  <strong>{activeProject.name}</strong>
                </span>
                <button type="button" className="chat-project-leave" onClick={leaveProject}>
                  {t('Leave folder')}
                </button>
              </div>
            )}
            {backgroundNotification && (
              <div className="model-selection-notice chat-background-notification" role="status"><span><strong>{backgroundNotification.title}</strong><small>{backgroundNotification.text}</small></span><button type="button" onClick={async () => { const loaded = await fetchChatConversation(apiFetch, backgroundNotification.conversationId); if (loaded.ok) openConversation(loaded.conversation); setBackgroundNotification(null); }} aria-label="Open completed response">{t("Open chat")}</button><button type="button" onClick={() => setBackgroundNotification(null)} aria-label="Dismiss notification">×</button></div>
            )}
          </div>
        ) : null}

        <div className="chat-main">
        <div className="chat-messages" ref={messagesContainer}>
          <div className="chat-conversation-column">
          {messages.length === 0 && (
            activeProject && !temporaryChat && visibleHistory.length > 0 ? (
              <div className="project-conversation-panel" lang="en">
                <div className="project-conversation-panel-head">
                  <ProjectIconBadge project={activeProject} className="chat-empty-project-icon" />
                  <div>
                    <p className="chat-eyebrow">{t('Project chats')}</p>
                    <h1>{activeProject.name}</h1>
                    <p className="chat-subtitle">{t('Chats in this project stay grouped here.')}</p>
                  </div>
                </div>
                <ul className="project-conversation-list">
                  {visibleHistory.map((conversation) => (
                    <li className={`project-conversation-item ${activeConversationId === conversation.id ? 'active' : ''}`} key={conversation.id}>
                      <button type="button" className="project-conversation-open" onClick={() => openConversation(conversation)}>
                        <span>{chatMeta[conversation.id]?.pinned ? '★' : '💬'}</span>
                        <span>
                          <strong>{conversation.title || conversationPreview(conversation)}</strong>
                          <small>{conversationPreview(conversation)}</small>
                          <em>Saved · {conversation.model}</em>
                        </span>
                      </button>
                      <button type="button" className="chat-history-more" aria-expanded={chatMenuId === conversation.id} onClick={() => setChatMenuId((id) => id === conversation.id ? null : conversation.id)} aria-label={`Options for ${conversation.title || conversationPreview(conversation)}`}>•••</button>
                      {chatMenuId === conversation.id && (
                        <div className="chat-history-menu project-conversation-menu" lang="en">
                          <button type="button" onClick={() => pinConversation(conversation)}>{chatMeta[conversation.id]?.pinned ? t('Unpin') : t('Pin')}</button>
                          <button type="button" onClick={() => renameConversation(conversation)}>{t('Rename')}</button>
                          <button type="button" className="danger" onClick={() => deleteConversation(conversation)}>{t('Delete')}</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ChatEmptyState
                t={t}
                activeProject={activeProject}
                temporaryChat={temporaryChat}
                selectedModel={selectedModel}
                suggestions={suggestions}
                onSelectSuggestion={chooseSuggestion}
              />
            )
          )}
          {messages.map((message, index) => {
            const anoninCatalog = dashboardModels.find((model) => model.slug === 'anonin');
            const messageModel = message.modelSlug === 'anonin'
              ? anoninCatalog || selectedModel
              : dashboardModels.find((model) => model.slug === message.modelSlug) || selectedModel;
            let text = message.content ?? message.text ?? '';
            const generatedFile = message.role === 'assistant' ? parseGeneratedFile(text) : null;
            const filePending = message.generatingFile && isSending && index === messages.length - 1;
            const imagePending = message.generatingImage && isSending && index === messages.length - 1;
            const messageImage = message.role === 'user' ? message.image || message.imageUrl : null;
            const activelyStreaming = message.role === 'assistant'
              && index === messages.length - 1
              && isSending
              && (message.status === 'streaming' || isStreamingResponse)
              && Boolean(String(text).trim());
            const isPendingAssistant = message.role === 'assistant' && !text && !messageImage && !messageHasVideoReference(message) && !message.imageUrl && !(message.images?.length) && !message.deepResearchClarification && !(message.webSearchStatus || message.webSearching);
            if (isPendingAssistant && isSending && index === messages.length - 1) return null;
            if (isPendingAssistant && !isSending) {
              text = 'No response was received from the model. Tap Regenerate or send your message again.';
            }
            const editing = message.role === 'user' && editingMessageIndex === index;
            const feedback = messageFeedback[index];
            const favoriteEntry = favorites.some((item) => item.text === text);
            const historicalError = message.role === 'assistant' && (message.status === 'error' || !activelyStreaming)
              ? historicalProviderErrorPresentation(text, { ollamaConfigured: modelIsOnline('ollama') })
              : { kind: null, notice: null };
            return <article className={`chat-message ${message.role} ${activelyStreaming ? 'streaming-response' : ''}${historicalError.kind ? ' historical-provider-error' : ''}`} key={message.id || `${message.role}-${index}`}><span>{message.role === 'user' ? (user.name?.charAt(0) || 'U') : <img src={messageModel.image} alt={`${messageModel.name} logo`} />}</span><div><small>{message.role === 'user' ? 'You' : messageModel.name}</small>{messageImage && <div className="message-image-container"><img className="message-user-image" src={messageImage} alt="Uploaded screenshot" onClick={() => setPreviewModalImage(messageImage)} title="Click to view full size" /><span className="image-zoom-badge" onClick={() => setPreviewModalImage(messageImage)}>🔍 Zoom</span></div>}{editing ? <div className="inline-message-editor"><textarea autoFocus value={editDraft} onChange={(event) => setEditDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setEditingMessageIndex(null); setEditDraft(''); } if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); saveEditedMessage(); } }} /><div><span>The original version will be saved as a branch.</span><button type="button" onClick={() => { setEditingMessageIndex(null); setEditDraft(''); }}>{t("Cancel")}</button><button type="button" disabled={!editDraft.trim()} onClick={saveEditedMessage}>Save &amp; resend</button></div></div> : message.deepResearch ? <DeepResearchMessageBlock message={message} onClarifyStart={(answers) => handleDeepResearchClarification(index, answers, false)} onClarifySkip={() => handleDeepResearchClarification(index, null, true)} onStopResearch={stopGenerating} onRetry={() => { const prev = messages[index - 1]; if (prev?.role === 'user') sendMessage(null, prev.text || prev.content, messages.slice(0, index - 1)); }} /> : (message.webSearchStatus || message.webSearching) ? <WebSearchStatus status={message.webSearchStatus || 'searching'} count={message.webSearchCount} deepResearch={message.deepResearch} label={message.deepResearchLabel} sources={message.webSearchPreviewSources || message.webSources || []} error={message.webSearchError} onRetry={() => { const prev = messages[index - 1]; if (prev?.role === 'user') sendMessage(null, prev.text || prev.content, messages.slice(0, index - 1), null, { forceWebSearch: true }); }} /> : null}{message.role === 'assistant' && message.recoveryNotice ? <p className="chat-recovery-notice" role="status">{message.recoveryNotice}</p> : null}{historicalError.notice ? <p className="chat-historical-error-notice" role="note">{historicalError.notice}</p> : null}{text && (message.role === 'assistant' ? filePending ? <p role="status">Creating your file...</p> : imagePending ? <div className="image-gen-status" role="status" aria-live="polite"><span className="image-gen-status__spinner" aria-hidden="true" /><b>{message.imageStatusLabel || 'Generating image…'}</b></div> : generatedFile ? <FileCard file={generatedFile} conversationId={activeConversationId} temporary={temporaryChat} /> : <><ChatMessageContent text={text} streaming={activelyStreaming} citationSources={message.webSources} conversationId={activeConversationId} />{aiStickersEnabled && message.aiSticker && !activelyStreaming && <ChatAiSticker sticker={message.aiSticker} />}</> : <p>{text}</p>)}{message.webSearchUnavailable && <WebSources unavailable sources={[]} complete={false} deepResearch={message.deepResearch} />}
{message.webSources?.length > 0 && <WebSources sources={message.webSources} complete={message.webSearchComplete} deepResearch={message.deepResearch} retrievedAt={message.webSearchRetrievedAt} onRetry={() => { const prev = messages[index - 1]; if (prev?.role === 'user') sendMessage(null, prev.text || prev.content, messages.slice(0, index - 1), null, { forceWebSearch: true }); }} />}{message.knowledgeSources?.length > 0 && <KnowledgeSourceChips sources={message.knowledgeSources} onSourceClick={() => navigate('/knowledge')} />}{(message.imageUrl || message.images?.length) && message.role !== 'user' && <GeneratedImageCard message={message} onPreview={setPreviewModalImage} onDownloadError={setChatError} showUpscale={Boolean(message.upscaleSupported)} onRegenerate={() => { const previous = messages.slice(0, index).reverse().find((item) => item.role === 'user'); if (!previous) return; const cutIndex = messages.slice(0, index).findLastIndex((item) => item.role === 'user'); sendMessage(null, previous.content || previous.text, messages.slice(0, cutIndex), null, { forceImage: true, quality: message.imageQuality || imageGenerationQuality || 'hd', aspectRatio: message.imageAspect || imageGenerationAspect || '1:1', imageCount: message.requestedImageCount || imageGenerationCount || 1 }); }} onUpscaleComplete={(patch) => setMessages((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))} />}{messageHasPlayableVideo(message) && message.role !== 'user' && <GeneratedVideoCard message={normalizeVideoMessage(message)} onDownloadError={setChatError} onRegenerate={() => { const previous = messages.slice(0, index).reverse().find((item) => item.role === 'user'); if (!previous) return; const cutIndex = messages.slice(0, index).findLastIndex((item) => item.role === 'user'); sendMessage(null, previous.content || previous.text, messages.slice(0, cutIndex), null, { forceVideo: true, aspectRatio: message.videoAspect || '16:9', resolution: message.videoResolution || '720p' }); }} />}{text && !activelyStreaming && !editing && (
              <MessageActions
                role={message.role}
                text={text}
                copyText={generatedFile?.content || text}
                messageIndex={index}
                rating={messageRatings[index] || null}
                feedbackReason={feedback || ''}
                isFavorite={favoriteEntry}
                modelInfo={message.role === 'assistant' && message.modelSlug !== 'anonin' ? messageModel : null}
                conversationId={activeConversationId}
                isSending={isSending}
                isRegenerating={regeneratingMessageIndex === index}
                speechLanguage={speechLanguage}
                selectedVoiceName={selectedVoice}
                availableVoices={availableVoices}
                activeSpeechIndex={activeSpeechMessageIndex}
                onSpeechIndexChange={(nextIndex) => {
                  setActiveSpeechMessageIndex(nextIndex);
                  setIsSpeaking(nextIndex !== null);
                }}
                onRate={rateMessage}
                onFeedbackReason={setFeedbackReason}
                onShare={() => shareMessage(text)}
                onRegenerate={message.role === 'assistant' ? regenerateResponse : undefined}
                onEdit={editMessage}
                onSaveFavorite={message.role === 'assistant' ? () => toggleFavorite(text, message.modelSlug || selectedSlug) : undefined}
                onExportMessage={message.role === 'assistant' ? () => exportAssistantMessage(message, messageModel.name) : undefined}
                onContinueFromHere={message.role === 'assistant' ? () => sendMessage(null, 'Continue the previous answer from exactly where it stopped. Do not repeat completed content.') : undefined}
                onViewModelInfo={message.role === 'assistant' ? () => setModelMenuOpen(true) : undefined}
                translate={t}
              />
            )}
            {message.role === 'assistant'
              && message.modelSlug === 'anonin'
              && text
              && !activelyStreaming
              && !editing && (
              <AnoninMessageReveal
                messageId={message.id}
                conversationId={activeConversationId}
                revealed={Boolean(message.anoninRevealed)}
                revealData={message.anoninReveal}
                disabled={isSending}
                translate={t}
                onRevealed={(payload) => {
                  setMessages((current) => current.map((item, idx) => (
                    idx === index
                      ? {
                        ...item,
                        anoninRevealed: true,
                        anoninReveal: {
                          providerLabel: payload.providerLabel,
                          modelLabel: payload.modelLabel,
                          actualSlug: payload.actualSlug,
                          fallbackFromSlug: payload.fallbackFromSlug,
                        },
                      }
                      : item
                  )));
                }}
              />
            )}
            </div>
           </article>
            })}
          {isSending && !messages.some((message) => message.webSearching || message.webSearchStatus) && (() => {
            const last = messages[messages.length - 1];
            const lastAssistantText = last?.role === 'assistant'
              ? String(last.text || last.content || '').trim()
              : '';
            if (lastAssistantText) return null;
            return (
              <article className="chat-message assistant thinking-message">
                <span className="thinking-avatar" aria-hidden="true"><i /></span>
                <div>
                  <small>{selectedModel.name}</small>
                  <p className="typing-indicator"><b>Thinking<span className="thinking-dots"><i /><i /><i /></span></b></p>
                </div>
              </article>
            );
          })()}
          {historyLoadError && !chatError && (
            <div className="chat-api-error" role="alert">
              <span>{historyLoadError}</span>
              <div>
                <button type="button" onClick={() => { void refreshHistory(); }}>Retry loading chats</button>
              </div>
            </div>
          )}
          {chatError && <div className="chat-api-error" role="alert"><span>{chatError}</span><div>{/(microphone|speech|voice recognition)/i.test(chatError) ? <><button type="button" onClick={() => { setChatError(''); toggleVoiceInput(); }}>Try microphone again</button><button type="button" onClick={() => setChatError('')}>Dismiss</button></> : !sessionExpired && <button type="button" disabled={isSending} onClick={() => {
            const lastUserIndex = messages.findLastIndex((message) => message.role === 'user');
            if (lastUserIndex >= 0) {
              const message = messages[lastUserIndex];
              sendMessage(null, message.text || message.content, messages.slice(0, lastUserIndex), message.imageUrl || message.image ? { url: message.imageUrl || message.image } : null);
            }
          }}>Retry message</button>}</div></div>}
          {sessionExpired && <SessionRecovery user={user} onSuccess={() => {
            setSessionExpired(false);
            setChatError('Signed in successfully. You can now retry your message.');
          }} />}
          {usageLimitNotice && (
            <UsageLimitWarning
              languageCode={language?.code || 'en'}
              resetAt={usageLimitNotice.resetAt}
              showPlans={Boolean(creditStatus && !creditStatus.hasSubscription)}
              onExpired={() => setUsageLimitNotice(null)}
            />
          )}
          <div className="chat-scroll-tail" ref={messagesEnd} aria-hidden="true" />
          </div>
        </div>

        <form className={`chat-composer chat-composer-modern ${messages.length === 0 ? 'welcome-composer' : 'conversation-composer'}`} onSubmit={sendMessage}>
          <div className="chat-composer-container">
          {isAnoninModelSlug(selectedSlug) && (
            <div className="anonin-mode-bar" role="group" aria-label={t('Anonin routing strategy')}>
              <span>{t('Anonin Model')}</span>
              <button
                type="button"
                className={anoninStrategy === 'random' ? 'active' : ''}
                aria-pressed={anoninStrategy === 'random'}
                onClick={() => {
                  setAnoninStrategy('random');
                  safeStorageSet('localStorage', 'allmodelai_anonin_strategy', 'random');
                }}
              >
                {t('Random')}
              </button>
              <button
                type="button"
                className={anoninStrategy === 'smart' ? 'active' : ''}
                aria-pressed={anoninStrategy === 'smart'}
                onClick={() => {
                  setAnoninStrategy('smart');
                  safeStorageSet('localStorage', 'allmodelai_anonin_strategy', 'smart');
                }}
              >
                {t('Smart')}
              </button>
              <button
                type="button"
                className={anoninStrategy === 'per_message' ? 'active' : ''}
                aria-pressed={anoninStrategy === 'per_message'}
                onClick={() => {
                  setAnoninStrategy('per_message');
                  safeStorageSet('localStorage', 'allmodelai_anonin_strategy', 'per_message');
                }}
              >
                {t('New model each message')}
              </button>
            </div>
          )}
          <div className="composer-quick-texts">
            <button type="button" onClick={() => chooseSuggestion(t('Write a short story about a time traveler.'))}>{t('Write a short story about a time traveler.')}</button>
            <button type="button" onClick={() => chooseSuggestion(t('Summarize the main benefits of daily exercise.'))}>{t('Summarize the main benefits of daily exercise.')}</button>
            <button type="button" onClick={() => chooseSuggestion(t('Help me plan a budget for a trip to Europe.'))}>{t('Help me plan a budget for a trip to Europe.')}</button>
          </div>
          <div className="composer-shell" ref={composerShellRef}>
            {composerMenuOpen && (
              <div className="composer-menu" role="menu" aria-label={t('Composer tools')}>
                <button
                  type="button"
                  role="menuitem"
                  aria-pressed={!selectedSkill}
                  disabled={isSending}
                  onClick={() => {
                    setSelectedSkill(null);
                    setComposerMenuOpen(false);
                    document.querySelector('.chat-composer textarea')?.focus();
                  }}
                >
                  <span className="composer-menu-icon"><IconMessageSquare /></span>
                  Chat
                </button>
                <button
                  type="button"
                  role="menuitem"
                  aria-pressed={selectedSkill === 'file'}
                  disabled={isSending}
                  onClick={() => chooseSkill('file')}
                >
                  <span className="composer-menu-icon"><IconFileCode /></span>
                  Create files
                </button>
                <button
                  type="button"
                  role="menuitem"
                  aria-pressed={selectedSkill === 'image'}
                  disabled={isSending}
                  onClick={() => {
                    toggleImageSkill();
                    setComposerMenuOpen(false);
                  }}
                >
                  <span className="composer-menu-icon"><IconImage /></span>
                  Image
                </button>
                <button
                  type="button"
                  role="menuitem"
                  aria-pressed={selectedSkill === 'deep-research'}
                  disabled={isSending}
                  onClick={() => chooseSkill('deep-research')}
                >
                  <span className="composer-menu-icon"><IconSearchDeep /></span>
                  Deep Research
                </button>
                <div className="composer-menu-divider" role="separator" aria-hidden="true" />
                <button type="button" role="menuitem" onClick={() => { setComposerMenuOpen(false); setVoicePanelOpen((open) => !open); }}>
                  <span className="composer-menu-icon"><IconVolume /></span>
                  Voice mode
                </button>
                <button type="button" role="menuitem" onClick={() => { setComposerMenuOpen(false); fileInput.current?.click(); }}>
                  <span className="composer-menu-icon"><IconCamera /></span>
                  Send screenshot / photo (Ctrl+V)
                </button>
                <button type="button" role="menuitem" onClick={() => { setComposerMenuOpen(false); fileInput.current?.click(); }}>
                  <span className="composer-menu-icon"><IconPaperclip /></span>
                  Attach files &amp; documents
                </button>
                <button type="button" role="menuitem" onClick={() => chooseSkill('video')}>
                  <span className="composer-menu-icon"><IconVideo /></span>
                  Make video
                </button>
                <button type="button" role="menuitem" onClick={() => chooseSkill('web')}>
                  <span className="composer-menu-icon"><IconGlobe /></span>
                  Search the web
                </button>
                <button type="button" role="menuitem" onClick={toggleKnowledgeBaseFromMenu} aria-pressed={useKnowledgeBase}>
                  <span className="composer-menu-icon"><IconToolKnowledgeBase /></span>
                  {useKnowledgeBase ? 'Knowledge Base on' : 'Use Knowledge Base'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!messages.some((message) => message.role === 'assistant' && (message.text || message.content))}
                  onClick={() => { setComposerMenuOpen(false); sendMessage(null, 'Continue the previous answer from exactly where it stopped. Do not repeat completed content.'); }}
                >
                  <span className="composer-menu-icon"><IconArrowRight /></span>
                  Continue last answer
                </button>
                <button type="button" role="menuitem" disabled={!activeConversationId || !messages.length} onClick={() => { setComposerMenuOpen(false); branchCurrentConversation(); }}>
                  <span className="composer-menu-icon"><IconGitBranch /></span>
                  Branch conversation
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!messages.some((message) => message.role === 'assistant' && (message.text || message.content))}
                  onClick={() => {
                    const last = [...messages].reverse().find((message) => message.role === 'assistant' && (message.text || message.content));
                    if (last) toggleFavorite(last.text || last.content, last.modelSlug);
                    setComposerMenuOpen(false);
                  }}
                >
                  <span className="composer-menu-icon"><IconStar /></span>
                  Save last answer
                </button>
              </div>
            )}
            <div className="composer-box">
              <div className="composer-box-extras">
              {selectedSkill === 'deep-research' && (
                <div className="research-depth-switch" role="group" aria-label="Research depth">
                  {['quick', 'deep', 'maximum'].map((level) => (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={researchDepth === level}
                      onClick={() => setResearchDepth(level)}
                    >
                      {level === 'quick' ? 'Quick' : level === 'deep' ? 'Deep' : 'Maximum'}
                    </button>
                  ))}
                </div>
              )}
              {voicePanelOpen && (
                <section className="voice-panel is-open" aria-label="Voice mode settings">
                  <div className="voice-panel__header">
                    <strong>Voice conversation</strong>
                    <div className="voice-panel__actions">
                      <button
                        type="button"
                        className={voiceMode ? 'voice-toggle active' : 'voice-toggle'}
                        onClick={changeVoiceMode}
                        aria-pressed={voiceMode}
                      >
                        {voiceMode ? 'On' : 'Off'}
                      </button>
                      <button
                        type="button"
                        className="voice-panel__close"
                        onClick={() => setVoicePanelOpen(false)}
                        aria-label="Close voice settings"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <p className="voice-panel__desc">
                    Send speech automatically and read every AI response aloud.
                    {' '}
                    <Link to="/voice-studio">Open Voice Studio</Link>
                    {' '}
                    for male/female voices, speed, and previews.
                  </p>
                  <label>
                    Language
                    <select
                      value={speechLanguage}
                      onChange={(event) => {
                        setSpeechLanguage(event.target.value);
                        safeStorageSet('localStorage', 'allmodelai_voice_language', event.target.value);
                      }}
                    >
                      <option value="en-US">English</option>
                      <option value="uk-UA">Українська</option>
                      <option value="ru-RU">Русский</option>
                      <option value="de-DE">Deutsch</option>
                      <option value="pl-PL">Polski</option>
                      <option value="es-ES">Español</option>
                      <option value="fr-FR">Français</option>
                    </select>
                  </label>
                  <label>
                    Voice
                    <select
                      value={selectedVoice}
                      onChange={(event) => {
                        setSelectedVoice(event.target.value);
                        safeStorageSet('localStorage', 'allmodelai_voice_name', event.target.value);
                      }}
                    >
                      <option value="">Automatic</option>
                      {availableVoices.map((voice) => (
                        <option value={voice.name} key={`${voice.name}-${voice.lang}`}>
                          {voice.name} ({voice.lang})
                        </option>
                      ))}
                    </select>
                  </label>
                  {isSpeaking && (
                    <button type="button" className="stop-speaking" onClick={stopSpeaking}>
                      Stop speaking
                    </button>
                  )}
                </section>
              )}
              {useKnowledgeBase && (
                <div className="composer-kb-chip" role="status">
                  <span className="composer-kb-chip-icon" aria-hidden="true">
                    <IconToolKnowledgeBase />
                  </span>
                  <span className="composer-kb-chip-label">{t('Knowledge Base')}</span>
                  <button
                    type="button"
                    className="composer-kb-chip-remove"
                    onClick={() => setKnowledgeBaseActive(false)}
                    aria-label={t('Turn off Knowledge Base for this chat')}
                  >
                    ×
                  </button>
                </div>
              )}
              {selectedSkill && (
                <div className={`selected-skill selected-skill--${selectedSkill}`} role="status">
                  <span className={`selected-skill-icon ${selectedSkill}`} aria-hidden="true">
                    {selectedSkill === 'file' && <IconFileCode />}
                    {selectedSkill === 'image' && <IconImage />}
                    {selectedSkill === 'web' && <IconGlobe />}
                    {selectedSkill === 'deep-research' && <IconSearchDeep />}
                    {selectedSkill === 'video' && <IconVideo />}
                  </span>
                  <span className="selected-skill__copy">
                    <strong>
                      {selectedSkill === 'file'
                        ? 'Create file'
                        : selectedSkill === 'image'
                          ? 'Create image'
                          : selectedSkill === 'web'
                            ? 'Search the web'
                            : selectedSkill === 'deep-research'
                              ? 'Deep Research'
                              : 'Make a video'}
                    </strong>
                    <small>
                      {selectedSkill === 'file'
                        ? 'Describe a text or code file. Open, copy and download the result.'
                        : selectedSkill === 'image'
                          ? 'Write a description and press send'
                          : selectedSkill === 'web'
                            ? 'Current information with sources'
                            : selectedSkill === 'deep-research'
                              ? 'Multi-step web research with live progress and cited sources'
                              : 'Describe the video you want to create'}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="selected-skill-remove"
                    onClick={() => setSelectedSkill(null)}
                    aria-label="Remove selected skill"
                    title="Remove skill"
                  >
                    ×
                  </button>
                </div>
              )}
              {(selectedSkill === 'web' || selectedSlug === 'smart') && (
                <div className="web-search-filters" role="group" aria-label="Web search filters">
                  <select
                    value={webSearchFilters.topic}
                    onChange={(event) => setWebSearchFilters((prev) => ({ ...prev, topic: event.target.value }))}
                    aria-label="Search topic"
                    disabled={isSending}
                  >
                    <option value="general">General web</option>
                    <option value="news">News</option>
                  </select>
                  <select
                    value={webSearchFilters.days}
                    onChange={(event) => setWebSearchFilters((prev) => ({ ...prev, days: event.target.value }))}
                    aria-label="Date range"
                    disabled={isSending}
                  >
                    <option value="">Any time</option>
                    <option value="1">Past day</option>
                    <option value="7">Past week</option>
                    <option value="30">Past month</option>
                    <option value="90">Past 3 months</option>
                  </select>
                  <select
                    value={webSearchFilters.language}
                    onChange={(event) => setWebSearchFilters((prev) => ({ ...prev, language: event.target.value }))}
                    aria-label="Language"
                    disabled={isSending}
                  >
                    <option value="">Any language</option>
                    <option value="en">English</option>
                    <option value="ru">Russian</option>
                    <option value="uk">Ukrainian</option>
                    <option value="pl">Polish</option>
                    <option value="de">German</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </select>
                  <select
                    value={webSearchFilters.region}
                    onChange={(event) => setWebSearchFilters((prev) => ({ ...prev, region: event.target.value }))}
                    aria-label="Region"
                    disabled={isSending}
                  >
                    <option value="">Any region</option>
                    <option value="US">United States</option>
                    <option value="EU">Europe</option>
                    <option value="UA">Ukraine</option>
                    <option value="PL">Poland</option>
                    <option value="GB">United Kingdom</option>
                    <option value="DE">Germany</option>
                  </select>
                </div>
              )}
              {selectedSkill === 'image' && (
                <div className="image-skill-panel" aria-label="Image generation options">
                  <div className="image-count-switch" role="group" aria-label="Number of images">
                    {IMAGE_COUNT_OPTIONS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        aria-pressed={imageGenerationCount === count}
                        className={imageGenerationCount === count ? 'is-active' : ''}
                        disabled={isSending}
                        onClick={() => setImageGenerationCount(count)}
                      >
                        {count === 1 ? '1 image' : `${count} images`}
                      </button>
                    ))}
                  </div>
                  <label>
                    Quality
                    <select
                      value={imageGenerationQuality}
                      onChange={(event) => setImageGenerationQuality(event.target.value)}
                      aria-label="Image quality"
                    >
                      {(imageProviderStatus?.qualities?.length
                        ? IMAGE_QUALITIES.filter((item) => imageProviderStatus.qualities.includes(item.id))
                        : IMAGE_QUALITIES
                      ).map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Format
                    <select
                      value={imageGenerationAspect}
                      onChange={(event) => setImageGenerationAspect(event.target.value)}
                      aria-label="Image format"
                    >
                      {(imageProviderStatus?.aspects?.length
                        ? IMAGE_ASPECTS.filter((item) => imageProviderStatus.aspects.includes(item.id))
                        : IMAGE_ASPECTS
                      ).map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  {imageProviderStatus?.multiImageBillingNote && imageGenerationCount > 1 && (
                    <p className="image-skill-hint" role="note">
                      {imageProviderStatus.batchInSingleRequest && imageGenerationCount <= (imageProviderStatus.maxBatchCount || 4)
                        ? `Up to ${imageGenerationCount} images in one provider request when supported. `
                        : ''}
                      {imageProviderStatus.multiImageBillingNote}
                    </p>
                  )}
                </div>
              )}
              {selectedSkill === 'video' && (
                <VideoGenerationPanel
                  prompt={videoDraftPrompt}
                  onPromptChange={setVideoDraftPrompt}
                  mode={videoMode}
                  onModeChange={setVideoMode}
                  aspectRatio={videoAspectRatio}
                  onAspectRatioChange={setVideoAspectRatio}
                  resolution={videoResolution}
                  onResolutionChange={setVideoResolution}
                  durationSeconds={videoDurationSeconds}
                  onDurationChange={setVideoDurationSeconds}
                  provider={videoProvider}
                  onProviderChange={setVideoProvider}
                  referenceImageUrl={videoReferenceImage}
                  onReferenceImageChange={setVideoReferenceImage}
                  useLastImage={videoUseLastImage}
                  onUseLastImageChange={setVideoUseLastImage}
                  lastAssistantImageUrl={lastAssistantImageUrl}
                  providerStatus={videoProviderStatus}
                  activeJobs={activeVideoJobs}
                  pendingJobId={readPendingVideoJobId()}
                  busy={isSending}
                  onResumeJob={(jobId) => {
                    void resumeVideoJob(jobId || activeVideoJobs[0]?.jobId || readPendingVideoJobId());
                  }}
                  onGenerate={() => {
                    const videoPrompt = videoDraftPrompt.trim() || prompt.trim();
                    if (!videoPrompt || isSending || videoSubmitLockRef.current) return;
                    void sendMessage(null, videoPrompt, undefined, null, {
                      forceVideo: true,
                      videoMode,
                      wait: false,
                    });
                  }}
                />
              )}
              {attachedImage && (
                <div className="attached-image-preview">
                  <div className="attached-image-info">
                    <img src={attachedImage.url} alt="Attached screenshot preview" onClick={() => setPreviewModalImage(attachedImage.url)} title="Click to preview" />
                    <div className="attached-image-meta">
                      <strong>📷 {attachedImage.name}</strong>
                      <small>{attachedImage.size} · {imageUploadBusy ? 'Preparing image…' : 'Screenshot attached · vision ready'}</small>
                    </div>
                    <button type="button" className="remove-attached-image" onClick={() => setAttachedImage(null)} title="Remove attached image" aria-label="Remove attached image">✕</button>
                  </div>
                  <div className="image-action-chips">
                    <button type="button" onClick={() => setPrompt('Carefully examine this screenshot. Guide me on where to click and what steps to take in order.')}>🎯 Where to click?</button>
                    <button type="button" onClick={() => setPrompt('Describe in detail everything shown on this screen/screenshot.')}>🔍 What is on screen?</button>
                    <button type="button" onClick={() => setPrompt('There is an error or issue visible in this screenshot. Explain what caused it and provide step-by-step instructions on how to fix it.')}>🛠️ Fix error</button>
                    <button type="button" onClick={() => setPrompt('Extract all visible text, labels, and code snippets from this screenshot.')}>📋 Extract text &amp; code</button>
                  </div>
                </div>
              )}
              </div>
              <input ref={fileInput} className="chat-file-input" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf,.txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.py,.html,.css" onChange={readFile} />
              <div className="composer-input-row">
                <button
                  type="button"
                  className="composer-plus"
                  onClick={() => setComposerMenuOpen((open) => !open)}
                  aria-label={t('Open tools')}
                  aria-expanded={composerMenuOpen}
                  aria-haspopup="menu"
                >
                  <IconPlus />
                </button>
                <textarea
                  ref={composerInputRef}
                  className="composer-prompt-input"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (!isSending) sendMessage();
                    }
                  }}
                  placeholder={composerPlaceholder}
                  rows={1}
                  aria-label={t('Chat message')}
                />
                <div className="composer-actions">
                  <button
                    type="button"
                    className={voiceInputState !== 'idle' ? 'voice-active' : ''}
                    onClick={toggleVoiceInput}
                    aria-pressed={voiceInputState !== 'idle'}
                    aria-label={voiceInputState !== 'idle' ? 'Stop microphone' : t('Use microphone')}
                    title={voiceInputState !== 'idle' ? 'Stop microphone' : t('Use microphone')}
                  >
                    <IconMic />
                  </button>
                  {isSending ? (
                    <button className="stop-generation" type="button" onClick={stopGenerating} aria-label={t('Stop generating')} title={t('Stop generating')}>
                      <i />
                    </button>
                  ) : (
                    <button className="send-message" type="submit" disabled={!prompt.trim() && !attachedImage} aria-label={t('Send message')} title={t('Send message')}>
                      <IconSendUp />
                    </button>
                  )}
                </div>
              </div>
              {contextSuggestions.length > 0 && !isSending && !attachedImage && (
                <div className="context-suggestions">
                  {contextSuggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setPrompt(item);
                        composerInputRef.current?.focus();
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
              <p className="composer-status" aria-live="polite">{composerStatusText}</p>
            </div>
          </div>
          <p>{selectedModel.name} can make mistakes. Check important information.</p>
          </div>
        </form>
        </div>
      </section>
      {previewModalImage && (
        <div className="image-lightbox-modal" onClick={() => setPreviewModalImage(null)}>
          <div className="lightbox-content" onClick={(event) => event.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setPreviewModalImage(null)} aria-label="Close image preview">✕</button>
            <img src={previewModalImage} alt="Full resolution screenshot preview" />
            <div className="lightbox-actions">
              <button type="button" onClick={() => downloadOriginalImage(previewModalImage).catch(() => setChatError('Could not download the original image.'))}>↓ Download image</button>
            </div>
          </div>
        </div>
      )}
      {projectModalOpen && (
        <CreateProjectModal
          onClose={() => setProjectModalOpen(false)}
          onCreate={finalizeCreateProject}
        />
      )}
      {deleteModalOpen && <AccountDeleteModal onCancel={() => { setDeleteModalOpen(false); setDeleteError(''); }} onConfirm={deleteAccount} isDeleting={isDeleting} error={deleteError} />}
      {confirmDialog && (
        <ConfirmDialog
          open
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel || t('Cancel') || 'Cancel'}
          destructive={confirmDialog.destructive !== false}
          loading={confirmBusy}
          error={confirmError}
          onConfirm={runConfirmDialogAction}
          onCancel={closeConfirmDialog}
        />
      )}
      {arenaOpen && <div className="feature-modal-backdrop" onClick={() => setArenaOpen(false)}><section className="feature-modal" onClick={(event) => event.stopPropagation()}><span className="feature-modal-icon">⚔</span><small>AI ARENA</small><h2>Compare the best models</h2><p>Describe the exact task you want the models to compare.</p><textarea autoFocus value={arenaTask} onChange={(event) => setArenaTask(event.target.value)} placeholder="Example: Build a launch plan for my new fitness app" rows="3" /><div className="arena-models"><span>GPT</span><span>Claude</span><span>Gemini</span><span>Grok</span></div><button disabled={!arenaTask.trim()} onClick={launchArena}>Create comparison prompt</button><button className="modal-cancel" onClick={() => setArenaOpen(false)}>{t("Cancel")}</button></section></div>}
      <PremiumUpgradeModal
        open={premiumUpgradeOpen}
        modelName={premiumUpgradeTarget.name}
        onSubscribe={() => navigateToProCheckout(premiumUpgradeTarget.slug, premiumUpgradeTarget.variantId)}
        onDismiss={() => setPremiumUpgradeOpen(false)}
      />
      {subscribeModalOpen && <div className="feature-modal-backdrop" onClick={() => setSubscribeModalOpen(false)}><section className="feature-modal subscribe-modal" onClick={(event) => event.stopPropagation()}>
        <span className="feature-modal-icon">💎</span><small>{t('SUBSCRIPTION')}</small>
        {!subscribePlan ? <>
          <h2>{t('Choose your subscription plan')}</h2>
          <div className="subscribe-plans">
            {subscriptionPlans.map((plan) => <button type="button" key={plan.id} className={`subscribe-plan ${plan.popular ? 'popular' : ''}`} onClick={() => {
              setSubscribeError('');
              setSubscribePlan(plan);
              if (!creditStatus?.isDeveloper && primaryPaymentProvider !== 'wayforpay') {
                setSubscribeModalOpen(false);
                navigate(`/checkout?plan=${encodeURIComponent(CHAT_PLAN_TO_CHECKOUT[plan.id] || 'pro')}`);
              }
            }}>
              <span className="subscribe-plan-icon">{plan.icon}</span>
              <strong>{plan.name}</strong>
              <em>{plan.price} / {plan.period}</em>
              <ul>{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul>
              {plan.popular && <b className="subscribe-popular-badge">{t('Most popular')}</b>}
            </button>)}
          </div>
        </> : <>
          <h2>{subscribePlan.name} — {subscribePlan.price} / {subscribePlan.period}</h2>
          {creditStatus?.isDeveloper ? (
            <>
              <p className="subscribe-dev-note">🧪 {t('Developer account: test payment form only. No real money is charged.')}</p>
              <div className="subscribe-form">
                <input type="text" inputMode="numeric" placeholder={t('Card number (0000 0000 0000 0000)')} value={subscribeForm.cardNumber} onChange={(event) => updateSubscribeForm('cardNumber', event.target.value)} />
                <input type="text" placeholder={t('Cardholder name')} value={subscribeForm.holder} onChange={(event) => updateSubscribeForm('holder', event.target.value)} />
                <input type="email" placeholder={t('Email')} value={subscribeForm.email} onChange={(event) => updateSubscribeForm('email', event.target.value)} />
                <input type="text" placeholder={t('City')} value={subscribeForm.city} onChange={(event) => updateSubscribeForm('city', event.target.value)} />
                <input type="text" placeholder={t('Date of birth (day and month)')} value={subscribeForm.birthDate} onChange={(event) => updateSubscribeForm('birthDate', event.target.value)} />
                <div className="subscribe-form-row">
                  <input type="text" inputMode="numeric" placeholder={t('MM / YY')} value={subscribeForm.expiry} onChange={(event) => updateSubscribeForm('expiry', event.target.value)} />
                  <input type="text" inputMode="numeric" placeholder={t('CVC')} value={subscribeForm.cvc} onChange={(event) => updateSubscribeForm('cvc', event.target.value)} />
                </div>
              </div>
            </>
          ) : primaryPaymentProvider === 'wayforpay' ? (
            <>
              <p className="subscribe-stripe-label">{t('Secure checkout — card, Apple Pay, or Google Pay via WayForPay')}</p>
              {wayforpayTestMode && (
                <p className="subscribe-dev-note">{t('TEST MODE — NO REAL MONEY WILL BE CHARGED. Test payment simulates a WayForPay callback on the server.')}</p>
              )}
              <button
                disabled={subscribeBusy}
                className="subscribe-confirm"
                type="button"
                onClick={() => {
                  setWayforpayCheckoutCtx({
                    planKey: CHAT_PLAN_TO_CHECKOUT[subscribePlan.id] || 'common',
                    planTitle: `${subscribePlan.name} — ${subscribePlan.price}`,
                    priceLabel: subscribePlan.price,
                  });
                  wayforpayPaySucceededRef.current = false;
                  setWayforpayPayOpen(true);
                }}
              >
                {t('Continue to payment')} · {subscribePlan.price}
              </button>
            </>
          ) : (
            <>
              <div className="subscribe-checkout-review">
                <dl>
                  <div><dt>{t('Plan')}</dt><dd>{subscribePlan.name}</dd></div>
                  <div><dt>{t('Price')}</dt><dd>{subscribePlan.price} / {subscribePlan.period}</dd></div>
                  <div><dt>{t('Total due today')}</dt><dd>{subscribePlan.price}</dd></div>
                  <div><dt>{t('Billing')}</dt><dd>{t('Renews monthly until you cancel')}</dd></div>
                </dl>
                <ul>
                  {subscribePlan.features.map((feature) => (
                    <li key={feature}>✓ {feature}</li>
                  ))}
                </ul>
                <p className="subscribe-secure-note">
                  {t('You will complete payment on Stripe’s secure checkout (cards, Apple Pay, Google Pay, and Link when available). We never store your card details.')}
                </p>
              </div>
              {subscribeError && (
                <div className="subscribe-stripe-slot__error" role="alert">{subscribeError}</div>
              )}
              <button
                disabled={subscribeBusy || !paymentsConfigLoaded}
                className="subscribe-confirm"
                type="button"
                onClick={submitSubscription}
              >
                {subscribeBusy ? t('Processing…') : t('Continue to secure checkout')}
              </button>
              <button
                type="button"
                className="subscribe-confirm subscribe-confirm-secondary"
                onClick={() => { setSubscribePlan(null); setSubscribeError(''); }}
              >
                {t('Change plan')}
              </button>
            </>
          )}
          {creditStatus?.isDeveloper ? (
            <button disabled={subscribeBusy} className="subscribe-confirm" type="button" onClick={submitSubscription}>
              {subscribeBusy ? t('Processing…') : `${t('Activate test plan')} · ${subscribePlan.price}`}
            </button>
          ) : null}
          <button
            type="button"
            className="modal-cancel"
            onClick={() => {
              setSubscribePlan(null);
              setSubscribeError('');
            }}
          >
            ← {t('Back to plans')}
          </button>
        </>}
        <button className="modal-cancel" onClick={() => setSubscribeModalOpen(false)}>{t('Cancel')}</button>
      </section></div>}
      {feedbackModalOpen && <div className="feature-modal-backdrop" onClick={() => setFeedbackModalOpen(false)}><section className="feature-modal" onClick={(event) => event.stopPropagation()}><span className="feature-modal-icon">💬</span><small>FEEDBACK</small><h2>Tell us what this response did well</h2><p>Your feedback helps improve the model.</p><textarea autoFocus value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} placeholder="Example: very clear explanation, great code example" rows="4" /><div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:12}}><button className="modal-cancel" onClick={() => setFeedbackModalOpen(false)}>{t("Cancel")}</button><button disabled={!feedbackText.trim()} onClick={submitFeedback}>Send feedback</button></div></section></div>}
      <AiCreditsPurchaseDialog open={aiCreditsPurchaseOpen} onClose={() => setAiCreditsPurchaseOpen(false)} t={t} />
      <WayforpayPaymentModal
        open={wayforpayPayOpen && Boolean(wayforpayCheckoutCtx?.planKey)}
        onClose={() => {
          setWayforpayPayOpen(false);
          setWayforpayCheckoutCtx(null);
          if (wayforpayPaySucceededRef.current) {
            wayforpayPaySucceededRef.current = false;
            setSubscribeModalOpen(false);
            setSubscribePlan(null);
          }
        }}
        planKey={wayforpayCheckoutCtx?.planKey}
        planTitle={wayforpayCheckoutCtx?.planTitle}
        priceLabel={wayforpayCheckoutCtx?.priceLabel}
        httpClient={apiFetch}
        serverTestMode={wayforpayTestMode}
        developerMode={false}
        userEmail={user?.email || ''}
        currency={wayforpayCurrency}
        onCurrencyChange={setWayforpayCurrency}
        t={t}
        onPaymentSuccess={async () => {
          wayforpayPaySucceededRef.current = true;
          await refreshCreditsAfterPayment();
          logger.success(t('Subscription updated'));
        }}
      />
    </main>
  );
}
