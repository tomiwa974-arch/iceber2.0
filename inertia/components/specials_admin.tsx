import AsyncButton from '~/components/async_button'
import { useState, type FormEvent } from 'react'
import { ArrowUp, ArrowDown, Plus, Trash2, Clock3 } from 'lucide-react'
import { useRef } from 'react'
import {
  useRestaurant,
  createSpecial,
  deleteSpecial,
  moveSpecial,
  formatPrice,
} from '~/lib/restaurant_store'
import { activeSpecial, specialStatus, specialDate } from '~/lib/specials'
import { useSpecialsClock } from '~/lib/use_specials_clock'
import IcebergLogo from './iceberg_logo'
import MenuPhotoField from './menu_photo_field'

const emptyDraft = { title: '', caption: '', image: '', price: 0, durationDays: 1 }
export default function SpecialsAdmin() {
  const { menu, specials, loaded } = useRestaurant()
  const now = useSpecialsClock(specials)
  const live = activeSpecial(specials, now)
  const queued = specials.filter((post) => post.startsAt > now)
  const [draft, setDraft] = useState(emptyDraft)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const saving = useRef(false)
  const act = async (operation: () => Promise<unknown>, success: string) => {
    if (saving.current || !loaded) return false
    saving.current = true
    setBusy(true)
    try {
      await operation()
      setError('')
      setMessage(success)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this change.')
      setMessage('')
      return false
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (photoBusy) return
    if (
      await act(
        () => createSpecial({ ...draft, title: draft.title.trim() }),
        'Special saved. It will go live automatically at its scheduled time.'
      )
    ) {
      setDraft(emptyDraft)
      setSource('')
    }
  }
  const nextStart = Math.max(now, ...specials.map((post) => post.endsAt))
  return (
    <div>
      <div className="ad-special-summary">
        <div>
          <span className={live ? 'ad-badge green' : 'ad-badge neutral'}>
            {live ? 'LIVE NOW' : 'NO ACTIVE SPECIAL'}
          </span>
          <h2>{live?.title ?? 'Your next special starts here'}</h2>
          <p className="ad-muted">
            {live
              ? `Expires ${specialDate(live.endsAt)}`
              : 'Post a special to feature it on the rotating homepage plate.'}
          </p>
        </div>
        <div>
          <strong>{queued.length}</strong>
          <small>in the queue</small>
        </div>
      </div>
      <div className="ad-special-layout">
        <section className="ad-panel ad-settings">
          <h2>Create a daily special</h2>
          <p className="ad-muted">
            Live for one day by default. Every queued post gets its full duration.
          </p>
          <form onSubmit={submit}>
            <fieldset
              disabled={busy || !loaded}
              style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}
            >
              <div className="ad-form-grid">
                <label className="ad-wide">
                  <span>Start with a menu item (optional)</span>
                  <select
                    aria-label="Start with a menu item (optional)"
                    disabled={photoBusy}
                    value={source}
                    onChange={(e) => {
                      setSource(e.target.value)
                      const item = menu.find((entry) => entry.id === e.target.value)
                      if (item)
                        setDraft({
                          ...draft,
                          title: item.name,
                          caption: item.description,
                          image: item.image,
                          price: item.price,
                        })
                    }}
                  >
                    <option value="">Create a custom special</option>
                    {menu
                      .filter((item) => item.available)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="ad-wide">
                  <span>Special title</span>
                  <input
                    required
                    maxLength={120}
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder="Today's chef's special"
                  />
                </label>
                <label>
                  <span>Run for (days)</span>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={draft.durationDays}
                    onChange={(e) => setDraft({ ...draft, durationDays: e.target.valueAsNumber })}
                  />
                </label>
                <label>
                  <span>Special price (NGN)</span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: e.target.valueAsNumber })}
                  />
                </label>
                <MenuPhotoField
                  label="Special photo"
                  value={draft.image}
                  onChange={(image) => setDraft((current) => ({ ...current, image }))}
                  onBusyChange={setPhotoBusy}
                />
                <label className="ad-wide">
                  <span>Story caption</span>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={draft.caption}
                    onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
                    placeholder="What makes this dish special?"
                  />
                </label>
              </div>
              <div className="ad-special-timing">
                <Clock3 size={16} />
                <span>
                  {nextStart > now
                    ? `Joins the queue · Starts ${specialDate(nextStart)}`
                    : 'Publishes immediately'}
                  <small>Each day is 24 hours from its start time.</small>
                </span>
              </div>
              <AsyncButton
                pending={Boolean(busy || photoBusy)}
                type="submit"
                className="ad-primary"
                disabled={busy || photoBusy || !loaded}
              >
                <Plus size={17} />
                {busy ? 'Saving…' : nextStart > now ? 'Add to queue' : 'Publish special'}
              </AsyncButton>
            </fieldset>
          </form>
        </section>
        <section className="ad-panel">
          <div className="ad-panel-heading">
            <div>
              <h2>Your story queue</h2>
              <p className="ad-muted">Live, upcoming, and expired specials</p>
            </div>
          </div>
          {specials.length === 0 && (
            <div className="ad-empty">
              <Clock3 size={30} />
              <h3>A fresh special, every day</h3>
              <p>Create your first post, then queue up what comes next.</p>
            </div>
          )}
          <div className="ad-special-list">
            {[...specials]
              .sort((a, b) => {
                const rank = (post: typeof a) =>
                  specialStatus(post, now) === 'Live'
                    ? 0
                    : specialStatus(post, now) === 'Queued'
                      ? 1
                      : 2
                return rank(a) - rank(b) || a.startsAt - b.startsAt
              })
              .map((post) => {
                const status = specialStatus(post, now)
                const index = queued.findIndex((entry) => entry.id === post.id)
                return (
                  <article className="ad-special-post" key={post.id}>
                    <div className="ad-item-cell">
                      {post.image ? (
                        <img src={post.image} alt="" />
                      ) : (
                        <span className="ad-item-placeholder">
                          <IcebergLogo className="h-5 w-5" />
                        </span>
                      )}
                      <div>
                        <span
                          className={
                            status === 'Live'
                              ? 'ad-badge green'
                              : status === 'Queued'
                                ? 'ad-badge amber'
                                : 'ad-badge neutral'
                          }
                        >
                          {status}
                          {status === 'Queued' ? ` · #${index + 1}` : ''}
                        </span>
                        <h3>{post.title}</h3>
                        <small>
                          {formatPrice(post.price)} · {post.durationDays}{' '}
                          {post.durationDays === 1 ? 'day' : 'days'}
                        </small>
                      </div>
                    </div>
                    <p className="ad-muted">{post.caption}</p>
                    <div className="ad-special-dates">
                      <span>Starts {specialDate(post.startsAt)}</span>
                      <span>Ends {specialDate(post.endsAt)}</span>
                    </div>
                    <div className="ad-actions">
                      {status === 'Queued' && (
                        <>
                          <AsyncButton
                            pending={Boolean(busy)}
                            disabled={busy || index === 0}
                            aria-label={`Move ${post.title} earlier`}
                            onClick={() =>
                              act(() => moveSpecial(post.id, -1), 'Queue order updated.')
                            }
                          >
                            <ArrowUp size={15} />
                          </AsyncButton>
                          <AsyncButton
                            pending={Boolean(busy)}
                            disabled={busy || index === queued.length - 1}
                            aria-label={`Move ${post.title} later`}
                            onClick={() =>
                              act(() => moveSpecial(post.id, 1), 'Queue order updated.')
                            }
                          >
                            <ArrowDown size={15} />
                          </AsyncButton>
                        </>
                      )}
                      <AsyncButton
                        pending={Boolean(busy)}
                        className="ad-danger"
                        disabled={busy}
                        aria-label={`${status === 'Live' ? 'End' : 'Remove'} ${post.title}`}
                        onClick={() => setRemoving(post.id)}
                      >
                        <Trash2 size={15} />
                        {status === 'Live' ? 'End special' : 'Remove'}
                      </AsyncButton>
                    </div>
                    {removing === post.id && (
                      <div className="ad-special-remove" role="group" aria-label="Confirm removal">
                        <p>
                          {status === 'Live'
                            ? 'End this special now? The next queued post will start immediately.'
                            : status === 'Queued'
                              ? 'Remove this queued post? Later posts will move forward.'
                              : 'Remove this expired post?'}
                        </p>
                        <AsyncButton
                          pending={false}
                          className="ad-secondary"
                          disabled={busy}
                          onClick={() => setRemoving(null)}
                        >
                          Keep post
                        </AsyncButton>
                        <AsyncButton
                          pending={Boolean(busy)}
                          className="ad-delete"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await act(
                                () => deleteSpecial(post.id),
                                'Special removed. Schedule updated.'
                              )
                            )
                              setRemoving(null)
                          }}
                        >
                          Confirm removal
                        </AsyncButton>
                      </div>
                    )}
                  </article>
                )
              })}
          </div>
        </section>
      </div>
      {message && (
        <p role="status" className="ad-notice" style={{ marginTop: 20 }}>
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="ad-error" style={{ marginTop: 20 }}>
          {error}
        </p>
      )}
      <p className="ad-footnote">
        Schedules use West Africa Time (WAT) and are saved to the database. Queued specials go live
        automatically, even while the admin page is closed.
      </p>
    </div>
  )
}
