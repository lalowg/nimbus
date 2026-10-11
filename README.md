# NIMBUS — Your Business, in the Cloud

**Production:** `https://nimbus-olive-five.vercel.app`

A concept website for a fictional cloud infrastructure provider. The page opens on a working **topology console**: a live architecture diagram where requests flow as packets along orthogonal links, and every configuration change re-routes the topology and updates simulated metrics, cost and the plan it fits.

> Fictional concept brand — portfolio project. NIMBUS is not a real company or service. All metrics, prices and timings are an illustrative teaching model, not a benchmark, an SLA or a quote.

---

## Concept

Cloud platforms usually sell with feature grids. NIMBUS sells with the diagram an engineer already draws on a whiteboard, except this one runs. Change traffic, regions, autoscaling, the edge, the cache, replicas or the job queue and you see the consequence immediately: nodes slide into a new topology, links draw themselves in, packets take new routes, latency and cost re-settle.

| # | Section | Composition | What it does |
|---|---|---|---|
| 01 | **Console** | Three-pane engineering console: configure · topology · telemetry | Signature interaction: configure, watch traffic re-route, inspect components, simulate an outage |
| 02 | **Architecture** | Sticky isometric layer stack + scrolling chapters | Edge, Compute, Data, Async, Observe, each with a "try this in the console" prompt |
| 03 | **Incident drill** | Scrubbable timeline with latency chart and zone diagram | Ten simulated minutes of a zone failure, second by second |
| 04 | **Plans** | Comparison table with billing toggle | Highlights the plan your console setup fits; one-plan view on mobile |
| 05 | **Migration** | Sticky intro + numbered accordion index | Map → Mirror → Shift → Tune |
| 06 | **Review** | Booking form beside your console summary | Validated demo form that can attach your configuration |

## Brand & positioning

- **Name:** NIMBUS: the cloud that carries weather. Calm, high, always moving.
- **Line:** Your business, in the cloud.
- **Positioning:** infrastructure you can *see*. For growing product teams who have outgrown a single server but don't have a platform team yet.
- **Voice:** precise, plain-spoken, a little dry, like a good runbook. No invented customers, uptime statistics or awards.

## Audience

CTOs, founding engineers and engineering managers at 10–250 person companies choosing where their product should live next.

## Art direction

An engineering console laid over a blueprint, deliberately unlike a glowing "neural" visual: everything is orthogonal, labelled and measured.

- **Palette:** deep `#061A40` (blueprint), sky `#3FA9F5` (structure, requests), white `#F5F9FF` (ink), signal `#2EE59D` (healthy, responses). Amber and coral are reserved for warnings and failures.
- **Texture:** two-scale blueprint grid on the page, CAD corner ticks on every panel, dashed construction lines, isometric plates.
- **Diagram language:** Manhattan-routed links with rounded bends, square request packets, round response packets, dashed replication brackets, instance pips on each node.
- **Logo:** a cloud outline with a circuit trace running through it, from a sky-blue origin node to a signal-green destination, carrying a single white packet. The wordmark is drawn as monoline geometric strokes.

## Typography

- **Display:** Urbanist (500/700/800) for headlines and panel titles.
- **Text & data:** Martian Mono (300/400/500/600) for body copy, labels and every number, so metrics, node names and timings stay legible.
- Fluid sizes with `clamp()`. Headings use `overflow-wrap: normal` and are sized to fit at 360 px.

## Motion language

- **Packets:** requests travel hop by hop along real links; responses return in green, rejections in coral, background jobs in white, replication along dashed brackets.
- **Re-routing:** on any change, nodes glide to their new grid positions, new links draw on from their source, removed links retract, removed nodes fade out.
- **Telemetry:** numbers tween to new values; the p95 sparkline keeps breathing with small, labelled noise.
- **Reveals:** headings and panels wipe in from the left like a plotter pass, instead of fading up.

## Signature interaction — how to use it

1. Load a preset (**Launch**, **Growth**, **Global**) or set things by hand.
2. Drag **Traffic** (100 to 60k requests/second, logarithmic), pick **Regions**, switch **Autoscale**, the **Global edge**, **Managed cache**, **Queue + workers**, and set **Read replicas**.
3. Watch the topology re-route and the telemetry respond. Push traffic past capacity with autoscale off to see rejections and alerts.
4. Press **Simulate zone outage** to take half of the first region's fleet offline and follow the recovery in the event log.
5. Select any component (click, tap or Tab + Enter) to open the inspector. Escape closes it.
6. **This setup fits …** links to the plan table, which highlights the matching plan.

On phones the diagram flips to a top-to-bottom flow with regions side by side.

## Tech

- Static HTML/CSS/ES modules, no build step, no libraries.
- `sim.js`: the illustrative model, topology layout (horizontal and vertical), orthogonal routing and route picking (pure, unit-testable). `console.js`: DOM nodes over a 2D canvas for links and packets, metric tweening, event log, inspector. `sections.js`: architecture story, incident drill, plans, migration, form. `main.js`: bootstrap.
- Hand-written JS ≈ 50 KB.

## Local development

```bash
npx serve .
```

## Accessibility

- Semantic landmarks, one `<h1>`, skip link, visible `:focus-visible`.
- All configuration uses native inputs (ranges with spoken values, radios, checkboxes, buttons). Components are real buttons in traffic-flow order with descriptive labels and status; the inspector is announced through a polite live region and closes with Escape.
- The event log is a polite live region; a hidden route summary describes the current topology.
- The drill has a labelled range input, event jump buttons and a polite event card; the plans table is a real `<table>` with a caption and scoped headers.
- `prefers-reduced-motion`: no packet animation (direction chevrons are drawn instead), nodes snap into place, numbers update instantly, the drill steps event by event, CSS animation is removed.

## Performance

- One canvas, DPR capped at 2 (1.5 on small screens); at most ~320 packets.
- The loop pauses when the console is offscreen or the tab is hidden; with reduced motion it only redraws on change.
- Layout and routing are recomputed from a handful of nodes per frame; no per-frame DOM creation.

## Known limitations

- The model is intentionally simple (queueing approximation, fixed per-instance capacity, flat prices) and exists to teach trade-offs, not to size real systems.
- Region names are generic labels.

## Credit

Designed & built by Saad Bashir — https://www.linkedin.com/in/saadbashirmarketing/
