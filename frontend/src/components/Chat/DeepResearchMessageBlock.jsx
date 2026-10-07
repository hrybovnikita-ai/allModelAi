import {
  DeepResearchClarificationCard,
  DeepResearchConfigError,
  DeepResearchDetails,
  DeepResearchProgressPanel,
} from './DeepResearchExperience.jsx';
import { WebSearchStatus } from './WebSources';

export default function DeepResearchMessageBlock({
  message,
  onClarifyStart,
  onClarifySkip,
  onStopResearch,
  onRetry,
}) {
  if (!message?.deepResearch) return null;

  if (message.deepResearchError || message.researchFailure?.message) {
    return (
      <DeepResearchConfigError
        message={message.researchFailure?.message || message.deepResearchError}
        onRetry={onRetry}
      />
    );
  }

  if (message.deepResearchClarification?.questions?.length) {
    return (
      <DeepResearchClarificationCard
        topicTitle={message.deepResearchClarification.topicTitle}
        questions={message.deepResearchClarification.questions}
        busy={message.clarificationBusy}
        onStart={(answers) => onClarifyStart?.(answers, false)}
        onSkip={() => onClarifySkip?.()}
      />
    );
  }

  if (message.webSearching) {
    return (
      <DeepResearchProgressPanel
        topic={message.deepResearchTopic || message.deepResearchClarification?.topicTitle}
        stage={message.webSearchStatus || message.deepResearchProgress?.activeStage}
        sourceCount={message.deepResearchProgress?.sourceCount ?? message.webSearchCount}
        sources={message.webSources || []}
        onStop={onStopResearch}
      />
    );
  }

  if (message.webSearchStatus && !message.text) {
    return (
      <WebSearchStatus
        status={message.webSearchStatus}
        count={message.webSearchCount}
        deepResearch
        label={message.deepResearchLabel}
      />
    );
  }

  if (message.researchMeta) {
    return <DeepResearchDetails meta={message.researchMeta} />;
  }

  return null;
}
