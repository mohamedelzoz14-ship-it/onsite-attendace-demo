/**
 * employeeService.js
 * Owns the live employee roster — add, remove (only if no history yet),
 * resign, transfer, reactivate. Unlike config/users.js's SEED_ROSTER (which
 * only seeds storage the very first time the app runs), this is the actual
 * source of truth from that point on. Every write goes through
 * StorageService and every action is recorded to the Audit Log.
 *
 * Like attendanceEngine.js and requestService.js, every public method that
 * changes state returns { ok, data, code } instead of throwing.
 *
 * Migration note: every method is now `async` — no business rule changed
 * (name validation, date validation, and the "can't delete with history"
 * guard are byte-identical to before). The one real adaptation: this used
 * to read the WHOLE roster into a JS array, mutate it, and save the whole
 * array back for every single change — fine for localStorage, wasteful and
 * racy for a real database. Add/status-change/remove now use targeted
 * single-row operations (StorageService.insertEmployee/updateEmployeeRow/
 * deleteEmployee) instead. getRoster()'s one-time seed path still does a
 * bulk write, since seeding genuinely IS "write many rows at once".
 */
import { StorageService } from "./storageService.js";
import { AuditService } from "./auditService.js";
import * as EmployeeRules from "../rules/employeeRules.js";
import { NOTIFICATION_CODES as CODE } from "../config/constants.js";
import { SEED_ROSTER } from "../config/users.js";
import { todayKey } from "../utils/dateUtils.js";

function result(ok, data, code) {
  return { ok, data: data || null, code: code || null };
}

/** Picks the next free numeric ID one above the current highest (falls back to 1000 if the roster is somehow empty). */
function computeNextId(roster) {
  const numericIds = roster.map((e) => parseInt(e.id, 10)).filter((n) => !Number.isNaN(n));
  const max = numericIds.length ? Math.max(...numericIds) : 1000;
  return String(max + 1);
}

