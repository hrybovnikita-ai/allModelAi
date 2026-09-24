import { parseGeneratedFile } from '../../lib/generatedFiles';
import { FileCard } from '../GeneratedFile/GeneratedFile';
import { createVoiceInput } from '../../lib/voiceInput';
import ImageGenerator from '../ImageGenerator/ImageGenerator';
import { useLanguage } from '../../lib/useLanguage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams, useOutletContext } from 'react-router-dom';
import { Highlight } from 'prism-react-renderer';
import { Prism, codeTheme, languageAliases } from '../../lib/codeHighlight';
import { dashboardModels } from '../../data/dashboardModels';
import { apiFetch, checkChatResponse } from '../../lib/api';
import { logger, timingElapsed, timingNow } from '../../lib/logger';
import { clearAllSessionData } from '../../lib/session';
import SessionRecovery from './SessionRecovery';
import WebSources, { WebSearchStatus } from './WebSources';
import './Chat.css';
import './ChatApi.css';
import AccountDeleteModal from '../AccountDeleteModal';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';

// const quickPrompts = [
// 'Write a short story about a time traveler.',
//  'Summarize the main benefits of daily exercise.',
//  'Help me plan a budget for a trip to Europe.',
// ];

const suggestions = [
  { icon: '✦', title: 'Create an idea', prompt: 'Give me three original product ideas for students.' },
  { icon: '</>', title: 'Explain code', prompt: 'Explain React useEffect with a simple example.' },
  { icon: '◎', title: 'Compare models', prompt: 'Compare Claude, Gemini, GPT, and Llama.' },
];

