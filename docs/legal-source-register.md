# Legal source register

This register records the primary legal instruments the practice's AI policy and controls rely on. It is a release gate, not legal advice. A responsible legal or risk owner must verify each source against the authorised primary source before production deployment.

## How to use

Before a production deployment, verify that:

1. every instrument listed below is current and has not been superseded;
2. the approved interpretation remains correct;
3. each owner has reviewed the instrument within the review period; and
4. no new court direction, rule or practice note affects the controls.

Entries that say `OWNER-REQUIRED` or `DATE-REQUIRED` are deliberately unresolved. They block production release until completed by a responsible owner.

## Entries

| Instrument | Jurisdiction | Authorised source | Approved interpretation | Owner | Date checked | Next review |
|---|---|---|---|---|---|---|
| Supreme Court Practice Note SC Gen 23, Use of Generative Artificial Intelligence | Supreme Court of NSW | https://supremecourt.nsw.gov.au/documents/Practice-and-Procedure/Practice-Notes/general/current/PN_SC_Gen_23.pdf | Evidence-generation restrictions, citation verification and disclosure obligations are mandatory for NSW Supreme Court proceedings. | OWNER-REQUIRED | DATE-REQUIRED | DATE-REQUIRED |
| Federal Court general practice note or direction governing AI use | Federal Court of Australia | https://www.fedcourt.gov.au/law-and-practice/practice-documents | Federal Court requirements must be checked before filing or serving AI-assisted material in that Court. | OWNER-REQUIRED | DATE-REQUIRED | DATE-REQUIRED |
| Federal Circuit and Family Court practice direction or guidance governing AI use | Federal Circuit and Family Court of Australia | https://www.fcfcoa.gov.au/fl/pd | Family-law and federal-circuit requirements must be checked before AI-assisted material is used in those proceedings. | OWNER-REQUIRED | DATE-REQUIRED | DATE-REQUIRED |
| Legal Profession Uniform Law Australian Solicitors' Conduct Rules 2015 | NSW and Uniform Law jurisdictions | https://legislation.nsw.gov.au/view/html/inforce/current/sl-2015-0244 | Competence, confidentiality, independence, honesty to the court and supervision obligations apply to AI-assisted work. | OWNER-REQUIRED | DATE-REQUIRED | DATE-REQUIRED |

## Release gate

No production go is permitted until every entry has a named owner, a date checked, a next review date, and an approved interpretation verified against the primary source. The repository cannot complete this gate by itself.
