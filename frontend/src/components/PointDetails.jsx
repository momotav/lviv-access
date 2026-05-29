import React, { useState, useEffect, useCallback } from 'react';
import { CATEGORIES, CategoryIcon } from '../lib/categories.jsx';
import { api } from '../lib/api.js';

function StarRow({ value, max = 5, size = 14 }) {
  return (
    <span className="star-row" style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={i < value ? '' : 'empty'}
          style={{ fontSize: size, lineHeight: 1 }}
        >★</span>
      ))}
    </span>
  );
}

function formatDate(s) {
  try {
    const d = new Date(s);
    return d.toLocaleDateString('uk-UA', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return s;
  }
}

export default function PointDetails({
  point,
  currentUser,
  onClose,
  onDeleted,
  onRequestLogin,
}) {
  const [reviews, setReviews] = useState([]);
  const [myReviewId, setMyReviewId] = useState(null);
  const [loadingReviews, setLoadingReviews] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [formRating, setFormRating] = useState(0);
  const [formComment, setFormComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [lightboxIdx, setLightboxIdx] = useState(null);

  const loadReviews = useCallback(async () => {
    setLoadingReviews(true);
    try {
      const data = await api.listReviews(point.id);
      setReviews(data.reviews);
      setMyReviewId(data.my_review_id);
      if (data.my_review_id) {
        const mine = data.reviews.find((r) => r.id === data.my_review_id);
        if (mine) {
          setFormRating(mine.rating);
          setFormComment(mine.comment || '');
        }
      } else {
        setFormRating(0);
        setFormComment('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReviews(false);
    }
  }, [point.id]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  async function submitReview() {
    if (!currentUser) {
      onRequestLogin();
      return;
    }
    if (formRating < 1 || formRating > 5) {
      setError('Поставте оцінку');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createOrUpdateReview(point.id, {
        rating: formRating,
        comment: formComment.trim() || null,
      });
      setShowForm(false);
      await loadReviews();
    } catch (err) {
      setError(err.message || 'Не вдалося зберегти відгук');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteMyReview() {
    if (!confirm('Видалити ваш відгук?')) return;
    try {
      await api.deleteReview(point.id, myReviewId);
      setShowForm(false);
      setFormRating(0);
      setFormComment('');
      await loadReviews();
    } catch (err) {
      alert('Не вдалося видалити: ' + err.message);
    }
  }

  async function handleDeletePoint() {
    if (!confirm('Видалити цю точку? Цю дію неможливо скасувати.')) return;
    try {
      await api.deletePoint(point.id);
      onDeleted(point.id);
    } catch (err) {
      alert(err.message);
    }
  }

  const canDeletePoint =
    currentUser && point.created_by_web_user === currentUser.id;

  const ratingDisplay = point.accessibility_rating
    ? Number(point.accessibility_rating).toFixed(1).replace(/\.0$/, '')
    : null;

  function pluralReviews(n) {
    if (n === 1) return '1 відгук';
    if (n >= 2 && n <= 4) return `${n} відгуки`;
    return `${n} відгуків`;
  }

  return (
    <div className="details-panel">
      <button className="details-close" onClick={onClose} aria-label="Закрити">✕</button>

      <div className="details-header">
        <div className="details-eyebrow">
          <CategoryIcon category={point.category} size={14} />
          <span>{CATEGORIES[point.category]?.label || point.category}</span>
        </div>
        <h2 className="details-title">{point.name}</h2>
        {ratingDisplay && (
          <div className="details-rating">
            <StarRow value={Math.round(point.accessibility_rating)} size={16} />
            <span className="details-rating-num">{ratingDisplay}</span>
            {point.review_count > 0 && (
              <span className="details-rating-count">· {pluralReviews(point.review_count)}</span>
            )}
          </div>
        )}
      </div>

      <div className="details-body">
        {point.description && (
          <div className="details-section">
            <p className="details-description">{point.description}</p>
          </div>
        )}

        {point.photo_urls && point.photo_urls.length > 0 && (
          <div className="details-section">
            <div className="details-section-label">Фото</div>
            <div className="photo-strip">
              {point.photo_urls.map((url, i) => (
                <button
                  key={url}
                  className="photo-strip-item"
                  onClick={() => setLightboxIdx(i)}
                >
                  <img src={url} alt={`Фото ${i + 1}`} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="details-section">
          <div className="details-section-label">Відгуки</div>

          {loadingReviews ? (
            <div className="details-loading">Завантаження…</div>
          ) : reviews.length === 0 ? (
            <div className="details-empty">Поки що немає відгуків. Будьте першим.</div>
          ) : (
            <div className="reviews-list">
              {reviews.map((r) => (
                <div key={r.id} className="review-item">
                  <div className="review-header">
                    <span className="review-author">{r.user_name}</span>
                    <span className="review-date">{formatDate(r.updated_at)}</span>
                  </div>
                  <StarRow value={r.rating} size={13} />
                  {r.comment && <p className="review-comment">{r.comment}</p>}
                </div>
              ))}
            </div>
          )}

          {!showForm && (
            <button
              className="btn-link"
              onClick={() => {
                if (!currentUser) { onRequestLogin(); return; }
                setShowForm(true);
              }}
            >
              {myReviewId ? 'Редагувати ваш відгук' : '+ Залишити відгук'}
            </button>
          )}

          {showForm && (
            <div className="review-form">
              {error && <div className="error-msg">{error}</div>}
              <label className="field-label">Ваша оцінка</label>
              <div className="rating-stars" style={{ marginBottom: 10 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="rating-star"
                    data-filled={n <= formRating}
                    onClick={() => setFormRating(n)}
                  >★</button>
                ))}
              </div>
              <label className="field-label">Коментар (необов'язково)</label>
              <textarea
                className="field-textarea"
                value={formComment}
                onChange={(e) => setFormComment(e.target.value)}
                placeholder="Опишіть свій досвід щодо доступності цього місця."
                maxLength={2000}
              />
              <div className="review-form-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => { setShowForm(false); setError(null); }}
                  disabled={submitting}
                >Скасувати</button>
                {myReviewId && (
                  <button
                    className="btn btn-ghost"
                    onClick={deleteMyReview}
                    disabled={submitting}
                    style={{ color: 'var(--danger)' }}
                  >Видалити</button>
                )}
                <button
                  className="btn btn-primary"
                  onClick={submitReview}
                  disabled={submitting || formRating < 1}
                >
                  {submitting ? 'Зберігаю…' : (myReviewId ? 'Оновити' : 'Опублікувати')}
                </button>
              </div>
            </div>
          )}
        </div>

        {canDeletePoint && (
          <div className="details-section">
            <button
              className="btn-link"
              style={{ color: 'var(--danger)' }}
              onClick={handleDeletePoint}
            >Видалити цю точку</button>
          </div>
        )}
      </div>

      {lightboxIdx !== null && (
        <div className="lightbox" onClick={() => setLightboxIdx(null)}>
          <button
            className="lightbox-close"
            onClick={(e) => { e.stopPropagation(); setLightboxIdx(null); }}
            aria-label="Закрити"
          >✕</button>
          <img
            src={point.photo_urls[lightboxIdx]}
            alt=""
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
