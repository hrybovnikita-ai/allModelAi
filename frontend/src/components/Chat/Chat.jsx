import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { dashboardModels } from '../../data/dashboardModels';
import { apiFetch } from '../../lib/api';
import './Chat.css';
import './ChatApi.css';
import AccountDeleteModal from '../AccountDeleteModal';

const suggestions = [
  { icon: '✦', title: 'Create an idea', prompt: 'Give me three original product ideas for students.' },
  { icon: '</>', title: 'Explain code', prompt: 'Explain React useEffect with a simple example.' },
  { icon: '◎', title: 'Compare models', prompt: 'Compare Claude, Gemini, GPT, and Llama.' },
];

export default function Chat() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const messagesEnd = useRef(null);
  const messagesContainer = useRef(null);
  const fileInput = useRef(null);
  const activeRequest = useRef(null);
  const savedUser = sessionStorage.getItem('allmodelai_user');
  const user = savedUser ? JSON.parse(savedUser) : null;
  const [selectedSlug, setSelectedSlug] = useState(searchParams.get('model') || 'gpt');
  const [prompt, setPrompt] = useState(location.state?.starterPrompt || '');
  const [isSending, setIsSending] = useState(false);
  const [isStreamingResponse, setIsStreamingResponse] = useState(false);
  const [chatError, setChatError] = useState('');
  const [creditStatus, setCreditStatus] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatMeta, setChatMeta] = useState(() => JSON.parse(localStorage.getItem('allmodelai_chat_meta') || '{}'));
  const [historyQuery, setHistoryQuery] = useState('');
  const [messageRatings, setMessageRatings] = useState({});
  const [messageLikes, setMessageLikes] = useState(() => JSON.parse(localStorage.getItem('allmodelai_message_likes') || '{}'));
  const [messageFeedback, setMessageFeedback] = useState(() => JSON.parse(localStorage.getItem('allmodelai_message_feedback') || '{}'));
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackMessageIndex, setFeedbackMessageIndex] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem('allmodelai_favorites') || '[]'));
  const [sourcesOpen, setSourcesOpen] = useState(null);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [chatMenuId, setChatMenuId] = useState(null);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [temporaryChat, setTemporaryChat] = useState(false);
  const [projects, setProjects] = useState(() => JSON.parse(localStorage.getItem('allmodelai_projects') || '[]'));
  const [activeProject, setActiveProject] = useState(null);
  const [projectMenuId, setProjectMenuId] = useState(null);
  const [arenaOpen, setArenaOpen] = useState(false);
  const [arenaTask, setArenaTask] = useState('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [routeInfo, setRouteInfo] = useState(null);
  const [themePreference, setThemePreference] = useState(() => JSON.parse(localStorage.getItem('allmodelai_appearance') || '{}').theme || 'dark');
  const [themeSettingsVisible, setThemeSettingsVisible] = useState(() => localStorage.getItem('allmodelai_sidebar_theme_visible') !== 'false');
  const [contextSuggestions, setContextSuggestions] = useState([]);
  const selectedModel = dashboardModels.find((model) => model.slug === selectedSlug);

  const changeTheme = (theme) => {
    const appearance = JSON.parse(localStorage.getItem('allmodelai_appearance') || '{}');
    localStorage.setItem('allmodelai_appearance', JSON.stringify({ ...appearance, theme }));
    setThemePreference(theme);
  };

  const toggleThemeSettings = () => {
    setThemeSettingsVisible((visible) => {
      localStorage.setItem('allmodelai_sidebar_theme_visible', String(!visible));
      return !visible;
    });
  };

  useEffect(() => {
    document.documentElement.dataset.themePreference = themePreference;
    document.documentElement.dataset.theme = themePreference === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : themePreference;
  }, [themePreference]);

  const toggleVoiceInput = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setChatError('Voice input is not supported in this browser.'); return; }
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.onstart = () => { setIsListening(true); setChatError(''); };
    recognition.onresult = (event) => setPrompt(Array.from(event.results).map((result) => result[0].transcript).join(''));
    recognition.onerror = () => setChatError('Could not recognize speech. Check microphone permission.');
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const refreshHistory = () => apiFetch(`/api/chat/history?email=${encodeURIComponent(user.email)}`)
    .then((response) => response.ok ? response.json() : [])
    .then((history) => setChatHistory(history))
    .catch(() => {});

  const loadContextSuggestions = async (text) => {
    const value = String(text || '').trim();
    if (!value || isSending) { setContextSuggestions([]); return; }
    try {
      const response = await apiFetch('/api/chat/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lastMessage: value }) });
      if (!response.ok) return;
      const data = await response.json();
      setContextSuggestions(Array.isArray(data.suggestions) ? data.suggestions.slice(0, 3) : []);
    } catch {
      setContextSuggestions([]);
    }
  };

  const conversationPreview = (conversation) => {
    const firstUserMessage = conversation.messages?.find((message) => message.role === 'user');
    return String(firstUserMessage?.content ?? firstUserMessage?.text ?? 'Saved conversation').replace(/\s+/g, ' ').trim().slice(0, 54);
  };
  const visibleHistory = chatHistory
    .filter((conversation) => `${conversation.title} ${conversationPreview(conversation)} ${(conversation.messages || []).map((message) => message.text || message.content || '').join(' ')} ${(chatMeta[conversation.id]?.tags || []).join(' ')}`.toLowerCase().includes(historyQuery.toLowerCase()))
    .sort((first, second) => Number(Boolean(chatMeta[second.id]?.pinned)) - Number(Boolean(chatMeta[first.id]?.pinned)));
  const copyMessage = async (text) => { await navigator.clipboard.writeText(text); };
  const shareMessage = async (text) => { if(!activeConversationId){await copyMessage(text);return;} const response=await apiFetch(`/api/chat/history/${activeConversationId}/share`,{method:'POST'});const data=await response.json();if(!response.ok){setChatError(data.message||'Could not create sharing link');return;}await navigator.clipboard.writeText(`${location.origin}${new URL(data.url).pathname}`);setChatError('Read-only link copied to clipboard.'); };
  const rateMessage = (index, rating) => setMessageRatings((ratings) => ({ ...ratings, [index]: rating }));
  const likeMessage = (index) => {
    setMessageLikes((likes) => {
      const next = { ...likes, [index]: !likes[index] };
      localStorage.setItem('allmodelai_message_likes', JSON.stringify(next));
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
      localStorage.setItem('allmodelai_message_feedback', JSON.stringify(next));
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
      localStorage.setItem('allmodelai_favorites', JSON.stringify(next));
      return next;
    });
  };
  const updateChatMeta = (conversationId, patch) => {
    const next = { ...chatMeta, [conversationId]: { ...(chatMeta[conversationId] || {}), ...patch } };
    setChatMeta(next);
    localStorage.setItem('allmodelai_chat_meta', JSON.stringify(next));
  };
  const togglePinnedChat = (conversation) => { updateChatMeta(conversation.id, { pinned: !chatMeta[conversation.id]?.pinned }); setChatMenuId(null); };
  const editChatTags = (conversation) => {
    const value = window.prompt('Tags separated by commas', (chatMeta[conversation.id]?.tags || []).join(', '));
    if (value === null) return;
    updateChatMeta(conversation.id, { tags: value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8) });
    setChatMenuId(null);
  };
  const editSystemInstructions = () => {
    const current = localStorage.getItem('allmodelai_system_instructions') || '';
    const value = window.prompt('How should AI behave in every chat?', current);
    if (value === null) return;
    localStorage.setItem('allmodelai_system_instructions', value.trim().slice(0, 2000));
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
    const local = {}; for (let index = 0; index < localStorage.length; index += 1) { const key = localStorage.key(index); if (key?.startsWith('allmodelai_')) local[key] = localStorage.getItem(key); }
    const content = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), conversations: chatHistory, local }, null, 2);
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'application/json' })); link.download = 'allmodelai-backup.json'; link.click(); URL.revokeObjectURL(link.href);
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
  const readFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { setChatError('Files must be smaller than 1 MB.'); return; }
    const textLike = /^(text\/|application\/(json|xml|javascript|csv))/.test(file.type) || /\.(txt|md|csv|json|js|jsx|ts|tsx|py|html|css)$/i.test(file.name);
    const content = textLike ? (await file.text()).slice(0, 12000) : `[Attached ${file.type || 'file'}: ${file.name}, ${(file.size / 1024).toFixed(1)} KB. Analyze it using available multimodal/file capabilities.]`;
    setPrompt((current) => `${current}${current ? '\n\n' : ''}[${file.name}]\n${content}`);
    event.target.value = '';
  };
  const exportConversation = () => {
    const content = messages.map((message) => `${message.role === 'user' ? 'You' : selectedModel.name}:\n${message.content ?? message.text ?? ''}`).join('\n\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); link.download = `${conversationPreview({ messages }) || 'allmodelai-chat'}.txt`; link.click(); URL.revokeObjectURL(link.href);
  };

  useEffect(() => {
    const container = messagesContainer.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: isSending ? 'smooth' : 'auto' });
  }, [messages, isSending]);

  useEffect(() => {
    if (!user?.email) return;
    apiFetch(`/api/credits?email=${encodeURIComponent(user.email)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((status) => status && setCreditStatus(status))
      .catch(() => setCreditStatus(null));
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    apiFetch(`/api/chat/history?email=${encodeURIComponent(user.email)}`)
      .then((response) => response.ok ? response.json() : [])
      .then((history) => {
        setChatHistory(history);
        if (history[0]?.messages?.length) {
          setActiveConversationId(history[0].id);
          setMessages(history[0].messages);
          setSelectedSlug(history[0].model || 'gpt');
        }
      })
      .catch(() => {});
  }, [user?.email]);

  useEffect(() => {
    const handler = setTimeout(() => loadContextSuggestions(prompt), 220);
    return () => clearTimeout(handler);
  }, [prompt, isSending, loadContextSuggestions]);

  if (!user) return <Navigate to="/" replace />;

  const sendMessage = async (event, overrideText, overrideMessages) => {
    event?.preventDefault();
    const text = String(overrideText ?? prompt).trim();
    if (!text || isSending) return;
    const nextMessages = [...(overrideMessages ?? messages), { role: 'user', text }];
    setMessages(nextMessages);
    setPrompt('');
    setChatError('');
    setIsSending(true);
    const controller = new AbortController();
    activeRequest.current = controller;
    const assistantIndex = nextMessages.length;
    setMessages([...nextMessages, { role: 'assistant', text: selectedSkill === 'web' ? 'Searching the web…' : '', modelSlug: selectedSlug, webSearching:selectedSkill === 'web' }]);

    try {
      if (selectedSkill === 'web') {
        const researchResponse = await apiFetch('/api/research', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:text}), signal:controller.signal });
        const researchData = await researchResponse.json().catch(() => ({}));
        if (!researchResponse.ok) throw new Error(researchData.message || 'Could not search the web.');
        const sourceList=(researchData.sources||[]).map((source,index)=>`[${index+1}] ${source.title}\n${source.excerpt}\n${source.url}`).join('\n\n');
        const answer=`Web search completed for: “${text}”\n\n${sourceList||'No relevant sources were found.'}`;
        setMessages((current)=>current.map((message,index)=>index===assistantIndex?{...message,text:answer,webSearching:false,webSources:researchData.sources||[]}:message));
        setSelectedSkill(null);
        return;
      }
      if (selectedSkill === 'image') {
        const imageResponse = await apiFetch('/api/images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
          signal: controller.signal,
        });
        const imageData = await imageResponse.json().catch(() => ({}));
        if (!imageResponse.ok) throw new Error(imageData.message || 'Could not create the image.');
        setMessages((current) => current.map((message, index) => (
          index === assistantIndex ? { ...message, text: 'Here is your generated image.', imageUrl: imageData.imageUrl } : message
        )));
        const gallery = JSON.parse(localStorage.getItem('allmodelai_image_gallery') || '[]');
        localStorage.setItem('allmodelai_image_gallery', JSON.stringify([{ id: `${text.slice(0, 24)}-${imageData.imageUrl.slice(-16)}`, prompt: text, imageUrl: imageData.imageUrl }, ...gallery].slice(0, 40)));
        setSelectedSkill(null);
        return;
      }
      let conversationId = activeConversationId;
      if (!conversationId && !temporaryChat) {
        const historyResponse = await apiFetch('/api/chat/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, model: selectedSlug, messages: nextMessages }),
        });
        if (historyResponse.ok) {
          const conversation = await historyResponse.json();
          conversationId = conversation.id;
          setActiveConversationId(conversation.id);
          setChatHistory((history) => [conversation, ...history]);
        }
      }

      const response = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedSlug, messages: nextMessages, userEmail: user.email, conversationId, temporary: temporaryChat, routerMode: location.state?.routerMode || localStorage.getItem('allmodelai_router_mode') || 'balanced', responsePrefs: JSON.parse(localStorage.getItem('allmodelai_response_prefs') || '{}'), systemInstructions: localStorage.getItem('allmodelai_system_instructions') || '' }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          throw new Error('Your session expired. Please sign out and sign in again.');
        }
        throw new Error(errorData.message || 'Could not connect to the AI server.');
      }

      if (!response.body) throw new Error('The AI server did not return a stream.');

      if (response.headers.get('content-type')?.includes('application/json')) {
        const responseData = await response.json();
        setMessages((current) => current.map((message, index) => (
          index === assistantIndex ? { ...message, text: responseData.message || '' } : message
        )));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let revealQueue = '';
      let revealFrame = null;
      let networkFinished = false;
      let finishReveal;
      const revealFinished = new Promise((resolve) => { finishReveal = resolve; });
      const revealText = () => {
        if (revealQueue.length) {
          const amount = Math.max(1, Math.ceil(revealQueue.length / 90));
          const visible = revealQueue.slice(0, amount);
          revealQueue = revealQueue.slice(amount);
          setMessages((current) => current.map((message, index) => (
            index === assistantIndex ? { ...message, text: (message.text || '') + visible } : message
          )));
        }
        if (revealQueue.length) revealFrame = requestAnimationFrame(revealText);
        else { revealFrame = null; if (networkFinished) finishReveal(); }
      };
      const enqueueReveal = (text) => {
        revealQueue += text;
        setIsStreamingResponse(true);
        if (!revealFrame) revealFrame = requestAnimationFrame(revealText);
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
          if (event.routedModel) setRouteInfo({model:event.routedModel,reason:event.routeReason,sources:event.knowledgeSources||[]});
          const partialText = event.text;
          if (partialText) {
            assistantText += partialText;
            enqueueReveal(partialText);
          }
        }

        if (done) break;
      }
      networkFinished = true;
      if (!revealFrame) finishReveal();
      await revealFinished;
      if (conversationId) {
        await apiFetch(`/api/chat/history/${conversationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, messages: [...nextMessages, { role: 'assistant', text: assistantText, modelSlug: selectedSlug }] }),
        });
      }
      await refreshHistory();
      if (document.hidden && Notification.permission === 'granted') new Notification(`${selectedModel.name} finished`, { body: assistantText.slice(0, 120) || 'Your answer is ready.' });
    } catch (requestError) {
      if (requestError.name === 'AbortError') {
        setMessages((current) => current.filter((message, index) => index !== assistantIndex || String(message.text || message.content || '').trim()));
      } else {
        const fallbackMessage = requestError.message === 'Failed to fetch'
          ? 'Could not connect to the backend. Start it with: cd backend && npm start'
          : (requestError.message || 'Could not connect to the AI server.');
        setChatError(fallbackMessage);
        setMessages((current) => current.filter((_, index) => index !== assistantIndex));
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
    setPrompt(text);
    document.querySelector('.chat-composer textarea')?.focus();
  };

  const chooseSkill = (skill) => {
    setSelectedSkill(skill);
    setComposerMenuOpen(false);
    document.querySelector('.chat-composer textarea')?.focus();
  };

  const openConversation = (conversation) => {
    setTemporaryChat(false);
    setActiveProject(null);
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages || []);
    setSelectedSlug(conversation.model || 'gpt');
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

  const newChat = () => { setTemporaryChat(false); setActiveConversationId(null); setMessages([]); setPrompt(''); setSelectedSkill(null); setChatError(''); setSidebarOpen(false); };
  const startTemporaryChat = () => { newChat(); setTemporaryChat(true); setActiveProject(null); };
  const createProject = () => {
    const name = window.prompt('Project name (example: Website launch, Study plan, Marketing)')?.trim();
    if (!name) return;
    const nextProjects = [...projects, { id: Date.now().toString(), name }];
    setProjects(nextProjects); setActiveProject(nextProjects.at(-1)); setTemporaryChat(false);
    localStorage.setItem('allmodelai_projects', JSON.stringify(nextProjects)); newChat();
  };
  const renameProject = (project) => {
    const name = window.prompt('Rename project', project.name)?.trim();
    if (!name) return;
    const nextProjects = projects.map((item) => item.id === project.id ? { ...item, name } : item);
    setProjects(nextProjects);
    if (activeProject?.id === project.id) setActiveProject({ ...project, name });
    localStorage.setItem('allmodelai_projects', JSON.stringify(nextProjects));
    setProjectMenuId(null);
  };
  const deleteProject = (project) => {
    if (!window.confirm(`Delete project "${project.name}"?`)) return;
    const nextProjects = projects.filter((item) => item.id !== project.id);
    setProjects(nextProjects);
    localStorage.setItem('allmodelai_projects', JSON.stringify(nextProjects));
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
      sessionStorage.removeItem('allmodelai_user');
      navigate('/');
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="chat-page">
      <button className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`} aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />
      <aside className={`chat-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-top">
          <Link to="/dashboard" className="chat-brand"><span>AI</span><strong>AllModelAI</strong></Link>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">×</button>
        </div>
        <button className="new-chat" onClick={newChat}><span>＋</span> New conversation</button>
        <div className="workspace-tools">
          <button className={temporaryChat ? 'active' : ''} onClick={startTemporaryChat}><span>◌</span><span><strong>Temporary chat</strong><small>Not saved to history</small></span></button>
          <button onClick={createProject}><span>▣</span><span><strong>New project</strong><small>Organize chats by goal</small></span></button>
          <button onClick={() => navigate('/arena')}><span>⚔</span><span><strong>AI Arena</strong><small>Compare answers side by side</small></span></button>
          <button className={selectedSlug === 'smart' ? 'active' : ''} onClick={() => { setSelectedSlug('smart'); setTemporaryChat(false); setActiveProject(null); newChat(); }}><span>✦</span><span><strong>Smart Router</strong><small>Choose the best AI automatically</small></span></button>
          <button onClick={() => chooseSkill('image')}><span>◈</span><span><strong>Generate image</strong><small>Create an image from text</small></span></button>
          <button onClick={() => navigate('/studio?tool=prompt')}><span>▤</span><span><strong>Prompt library</strong><small>Ready-to-use templates</small></span></button>
          <button disabled={!messages.length} onClick={exportConversation}><span>↓</span><span><strong>Export chat</strong><small>Download this conversation</small></span></button>
          <button onClick={editSystemInstructions}><span>⚙</span><span><strong>AI instructions</strong><small>Set language, style, and behavior</small></span></button>
          <button onClick={backupWorkspace}><span>⬡</span><span><strong>Backup workspace</strong><small>Download chats and settings</small></span></button>
        </div>
        {projects.length > 0 && <div className="project-list"><p>Projects</p>{projects.map((project) => <div className={`project-item ${activeProject?.id === project.id ? 'active' : ''}`} key={project.id}><button className="project-open" onClick={() => { setActiveProject(project); setTemporaryChat(false); setProjectMenuId(null); newChat(); }}><span>▰</span><strong>{project.name}</strong></button><button className="project-more" onClick={() => setProjectMenuId((id) => id === project.id ? null : project.id)} aria-label={`Options for ${project.name}`}>•••</button>{projectMenuId === project.id && <div className="project-menu"><button onClick={() => renameProject(project)}>✎ Rename</button><button className="danger" onClick={() => deleteProject(project)}>Delete</button></div>}</div>)}</div>}
        {favorites.length > 0 && <div className="favorite-list"><p>Favorites <span>{favorites.length}</span></p>{favorites.slice(0, 4).map((favorite) => <button key={favorite.id} onClick={() => chooseSuggestion(favorite.text)} title={favorite.text}><span>★</span><span><strong>{dashboardModels.find((model) => model.slug === favorite.modelSlug)?.name || 'AI response'}</strong><small>{favorite.text}</small></span></button>)}</div>}
        <div className="chat-history">
          <p>Saved conversations <span className="chat-history-count">{chatHistory.length}</span><button className="chat-history-export" type="button" onClick={exportConversation} disabled={!messages.length} title="Export current conversation">↓</button></p>
          <input className="chat-history-search" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search saved chats" aria-label="Search saved chats" />
          {chatHistory.length === 0 && <small className="chat-history-empty">Your saved chats will appear here.</small>}
          {chatHistory.length > 0 && visibleHistory.length === 0 && <small className="chat-history-empty">No matching conversations.</small>}
          {visibleHistory.map((conversation) => <div className={`chat-history-item ${activeConversationId === conversation.id ? 'active' : ''}`} key={conversation.id}>
            <button className="chat-history-open" onClick={() => openConversation(conversation)}><span>{chatMeta[conversation.id]?.pinned ? '★' : '◇'}</span><span><strong>{conversation.title || conversationPreview(conversation)}</strong><small>{conversationPreview(conversation)}</small>{chatMeta[conversation.id]?.tags?.length > 0 && <small className="chat-tags">{chatMeta[conversation.id].tags.map((tag) => `#${tag}`).join(' ')}</small>}<em>Saved · {conversation.model}</em></span></button>
            <button className="chat-history-more" onClick={() => setChatMenuId((id) => id === conversation.id ? null : conversation.id)} aria-label={`Options for ${conversation.title}`}>•••</button>
            {chatMenuId === conversation.id && <div className="chat-history-menu"><button onClick={() => togglePinnedChat(conversation)}>{chatMeta[conversation.id]?.pinned ? '☆ Unpin' : '★ Pin'}</button><button onClick={() => editChatTags(conversation)}># Edit tags</button><button onClick={() => renameConversation(conversation)}>✎ Rename</button><button className="danger" onClick={() => deleteConversation(conversation)}>♲ Delete</button></div>}
          </div>)}
        </div>
        <nav className="sidebar-links" aria-label="Chat navigation"><Link to="/dashboard">⌂ <span>Dashboard</span></Link><Link to="/studio">✦ <span>Workspace Studio</span></Link><Link to="/control-center">⌘ <span>Control Center</span></Link><Link to="/innovation-hub">◈ <span>Innovation Hub</span></Link><Link to="/models/gpt">▦ <span>Model library</span></Link></nav>
        <section className={`sidebar-theme-settings ${themeSettingsVisible?'expanded':'collapsed'}`} aria-label="Theme settings"><div><span>⚙</span><strong>Settings</strong><div className="sidebar-settings-actions"><button type="button" onClick={toggleThemeSettings} aria-expanded={themeSettingsVisible}>{themeSettingsVisible?'Hide':'Show'}</button><Link to="/control-center">More</Link></div></div>{themeSettingsVisible&&<><p>Appearance</p><div className="sidebar-theme-options">{[['light','☀','Light'],['dark','●','Dark'],['auto','◐','Auto']].map(([value,icon,label])=><button type="button" className={themePreference===value?'active':''} onClick={()=>changeTheme(value)} title={`${label} theme`} aria-pressed={themePreference===value} key={value}><i>{icon}</i><span>{label}</span></button>)}</div></>}</section>
        <div className="chat-profile"><span>{user.name?.charAt(0) || user.email.charAt(0)}</span><div><strong>{user.name || 'User'}</strong><small>{user.email}</small></div><button onClick={() => setDeleteModalOpen(true)} aria-label="Sign out" title="Sign out">↗</button></div>
      </aside>

      <section className="chat-workspace">
        <header className="chat-header">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">☰</button>
          <div className="active-model"><img src={selectedModel.image} alt="" /><span><small>{temporaryChat ? 'Temporary chat' : activeProject ? activeProject.name : 'Chatting with'}</small><strong>{selectedModel.name}</strong></span><i>Online</i></div>
          <div className={`model-select custom-model-select ${modelMenuOpen ? 'open' : ''}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setModelMenuOpen(false); }}><span>Model</span><button type="button" className="model-select-trigger" onClick={() => setModelMenuOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={modelMenuOpen}><span>{selectedModel.name} — {selectedModel.provider}</span><i>⌄</i></button>{modelMenuOpen && <div className="model-options" role="listbox" aria-label="Choose AI model">{dashboardModels.map((model) => <button type="button" role="option" aria-selected={selectedSlug === model.slug} className={selectedSlug === model.slug ? 'selected' : ''} key={model.slug} onClick={() => { setSelectedSlug(model.slug); setModelMenuOpen(false); }}><img src={model.image} alt="" /><span><strong>{model.name}</strong><small>{model.provider}</small></span>{selectedSlug === model.slug && <b>✓</b>}</button>)}</div>}</div>
          <Link className="dashboard-link" to="/dashboard">Dashboard</Link>
        </header>
        {(creditStatus || (selectedSlug === 'smart' && routeInfo)) && <div className="chat-statuses">
          {creditStatus && <div className="credit-status" role="status">{creditStatus.unlimited ? 'API access active' : `${creditStatus.remaining} credits remaining`}</div>}
          {selectedSlug === 'smart' && routeInfo && <div className="credit-status" role="status">Smart Router → {routeInfo.model}: {routeInfo.reason}{routeInfo.sources.length ? ` · ${routeInfo.sources.length} knowledge source(s)` : ''}</div>}
        </div>}

        <div className="chat-messages" ref={messagesContainer}>
          {messages.length === 0 && <div className="chat-empty"><div className="model-orb"><img src={selectedModel.image} alt={`${selectedModel.name} logo`} /></div><p className="chat-eyebrow">{selectedModel.provider} · {selectedModel.name}</p><h1>What can I help you create?</h1><p className="chat-subtitle">Start with your own question or choose one of these ideas.</p><div className="prompt-suggestions">{suggestions.map((item) => <button key={item.title} onClick={() => chooseSuggestion(item.prompt)}><span>{item.icon}</span><strong>{item.title}</strong><small>{item.prompt}</small></button>)}</div></div>}
          {messages.map((message, index) => {
            const messageModel = dashboardModels.find((model) => model.slug === message.modelSlug) || selectedModel;
            const text = message.content ?? message.text ?? '';
            if (!text && message.role === 'assistant' && isSending && index === messages.length - 1) return null;
            const activelyStreaming = isStreamingResponse && isSending && index === messages.length - 1 && message.role === 'assistant';
            const editing = message.role === 'user' && editingMessageIndex === index;
            const liked = messageLikes[index];
            const feedback = messageFeedback[index];
            return <article className={`chat-message ${message.role} ${activelyStreaming ? 'streaming-response' : ''}`} key={`${message.role}-${index}`}><span>{message.role === 'user' ? (user.name?.charAt(0) || 'U') : <img src={messageModel.image} alt={`${messageModel.name} logo`} />}</span><div><small>{message.role === 'user' ? 'You' : messageModel.name}</small>{editing ? <div className="inline-message-editor"><textarea autoFocus value={editDraft} onChange={(event) => setEditDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setEditingMessageIndex(null); setEditDraft(''); } if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); saveEditedMessage(); } }} /><div><span>The original version will be saved as a branch.</span><button type="button" onClick={() => { setEditingMessageIndex(null); setEditDraft(''); }}>Cancel</button><button type="button" disabled={!editDraft.trim()} onClick={saveEditedMessage}>Save &amp; resend</button></div></div> : text && <p>{text}{activelyStreaming && <i className="stream-cursor" aria-hidden="true" />}</p>}{message.imageUrl && <img className="generated-image" src={message.imageUrl} alt={text || 'Generated image'} />}{text && !activelyStreaming && !editing && <div className="message-actions">
              {message.role === 'assistant' ? (
                <>
                  <button type="button" data-tooltip="Copy" onClick={() => copyMessage(text)} aria-label="Copy response">⎘</button>
                  <button type="button" data-tooltip={liked ? 'Liked' : 'Like'} className={liked ? 'selected-like' : ''} onClick={() => likeMessage(index)} aria-label="Like response">👍</button>
                  <button type="button" data-tooltip="Feedback" onClick={() => openFeedback(index)} aria-label="Leave feedback">💬</button>
                  <button type="button" data-tooltip="Good response" className={messageRatings[index] === 'up' ? 'selected' : ''} onClick={() => rateMessage(index, 'up')} aria-label="Good response">♧</button>
                  <button type="button" data-tooltip="Bad response" className={messageRatings[index] === 'down' ? 'selected' : ''} onClick={() => rateMessage(index, 'down')} aria-label="Bad response">♧</button>
                  <button type="button" data-tooltip="Share" onClick={() => shareMessage(text)} aria-label="Share response">↗</button>
                  <button type="button" data-tooltip="Retry" onClick={() => retryMessage(index)} aria-label="Retry response">⟳</button>
                  {feedback && <span className="feedback-badge" title={feedback}>Feedback sent</span>}
                </>
              ) : (
                <>
                  <button type="button" data-tooltip="Copy" onClick={() => copyMessage(text)} aria-label="Copy message">⎘</button>
                  <button type="button" data-tooltip="Edit" onClick={() => editMessage(index)} aria-label="Edit message">✎</button>
                </>
              )}
             </div>}
            </div>
           </article>
            })}
          {isSending && !isStreamingResponse && <article className="chat-message assistant thinking-message"><span className="thinking-avatar" aria-hidden="true"><i /></span><div><small>{selectedModel.name}</small><p className="typing-indicator"><b>Thinking<span className="thinking-dots"><i /><i /><i /></span></b></p></div></article>}
          {chatError && <div className="chat-api-error" role="alert"><span>{chatError}</span><div><button type="button" onClick={() => { setSelectedSlug('gemini'); setChatError(''); setPrompt(messages.slice().reverse().find(message => message.role === 'user')?.text || ''); }}>Try with Gemini</button><Link to="/checkout?plan=pro">View demo plans</Link></div></div>}
          <div ref={messagesEnd} />
        </div>

        <form className="chat-composer" onSubmit={sendMessage}>
          <div className="composer-shell">
            {composerMenuOpen && <div className="composer-menu">
              <button type="button" onClick={() => { setComposerMenuOpen(false); fileInput.current?.click(); }}><span>⌕</span> Add photos and files</button>
              <button type="button" onClick={() => setComposerMenuOpen(false)}><span>◇</span> Add from Drive</button>
              <button type="button" onClick={() => chooseSkill('image')}><span>✦</span> Create image</button>
              <button type="button" onClick={() => chooseSkill('video')}><span>▶</span> Make a video</button>
              <button type="button" onClick={() => setComposerMenuOpen(false)}><span>▣</span> Canvas</button>
              <button type="button" onClick={() => chooseSkill('web')}><span>◎</span> Search the web</button>
              <button type="button" disabled={!messages.some((message) => message.role === 'assistant' && (message.text || message.content))} onClick={() => { setComposerMenuOpen(false); sendMessage(null, 'Continue the previous answer from exactly where it stopped. Do not repeat completed content.'); }}><span>→</span> Continue last answer</button>
              <button type="button" disabled={!activeConversationId || !messages.length} onClick={() => { setComposerMenuOpen(false); branchCurrentConversation(); }}><span>⑂</span> Branch conversation</button>
              <button type="button" disabled={!messages.some((message) => message.role === 'assistant' && (message.text || message.content))} onClick={() => { const last = [...messages].reverse().find((message) => message.role === 'assistant' && (message.text || message.content)); if (last) toggleFavorite(last.text || last.content, last.modelSlug); setComposerMenuOpen(false); }}><span>★</span> Save last answer</button>
            </div>}
            <div className="composer-box">
              {selectedSkill && <div className="selected-skill">
                <span className={`selected-skill-icon ${selectedSkill}`} aria-hidden="true">{selectedSkill === 'image' ? '✦' : selectedSkill === 'web' ? '◎' : '▶'}</span>
                <span><strong>{selectedSkill === 'image' ? 'Create image' : selectedSkill === 'web' ? 'Search the web' : 'Make a video'}</strong><small>{selectedSkill === 'image' ? 'Describe the image you want to create' : selectedSkill === 'web' ? 'Current information with sources' : 'Describe the video you want to create'}</small></span>
                <button type="button" className="selected-skill-remove" onClick={() => setSelectedSkill(null)} aria-label="Remove selected skill" title="Remove skill">×</button>
              </div>}
              <input ref={fileInput} className="chat-file-input" type="file" accept=".pdf,.doc,.docx,.txt,.md,.json,.csv,.png,.jpg,.jpeg,.webp,.js,.jsx,.ts,.tsx,.py,.html,.css" onChange={readFile} />
              <textarea value={prompt} onChange={(event) => { setPrompt(event.target.value); loadContextSuggestions(event.target.value); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!isSending) sendMessage(); } }} placeholder={isSending ? selectedSkill === 'web' ? 'Searching the web…' : 'You can type your next message while the answer is being generated…' : selectedSkill === 'image' ? 'Example: a gold dragon flying over a fantasy city at night...' : selectedSkill === 'video' ? 'Describe the video you want to create...' : selectedSkill === 'web' ? 'What do you want to find on the internet?' : `Message ${selectedModel.name}...`} rows="1" aria-label="Chat message" />
              {contextSuggestions.length > 0 && !isSending && <div className="context-suggestions">{contextSuggestions.map((item) => <button key={item} type="button" onClick={() => { setPrompt(item); setContextSuggestions([]); document.querySelector('.chat-composer textarea')?.focus(); }}>{item}</button>)}</div>}
              <div className="composer-tools"><div><button type="button" className="composer-plus" onClick={() => setComposerMenuOpen((open) => !open)} aria-label="Open tools" aria-expanded={composerMenuOpen}>＋</button></div><span>{selectedModel.name} · {isListening ? 'Listening…' : isSending ? 'Generating — you can keep typing' : 'Ready · replies in your language'}</span><div className="composer-actions"><button type="button" className={isListening ? 'voice-active' : ''} onClick={toggleVoiceInput} aria-label="Use microphone" title="Use microphone">●</button>{isSending ? <button className="stop-generation" type="button" onClick={stopGenerating} aria-label="Stop generating" title="Stop generating"><i /></button> : <button className="send-message" type="submit" disabled={!prompt.trim()} aria-label="Send message">↑</button>}</div></div>
            </div>
          </div>
          <p>{selectedModel.name} can make mistakes. Check important information.</p>
        </form>
      </section>
      {deleteModalOpen && <AccountDeleteModal onCancel={() => { setDeleteModalOpen(false); setDeleteError(''); }} onConfirm={deleteAccount} isDeleting={isDeleting} error={deleteError} />}
      {arenaOpen && <div className="feature-modal-backdrop" onClick={() => setArenaOpen(false)}><section className="feature-modal" onClick={(event) => event.stopPropagation()}><span className="feature-modal-icon">⚔</span><small>AI ARENA</small><h2>Compare the best models</h2><p>Describe the exact task you want the models to compare.</p><textarea autoFocus value={arenaTask} onChange={(event) => setArenaTask(event.target.value)} placeholder="Example: Build a launch plan for my new fitness app" rows="3" /><div className="arena-models"><span>GPT</span><span>Claude</span><span>Gemini</span><span>Grok</span></div><button disabled={!arenaTask.trim()} onClick={launchArena}>Create comparison prompt</button><button className="modal-cancel" onClick={() => setArenaOpen(false)}>Cancel</button></section></div>}
      {feedbackModalOpen && <div className="feature-modal-backdrop" onClick={() => setFeedbackModalOpen(false)}><section className="feature-modal" onClick={(event) => event.stopPropagation()}><span className="feature-modal-icon">💬</span><small>FEEDBACK</small><h2>Tell us what this response did well</h2><p>Your feedback helps improve the model.</p><textarea autoFocus value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} placeholder="Example: very clear explanation, great code example" rows="4" /><div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:12}}><button className="modal-cancel" onClick={() => setFeedbackModalOpen(false)}>Cancel</button><button disabled={!feedbackText.trim()} onClick={submitFeedback}>Send feedback</button></div></section></div>}
    </main>
  );
}
