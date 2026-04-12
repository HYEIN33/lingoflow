import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Language } from '../i18n';

interface UseSpeechRecognitionParams {
  uiLang: Language;
  activeTab: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  setGrammarInput: React.Dispatch<React.SetStateAction<string>>;
  stopAllAudio: () => void;
}

export function useSpeechRecognition({
  uiLang,
  activeTab,
  setInputText,
  setGrammarInput,
  stopAllAudio,
}: UseSpeechRecognitionParams) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleListening = async () => {
    console.log('toggleListening called, current state:', { isListening, activeTab });
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error(uiLang === 'zh' ? '此浏览器不支持语音识别' : 'Speech recognition is not supported in this browser.');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error(uiLang === 'zh' ? '您的浏览器不支持麦克风访问' : 'Your browser does not support microphone access.');
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      console.error('Microphone access denied:', err);
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        toast.error(uiLang === 'zh' ? '未找到麦克风设备，请检查您的设备连接' : 'No microphone found. Please check your device connection.');
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error(uiLang === 'zh' ? '请在浏览器设置中允许麦克风访问' : 'Please allow microphone access in your browser settings.');
      } else {
        toast.error(uiLang === 'zh' ? '无法访问麦克风：' + err.message : 'Could not access microphone: ' + err.message);
      }
      return;
    }

    stopAllAudio();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = uiLang === 'zh' ? 'zh-CN' : 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
    };
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        toast.error(uiLang === 'zh' ? '请允许麦克风访问' : 'Please allow microphone access.');
      } else if (event.error === 'network') {
        toast.error(uiLang === 'zh' ? '网络连接错误' : 'Network connection error.');
      }
      setIsListening(false);
    };

    recognition.onresult = async (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      if (activeTab === 'translate') {
        setInputText(prev => prev + (prev ? ' ' : '') + transcript);
      } else if (activeTab === 'grammar') {
        setGrammarInput(prev => prev + (prev ? ' ' : '') + transcript);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return { isListening, toggleListening };
}
