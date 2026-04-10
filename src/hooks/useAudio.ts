import { useState, useRef } from 'react';
import { generateSpeech } from '../services/ai';

export function useAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lastRequestIdRef = useRef<number>(0);
  const [loadingAudioText, setLoadingAudioText] = useState<string | null>(null);

  const stopAllAudio = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch (e) {
        // Ignore
      }
      currentSourceRef.current = null;
    }
  };

  const speak = async (text: string) => {
    const requestId = ++lastRequestIdRef.current;
    setLoadingAudioText(text);

    // Stop everything immediately
    stopAllAudio();

    try {
      const base64Audio = await generateSpeech(text);

      // If a newer request has started, ignore this one
      if (requestId !== lastRequestIdRef.current) return;

      if (!base64Audio) {
        throw new Error('No audio data received');
      }

      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      let audioBuffer: AudioBuffer;

      // Try to decode as MP3 first (OpenAI format)
      try {
        audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
      } catch (e) {
        // Fallback to raw PCM (Gemini format)
        audioBuffer = audioContext.createBuffer(1, bytes.length / 2, 24000);
        const channelData = audioBuffer.getChannelData(0);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < channelData.length; i++) {
          channelData[i] = view.getInt16(i * 2, true) / 32768.0;
        }
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      // Double check before starting
      if (requestId !== lastRequestIdRef.current) {
        source.disconnect();
        return;
      }

      // Stop any other source that might have started in the microtask gap
      stopAllAudio();

      currentSourceRef.current = source;
      source.onended = () => {
        if (currentSourceRef.current === source) {
          currentSourceRef.current = null;
        }
        if (requestId === lastRequestIdRef.current) {
          setLoadingAudioText(null);
        }
      };

      source.start();
    } catch (error) {
      console.error('Speech generation failed:', error);
      if (requestId === lastRequestIdRef.current) {
        setLoadingAudioText(null);
        stopAllAudio();
        const utterance = new SpeechSynthesisUtterance(text);
        const hasChinese = /[\u4e00-\u9fa5]/.test(text);
        utterance.lang = hasChinese ? 'zh-CN' : 'en-US';
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  return { speak, stopAllAudio, loadingAudioText };
}