const chatTextColors = [
  ['Blue', '#3b82f6'], ['Yellow', '#facc15'], ['Purple', '#a855f7'],
  ['Lime', '#a3e635'], ['Orange', '#f97316'], ['Red', '#ef4444'],
  ['Red orange', '#ff4500'], ['Violet', '#8b5cf6'], ['Gray', '#9ca3af'],
  ['Green yellow', '#adff2f'],
];

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const prismLanguage = languageAliases[language?.toLowerCase()] || language?.toLowerCase() || 'text';
  const copyCode = async () => {
    if (!await copyToClipboard(code)) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const downloadCode = () => {
    const extensions = { javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh', markup: 'html', css: 'css', cpp: 'cpp', csharp: 'cs', java: 'java', json: 'json' };
    const extension = extensions[prismLanguage] || String(language || 'txt').replace(/[^a-z0-9]/gi, '') || 'txt';
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `allmodelai-code.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <section className={`response-code-block ${wrapped ? 'code-wrapped' : ''}`}>
    <header><span>{language || 'code'}</span><div><button type="button" onClick={() => setWrapped((value) => !value)} aria-label="Toggle line wrapping">{wrapped ? 'Scroll' : 'Wrap'}</button><button type="button" onClick={downloadCode} aria-label="Download code">Download</button><button type="button" onClick={copyCode} aria-label="Copy code">{copied ? 'Copied!' : 'Copy'}</button></div></header>
    <Highlight prism={Prism} theme={codeTheme} code={code} language={prismLanguage}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={className} style={{ ...style, background: 'transparent' }}>
          <code>{tokens.map((line, lineIndex) => {
            const lineProps = getLineProps({ line });
            return <span {...lineProps} className={`${lineProps.className || ''} code-line`} key={lineIndex}>
              <span className="code-line-content">{line.map((token, tokenIndex) => <span {...getTokenProps({ token })} key={tokenIndex} />)}</span>
            </span>;
          })}</code>
        </pre>
      )}
    </Highlight>
  </section>;
}

function InlineText({ children }) {
  const tokens = String(children).split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((token, index) => {
    if (token.startsWith('`') && token.endsWith('`')) return <code className="inline-code" key={index}>{token.slice(1, -1)}</code>;
    if (token.startsWith('**') && token.endsWith('**')) return <strong key={index}>{token.slice(2, -2)}</strong>;
    return token;
  });
}

function TextBlock({ value }) {
  const lines = value.trim().split(/\r?\n/);
  const elements = [];
  let list = [];
  const flushList = () => {
    if (!list.length) return;
    elements.push(<ul key={`list-${elements.length}`}>{list.map((item, index) => <li key={index}><InlineText>{item}</InlineText></li>)}</ul>);
    list = [];
  };

  lines.forEach((line, index) => {
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    if (bullet) { list.push(bullet[1]); return; }
    flushList();
    const heading = line.match(/^\s*(#{1,3})\s+(.+)/);
    if (heading) {
      const Tag = `h${Math.min(heading[1].length + 2, 5)}`;
      elements.push(<Tag key={index}><InlineText>{heading[2]}</InlineText></Tag>);
    } else if (line.trim()) {
      elements.push(<p key={index}><InlineText>{line}</InlineText></p>);
    }
  });
  flushList();
  return elements;
}

function MessageContent({ text, streaming }) {
  const parts = [];
  const codePattern = /```([\w.+#-]*)[\t ]*\r?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codePattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    parts.push({ type: 'code', language: match[1], value: match[2].replace(/\n$/, '') });
    lastIndex = codePattern.lastIndex;
  }

  if (lastIndex < text.length) {
    const remainder = text.slice(lastIndex);
    // Long model responses can finish at the token limit before emitting the
    // closing fence. Keep a valid opening fence rendered as code after the
    // stream ends instead of reverting it to visible ```python plain text.
    const openFence = remainder.match(/(?:^|\n)[\t ]*```([\w.+#-]*)[\t ]*(?:\r?\n|$)([\s\S]*)$/);

    if (openFence) {
      const fenceIndex = openFence.index + (openFence[0].startsWith('\n') ? 1 : 0);
      const beforeFence = remainder.slice(0, fenceIndex);
      if (beforeFence) parts.push({ type: 'text', value: beforeFence });
      parts.push({ type: 'code', language: openFence[1], value: openFence[2] });
    } else {
      parts.push({ type: 'text', value: remainder });
    }
  }

  return <div className="message-content">
    {parts.map((part, index) => part.type === 'code'
      ? <CodeBlock language={part.language} code={part.value} key={`code-${index}`} />
      : part.value.trim() && <TextBlock value={part.value} key={`text-${index}`} />)}
    {streaming && <i className="stream-cursor" aria-hidden="true" />}
  </div>;
}


async function copyToClipboard(text) {
  try {
    if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  } catch {
    // iOS can deny clipboard access; keep manual copying available.
    globalThis.window?.prompt('Copy this text:', text);
    return false;
  }
}

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
  return dashboardModels.some((model) => model.slug === slug) ? slug : fallbackModel.slug;
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
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const messagesEnd = useRef(null);
  const messagesContainer = useRef(null);
  const fileInput = useRef(null);
  const activeRequest = useRef(null);
  const speechRecognition = useRef(null);
  const { user } = useOutletContext();
  const isGuest = user?.guest === true;
  const [selectedSlug, setSelectedSlug] = useState(() => {
    const requested =
      searchParams.get('model') ||
      safeStorageGet('localStorage', 'allmodelai_selected_model', 'gpt');
    return validModelSlug(requested);
  });
  const [prompt, setPrompt] = useState(location.state?.starterPrompt || '');
  const [isSending, setIsSending] = useState(false);
  const [imageGeneratorOpen, setImageGeneratorOpen] = useState(false);
  const [isStreamingResponse, setIsStreamingResponse] = useState(false);
  const [chatError, setChatError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [creditStatus, setCreditStatus] = useState(null);
  const [accessModeSaving, setAccessModeSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatMeta] = useState(() =>
    safeJSON(safeStorageGet('localStorage', 'allmodelai_chat_meta'), {})
  );
  const [historyQuery, setHistoryQuery] = useState('');
  const [messageRatings, setMessageRatings] = useState({});
  const [messageLikes, setMessageLikes] = useState(() =>
    safeJSON(safeStorageGet('localStorage', 'allmodelai_message_likes'), {})
  );

  const [messageFeedback, setMessageFeedback] = useState(() =>
    safeJSON(safeStorageGet('localStorage', 'allmodelai_message_feedback'), {})
  );

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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [temporaryChat, setTemporaryChat] = useState(false);
  const [projects, setProjects] = useState(() =>
    safeJSON(safeStorageGet('localStorage', 'allmodelai_projects'), []).filter((item) => item && typeof item.name === 'string')
  );
  const [activeProject, setActiveProject] = useState(null);
  const [projectMenuId, setProjectMenuId] = useState(null);
  const [arenaOpen, setArenaOpen] = useState(false);
  const [arenaTask, setArenaTask] = useState('');
  const [variantCatalog, setVariantCatalog] = useState({});
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [subscribePlan, setSubscribePlan] = useState(null);
  const [subscribeForm, setSubscribeForm] = useState({ cardNumber: '', holder: '', email: '', city: '', birthDate: '', expiry: '', cvc: '' });
  const [subscribeBusy, setSubscribeBusy] = useState(false);
  const [subscribeError, setSubscribeError] = useState('');

  const subscriptionPlans = [
    { id: 'starter', icon: '🌱', name: t('Starter'), price: '$5', period: t('per month'), features: [t('Basic models included'), t('Standard response speed'), t('Email support')] },
    { id: 'pro', icon: '🚀', name: t('Pro'), price: '$15', period: t('per month'), popular: true, features: [t('All AI models included'), t('Priority response speed'), t('Image generation'), t('Priority support')] },
    { id: 'unlimited', icon: '♾️', name: t('Unlimited'), price: '$30', period: t('per month'), features: [t('All AI models included'), t('Maximum response speed'), t('Unlimited image generation'), t('24/7 support')] },
  ];

  const openSubscribe = () => {
    setSubscribeError('');
    setSubscribePlan(null);
    setSubscribeForm({ cardNumber: '', holder: '', email: user.email || '', city: '', birthDate: '', expiry: '', cvc: '' });
    setSubscribeModalOpen(true);
  };

  const updateSubscribeForm = (field, value) => setSubscribeForm((form) => ({ ...form, [field]: value }));

  const submitSubscription = async () => {
    if (subscribeBusy) return;
    setSubscribeError('');
    if (subscribeForm.cardNumber.replace(/\D/g, '').length < 12 || !subscribeForm.holder.trim() || !subscribeForm.email.trim()) {
      setSubscribeError(t('Please fill in the payment details.'));
      return;
    }
    setSubscribeBusy(true);
    try {
      if (creditStatus?.canUseDeveloper) {
        // Developer mode: fake payment. Nothing is sent to the backend, no money is charged.
        setCreditStatus((current) => ({ ...(current || {}), mode: 'developer', models: ['all'], unlimited: true }));
      } else {
        const response = await apiFetch('/api/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: subscribePlan?.id, ...subscribeForm }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || t('Could not complete the subscription.'));
        setCreditStatus(data);
      }
      setSubscribeModalOpen(false);
      logger.success('Subscription activated — all models available');
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
  const [voiceInputState, setVoiceInputState] = useState('idle');
  const isListening = voiceInputState === 'listening';
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceMode, setVoiceMode] = useState(() => safeStorageGet('localStorage', 'allmodelai_voice_mode') === 'true');
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState(() => safeStorageGet('localStorage', 'allmodelai_voice_language') || globalThis.navigator?.language || 'en-US');
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(() => safeStorageGet('localStorage', 'allmodelai_voice_name') || '');
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
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [previewModalImage, setPreviewModalImage] = useState(null);
  const [contextSuggestions, setContextSuggestions] = useState([]);
  const activeConversationIdRef = useRef(null);
  const selectedModel = dashboardModels.find((model) => model.slug === selectedSlug) || fallbackModel;

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const modelIsOnline = (slug) => {
    if (!Object.keys(modelStatus).length || slug === 'smart') return true;
    const statusKey = ['gpt', 'gemini', 'claude', 'kimi', 'cloudflare', 'grok'].includes(slug) ? slug : 'others';
    return modelStatus[statusKey] !== false;
  };

  const modelAllowed = (slug) => slug === 'smart' || Boolean(creditStatus?.models?.includes('all') || creditStatus?.models?.includes(slug));
  const changeAccessMode = async (mode) => {
    if (isSending || accessModeSaving) return;
    setAccessModeSaving(true);
    setChatError('');
    try {
      const response = await apiFetch('/api/access-mode', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
      });
      const access = await response.json();
      if (!response.ok) throw new Error(access.message || 'Could not change the access mode.');
      setCreditStatus(access);
      if (!access.models.includes('all') && !access.models.includes(selectedSlug) && selectedSlug !== 'smart') {
        setSelectedSlug('gemini');
        safeStorageSet('localStorage', 'allmodelai_selected_model', 'gemini');
        navigate('/chat?model=gemini', { replace: true });
      }
      setModelMenuOpen(false);
      logger.router('Access mode changed', {
        mode: access.mode,
        unlimited: access.unlimited,
        models: access.models?.length,
      });
    } catch (error) {
      setChatError(error.message);
    } finally { setAccessModeSaving(false); }
  };

  const chooseModel = (model, version) => {

    if (version) {
      const next = { ...chosenVersions, [model.slug]: version.id };
      setChosenVersions(next);
      safeStorageSet('localStorage', 'allmodelai_model_versions', JSON.stringify(next));
    }

    if (!modelAllowed(model.slug)) { setChatError('This model is available with a subscription or in Developer mode.'); return; }
    const online = modelIsOnline(model.slug);
    setSelectedSlug(model.slug);
    safeStorageSet('localStorage', 'allmodelai_selected_model', model.slug);
    navigate(`/chat?model=${encodeURIComponent(model.slug)}`, { replace: true });
    if (model.slug === 'smart') {
      logger.action('Smart Router selected');
      logger.router('Chat mode selected', { provider: 'Smart Router' });
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

  useEffect(() => {
    apiFetch('/api/status/models')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.models) setModelStatus(data.models); if (data?.variants) setVariantCatalog(data.variants); })
      .catch(() => {});
  }, []);

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

  const refreshHistory = () => apiFetch(`/api/chat/history?email=${encodeURIComponent(user.email)}`)
    .then((response) => response.ok ? response.json() : [])
    .then((history) => setChatHistory(history))
    .catch(() => {});

  const loadContextSuggestions = useCallback(async (text) => {
    const value = String(text || '').trim();
    if (!value || isSending || isGuest) { setContextSuggestions([]); return; }
    try {
      const response = await apiFetch('/api/chat/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lastMessage: value }) });
      if (!response.ok) return;
      const data = await response.json();
      setContextSuggestions(Array.isArray(data.suggestions) ? data.suggestions.slice(0, 3) : []);
    } catch {
      setContextSuggestions([]);
    }
  }, [isGuest, isSending, setContextSuggestions]);

  const conversationPreview = (conversation) => {
    const firstUserMessage = conversation.messages?.find((message) => message.role === 'user');
    return String(firstUserMessage?.content ?? firstUserMessage?.text ?? 'Saved conversation').replace(/\s+/g, ' ').trim().slice(0, 54);
  };
  const visibleHistory = chatHistory
    .filter((conversation) => `${conversation.title} ${conversationPreview(conversation)} ${(conversation.messages || []).map((message) => message.text || message.content || '').join(' ')} ${(Array.isArray(chatMeta[conversation.id]?.tags) ? chatMeta[conversation.id].tags : []).join(' ')}`.toLowerCase().includes(historyQuery.toLowerCase()))
    .sort((first, second) => Number(Boolean(chatMeta[second.id]?.pinned)) - Number(Boolean(chatMeta[first.id]?.pinned)));
  const handleImageUpload = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setChatError('Please select a valid image or screenshot file (PNG, JPG, WebP, GIF, etc.).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setChatError('Image file is too large (max 25MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setAttachedImage({
        url: dataUrl,
        name: file.name || 'screenshot.png',
        size: `${(file.size / 1024).toFixed(0)} KB`,
        type: file.type,
      });
      logger.action('Attachment selected', { name: file.name || 'screenshot.png', type: file.type, sizeKb: Math.round(file.size / 1024) });
      setChatError('');
    };
    reader.onerror = () => {
      setChatError('Could not read the selected image file.');
    };
    reader.readAsDataURL(file);
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
  const rateMessage = (index, rating) => setMessageRatings((ratings) => ({ ...ratings, [index]: rating }));
  const likeMessage = (index) => {
    setMessageLikes((likes) => {
      const next = { ...likes, [index]: !likes[index] };
      safeStorageSet('localStorage', 'allmodelai_message_likes', JSON.stringify(next));
      return next;
    });
  };
  const openFeedback = (index) => { setFeedbackMessageIndex(index); setFeedbackText(''); setFeedbackModalOpen(true); };
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
  const retryMessage = (index) => {
    const previousUserMessage = messages.slice(0, index).reverse().find((message) => message.role === 'user');
    if (previousUserMessage) { setPrompt(previousUserMessage.content ?? previousUserMessage.text ?? ''); document.querySelector('.chat-composer textarea')?.focus(); }
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
        setCreditStatus(status);
        setSelectedSlug((current) => status.models.includes('all') || status.models.includes(current) || current === 'smart' ? current : 'gemini');
      })
      .catch(() => setCreditStatus(null));
  }, [user?.email, isGuest]);

  useEffect(() => {
    if (!user?.email || isGuest) return;
    apiFetch(`/api/chat/history?email=${encodeURIComponent(user.email)}`)
      .then((response) => response.ok ? response.json() : [])
      .then((history) => {
        setChatHistory(history);
        const requestedId = new URLSearchParams(window.location.search).get('conversation');
        const conversation = history.find(item => item.id === requestedId) || history[0];
        if (conversation?.messages?.length) {
          activeConversationIdRef.current = conversation.id;
          setActiveConversationId(conversation.id);
          setMessages(conversation.messages);
          setSelectedSlug(validModelSlug(conversation.model));
        }
      })
      .catch(() => {});
  }, [user?.email, isGuest]);

  useEffect(() => {
    const handler = setTimeout(() => loadContextSuggestions(prompt), 220);
    return () => clearTimeout(handler);
  }, [prompt, isSending, loadContextSuggestions]);

  if (!user) return <Navigate to="/" replace />;

  const sendMessage = async (event, overrideText, overrideMessages, overrideAttachment) => {
    event?.preventDefault();
    const rawText = String(overrideText ?? prompt).trim();
    const currentAttachment = overrideAttachment ?? attachedImage;
    const text = rawText || (currentAttachment ? 'Analyze this screenshot: describe in detail what is shown here and give me step-by-step guidance on where to click and what to do.' : '');
    if (!text || isSending) return;
    const generatingFile = selectedSkill === 'file';
    const generatingImage = !generatingFile && (selectedSkill === 'image' || (!currentAttachment && /^(?:нарисуй|сгенерируй\s+(?:изображение|картинку|фото)|создай\s+(?:изображение|картинку)|draw|generate\s+(?:an?\s+)?(?:image|picture|photo)|намалюй|згенеруй\s+зображення)/i.test(rawText)));
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
    setIsSending(true);
    const controller = new AbortController();
    activeRequest.current = controller;
    const assistantIndex = nextMessages.length;
    setMessages([...nextMessages, { role: 'assistant', text: generatingImage ? 'Creating your image… This may take a couple of minutes.' : selectedSkill === 'web' ? 'Searching the web…' : '', modelSlug: selectedSlug, generatingFile, webSearching:selectedSkill === 'web' }]);

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
        setMessages((current) => current.map((message, index) => index === assistantIndex ? { ...message, text: guestReply, webSearching: false } : message));
        setSelectedSkill(null);
        return;
      }
      let webSearchViaChat = false;
      if (selectedSkill === 'web') {
        let assistantText = '';
        let webSources = [];
        let webSearchComplete = false;
        setIsStreamingResponse(false);
        setMessages((current) => current.map((message, index) => (
          index === assistantIndex
            ? { ...message, text: '', webSearching: true, webSearchStatus: 'searching' }
            : message
        )));

        const webSearchQueryPreview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
        const loggedWebStages = new Set();
        const logWebStage = (stage, meta) => {
          if (loggedWebStages.has(stage)) return;
          loggedWebStages.add(stage);
          logger.search(stage, meta);
        };
        logger.group(`🌐 AllModelAI Web Search · ${webSearchQueryPreview}`, () => {
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
          }),
          signal: controller.signal,
        });

        if (researchResponse.status === 404) {
          webSearchViaChat = true;
          logger.search('Dedicated route unavailable — falling back to chat web search');
          setMessages((current) => current.map((message, index) => (
            index === assistantIndex
              ? { ...message, webSearchStatus: 'searching' }
              : message
          )));
        } else {
        await checkChatResponse(researchResponse);

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
            if (event.error) throw new Error(event.error);
            if (event.webSearchStatus) {
              const status = event.webSearchStatus;
              if (status === 'searching') logWebStage('Request started');
              if (status === 'results' && event.count != null) logWebStage(`Results received: ${event.count}`, { count: event.count });
              if (status === 'filtered' && event.count != null) logWebStage(`Sources filtered: ${event.count}`, { count: event.count });
              if (status === 'synthesizing') logWebStage('Sending sources to AI');
              setMessages((current) => current.map((message, index) => (
                index === assistantIndex
                  ? {
                    ...message,
                    webSearchStatus: event.webSearchStatus,
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
            if (event.webSources) {
              webSources = event.webSources;
              logWebStage(`Results received: ${event.webSources.length}`, { count: event.webSources.length });
            }
            if (event.webSearchComplete) {
              webSearchComplete = true;
              logWebStage('Search completed');
            }
          }
          if (done) break;
        }

        setMessages((current) => current.map((message, index) => (
          index === assistantIndex
            ? {
              ...message,
              text: assistantText || message.text,
              webSearching: false,
              webSearchStatus: null,
              webSources,
              webSearchComplete,
            }
            : message
        )));

        if (!temporaryChat) {
          let conversationId = activeConversationId;
          if (!conversationId) {
            const historyResponse = await apiFetch('/api/chat/history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: user.email, model: selectedSlug, messages: nextMessages }),
            });
            if (historyResponse.ok) {
              const conversation = await historyResponse.json();
              conversationId = conversation.id;
              if (activeConversationIdRef.current === startedConversationId) {
                activeConversationIdRef.current = conversation.id;
                setActiveConversationId(conversation.id);
              }
              setChatHistory((history) => [conversation, ...history]);
            }
          }
          if (conversationId) {
            await apiFetch(`/api/chat/history/${conversationId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: user.email,
                messages: [...nextMessages, {
                  role: 'assistant',
                  text: assistantText,
                  modelSlug: selectedSlug,
                  webSources,
                  webSearchComplete,
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
          mode: 'web-search',
          durationMs: timingElapsed(requestStartedAt),
        });
        return;
        }
      }
      if (generatingImage) {
        logger.action('Generate image', { promptLength: text.length });
        const imageResponse = await apiFetch('/api/images', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }), signal: controller.signal,
        });
        await checkChatResponse(imageResponse);
        const imageData = await imageResponse.json().catch(() => ({}));
        if (!imageResponse.ok || !imageData.imageUrl) throw new Error(imageData.message || 'Could not create the image.');
        const answer = { role: 'assistant', text: 'Done! Here is your image.', imageUrl: imageData.imageUrl };
        const stillOpen = () => activeConversationIdRef.current === startedConversationId;
        if (stillOpen()) setMessages([...nextMessages, answer]);
        if (!temporaryChat) {
          // The gallery is an optional device cache; storage limits must not discard a generated image.
          try {
            const cached = safeJSON(safeStorageGet('localStorage', 'allmodelai_image_gallery'), []);
            const gallery = Array.isArray(cached) ? cached : [];
            safeStorageSet('localStorage', 'allmodelai_image_gallery', JSON.stringify([{ id: `${text.slice(0, 24)}-${imageData.imageUrl.slice(-16)}`, prompt: text, imageUrl: imageData.imageUrl }, ...gallery].slice(0, 5)));
          } catch { /* The server history remains the durable copy. */ }
          try {
            const saved = await apiFetch(startedConversationId ? `/api/chat/history/${startedConversationId}` : '/api/chat/history', {
              method: startedConversationId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: selectedSlug, messages: [...nextMessages, answer] }),
            });
            if (!saved.ok) throw new Error('save failed');
            const conversation = await saved.json();
            if (stillOpen() && !startedConversationId) {
              activeConversationIdRef.current = conversation.id;
              setActiveConversationId(conversation.id);
            }
            await refreshHistory();
          } catch {
            if (stillOpen() || !startedConversationId) setChatError('The image is ready, but saving history failed. Download the picture before closing the chat.');
          }
        }
        logger.success('Assistant response completed', { mode: 'image', durationMs: timingElapsed(requestStartedAt) });
        return;
      }
      let conversationId = activeConversationId;
      if (!conversationId && !temporaryChat) {
        const historyResponse = await apiFetch('/api/chat/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, model: selectedSlug, messages: nextMessages }),
        });
        if (historyResponse.status === 401) await checkChatResponse(historyResponse);
        if (historyResponse.ok) {
          const conversation = await historyResponse.json();
          conversationId = conversation.id;
          if (activeConversationIdRef.current === startedConversationId) {
            activeConversationIdRef.current = conversation.id;
            setActiveConversationId(conversation.id);
          }
          setChatHistory((history) => [conversation, ...history]);
        }
      }

      const responseBelongsToOpenChat = () => activeConversationIdRef.current === (conversationId || startedConversationId);

      const webSearchFlag = webSearchViaChat || selectedSkill === 'web' ? true : selectedSlug === 'smart' ? 'auto' : false;
      if (webSearchViaChat) {
        logger.search('Request started via chat fallback', { query: text.length > 120 ? `${text.slice(0, 120)}…` : text });
      }
      if (selectedSlug === 'smart') {
        logger.router('Sending request', { webSearch: webSearchFlag, responseMode: generatingFile ? 'file' : 'chat' });
      }

      const response = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseMode: generatingFile ? 'file' : 'chat', maxTokens: generatingFile ? 4096 : undefined, model: selectedSlug, variant: selectedVersion?.id, messages: nextMessages, userEmail: user.email, conversationId, temporary: temporaryChat, webSearch: webSearchFlag, routerMode: location.state?.routerMode || safeStorageGet('localStorage', 'allmodelai_router_mode') || 'balanced', responsePrefs: safeJSON(safeStorageGet('localStorage', 'allmodelai_response_prefs'), {}), systemInstructions: safeStorageGet('localStorage', 'allmodelai_system_instructions') || '', fallbackEnabled: !selectedVersion }),
        signal: controller.signal,
      });

      await checkChatResponse(response);

      if (!response.body) throw new Error('The AI server did not return a stream.');

      if (response.headers.get('content-type')?.includes('application/json')) {
        const responseData = await response.json();
        const responseText = responseData.message || '';
        if (generatingFile && !parseGeneratedFile(responseText)) setChatError('The model did not return a complete file. Retry in Create file mode or request a smaller file.');
        if (responseBelongsToOpenChat()) {
          setMessages((current) => current.map((message, index) => (
            index === assistantIndex ? { ...message, text: responseText } : message
          )));
        }
        if (conversationId) {
          await apiFetch(`/api/chat/history/${conversationId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, messages: [...nextMessages, { role: 'assistant', text: responseText, modelSlug: selectedSlug }] }),
          });
          await refreshHistory();
        }
        if (!responseBelongsToOpenChat()) {
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
      const enqueueReveal = (text) => {
        setIsStreamingResponse(true);
        if (responseBelongsToOpenChat()) {
          setMessages((current) => current.map((message, index) => (
            index === assistantIndex ? { ...message, text: (message.text || '') + text } : message
          )));
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.replaceAll('\r\n', '\n').split('\n\n');
        buffer = events.pop() || '';

        for (const eventData of events) {
          const dataLine = eventData.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine || dataLine.slice(6) === '[DONE]') continue;
          const event = JSON.parse(dataLine.slice(6));
          if (event.creditsRemaining !== undefined) {
            setCreditStatus((current) => ({ ...current, ...event, remaining: event.creditsRemaining }));
          }
          if (event.unlimited) setCreditStatus((current) => ({ ...current, ...event, unlimited: true }));
          if (event.routedModel) {
            if (selectedSlug !== 'smart' && event.actualModelId) {
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
          }
          if (event.error) throw new Error(event.error);
          if (event.webSources?.length) {
            webSourcesForMessage = event.webSources;
            logger.search(`Results received: ${event.webSources.length}`, { count: event.webSources.length });
            setMessages((current) => current.map((message, index) => (
              index === assistantIndex
                ? { ...message, webSources: event.webSources, webSearchComplete: event.webSearchComplete ?? true }
                : message
            )));
          }
          const partialText = event.text;
          if (partialText) {
            assistantText += partialText;
            if (webSearchViaChat) {
              setMessages((current) => current.map((message, index) => (
                index === assistantIndex
                  ? { ...message, webSearching: false, webSearchStatus: null }
                  : message
              )));
            }
            enqueueReveal(partialText);
          }
        }

        if (done) break;
      }
      if (webSearchViaChat || selectedSkill === 'web') {
        setSelectedSkill(null);
        setMessages((current) => current.map((message, index) => (
          index === assistantIndex
            ? { ...message, webSearching: false, webSearchStatus: null }
            : message
        )));
      }
      if (generatingFile && !parseGeneratedFile(assistantText)) setChatError('The model did not return a complete file. Retry in Create file mode or request a smaller file.');
      if (conversationId) {
        await apiFetch(`/api/chat/history/${conversationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, messages: [...nextMessages, { role: 'assistant', text: assistantText, modelSlug: selectedSlug, ...(webSourcesForMessage.length ? { webSources: webSourcesForMessage, webSearchComplete: true } : {}) }] }),
        });
      }
      await refreshHistory();
      if (voiceMode && !generatingFile) speakText(assistantText);
      if (!responseBelongsToOpenChat()) {
        setBackgroundNotification({ conversationId, title: `${selectedModel.name} replied`, text: assistantText.slice(0, 140) || 'Your answer is ready.' });
      }
      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`${selectedModel.name} finished`, { body: assistantText.slice(0, 120) || 'Your answer is ready.' });
      }
      if (fallbackProvider) logger.router(`${fallbackProvider} succeeded`);
      if (selectedSlug === 'smart') logger.router('Response completed');
      logger.success('Assistant response completed', {
        mode: generatingFile ? 'file' : 'chat',
        durationMs: timingElapsed(requestStartedAt),
        chars: assistantText.length,
      });
    } catch (requestError) {
      if (requestError.name === 'AbortError') {
        setMessages((current) => current.filter((message, index) => index !== assistantIndex || String(message.text || message.content || '').trim()));
      } else {
        if (generatingImage && activeConversationIdRef.current === startedConversationId) setPrompt((current) => current || rawText);
        setSessionExpired(requestError.sessionExpired === true);
        const wasWebSearch = messages[assistantIndex]?.webSearching || messages[assistantIndex]?.webSearchStatus;
        const fallbackMessage = wasWebSearch
          ? 'Web search is temporarily unavailable. I can still answer using the AI model\'s existing knowledge.'
          : requestError.message === 'Failed to fetch'
            ? 'Could not connect to the server. Check your connection and try again.'
            : (requestError.message || 'Could not connect to the AI server.');
        if (wasWebSearch) {
          logger.searchError('Search failed', { message: requestError.message, name: requestError.name });
          setMessages((current) => current.map((message, index) => (
            index === assistantIndex
              ? { ...message, text: fallbackMessage, webSearching: false, webSearchStatus: null, webSearchComplete: false }
              : message
          )));
          setSelectedSkill(null);
        } else {
          setChatError(fallbackMessage);
          setMessages((current) => current.filter((_, index) => index !== assistantIndex));
        }
      }
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      setIsStreamingResponse(false);
      setIsSending(false);
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

  const chooseSuggestion = (text) => {
    logger.action('Suggestion prompt clicked', { length: String(text).length });
    setPrompt(text);
    document.querySelector('.chat-composer textarea')?.focus();
  };

  const toggleWebSearch = () => {
    if (selectedSkill === 'web') {
      logger.search('Search disabled');
      setSelectedSkill(null);
      return;
    }
    chooseSkill('web');
  };

  const chooseSkill = (skill) => {
    const labels = {
      image: 'Create image selected',
      file: 'Create file selected',
      video: 'Make video selected',
      web: 'Web Search enabled',
    };
    logger.action(labels[skill] || 'Chat mode selected', { skill });
    if (skill === 'web') logger.search('Search enabled');
    setSelectedSkill(skill);
    setComposerMenuOpen(false);
    document.querySelector('.chat-composer textarea')?.focus();
  };

  const goTo = (path, label) => {
    logger.action(`Open: ${label}`, { path });
    navigate(path);
  };

  const openSmartRouter = () => {
    logger.action('Smart Router selected');
    setSelectedSlug('smart');
    setTemporaryChat(false);
    setActiveProject(null);
    newChat();
  };

  const openConversation = (conversation) => {
    setTemporaryChat(false);
    setActiveProject(null);
    setActiveConversationId(conversation.id);
    activeConversationIdRef.current = conversation.id;
    setMessages(conversation.messages || []);
    setSelectedSlug(validModelSlug(conversation.model));
    setPrompt('');
    setChatError('');
    setChatMenuId(null);
    setSidebarOpen(false);
    setChatError('');
  };

  const renameConversation = async (conversation) => {
    const title = window.prompt('Rename conversation', conversation.title)?.trim();
    if (!title) return;
    const response = await apiFetch(`/api/chat/history/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, title }),
    });
    if (response.ok) await refreshHistory();
    setChatMenuId(null);
  };

  const deleteConversation = async (conversation) => {
    if (!window.confirm(`Delete "${conversation.title}"?`)) {
      setChatMenuId(null);
      return;
    }
    const response = await apiFetch(`/api/chat/history/${conversation.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    if (response.ok) {
      setChatHistory((history) => history.filter((item) => item.id !== conversation.id));
      if (activeConversationId === conversation.id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    }
    setChatMenuId(null);
  };

  const newChat = () => { logger.action('New conversation'); setTemporaryChat(false); setActiveConversationId(null); activeConversationIdRef.current = null; setMessages([]); setPrompt(''); setSelectedSkill(null); setChatError(''); setSidebarOpen(false); };
  const startTemporaryChat = () => { logger.action('Temporary chat'); newChat(); setTemporaryChat(true); setActiveProject(null); };
  const createProject = () => {
    const name = window.prompt('Project name (example: Website launch, Study plan, Marketing)')?.trim();
    if (!name) return;
    logger.action('New project', { name });
    const nextProjects = [...projects, { id: Date.now().toString(), name }];
    setProjects(nextProjects); setActiveProject(nextProjects[nextProjects.length - 1]); setTemporaryChat(false);
    safeStorageSet('localStorage', 'allmodelai_projects', JSON.stringify(nextProjects)); newChat();
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
  const deleteProject = (project) => {
    if (!window.confirm(`Delete project "${project.name}"?`)) return;
    const nextProjects = projects.filter((item) => item.id !== project.id);
    setProjects(nextProjects);
    safeStorageSet('localStorage', 'allmodelai_projects', JSON.stringify(nextProjects));
    if (activeProject?.id === project.id) { setActiveProject(null); newChat(); }
    setProjectMenuId(null);
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
      const response = await apiFetch('/api/auth/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not delete your account.');
      clearAllSessionData();
      navigate('/');
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="chat-page">
      <button className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`} aria-label={t("Close sidebar")} onClick={() => setSidebarOpen(false)} />
      <aside className={`chat-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-top">
          <Link to="/dashboard" className="chat-brand"><AllModelAILogoMark /><strong>AllModelAI</strong></Link>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label={t("Close sidebar")}>×</button>
        </div>
        <button className="new-chat" onClick={newChat}><span>＋</span> {t("New conversation")}</button>
        <div className="workspace-tools">
          <button className="settings-quick-access" onClick={() => goTo('/chat/settings', 'Chat settings')}><span>⚙</span><span><strong>{t("Chat settings")}</strong><small>{t("Change input and message colors")}</small></span><b>›</b></button>
          <button className={temporaryChat ? 'active' : ''} onClick={startTemporaryChat}><span>◌</span><span><strong>{t("Temporary chat")}</strong><small>{t("Not saved to history")}</small></span></button>
          <button onClick={createProject}><span>▣</span><span><strong>{t("New project")}</strong><small>{t("Organize chats by goal")}</small></span></button>
          <button onClick={() => goTo('/arena', 'AI Arena')}><span>⚔</span><span><strong>{t("AI Arena")}</strong><small>{t("Compare answers side by side")}</small></span></button>
          <button className={selectedSlug === 'smart' ? 'active' : ''} onClick={openSmartRouter}><span>✦</span><span><strong>{t("Smart Router")}</strong><small>{t("Choose the best AI automatically")}</small></span></button>
          <button onClick={() => chooseSkill('image')}><span>◈</span><span><strong>{t("Generate image")}</strong><small>{t("Create an image from text")}</small></span></button>
          <button onClick={() => goTo('/studio?tool=prompt', 'Prompt library')}><span>▤</span><span><strong>{t("Prompt library")}</strong><small>{t("Ready-to-use templates")}</small></span></button>
          <button disabled={!messages.length} onClick={exportConversation}><span>↓</span><span><strong>{t("Export chat")}</strong><small>{t("Download this conversation")}</small></span></button>
          <button onClick={editSystemInstructions}><span>⚙</span><span><strong>{t("AI instructions")}</strong><small>{t("Set language, style, and behavior")}</small></span></button>
          <button onClick={backupWorkspace}><span>⬡</span><span><strong>{t("Backup workspace")}</strong><small>{t("Download chats and settings")}</small></span></button>
        </div>
        {projects.length > 0 && <div className="project-list"><p>{t("Projects")}</p>{projects.map((project) => <div className={`project-item ${activeProject?.id === project.id ? 'active' : ''}`} key={project.id}><button className="project-open" onClick={() => { setActiveProject(project); setTemporaryChat(false); setProjectMenuId(null); newChat(); }}><span>▰</span><strong>{project.name}</strong></button><button className="project-more" onClick={() => setProjectMenuId((id) => id === project.id ? null : project.id)} aria-label={`Options for ${project.name}`}>•••</button>{projectMenuId === project.id && <div className="project-menu"><button onClick={() => renameProject(project)}>✎ Rename</button><button className="danger" onClick={() => deleteProject(project)}>{t("Delete")}</button></div>}</div>)}</div>}
        {favorites.length > 0 && <div className="favorite-list"><p>{t("Favorites")} <span>{favorites.length}</span></p>{favorites.slice(0, 4).map((favorite) => <button key={favorite.id} onClick={() => chooseSuggestion(favorite.text)} title={favorite.text}><span>★</span><span><strong>{dashboardModels.find((model) => model.slug === favorite.modelSlug)?.name || 'AI response'}</strong><small>{favorite.text}</small></span></button>)}</div>}
        <div className="chat-history" onKeyDown={(event) => { if (event.key === 'Escape') { setChatMenuId(null); event.target.closest('.chat-history-item')?.querySelector('.chat-history-more')?.focus(); } }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setChatMenuId(null); }}>
          <p>{t("Saved conversations")} <span className="chat-history-count">{chatHistory.length}</span><button className="chat-history-export" type="button" onClick={exportConversation} disabled={!messages.length} title={t("Export current conversation")}>↓</button></p>
          <input className="chat-history-search" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder={t("Search saved chats")} aria-label={t("Search saved chats")} />
          <div className="chat-history-list" tabIndex={0} aria-label={t("Saved conversations")}>
          {chatHistory.length === 0 && <small className="chat-history-empty">{t("Your saved chats will appear here.")}</small>}
          {chatHistory.length > 0 && visibleHistory.length === 0 && <small className="chat-history-empty">{t("No matching conversations.")}</small>}
          {visibleHistory.map((conversation) => <div className={`chat-history-item ${activeConversationId === conversation.id ? 'active' : ''}`} key={conversation.id}>
            <button className="chat-history-open" onClick={() => openConversation(conversation)}><span>{chatMeta[conversation.id]?.pinned ? '★' : '◇'}</span><span><strong>{conversation.title || conversationPreview(conversation)}</strong><small>{conversationPreview(conversation)}</small>{Array.isArray(chatMeta[conversation.id]?.tags) && chatMeta[conversation.id].tags.length > 0 && <small className="chat-tags">{chatMeta[conversation.id].tags.map((tag) => `#${tag}`).join(' ')}</small>}<em>Saved · {conversation.model}</em></span></button>
            <button type="button" aria-expanded={chatMenuId === conversation.id} className="chat-history-more" onClick={() => setChatMenuId((id) => id === conversation.id ? null : conversation.id)} aria-label={`Options for ${conversation.title}`}>•••</button>
            {chatMenuId === conversation.id && <div className="chat-history-menu"><button type="button" onClick={() => renameConversation(conversation)}>{t("Edit")}</button><button type="button" className="danger" onClick={() => deleteConversation(conversation)}>{t("Delete")}</button></div>}
          </div>)}
          </div>
        </div>
        {imageGeneratorOpen && <ImageGenerator initialPrompt={prompt} onClose={() => setImageGeneratorOpen(false)} />}
        <nav className="sidebar-links" aria-label={t("Chat navigation")}><Link to="/dashboard" onClick={() => logger.action('Open: Dashboard', { path: '/dashboard' })}>⌂ <span>{t("Dashboard")}</span></Link><Link to="/ai-platform" onClick={() => logger.action('Open: AI Platform', { path: '/ai-platform' })}>34 <span>{t("AI Platform")}</span></Link><Link to="/app-builder" onClick={() => logger.action('Open: App Builder', { path: '/app-builder' })}>&lt;/&gt; <span>App Builder</span></Link><Link to="/studio" onClick={() => logger.action('Open: Workspace Studio', { path: '/studio' })}>✦ <span>{t("Workspace Studio")}</span></Link><Link to="/control-center" onClick={() => logger.action('Open: Control Center', { path: '/control-center' })}>⌘ <span>{t("Control Center")}</span></Link><Link to="/models/gpt" onClick={() => logger.action('Open: Model library', { path: '/models/gpt' })}>▦ <span>{t("Model library")}</span></Link></nav>
        <section className="sidebar-theme-settings collapsed" aria-label={t("Theme settings")}><button type="button" className="chat-settings-trigger" onClick={() => goTo('/chat/settings', 'Settings')}><span className="settings-gear" aria-hidden="true">⚙</span><span><strong>{t("Settings")}</strong><small>{themePreference} · {chatTextColors.find(([,color])=>color===textColor)?.[0]||'Custom'} message</small></span><b>›</b></button></section>
        <div className="chat-profile"><span>{user.name?.charAt(0) || user.email.charAt(0)}</span><div><strong>{user.name || t("User")}</strong><small>{user.email}</small></div><button onClick={() => setDeleteModalOpen(true)} aria-label={t("Sign out")} title={t("Sign out")}>↗</button></div>
      </aside>

      <section className="chat-workspace" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
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
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(true)} aria-label={t("Open sidebar")}>☰</button>
          <div className="active-model"><img src={selectedModel.image} alt="" /><span><small>{temporaryChat ? t("Temporary chat") : activeProject ? activeProject.name : t("Chatting with")}</small><strong>{selectedModel.name}{selectedVersion ? ` · ${selectedVersion.name}` : ''}</strong></span><i className={modelIsOnline(selectedSlug) ? '' : 'offline'}>{modelIsOnline(selectedSlug) ? t("Online") : t("API needed")}</i></div>
          <div className="access-mode-control">
            <div className="access-mode-switch" role="group" aria-label="Access mode">
              <button type="button" aria-pressed={(creditStatus?.mode || 'user') === 'user'} disabled={isGuest || !creditStatus || isSending || accessModeSaving} onClick={() => changeAccessMode('user')}>{t("User")}</button>
              <button type="button" aria-pressed={creditStatus?.mode === 'developer'} disabled={isGuest || !creditStatus || isSending || accessModeSaving} onClick={() => changeAccessMode('developer')} title={creditStatus?.canUseDeveloper ? t("All models") : 'Subscription or developer status required'}>Developer {!creditStatus?.canUseDeveloper && '🔒'}</button>
            </div>
            <small>{accessModeSaving ? t("Saving\u2026") : creditStatus?.mode === 'developer' ? t("All models") : t("5 free models")}{creditStatus && !creditStatus.canUseDeveloper && <Link to="/pricing">Subscription ↗</Link>}</small>
          </div>
          <div className={`model-select custom-model-select ${modelMenuOpen ? 'open' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape') setModelMenuOpen(false); }} onBlur={(event) => { const root = event.currentTarget; window.setTimeout(() => { if (!root.contains(document.activeElement) && !root.matches(':hover')) setModelMenuOpen(false); }, 180); }}>
            <span>{t("Model")}</span>
            <button type="button" className="model-select-trigger" onClick={() => setModelMenuOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={modelMenuOpen}>
              <span>{selectedVersion ? `${selectedVersion.name}${selectedVersion.label ? ` ${selectedVersion.label}` : ''}` : `${selectedModel.name} — ${selectedModel.provider}`}</span><i>⌄</i>
            </button>
            {modelMenuOpen && <div className="model-options model-family-options" role="listbox" aria-label={t("Choose AI model")}>
              {dashboardModels.map((model) => {
                const allowed = modelAllowed(model.slug);
                const online = modelIsOnline(model.slug);
                if (model.slug === 'smart') return <button type="button" role="option" aria-selected={selectedSlug === 'smart'} className={selectedSlug === 'smart' ? 'selected' : ''} key={model.slug} onClick={() => chooseModel(model)}><img src={model.image} alt="" /><span><strong>{model.name}</strong><small>{model.provider} · {t("Ready")}</small></span>{selectedSlug === 'smart' && <b>✓</b>}</button>;
                return <div className="model-family-group" role="group" aria-labelledby={`model-family-${model.slug}`} key={model.slug}>
                  <div className="model-family-heading" id={`model-family-${model.slug}`}><img src={model.image} alt="" /><span><strong>{model.name}</strong><small>{model.provider} · {!allowed ? 'Subscription / Developer' : online ? t("Ready") : t("API needed")}</small></span>{!allowed && <button type="button" className="subscribe-btn" onClick={(event) => { event.stopPropagation(); setModelMenuOpen(false); openSubscribe(); }}><span>🔒</span> {t('Subscribe')}</button>}</div>
                  {(variantCatalog[model.slug] || []).map((version) => {
                    const selected = selectedSlug === model.slug && selectedVersion?.id === version.id;
                    return <button type="button" role="option" aria-selected={selected} disabled={!allowed} key={version.id} className={`model-family-version${selected ? ' selected' : ''}`} onClick={() => chooseModel(model, version)}><img src={model.image} alt="" /><span><strong>{version.name}{version.label ? ` ${version.label}` : ''}</strong>{version.description && <small>{version.description}</small>}</span><b>{selected ? '✓' : '›'}</b></button>;
                  })}
                  {!variantCatalog[model.slug]?.length && <p className="model-versions-note">Versions are unavailable. Reload the page to try again.</p>}
                </div>;
              })}
            </div>}
          </div>
          <Link className="dashboard-link" to="/dashboard">{t("Dashboard")}</Link>
        </header>
        {backgroundNotification && <div className="chat-statuses">
          <div className="model-selection-notice chat-background-notification" role="status"><span><strong>{backgroundNotification.title}</strong><small>{backgroundNotification.text}</small></span><button type="button" onClick={async () => { const history = await apiFetch(`/api/chat/history?email=${encodeURIComponent(user.email)}`).then((response) => response.ok ? response.json() : []); const conversation = history.find((item) => item.id === backgroundNotification.conversationId); if (conversation) openConversation(conversation); setBackgroundNotification(null); }} aria-label="Open completed response">{t("Open chat")}</button><button type="button" onClick={() => setBackgroundNotification(null)} aria-label="Dismiss notification">×</button></div>
        </div>}

        <div className="chat-messages" ref={messagesContainer}>
          {messages.length === 0 && <div className="chat-empty"><div className="model-orb"><img src={selectedModel.image} alt={`${selectedModel.name} logo`} /></div><p className="chat-eyebrow">{selectedModel.provider} · {selectedModel.name}</p><h1>{t("What can I help you create?")}</h1><p className="chat-subtitle">{t("Start with your own question, upload a screenshot (Ctrl+V), or choose one of these ideas.")}</p><div className="prompt-suggestions">{suggestions.map((item) => <button key={item.title} onClick={() => chooseSuggestion(item.prompt)}><span>{item.icon}</span><strong>{t(item.title)}</strong><small>{t(item.prompt)}</small></button>)}</div></div>}
          {messages.map((message, index) => {
            const messageModel = dashboardModels.find((model) => model.slug === message.modelSlug) || selectedModel;
            const text = message.content ?? message.text ?? '';
            const generatedFile = message.role === 'assistant' ? parseGeneratedFile(text) : null;
            const filePending = message.generatingFile && isSending && index === messages.length - 1;
            const messageImage = message.role === 'user' ? message.image || message.imageUrl : null;
            if (!text && !messageImage && message.role === 'assistant' && isSending && index === messages.length - 1) return null;
            const activelyStreaming = isStreamingResponse && isSending && index === messages.length - 1 && message.role === 'assistant';
            const editing = message.role === 'user' && editingMessageIndex === index;
            const liked = messageLikes[index];
            const feedback = messageFeedback[index];
            return <article className={`chat-message ${message.role} ${activelyStreaming ? 'streaming-response' : ''}`} key={`${message.role}-${index}`}><span>{message.role === 'user' ? (user.name?.charAt(0) || 'U') : <img src={messageModel.image} alt={`${messageModel.name} logo`} />}</span><div><small>{message.role === 'user' ? 'You' : messageModel.name}</small>{messageImage && <div className="message-image-container"><img className="message-user-image" src={messageImage} alt="Uploaded screenshot" onClick={() => setPreviewModalImage(messageImage)} title="Click to view full size" /><span className="image-zoom-badge" onClick={() => setPreviewModalImage(messageImage)}>🔍 Zoom</span></div>}{editing ? <div className="inline-message-editor"><textarea autoFocus value={editDraft} onChange={(event) => setEditDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setEditingMessageIndex(null); setEditDraft(''); } if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); saveEditedMessage(); } }} /><div><span>The original version will be saved as a branch.</span><button type="button" onClick={() => { setEditingMessageIndex(null); setEditDraft(''); }}>{t("Cancel")}</button><button type="button" disabled={!editDraft.trim()} onClick={saveEditedMessage}>Save &amp; resend</button></div></div> : (message.webSearchStatus || message.webSearching) ? <WebSearchStatus status={message.webSearchStatus || 'searching'} count={message.webSearchCount} /> : null}{text && (message.role === 'assistant' ? filePending ? <p role="status">Creating your file...</p> : generatedFile ? <FileCard file={generatedFile} conversationId={temporaryChat ? null : activeConversationId} temporary={temporaryChat} /> : <MessageContent text={text} streaming={activelyStreaming} /> : <p>{text}</p>)}{message.webSources?.length > 0 && <WebSources sources={message.webSources} complete={message.webSearchComplete} />}{message.imageUrl && message.role !== 'user' && <div className="generated-image-result"><button type="button" className="generated-image-preview" onClick={() => setPreviewModalImage(message.imageUrl)} aria-label="Open image"><img className="generated-image" src={message.imageUrl} alt="Generated image" /></button><a href={message.imageUrl} download="allmodelai-image.png" target="_blank" rel="noreferrer">↓ Download image</a></div>}{text && !activelyStreaming && !editing && <div className="message-actions">
              {message.role === 'assistant' ? (
                <>
                  <button type="button" data-tooltip={t("Copy")} onClick={() => copyMessage(generatedFile?.content || text)} aria-label="Copy response">⎘</button>
                  <button type="button" data-tooltip={liked ? 'Liked' : 'Like'} className={liked ? 'selected-like' : ''} onClick={() => likeMessage(index)} aria-label="Like response">👍</button>
                  <button type="button" data-tooltip={t("Feedback")} onClick={() => openFeedback(index)} aria-label="Leave feedback">💬</button>
                  <button type="button" data-tooltip="Good response" className={messageRatings[index] === 'up' ? t("selected") : ''} onClick={() => rateMessage(index, 'up')} aria-label="Good response">♧</button>
                  <button type="button" data-tooltip="Bad response" className={messageRatings[index] === 'down' ? t("selected") : ''} onClick={() => rateMessage(index, 'down')} aria-label="Bad response">♧</button>
                  <button type="button" data-tooltip={t("Share")} onClick={() => shareMessage(text)} aria-label="Share response">↗</button>
                  <button type="button" data-tooltip={t("Retry")} onClick={() => retryMessage(index)} aria-label="Retry response">⟳</button>
                  <button type="button" data-tooltip={isSpeaking ? 'Stop voice' : t("Read aloud")} onClick={() => isSpeaking ? stopSpeaking() : speakText(text)} aria-label={isSpeaking ? 'Stop reading response' : 'Read response aloud'}>{isSpeaking ? '■' : '🔊'}</button>
                  {feedback && <span className="feedback-badge" title={feedback}>Feedback sent</span>}
                </>
              ) : (
                <>
                  <button type="button" data-tooltip={t("Copy")} onClick={() => copyMessage(text)} aria-label="Copy message">⎘</button>
                  <button type="button" data-tooltip={t("Edit")} onClick={() => editMessage(index)} aria-label="Edit message">✎</button>
                </>
              )}
             </div>}
            </div>
           </article>
            })}
          {isSending && !isStreamingResponse && !messages.some((message) => message.webSearching || message.webSearchStatus) && <article className="chat-message assistant thinking-message"><span className="thinking-avatar" aria-hidden="true"><i /></span><div><small>{selectedModel.name}</small><p className="typing-indicator"><b>Thinking<span className="thinking-dots"><i /><i /><i /></span></b></p></div></article>}
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
          <div className="chat-scroll-tail" ref={messagesEnd} aria-hidden="true" />
        </div>

        <form className={`chat-composer ${messages.length === 0 ? 'welcome-composer' : 'conversation-composer'}`} onSubmit={sendMessage}>
          <div className="composer-quick-texts">
            <button type="button" onClick={() => chooseSuggestion(t('Write a short story about a time traveler.'))}>{t('Write a short story about a time traveler.')}</button>
            <button type="button" onClick={() => chooseSuggestion(t('Summarize the main benefits of daily exercise.'))}>{t('Summarize the main benefits of daily exercise.')}</button>
            <button type="button" onClick={() => chooseSuggestion(t('Help me plan a budget for a trip to Europe.'))}>{t('Help me plan a budget for a trip to Europe.')}</button>
          </div>
          <div className="composer-shell">
            {composerMenuOpen && <div className="composer-menu">
              <button type="button" onClick={() => { setComposerMenuOpen(false); setVoicePanelOpen((open) => !open); }}><span>♫</span> Voice mode</button>
              <button type="button" onClick={() => { setComposerMenuOpen(false); fileInput.current?.click(); }}><span>📷</span> Send screenshot / photo (Ctrl+V)</button>
              <button type="button" onClick={() => { setComposerMenuOpen(false); fileInput.current?.click(); }}><span>⌕</span> Attach files &amp; documents</button>
              <button type="button" onClick={() => chooseSkill('image')}><span>✦</span> Create image (generation)</button>
              <button type="button" onClick={() => chooseSkill('file')}><span>{'</>'}</span> Create file</button>
              <button type="button" onClick={() => chooseSkill('video')}><span>▶</span> Make video</button>
              <button type="button" onClick={() => chooseSkill('web')}><span>🌐</span> Search the web</button>
              <button type="button" disabled={!messages.some((message) => message.role === 'assistant' && (message.text || message.content))} onClick={() => { setComposerMenuOpen(false); sendMessage(null, 'Continue the previous answer from exactly where it stopped. Do not repeat completed content.'); }}><span>→</span> Continue last answer</button>
              <button type="button" disabled={!activeConversationId || !messages.length} onClick={() => { setComposerMenuOpen(false); branchCurrentConversation(); }}><span>⑂</span> Branch conversation</button>
              <button type="button" disabled={!messages.some((message) => message.role === 'assistant' && (message.text || message.content))} onClick={() => { const last = [...messages].reverse().find((message) => message.role === 'assistant' && (message.text || message.content)); if (last) toggleFavorite(last.text || last.content, last.modelSlug); setComposerMenuOpen(false); }}><span>★</span> Save last answer</button>
            </div>}
            <div className="composer-box">
              <div className="image-mode-switch" role="group" aria-label="Response mode">
                <button type="button" disabled={isSending} aria-pressed={!selectedSkill} onClick={() => setSelectedSkill(null)}>Chat</button>
                <button type="button" disabled={isSending} aria-pressed={selectedSkill === 'image'} onClick={() => setImageGeneratorOpen(true)}>✦ Create image</button>
                <button type="button" disabled={isSending} aria-pressed={selectedSkill === 'file'} onClick={() => chooseSkill('file')}>Create file</button>
              </div>
              {voicePanelOpen && <section className="voice-panel" aria-label="Voice mode settings">
                <div><strong>Voice conversation</strong><button type="button" className={voiceMode ? 'voice-toggle active' : 'voice-toggle'} onClick={changeVoiceMode} aria-pressed={voiceMode}>{voiceMode ? 'On' : 'Off'}</button></div>
                <p>Send speech automatically and read every AI response aloud.</p>
                <label>Language<select value={speechLanguage} onChange={(event) => { setSpeechLanguage(event.target.value); safeStorageSet('localStorage', 'allmodelai_voice_language', event.target.value); }}><option value="en-US">English</option><option value="uk-UA">Українська</option><option value="ru-RU">Русский</option><option value="de-DE">Deutsch</option><option value="pl-PL">Polski</option><option value="es-ES">Español</option><option value="fr-FR">Français</option></select></label>
                <label>Voice<select value={selectedVoice} onChange={(event) => { setSelectedVoice(event.target.value); safeStorageSet('localStorage', 'allmodelai_voice_name', event.target.value); }}><option value="">Automatic</option>{availableVoices.map((voice) => <option value={voice.name} key={`${voice.name}-${voice.lang}`}>{voice.name} ({voice.lang})</option>)}</select></label>
                {isSpeaking && <button type="button" className="stop-speaking" onClick={stopSpeaking}>Stop speaking</button>}
              </section>}
              {selectedSkill && <div className="selected-skill">
                <span className={`selected-skill-icon ${selectedSkill}`} aria-hidden="true">{selectedSkill === 'image' ? '✦' : selectedSkill === 'web' ? '🌐' : '▶'}</span>
                <span><strong>{selectedSkill === 'file' ? 'Create file' : selectedSkill === 'image' ? 'Create image' : selectedSkill === 'web' ? 'Search the web' : 'Make a video'}</strong><small>{selectedSkill === 'file' ? 'Describe a text or code file. Open, copy and download the result.' : selectedSkill === 'image' ? 'Write a description and press send'  : selectedSkill === 'web' ? 'Current information with sources' : 'Describe the video you want to create'}</small></span>
                <button type="button" className="selected-skill-remove" onClick={() => setSelectedSkill(null)} aria-label="Remove selected skill" title="Remove skill">×</button>
              </div>}
              {attachedImage && (
                <div className="attached-image-preview">
                  <div className="attached-image-info">
                    <img src={attachedImage.url} alt="Attached screenshot preview" onClick={() => setPreviewModalImage(attachedImage.url)} title="Click to preview" />
                    <div className="attached-image-meta">
                      <strong>📷 {attachedImage.name}</strong>
                      <small>{attachedImage.size} · Screenshot attached</small>
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
              <input ref={fileInput} className="chat-file-input" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf,.txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.py,.html,.css" onChange={readFile} />
              <textarea value={prompt} onChange={(event) => { setPrompt(event.target.value); loadContextSuggestions(event.target.value); }} onPaste={handlePaste} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!isSending) sendMessage(); } }} placeholder={selectedSkill === 'file' && !isSending ? 'For example: create a Python script, an HTML page, or a project plan in Markdown...' : isSending ? selectedSkill === 'web' ? 'Searching the web…' : 'You can type your next message while the answer is being generated…' : attachedImage ? 'Ask anything about this screenshot (e.g. "Where should I click?") or press Send...' : selectedSkill === 'image' ? 'For example: a golden dragon over a night city, realistic style…' : selectedSkill === 'video' ? 'Describe the video you want to create...' : selectedSkill === 'web' ? 'What do you want to find on the internet?' : t('messagePlaceholder').replace('AllModelAI', selectedModel.name)} rows="1" aria-label={t("Chat message")} />
              {contextSuggestions.length > 0 && !isSending && !attachedImage && <div className="context-suggestions">{contextSuggestions.map((item) => <button key={item} type="button" onClick={() => { setPrompt(item); setContextSuggestions([]); document.querySelector('.chat-composer textarea')?.focus(); }}>{item}</button>)}</div>}
              <div className="composer-tools"><div><button type="button" className="composer-plus" onClick={() => setComposerMenuOpen((open) => !open)} aria-label={t("Open tools")} aria-expanded={composerMenuOpen}>＋</button><button type="button" className={`composer-web-toggle ${selectedSkill === 'web' ? 'active' : ''}`} onClick={toggleWebSearch} aria-pressed={selectedSkill === 'web'} aria-label="Search the web" title="Search the web for current information"><span className="globe-icon">🌐</span></button><button type="button" className="composer-camera" onClick={() => fileInput.current?.click()} aria-label={t("Upload screenshot or image")} title="Upload screenshot or image (or paste Ctrl+V)">📷</button></div><span>{selectedSkill === 'web' ? '🌐 Web search enabled' : `${selectedModel.name} · ${voiceInputState === 'requesting' ? 'Allow microphone access...' : isListening ? t("Listening\u2026") : isSending ? t("Generating \u2014 you can keep typing") : attachedImage ? t("Screenshot ready to send") : t("Ready \u00b7 replies in your language")}`}</span><div className="composer-actions"><button type="button" className={voiceInputState !== 'idle' ? 'voice-active' : ''} onClick={toggleVoiceInput} aria-pressed={voiceInputState !== 'idle'} aria-label={voiceInputState !== 'idle' ? 'Stop microphone' : t("Use microphone")} title={voiceInputState !== 'idle' ? 'Stop microphone' : t("Use microphone")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg></button>{isSending ? <button className="stop-generation" type="button" onClick={stopGenerating} aria-label={t("Stop generating")} title={t("Stop generating")}><i /></button> : <button className="send-message" type="submit" disabled={!prompt.trim() && !attachedImage} aria-label={t("Send message")}>↑</button>}</div></div>
            </div>
          </div>
          <p>{selectedModel.name} can make mistakes. Check important information.</p>
        </form>
      </section>
      {previewModalImage && (
        <div className="image-lightbox-modal" onClick={() => setPreviewModalImage(null)}>
          <div className="lightbox-content" onClick={(event) => event.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setPreviewModalImage(null)} aria-label="Close image preview">✕</button>
            <img src={previewModalImage} alt="Full resolution screenshot preview" />
            <div className="lightbox-actions">
              <a href={previewModalImage} download="screenshot.png" target="_blank" rel="noopener noreferrer">↓ Download image</a>
            </div>
          </div>
        </div>
      )}
      {deleteModalOpen && <AccountDeleteModal onCancel={() => { setDeleteModalOpen(false); setDeleteError(''); }} onConfirm={deleteAccount} isDeleting={isDeleting} error={deleteError} />}
      {arenaOpen && <div className="feature-modal-backdrop" onClick={() => setArenaOpen(false)}><section className="feature-modal" onClick={(event) => event.stopPropagation()}><span className="feature-modal-icon">⚔</span><small>AI ARENA</small><h2>Compare the best models</h2><p>Describe the exact task you want the models to compare.</p><textarea autoFocus value={arenaTask} onChange={(event) => setArenaTask(event.target.value)} placeholder="Example: Build a launch plan for my new fitness app" rows="3" /><div className="arena-models"><span>GPT</span><span>Claude</span><span>Gemini</span><span>Grok</span></div><button disabled={!arenaTask.trim()} onClick={launchArena}>Create comparison prompt</button><button className="modal-cancel" onClick={() => setArenaOpen(false)}>{t("Cancel")}</button></section></div>}
      {subscribeModalOpen && <div className="feature-modal-backdrop" onClick={() => setSubscribeModalOpen(false)}><section className="feature-modal subscribe-modal" onClick={(event) => event.stopPropagation()}>
        <span className="feature-modal-icon">💎</span><small>{t('SUBSCRIPTION')}</small>
        {!subscribePlan ? <>
          <h2>{t('Choose your subscription plan')}</h2>
          <div className="subscribe-plans">
            {subscriptionPlans.map((plan) => <button type="button" key={plan.id} className={`subscribe-plan ${plan.popular ? 'popular' : ''}`} onClick={() => setSubscribePlan(plan)}>
              <span className="subscribe-plan-icon">{plan.icon}</span>
              <strong>{plan.name}</strong>
              <em>{plan.price} / {plan.period}</em>
              <ul>{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul>
              {plan.popular && <b className="subscribe-popular-badge">{t('Most popular')}</b>}
            </button>)}
          </div>
        </> : <>
          <h2>{subscribePlan.name} — {subscribePlan.price} / {subscribePlan.period}</h2>
          {creditStatus?.canUseDeveloper && <p className="subscribe-dev-note">🧪 {t('Developer mode: this is a test payment. No real money will be charged.')}</p>}
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
          {subscribeError && <p className="subscribe-error" role="alert">{subscribeError}</p>}
          <button disabled={subscribeBusy} className="subscribe-confirm" onClick={submitSubscription}>{subscribeBusy ? t('Processing…') : `${t('Subscribe')} · ${subscribePlan.price}`}</button>
          <button className="modal-cancel" onClick={() => setSubscribePlan(null)}>← {t('Back to plans')}</button>
        </>}
        <button className="modal-cancel" onClick={() => setSubscribeModalOpen(false)}>{t('Cancel')}</button>
      </section></div>}
      {feedbackModalOpen && <div className="feature-modal-backdrop" onClick={() => setFeedbackModalOpen(false)}><section className="feature-modal" onClick={(event) => event.stopPropagation()}><span className="feature-modal-icon">💬</span><small>FEEDBACK</small><h2>Tell us what this response did well</h2><p>Your feedback helps improve the model.</p><textarea autoFocus value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} placeholder="Example: very clear explanation, great code example" rows="4" /><div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:12}}><button className="modal-cancel" onClick={() => setFeedbackModalOpen(false)}>{t("Cancel")}</button><button disabled={!feedbackText.trim()} onClick={submitFeedback}>Send feedback</button></div></section></div>}
    </main>
  );
}
