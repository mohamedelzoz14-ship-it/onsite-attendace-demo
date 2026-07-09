/**
 * closureService.js
 * Lets the store manager declare a full closure for a specific date (power
 * outage, severe weather, security lockdown) — a direct admin action, not
 * a request/approval cycle, since there's no one to ask when the store
 * itself can't operate. Unlike a public holiday (informational only, never
 * blocks anything — see config/holidays.js), a closure means the store
 * genuinely couldn't function, so it DOES exclude anyone without an
 * existing record from "Absent" and DOES block check-in.
 *
 * Like the other services, every action returns { ok, data, code } instead
 * of throwing, and is recorded to the Audit Log.
 *
 * Migration note: every method is now `async` — no business rule changed.
 * addClosure() now inserts a single targeted row (StorageService.insertClosure)
 * instead of reading the whole closures table, pushing to it in JS, and
 * saving the whole thing back.
 */
import { StorageService } from "./storageService.js";
import { AuditService } from "./auditService.js";
import * as ClosureRules from "../rules/closureRules.js";
import { NOTIFICATION_CODES as CODE } from "../config/constants.js";

function result(ok, data, code) {
  return { ok, data: data || null, code: code || null };
}

export const ClosureService = Object.freeze({
  /** @returns {Promise<object[]>} every declared closure, most recent first. */
  async getClosures() {
    const closures = await StorageService.getClosures();
    return closures.sort((a, b) => (a.date < b.date ? 1 : -1));
  },

  /** @param {string} dateKey - YYYY-MM-DD @returns {Promise<object|null>} */
  async getClosureFor(dateKey) {
    const closures = await StorageService.getClosures();
    return ClosureRules.findClosure(dateKey, closures);
  },

  /** @param {string} dateKey - YYYY-MM-DD @returns {Promise<boolean>} */
  async isStoreClosedOn(dateKey) {
    return !!(await this.getClosureFor(dateKey));
  },

  /**
   * @param {string} date - YYYY-MM-DD, any date — past (catching up a record)
   * or future (planned closure, e.g. renovation) are both fine.
   * @param {string} reason
   * @param {string} actingAdminId
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async addClosure(date, reason, actingAdminId) {
    try {
      if (!ClosureRules.isValidClosureDate(date)) return result(false, null, CODE.CLOSURE_DATE_INVALID);

      const closures = await StorageService.getClosures();
      if (ClosureRules.findClosure(date, closures)) return result(false, null, CODE.CLOSURE_ALREADY_EXISTS);

      const closure = { date, reason: reason || "", addedBy: actingAdminId, addedAt: new Date().toISOString() };
      const created = await StorageService.insertClosure(closure);
      await AuditService.logClosureAdded(created || closure, actingAdminId);
      return result(true, created || closure, CODE.CLOSURE_ADDED);
    } catch (error) {
      await AuditService.logError("closureService.addClosure", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /**
   * @param {string} date - YYYY-MM-DD
   * @param {string} actingAdminId
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async removeClosure(date, actingAdminId) {
    try {
      const closures = await StorageService.getClosures();
      const closure = ClosureRules.findClosure(date, closures);
      if (!closure) return result(false, null, CODE.CLOSURE_NOT_FOUND);

      await StorageService.deleteClosure(date);
      await AuditService.logClosureRemoved(closure, actingAdminId);
      return result(true, closure, CODE.CLOSURE_REMOVED);
    } catch (error) {
      await AuditService.logError("closureService.removeClosure", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  }
});
