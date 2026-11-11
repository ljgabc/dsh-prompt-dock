/**
 * Browser half of the @local/prompt-library bundle.
 *
 * Registers one compact entry in the `conversation.input.right` slot: a
 * button beside the send action that opens a preset-prompt picker. Picking a
 * prompt only fills the composer draft through the standard `inputActions`
 * face (setDraft on an empty draft, insertText at the caret otherwise) — it
 * never submits. The picker also creates, edits, deletes, and arranges
 * prompts (a sort mode with move-to-top/up/down/bottom controls) through
 * the Host half's authenticated Fetch route, so every client of this Host
 * sees the same library.
 *
 * The popup reuses the shipped menu recipe — the same building blocks as
 * the composer's model selector: `MenuSurface` from the web shell's static
 * primitives provides the translucent material, radius, elevation shadow
 * and the macOS backing plate; `useAnchoredPosition` provides native
 * placement (rAF tracking, viewport clamping, `--dsh-anchored-*` sizing);
 * `useDismissOnOutsidePointer` provides the native outside-dismiss. The
 * local CSS only layers content layout on top, using `--dsw-*` theme
 * tokens and `dshpl-` class names.
 */
window.__ModuleLoader__.load({
  id: '@local/prompt-library',
  factory(require) {
    const React = require('react')
    const { createElement: h, useState, useEffect, useRef, useCallback, Fragment } = React
    const { createPortal } = require('react-dom')
    const {
      MenuSurface,
      useAnchoredPosition,
      useDismissOnOutsidePointer,
      Button,
      IconPlusOutlineRegular,
      IconEditOutlineRegular,
      IconTrashOutlineRegular,
      IconChevronsUpDownOutlineRegular,
      IconChevronUpOutlineRegular,
      IconChevronDownOutlineRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives')

    const NS = 'prompt-library'
    /** Document-relative route (the Host serves it under `/api`); matches the shipped file-upload route convention. */
    const API_PATH = 'api/prompt-library/prompts'
    const MAX_TITLE = 100
    const MAX_TEXT = 20000
    /** Unplaced panel: hidden but laid out at a fixed origin so the anchoring hook's measure pass sees real sizes. */
    const MEASURE_STYLE = { visibility: 'hidden', left: '0px', top: '0px' }

    const zh = {
      'button.label': '提示词',
      'picker.title': '预置提示词',
      'picker.new': '新建',
      'picker.edit': '编辑',
      'picker.delete': '删除',
      'picker.loading': '加载中…',
      'picker.empty': '还没有预置提示词',
      'picker.emptyHint': '新建一条；输入框为空时点选即可快速填入，发送前还能微调',
      'picker.retry': '重试',
      'sort.toggle': '排序',
      'sort.done': '完成',
      'sort.toTop': '移到最前',
      'sort.up': '上移',
      'sort.down': '下移',
      'sort.toBottom': '移到最后',
      'notice.fillFailed': '当前无法填入输入框，请稍后再试',
      'form.creating': '新建提示词',
      'form.editing': '编辑提示词',
      'form.titlePlaceholder': '标题（用于快速识别）',
      'form.textPlaceholder': '提示词内容',
      'form.save': '保存',
      'form.cancel': '取消',
    }
    const en = {
      'button.label': 'Prompts',
      'picker.title': 'Preset prompts',
      'picker.new': 'New',
      'picker.edit': 'Edit',
      'picker.delete': 'Delete',
      'picker.loading': 'Loading…',
      'picker.empty': 'No preset prompts yet',
      'picker.emptyHint': 'Create one; pick it while the composer is empty to fill it fast, then adjust before sending',
      'picker.retry': 'Retry',
      'sort.toggle': 'Sort',
      'sort.done': 'Done',
      'sort.toTop': 'Move to top',
      'sort.up': 'Move up',
      'sort.down': 'Move down',
      'sort.toBottom': 'Move to bottom',
      'notice.fillFailed': 'Cannot fill the composer right now; try again in a moment',
      'form.creating': 'New prompt',
      'form.editing': 'Edit prompt',
      'form.titlePlaceholder': 'Title (for quick recognition)',
      'form.textPlaceholder': 'Prompt text',
      'form.save': 'Save',
      'form.cancel': 'Cancel',
    }

    /** Module-shared state wired by apply(); components read translations through it. */
    const shared = { t: key => zh[key] ?? key }

    // ---------------------------------------------------------------- icons

    function BookmarkIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M4.75 2.75h6.5a1 1 0 0 1 1 1v9.4c0 .8-.9 1.3-1.6.8L8 11.4l-2.65 2.55c-.7.5-1.6 0-1.6-.8v-9.4a1 1 0 0 1 1-1z',
          stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linejoin': 'round',
        }))
    }

    /** Drawn to blend with the shell's outline icon set (stroke 1, round caps). */
    function ToTopIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3 3h10', stroke: 'currentColor', 'stroke-width': 1, 'stroke-linecap': 'round' }),
        h('path', { d: 'M8 13V5.5M5.5 8L8 5.5 10.5 8', stroke: 'currentColor', 'stroke-width': 1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))
    }

    function ToBottomIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3 13h10', stroke: 'currentColor', 'stroke-width': 1, 'stroke-linecap': 'round' }),
        h('path', { d: 'M8 3v7.5M5.5 8L8 10.5 10.5 8', stroke: 'currentColor', 'stroke-width': 1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))
    }

    // ------------------------------------------------------------------ api

    async function api(method, body) {
      const init = { method }
      if (body !== undefined) {
        init.headers = { 'content-type': 'application/json' }
        init.body = JSON.stringify(body)
      }
      const response = await fetch(API_PATH, init)
      let data = null
      try {
        data = await response.json()
      } catch {
        // Non-JSON error body; fall through to the status code.
      }
      if (!response.ok || (data !== null && data.ok === false)) {
        const detail = data !== null && typeof data.error === 'string' && data.error.length > 0
          ? data.error
          : `HTTP ${response.status}`
        throw new Error(detail)
      }
      return data
    }

    // ------------------------------------------------------------ components

    /**
     * The slot entry: one compact icon button (metrics copied from the shipped
     * composer "+" control) plus the portaled picker while open.
     */
    function Entry(props) {
      const [open, setOpen] = useState(false)
      const buttonRef = useRef(null)
      const close = useCallback(() => {
        setOpen(false)
        if (buttonRef.current !== null) buttonRef.current.focus()
      }, [])

      const inputActions = props.inputActions
      const useInput = props.useInput
      // The provide channel hands every session-scope slot component the same
      // stable hook identity, so this condition cannot flip across renders of
      // one mounted entry.
      const input = useInput !== undefined ? useInput(s => s) : undefined

      if (inputActions === undefined) return null

      return h(Fragment, null,
        h('style', null, CSS),
        h('button', {
          type: 'button',
          ref: buttonRef,
          className: 'dshpl-button',
          'aria-label': shared.t('button.label'),
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          title: shared.t('button.label'),
          onClick: () => { setOpen(value => !value) },
        }, h(BookmarkIcon)),
        open
          ? h(Picker, { anchor: buttonRef, onClose: close, input, inputActions })
          : null,
      )
    }

    /** The portaled picker: list + inline management form on the native menu surface. */
    function Picker({ anchor, onClose, input, inputActions }) {
      const t = shared.t
      const [prompts, setPrompts] = useState(null)
      const [loadError, setLoadError] = useState(null)
      const [editing, setEditing] = useState(null)
      const [notice, setNotice] = useState(null)
      const [busy, setBusy] = useState(false)
      const [sorting, setSorting] = useState(false)
      const panelRef = useRef(null)

      const reload = useCallback(() => {
        setPrompts(null)
        setLoadError(null)
        api('GET')
          .then(data => { setPrompts(data.prompts) })
          .catch(error => { setLoadError(error instanceof Error ? error.message : 'error') })
      }, [])

      useEffect(() => { reload() }, [reload])

      // Focus the panel so keyboard users land inside it; Escape returns to the button.
      useEffect(() => { panelRef.current?.focus() }, [])

      // Native placement: opens above the trigger, right-aligned, clamped into
      // the viewport (visual viewport and frame clearance included).
      const menuPos = useAnchoredPosition({
        open: true,
        anchorRef: anchor,
        panelRef,
        side: 'top',
        align: 'end',
        gap: 8,
        margin: 12,
        layoutKey: `${editing === null ? 'list' : editing.mode}:${sorting ? 'sort' : 'pick'}`,
      })

      // Native dismissal: outside pointer press, the trigger itself excluded.
      useDismissOnOutsidePointer(panelRef, true, onClose, anchor)

      // Escape (consumed, like the host menus).
      useEffect(() => {
        const onKeyDown = event => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => { document.removeEventListener('keydown', onKeyDown, true) }
      }, [onClose])

      /** Fill the draft only: replace an empty draft, insert at the caret otherwise. Never submits. */
      const pick = prompt => {
        const actions = inputActions
        if (actions === undefined) return
        const draft = input !== undefined && typeof input.draft === 'string' ? input.draft : ''
        if (draft.trim() === '' && typeof actions.setDraft === 'function') {
          actions.setDraft(prompt.text)
          onClose()
          return
        }
        const span = typeof actions.captureInsertion === 'function' ? actions.captureInsertion() : undefined
        if (span !== undefined && typeof actions.insertText === 'function' && actions.insertText(prompt.text, span)) {
          onClose()
          return
        }
        setNotice(t('notice.fillFailed'))
      }

      const mutate = async body => {
        setBusy(true)
        setNotice(null)
        try {
          const data = await api('POST', body)
          setPrompts(data.prompts)
          return true
        } catch (error) {
          setNotice(error instanceof Error ? error.message : t('picker.retry'))
          return false
        } finally {
          setBusy(false)
        }
      }

      const startCreate = () => { setNotice(null); setEditing({ mode: 'create', title: '', text: '' }) }
      const startUpdate = prompt => {
        setNotice(null)
        setEditing({ mode: 'update', id: prompt.id, title: prompt.title, text: prompt.text })
      }
      const remove = prompt => { void mutate({ action: 'delete', id: prompt.id }) }
      const saveForm = async (title, text) => {
        const body = editing.mode === 'create'
          ? { action: 'create', title, text }
          : { action: 'update', id: editing.id, title, text }
        const ok = await mutate(body)
        if (ok) setEditing(null)
      }

      // Arranging is meaningful only with at least two prompts; sorting stays
      // a plain UI mode so the effective value falls back safely when another
      // client shrinks the library mid-sort.
      const canSort = prompts !== null && loadError === null && prompts.length >= 2
      const sortActive = sorting && canSort
      const toggleSorting = () => { setNotice(null); setSorting(value => !value) }

      /** Translate one move gesture into the next full id sequence and persist it. */
      const move = (id, to) => {
        if (busy || prompts === null) return
        const ids = prompts.map(item => item.id)
        const from = ids.indexOf(id)
        if (from === -1) return
        ids.splice(from, 1)
        const at = to === 'top' ? 0 : to === 'up' ? from - 1 : to === 'down' ? from + 1 : ids.length
        ids.splice(at, 0, id)
        void mutate({ action: 'reorder', ids })
      }

      const body = editing === null
        ? h('div', { className: 'dshpl-pick' },
            h('div', { className: 'dshpl-head' },
              h('span', { className: 'dshpl-headTitle' }, t('picker.title')),
              canSort ? h('button', {
                type: 'button',
                className: `dshpl-headBtn${sortActive ? ' dshpl-headBtnOn' : ''}`,
                'aria-pressed': sortActive ? 'true' : 'false',
                onClick: toggleSorting,
              }, h(IconChevronsUpDownOutlineRegular, { size: 14 }), sortActive ? t('sort.done') : t('sort.toggle')) : null,
              h('button', {
                type: 'button',
                className: 'dshpl-headBtn',
                onClick: startCreate,
              }, h(IconPlusOutlineRegular, { size: 14 }), t('picker.new')),
            ),
            h('div', { className: 'dshpl-list', role: sortActive ? 'list' : 'menu' },
              prompts === null
                ? h('div', { className: 'dshpl-status' }, t('picker.loading'))
                : loadError !== null
                  ? h('div', { className: 'dshpl-status' },
                      h('div', null, loadError),
                      h('button', {
                        type: 'button',
                        className: 'dshpl-retry',
                        onClick: reload,
                      }, t('picker.retry')),
                    )
                  : prompts.length === 0
                    ? h('div', { className: 'dshpl-empty' },
                        h('div', { className: 'dshpl-emptyTitle' }, t('picker.empty')),
                        h('div', { className: 'dshpl-emptyHint' }, t('picker.emptyHint')),
                      )
                    : prompts.map((prompt, index) => h(PromptRow, {
                        key: prompt.id,
                        prompt,
                        sorting: sortActive,
                        busy,
                        isFirst: index === 0,
                        isLast: index === prompts.length - 1,
                        onPick: pick,
                        onEdit: startUpdate,
                        onRemove: remove,
                        onMove: move,
                      })),
            ),
            notice !== null ? h('div', { className: 'dshpl-notice' }, notice) : null,
          )
        : h(PromptForm, {
            key: editing.mode === 'update' ? editing.id : 'create',
            initial: editing,
            busy,
            notice,
            onSave: saveForm,
            onCancel: () => { setNotice(null); setEditing(null) },
          })

      return createPortal(
        h(MenuSurface, {
          ref: panelRef,
          className: 'dshpl-menu',
          style: menuPos ?? MEASURE_STYLE,
          role: 'dialog',
          'aria-label': t('picker.title'),
          tabIndex: -1,
        }, body),
        document.body,
      )
    }

    /**
     * One prompt row. In pick mode the whole row picks the prompt, with
     * edit/delete trailing. In sort mode the row is a plain container whose
     * four move buttons carry the interaction; picking is disabled so
     * arranging cannot accidentally fill the composer.
     */
    function PromptRow({ prompt, sorting, busy, isFirst, isLast, onPick, onEdit, onRemove, onMove }) {
      const t = shared.t
      const preview = prompt.text.replace(/\s+/g, ' ')
      const main = h('div', { className: 'dshpl-rowMain' },
        h('div', { className: 'dshpl-rowTitle' }, prompt.title),
        h('div', { className: 'dshpl-rowText' }, preview),
      )
      if (sorting) {
        const moveBtn = (to, Icon, label, boundary) => h('button', {
          type: 'button',
          className: 'dshpl-iconBtn',
          title: label,
          'aria-label': `${label}: ${prompt.title}`,
          disabled: boundary || busy,
          onClick: () => { onMove(prompt.id, to) },
        }, h(Icon, { size: 14 }))
        return h('div', { className: 'dshpl-row dshpl-rowSorting', role: 'listitem' },
          main,
          moveBtn('top', ToTopIcon, t('sort.toTop'), isFirst),
          moveBtn('up', IconChevronUpOutlineRegular, t('sort.up'), isFirst),
          moveBtn('down', IconChevronDownOutlineRegular, t('sort.down'), isLast),
          moveBtn('bottom', ToBottomIcon, t('sort.toBottom'), isLast),
        )
      }
      return h('div', {
        className: 'dshpl-row',
        role: 'menuitem',
        tabIndex: 0,
        onClick: () => { onPick(prompt) },
        onKeyDown: event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onPick(prompt)
          }
        },
      },
        main,
        h('button', {
          type: 'button',
          className: 'dshpl-iconBtn',
          title: t('picker.edit'),
          'aria-label': `${t('picker.edit')}: ${prompt.title}`,
          onClick: event => { event.stopPropagation(); onEdit(prompt) },
        }, h(IconEditOutlineRegular, { size: 14 })),
        h('button', {
          type: 'button',
          className: 'dshpl-iconBtn',
          title: t('picker.delete'),
          'aria-label': `${t('picker.delete')}: ${prompt.title}`,
          onClick: event => { event.stopPropagation(); onRemove(prompt) },
        }, h(IconTrashOutlineRegular, { size: 14 })),
      )
    }

    /** Inline create/edit form. Local state survives a failed save (notice is passed in). */
    function PromptForm({ initial, busy, notice, onSave, onCancel }) {
      const t = shared.t
      const [title, setTitle] = useState(initial.title)
      const [text, setText] = useState(initial.text)
      const titleRef = useRef(null)
      useEffect(() => { titleRef.current?.focus() }, [])
      const blank = title.trim() === '' || text.trim() === ''
      return h('form', {
        className: 'dshpl-form',
        onSubmit: event => {
          event.preventDefault()
          if (!busy && !blank) onSave(title.trim(), text.trim())
        },
      },
        h('div', { className: 'dshpl-formTitle' },
          initial.mode === 'update' ? t('form.editing') : t('form.creating')),
        h('input', {
          ref: titleRef,
          className: 'dshpl-input',
          type: 'text',
          value: title,
          maxLength: MAX_TITLE,
          placeholder: t('form.titlePlaceholder'),
          'aria-label': t('form.titlePlaceholder'),
          onChange: event => { setTitle(event.target.value) },
        }),
        h('textarea', {
          className: 'dshpl-textarea',
          value: text,
          rows: 5,
          maxLength: MAX_TEXT,
          placeholder: t('form.textPlaceholder'),
          'aria-label': t('form.textPlaceholder'),
          onChange: event => { setText(event.target.value) },
        }),
        notice !== null ? h('div', { className: 'dshpl-notice' }, notice) : null,
        h('div', { className: 'dshpl-formActions' },
          h(Button, { variant: 'ghost', size: 'sm', onClick: onCancel }, t('form.cancel')),
          h(Button, { variant: 'primary', size: 'sm', type: 'submit', disabled: busy || blank }, t('form.save')),
        ),
      )
    }

    // ----------------------------------------------------------------- css

    const CSS = `
.dshpl-button{width:28px;height:28px;flex:none;place-items:center;display:grid;cursor:pointer;border:none;border-radius:999px;padding:0;background:0 0;color:var(--dsw-alias-label-primary)}
@media (hover:hover){.dshpl-button:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}}
.dshpl-menu{box-sizing:border-box;position:fixed;z-index:1100;display:flex;flex-direction:column;overflow:hidden;padding:4px;color:var(--dsw-alias-label-primary);width:min(360px,calc(100vw - 32px),var(--dsh-anchored-max-width,100vw));max-height:min(440px,calc(100vh - 96px),var(--dsh-anchored-max-height,100vh));--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dshpl-pick{display:flex;flex-direction:column;min-height:0;flex:1}
.dshpl-head{display:flex;align-items:center;gap:8px;padding:6px 8px 4px;flex:none}
.dshpl-headTitle{flex:1;min-width:0;font-size:11px;font-weight:500;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshpl-headBtn{flex:none;height:24px;padding:0 8px;display:inline-flex;align-items:center;gap:4px;border:none;border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;cursor:pointer}
@media (hover:hover){.dshpl-headBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.dshpl-headBtn:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.dshpl-headBtnOn,.dshpl-headBtnOn:hover{background:var(--dsw-alias-interactive-bg-active)}
.dshpl-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px;padding:2px 0}
.dshpl-row{display:flex;align-items:center;gap:6px;min-height:34px;padding:5px 7px;border-radius:var(--dsw-radius-md);cursor:pointer;color:var(--dsw-alias-label-primary)}
@media (hover:hover){.dshpl-row:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.dshpl-row:focus-visible{outline:none;background:var(--dsw-alias-interactive-bg-hover)}
.dshpl-rowSorting{cursor:default}
.dshpl-rowSorting:hover{background:none}
.dshpl-rowMain{flex:1;min-width:0}
.dshpl-rowTitle{font-size:13px;font-weight:500;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshpl-rowText{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.dshpl-iconBtn{width:24px;height:24px;flex:none;place-items:center;display:grid;cursor:pointer;border:none;border-radius:var(--dsw-radius-sm);padding:0;background:0 0;color:var(--dsw-alias-label-secondary)}
.dshpl-iconBtn:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
@media (hover:hover){.dshpl-iconBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}
.dshpl-iconBtn:disabled{opacity:.4;cursor:default}
.dshpl-status{flex:1;padding:12px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dshpl-retry{display:inline-block;margin-top:6px;padding:0;border:none;background:0 0;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;font-weight:600;cursor:pointer}
@media (hover:hover){.dshpl-retry:hover{text-decoration:underline}}
.dshpl-empty{flex:1;display:flex;flex-direction:column;gap:4px;padding:16px 10px}
.dshpl-emptyTitle{font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dshpl-emptyHint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dshpl-notice{flex:none;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);padding:6px 7px;font-size:11px;line-height:16px}
.dshpl-pick .dshpl-notice{margin:2px 2px 4px}
.dshpl-form{display:flex;flex-direction:column;gap:8px;padding:8px;min-height:0;flex:1;overflow-y:auto}
.dshpl-formTitle{font-size:11px;font-weight:500;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dshpl-input,.dshpl-textarea{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:5px 8px;font:inherit;font-size:13px;line-height:20px}
.dshpl-textarea{resize:vertical;min-height:96px}
@media (pointer:coarse){.dshpl-input,.dshpl-textarea{font-size:16px}}
.dshpl-input:focus,.dshpl-textarea:focus{outline:none;border-color:var(--dsw-alias-border-l4)}
.dshpl-formActions{display:flex;justify-content:flex-end;gap:8px;flex:none}
`

    // --------------------------------------------------------------- module

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (locale !== undefined) {
          ctx.effect(() => locale.register(NS, { zh, en }), 'prompt-library: dictionaries')
          shared.t = locale.bind(NS)
        }
        const slots = ctx.get('slots')
        if (slots === undefined) throw new Error('prompt-library requires the slots service')
        ctx.effect(() => slots.inject('conversation.input.right', () => slots.register(
          {
            name: 'conversation.input.right',
            id: 'prompt-library',
            order: 50,
            label: () => shared.t('button.label'),
          },
          Entry,
        )), 'prompt-library: composer entry')
      },
    }
  },
})
