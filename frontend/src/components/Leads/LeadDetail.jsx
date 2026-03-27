import { useState, useEffect } from 'react';
import api from '../../services/api';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import styles from './LeadDetail.module.css';

function getScoreVariant(score) {
  if (score >= 70) return 'green';
  if (score >= 40) return 'orange';
  return 'red';
}

function getPlatformVariant(platform) {
  const p = (platform || '').toLowerCase();
  if (p === 'reddit') return 'orange';
  if (p === 'web') return 'blue';
  return 'default';
}

export default function LeadDetail({ lead, isOpen, onClose, onUpdate }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [fullLead, setFullLead] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lead && isOpen) {
      setNotes(lead.notes || '');
      setLoading(true);
      api.get(`/leads/${lead.id}`)
        .then((data) => setFullLead(data))
        .catch(() => setFullLead(lead))
        .finally(() => setLoading(false));
    }
  }, [lead, isOpen]);

  if (!lead) return null;

  const displayLead = fullLead || lead;
  const keywords = displayLead.matched_keywords || displayLead.keywords || [];

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await onUpdate(lead.id, { notes });
    } catch {
      /* handled upstream */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Lead Details" size="lg">
      {loading ? (
        <Spinner />
      ) : (
        <div className={styles.detail}>
          <div className={styles.meta}>
            <Badge variant={getPlatformVariant(displayLead.platform)} size="md">
              {displayLead.platform || 'N/A'}
            </Badge>
            <Badge variant={getScoreVariant(displayLead.score || 0)} size="md">
              Score: {displayLead.score || 0}
            </Badge>
            <span className={styles.status}>{displayLead.status || 'new'}</span>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Author</h3>
            <p className={styles.author}>
              {displayLead.url ? (
                <a href={displayLead.url} target="_blank" rel="noopener noreferrer">
                  {displayLead.author || 'Unknown'}
                </a>
              ) : (
                displayLead.author || 'Unknown'
              )}
            </p>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Content</h3>
            <div className={styles.content}>
              {displayLead.content || displayLead.snippet || 'No content available.'}
            </div>
          </div>

          {keywords.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Matched Keywords</h3>
              <div className={styles.keywords}>
                {keywords.map((kw, i) => (
                  <span key={i} className={styles.keyword}>
                    {typeof kw === 'string' ? kw : kw.term || kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {displayLead.created_at && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Discovered</h3>
              <p className={styles.text}>
                {new Date(displayLead.created_at).toLocaleString()}
              </p>
            </div>
          )}

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Notes</h3>
            <textarea
              className={styles.notesInput}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add your notes about this lead..."
              rows={4}
            />
            <Button
              size="sm"
              onClick={handleSaveNotes}
              loading={saving}
              className={styles.saveBtn}
            >
              Save Notes
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
