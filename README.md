# DarkStore — a goods-to-person warehouse simulator

**Try it live: [clayhill.github.io/darkstore](https://clayhill.github.io/darkstore/)**

![Landing page: choose one of the five simulations](docs/screenshots/landing.png)

DarkStore simulates the automated heart of an e-commerce warehouse in your browser. Pick one of five
storage systems and watch robots, operators and orders move through it in real time: totes and bins
fetched from storage, picked at stations, packed, labelled and loaded onto a truck. Every system runs
the same order flow, so you can compare how they behave under the same demand.

## The idea

In a **goods-to-person** warehouse nobody walks the aisles. Machines bring storage units (bins,
totes or whole shelves) to a station, where an operator picks the items into order totes. What sets
the systems apart is how they store goods and fetch them; everything around the storage is the same.

**What every simulation shares**

- **Orders** stream in continuously, are released to a station with a free put-wall slot, and are
  picked to light into order totes. You can run a station yourself in manual mode.
- **Inventory** with SKUs, compartments, reservations and ABC velocity classes; the storage policy
  keeps fast movers in the fastest positions.
- **Inbound:** receipts are decanted at a goods-in station, with optional automatic replenishment.
- **Outbound:** packing stations print GS1 shipping labels, and a truck leaves when full or at its
  cut-off.
- **Control room:** live KPIs, a map of the storage, station status, throughput and utilization
  charts, and bottleneck alerts.
- **GS1 barcodes** on items, storage units and parcels, and a scan box that finds anything by its code.

**The five systems**

| Simulation | System | Storage unit | What moves | Worth watching |
|---|---|---|---|---|
| [**CubeFlow**](https://clayhill.github.io/darkstore/cubeflow.html) | Cube storage AS/RS | Bins stacked in a grid | Robots on top of the grid, digging bins out | Dig ratio, buried fast movers |
| [**PodSwarm**](https://clayhill.github.io/darkstore/podswarm.html) | Pod robots | Shelving pods on the floor | Robots carrying whole pods to stations | Hit rate per pod visit |
| [**RailRunner**](https://clayhill.github.io/darkstore/railrunner.html) | Shuttle AS/RS | Totes in racking | A shuttle per level, a lift per aisle | The lift as the bottleneck |
| [**SkyStack**](https://clayhill.github.io/darkstore/skystack.html) | Stacker crane AS/RS | Totes in high racking | One crane per aisle | Cycle times against FEM 9.851 |
| [**StackPilot**](https://clayhill.github.io/darkstore/stackpilot.html) | Case-handling robots (ACR) | Totes on shelving | Robots collecting batches of totes | Totes per trip, aisle traffic |

The specs behind each system are in [`specs/`](specs/README.txt): `common.txt` holds the rules shared
by every type, and `cube.txt`, `pod.txt`, `shuttle.txt`, `crane.txt` and `acr.txt` describe the five
systems.

## Run

The live version runs at **https://clayhill.github.io/darkstore/** (GitHub Pages, updated on every
push to `main`).

To run it locally, open `index.html` in Safari (or any modern browser). It has no build step, no
dependencies and no network calls, so double-clicking the file works. `index.html` is the landing
page; each simulation has its own page: `cubeflow.html`, `podswarm.html`, `railrunner.html`,
`skystack.html` and `stackpilot.html`.

**In a simulation**

- Drag to pan, scroll or pinch to zoom, **space** to pause, **Esc** to close panels.
- Switch between the **Floor** view, the **Control room** and a **Split** of both; run at 1× to 120×.
- Click robots, machines, storage, stations, pack stations or the dock to inspect them.
- The scan box at the top takes GTINs, SSCCs, GRAIs, storage unit IDs (`B00042`, `POD-0042`,
  `ST00042`), order numbers (`SO-100001`), ASNs, robots (`R03`) and stations (`P01`).
- The **Settings** tab changes policies live, or the scenario (size, fleet, speeds) with a restart.

Optional URL parameters for every simulation page, handy for demos:

| Parameter | Effect |
|---|---|
| `?warm=1800` | Pre-run 1800 simulated seconds before showing the page |
| `&view=floor\|split\|control` | Start in a given view |
| `&xray=1`, `&heat=1` | Turn on X-ray stacks (CubeFlow only) / ABC & heat overlay |

## The shared warehouse in detail

**Order flow.**
1. Orders stream in without waves, either from Poisson auto-intake or entered by hand.
2. Each order is released to the least-loaded pick station that has a free put-wall slot and an empty order tote.
3. Stock is reserved, preferring storage units that are already heading to that station.
4. The operator picks to light. A completed tote rides the takeaway conveyor to a pack station.
5. At the pack station the order is packed and labelled with an SSCC, then conveyed to the dock.
6. The truck leaves when it is full or at the cut-off.

A storage unit that several stations need goes straight from one station to the next.

**Inbound.** Receipts work like an ASN: the inventory system reserves compartment space, topping up
same-SKU compartments first. Those units come to the goods-in station, the operator decants into
them, and they are then stored. Optional min/max auto-replenishment creates receipts automatically.

**Inventory (IMS).** Tracks the item master, storage units with compartments, stock reservations,
decaying pick velocity, and ABC classes (top 20 % / next 30 % / rest). Each system has its own
storage policy, but all of them put fast movers in their fastest positions by default; *nearest* and
*random* policies are there to compare.

**Robot traffic** (CubeFlow, PodSwarm, StackPilot). Routing is direction-aware A* (turns cost time).
Traffic control uses moving-block cell reservations: a robot may only enter cells it has claimed, and
it always claims its braking distance ahead, so only one robot can occupy a cell at a time. To resolve
conflicts and deadlocks, a robot that waits too long re-routes around stopped robots, idle robots are
asked to yield, and a randomised evasive step breaks symmetric stand-offs. Robots run on batteries and
drive to a charger when low.

**Barcodes (GS1).** Items carry a GTIN-13 / EAN-13. Storage units and order totes carry a GRAI
(AI 8003) as a GS1-128 barcode. Shipping labels carry an SSCC (AI 00) in GS1-128, plus a (420) ship-to
postcode and (400) order reference. Check digits use the GS1 mod-10 algorithm. All codes use the
company prefix `9521234`, from the 952 range that GS1 reserves for demonstrations and examples, so
they can never match a real product, asset or shipment.

**Control room.** Every system reports units presented per hour (throughput), order lines per hour,
orders shipped, fleet utilization split into working, waiting, idle and charging, the order cycle
time and the orders in process, plus its own KPIs (see below). Bottleneck alerts flag traffic
hotspots, starved or blocked stations, backorders, tote shortage and low battery.

**Time model.** The simulation advances in fixed 100 ms ticks and also has a small discrete-event
queue. Rendering interpolates between ticks. Speed runs from 1× to 120×; a tick costs well under a
millisecond.

## The five systems in detail

### CubeFlow — cube storage

![Floor view: robots on the grid, pick ports, pack stations and the outbound dock](docs/screenshots/floor.png)

| | |
|---|---|
| ![Control room with KPIs, live grid map, workstation status and trend charts](docs/screenshots/control-room.png) | ![X-ray view of every bin in the grid, coloured by ABC velocity class](docs/screenshots/xray-abc.png) |
| **Control room:** KPIs, live grid map, port status and trends | **X-ray + ABC:** every bin in the grid, coloured by velocity class |
| ![Close-up of robots digging and delivering bins to the pick ports](docs/screenshots/closeup.png) | ![GS1 logistics label with SSCC barcode](docs/screenshots/shipping-label.png) |
| **Close-up:** robots digging (winch depth shown) and pick ports | **Shipping label:** GS1 logistics label with SSCC |

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

**Storage policy.** Bins going back into the grid are slotted by velocity: fast movers go near the
ports, and the slotting avoids burying popular bins. Digging a fast mover out from depth ≥ 4 logs a
*burial penalty*.

**KPIs.** The dig ratio (shuffle moves ÷ productive moves) and burial penalties.

### PodSwarm — pod robots

![PodSwarm floor view: shelving pods in blocks, robots carrying pods to the pick stations](docs/screenshots/pod-floor.png)

| | |
|---|---|
| ![Close-up of pick stations: pods presented to operators, the pocket to pick from lit green](docs/screenshots/pod-closeup.png) | ![PodSwarm control room: hit rate, pod returns, floor map with queue lanes](docs/screenshots/pod-control.png) |
| **Close-up:** pods queue in a lane and are turned to show the operator the right face | **Control room:** hit rate, pod returns and the live floor map |

**Floor & pods.** A floor of 1.2 m cells: storage blocks two cells deep, highways between them, a
queue lane in front of each station and chargers on the back wall. Each pod has four faces of
shelves with fabric bins; one SKU is spread over many pods.

**Robots.** Drive units turn on the spot to change direction (90° in 1.5 s) and lift a pod in 1.5 s.
An empty robot may drive under stored pods (*tunnelling*, can be switched off); a robot carrying a pod
keeps to highways and empty cells.

**Stations.** A pod joins its station's queue lane and moves up in order. At the station the robot
turns the pod so the face with the next pick points at the operator; the lines are sorted by face so the
pod turns as little as possible. Lines that arrive for the same station while a pod is there are picked
without it leaving.

**Storage policy.** A pod goes back to a free cell, not necessarily its old one. With the default
velocity policy, busy pods end up near the stations.

**KPIs.** The hit rate (order lines picked per pod presentation) and pod returns.

### RailRunner — shuttle AS/RS

![RailRunner: see-through racking with a shuttle on every level, lifts at the aisle fronts and stations in front](docs/screenshots/rail-floor.png)

| | |
|---|---|
| ![Close-up of the aisle fronts: shuttles carrying totes, lifts and the pick stations](docs/screenshots/rail-closeup.png) | ![RailRunner control room: lift utilization, shuttle cycles and a levels-by-aisles map](docs/screenshots/rail-control.png) |
| **Close-up:** shuttles bring totes to the aisle front, lifts take them down to the stations | **Control room:** lift utilization, shuttle cycles and a map of every level of every aisle |

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

**KPIs.** Lift utilization (the lift is usually the bottleneck of a shuttle aisle) and shuttle cycles
per hour. Not modelled yet: roaming shuttles, double-deep storage and putting totes in sequence on the
conveyor.

### SkyStack — stacker crane AS/RS

![SkyStack: high see-through racking with a stacker crane in each aisle and the stations in front](docs/screenshots/sky-floor.png)

| | |
|---|---|
| ![Close-up of the cranes: masts on floor rails, carriages carrying totes](docs/screenshots/sky-closeup.png) | ![SkyStack control room: crane cycles, cycle time against the FEM 9.851 reference, I/O queues](docs/screenshots/sky-control.png) |
| **Close-up:** each crane moves along the aisle and up the mast at the same time | **Control room:** crane cycles, cycle time next to the FEM 9.851 reference and I/O queues |

SkyStack uses the same racking, storage policy and conveyor as RailRunner, with one stacker crane per
aisle instead of shuttles and lifts.

**Crane.** The crane drives along a floor rail while its carriage moves up or down the mast, each with
its own speed and acceleration, so a trip takes the longer of the two. After arriving it settles,
then the forks go out for a fixed fork cycle per tote. The load handler holds two totes.

**Cycles.** Every cycle starts and ends at the I/O point in front of the aisle. Returning totes wait
on the infeed. A single command stores or retrieves; a dual command stores first and then retrieves
on the way back. With two totes on the handler a cycle can do two stores and two retrievals. Stores
are visited in the order that keeps the crane moving least; retrievals are chosen by crane time from
where the last store left the crane, with a head start for totes that have waited.

**Storage policy.** Positions are ranked by crane time from the I/O point, so the fastest positions
form a rectangle low and close to the front. With the velocity policy, A items go to the fastest
positions, then B, then C, in the aisle with the least work.

**KPIs.** Crane cycles per hour and the share of dual commands, the mean single and dual cycle time
next to the FEM 9.851 reference cycles for the rack, and the I/O queues. Set the load handler to one
tote for a like-for-like comparison with FEM; with the velocity policy the measured cycles come out
shorter than the reference, which assumes random locations. Not modelled yet: double-deep storage,
aisle-changing cranes and a limit on the I/O conveyor.

### StackPilot — case-handling robots

![StackPilot: shelving aisles with case-handling robots, queue lanes and stations in front](docs/screenshots/acr-floor.png)

| | |
|---|---|
| ![Close-up of the robots: masts with back shelves carrying totes, handlers reaching into the racking](docs/screenshots/acr-closeup.png) | ![StackPilot control room: totes per trip, trip time split, aisle waits and the floor map](docs/screenshots/acr-control.png) |
| **Close-up:** robots carry several totes on their back shelves; the handler runs up the mast at each stop | **Control room:** totes per trip, the fleet's time split, aisle waits and the live floor map |

StackPilot stores totes in racking like RailRunner and SkyStack, but its machines are battery robots
on a floor grid, with the same routing and charging as PodSwarm.

**Floor.** Aisles one robot wide between single-deep shelving, a cross aisle two cells wide behind and
in front of the racking, a corridor and a column of parking spots and chargers on the right. Each
station has a short queue lane and a handover point; a conveyor carries totes from there into the
station, and a return conveyor brings them back out.

**Robot.** A drive unit with a mast, a tote handler and a column of back shelves (8 by default). The
robot only lifts or handles a tote while standing still, and blocks its aisle cell meanwhile. At a
stop the handler runs up the mast at mast speed, takes or puts a tote (8 s) and comes back down.

**Trips.** A trip loads the totes waiting on a station's return conveyor, stores them in free
positions near the trip's retrievals, takes up to a shelf-full of totes that one station needs (the
most urgent first, then the ones closest to it) and hands them over at that station, 2 s per tote. A
trip waits for at least 4 totes unless the oldest has waited 25 s. No more robots head for a station
than its lane holds, so a queue never spills into the cross aisle; a robot with a batch waits at its
last stop until there is room.

**Aisle traffic.** A setting, to compare: with aisle locking (the default) a trip holds its aisles
from planning until it has left them, and other robots drive around them; with one-way aisles,
neighbouring aisles run in opposite directions and robots queue behind one that is handling a tote.
With the default layout locking gives shorter trips and more throughput (about 600 against 480
order lines per hour).

**Storage policy.** Positions are ranked low first, then near the front and in the aisles nearest a
station. With the velocity policy fast movers go to the fastest positions, close to the trip.

**KPIs.** Totes per trip (retrieved and stored) and how full the back shelves are, the trip time and
how the fleet's working time splits into driving, mast travel, handling, handover and waiting, and
aisle waits. A robot needs minutes to bring a batch, so each station keeps 12 orders open on a wide
put wall. Not modelled yet: double-deep storage and robots that climb the racking.

## Development

```
index.html, css/landing.css, js/landing/   landing page and simulation previews
cubeflow.html, podswarm.html, railrunner.html, skystack.html, stackpilot.html
            one line each: js/boot.js builds the shared page for that type and
            loads its scripts; css/style.css styles it
js/core/    util (RNG, heap), barcode (GS1 encoders), config (shared defaults)
js/sim/     shared engine: inventory (IMS), router (fleet manager), mover (fleet member base),
            robot (battery robot state machine, shared tasks such as driving through a
            station's queue lane), floor (cells, traffic heat and queue lanes of every robot
            floor), machine (shuttles, lifts, cranes), ports, orders (OMS, packing, dock),
            kpi, sim (loop, layout), rack (tote slots, seeding and conveyors of every racking
            type), prezone (racking with the stations in front of the aisles, pre-zone conveyor
            paths and putaway: RailRunner and SkyStack)
js/render/  iso (shared isometric view: camera, input, primitives, robot overlays), stations
            (warehouse floor, stations, packing, dock), control (SCADA map + charts),
            rack (see-through racking), prezone (pre-zone conveyor, levels × aisles picking)
js/ui/      ui (panels, inspector, labels, scanning), rack (rack inspector for both rack types)
js/cube/    CubeFlow: config, grid, tasks (dig, store, restack), sim (seeding, dispatch,
            slotting), render, ui (KPI tiles, settings, stack inspector)
js/pod/     PodSwarm: config, floor, sim (dispatch, tasks, pod faces), render, ui
js/shuttle/ RailRunner: config, sim (shuttles, lifts, dispatch), render, ui
js/crane/   SkyStack: config, sim (crane cycles, crane-time storage policy, FEM 9.851), render, ui
js/acr/     StackPilot: config, sim (floor, trips, batching, aisle locking), render, ui
test/run.js headless soak test with invariant checks:  node test/run.js [hours] [seed] [cube|pod|shuttle|crane|acr]
test/golden.js  regression check (npm test): runs every type for 2 h, seed 7, plus a few
            non-default settings (nearest putaway, no tunnelling, one-tote crane handler,
            one-way aisles), and compares a fingerprint of stock, fleet, orders and KPIs
            with test/golden/<run>.txt
```

A refactor must leave `npm test` passing. A change that is meant to alter behaviour updates the
golden files with `node test/golden.js --update`, and the diff of those files goes in the same commit.

## Disclaimer

DarkStore is a simulation and teaching tool. It is not control software for real robots or storage
systems, and it must not be used as such. It is inspired by cube-storage, pod-robot, shuttle, stacker
crane and case-handling robot systems in general and is not affiliated with, endorsed by or derived
from any vendor of such systems. All company names, addresses, products and barcodes in the
simulation are fictional.

## License

Licensed under the [Apache License, Version 2.0](LICENSE). Unless required by applicable law or agreed
to in writing, the software is distributed on an "AS IS" basis, without warranties or conditions of
any kind.
