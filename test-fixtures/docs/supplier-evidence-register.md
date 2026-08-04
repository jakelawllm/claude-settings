# Supplier evidence register

This register records the supplier facts asserted in the firm's AI policy and standing instructions. Each entry requires dated owner approval before a production go.

## How to use this register

1. Before a production deployment, a responsible owner must verify each claim against current supplier documentation.
2. Record the source URL, the verified date, and the owner.
3. Set a next-review date (recommended: at least annually, or when the supplier changes its terms).
4. Entries with unfilled values must be completed before production go.

## Entries

| Claim | Source URL | Verified date | Owner | Next review |
|---|---|---|---|---|
| Inputs and outputs are not used to train any model | https://docs.anthropic.com/en/legal/ai-data-policy | 2026-08-04 | SYNTHETIC-FIXTURE | 2027-08-04 |
| Inputs and outputs are not made publicly available | https://docs.anthropic.com/en/legal/ai-data-policy | 2026-08-04 | SYNTHETIC-FIXTURE | 2027-08-04 |
| Retention period does not exceed N days (firm's configured cleanup period) | https://docs.anthropic.com/en/legal/ai-data-policy | 2026-08-04 | SYNTHETIC-FIXTURE | 2027-08-04 |
| OTEL metrics and logs do not capture prompt or response content | https://docs.anthropic.com/en/legal/ai-data-policy | 2026-08-04 | SYNTHETIC-FIXTURE | 2027-08-04 |

## Notes

Being told a tool is closed, ringfenced, or confidential is not itself sufficient assurance. The responsible practitioner must be able to identify the contractual basis for each claim and verify it is current. Where a supplier has changed its terms since the last review, re-verify and update this register before relying on the claim.
