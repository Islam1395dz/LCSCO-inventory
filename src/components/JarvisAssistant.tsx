import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Cpu,
  FlaskConical,
  Globe,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  buildPersonalizedJarvisGreeting,
  JarvisChemicalCard,
  JarvisInventorySnapshot,
  JarvisUserContext,
  PendingJarvisAction,
} from '../services/jarvisBackendTools';
import { ContainerStatus, UserRole } from '../types/inventory';
import { formatRoleLabel } from '../utils/formatters';

export type JarvisAssistantState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'ERROR';
export type JarvisSpeechLang = 'auto' | 'en' | 'fr' | 'ar';

export interface JarvisChatMessage {
  id: string;
  sender: 'user' | 'jarvis';
  text: string;
  timestamp: string;
  language?: 'en' | 'fr' | 'ar';
  cards?: JarvisChemicalCard[];
  pendingAction?: PendingJarvisAction | null;
  executedTools?: string[];
  isError?: boolean;
  isSystemConfirmation?: boolean;
}

interface JarvisAssistantProps {
  onSelectContainer: (containerId: string) => void;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string; confidence: number };
    };
  };
}

export const JarvisAssistant: React.FC<JarvisAssistantProps> = ({
  onSelectContainer,
  externalOpen,
  onExternalOpenChange,
}) => {
  const {
    profile,
    containers,
    products,
    transactions,
    purchaseRequests,
    disposalRequests,
    adjustmentRequests,
    stockRuptureRequests,
    physicalLocations,
    recordWithdrawal,
    createPurchaseRequest,
    reportStockRupture,
    registerContainer,
    updatePreviewState,
    isPreviewMode,
  } = useInventoryContext();

  const { language: appLanguage, tr } = useLanguage();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [assistantState, setAssistantState] =
    useState<JarvisAssistantState>('IDLE');
  const [speechLang, setSpeechLang] = useState<JarvisSpeechLang>('auto');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [useNeuralVoice, setUseNeuralVoice] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const [messages, setMessages] = useState<JarvisChatMessage[]>([]);
  const [activePendingAction, setActivePendingAction] =
    useState<PendingJarvisAction | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const [isConfirmingAction, setIsConfirmingAction] = useState<boolean>(false);
  const [sessionToastText, setSessionToastText] = useState<string | null>(null);

  const recognitionRef = useRef<any | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const greetedUidRef = useRef<string | null>(null);
  const executedClientActionIdsRef = useRef<Set<string>>(new Set());

  // Sync with external open prop from header button if provided
  useEffect(() => {
    if (typeof externalOpen === 'boolean') {
      setIsOpen(externalOpen);
    }
  }, [externalOpen]);

  const handleSetOpen = useCallback(
    (nextOpen: boolean) => {
      setIsOpen(nextOpen);
      if (nextOpen) {
        setSessionToastText(null);
      }
      if (onExternalOpenChange) {
        onExternalOpenChange(nextOpen);
      }
    },
    [onExternalOpenChange]
  );

  // Check browser SpeechRecognition support on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionCtor =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      setSpeechSupported(Boolean(SpeechRecognitionCtor));
    }
  }, []);

  // Auto-scroll to newest message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, liveTranscript, isOpen, assistantState]);

  const getCurrentSnapshot = useCallback((): JarvisInventorySnapshot => {
    return {
      containers,
      products,
      transactions,
      purchaseRequests,
      disposalRequests,
      adjustmentRequests,
      stockRuptureRequests,
      physicalLocations,
    };
  }, [
    containers,
    products,
    transactions,
    purchaseRequests,
    disposalRequests,
    adjustmentRequests,
    stockRuptureRequests,
    physicalLocations,
  ]);

  const getCurrentUserContext = useCallback((): JarvisUserContext => {
    return {
      uid: profile?.uid || 'anon',
      fullName: profile?.fullName || '',
      email: profile?.email || '',
      role: profile?.role || UserRole.PHD_STUDENT,
      laboratoryIds: profile?.laboratoryIds || ['LCSCO'],
    };
  }, [profile]);

  /**
   * Stop any active speech output (both Web Speech API and Web Audio API neural TTS)
   */
  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (activeAudioSourceRef.current) {
      try {
        activeAudioSourceRef.current.stop();
        activeAudioSourceRef.current.disconnect();
      } catch {
        // Ignore already stopped source
      }
      activeAudioSourceRef.current = null;
    }
    setAssistantState((prev) => (prev === 'SPEAKING' ? 'IDLE' : prev));
  }, []);

  /**
   * Speak text aloud using browser SpeechSynthesis (or optional Gemini Neural TTS)
   */
  const speakResponse = useCallback(
    async (text: string, lang: 'en' | 'fr' | 'ar' = 'en') => {
      if (isMuted || !text.trim()) {
        setAssistantState((prev) => (prev === 'ERROR' ? 'ERROR' : 'IDLE'));
        return;
      }

      stopSpeaking();

      const cleanText = text
        .replace(/[*_`#]/g, '')
        .replace(/→/g, ', ')
        .trim();

      if (useNeuralVoice) {
        try {
          setAssistantState('SPEAKING');
          const res = await fetch('/api/jarvis/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanText }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.audioBase64) {
              const binaryString = window.atob(data.audioBase64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const pcm16 = new Int16Array(bytes.buffer);
              const float32 = new Float32Array(pcm16.length);
              for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768;
              }

              const AudioCtx =
                window.AudioContext || (window as any).webkitAudioContext;
              if (!audioContextRef.current) {
                audioContextRef.current = new AudioCtx({ sampleRate: 24000 });
              }
              const ctx = audioContextRef.current;
              if (ctx.state === 'suspended') {
                await ctx.resume();
              }

              const buffer = ctx.createBuffer(1, float32.length, 24000);
              buffer.getChannelData(0).set(float32);

              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              activeAudioSourceRef.current = source;

              source.onended = () => {
                activeAudioSourceRef.current = null;
                setAssistantState('IDLE');
              };
              source.start(0);
              return;
            }
          }
        } catch {
          // Fall through to reliable Web Speech API synthesis
        }
      }

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(cleanText);
          const targetLocale =
            lang === 'fr' ? 'fr-FR' : lang === 'ar' ? 'ar-SA' : 'en-GB';
          utterance.lang = targetLocale;
          utterance.rate = 1.02;
          utterance.pitch = 0.96;

          const voices = window.speechSynthesis.getVoices();
          const preferredVoice =
            voices.find(
              (v) =>
                v.lang.toLowerCase().startsWith(lang) &&
                (v.name.toLowerCase().includes('daniel') ||
                  v.name.toLowerCase().includes('thomas') ||
                  v.name.toLowerCase().includes('google') ||
                  v.name.toLowerCase().includes('natural'))
            ) || voices.find((v) => v.lang.toLowerCase().startsWith(lang));

          if (preferredVoice) {
            utterance.voice = preferredVoice;
          }

          utterance.onstart = () => setAssistantState('SPEAKING');
          utterance.onend = () => setAssistantState('IDLE');
          utterance.onerror = () => setAssistantState('IDLE');

          setAssistantState('SPEAKING');
          window.speechSynthesis.speak(utterance);
        } catch {
          setAssistantState('IDLE');
        }
      } else {
        setAssistantState('IDLE');
      }
    },
    [isMuted, stopSpeaking, useNeuralVoice]
  );

  /**
   * Phase 2 — Personalized Session Greeting
   * Runs once per new login session (persisted in sessionStorage so ordinary component renders
   * or page refreshes do not re-trigger the login toast/voice announcement).
   */
  useEffect(() => {
    if (!profile || !profile.uid) return;
    if (greetedUidRef.current === profile.uid && messages.length > 0) return;

    greetedUidRef.current = profile.uid;
    const effectiveLang: 'en' | 'fr' | 'ar' =
      speechLang !== 'auto'
        ? speechLang
        : appLanguage === 'fr'
        ? 'fr'
        : 'en';

    const greetingText = buildPersonalizedJarvisGreeting({
      user: getCurrentUserContext(),
      snapshot: getCurrentSnapshot(),
      localHour: new Date().getHours(),
      language: effectiveLang,
    });

    const initialMessage: JarvisChatMessage = {
      id: `jarvis-greeting-${profile.uid}`,
      sender: 'jarvis',
      text: greetingText,
      timestamp: new Date().toISOString(),
      language: effectiveLang,
    };

    setMessages([initialMessage]);

    // Check if this is a brand-new login session in sessionStorage
    const sessionGreetingKey = `lcsco_jarvis_login_greeted_${profile.uid}`;
    if (
      typeof window !== 'undefined' &&
      !sessionStorage.getItem(sessionGreetingKey)
    ) {
      sessionStorage.setItem(sessionGreetingKey, 'true');
      setSessionToastText(greetingText);
    }
  }, [
    profile,
    appLanguage,
    speechLang,
    getCurrentUserContext,
    getCurrentSnapshot,
    messages.length,
  ]);

  // Speak greeting aloud the first time the user opens the JARVIS HUD in this session
  useEffect(() => {
    if (!isOpen || !profile?.uid || messages.length === 0) return;
    const sessionSpokenKey = `lcsco_jarvis_spoken_greeting_${profile.uid}`;
    if (!sessionStorage.getItem(sessionSpokenKey)) {
      sessionStorage.setItem(sessionSpokenKey, 'true');
      const firstMsg = messages[0];
      if (firstMsg && firstMsg.sender === 'jarvis') {
        speakResponse(
          firstMsg.text,
          firstMsg.language || (appLanguage === 'fr' ? 'fr' : 'en')
        );
      }
    }
  }, [isOpen, profile?.uid, messages, speakResponse, appLanguage]);

  /**
   * Synchronize a confirmed backend action with the client-side AuthAndInventoryContext
   */
  const syncConfirmedActionWithClientContext = useCallback(
    async (
      action: PendingJarvisAction,
      updatedSnapshot?: JarvisInventorySnapshot
    ) => {
      if (isPreviewMode && updatedSnapshot) {
        updatePreviewState({
          containers: updatedSnapshot.containers,
          transactions: updatedSnapshot.transactions,
          purchaseRequests: updatedSnapshot.purchaseRequests,
          disposalRequests: updatedSnapshot.disposalRequests,
          adjustmentRequests: updatedSnapshot.adjustmentRequests,
          stockRuptureRequests: updatedSnapshot.stockRuptureRequests,
        });
        return;
      }

      try {
        if (
          action.actionType === 'RECORD_CONSUMPTION' &&
          action.payload.containerId &&
          action.payload.amount
        ) {
          await recordWithdrawal({
            containerId: action.payload.containerId,
            amount: Number(action.payload.amount),
            unit: action.payload.unit || ('g' as any),
            reason: `[JARVIS Voice Confirmed] ${action.payload.reason}`,
          });
        } else if (action.actionType === 'CREATE_PURCHASE_REQUEST') {
          await createPurchaseRequest({
            chemicalName: action.payload.chemicalName,
            casNumber: action.payload.casNumber || 'N/A',
            formula: action.payload.formula || 'N/A',
            requestedQuantity: Number(action.payload.amount || 500),
            unit: action.payload.unit || ('g' as any),
            supplier: action.payload.supplier || 'Sigma-Aldrich',
            laboratoryId: 'LCSCO',
            reason: action.payload.reason,
          });
        } else if (
          action.actionType === 'REPORT_STOCK_RUPTURE' &&
          action.payload.containerId
        ) {
          await reportStockRupture({
            containerId: action.payload.containerId,
            comment: action.payload.reason,
          });
        } else if (action.actionType === 'REGISTER_CONTAINER') {
          await registerContainer({
            containerId:
              action.payload.containerId ||
              `BOT-${Date.now().toString(36).slice(-4).toUpperCase()}`,
            productId:
              action.payload.productId ||
              products[0]?.productId ||
              'PROD-PDF-001',
            laboratoryId: 'LCSCO',
            initialQuantity: Number(action.payload.amount || 1000),
            currentQuantity: Number(action.payload.amount || 1000),
            unit: action.payload.unit || ('g' as any),
            building: 'LCSCO',
            room: action.payload.room || 'Hallway',
            unitName: action.payload.cabinet || 'CAB 1',
            side: action.payload.side || 'Left',
            shelf: action.payload.shelf || '1',
            position: action.payload.position || '01',
            storageCondition: action.payload.cabinet || 'CAB 1',
            lotNumber: action.payload.lotNumber || 'LOT-2026',
            supplier: action.payload.supplier || 'Sigma-Aldrich',
            expiryDate: action.payload.expiryDate || '2028-12-31',
          });
        }
      } catch {
        if (updatedSnapshot) {
          updatePreviewState({
            containers: updatedSnapshot.containers,
            transactions: updatedSnapshot.transactions,
            purchaseRequests: updatedSnapshot.purchaseRequests,
            stockRuptureRequests: updatedSnapshot.stockRuptureRequests,
          });
        }
      }
    },
    [
      isPreviewMode,
      updatePreviewState,
      recordWithdrawal,
      createPurchaseRequest,
      reportStockRupture,
      registerContainer,
      products,
    ]
  );

  /**
   * Execute a confirmed PendingJarvisAction
   */
  const handleConfirmPendingAction = useCallback(
    async (actionToConfirm: PendingJarvisAction) => {
      if (
        isConfirmingAction ||
        executedClientActionIdsRef.current.has(actionToConfirm.actionId)
      ) {
        return;
      }

      setIsConfirmingAction(true);
      setAssistantState('PROCESSING');
      stopSpeaking();

      try {
        const response = await fetch('/api/jarvis/execute-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pendingAction: actionToConfirm,
            userContext: getCurrentUserContext(),
            inventorySnapshot: getCurrentSnapshot(),
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(
            data.error || 'Failed to complete inventory transaction.'
          );
        }

        executedClientActionIdsRef.current.add(actionToConfirm.actionId);
        setActivePendingAction(null);

        if (!data.alreadyExecuted) {
          await syncConfirmedActionWithClientContext(
            actionToConfirm,
            data.updatedSnapshot
          );
        }

        const replyLang: 'en' | 'fr' | 'ar' =
          speechLang !== 'auto'
            ? speechLang
            : appLanguage === 'fr'
            ? 'fr'
            : 'en';

        const confirmationText =
          data.confirmationMessage ||
          tr(
            'Done. The stock record has been updated.',
            'Terminé. Le registre de stock a été mis à jour.'
          );

        const confirmMsg: JarvisChatMessage = {
          id: `jarvis-exec-${Date.now()}`,
          sender: 'jarvis',
          text: confirmationText,
          timestamp: new Date().toISOString(),
          language: replyLang,
          cards: data.updatedCard ? [data.updatedCard] : [],
          isSystemConfirmation: true,
        };

        setMessages((prev) => [...prev, confirmMsg]);
        speakResponse(confirmationText, replyLang);
      } catch (err: any) {
        setAssistantState('ERROR');
        const failText =
          err?.message ||
          tr(
            'The stock operation could not be completed. No changes were saved.',
            "L'opération de stock n'a pas pu être effectuée. Aucune modification n'a été enregistrée."
          );
        const errMsg: JarvisChatMessage = {
          id: `jarvis-err-${Date.now()}`,
          sender: 'jarvis',
          text: failText,
          timestamp: new Date().toISOString(),
          isError: true,
        };
        setMessages((prev) => [...prev, errMsg]);
        speakResponse(failText, appLanguage === 'fr' ? 'fr' : 'en');
      } finally {
        setIsConfirmingAction(false);
      }
    },
    [
      isConfirmingAction,
      stopSpeaking,
      getCurrentUserContext,
      getCurrentSnapshot,
      syncConfirmedActionWithClientContext,
      speechLang,
      appLanguage,
      tr,
      speakResponse,
    ]
  );

  const handleCancelPendingAction = useCallback(() => {
    if (!activePendingAction) return;
    setActivePendingAction(null);
    const cancelText = tr(
      'Cancelled. The proposed stock operation was discarded and no inventory records were modified.',
      "Annulé. L'opération proposée a été abandonnée et aucune donnée d'inventaire n'a été modifiée."
    );
    setMessages((prev) => [
      ...prev,
      {
        id: `jarvis-cancel-${Date.now()}`,
        sender: 'jarvis',
        text: cancelText,
        timestamp: new Date().toISOString(),
      },
    ]);
    speakResponse(cancelText, appLanguage === 'fr' ? 'fr' : 'en');
  }, [activePendingAction, tr, speakResponse, appLanguage]);

  /**
   * Send a user voice or text message to JARVIS
   */
  const sendJarvisMessage = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || assistantState === 'PROCESSING') return;

      stopSpeaking();
      setSpeechError(null);
      setInputText('');
      setLiveTranscript('');

      const userMsg: JarvisChatMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: trimmed,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setAssistantState('PROCESSING');

      try {
        const historyPayload = messages.slice(-8).map((m) => ({
          role: m.sender === 'user' ? 'user' : 'model',
          text: m.text,
        }));

        const preferredLang: 'en' | 'fr' | 'ar' =
          speechLang !== 'auto'
            ? speechLang
            : appLanguage === 'fr'
            ? 'fr'
            : 'en';

        const response = await fetch('/api/jarvis/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            conversationHistory: historyPayload,
            userContext: getCurrentUserContext(),
            inventorySnapshot: getCurrentSnapshot(),
            localHour: new Date().getHours(),
            preferredLanguage: preferredLang,
            pendingAction: activePendingAction,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'JARVIS failed to process the request.');
        }

        if (data.actionExecuted && activePendingAction) {
          executedClientActionIdsRef.current.add(activePendingAction.actionId);
          await syncConfirmedActionWithClientContext(
            activePendingAction,
            data.updatedSnapshot
          );
          setActivePendingAction(null);
        } else if (data.actionCancelled) {
          setActivePendingAction(null);
        } else if (data.pendingAction) {
          setActivePendingAction(data.pendingAction);
        }

        const detectedLang: 'en' | 'fr' | 'ar' =
          data.detectedLanguage || preferredLang;

        const jarvisMsg: JarvisChatMessage = {
          id: `jarvis-${Date.now()}`,
          sender: 'jarvis',
          text: data.reply,
          timestamp: new Date().toISOString(),
          language: detectedLang,
          cards: data.cards || [],
          pendingAction: data.pendingAction || null,
          executedTools: data.executedTools || [],
          isSystemConfirmation: Boolean(data.actionExecuted),
        };

        setMessages((prev) => [...prev, jarvisMsg]);
        speakResponse(data.reply, detectedLang);
      } catch (err: any) {
        setAssistantState('ERROR');
        const errMsgText =
          err?.message ||
          tr(
            'Unable to reach the JARVIS laboratory service. Please check your connection and try again.',
            'Impossible de joindre le service JARVIS du laboratoire. Veuillez vérifier votre connexion.'
          );
        setMessages((prev) => [
          ...prev,
          {
            id: `jarvis-err-${Date.now()}`,
            sender: 'jarvis',
            text: errMsgText,
            timestamp: new Date().toISOString(),
            isError: true,
          },
        ]);
      }
    },
    [
      assistantState,
      stopSpeaking,
      messages,
      speechLang,
      appLanguage,
      getCurrentUserContext,
      getCurrentSnapshot,
      activePendingAction,
      syncConfirmedActionWithClientContext,
      speakResponse,
      tr,
    ]
  );

  /**
   * Toggle Microphone Recording (Web Speech API)
   */
  const toggleMicrophone = useCallback(() => {
    setSpeechError(null);

    if (assistantState === 'LISTENING' && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      setAssistantState('IDLE');
      return;
    }

    stopSpeaking();

    const SpeechRecognitionCtor =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionCtor) {
      setSpeechSupported(false);
      setAssistantState('ERROR');
      setSpeechError(
        tr(
          'Browser Speech API is unavailable in this browser. Use Chrome, Edge, or Safari for voice input, or enter your query via text below.',
          "L'API vocale du navigateur n'est pas disponible. Utilisez Chrome, Edge ou Safari pour la voix, ou saisissez votre commande par texte ci-dessous."
        )
      );
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognitionRef.current = recognition;

      const recogLocale =
        speechLang === 'fr'
          ? 'fr-FR'
          : speechLang === 'ar'
          ? 'ar-SA'
          : speechLang === 'en'
          ? 'en-US'
          : appLanguage === 'fr'
          ? 'fr-FR'
          : 'en-US';

      recognition.lang = recogLocale;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let finalCaptured = '';

      recognition.onstart = () => {
        setLiveTranscript('');
        setAssistantState('LISTENING');
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalCaptured += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }
        setLiveTranscript((finalCaptured || interim).trim());
      };

      recognition.onerror = (event: any) => {
        const code = event?.error || 'unknown';
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setAssistantState('ERROR');
          setSpeechError(
            tr(
              'Microphone permission was denied. Please grant microphone access in your browser site settings or use the text input below.',
              "L'autorisation du microphone a été refusée. Veuillez autoriser l'accès au microphone dans les paramètres du navigateur ou utiliser la saisie texte."
            )
          );
        } else if (code === 'no-speech') {
          setAssistantState('IDLE');
          setSpeechError(
            tr(
              'No speech was detected. Click the microphone button when you are ready to speak.',
              'Aucune parole détectée. Cliquez sur le bouton microphone lorsque vous êtes prêt à parler.'
            )
          );
        } else if (code !== 'aborted') {
          setAssistantState('ERROR');
          setSpeechError(
            tr(
              `Speech recognition error (${code}). You can continue using text input below.`,
              `Erreur de reconnaissance vocale (${code}). Vous pouvez continuer via la saisie texte ci-dessous.`
            )
          );
        } else {
          setAssistantState('IDLE');
        }
      };

      recognition.onend = () => {
        const spoken = finalCaptured.trim();
        recognitionRef.current = null;
        if (spoken) {
          sendJarvisMessage(spoken);
        } else {
          setAssistantState((prev) => (prev === 'LISTENING' ? 'IDLE' : prev));
        }
      };

      recognition.start();
    } catch (err: any) {
      setAssistantState('ERROR');
      setSpeechError(
        err?.message ||
          tr(
            'Could not start microphone recording.',
            'Impossible de démarrer le microphone.'
          )
      );
    }
  }, [
    assistantState,
    stopSpeaking,
    tr,
    speechLang,
    appLanguage,
    sendJarvisMessage,
  ]);

  /**
   * Clear conversation history and reset without repeating the initial login greeting
   */
  const handleClearConversation = () => {
    stopSpeaking();
    setActivePendingAction(null);
    setLiveTranscript('');
    setSpeechError(null);
    setAssistantState('IDLE');

    const shortResetPrompt =
      appLanguage === 'fr'
        ? `Historique effacé${profile?.fullName ? `, ${profile.fullName}` : ''}. Quel réactif ou opération souhaitez-vous vérifier ?`
        : `Conversation cleared${profile?.fullName ? `, ${profile.fullName}` : ''}. What chemical or stock operation can I assist you with?`;

    setMessages([
      {
        id: `jarvis-reset-${Date.now()}`,
        sender: 'jarvis',
        text: shortResetPrompt,
        timestamp: new Date().toISOString(),
        language: appLanguage === 'fr' ? 'fr' : 'en',
      },
    ]);
  };

  const quickPrompts =
    appLanguage === 'fr'
      ? [
          'Quels réactifs sont disponibles dans CAB 1 ?',
          'Où est stocké l’acétate de sodium ?',
          'Montre-moi les amines dans CAB 3',
          'Quels réactifs sont sur CAB 4- Level 1- Left side ?',
          'Montre-moi les réactifs en stock faible',
          'J’ai utilisé 5 grammes de chlorure de sodium',
        ]
      : [
          'Show me the reagents available in CAB 1',
          'Where is the Sodium Acetate stored?',
          'Show me the amines in CAB 3',
          'What reagents are in CAB 4- Level 1- Left side?',
          'Show me the chemicals that are running low',
          'I used 5 grams of Sodium chloride',
        ];

  if (!profile) return null;

  return (
    <>
      {/* PHASE 2: ONCE-PER-LOGIN SESSION PERSONALIZED GREETING HUD TOAST */}
      {!isOpen && sessionToastText && (
        <div className="print:hidden fixed bottom-20 lg:bottom-20 right-4 sm:right-6 z-40 max-w-sm bg-[#050B14]/95 text-cyan-50 border border-cyan-500/40 rounded-md p-3.5 shadow-[0_0_25px_rgba(34,211,238,0.18)] backdrop-blur-md">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="font-mono text-[11px] font-bold tracking-wider text-cyan-300 uppercase">
                J.A.R.V.I.S. · {tr('Session Online', 'Session Active')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSessionToastText(null)}
              aria-label="Dismiss greeting"
              className="text-slate-400 hover:text-cyan-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-200 leading-relaxed">
            {sessionToastText}
          </p>
          <div className="mt-2.5 pt-2 border-t border-cyan-500/20 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                speakResponse(
                  sessionToastText,
                  appLanguage === 'fr' ? 'fr' : 'en'
                );
              }}
              className="inline-flex items-center gap-1 font-mono text-[10px] text-cyan-300 hover:text-cyan-200 cursor-pointer"
            >
              <Volume2 className="w-3 h-3" />
              <span>{tr('Speak Greeting', 'Écouter l’accueil')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetOpen(true)}
              className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-cyan-300 hover:text-white cursor-pointer"
            >
              <span>{tr('Open HUD', 'Ouvrir l’interface')}</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* FLOATING STARK-INSPIRED HUD LAUNCHER (Bottom-Right) */}
      <div className="print:hidden fixed bottom-16 lg:bottom-6 right-4 sm:right-6 z-40 flex items-center gap-2">
        {!isOpen && (
          <button
            type="button"
            onClick={() => handleSetOpen(true)}
            className="group relative flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-md bg-[#050B14] text-cyan-50 border border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.2)] hover:border-cyan-400 hover:bg-[#081221] transition-all cursor-pointer"
            title={tr(
              'Open JARVIS Laboratory HUD',
              'Ouvrir l’assistant vocal de laboratoire JARVIS'
            )}
          >
            <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 border border-cyan-400/70">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-30" />
              <Mic className="w-3.5 h-3.5 text-cyan-300" />
            </span>
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold tracking-wider text-cyan-100">
                  J.A.R.V.I.S.
                </span>
                <span className="font-mono text-[10px] text-cyan-400">
                  · HUD
                </span>
              </div>
              <div className="text-[10px] text-cyan-300/70 hidden sm:block">
                {tr('Voice Inventory Assistant', 'Assistant Vocal Inventaire')}
              </div>
            </div>
          </button>
        )}
      </div>

      {/* PHASE 3: STARK INDUSTRIES LABORATORY HUD PANEL (#050B14 Navy + Cyan/Icy-Blue + Amber Warnings) */}
      {isOpen && (
        <div className="print:hidden fixed inset-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[460px] sm:h-[700px] sm:max-h-[calc(100vh-2.5rem)] z-50 flex flex-col bg-[#050B14] text-slate-100 sm:rounded-md border border-cyan-500/40 shadow-[0_0_35px_rgba(6,182,212,0.22)] overflow-hidden">
          {/* TOP HUD BAR: Operator Identity & Voice Controls */}
          <div className="px-4 py-2.5 bg-[#081220]/95 border-b border-cyan-500/30 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  assistantState === 'ERROR'
                    ? 'bg-amber-400 animate-ping'
                    : assistantState === 'LISTENING'
                    ? 'bg-cyan-300 animate-ping'
                    : assistantState === 'PROCESSING'
                    ? 'bg-amber-300 animate-pulse'
                    : assistantState === 'SPEAKING'
                    ? 'bg-cyan-400 animate-pulse'
                    : 'bg-cyan-400'
                }`}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-mono text-xs font-bold tracking-wider text-cyan-100">
                  <span>J.A.R.V.I.S.</span>
                  <span aria-hidden="true" className="text-cyan-500/60">
                    ·
                  </span>
                  <span
                    className={`text-[10px] uppercase ${
                      assistantState === 'ERROR'
                        ? 'text-amber-400'
                        : assistantState === 'PROCESSING'
                        ? 'text-amber-300'
                        : 'text-cyan-300'
                    }`}
                  >
                    {assistantState === 'LISTENING'
                      ? tr('Listening', 'Écoute')
                      : assistantState === 'PROCESSING'
                      ? tr('Processing', 'Analyse')
                      : assistantState === 'SPEAKING'
                      ? tr('Speaking', 'Parle')
                      : assistantState === 'ERROR'
                      ? tr('Alert', 'Alerte')
                      : tr('Idle', 'Prêt')}
                  </span>
                </div>
                <div className="text-[11px] text-cyan-200/70 truncate font-mono">
                  {profile.fullName} · {formatRoleLabel(profile.role, appLanguage)}
                </div>
              </div>
            </div>

            {/* Right Controls: Language, Neural Voice, Stop Speaking, Mute, Clear History, Close */}
            <div className="flex items-center gap-1 shrink-0">
              <div className="relative flex items-center bg-[#0A192F] border border-cyan-500/30 rounded-xs px-1.5 py-1 text-[10px] font-mono text-cyan-100">
                <Globe className="w-3 h-3 text-cyan-400 mr-1" />
                <select
                  value={speechLang}
                  onChange={(e) =>
                    setSpeechLang(e.target.value as JarvisSpeechLang)
                  }
                  aria-label="Speech Language"
                  className="bg-transparent text-cyan-100 focus:outline-none cursor-pointer"
                >
                  <option value="auto" className="bg-[#050B14]">
                    AUTO
                  </option>
                  <option value="en" className="bg-[#050B14]">
                    EN
                  </option>
                  <option value="fr" className="bg-[#050B14]">
                    FR
                  </option>
                  <option value="ar" className="bg-[#050B14]">
                    AR
                  </option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setUseNeuralVoice((v) => !v)}
                title={tr(
                  'Toggle Neural Voice Synthesis',
                  'Activer/Désactiver la synthèse vocale neurale'
                )}
                className={`p-1.5 rounded-xs border text-[10px] font-mono transition-colors cursor-pointer ${
                  useNeuralVoice
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                    : 'bg-[#0A192F]/80 border-cyan-500/25 text-slate-400 hover:text-cyan-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>

              {assistantState === 'SPEAKING' && (
                <button
                  type="button"
                  onClick={stopSpeaking}
                  title={tr('Stop speaking', 'Arrêter la voix')}
                  className="p-1.5 rounded-xs bg-amber-500/20 border border-amber-400/60 text-amber-300 hover:bg-amber-500/30 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!isMuted) stopSpeaking();
                  setIsMuted((prev) => !prev);
                }}
                title={
                  isMuted
                    ? tr('Unmute voice', 'Réactiver la voix')
                    : tr('Mute voice', 'Couper la voix')
                }
                className={`p-1.5 rounded-xs border transition-colors cursor-pointer ${
                  isMuted
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                    : 'bg-[#0A192F]/80 border-cyan-500/25 text-cyan-200 hover:border-cyan-400/60'
                }`}
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={handleClearConversation}
                title={tr('Clear conversation', 'Effacer la conversation')}
                className="p-1.5 rounded-xs bg-[#0A192F]/80 border border-cyan-500/25 text-cyan-200 hover:border-cyan-400/60 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  stopSpeaking();
                  handleSetOpen(false);
                }}
                aria-label="Close JARVIS"
                className="p-1.5 rounded-xs bg-[#0A192F]/80 border border-cyan-500/25 text-cyan-200 hover:border-cyan-400/60 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* CENTRAL CIRCULAR WAVEFORM / REACTIVE VOICE INDICATOR (Stark HUD Core) */}
          <div className="px-4 py-3 bg-[#07101E]/90 border-b border-cyan-500/25 flex items-center gap-3.5 shrink-0">
            <button
              type="button"
              onClick={toggleMicrophone}
              disabled={assistantState === 'PROCESSING'}
              title={
                assistantState === 'LISTENING'
                  ? tr('Stop listening', 'Arrêter l’écoute')
                  : tr('Click to speak to JARVIS', 'Cliquer pour parler à JARVIS')
              }
              className="relative w-14 h-14 rounded-full flex items-center justify-center shrink-0 cursor-pointer group focus:outline-none"
            >
              {/* Outer concentric HUD ring */}
              <span
                className={`absolute inset-0 rounded-full border transition-all duration-300 ${
                  assistantState === 'LISTENING'
                    ? 'border-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.65)] scale-105 animate-pulse'
                    : assistantState === 'SPEAKING'
                    ? 'border-cyan-400 shadow-[0_0_18px_rgba(56,189,248,0.55)] scale-105'
                    : assistantState === 'PROCESSING'
                    ? 'border-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.45)] animate-spin'
                    : assistantState === 'ERROR'
                    ? 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                    : 'border-cyan-500/40 group-hover:border-cyan-400'
                }`}
              />
              {/* Inner rotating segmented ring */}
              <span
                className={`absolute inset-1.5 rounded-full border border-dashed transition-all duration-500 ${
                  assistantState === 'LISTENING' || assistantState === 'SPEAKING'
                    ? 'border-cyan-300/80 animate-spin'
                    : assistantState === 'PROCESSING'
                    ? 'border-amber-300/80 animate-spin'
                    : assistantState === 'ERROR'
                    ? 'border-amber-400/70'
                    : 'border-cyan-500/30'
                }`}
              />
              {/* Core reactor center */}
              <div
                className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center border ${
                  assistantState === 'LISTENING'
                    ? 'bg-cyan-500/30 border-cyan-300 text-cyan-100'
                    : assistantState === 'SPEAKING'
                    ? 'bg-sky-500/30 border-sky-300 text-sky-100'
                    : assistantState === 'PROCESSING'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : assistantState === 'ERROR'
                    ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                    : 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                }`}
              >
                {assistantState === 'PROCESSING' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : assistantState === 'LISTENING' ? (
                  <Mic className="w-4 h-4 animate-pulse" />
                ) : (
                  <Cpu className="w-4 h-4" />
                )}
              </div>
            </button>

            {/* Live Speech Transcript & Reactive Waveform Bars */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-400">
                  {assistantState === 'LISTENING'
                    ? tr('Voice Input Active', 'Acquisition Vocale Active')
                    : assistantState === 'SPEAKING'
                    ? tr('Audio Transmission', 'Transmission Audio')
                    : assistantState === 'PROCESSING'
                    ? tr('Querying Inventory Database', 'Analyse Base de Données')
                    : assistantState === 'ERROR'
                    ? tr('Attention Required', 'Attention Requise')
                    : tr('Laboratory Voice Interface', 'Interface Vocale Laboratoire')}
                </span>

                {/* Animated Reactive Bars */}
                <div className="flex items-end gap-0.5 h-3 shrink-0">
                  <span
                    className={`w-0.5 rounded-full transition-all ${
                      assistantState === 'LISTENING' ||
                      assistantState === 'SPEAKING'
                        ? 'bg-cyan-300 h-3 animate-pulse'
                        : 'bg-cyan-500/30 h-1'
                    }`}
                  />
                  <span
                    className={`w-0.5 rounded-full transition-all ${
                      assistantState === 'LISTENING' ||
                      assistantState === 'SPEAKING'
                        ? 'bg-cyan-400 h-2 animate-bounce'
                        : 'bg-cyan-500/30 h-1.5'
                    }`}
                  />
                  <span
                    className={`w-0.5 rounded-full transition-all ${
                      assistantState === 'LISTENING' ||
                      assistantState === 'SPEAKING'
                        ? 'bg-sky-300 h-3.5 animate-pulse'
                        : 'bg-cyan-500/30 h-1'
                    }`}
                  />
                  <span
                    className={`w-0.5 rounded-full transition-all ${
                      assistantState === 'LISTENING' ||
                      assistantState === 'SPEAKING'
                        ? 'bg-cyan-300 h-2.5 animate-bounce'
                        : 'bg-cyan-500/30 h-1.5'
                    }`}
                  />
                </div>
              </div>

              <div className="mt-1 font-mono text-xs text-cyan-50 truncate">
                {assistantState === 'LISTENING'
                  ? liveTranscript ||
                    tr(
                      'Listening... speak your chemical query or command',
                      'Écoute en cours... dictez votre recherche ou commande'
                    )
                  : liveTranscript
                  ? `"${liveTranscript}"`
                  : tr(
                      'Click the core reactor or microphone below to speak',
                      'Cliquez sur le réacteur central ou le micro pour parler'
                    )}
              </div>
            </div>
          </div>

          {/* CONVERSATION LOG & COMPACT CHEMICAL INFORMATION CARDS */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    isUser ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-0.5 font-mono text-[10px] text-cyan-300/70">
                    <span>{isUser ? profile.fullName : 'J.A.R.V.I.S.'}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div
                    dir={msg.language === 'ar' ? 'rtl' : 'ltr'}
                    className={`max-w-[92%] rounded-sm px-3.5 py-2.5 text-xs leading-relaxed border ${
                      isUser
                        ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-50'
                        : msg.isError
                        ? 'bg-amber-950/50 border-amber-500/60 text-amber-100'
                        : msg.isSystemConfirmation
                        ? 'bg-cyan-950/60 border-cyan-400/60 text-cyan-100'
                        : 'bg-[#091526]/90 border-cyan-500/25 text-slate-100'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>

                    {!isUser && !isMuted && (
                      <div className="mt-2 pt-1.5 border-t border-cyan-500/20 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            speakResponse(
                              msg.text,
                              msg.language ||
                                (appLanguage === 'fr' ? 'fr' : 'en')
                            )
                          }
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-300/80 hover:text-cyan-200 transition-colors cursor-pointer"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>{tr('Replay audio', 'Réécouter')}</span>
                        </button>
                        {msg.executedTools && msg.executedTools.length > 0 && (
                          <span className="font-mono text-[9px] text-cyan-400/60">
                            {msg.executedTools.join(' · ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* COMPACT CHEMICAL INFORMATION CARDS */}
                  {msg.cards && msg.cards.length > 0 && (
                    <div className="w-full mt-2 space-y-2">
                      {msg.cards.map((card) => {
                        const isLow =
                          card.status === ContainerStatus.LOW_STOCK ||
                          card.status === ContainerStatus.NEARLY_EMPTY;
                        return (
                          <div
                            key={card.containerId}
                            className={`p-2.5 rounded-sm bg-[#081322]/95 border transition-colors text-xs ${
                              isLow
                                ? 'border-amber-500/50 hover:border-amber-400'
                                : 'border-cyan-500/30 hover:border-cyan-400/70'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-cyan-50 truncate">
                                    {card.chemicalName}
                                  </span>
                                  <span className="font-mono text-[10px] text-cyan-300">
                                    · {card.containerId}
                                  </span>
                                </div>
                                <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                                  {card.formula} · CAS {card.casNumber} ·{' '}
                                  {card.chemicalClassification}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div
                                  className={`font-mono font-bold text-xs tabular-nums ${
                                    isLow ? 'text-amber-400' : 'text-cyan-300'
                                  }`}
                                >
                                  {card.currentQuantity} / {card.initialQuantity}{' '}
                                  {card.unit}
                                </div>
                                <div
                                  className={`font-mono text-[10px] ${
                                    isLow
                                      ? 'text-amber-300/90'
                                      : 'text-cyan-200/70'
                                  }`}
                                >
                                  {card.status}
                                </div>
                              </div>
                            </div>

                            <div className="mt-2 pt-1.5 border-t border-cyan-500/20 flex items-center justify-between gap-2 text-[11px]">
                              <div className="flex items-center gap-1 text-slate-300 truncate font-mono text-[10px]">
                                <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                                <span className="truncate">
                                  {card.locationSummary}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  onSelectContainer(card.containerId);
                                }}
                                className="inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold text-cyan-300 hover:text-cyan-100 shrink-0 cursor-pointer"
                              >
                                <span>{tr('Inspect', 'Inspecter')}</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ACTIVE 2-STEP STOCK OPERATION CONFIRMATION CARD (Amber Warning Highlight) */}
            {activePendingAction && (
              <div className="p-3.5 rounded-sm bg-amber-950/40 border border-amber-400/70 text-amber-100 space-y-3 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-amber-300 font-bold">
                      {tr(
                        'Confirmation Required · Stock Mutation',
                        'Confirmation Requise · Opération de Stock'
                      )}
                    </div>
                    <div className="text-xs font-semibold text-white">
                      {activePendingAction.summaryText}
                    </div>
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      {activePendingAction.readBackPrompt}
                    </p>
                  </div>
                </div>

                <div className="p-2 rounded-xs bg-[#050B14]/90 border border-amber-500/30 font-mono text-[11px] space-y-1 text-slate-300">
                  <div>
                    <span className="text-slate-500">Action ID:</span>{' '}
                    {activePendingAction.actionId}
                  </div>
                  <div>
                    <span className="text-slate-500">Chemical:</span>{' '}
                    {activePendingAction.payload.chemicalName}
                  </div>
                  {activePendingAction.payload.amount !== undefined && (
                    <div>
                      <span className="text-slate-500">Quantity:</span>{' '}
                      {activePendingAction.payload.amount}{' '}
                      {activePendingAction.payload.unit}
                    </div>
                  )}
                  {activePendingAction.payload.locationCode && (
                    <div>
                      <span className="text-slate-500">Location:</span>{' '}
                      {activePendingAction.payload.locationCode}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isConfirmingAction}
                    onClick={() =>
                      handleConfirmPendingAction(activePendingAction)
                    }
                    className="flex-1 py-2 px-3 rounded-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isConfirmingAction ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {tr(
                        'Confirm & Execute',
                        'Confirmer et Exécuter'
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isConfirmingAction}
                    onClick={handleCancelPendingAction}
                    className="py-2 px-3 rounded-xs bg-[#0A192F] border border-cyan-500/30 hover:border-cyan-400 text-slate-200 font-medium text-xs cursor-pointer"
                  >
                    {tr('Cancel', 'Annuler')}
                  </button>
                </div>

                <div className="text-[10px] text-amber-300/80 text-center font-mono">
                  {tr(
                    'Say "Yes" to confirm or "Cancel" to abort.',
                    'Dites « Oui » pour confirmer ou « Annuler » pour abandonner.'
                  )}
                </div>
              </div>
            )}

            {/* Speech / Microphone Error Banner (Amber Highlight) */}
            {speechError && (
              <div className="p-2.5 rounded-sm bg-amber-950/60 border border-amber-500/60 text-amber-200 text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">{speechError}</div>
                <button
                  type="button"
                  onClick={() => {
                    setSpeechError(null);
                    setAssistantState('IDLE');
                  }}
                  className="text-amber-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Quick Voice/Text Query Prompts */}
            {messages.length <= 2 && !activePendingAction && (
              <div className="pt-2 space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-wider text-cyan-400/80">
                  {tr('Suggested Queries:', 'Commandes Suggérées :')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => sendJarvisMessage(prompt)}
                      className="text-left text-[11px] px-2.5 py-1.5 rounded-xs bg-[#091526] border border-cyan-500/30 text-cyan-100 hover:border-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer"
                    >
                      “{prompt}”
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* BOTTOM HUD COMMAND INPUT BAR */}
          <div className="p-3 bg-[#081220] border-t border-cyan-500/30 space-y-2 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendJarvisMessage(inputText);
              }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={toggleMicrophone}
                disabled={assistantState === 'PROCESSING'}
                title={
                  assistantState === 'LISTENING'
                    ? tr('Stop listening', 'Arrêter l’écoute')
                    : tr('Start voice input', 'Activer le microphone')
                }
                className={`relative p-2.5 rounded-xs border transition-all shrink-0 cursor-pointer ${
                  assistantState === 'LISTENING'
                    ? 'bg-cyan-500/30 border-cyan-300 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.5)] animate-pulse'
                    : !speechSupported
                    ? 'bg-[#0A192F] border-slate-700 text-slate-500'
                    : 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/25 hover:border-cyan-400'
                }`}
              >
                {assistantState === 'LISTENING' ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={assistantState === 'PROCESSING'}
                placeholder={
                  assistantState === 'LISTENING'
                    ? tr('Listening to microphone...', 'Écoute du microphone...')
                    : tr(
                        'Speak or type an inventory query or command...',
                        'Parlez ou saisissez une requête d’inventaire...'
                      )
                }
                className="flex-1 bg-[#050B14] border border-cyan-500/35 rounded-xs px-3 py-2 text-xs text-cyan-50 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || assistantState === 'PROCESSING'}
                aria-label="Send message to JARVIS"
                className="p-2.5 rounded-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white transition-colors shrink-0 cursor-pointer"
              >
                {assistantState === 'PROCESSING' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>

            <div className="flex items-center justify-between text-[10px] font-mono text-cyan-300/60 px-0.5">
              <span className="flex items-center gap-1">
                <FlaskConical className="w-3 h-3 text-cyan-400" />
                <span>
                  {containers.length}{' '}
                  {tr('live containers indexed', 'contenants indexés')}
                </span>
              </span>
              <span>
                {tr(
                  '2-Step Voice Confirmation Active',
                  'Confirmation vocale 2 étapes active'
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
