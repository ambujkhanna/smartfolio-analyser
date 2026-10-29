# Accounting Rules — Initial Supported Scope

**Status:** Initial implementation specification  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Last updated:** 29 October 2026

This document defines the first calculation convention. It is a transparent portfolio-performance model, not a tax report. No metric should be shown as complete when required inputs are missing.

## 1. Initial conventions

- **Currency:** The first release targets INR. Cross-currency transactions are rejected or marked unsupported until an explicit FX model exists.
- **Instrument identity:** Calculations group by a stable canonical instrument ID, not a display symbol alone.
- **Time ordering:** Process transactions by occurrence timestamp, then source order only when that order is deterministic and preserved. Same-day transactions without enough ordering information are flagged as ambiguous rather than silently reordered.
- **Realized cost allocation:** Use FIFO lots for the initial implementation. Label the method in the UI. This is not a claim of tax-grade correctness.
- **Fees:** Trade-level charges are applied to the associated buy cost or reduce associated sale proceeds. Standalone fee rows are portfolio cash outflows. The same charge must never be represented both ways.
- **Dividends:** A validated dividend transaction is a positive cash inflow. Dividends are included in lifecycle economic P&L and reported separately from trading P&L.
- **Corporate actions:** Splits, bonuses, mergers, rights issues, and symbol changes are unsupported until modeled explicitly. They must produce a warning or require an explicit adjustment; they must not be inferred from price movement.
- **Incomplete history:** Missing opening quantity/cost basis or missing earlier transactions means affected metrics are marked incomplete. The engine must not infer an unknown cost from the current market price.
- **Rounding:** Keep full numeric precision during calculations. Round only for display; tests compare numeric results with a small floating-point tolerance.

## 2. Transaction semantics

| Kind | Quantity / price | Cash flow | Position effect |
|---|---|---|---|
| Buy | Positive quantity and positive unit price | Negative: quantity × price + attached charges | Adds FIFO lot and cost |
| Sell | Positive quantity and positive unit price | Positive: quantity × price − attached charges | Consumes oldest available lots |
| Opening balance | Positive quantity; cost basis may be unknown | If a cost basis is explicitly supplied, it is a synthetic opening investment for lifecycle reporting; otherwise no invented cash flow is created | Seeds an opening lot |
| Fee | Positive amount | Negative amount | No quantity effect |
| Dividend | Positive amount | Positive amount | No quantity effect |

A broker may represent fees as separate rows or as attached trade charges. Import normalization must choose one representation per charge and flag suspected duplicates.

## 3. Metrics and formulas

### 3.1 Remaining position and cost basis

The ledger tracks open FIFO lots. A sale consumes quantity from the oldest lot first. Each lot retains its remaining quantity and remaining cost, including the documented share of buy-side charges. If a sell exceeds available quantity, the transaction is an oversell error; do not create a negative holding or silently ignore the excess.

Remaining cost basis is the total unallocated acquisition cost for open lots. If any open quantity lacks a known cost basis, total cost basis and unrealized P&L are incomplete.

### 3.2 Realized trading P&L

For each sale:

**Realized P&L = net sale proceeds − cost basis allocated to sold lots**

Net sale proceeds equal sale quantity × sale unit price less sale-side charges. The cost basis allocated to sold lots follows FIFO and includes allocated buy-side charges.

Realized trading P&L does not include dividends or unrelated portfolio-level fees. Those are reported separately so the user can understand the components.

### 3.3 Unrealized P&L

For an open position with complete remaining cost basis and a validated, fresh quote:

**Unrealized P&L = current market value − remaining cost basis**

Current market value equals open quantity × validated quote price. If the quote is missing, invalid, mismatched, or stale, current market value and unrealized P&L are unavailable. If cost basis is missing, market value may be shown when a quote is valid, but unrealized P&L remains unavailable.

### 3.4 Lifecycle economic P&L

The lifecycle view reconciles cash flows and remaining value:

**Economic P&L = net sale proceeds + current value of open positions + dividends − buy outflows − standalone fees − explicit opening investment basis**

Buy outflows include attached buy charges. Net sale proceeds deduct attached sell charges. Standalone fees are subtracted once. Opening investment basis is included only if explicitly supplied as a cost basis. Never add realized P&L to this formula; realized results are already reflected in the cash flows, so doing so would double count.

