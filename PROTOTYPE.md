# OfflineReadiness — prototype status

**Experimental concept prototype — idea exploration only.** This repository shares runnable exploratory code, not a finished product or production-ready release. The repository's package version identifies this iteration; it is not a readiness certification or release-readiness claim.

## Purpose

Explore a local Home Assistant dependency-snapshot viewer, using user-selected registry metadata and dated integration classifications. The built-in sample and fixtures are fictional. The tool does not connect to Home Assistant and does not test the user's home.

## What is not established

A declared local integration is not proof of measured offline operation, whole-home readiness or physical-device compatibility. Classification evidence is dated and bounded; unknown/custom dependencies remain explicit. No real-home hardware matrix or clean-machine qualification is established. Narrow detail tables can remain cramped. Features may change or remain unfinished. Product metadata can remain in redacted reports; review them before sharing.

## Verification provenance

The approved local source baseline, verified on 2026-10-11, passed 43 default Node tests and 14 real-Chrome cases using fictional inputs and actual browser downloads. The retained 381-check classification rerun compared filesystem caches, not a fresh live source fetch or Home Assistant connection. These checks do not measure offline operation.

This publication copy adds prototype status text to the README and viewer plus this document; runtime JavaScript, bundled classification data and test logic are preserved from the approved source. Reviewer logs and owner data are not included.

Open `index.html` directly. For development, use `npm test`; the real-Chrome suite is `node tests/browser.cjs`. Full historical scope and limitations are in [docs/verification.md](docs/verification.md). Publication is source sharing only: no GitHub Release, deployment or support commitment is implied.
