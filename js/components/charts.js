/**
 * charts.js
 * Thin wrapper around Chart.js (loaded via CDN in index.html — see the
 * <script> tag before js/main.js). Keeps every Chart.js call in one file so
 * the rest of the app never touches the `Chart` global directly.
 */

const instances = new Map();

/** Destroys a previous chart on this canvas, if one exists — Chart.js throws if you re-render onto a canvas that already has a live chart. */
function destroyExisting(canvasId) {
  const existing = instances.get(canvasId);
  if (existing) {
    existing.destroy();
    instances.delete(canvasId);
  }
}

/**
 * @param {string} canvasId
 * @param {string[]} labels
 * @param {{label:string, data:number[], color:string}[]} series
 */
export function renderLineChart(canvasId, labels, series) {
  destroyExisting(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === "undefined") return;

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.label,
        data: s.data,
        borderColor: s.color,
        backgroundColor: s.color,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: series.length > 1, labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: {
        x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { font: { size: 10 } } }
      }
    }
  });
  instances.set(canvasId, chart);
  return chart;
}

/**
 * @param {string} canvasId
 * @param {string[]} labels
 * @param {number[]} data
 * @param {string} color
 */
export function renderBarChart(canvasId, labels, data, color) {
  destroyExisting(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === "undefined") return;

  const chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 4 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, max: 100, ticks: { font: { size: 10 } } }
      }
    }
  });
  instances.set(canvasId, chart);
  return chart;
}
