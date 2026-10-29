import GeneratedFile from './components/GeneratedFile/GeneratedFile';
import "./App.css";
import { useLanguage } from "./lib/useLanguage";
import RainbowExperience from "./components/RainbowExperience/RainbowExperience";
import AuthPage from "./components/Login/AuthPage";
import PlatformStudio from "./components/Platform/PlatformStudio";
import StudioLabs from "./components/StudioLabs/StudioLabs";
import RequireAuth from "./components/Login/RequireAuth";
import { lazy, Suspense, useLayoutEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import claudeLogo from "./assets/claude.png";
import geminiLogo from "./assets/gemini.png";
import gptLogo from "./assets/gpt.png";
import llamaLogo from "./assets/llama.png";
 
// Import Components
import Header from "./components/Header/Header";
import HomeReveal from "./components/HomeReveal/HomeReveal";
import ModelsSection from "./components/ModelsSection/ModelsSection";
import About from "./components/About/About";
import Stickers from "./components/Stickers/Stickers";
import Pricing from "./components/Pricing/Pricing";
import Users from "./components/Users/Users";
import Footer from "./components/Footer/Footer";
import Dashboard from "./components/Dashboard/Dashboard";
import PaymentOrderHistory from "./components/Dashboard/PaymentOrderHistory";
import CreditsWallet from "./components/Credits/CreditsWallet";
import AiMemoryPage from "./components/Memory/AiMemoryPage";
import ModelDetails from "./components/ModelDetails/ModelDetails";
import Chat from "./components/Chat/Chat";
import Checkout from "./components/Checkout/Checkout";
import CheckoutSuccess from "./components/Checkout/CheckoutSuccess";
import CheckoutCancel from "./components/Checkout/CheckoutCancel";
import SocialAuthCallback from "./components/SocialAuth/SocialAuthCallback";
import GoogleRedirectRecoveryGate from "./components/SocialAuth/GoogleRedirectRecoveryGate";
import Workflow from "./components/Workflow/Workflow";
import Settings from "./components/Settings/Settings";
import Admin from "./components/Admin/Admin";
import ForgotPassword from "./components/ForgotPassword/ForgotPassword";
import VerifyEmail from "./components/VerifyEmail/VerifyEmail";
import { ApiDocs, InfoPage } from "./components/InfoPage/InfoPage";
import Studio from "./components/Studio/Studio";
import CommandPalette from "./components/CommandPalette/CommandPalette";
import Arena from "./components/Arena/Arena";
import ControlCenter from "./components/ControlCenter/ControlCenter";
import InnovationHub from "./components/InnovationHub/InnovationHub";
import ProductSuite from "./components/ProductSuite/ProductSuite";
import AIToolsLab from "./components/AIToolsLab/AIToolsLab";
import CreatorLab from "./components/CreatorLab/CreatorLab";
import SharedConversation from "./components/SharedConversation";
import PromptGallery from "./components/PromptGallery/PromptGallery";
import WebsiteBuilder from "./components/WebsiteBuilder/WebsiteBuilder";
import AIPlatform from "./components/AIPlatform/AIPlatform";
import InnovationLab from "./components/InnovationLab/InnovationLab";
import ExpansionHub from "./components/ExpansionHub/ExpansionHub";
import SkillsHub from "./components/SkillsHub/SkillsHub";
import ProductionCenter from "./components/ProductionCenter/ProductionCenter";
import NextTen from "./components/NextTen/NextTen";
import NextNine from "./components/NextNine/NextNine";
import NextTwentyFive from "./components/NextTwentyFive/NextTwentyFive";
import ChatSettings from "./components/ChatSettings/ChatSettings";
import BuilderTwentyFive from "./components/BuilderTwentyFive/BuilderTwentyFive";
import PowerCenter from "./components/PowerCenter/PowerCenter";
import NextTwenty from "./components/NextTwenty/NextTwenty";
import AppTwenty from "./components/AppTwenty/AppTwenty";
import NextThirty from "./components/NextThirty/NextThirty";
import NextFifteen from "./components/NextFifteen/NextFifteen";
import NextTwelve from "./components/NextTwelve/NextTwelve";
import CookieConsent from "./components/CookieConsent/CookieConsent";
import AuthSessionNotice from "./components/AuthSessionNotice/AuthSessionNotice";
import ModelComparison from "./components/ModelComparison/ModelComparison";
import UsageAnalytics from "./components/UsageAnalytics/UsageAnalytics";
import ModelExplorer from "./components/ModelExplorer/ModelExplorer";
import PricingPage from "./pages/PricingPage";
import BillingPage from "./pages/BillingPage";

import EverydayAI from "./components/EverydayAI/EverydayAI";
import EverydayCards from "./components/EverydayAI/EverydayCards";
import PythonAILab from "./components/PythonAILab/PythonAILab";
import AiTrainingHub from "./components/AiTraining/AiTrainingHub";
import KnowledgeBasePage from "./components/KnowledgeBase/KnowledgeBasePage";
import AiFilesPage from "./components/AiFiles/AiFilesPage";
import AiWorkflowsPage from "./components/AiWorkflows/AiWorkflowsPage";
import EvaluationLabPage from "./components/EvaluationLab/EvaluationLabPage";
import LessonPage from "./components/AiTraining/LessonPage";
import AiLearningLab from "./components/AiLearning/AiLearningLab";
import ModelLab from "./components/ModelLab/ModelLab";
import ModelDiagnostics from "./components/Developer/ModelDiagnostics";
import ProviderHealthDashboard from "./components/ProviderHealth/ProviderHealthDashboard";
import CodeWorkspacePage from "./components/CodeWorkspace/CodeWorkspacePage";
import AILearningDashboard from "./components/Developer/AILearningDashboard";
import StorageHub from "./components/StorageHub/StorageHub";
import VoiceStudio from "./components/VoiceStudio/VoiceStudio";

function HomePage() {
  const [selectedModel, setSelectedModel] = useState("claude");

  const models = {
    claude: {
      name: "Claude",
      provider: "Anthropic",
      logo: claudeLogo,
      description: "Advanced AI assistant built by Anthropic for complex reasoning and tasks",
      versions: [
        { name: "Claude Opus", id: "claude-opus-4.1", tier: "Premium", speed: "Slowest", capability: "Highest" },
        { name: "Claude Sonnet", id: "claude-sonnet-4.6", tier: "Mid-tier", speed: "Fast", capability: "Very High" },
        { name: "Claude Haiku", id: "claude-haiku-4.5", tier: "Free", speed: "Fastest", capability: "High" }
      ],
      color: "#6366F1"
    },
    gemini: {
      name: "Gemini",
      provider: "Google",
      logo: geminiLogo,
      description: "Google's multimodal AI model family with strong performance across tasks",
      versions: [
        { name: "Gemini Pro", id: "gemini-pro", tier: "Premium", speed: "Very Fast", capability: "Very High" },
        { name: "Gemini Flash", id: "gemini-flash", tier: "Standard", speed: "Fastest", capability: "High" },
        { name: "Gemini Nano", id: "gemini-nano", tier: "Free", speed: "Instant", capability: "Good" }
      ],
      color: "#4285F4"
    },
    gpt: {
      name: "GPT",
      provider: "OpenAI",
      logo: gptLogo,
      description: "Leading language models for text generation and understanding",
      versions: [
        { name: "GPT-4 Turbo", id: "gpt-4-turbo", tier: "Premium", speed: "Very Fast", capability: "Highest" },
        { name: "GPT-4 Mini", id: "gpt-4-mini", tier: "Standard", speed: "Fast", capability: "High" },
        { name: "GPT-3.5", id: "gpt-3.5-turbo", tier: "Free", speed: "Fastest", capability: "Good" }
      ],
      color: "#00D084"
    },
    llama: {
      name: "Llama",
      provider: "Meta",
      logo: llamaLogo,
      description: "Open-source language model with strong reasoning capabilities",
      versions: [
        { name: "Llama 3.1", id: "llama-3.1-405b", tier: "Premium", speed: "Fast", capability: "Very High" },
        { name: "Llama 3.0", id: "llama-3-70b", tier: "Standard", speed: "Very Fast", capability: "High" },
        { name: "Llama 2", id: "llama-2-7b", tier: "Free", speed: "Fastest", capability: "Good" }
      ],
      color: "#DC2D21"
    }
  };

  return (
    <div className="app home-surface">
      <Header />
      <main className="container home-layout">
        <HomeReveal>
          <ModelsSection
            models={models}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
          />
        </HomeReveal>
        <HomeReveal delay={40}>
          <RainbowExperience />
        </HomeReveal>
        <HomeReveal delay={60}>
          <EverydayCards />
        </HomeReveal>
        <HomeReveal delay={40}>
          <About />
        </HomeReveal>
        <HomeReveal delay={40}>
          <Workflow />
        </HomeReveal>
        <HomeReveal delay={50}>
          <Users />
        </HomeReveal>
        <HomeReveal delay={40}>
          <Stickers />
        </HomeReveal>
        <HomeReveal delay={60}>
          <Pricing />
        </HomeReveal>
      </main>
      <Footer />
    </div>
  );
}

const ClerkAuthTestPage = import.meta.env.DEV
  ? lazy(() => import("./components/ClerkAuthTest/ClerkAuthTestPage.jsx"))
  : null;

export default function App() {
  useLanguage();
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  return (
    <><GoogleRedirectRecoveryGate /><CommandPalette /><CookieConsent /><AuthSessionNotice /><Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/auth/callback" element={<SocialAuthCallback />} />
      {import.meta.env.DEV && ClerkAuthTestPage ? (
        <Route
          path="/auth/clerk-test"
          element={(
            <Suspense fallback={<p>Loading Clerk test…</p>}>
              <ClerkAuthTestPage />
            </Suspense>
          )}
        />
      ) : null}
      <Route path="/auth/:provider" element={<SocialAuthCallback />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/api-docs" element={<ApiDocs />} />
      <Route path="/privacy" element={<InfoPage type="privacy" />} />
      <Route path="/terms" element={<InfoPage type="terms" />} />
      <Route path="/refunds" element={<InfoPage type="refund" />} />
      <Route path="/acceptable-use" element={<InfoPage type="aup" />} />
      <Route path="/contact" element={<InfoPage type="contact" />} />
      <Route path="/cookies" element={<InfoPage type="cookies" />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/explore" element={<ModelExplorer />} />
      <Route path="/provider-health" element={<ProviderHealthDashboard />} />
      <Route path="/python-ai" element={<PythonAILab />} />
      <Route path="/ai-python" element={<PythonAILab />} />
      <Route path="/ai-training" element={<AiTrainingHub />} />
      <Route path="/ai-training/:lessonId" element={<LessonPage />} />
      <Route path="/ai-learning" element={<AiLearningLab />} />
      <Route path="/model-lab" element={<ModelLab />} />
      <Route path="/shared/:token" element={<SharedConversation />} />
      <Route path="/login" element={<AuthPage mode="signin" />} />
      <Route path="/register" element={<AuthPage mode="signup" />} />
      <Route path="/checkout/success" element={<CheckoutSuccess />} />
      <Route path="/checkout/cancel" element={<CheckoutCancel />} />
      <Route path="/payment/success" element={<CheckoutSuccess />} />
      <Route path="/payment/cancelled" element={<CheckoutCancel />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/checkout/starter" element={<Checkout />} />
      <Route path="/checkout/pro" element={<Checkout />} />
      <Route path="/checkout/unlimited" element={<Checkout />} />
      <Route path="/checkout/enterprise" element={<Checkout />} />
      <Route element={<RequireAuth />}>
      <Route path="/models/:slug" element={<ModelDetails />} />
      <Route path="/prompts" element={<PromptGallery />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/dashboard/orders" element={<PaymentOrderHistory />} />
      <Route path="/credits" element={<CreditsWallet />} />
      <Route path="/ai-memory" element={<AiMemoryPage />} />
      <Route path="/everyday-ai" element={<EverydayAI />} />
      <Route path="/everyday-ai/:tool" element={<EverydayAI />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/billing" element={<BillingPage />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/developer/model-diagnostics" element={<ModelDiagnostics />} />
      <Route path="/developer/ai-learning" element={<AILearningDashboard />} />
      <Route path="/knowledge" element={<KnowledgeBasePage />} />
      <Route path="/platform" element={<PlatformStudio />} />
      <Route path="/studio-labs" element={<StudioLabs />} />
      <Route path="/ai-files" element={<AiFilesPage />} />
      <Route path="/ai-workflows" element={<AiWorkflowsPage />} />
      <Route path="/evaluation-lab" element={<EvaluationLabPage />} />
      <Route path="/files/:conversationId/:fileId" element={<GeneratedFile />} />
      <Route path="/model-comparison" element={<ModelComparison />} />
      <Route path="/usage-analytics" element={<UsageAnalytics />} />
      <Route path="/storage" element={<StorageHub />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/voice-studio" element={<VoiceStudio />} />
      <Route path="/code-workspace" element={<CodeWorkspacePage />} />
      <Route path="/arena" element={<Arena />} />
      <Route path="/control-center" element={<ControlCenter />} />
      <Route path="/innovation-hub" element={<InnovationHub />} />
      <Route path="/features" element={<ProductSuite />} />
      <Route path="/ai-tools" element={<AIToolsLab />} />
      <Route path="/creator-tools" element={<CreatorLab />} />
      <Route path="/website-builder" element={<WebsiteBuilder />} />
      <Route path="/app-builder" element={<WebsiteBuilder />} />
      <Route path="/ai-platform" element={<AIPlatform />} />
      <Route path="/innovation-lab" element={<InnovationLab />} />
      <Route path="/expansion-hub" element={<ExpansionHub />} />
      <Route path="/skills-hub" element={<SkillsHub />} />
      <Route path="/production" element={<ProductionCenter />} />
      <Route path="/next-10" element={<NextTen />} />
      <Route path="/next-9" element={<NextNine />} />
      <Route path="/next-25" element={<NextTwentyFive />} />
      <Route path="/chat/settings" element={<ChatSettings />} />
      <Route path="/builder-25" element={<BuilderTwentyFive />} />
      <Route path="/power-center" element={<PowerCenter />} />
      <Route path="/next-20" element={<NextTwenty />} />
      <Route path="/app-20" element={<AppTwenty />} />
      <Route path="/next-30" element={<NextThirty />} />
      <Route path="/next-15" element={<NextFifteen />} />
      <Route path="/next-12" element={<NextTwelve />} />
      </Route>
    </Routes></>
  );
}