The portfolio economic total is marked **incomplete** if any included open position lacks a valid current quote, if opening cost/history is missing, or if a relevant transaction is invalid/unsupported. Do not replace missing values with zero to force a complete total.

### 3.5 Position break-even

For an open position with known remaining cost basis and positive open quantity:

**Position break-even price = remaining cost basis ÷ open quantity**

This is a remaining-position metric and excludes earlier closed-cycle results.

### 3.6 Lifecycle recovery price

For an open position with positive quantity and a complete, attributable lifecycle cash-flow history:

**Lifecycle recovery price = lifecycle net cash invested ÷ open quantity**

Where lifecycle net cash invested is buy outflows + standalone fees − net sale proceeds − dividends, with explicit opening basis included only when known. A negative value means prior net inflows already exceed the relevant investment basis; the UI should explain this rather than imply a negative traded price is possible. If quantity is zero, history is incomplete, or shared portfolio-level costs cannot be attributed to the instrument, show “Unavailable” or “Not applicable” with a reason. Do not silently allocate unrelated fees.

The lifecycle recovery formula is a portfolio-performance metric, not a tax cost basis or a prediction.

## 4. Hand-calculated examples

All examples exclude tax unless explicitly included and use INR.

### Example A — Sell at a loss, then re-buy

1. Buy 10 units at ₹100: buy outflow ₹1,000.
2. Sell 10 units at ₹60: sale proceeds ₹600; realized P&L = ₹600 − ₹1,000 = **−₹400**.
3. Buy 10 units at ₹65: buy outflow ₹650.
4. Valid current quote ₹75: market value ₹750; remaining cost basis ₹650; unrealized P&L = **+₹100**.

Lifecycle economic P&L = ₹600 + ₹750 − ₹1,000 − ₹650 = **−₹300**.

Position break-even = ₹650 ÷ 10 = **₹65**.

Lifecycle recovery price = (₹1,000 + ₹650 − ₹600) ÷ 10 = **₹105**.

The current position is up ₹100, while the overall lifecycle remains down ₹300. Do not add the −₹400 realized P&L to the economic P&L again; the sale proceeds are already included.

### Example B — FIFO partial sale

1. Buy 5 units at ₹100: lot A cost ₹500.
2. Buy 5 units at ₹120: lot B cost ₹600.
3. Sell 6 units at ₹130: proceeds ₹780, excluding charges.

FIFO allocates 5 units from lot A (₹500) and 1 unit from lot B (₹120). Realized P&L = ₹780 − ₹620 = **₹160**. Remaining quantity is 4 units from lot B, with remaining cost basis **₹480**.

At a validated current quote of ₹125, market value is ₹500 and unrealized P&L is **₹20**. Economic P&L = ₹780 + ₹500 − ₹500 − ₹600 = **₹180**. The reconciliation is realized ₹160 + unrealized ₹20 = economic ₹180 in this no-fee/no-dividend example.

### Example C — Missing quote

If 4 units remain with cost basis ₹480 but no validated current quote exists, market value and unrealized P&L are **Unavailable**, not ₹0. The portfolio economic total is marked incomplete. The known trade history can still report realized P&L.

### Example D — Opening balance with unknown cost

If an imported holdings file says 20 units are held but supplies no acquisition cost and the earlier tradebook is absent, a valid quote can support market value. Cost basis, unrealized P&L, lifecycle economic P&L, and recovery price remain unavailable/incomplete. The app must not treat the current quote as the acquisition price.

## 5. Warnings and acceptance rules

The engine must emit structured warnings for at least:
- missing, invalid, stale, or mismatched quotes;
- unknown opening cost basis or incomplete transaction history;
- oversold quantity;
- ambiguous transaction order;
- duplicate/suspected duplicate transactions or fees;
- unsupported corporate actions or transaction kinds;
- unresolved instrument identity;
- non-INR transaction until FX support exists;
- non-attributable portfolio-level fees.

A total can be displayed only with a completeness status. Any metric that depends on an invalid row must be either unavailable or explicitly labeled partial, with the reason visible.

## 6. Explicit non-goals for the first implementation

- Tax filing or tax-grade reporting.
- Automatic corporate-action inference.
- Multi-currency conversion.
- Automatic attribution of shared fees to individual securities without a documented rule.
- Guessing missing opening cost basis or transaction order.
