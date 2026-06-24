# DEPRECATED — do not edit, build from, or review this directory

These are the original **design-prototype** JSX files. They are **not** the
source of the running app.

The canonical source is [`../src/app.jsx`](../src/app.jsx), edited directly
and built with `vite build`. The old [`../build-app.mjs`](../build-app.mjs)
generator concatenated the files here into `src/app.jsx`, but that path is
stale — regenerating strips features the live app has gained since.

If you're reviewing the code, **read `../src/` and `../server/`** and ignore
this directory.
