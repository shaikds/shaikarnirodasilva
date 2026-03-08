'use client';
import { useState, useRef, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function formatMessage(content: string) {
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*<\/li>)/, '<ul class="list-disc list-inside space-y-1 my-2">$1</ul>')
    .replace(/\n\n/g, '</p><p class="mt-3">')
    .replace(/\n/g, '<br/>');
}

export default function ChatPage() {
  const { t } = useI18n();
  const c = t.chat;

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: t.lang === 'he'
        ? `שלום! אני **Harvest**, עוזר שוק החקלאות המקומי שלך.\n\nאני יכול לעזור לך:\n- **לחפש** תוצרת טרייה מחקלאים מקומיים\n- **למצוא שכנים** מאותה עיר/שכונה לקנות ביחד\n- **לבצע הזמנות** ישירות דרך הצ'אט\n- **לעקוב** אחרי סטטוס ההזמנות שלך\n\nמה תרצה לעשות היום?`
        : `Hello, I'm **Harvest**, your local farm marketplace assistant.\n\nI can help you:\n- **Find** fresh produce from local farmers\n- **Find neighbors** in your city or neighborhood to buy together\n- **Place orders** directly through chat\n- **Track** your order status\n\nWhat would you like to do today?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiMessages, setApiMessages] = useState<{ role: string; content: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(text?: string) {
    const messageText = text || input.trim();
    if (!messageText || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: messageText }]);
    setLoading(true);

    const newApiMessages = [...apiMessages, { role: 'user', content: messageText }];
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newApiMessages }),
      });
      if (!res.ok) throw new Error('Chat request failed');
      const data = await res.json();
      const reply = data.content || 'Sorry, I had trouble responding.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      setApiMessages([...newApiMessages, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t.lang === 'he'
          ? 'נתקלתי בשגיאה. בדוק שה-ANTHROPIC_API_KEY מוגדר ונסה שוב.'
          : 'I encountered an error. Please check that your ANTHROPIC_API_KEY is configured and try again.',
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-gradient-to-br from-harvest-500 to-harvest-700 rounded-2xl flex items-center justify-center shadow-lg shrink-0">
          <span className="text-white font-bold text-sm">AI</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{c.title}</h1>
          <p className="text-sm text-gray-500">{c.subtitle}</p>
        </div>
      </div>

      {/* Capabilities */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {c.capabilities.map((cap) => (
          <div key={cap} className="bg-white border border-gray-100 rounded-xl px-3 py-2 text-sm text-gray-600">
            {cap}
          </div>
        ))}
      </div>

      {/* Chat Window */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col h-[520px]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 bg-gradient-to-br from-harvest-500 to-harvest-700 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 me-3 mt-0.5">
                  H
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-harvest-600 text-white rounded-se-sm'
                    : 'bg-gray-100 text-gray-800 rounded-ss-sm'
                }`}
                dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
              />
              {msg.role === 'user' && (
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shrink-0 ms-3 mt-0.5">
                  U
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="w-8 h-8 bg-gradient-to-br from-harvest-500 to-harvest-700 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 me-3 mt-0.5">
                H
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-ss-sm px-4 py-3">
                <p className="text-xs text-gray-400 mb-1">{c.typing}</p>
                <div className="flex gap-1.5 items-center h-4">
                  {[0, 150, 300].map(delay => (
                    <div key={delay} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 p-4">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={c.placeholder}
              className="input flex-1"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="btn-primary px-4 sm:px-5 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={c.send}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Prompts */}
      <div className="mt-5">
        <p className="text-xs text-gray-500 mb-3 font-medium">{c.quickLabel}</p>
        <div className="flex flex-wrap gap-2">
          {c.quickPrompts.map(prompt => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              disabled={loading}
              className="text-sm bg-white hover:bg-harvest-50 text-gray-700 hover:text-harvest-700 border border-gray-200 hover:border-harvest-300 px-4 py-2 rounded-full transition-all disabled:opacity-40"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
        <strong>{t.lang === 'he' ? 'נדרשת הגדרה:' : 'Setup required:'}</strong>{' '}
        {t.lang === 'he'
          ? 'הוסף את ANTHROPIC_API_KEY לקובץ .env.local להפעלת הצ\'אט.'
          : 'Add your Anthropic API key as ANTHROPIC_API_KEY in a .env.local file.'}
      </div>
    </div>
  );
}
