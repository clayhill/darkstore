# CubeFlow — Cube AS/RS warehouse simulator

A browser simulation of a grid-based (cube storage) automated storage and retrieval
system. The specs are in [`specs/`](specs/README.txt): `common.txt` holds the rules shared by
every storage type and `cube.txt` describes the type implemented here. Specs for shuttle, pod,
ACR and stacker crane systems are written but not implemented yet.

![Floor view: robots on the grid, pick ports, pack stations and the outbound dock](docs/screenshots/floor.png)

| | |
|---|---|
| ![Control room with KPIs, live grid map, workstation status and trend charts](docs/screenshots/control-room.png) | ![X-ray view of every bin in the grid, coloured by ABC velocity class](docs/screenshots/xray-abc.png) |
| **Control room:** KPIs, live grid map, port status and trends | **X-ray + ABC:** every bin in the grid, coloured by velocity class |
| ![Close-up of robots digging and delivering bins to the pick ports](docs/screenshots/closeup.png) | ![GS1 logistics label with SSCC barcode](docs/screenshots/shipping-label.png) |
| **Close-up:** robots digging (winch depth shown) and pick ports | **Shipping label:** GS1 logistics label with SSCC |

## Run

Open `index.html` in Safari (or any modern browser). It has no build step, no
dependencies and no network calls, so double-clicking the file works.

Optional URL parameters (handy for demos):

| Parameter | Effect |
|---|---|
| `?warm=1800` | Pre-run 1800 simulated seconds before showing the page |
| `&view=floor\|split\|control` | Start in a given view |
| `&xray=1`, `&heat=1` | Turn on X-ray stacks / ABC & heat overlay |

Controls: drag to pan, scroll or pinch to zoom, **space** to pause, **Esc** to
close panels. Click robots, grid cells, ports, pack stations or the dock to inspect them.
The scan box at the top takes GTINs, SSCCs, bin/tote GRAIs, bin IDs (`B00042`),
order numbers (`SO-100001`), ASNs, robots (`R03`) and ports (`P01`).

## What is modelled

**Grid & robots.** A `[X][Y][Z]` matrix of bin stacks with chargers on the back edge,
conveyor pick ports on the front face and a goods-in (decant) port on the right face.
Robots run only in straight X/Y lines and stop to change wheel sets (a pneumatic track change, 0.7 s)
instead of turning. Motion uses trapezoidal acceleration and braking. Winch speed depends
on the bin's weight, gripper latching is timed, and battery drain depends on the activity.

**Dig & retrieve.** To reach a buried bin, the robot lifts each blocker, sets it on the
least harmful neighbouring stack, and returns. While a robot's winch is down, its cell is a hard
obstacle for the rest of the fleet. Under the default *consolidate* policy, a low-priority
restack task later returns the blockers to the origin column in their original order. The
*leave* policy skips that step and lets the grid self-sort.

**Fleet manager.** Routing is direction-aware A* (turns cost time). Traffic control uses moving-block
cell reservations: a robot may only enter cells it has claimed, and it always claims its braking
distance ahead, so only one robot can occupy a cell at a time. To resolve conflicts and deadlocks, a robot
that waits too long re-routes around stopped robots, idle robots are asked to yield,
and a randomised evasive step breaks symmetric stand-offs.

**Inventory (IMS).** Tracks the item master, bins with 1/2/4 compartments, stock
reservations, decaying pick velocity, and ABC classes (top 20 % / next 30 % / rest). Bins
going back into the grid are slotted by velocity: fast movers go near the ports, and the slotting avoids
burying popular bins. Digging a fast mover out from depth ≥ 4 logs a *burial penalty*.

**Order flow.**
1. Orders stream in without waves, either from Poisson auto-intake or entered by hand.
2. Each order is released to the least-loaded pick port that has a free put-wall slot and an empty order tote.
3. Stock is reserved, preferring bins that are already heading to that port.
4. The operator picks to light. A completed tote rides the takeaway conveyor to a pack station.
5. At the pack station the order is packed and labelled with an SSCC, then conveyed to the dock.
6. The truck leaves when it is full or at the cut-off.

Bins that several ports need are routed straight from one port to the next.

**Inbound.** Receipts work like an ASN: the IMS reserves compartment space, topping up same-SKU
compartments first. Those bins come to the goods-in port, the operator decants into them, and they are then stored.
Optional min/max auto-replenishment creates receipts automatically.

**Barcodes (GS1).** Items carry a GTIN-13 / EAN-13. Storage bins and order totes carry a GRAI
(AI 8003) as a GS1-128 barcode. Shipping labels carry an SSCC (AI 00) in GS1-128, plus a (420) ship-to
postcode and (400) order reference. Check digits use the GS1 mod-10 algorithm. All codes use the
company prefix `9521234`, from the 952 range that GS1 reserves for demonstrations and examples, so
they can never match a real product, asset or shipment.

**KPIs.** The control room reports these:
- bins presented per hour (throughput) and order lines per hour
- robot utilization, split into working, waiting, idle and charging
- dig ratio (shuffle moves ÷ productive moves)
- burial penalties
- order cycle time

It also raises bottleneck alerts: traffic hotspots, starved or blocked ports, backorders, tote
shortage and low battery.

## Time model

The simulation advances in fixed 100 ms ticks and also has a small discrete-event queue. Rendering
interpolates between ticks. Speed runs from 1× to 120×. A tick costs about 0.07 ms
with the default 16 robots.

## Files

```
index.html, css/style.css
js/core/    util (RNG, heap), barcode (GS1 encoders), config (defaults)
js/sim/     grid, inventory (IMS), router (fleet manager), robot (state machine + tasks),
            ports, orders (OMS, packing, dock), kpi, sim (loop, dispatcher, layout)
js/render/  iso (isometric floor), control (SCADA map + charts)
js/ui/      ui (panels, inspector, labels, scanning)
test/run.js headless soak test with invariant checks:  node test/run.js [hours] [seed]
```

## Disclaimer

CubeFlow is a simulation and teaching tool. It is not control software for real robots or storage
systems, and it must not be used as such. It is inspired by cube-storage AS/RS systems in general and
is not affiliated with, endorsed by or derived from any vendor of such systems. All company names,
addresses, products and barcodes in the simulation are fictional.

## License

Licensed under the [Apache License, Version 2.0](LICENSE). Unless required by applicable law or agreed
to in writing, the software is distributed on an "AS IS" basis, without warranties or conditions of
any kind.
