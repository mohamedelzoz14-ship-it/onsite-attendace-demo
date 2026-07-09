/**
 * exportExcel.js
 * Thin wrapper around SheetJS/xlsx (loaded via CDN in index.html — see the
 * <script> tag before js/main.js). Keeps the one place that touches the
 * `XLSX` global separate from the page that decides what to export.
 */
import { formatTime, formatShortDate } from "../utils/dateUtils.js";
import { statusDisplay } from "./badge.js";

/**
 * @param {object[]} rows - rows in the same shape as DMReportsService.getEmployeeTableRows()
 * @param {string} [filename]
 * @returns {boolean} true if the export ran, false if the SheetJS library isn't loaded
 */
export function exportRowsToExcel(rows, filename = "attendance-export.xlsx") {
  if (typeof XLSX === "undefined") {
    console.warn("exportExcel: SheetJS (XLSX) isn't loaded — check the CDN script tag in index.html.");
    return false;
  }

  const data = rows.map((r) => ({
    "Employee ID": r.employeeId,
    "Employee Name": r.name,
    Store: r.store,
    Shift: r.shift || "—",
    Status: statusDisplay(r.status).label,
    "Check In": formatTime(r.checkInTime),
    "Check Out": formatTime(r.checkOutTime),
    "Working Hours": r.totalHours ?? "",
    Date: r.date ? formatShortDate(r.date) : ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet["!cols"] = [
    { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 12 },
    { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
  XLSX.writeFile(workbook, filename);
  return true;
}
