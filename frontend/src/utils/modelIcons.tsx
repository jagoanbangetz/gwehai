import React from 'react'

export const getModelIcon = (provider: string, name?: string): React.ReactNode => {
  const lowerName = name?.toLowerCase() || ''
  const lowerProvider = provider?.toLowerCase() || ''

  // OpenAI / ChatGPT / O-Series
  if (lowerProvider === 'openai' || lowerName.includes('gpt') || lowerName.includes('chatgpt') || lowerName.includes('o4') || lowerName.includes('o3')) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.2773-2.4702a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-3.9348 4.5355 4.4942 4.4942 0 0 1-.0187-.0047zM4.9807 2.94a4.4755 4.4755 0 0 1 2.3655 1.2968l-.1419.0804L3.4107 6.3978a.7948.7948 0 0 0-.3927.6813v6.7369l-2.02-1.1686a.071.071 0 0 1-.038-.052V7.4712a4.504 4.504 0 0 1 3.9348-4.5355 4.4942 4.4942 0 0 1 .0187.0047zm14.1582 3.7548a.7949.7949 0 0 0-.3926-.6814l-4.2773-2.47-.1419-.0804a4.4755 4.4755 0 0 1 .18-2.8449 4.504 4.504 0 0 1 3.9348-1.5044 4.4942 4.4942 0 0 1 .0187.0047 4.504 4.504 0 0 1 3.9348 4.5355v5.5825a.071.071 0 0 1-.038.052l-2.02 1.1686V7.4712a.7948.7948 0 0 0-.3927-.6813zm-2.3766 3.8553L16.7458 8.43v5.5826a.071.071 0 0 1-.038.052l-2.02 1.1685V7.4712a.7948.7948 0 0 0-.3926-.6813l-4.2773-2.47-.142-.0808a4.4755 4.4755 0 0 1 1.8212-2.3108 4.504 4.504 0 0 1 3.9348-1.5044 4.4942 4.4942 0 0 1 .0187.0047 4.504 4.504 0 0 1 3.9348 4.5355v5.5825a.071.071 0 0 1-.038.052zM2.9401 7.9206a4.4755 4.4755 0 0 1 1.8212-2.3108l.142.0808 4.2772 2.47a.7948.7948 0 0 0 .3927.6813v6.7369l2.02-1.1685a.071.071 0 0 1 .038-.052V8.43l-3.395-1.96v5.5826a.071.071 0 0 1-.038.052l-2.02 1.1686V7.4711a.7948.7948 0 0 0-.3926-.6813L3.4107 4.3197l-.1419-.0804z"/>
      </svg>
    )
  }

  // Anthropic / Claude
  if (lowerProvider === 'anthropic' || lowerName.includes('claude')) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
        <path d="M12 2v20" stroke="white" strokeWidth="1.5" fill="none"/>
        <circle cx="12" cy="12" r="3" fill="white"/>
      </svg>
    )
  }

  // Google / Gemini
  if (lowerProvider === 'google' || lowerName.includes('gemini')) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    )
  }

  // X.AI / Grok
  if (lowerProvider === 'x.ai' || lowerName.includes('grok')) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    )
  }

  // Default icon
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  )
}

export const isProModel = (name?: string): boolean => {
  const lowerName = name?.toLowerCase() || ''
  // Mark premium/reasoning models as Pro
  return lowerName.includes('pro') || 
         lowerName.includes('opus') || 
         lowerName.includes('gpt-5') ||
         lowerName.includes('grok 4') ||
         lowerName.includes('gemini 3 pro') ||
         lowerName.includes('o4-mini') ||
         lowerName.includes('o3') ||
         lowerName.includes('deepseek-r1') ||
         lowerName.includes('deepseek-reasoner')
}
