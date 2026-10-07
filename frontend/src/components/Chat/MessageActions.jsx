import { useCallback, useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '../../lib/clipboard';
import ActionButton from './ActionButton';
import FeedbackPopover from './FeedbackPopover';
import MoreActionsMenu from './MoreActionsMenu';
import * as ActionIcons from './MessageActionIcons';
import './MessageActions.css';

const {
  IconBookmark,
  IconCheck,
  IconContinue,
  IconCopy,
  IconDownload,
  IconFlag,
  IconModelInfo,
  IconMore,
  IconPause,
  IconRegenerate,
  IconShare,
  IconSpinner,
  IconThumbsDown,
  IconThumbsUp,
  IconVolume,
  IconVolumeOff,
} = ActionIcons;

if (import.meta.env.DEV) {
  const requiredIconExports = [
    'IconBookmark',
    'IconCheck',
    'IconContinue',
    'IconCopy',
    'IconDownload',
    'IconFlag',
    'IconModelInfo',
    'IconMore',
    'IconPause',
    'IconRegenerate',
    'IconShare',
    'IconSpinner',
    'IconThumbsDown',
    'IconThumbsUp',
    'IconVolume',
    'IconVolumeOff',
  ];
  for (const name of requiredIconExports) {
    if (typeof ActionIcons[name] !== 'function') {
      throw new Error(`MessageActionIcons.jsx is missing export: ${name}`);
    }
  }
}

function cleanTextForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/[#*_`>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function MessageActions({
  role,
  text,
  copyText,
  messageIndex,
  rating = null,
  feedbackReason = '',
  isFavorite = false,
  modelInfo = null,
  conversationId = null,
  isSending = false,
  isRegenerating = false,
  speechLanguage = 'en-US',
  selectedVoiceName = '',
  availableVoices = [],
  activeSpeechIndex = null,
  onSpeechIndexChange,
  onRate,
  onFeedbackReason,
  onShare,
  onRegenerate,
  onEdit,
  onSaveFavorite,
  onExportMessage,
  onContinueFromHere,
  onViewModelInfo,
  translate = (value) => value,
}) {
  const [copied, setCopied] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [speechState, setSpeechState] = useState('idle');
  const utteranceRef = useRef(null);
  const badButtonRef = useRef(null);
  const moreButtonRef = useRef(null);
  const copyPayload = copyText ?? text;

  const isThisSpeaking = activeSpeechIndex === messageIndex && speechState !== 'idle';

  useEffect(() => {
    if (activeSpeechIndex !== null && activeSpeechIndex !== messageIndex && speechState !== 'idle') {
      globalThis.speechSynthesis?.cancel?.();
      setSpeechState('idle');
      utteranceRef.current = null;
    }
  }, [activeSpeechIndex, messageIndex, speechState]);

  useEffect(() => () => {
    if (activeSpeechIndex === messageIndex) {
      globalThis.speechSynthesis?.cancel?.();
    }
  }, [activeSpeechIndex, messageIndex]);

  const handleCopy = async () => {
    if (!copyPayload || !await copyToClipboard(copyPayload)) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleGood = () => {
    onRate?.(messageIndex, rating === 'up' ? null : 'up');
  };

  const handleBadClick = () => {
    if (rating === 'down' && feedbackReason) {
      onRate?.(messageIndex, null);
      onFeedbackReason?.(messageIndex, '');
      return;
    }
    setFeedbackOpen((open) => !open);
  };

  const handleShare = async () => {
    const shareText = String(text || '').slice(0, 8000);
    if (globalThis.navigator?.share && shareText) {
      try {
        await globalThis.navigator.share({
          title: 'AllModelAI response',
          text: shareText,
        });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    onShare?.(shareText);
  };

  const startSpeech = useCallback(() => {
    const synth = globalThis.speechSynthesis;
    if (!synth?.speak || !globalThis.SpeechSynthesisUtterance) return;
    const clean = cleanTextForSpeech(text);
    if (!clean) return;
    synth.cancel?.();
    const utterance = new globalThis.SpeechSynthesisUtterance(clean);
    utterance.lang = speechLanguage;
    const voice = availableVoices.find((item) => item.name === selectedVoiceName)
      || availableVoices.find((item) => item.lang?.toLowerCase().startsWith(String(speechLanguage).split('-')[0].toLowerCase()));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      setSpeechState('playing');
      onSpeechIndexChange?.(messageIndex);
    };
    utterance.onend = () => {
      setSpeechState('idle');
      utteranceRef.current = null;
      onSpeechIndexChange?.(null);
    };
    utterance.onerror = () => {
      setSpeechState('idle');
      utteranceRef.current = null;
      onSpeechIndexChange?.(null);
    };
    utteranceRef.current = utterance;
    synth.speak(utterance);
  }, [availableVoices, messageIndex, onSpeechIndexChange, selectedVoiceName, speechLanguage, text]);

  const toggleSpeech = () => {
    const synth = globalThis.speechSynthesis;
    if (!synth) return;

    if (isThisSpeaking && speechState === 'playing') {
      if (typeof synth.pause === 'function') {
        synth.pause();
        setSpeechState('paused');
        return;
      }
      synth.cancel?.();
      setSpeechState('idle');
      onSpeechIndexChange?.(null);
      return;
    }

    if (isThisSpeaking && speechState === 'paused') {
      if (typeof synth.resume === 'function') {
        synth.resume();
        setSpeechState('playing');
        return;
      }
    }

    if (activeSpeechIndex !== null && activeSpeechIndex !== messageIndex) {
      synth.cancel?.();
    }
    startSpeech();
  };

  const stopSpeech = () => {
    globalThis.speechSynthesis?.cancel?.();
    setSpeechState('idle');
    utteranceRef.current = null;
    onSpeechIndexChange?.(null);
  };

  const speechTooltip = isThisSpeaking
    ? (speechState === 'paused' ? translate('Resume') : translate('Pause'))
    : translate('Read aloud');

  const SpeechIcon = isThisSpeaking
    ? (speechState === 'playing' ? IconPause : IconVolume)
    : IconVolume;

  if (role === 'user') {
    return (
      <div className="message-actions message-actions-user" role="toolbar" aria-label="Message actions">
        <ActionButton label={translate('Copy message')} tooltip={translate('Copy')} onClick={handleCopy}>
          {copied ? <IconCheck /> : <IconCopy />}
        </ActionButton>
        <ActionButton label={translate('Edit message')} tooltip={translate('Edit')} onClick={() => onEdit?.(messageIndex)}>
          <svg className="message-action-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </ActionButton>
      </div>
    );
  }

  const moreItems = [
    {
      id: 'save',
      icon: IconBookmark,
      label: isFavorite ? translate('Remove saved answer') : translate('Save response'),
      description: translate('Save this answer'),
      onClick: () => onSaveFavorite?.(),
      hidden: !onSaveFavorite,
    },
    {
      id: 'export',
      icon: IconDownload,
      label: translate('Export response'),
      description: translate('Download as text file'),
      onClick: () => onExportMessage?.(),
      hidden: !onExportMessage,
    },
    {
      id: 'continue',
      icon: IconContinue,
      label: translate('Continue from here'),
      description: translate('Continue the previous answer'),
      onClick: () => onContinueFromHere?.(),
      disabled: isSending,
      hidden: !onContinueFromHere,
    },
    {
      id: 'model',
      icon: IconModelInfo,
      label: translate('View model information'),
      description: modelInfo
        ? `${modelInfo.provider || ''}${modelInfo.provider ? ' · ' : ''}${modelInfo.name || ''}`.trim()
        : translate('Provider and model'),
      onClick: () => onViewModelInfo?.(),
      hidden: !modelInfo,
    },
    {
      id: 'share',
      icon: IconShare,
      label: translate('Share'),
      description: translate('Share or copy link'),
      onClick: handleShare,
      className: 'message-actions-mobile-share',
    },
    {
      id: 'report',
      icon: IconFlag,
      label: translate('Report response'),
      description: translate('Tell us what went wrong'),
      onClick: () => setFeedbackOpen(true),
      danger: true,
      separatorBefore: true,
    },
  ];

  return (
    <div className="message-actions message-actions-assistant" role="toolbar" aria-label="Assistant message actions">
      <div className="message-actions-primary">
        <ActionButton label={translate('Copy response')} tooltip={copied ? translate('Copied') : translate('Copy')} onClick={handleCopy}>
          {copied ? <IconCheck /> : <IconCopy />}
        </ActionButton>

        <ActionButton
          label={translate('Good response')}
          tooltip={translate('Good response')}
          onClick={handleGood}
          active={rating === 'up'}
          activeVariant="is-positive"
        >
          <IconThumbsUp />
        </ActionButton>

        <span className="message-action-anchor">
          <ActionButton
            label={translate('Bad response')}
            tooltip={translate('Bad response')}
            onClick={handleBadClick}
            active={rating === 'down'}
            activeVariant="is-negative"
            ariaExpanded={feedbackOpen}
            ariaHaspopup="dialog"
            buttonRef={badButtonRef}
          >
            <IconThumbsDown />
          </ActionButton>
          <FeedbackPopover
            anchorRef={badButtonRef}
            open={feedbackOpen}
            onClose={() => setFeedbackOpen(false)}
            initialReason={feedbackReason}
            onSelectReason={(reason) => {
              onRate?.(messageIndex, 'down');
              onFeedbackReason?.(messageIndex, reason);
            }}
          />
        </span>

        <ActionButton
          label={translate('Share response')}
          tooltip={translate('Share')}
          onClick={handleShare}
          className="message-actions-desktop-only"
        >
          <IconShare />
        </ActionButton>

        <ActionButton
          label={isThisSpeaking && speechState === 'playing' ? translate('Pause reading') : translate('Read response aloud')}
          tooltip={speechTooltip}
          onClick={toggleSpeech}
          active={isThisSpeaking}
          activeVariant="is-speech"
        >
          <SpeechIcon />
        </ActionButton>
        {isThisSpeaking && (
          <ActionButton label={translate('Stop reading')} tooltip={translate('Stop')} onClick={stopSpeech} className="message-actions-desktop-only">
            <IconVolumeOff />
          </ActionButton>
        )}

        <ActionButton
          label={translate('Regenerate response')}
          tooltip={translate('Regenerate response')}
          onClick={() => onRegenerate?.(messageIndex)}
          disabled={isSending || isRegenerating}
          className="message-actions-regenerate"
        >
          {isRegenerating ? <IconSpinner /> : <IconRegenerate />}
        </ActionButton>
      </div>

      <span className="message-action-anchor message-actions-more-wrap">
        <ActionButton
          label={translate('More response actions')}
          tooltip={translate('More')}
          onClick={() => setMoreOpen((open) => !open)}
          ariaExpanded={moreOpen}
          ariaHaspopup="menu"
          buttonRef={moreButtonRef}
        >
          <IconMore />
        </ActionButton>
        <MoreActionsMenu
          anchorRef={moreButtonRef}
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          items={moreItems}
        />
      </span>

      {feedbackReason && rating === 'down' && (
        <span className="message-feedback-chip" title={feedbackReason}>
          {translate('Feedback saved')}
        </span>
      )}
    </div>
  );
}
