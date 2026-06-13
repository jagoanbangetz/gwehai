import { useState, useRef, useCallback } from 'react'

/**
 * Voice recognition hook — manages Web Speech API for voice-to-text input.
 * Returns state + controls for the voice input UI in the Composer.
 */
export function useVoiceRecognition(
  setInput: (val: string) => void,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
) {
  const [isVoiceRecording, setIsVoiceRecording] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const voiceRecognitionRef = useRef<any | null>(null)

  const startVoiceRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setVoiceTranscript(transcript)
    }

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error)
      if (event.error !== 'aborted') {
        setIsVoiceRecording(false)
      }
    }

    recognition.onend = () => {
      // Don't set isVoiceRecording to false here — user controls via buttons
    }

    voiceRecognitionRef.current = recognition
    recognition.start()
    setIsVoiceRecording(true)
    setVoiceTranscript('')
  }, [])

  const stopVoiceRecognition = useCallback(() => {
    if (voiceRecognitionRef.current) {
      voiceRecognitionRef.current.stop()
      voiceRecognitionRef.current = null
    }
    setIsVoiceRecording(false)
  }, [])

  const cancelVoiceInput = useCallback(() => {
    stopVoiceRecognition()
    setVoiceTranscript('')
  }, [stopVoiceRecognition])

  const confirmVoiceInput = useCallback(() => {
    if (voiceTranscript.trim()) {
      setInput(voiceTranscript.trim())
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    stopVoiceRecognition()
    setVoiceTranscript('')
  }, [voiceTranscript, setInput, inputRef, stopVoiceRecognition])

  return {
    isVoiceRecording,
    voiceTranscript,
    startVoiceRecognition,
    stopVoiceRecognition,
    cancelVoiceInput,
    confirmVoiceInput,
  }
}
