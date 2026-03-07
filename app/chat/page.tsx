'use client';
import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_PROMPTS = [
  "What fresh vegetables are available today?",
  "Show me the active group buys",
  "Find the best deals on citrus fruits",
  "I want to order 3kg of tomatoes",
  "Who are the local farmers here?",
  "How does group buying work?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hi! I'm **Harvest**, your local farm marketplace assistant. 🌱

I can help you:
- **Find** fresh produce from local farmers
- **Discover** group buying deals for discounts
- **Place orders** directly through our chat
- **Track** your order status

What would you like to do today?`,
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
    const userMsg: Message = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // Build API message history
    const newApiMessages = [
      ...apiMessages,
      { role: 'user', content: messageText },
    ];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newApiMessages }),
      });

      if (!res.ok) throw new Error('Chat request failed');
      const data = await res.json();

      const assistantMsg: Message = { role: 'assistant', content: data.content || 'Sorry, I had trouble responding.' };
      setMessages(prev => [...prev, assistantMsg]);
      setApiMessages([...newApiMessages, { role: 'assistant', content: data.content }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I encountered an error. Please check that your ANTHROPIC_API_KEY is configured and try again.',
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function formatMessage(content: string) {
    // Simple markdown-lite formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*<\/li>)/, '<ul class="list-disc list-inside space-y-1 my-2">$1</ul>')
      .replace(/\n\n/g, '</p><p class="mt-3">')
      .replace(/\n/g, '<br/>');
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-gradient-to-br from-harvest-500 to-harvest-700 rounded-2xl flex items-center justify-center text-2xl shadow-lg">
          🤖
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Harvest AI Assistant</h1>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-500">Powered by Claude · Always online</span>
          </div>
        </div>
      </div>

      {/* Capabilities */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { icon: '🔍', label: 'Search products' },
          { icon: '🤝', label: 'Join group buys' },
          { icon: '🛒', label: 'Place orders' },
          { icon: '📦', label: 'Track orders' },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-100 rounded-xl px-3 py-2 flex items-center gap-2 text-sm text-gray-600">
            <span>{c.icon}</span>
            <span>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Chat Window */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col h-[520px]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 bg-gradient-to-br from-harvest-500 to-harvest-700 rounded-full flex items-center justify-center text-sm flex-shrink-0 mr-3 mt-0.5">
                  🌱
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-harvest-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}
              >
                <div
                  dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                />
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm flex-shrink-0 ml-3 mt-0.5">
                  👤
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="w-8 h-8 bg-gradient-to-br from-harvest-500 to-harvest-700 rounded-full flex items-center justify-center text-sm flex-shrink-0 mr-3 mt-0.5">
                🌱
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1.5 items-center h-5">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
              placeholder="Ask anything about local produce, orders, deals..."
              className="input flex-1"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="btn-primary px-5 disabled:opacity-40 disabled:cursor-not-allowed"
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
        <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Try asking:</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
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

      {/* API key notice */}
      <div className="mt-6 p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
        <strong>Setup required:</strong> Add your Anthropic API key as <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> in a <code className="bg-amber-100 px-1 rounded">.env.local</code> file to enable the AI chat.
      </div>
    </div>
  );
}
