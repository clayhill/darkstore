# DarkStore — a goods-to-person warehouse simulator

A browser simulator for goods-to-person warehouse automation. Each type of system has its own
simulation and name:

- **CubeFlow**: cube storage, a grid-based AS/RS where bins are stacked and robots dig from above.
- **PodSwarm**: pod robots that lift shelving units off the floor and carry them to stations.
- **RailRunner**: a shuttle AS/RS with a shuttle on every rack level and a lift per aisle.

The specs are in [`specs/`](specs/README.txt). `common.txt` holds the rules shared by every storage
type, and `cube.txt`, `pod.txt` and `shuttle.txt` describe the three types implemented here. Specs for
ACR and stacker crane systems are written but not implemented yet.

### CubeFlow

![Floor view: robots on the grid, pick ports, pack stations and the outbound dock](docs/screenshots/floor.png)

| | |
|---|---|
| ![Control room with KPIs, live grid map, workstation status and trend charts](docs/screenshots/control-room.png) | ![X-ray view of every bin in the grid, coloured by ABC velocity class](docs/screenshots/xray-abc.png) |
| **Control room:** KPIs, live grid map, port status and trends | **X-ray + ABC:** every bin in the grid, coloured by velocity class |
| ![Close-up of robots digging and delivering bins to the pick ports](docs/screenshots/closeup.png) | ![GS1 logistics label with SSCC barcode](docs/screenshots/shipping-label.png) |
| **Close-up:** robots digging (winch depth shown) and pick ports | **Shipping label:** GS1 logistics label with SSCC |

### PodSwarm

![PodSwarm floor view: shelving pods in blocks, robots carrying pods to the pick stations](docs/screenshots/pod-floor.png)

| | |
|---|---|
| ![Close-up of pick stations: pods presented to operators, the pocket to pick from lit green](docs/screenshots/pod-closeup.png) | ![PodSwarm control room: hit rate, pod returns, floor map with queue lanes](docs/screenshots/pod-control.png) |
| **Close-up:** pods queue in a lane and are turned to show the operator the right face | **Control room:** hit rate, pod returns and the live floor map |

### RailRunner

![RailRunner: see-through racking with a shuttle on every level, lifts at the aisle fronts and stations in front](docs/screenshots/rail-floor.png)

| | |
|---|---|
| ![Close-up of the aisle fronts: shuttles carrying totes, lifts and the pick stations](docs/screenshots/rail-closeup.png) | ![RailRunner control room: lift utilization, shuttle cycles and a levels-by-aisles map](docs/screenshots/rail-control.png) |
| **Close-up:** shuttles bring totes to the aisle front, lifts take them down to the stations | **Control room:** lift utilization, shuttle cycles and a map of every level of every aisle |

## Run

Open `index.html` in Safari (or any modern browser). It has no build step, no
dependencies and no network calls, so double-clicking the file works.

`index.html` is the landing page, where you choose a simulation. Each warehouse type has its own
name and page: **CubeFlow** at `cubeflow.html`, **PodSwarm** at `podswarm.html` and **RailRunner** at
`railrunner.html`.

![Landing page with the simulation cards](docs/screenshots/landing.png)

Optional URL parameters for both simulation pages (handy for demos):

| Parameter | Effect |
|---|---|
| `?warm=1800` | Pre-run 1800 simulated seconds before showing the page |
| `&view=floor\|split\|control` | Start in a given view |
| `&xray=1`, `&heat=1` | Turn on X-ray stacks (CubeFlow only) / ABC & heat overlay |

Controls: drag to pan, scroll or pinch to zoom, **space** to pause, **Esc** to
close panels. Click robots, grid cells, pods, ports, pack stations or the dock to inspect them.
The scan box at the top takes GTINs, SSCCs, bin/pod/tote GRAIs, bin and pod IDs (`B00042`, `POD-0042`),
order numbers (`SO-100001`), ASNs, robots (`R03`) and ports (`P01`).

## What is modelled: CubeFlow

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

## What is modelled: PodSwarm

PodSwarm shares the order flow, inbound, inventory, put wall, packing, dock, barcodes and control
room with CubeFlow. What differs:

