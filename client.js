/**
 * Browser half of the dsh-prompt-dock bundle.
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
 * The popup follows the shipped menu recipe — the composer's model selector:
 * a self-contained surface draws the translucent material (fill + backdrop
 * filter + radius + elevation shadow + the macOS backing plate) from public
 * `--dsw-*` theme tokens, so the bundle depends on no internal Harness
 * client package — only `react`/`react-dom` from the browser module table.
 * Placement uses CSS Anchor Positioning: the trigger carries a unique
 * `anchor-name`, the panel sets `position-anchor` and derives its insets
 * from `anchor()`, tracking the trigger and clamping into the layout
 * viewport without JavaScript. Outside-dismiss is a local port of the
 * shell's recipe (document pointerdown, trigger excluded). The local CSS
 * layers content layout on top with `--dsw-*` theme tokens and `dshpl-`
 * class names.
 */
window.__ModuleLoader__.load({
  id: 'dsh-prompt-dock',
  factory(require) {
    const React = require('react')
    const { createElement: h, useState, useEffect, useRef, useCallback, useId, Fragment } = React
    const { createPortal } = require('react-dom')

    const NS = 'prompt-dock'
    /** Document-relative route (the Host serves it under `/api`); matches the shipped file-upload route convention. */
    const API_PATH = 'api/prompt-dock/prompts'
    const MAX_TITLE = 100
    const MAX_TEXT = 20000

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
      'picker.import': '导入',
      'picker.export': '导出',
      'import.result': '导入 {n} 条',
      'import.skippedInvalid': '{n} 条无效',
      'import.skippedDuplicate': '{n} 条重复',
      'import.skippedOverLimit': '{n} 条超出上限',
      'import.badFormat': '无法读取：不是有效的提示词导出文件',
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
      'picker.import': 'Import',
      'picker.export': 'Export',
      'import.result': 'Imported {n}',
      'import.skippedInvalid': '{n} invalid',
      'import.skippedDuplicate': '{n} duplicates',
      'import.skippedOverLimit': '{n} over limit',
      'import.badFormat': 'Cannot read: not a valid prompt export file',
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

    // ------------------------------------------- self-contained UI primitives
    // Ports of the shell's recipes (icon paths, Button styling, the menu
    // surface material, outside-pointer dismissal), so the bundle imports no
    // internal Harness client package — only the documented react baseline.

    /** Icon paths copied from the shell's sprite (regular variant, stroke 1). */
    function IconPlus({ size = 16 }) {
      return h('svg', { viewBox: '0 0 16 16', width: size, height: size, fill: 'none', 'stroke-width': 1, 'aria-hidden': true },
        h('path', { d: 'M8 2V14', stroke: 'currentColor' }),
        h('path', { d: 'M2 8H14', stroke: 'currentColor' }))
    }

    function IconEdit({ size = 16 }) {
      return h('svg', { viewBox: '0 0 16 16', width: size, height: size, fill: 'none', 'stroke-width': 1, 'aria-hidden': true },
        h('path', {
          d: 'M8.85596 2.69971H4.19971C3.37141 2.69971 2.69992 3.37146 2.69971 4.19971V11.8003C2.69992 12.6285 3.37141 13.3003 4.19971 13.3003H11.8003C12.6283 13.2999 13.3001 12.6283 13.3003 11.8003V7.89893H14.3003V11.8003C14.3001 13.1806 13.1806 14.2999 11.8003 14.3003H4.19971C2.81913 14.3003 1.69992 13.1808 1.69971 11.8003V4.19971C1.69992 2.81918 2.81913 1.69971 4.19971 1.69971H8.85596V2.69971Z',
          fill: 'currentColor',
        }),
        h('path', { d: 'M7.7849 8.23878L13.888 2.13574', stroke: 'currentColor' }))
    }

    function IconTrash({ size = 16 }) {
      return h('svg', { viewBox: '0 0 16 16', width: size, height: size, fill: 'none', 'stroke-width': 1, 'aria-hidden': true },
        h('path', { d: 'M1.28149 3.88831H14.7187', stroke: 'currentColor' }),
        h('path', {
          d: 'M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833',
          stroke: 'currentColor',
        }),
        h('path', {
          d: 'M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831',
          stroke: 'currentColor',
        }),
        h('path', { d: 'M6.44946 6.98926V11.1238', stroke: 'currentColor' }),
        h('path', { d: 'M9.55054 6.98926V11.1238', stroke: 'currentColor' }))
    }

    function IconChevronsUpDown({ size = 16 }) {
      return h('svg', {
        viewBox: '0 0 16 16', width: size, height: size, fill: 'none', stroke: 'currentColor',
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': 1, 'aria-hidden': true,
      },
        h('path', { d: 'm5.1 6 2.9-2.9L10.9 6' }),
        h('path', { d: 'm5.1 10 2.9 2.9 2.9-2.9' }))
    }

    function IconChevronUp({ size = 14 }) {
      return h('svg', { viewBox: '0 0 16 16', width: size, height: size, fill: 'none', 'stroke-width': 1, 'aria-hidden': true },
        h('path', { d: 'M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10', stroke: 'currentColor' }))
    }

    function IconChevronDown({ size = 14 }) {
      return h('svg', { viewBox: '0 0 16 16', width: size, height: size, fill: 'none', 'stroke-width': 1, 'aria-hidden': true },
        h('path', { d: 'M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6', stroke: 'currentColor' }))
    }

    /** Button port: the shell's variant/size recipe on public theme tokens. */
    function Button({ variant = 'ghost', size = 'md', className, type = 'button', children, ...rest }) {
      const classes = ['dshpl-btn', variant === 'primary' ? 'dshpl-btnPrimary' : 'dshpl-btnGhost']
      if (size === 'sm') classes.push('dshpl-btnSm')
      if (className !== undefined && className !== '') classes.push(className)
      return h('button', { type, className: classes.join(' '), ...rest }, children)
    }

    /**
     * Outside-pointer dismissal, ported from the shell's recipe: a document
     * (bubble-phase) pointerdown outside both the panel and the excluded
     * trigger ref closes, with `false` passed to the setter like the shell's.
     */
    function useDismissOnOutsidePointer(ref, active, setOpen, excludeRef) {
      useEffect(() => {
        if (!active) return
        const onPointerDown = event => {
          if (event.target instanceof Node
            && ref.current?.contains(event.target) !== true
            && excludeRef?.current?.contains(event.target) !== true) {
            setOpen(false)
          }
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => { document.removeEventListener('pointerdown', onPointerDown) }
      }, [ref, active, setOpen, excludeRef])
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
      // Unique CSS anchor name for this mounted trigger, so several
      // composers (or a remount) never share one anchor.
      const anchorName = `--dshpl-${useId().replaceAll(':', '')}`
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
          style: { anchorName },
          'aria-label': shared.t('button.label'),
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          title: shared.t('button.label'),
          onClick: () => { setOpen(value => !value) },
        }, h(BookmarkIcon)),
        open
          ? h(Picker, { anchor: buttonRef, anchorName, onClose: close, input, inputActions })
          : null,
      )
    }

    /** The portaled picker: list + inline management form on the menu surface. */
    function Picker({ anchor, anchorName, onClose, input, inputActions }) {
      const t = shared.t
      const [prompts, setPrompts] = useState(null)
      const [loadError, setLoadError] = useState(null)
      const [editing, setEditing] = useState(null)
      const [notice, setNotice] = useState(null)
      const [busy, setBusy] = useState(false)
      const [sorting, setSorting] = useState(false)
      const panelRef = useRef(null)
      // The surface names itself so the macOS backing plate can anchor to it.
      const surfaceAnchor = `--dshpl-surface-${useId().replaceAll(':', '')}`

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

      // Outside-pointer dismissal (shell recipe), the trigger itself excluded.
      useDismissOnOutsidePointer(panelRef, true, onClose, anchor)

      // Escape (consumed, like the host menus). A keydown during IME
      // composition belongs to the editor: its Escape only cancels the
      // composition and must not close the picker (and lose the form).
      useEffect(() => {
        const onKeyDown = event => {
          if (event.isComposing) return
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

      /** Download the whole library as a portable JSON backup (client-side only; ids stay internal). */
      const exportLibrary = () => {
        if (prompts === null) return
        const payload = {
          format: 'dsh-prompt-dock/v1',
          exportedAt: new Date().toISOString(),
          prompts: prompts.map(({ title, text, order, updatedAt }) => ({ title, text, order, updatedAt })),
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `dsh-prompt-dock-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }

      /** Send file rows to the Host import action, which validates, dedupes and caps; report its counts. */
      const importFile = async file => {
        setNotice(null)
        if (file.size > 4 * 1024 * 1024) {
          setNotice(t('import.badFormat'))
          return
        }
        let rows
        try {
          const parsed = JSON.parse(await file.text())
          rows = Array.isArray(parsed) ? parsed : parsed?.prompts
        } catch {
          rows = undefined
        }
        if (!Array.isArray(rows)) {
          setNotice(t('import.badFormat'))
          return
        }
        setBusy(true)
        try {
          const data = await api('POST', { action: 'import', prompts: rows })
          setPrompts(data.prompts)
          const parts = [t('import.result').replace('{n}', String(data.imported))]
          const skips = [
            ['import.skippedInvalid', data.skippedInvalid],
            ['import.skippedDuplicate', data.skippedDuplicate],
            ['import.skippedOverLimit', data.skippedOverLimit],
          ]
          for (const [key, count] of skips) {
            if (count > 0) parts.push(t(key).replace('{n}', String(count)))
          }
          setNotice(parts.join(' · '))
        } catch (error) {
          setNotice(error instanceof Error ? error.message : t('picker.retry'))
        } finally {
          setBusy(false)
        }
      }

      const pickImportFile = () => {
        const fileInput = document.createElement('input')
        fileInput.type = 'file'
        fileInput.accept = 'application/json,.json'
        fileInput.onchange = () => {
          const file = fileInput.files?.[0]
          if (file !== undefined) void importFile(file)
        }
        fileInput.click()
      }
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
              }, h(IconChevronsUpDown, { size: 14 }), sortActive ? t('sort.done') : t('sort.toggle')) : null,
              h('button', {
                type: 'button',
                className: 'dshpl-headBtn',
                onClick: startCreate,
              }, h(IconPlus, { size: 14 }), t('picker.new')),
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
            h('div', { className: 'dshpl-foot' },
              h('button', {
                type: 'button',
                className: 'dshpl-headBtn',
                disabled: busy,
                onClick: pickImportFile,
              }, t('picker.import')),
              h('button', {
                type: 'button',
                className: 'dshpl-headBtn',
                disabled: busy || prompts === null,
                onClick: exportLibrary,
              }, t('picker.export')),
            ),
          )
        : h(PromptForm, {
            key: editing.mode === 'update' ? editing.id : 'create',
            initial: editing,
            busy,
            notice,
            onSave: saveForm,
            onCancel: () => { setNotice(null); setEditing(null) },
          })

      // The surface: the translucent material layer rides inside (z-index
      // -1, isolation keeps it behind content but above the page), and the
      // macOS backing plate follows the surface's own anchor. CSS anchor
      // placement: the panel follows the trigger above it, right-aligned,
      // clamped into the layout viewport by the sheet's insets (see
      // `.dshpl-menu` in CSS).
      return h(Fragment, null,
        createPortal(
          h('div', {
            ref: panelRef,
            className: 'dshpl-menu',
            style: { positionAnchor: anchorName, '--dshpl-surface-anchor': surfaceAnchor },
            role: 'dialog',
            'aria-label': t('picker.title'),
            tabIndex: -1,
          },
            h('div', { className: 'dshpl-material', 'aria-hidden': true }),
            body),
          document.body,
        ),
        createPortal(
          h('div', {
            className: 'dshpl-backing',
            'aria-hidden': true,
            style: { '--dshpl-surface-anchor': surfaceAnchor },
          }),
          document.body,
        ),
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
          moveBtn('up', IconChevronUp, t('sort.up'), isFirst),
          moveBtn('down', IconChevronDown, t('sort.down'), isLast),
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
        }, h(IconEdit, { size: 14 })),
        h('button', {
          type: 'button',
          className: 'dshpl-iconBtn',
          title: t('picker.delete'),
          'aria-label': `${t('picker.delete')}: ${prompt.title}`,
          onClick: event => { event.stopPropagation(); onRemove(prompt) },
        }, h(IconTrash, { size: 14 })),
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
/* Sizing contract: the panel's height:fit-content derives from children's
 * intrinsic content, so no child may use flex-basis 0 (flex:1) — WebKit
 * counts those as zero-content and collapses the panel to an empty strip
 * (Blink is lenient, which is why the desktop looked fine). Scroll children
 * keep the shipped recipe's default flex:0 1 auto + min-height:0 and scroll
 * only when max-height clamps them. */
.dshpl-button{width:28px;height:28px;flex:none;place-items:center;display:grid;cursor:pointer;border:none;border-radius:999px;padding:0;background:0 0;color:var(--dsw-alias-label-primary)}
@media (hover:hover){.dshpl-button:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}}
.dshpl-menu{box-sizing:border-box;position:fixed;z-index:1100;display:flex;flex-direction:column;overflow:hidden;padding:4px;color:var(--dsw-alias-label-primary);position-area:none;top:max(12px,var(--dsh-frame-overlay-top,12px));left:12px;right:anchor(right);bottom:calc(anchor(top) + 8px);align-self:safe end;justify-self:safe end;height:fit-content;width:min(360px,calc(100vw - 32px));max-height:min(440px,calc(100dvh - 96px));border-radius:var(--dsw-radius-lg);anchor-name:var(--dshpl-surface-anchor);isolation:isolate;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dshpl-material{position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var(--dsw-menu-surface-fill);backdrop-filter:var(--dsw-menu-backdrop-filter);pointer-events:none}
.dshpl-backing{display:none;border-radius:var(--dsw-radius-lg)}
html[data-platform=darwin] .dshpl-backing{display:block;position:fixed;position-anchor:var(--dshpl-surface-anchor);top:anchor(top);left:anchor(left);width:anchor-size(width,0px);height:anchor-size(height,0px);z-index:-1;background:var(--dsw-alias-bg-base);pointer-events:none}
.dshpl-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;border:none;border-radius:var(--dsw-radius-md);cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);background:transparent;padding:0 14px}
.dshpl-btn:disabled{cursor:not-allowed;opacity:.4}
.dshpl-btnSm{height:28px;font-size:12px;line-height:18px;padding:0 10px;border-radius:var(--dsw-radius-sm)}
.dshpl-btnPrimary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dshpl-btnPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.dshpl-btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshpl-btnGhost:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.dshpl-pick{display:flex;flex-direction:column;min-height:0}
.dshpl-head{display:flex;align-items:center;gap:8px;padding:6px 8px 4px;flex:none}
.dshpl-headTitle{flex:1;min-width:0;font-size:11px;font-weight:500;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshpl-headBtn{flex:none;height:24px;padding:0 8px;display:inline-flex;align-items:center;gap:4px;border:none;border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;cursor:pointer}
@media (hover:hover){.dshpl-headBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.dshpl-headBtn:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.dshpl-headBtnOn,.dshpl-headBtnOn:hover{background:var(--dsw-alias-interactive-bg-active)}
.dshpl-list{min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px;padding:2px 0}
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
.dshpl-status{padding:12px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dshpl-retry{display:inline-block;margin-top:6px;padding:0;border:none;background:0 0;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;font-weight:600;cursor:pointer}
@media (hover:hover){.dshpl-retry:hover{text-decoration:underline}}
.dshpl-empty{display:flex;flex-direction:column;gap:4px;padding:16px 10px}
.dshpl-emptyTitle{font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dshpl-emptyHint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dshpl-notice{flex:none;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);padding:6px 7px;font-size:11px;line-height:16px}
.dshpl-pick .dshpl-notice{margin:2px 2px 4px}
.dshpl-form{display:flex;flex-direction:column;gap:8px;padding:8px;min-height:0;overflow-y:auto}
.dshpl-formTitle{font-size:11px;font-weight:500;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dshpl-input,.dshpl-textarea{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:5px 8px;font:inherit;font-size:13px;line-height:20px}
.dshpl-textarea{resize:vertical;min-height:96px}
@media (pointer:coarse){.dshpl-input,.dshpl-textarea{font-size:16px}}
.dshpl-input:focus,.dshpl-textarea:focus{outline:none;border-color:var(--dsw-alias-border-l4)}
.dshpl-formActions{display:flex;justify-content:flex-end;gap:8px;flex:none}
.dshpl-foot{display:flex;gap:2px;padding:2px 6px 6px;flex:none}
.dshpl-foot .dshpl-headBtn{height:28px;padding:0 10px}
`

    // --------------------------------------------------------------- module

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (locale !== undefined) {
          ctx.effect(() => locale.register(NS, { zh, en }), 'prompt-dock: dictionaries')
          shared.t = locale.bind(NS)
        }
        const slots = ctx.get('slots')
        if (slots === undefined) throw new Error('prompt-dock requires the slots service')
        ctx.effect(() => slots.inject('conversation.input.right', () => slots.register(
          {
            name: 'conversation.input.right',
            id: 'prompt-dock',
            order: 50,
            label: () => shared.t('button.label'),
          },
          Entry,
        )), 'prompt-dock: composer entry')
      },
    }
  },
})
