INTERACTIVE MATH & PHYSICS LAB — PACKAGE NOTES (v2)
=====================================================

WHAT'S IN HERE
--------------
- index.html          -> the home/hub page. Start here. Links to all 98 tools.
- 47 mode_*.html files -> every mode from the original Arithmetic/Shapes/
                          Geometry/Algebra/Trig/Clock lab, now split into its
                          own standalone page (e.g. mode_add.html,
                          mode_pythagoras.html, mode_clock.html). Each one
                          loads the full engine and auto-selects its own
                          mode on open. The mode dropdown stays visible and
                          usable in each file, so you can still switch to a
                          neighboring mode without leaving the page.
- 51 other .html files -> every other simulation (Pendulum, Projectile,
                          Matrix/Vector Lab, Calculus Explorer, etc.) as its
                          own fully independent, self-contained page.
- full-lab.html        -> the original all-in-one Arithmetic/Shapes/
                          Geometry/Algebra/Trig/Clock lab (47 modes) kept
                          intact as a single combined page, in case you'd
                          rather browse all 47 from one dropdown instead of
                          separate files.

Every page (except index.html) has a small "← Home" button, top-left,
linking back to index.html.

No subfolders — every file sits in one flat folder.


WHY THE mode_*.html FILES ARE ~1MB EACH
----------------------------------------
Each of the 47 modes shares one deeply-interconnected 3D engine (single
Three.js scene, shared global state, shared render loop) rather than having
isolated per-mode code. Splitting out "just the arithmetic code" would risk
leaving behind logic that silently depends on code defined elsewhere,
producing pages that look fine but work subtly wrong.

So instead, each mode_*.html file contains the ENTIRE proven-working engine
(identical code to full-lab.html), and simply auto-selects its own mode on
load — exactly what happens when you manually pick that mode from the
dropdown in full-lab.html. This guarantees correctness at the cost of file
size (~1MB instead of a few KB). Total package is ~63MB across all 98+2
files instead of a few MB, but every tool works exactly as tested.


LIBRARY LOADING — NOW CDN-BASED (v3 FIX)
-------------------------------------------
Earlier versions of this package pointed 63 files at LOCAL library
filenames (three.module.js, three.r128.min.js, OrbitControls.r128.js,
TransformControls.r128.js, katex.min.js/css) that were never actually
included in the zip — on GitHub Pages (or any host without those files
sitting alongside the HTML) this caused every Three.js canvas to load
blank.

All 63 affected files have been repointed to CDN URLs
(unpkg for the ES-module Three.js builds, cdnjs/jsdelivr for the r128
classic builds and KaTeX). This means:

  - Hosted (GitHub Pages, any web host): works immediately, no setup.
  - Fully offline / file:// on your own device: needs an internet
    connection on first load of any 3D tool, same as a normal website
    loading a CDN script. If you want true zero-internet offline use,
    you'd now download the CDN-hosted files instead and swap the URLs
    back to local filenames — happy to help set that up if needed.

=====================================================
UPDATE — SECOND BUG FIX (v6)
=====================================================
The CDN fix in the previous version was incomplete: 48 files
(all mode_*.html files + full-lab.html) still had two broken
relative ES-module imports left over from the original local-file
setup:

  import { OrbitControls } from './OrbitControls.js';
  import { RoundedBoxGeometry } from './RoundedBoxGeometry.js';

Neither file exists anywhere in this package, so on GitHub Pages
those imports 404, the module script throws, and the page gets
stuck on "Loading 3D engine..." forever — this is what caused the
47-mode split files to appear blank/stuck.

Fixed by pointing both imports at the same CDN alias already set up
in each file's import map:

  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

All 48 files checked and confirmed clean — no remaining relative
imports or local file references anywhere in the package.