**Floor & pods.** A floor of 1.2 m cells: storage blocks two cells deep, highways between them, a
queue lane in front of each station and chargers on the back wall. Each pod has four faces of
shelves with fabric bins; one SKU is spread over many pods.

**Robots.** Drive units turn on the spot to change direction (90° in 1.5 s) and lift a pod in 1.5 s.
An empty robot may drive under stored pods (*tunnelling*, can be switched off); a robot carrying a pod
keeps to highways and empty cells. Traffic control is the same moving-block reservation and A* as in
CubeFlow.

**Stations.** A pod joins its station's queue lane and moves up in order. At the station the robot
turns the pod so the face with the next pick points at the operator; the lines are sorted by face so the
pod turns as little as possible. Lines that arrive for the same station while a pod is there are picked
without it leaving.

**Storage policy.** A pod goes back to a free cell, not necessarily its old one. With the default
velocity policy, busy pods end up near the stations; *nearest* and *random* are there to compare.

**KPIs.** Instead of dig ratio and burial penalties, PodSwarm reports the hit rate (order lines picked
per pod presentation) and pod returns.

## What is modelled: RailRunner

RailRunner shares the order flow, inbound, inventory, stations, packing, dock, barcodes and control
room with the other two. Instead of robots it has fixed machines on rails.

**Racking.** Aisles of racking with totes single deep on both sides, several levels high. The two
front bays of each level are buffers: outbound on the left, inbound on the right.

**Shuttles and lifts.** Every level of every aisle has its own shuttle. It drives to a tote, pulls it
with its load handler, drives to the aisle front and drops it in the level's outbound buffer, waiting
if the buffer is full. The aisle's lift collects totes from the buffers and brings them down to the
pre-zone conveyor; on the way back it carries returning totes up to an inbound buffer, and it combines
a put-away and a retrieval on the same level when it can. Travel uses acceleration and braking for
both.

**Conveyor and storage policy.** The conveyor carries totes from the aisles to the stations and back.
A returning tote goes to the aisle and level with the least work queued; with the velocity policy,
fast movers are stored near the aisle front.

**KPIs.** RailRunner reports lift utilization (the lift is usually the bottleneck of a shuttle aisle)
and shuttle cycles per hour. Not modelled yet: roaming shuttles, double-deep storage and putting totes
in sequence on the conveyor.

## Time model

The simulation advances in fixed 100 ms ticks and also has a small discrete-event queue. Rendering
interpolates between ticks. Speed runs from 1× to 120×. A tick costs about 0.07 ms
with the default 16 robots.

## Files

```
index.html, css/landing.css, js/landing/   landing page and simulation previews
cubeflow.html, podswarm.html, railrunner.html, css/style.css
                                            simulator pages
js/core/    util (RNG, heap), barcode (GS1 encoders), config (shared defaults)
js/sim/     shared engine: inventory (IMS), router (fleet manager), robot (state machine,
            shared tasks), machine (shuttles, lifts), ports, orders (OMS, packing, dock),
            kpi, sim (loop, layout)
js/render/  iso (shared isometric view: stations, packing, dock), control (SCADA map + charts)
js/ui/      ui (panels, inspector, labels, scanning)
js/cube/    CubeFlow: config, grid, tasks (dig, store, restack), sim (seeding, dispatch,
            slotting), render, ui (KPI tiles, settings, stack inspector)
js/pod/     PodSwarm: config, floor, sim (dispatch, tasks, pod faces), render, ui
js/shuttle/ RailRunner: config, sim (racking, shuttles, lifts, conveyor), render, ui
test/run.js headless soak test with invariant checks:  node test/run.js [hours] [seed] [cube|pod|shuttle]
```

## Disclaimer

DarkStore is a simulation and teaching tool. It is not control software for real robots or storage
systems, and it must not be used as such. It is inspired by cube-storage AS/RS, pod-robot and shuttle
systems in general and is not affiliated with, endorsed by or derived from any vendor of such systems. All
company names, addresses, products and barcodes in the simulation are fictional.

## License

Licensed under the [Apache License, Version 2.0](LICENSE). Unless required by applicable law or agreed
to in writing, the software is distributed on an "AS IS" basis, without warranties or conditions of
any kind.
