import { useState } from 'react';
import { useKeywords } from '../../hooks/useKeywords';
import api from '../../services/api';
import KeywordTag from './KeywordTag';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import styles from './KeywordManager.module.css';

const CATEGORIES = ['general', 'technology', 'business', 'marketing', 'product'];

export default function KeywordManager() {
  const { keywords, loading, error, addKeyword, updateKeyword, deleteKeyword } = useKeywords();
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('general');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!term.trim()) {
      setAddError('Keyword term is required');
      return;
    }
    setAddError('');
    setAdding(true);
    try {
      await addKeyword(term.trim(), category);
      setTerm('');
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (keyword) => {
    try {
      await updateKeyword(keyword.id, {
        term: keyword.term,
        category: keyword.category,
        is_active: !keyword.is_active,
      });
    } catch {
      /* handled in hook */
    }
  };

  const handleDelete = async (keyword) => {
    if (!window.confirm(`Delete keyword "${keyword.term}"?`)) return;
    try {
      await deleteKeyword(keyword.id);
    } catch {
      /* handled in hook */
    }
  };

  const handleScrape = async () => {
    setScraping(true);
    setScrapeMsg('');
    try {
      const result = await api.post('/leads/scrape');
      setScrapeMsg(result.message || 'Scraping started successfully!');
    } catch (err) {
      setScrapeMsg(`Error: ${err.message}`);
    } finally {
      setScraping(false);
    }
  };

  const grouped = {};
  keywords.forEach((kw) => {
    const cat = kw.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(kw);
  });

  return (
    <div className={styles.page}>
      <div className={styles.titleRow}>
        <h1 className={styles.pageTitle}>Keywords</h1>
        <Button onClick={handleScrape} loading={scraping} variant="success">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Start Scraping
        </Button>
      </div>

      {scrapeMsg && (
        <div className={`${styles.scrapeMsg} ${scrapeMsg.startsWith('Error') ? styles.scrapeMsgError : ''}`}>
          {scrapeMsg}
        </div>
      )}

      <form onSubmit={handleAdd} className={styles.addForm}>
        <div className={styles.formField}>
          <input
            type="text"
            placeholder="Enter keyword..."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className={styles.input}
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={styles.select}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <Button type="submit" loading={adding}>
          Add Keyword
        </Button>
      </form>

      {addError && <div className={styles.addError}>{addError}</div>}
      {error && <div className={styles.addError}>{error}</div>}

      {loading && <Spinner size="lg" />}

      {!loading && keywords.length === 0 && (
        <div className={styles.empty}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
            <line x1="4" y1="9" x2="20" y2="9" />
            <line x1="4" y1="15" x2="20" y2="15" />
            <line x1="10" y1="3" x2="8" y2="21" />
            <line x1="16" y1="3" x2="14" y2="21" />
          </svg>
          <p>No keywords yet. Add some keywords to start discovering leads.</p>
        </div>
      )}

      {!loading && Object.keys(grouped).length > 0 && (
        <div className={styles.groups}>
          {Object.entries(grouped).map(([cat, kws]) => (
            <div key={cat} className={styles.group}>
              <h3 className={styles.groupTitle}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
                <span className={styles.count}>{kws.length}</span>
              </h3>
              <div className={styles.tags}>
                {kws.map((kw) => (
                  <KeywordTag
                    key={kw.id}
                    keyword={kw}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
