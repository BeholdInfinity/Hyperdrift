/**
 * Per-station traffic fines ledger (persisted).
 */

export class TrafficRecord {
  constructor() {
    /** @type {Record<string, { debt: number, outlaw: boolean, fines: object[] }>} */
    this.byStation = {};
  }

  debtFor(siteId) {
    return this.byStation[siteId]?.debt ?? 0;
  }

  isOutlaw(siteId) {
    return !!this.byStation[siteId]?.outlaw;
  }

  canTradeAt(site, layout) {
    if (!site) return true;
    if (site.trafficPolicy === 'none') return true;
    const policy = site.tradePolicy || {};
    const debt = this.debtFor(site.id);
    if (debt >= (policy.tradeBlockDebt ?? 5000)) return false;
    return !this.isOutlaw(site.id);
  }

  addFine(siteId, amount, layout) {
    if (!siteId || amount <= 0) return;
    const entry = this.byStation[siteId] || { debt: 0, outlaw: false, fines: [] };
    entry.debt += amount;
    entry.fines.push({ amount, at: Date.now() });
    const site = layout?.sites?.find((s) => s.id === siteId);
    const outlawThreshold = site?.tradePolicy?.outlawDebt ?? 25000;
    if (entry.debt >= outlawThreshold) entry.outlaw = true;
    this.byStation[siteId] = entry;
  }

  payStation(siteId, feeRate = 0) {
    const entry = this.byStation[siteId];
    if (!entry) return 0;
    const fee = Math.ceil(entry.debt * (feeRate || 0));
    const paid = entry.debt + fee;
    delete this.byStation[siteId];
    return paid;
  }

  toJSON() {
    return { byStation: this.byStation };
  }

  fromJSON(data) {
    this.byStation = data?.byStation ? { ...data.byStation } : {};
  }
}