export const EmployeeService = Object.freeze({
  /**
   * @returns {Promise<object[]>} the full roster (active AND inactive employees) — the
   * inactive ones stay so their historical attendance can still be looked up.
   * Seeds storage from SEED_ROSTER the very first time this is called.
   */
  async getRoster() {
    let roster = await StorageService.getRoster();
    if (!roster || roster.length === 0) {
      roster = SEED_ROSTER.map((e) => ({ ...e }));
      await StorageService.saveRoster(roster);
    }
    return roster;
  },

  /** @param {Date} [date] @returns {Promise<object[]>} only employees active on this store's roster on `date`. */
  async getActiveRoster(date = new Date()) {
    const key = todayKey(date);
    const roster = await this.getRoster();
    return roster.filter((emp) => EmployeeRules.isActiveOn(emp, key));
  },

  /**
   * @param {string} employeeId
   * @param {Date} [date]
   * @returns {Promise<boolean>} false if the employee doesn't exist, hasn't reached
   * their join date yet, or had already left (resigned/transferred) as of `date`.
   */
  async isActiveEmployee(employeeId, date = new Date()) {
    const roster = await this.getRoster();
    const employee = roster.find((e) => e.id === employeeId);
    if (!employee) return false;
    return EmployeeRules.isActiveOn(employee, todayKey(date));
  },

  /**
   * @param {string} name
   * @param {string} actingAdminId
   * @param {string} [startDate] - YYYY-MM-DD, when they join this roster.
   * Defaults to today (added = joining now). Set a future date to
   * pre-register someone before their actual first day — they won't count
   * toward "today" (present/absent/scheduled) until that date arrives.
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async addEmployee(name, actingAdminId, startDate, store, title) {
    try {
      if (!EmployeeRules.isValidName(name)) return result(false, null, CODE.EMPLOYEE_NAME_REQUIRED);
      const resolvedStartDate = startDate || todayKey();
      if (!EmployeeRules.isValidDate(resolvedStartDate)) return result(false, null, CODE.EMPLOYEE_DATE_INVALID);

      const roster = await this.getRoster();
      const employee = {
        id: computeNextId(roster),
        name: name.trim(),
        startDate: resolvedStartDate,
        endDate: null,
        endReason: null,
        transferredTo: null
      };
      // Only set store/title when provided, so existing callers that don't
      // pass them keep their original behavior (store falls back to
      // HOME_STORE in addEmployeeRow; title stays null).
      if (store) employee.store = store;
      if (title) employee.title = title;

      const created = await StorageService.insertEmployee(employee);
      await AuditService.logEmployeeAdded(created || employee, actingAdminId);
      return result(true, created || employee, CODE.EMPLOYEE_ADDED);
    } catch (error) {
      await AuditService.logError("employeeService.addEmployee", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /**
   * Hard-deletes an employee — only allowed with zero attendance history and
   * zero requests (a true undo of an accidental add). Anyone with real
   * history should be marked resigned/transferred instead via setEmployeeStatus.
   * @param {string} employeeId
   * @param {string} actingAdminId
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async removeEmployee(employeeId, actingAdminId) {
    try {
      const roster = await this.getRoster();
      const employee = roster.find((e) => e.id === employeeId);
      if (!employee) return result(false, null, CODE.EMPLOYEE_NOT_FOUND);

      const [hasHistory, hasRequests] = await Promise.all([
        StorageService.employeeHasAttendanceHistory(employeeId),
        StorageService.employeeHasRequests(employeeId)
      ]);
      if (!EmployeeRules.canRemoveEmployee(hasHistory, hasRequests)) {
        return result(false, employee, CODE.EMPLOYEE_HAS_HISTORY);
      }

      // Log the removal BEFORE the delete: the audit entry references
      // employee.id via a foreign key, so it has to be written while the
      // employee row still exists. Writing it after the delete threw an FK
      // violation that surfaced as a false "something went wrong" — even
      // though the delete itself had already succeeded.
      await AuditService.logEmployeeRemoved(employee, actingAdminId);
      await StorageService.deleteEmployee(employeeId);
      return result(true, employee, CODE.EMPLOYEE_REMOVED);
    } catch (error) {
      await AuditService.logError("employeeService.removeEmployee", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /**
   * Marks an employee resigned or transferred, effective `statusChange.endDate`.
   * This never touches their past attendance records — it only affects
   * whether they show up in "today" going forward (see reportsService.js).
   * @param {string} employeeId
   * @param {{endDate:string, endReason:"resigned"|"transferred", transferredTo?:string}} statusChange
   * @param {string} actingAdminId
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async setEmployeeStatus(employeeId, statusChange, actingAdminId) {
    try {
      const roster = await this.getRoster();
      const employee = roster.find((e) => e.id === employeeId);
      if (!employee) return result(false, null, CODE.EMPLOYEE_NOT_FOUND);
      if (!EmployeeRules.isValidDate(statusChange.endDate)) {
        return result(false, employee, CODE.EMPLOYEE_DATE_INVALID);
      }

      const before = { ...employee };
      const patch = {
        endDate: statusChange.endDate,
        endReason: statusChange.endReason,
        transferredTo: statusChange.transferredTo || null
      };

      const updated = await StorageService.updateEmployeeRow(employeeId, patch);
      await AuditService.logEmployeeStatusChanged(before, updated || { ...employee, ...patch }, actingAdminId);
      return result(true, updated || { ...employee, ...patch }, CODE.EMPLOYEE_STATUS_UPDATED);
    } catch (error) {
      await AuditService.logError("employeeService.setEmployeeStatus", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /**
   * Clears a resignation/transfer — the employee is active again (e.g. the
   * status was set by mistake, or they came back).
   * @param {string} employeeId
   * @param {string} actingAdminId
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async reactivateEmployee(employeeId, actingAdminId) {
    try {
      const roster = await this.getRoster();
      const employee = roster.find((e) => e.id === employeeId);
      if (!employee) return result(false, null, CODE.EMPLOYEE_NOT_FOUND);

      const before = { ...employee };
      const patch = { endDate: null, endReason: null, transferredTo: null };

      const updated = await StorageService.updateEmployeeRow(employeeId, patch);
      await AuditService.logEmployeeStatusChanged(before, updated || { ...employee, ...patch }, actingAdminId);
      return result(true, updated || { ...employee, ...patch }, CODE.EMPLOYEE_STATUS_UPDATED);
    } catch (error) {
      await AuditService.logError("employeeService.reactivateEmployee", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /**
   * Permanently moves an employee to a different store — changes their
   * PRIMARY store (where they appear in reports going forward). They stay
   * active; this is NOT a resignation. Past attendance records keep the
   * store they were actually punched at (a shift worked at a branch counts
   * for that branch), so only home_store_id changes here.
   * @param {string} employeeId
   * @param {string} newStore - the destination store id (e.g. "EG107")
   * @param {string} actingAdminId
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async transferEmployee(employeeId, newStore, actingAdminId) {
    try {
      const roster = await this.getRoster();
      const employee = roster.find((e) => e.id === employeeId);
      if (!employee) return result(false, null, CODE.EMPLOYEE_NOT_FOUND);
      if (!newStore || newStore === employee.store) {
        return result(false, employee, CODE.EMPLOYEE_TRANSFER_SAME_STORE);
      }

      const before = { ...employee };
      const updated = await StorageService.updateEmployeeRow(employeeId, { store: newStore });
      await AuditService.logEmployeeStatusChanged(before, updated || { ...employee, store: newStore }, actingAdminId);
      return result(true, updated || { ...employee, store: newStore }, CODE.EMPLOYEE_TRANSFERRED);
    } catch (error) {
      await AuditService.logError("employeeService.transferEmployee", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  }
});
