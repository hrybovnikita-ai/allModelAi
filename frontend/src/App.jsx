import "./App.css";
import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import claudeLogo from "./assets/claude.png";
import geminiLogo from "./assets/gemini.png";
import gptLogo from "./assets/gpt.png";
import llamaLogo from "./assets/llama.png";

// Import Components
import Header from "./components/Header/Header";
import ModelsSection from "./components/ModelsSection/ModelsSection";
import About from "./components/About/About";
import Stickers from "./components/Stickers/Stickers";
import Pricing from "./components/Pricing/Pricing";
import Users from "./components/Users/Users";
import Footer from "./components/Footer/Footer";
import Dashboard from "./components/Dashboard/Dashboard";
import ModelDetails from "./components/ModelDetails/ModelDetails";
import Chat from "./components/Chat/Chat";
import Checkout from "./components/Checkout/Checkout";
import SocialAuth from "./components/SocialAuth/SocialAuth";
import Workflow from "./components/Workflow/Workflow";
import Settings from "./components/Settings/Settings";
import Admin from "./components/Admin/Admin";
import ForgotPassword from "./components/ForgotPassword/ForgotPassword";
import { ApiDocs, InfoPage } from "./components/InfoPage/InfoPage";
import Studio from "./components/Studio/Studio";
import CommandPalette from "./components/CommandPalette/CommandPalette";
import ModelExplorer from "./components/ModelExplorer/ModelExplorer";
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
    <div className="app">
      <Header />
      <main className="container home-layout">
        <ModelsSection 
          models={models}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
        />
        <About />
        <Workflow />
        <Users />
        <Stickers />
        <Pricing />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <><CommandPalette /><Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/auth/:provider" element={<SocialAuth />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/api-docs" element={<ApiDocs />} />
      <Route path="/privacy" element={<InfoPage type="privacy" />} />
      <Route path="/terms" element={<InfoPage type="terms" />} />
      <Route path="/refunds" element={<InfoPage type="refund" />} />
      <Route path="/cookies" element={<InfoPage type="cookies" />} />
      <Route path="/models/:slug" element={<ModelDetails />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/explore" element={<ModelExplorer />} />
      <Route path="/arena" element={<Arena />} />
      <Route path="/control-center" element={<ControlCenter />} />
      <Route path="/innovation-hub" element={<InnovationHub />} />
      <Route path="/features" element={<ProductSuite />} />
      <Route path="/ai-tools" element={<AIToolsLab />} />
      <Route path="/creator-tools" element={<CreatorLab />} />
      <Route path="/shared/:token" element={<SharedConversation />} />
      <Route path="/prompts" element={<PromptGallery />} />
      <Route path="/website-builder" element={<WebsiteBuilder />} />
      <Route path="/ai-platform" element={<AIPlatform />} />
    </Routes></>
  );
}
