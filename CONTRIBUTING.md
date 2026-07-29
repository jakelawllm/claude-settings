# Contributing

**This repository does not accept contributions.**

It is published for reference and adaptation. Issues are disabled, pull requests are not monitored, and no response should be expected to either. Fork it and make it yours.

The exception is security. If you have found something the configuration or the matter guard permits that the documentation says it prevents, that is worth reporting and there is a private route for it in [SECURITY.md](SECURITY.md). Please do not open it in public, and please do not include client information, matter names or real file paths.

## If you are adapting it

Two things are worth knowing before you change anything.

`ai-policy-legal-practice-template.md` is generated. Edit the `.docx`, which is the authoritative document, then regenerate:

```
pip install -r requirements.txt
python scripts/docx-to-md.py ai-policy-legal-practice-template.docx ai-policy-legal-practice-template.md
```

CI fails if the two have drifted.

Clause numbers are load-bearing. The settings, the skill and the README all cite them, and inserting a clause renumbers everything after it. A stale reference is worse than a broken one because it still resolves — to a real clause about a different subject. Run:

```
python scripts/check-clause-refs.py
node tests/matter-guard.test.js
```

The test suite is adversarial by design. If you change the guard, the cases that matter are the ones asserting a refusal: every defect found in this file so far has failed in the direction that looks like "allowed".
