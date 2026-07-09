/**
 * table.js
 * Generic <tbody> renderer. Pages pass their data + a `rowTemplate(row) => html`
 * function; this component only handles the empty-state and the innerHTML swap,
 * so that logic isn't duplicated between the employee history table and the
 * admin attendance table.
 */

const EMPTY_STATE_GLYPH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="18" height="13" rx="1"/><path d="M3 7l3-4h12l3 4"/><path d="M9 12h6"/></svg>';

/**
 * @param {HTMLTableSectionElement} tbody
 * @param {Array} rows
 * @param {(row:any) => string} rowTemplate
 * @param {number} colSpan - number of columns, used for the empty-state row
 * @param {string} emptyMessage
 * @param {string} [emptyTitle] - defaults to "Nothing here yet"; pass "No matches"
 * for a filtered/searched table where the emptiness means "adjust your filters",
 * not "there's no data at all".
 */
export function renderTable(tbody, rows, rowTemplate, colSpan, emptyMessage, emptyTitle = "Nothing here yet") {
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}">
      <div class="empty-state">
        <div class="empty-glyph">${EMPTY_STATE_GLYPH}</div>
        <div class="empty-title">${emptyTitle}</div>
        <div class="empty-body">${emptyMessage}</div>
      </div>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(rowTemplate).join("");
}
