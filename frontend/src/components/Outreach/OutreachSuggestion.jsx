import { useState, useEffect } from 'react';
import api from '../../services/api';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import styles from './OutreachSuggestion.module.css';

export default function OutreachSuggestion({ lead, isOpen, onClose }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedIdx, setCopiedIdx] = useState(null);

  useEffect(() => {
    if (lead && isOpen) {
      setLoading(true);
      setError('');
      setSuggestions([]);
      api.get(`/outreach/suggest/${lead.id}`)
        .then((data) => {
          setSuggestions(data.suggestions || []);
        })
        .catch((err) => {
          setError(err.message || 'Failed to generate suggestions');
        })
        .finally(() => setLoading(false));
    }
  }, [lead, isOpen]);

  const handleCopy = async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      /* fallback for older browsers */
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    }
  };

  if (!lead) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Outreach Suggestions" size="lg">
      <div className={styles.container}>
        <div className={styles.leadInfo}>
          <span className={styles.label}>Lead:</span>
          <span className={styles.value}>{lead.author || 'Unknown'}</span>
          <span className={styles.platform}>{lead.platform || 'N/A'}</span>
        </div>

        {loading && <Spinner />}

        {error && (
          <div className={styles.error}>{error}</div>
        )}

        {!loading && !error && suggestions.length === 0 && (
          <div className={styles.empty}>No outreach suggestions available for this lead.</div>
        )}

        {suggestions.map((suggestion, idx) => (
          <div key={idx} className={styles.suggestion}>
            <div className={styles.suggestionHeader}>
              <span className={styles.suggestionTitle}>
                {suggestion.name || suggestion.title || `Suggestion ${idx + 1}`}
                {suggestion.subject && <span className={styles.subject}> - {suggestion.subject}</span>}
              </span>
              <button
                className={styles.copyBtn}
                onClick={() => handleCopy(suggestion.body || suggestion.content || suggestion.message || suggestion, idx)}
              >
                {copiedIdx === idx ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className={styles.suggestionContent}>
              {typeof suggestion === 'string' ? suggestion : suggestion.body || suggestion.content || suggestion.message || JSON.stringify(suggestion)}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
