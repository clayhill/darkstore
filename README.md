# DarkStore — a warehouse automation simulator

**Try it live: [clayhill.github.io/darkstore](https://clayhill.github.io/darkstore/)**

![Landing page: choose one of the seven simulations](docs/screenshots/landing.png)

DarkStore simulates the automated heart of an e-commerce warehouse in your browser. Pick one of seven
systems and watch robots, operators and orders move through it in real time: totes and bins
fetched from storage, picked at stations, packed, labelled and loaded onto a truck. Every system runs
the same order flow, so you can compare how they behave under the same demand.

## The idea

In a **goods-to-person** warehouse nobody walks the aisles. Machines bring storage units (bins,
totes or whole shelves) to a station, where an operator picks the items into order totes. What sets
the systems apart is how they store goods and fetch them; everything around the storage is the same.
Five of the seven systems work this way. AisleMate is the common first step towards it: people
still pick from ordinary shelving, and robots carry the order totes to them. SortHub is not a store
at all but a parcel sorter, the kind of hub parcels go through after the warehouse.

**What every simulation shares**

- **Orders** stream in continuously, are released to a station with a free put-wall slot, and are
  picked to light into order totes. You can run a station yourself in manual mode.
- **Inventory** with SKUs, compartments, reservations and ABC velocity classes; the storage policy
  keeps fast movers in the fastest positions.
- **Inbound:** receipts are decanted at a goods-in station, with optional automatic replenishment.
- **Outbound:** pack stations print GS1 shipping labels, and a truck leaves when full or at its
  cut-off. Optional packing machines (auto-baggers and box-making machines) work next to the manual
  benches.
- **Control room:** live KPIs, a map of the storage, station status, throughput and utilization
  charts, and bottleneck alerts.
- **GS1 barcodes** on items, storage units and parcels, and a scan box that finds anything by its code.

**The seven systems**

| Simulation | System | Storage unit | What moves | Worth watching |
|---|---|---|---|---|
| [**CubeFlow**](https://clayhill.github.io/darkstore/cubeflow.html) | Cube storage AS/RS | Bins stacked in a grid | Robots on top of the grid, digging bins out | Dig ratio, buried fast movers |
| [**PodSwarm**](https://clayhill.github.io/darkstore/podswarm.html) | Pod robots | Shelving pods on the floor | Robots carrying whole pods to stations | Hit rate per pod visit |
| [**RailRunner**](https://clayhill.github.io/darkstore/railrunner.html) | Shuttle AS/RS | Totes in racking | A shuttle per level, a lift per aisle | The lift as the bottleneck |
| [**SkyStack**](https://clayhill.github.io/darkstore/skystack.html) | Stacker crane AS/RS | Totes in high racking | One crane per aisle | Cycle times against FEM 9.851 |
| [**StackPilot**](https://clayhill.github.io/darkstore/stackpilot.html) | Case-handling robots (ACR) | Totes on shelving | Robots collecting batches of totes | Totes per trip, aisle traffic |
| [**AisleMate**](https://clayhill.github.io/darkstore/aislemate.html) | Robots alongside pickers (collaborative AMRs) | Goods on ordinary shelving | Robots with order totes, pickers walking to them | Robot waits for pickers, picker utilization |
| [**SortHub**](https://clayhill.github.io/darkstore/sorthub.html) | Parcel sorter: robot sorter or tilt-tray loop | Parcels, sorted into bags | Small robots on a deck, or trays round a loop | Recirculation, chutes and bag changes, tray against robot |

The specs behind each system are in [`specs/`](specs/README.txt): `common.txt` holds the rules shared
by every type, and `cube.txt`, `pod.txt`, `shuttle.txt`, `crane.txt`, `acr.txt`, `amr.txt` and
`sort.txt` describe the seven systems.

## Run

The live version runs at **https://clayhill.github.io/darkstore/** (GitHub Pages, updated on every
push to `main`).

To run it locally, open `index.html` in Safari (or any modern browser). It has no build step and no
dependencies, so double-clicking the file works. Only the 3D view needs a network connection: it loads
three.js from a CDN the first time it is opened. `index.html` is the landing
page; each simulation has its own page: `cubeflow.html`, `podswarm.html`, `railrunner.html`,
`skystack.html`, `stackpilot.html`, `aislemate.html` and `sorthub.html`.

**In a simulation**

- Drag to pan, scroll or pinch to zoom, **Shift-drag** (or right-drag) to tilt the view from almost level
  to nearly top-down, **space** to pause, **Esc** to close panels.
- Switch between the **Floor** view, the **Control room** and a **Split** of both; run at 1× to 120×.
- Click robots, machines, storage, stations, pack stations or the dock to inspect them.
- **3D**: a free 3D view of the whole warehouse, in all seven systems. Drag to
  orbit, right-drag or Shift-drag to pan, scroll to zoom, **WASD** or the arrow keys to move and
  **Q**/**E** to turn. **Walk** puts you on the floor at eye height (drag to look around, Shift to
  go faster). Double-click a robot, shuttle or crane to follow it; **Esc** or panning lets it go. In the
  racking systems the **Levels** slider works in 3D too; X-ray works in CubeFlow's 3D view. The
  warehouse stands in a hall with windows, columns and roof lamps. The walls on your side drop to a
  kerb so you can see in. **Lights out** switches the hall lights off: the robots keep working in the
  dark, and only the stations, packing and the dock stay lit. The **Camera** menu rides along: **Robot
  cam** sits on the front of a robot and looks where it drives (across the grid top, under a pod, on a
  crane's carriage), **Chase** follows just behind one, **Stations** visits the work places, **Orbit**
  turns slowly round the warehouse, and **Ambient tour** cycles through them all like a screensaver.
  **N** picks the next robot or station; any drag, scroll or key gives the camera back. Up close the
  machines behave like real ones: status lights fade between states and breathe while a robot waits,
  a crane's mast sways after braking (the forks wait for it to settle), PodSwarm pods rock when their
  robot starts, stops or turns, and cranes, shuttles and lifts ramp their speed up and down smoothly.
- **Sound** (off by default) is made live from what the machines do, with no sound files: motors
  humming with their speed, a chirp as a machine sets off, the clunk of forks and pod lifts, a
  CubeFlow winch, rollers as a storage unit reaches a station, the scanner beep of every pick, tape at
  the pack bench, parcels sliding into their chute. It is louder near where you look and panned left
  or right; at high speed the single sounds give way to the hum of the whole fleet.
- **ABC & heat** colours storage by velocity class and shows traffic heat. CubeFlow's **X-ray** shows
  every buried bin; in the three racking systems the **Levels** slider cuts the racking away above
  a level (or shows one level only), so you can check level by level where the fast movers sit.
- **Solid racking** (racking systems): by default the racking is see-through and the machines are
  drawn on top; solid racking hides machines behind the shelves, like the real thing. Tilt the view
  down to look into the aisles. Cranes, shuttles and robots slide each tote in and out of its rack
  position with their forks or arms.
- The scan box at the top takes GTINs, SSCCs, GRAIs, storage unit IDs (`B00042`, `POD-0042`,
  `ST00042`), order numbers (`SO-100001`), ASNs, robots (`R03`) and stations (`P01`).
- The **Settings** tab changes policies live, or the scenario (size, fleet, speeds) with a restart.

Optional URL parameters for every simulation page, handy for demos:

| Parameter | Effect |
|---|---|
| `?warm=1800` | Pre-run 1800 simulated seconds before showing the page |
| `&view=floor\|split\|control\|3d` | Start in a given view |
| `&xray=1`, `&heat=1` | Turn on X-ray stacks (CubeFlow only) / ABC & heat overlay |
| `&cut=3`, `&only=1` | Racking types: show levels 1–3 / only level 3 |
| `&solid=1` | Racking types: solid racking |
| `&tilt=60` | View elevation in degrees (default 30) |

## The shared warehouse in detail

**Order flow.**
1. Orders stream in without waves, either from Poisson auto-intake or entered by hand.
2. Each order is released to the least-loaded pick station that has a free put-wall slot and an empty order tote
   on its stack. Every pick station keeps empty totes nested on a dolly. The operator puts one in the slot
   before the first pick, and emptied totes come back from packing to the station with the fewest.
3. Stock is reserved, preferring storage units that are already heading to that station.
4. The operator picks to light. A completed tote rides the takeaway conveyor to a pack station.
5. At the pack station the order is packed and labelled with an SSCC, then conveyed to the dock.
6. The truck leaves when it is full or at the cut-off.

**Packing.** Manual pack benches take any order (18 s plus 4 s per unit by default). Settings add
packing machines beside them, each with an operator who feeds it:

- An **auto-bagger** takes small, light orders (up to 3 units, 4 L and 2 kg): the operator drops the
  items in and the machine bags, seals and labels them (6 s plus 2.5 s per unit). Bags travel to the
  dock as bags.
- A **box-making machine** takes orders up to 10 units and 30 L: the operator lays the items on the
  infeed and the machine cuts a carton to size around them, closes and labels it (9 s plus 1.5 s per
  unit).

Each completed tote goes to the station it fits that will be done with it first: the work queued
there times its time for this order. With machines on, the control room shows the share of orders
packed by machine. A *Packing backlog* alert fires when more than four totes per pack station are
waiting. At 550 orders per hour, adding one machine to the three benches lifts AisleMate from about
340 to 440 orders shipped per hour.

A storage unit that several stations need goes straight from one station to the next.

**Robot arm picking** (CubeFlow, PodSwarm, RailRunner, SkyStack, StackPilot). Settings can turn
the first pick stations into robot pick stations: a SCARA-style arm stands where the operator would
and picks each unit from the storage unit into its order tote (4.5 s per unit, against about 5 s for
a person at one unit). It tries once more when a grasp fails. Whether it can grip an item is a
property of the product: items over 1.5 kg and soft or bagged ones (about 1 in 20) it cannot grip,
shiny or awkward ones (1 in 5) it grasps 80 % of the time, the rest 98 %. When it cannot, an
operator comes over (20 s) and picks by hand. Two ways to handle those items: *assist*, where any
order may go to an arm station and about one unit in five then needs the operator; or *route*,
where orders with an item the arm cannot grip are released only to manual stations, and the
operator is needed for about one unit in a hundred. The control room shows the share of units the
arms picked.

**Inbound.** Receipts work like an ASN: the inventory system reserves compartment space, topping up
same-SKU compartments first. Those units come to the goods-in station, the operator decants into
them, and they are then stored. Optional min/max auto-replenishment creates receipts automatically.

**Automated decanting** (the same five systems). Settings can turn the first goods-in stations into
robotic decanting cells: a case opener cuts each supplier carton open and an arm carries it over the
storage unit and tips the goods into the compartment (6 s per carton plus 0.2 s per unit, against
2 s plus 1.6 s per unit by hand). Fragile, loose or heavy items (about 1 in 8 products, from a fixed
property of the product) an operator comes over and decants by hand. In the default scenarios a cell
needs about 40 % less station time per received unit; the control room shows the share of receipt
lines the cells tipped.

**Inventory (IMS).** Tracks the item master, storage units with compartments, stock reservations,
decaying pick velocity, and ABC classes (top 20 % / next 30 % / rest). Each system has its own
storage policy, but all of them put fast movers in their fastest positions by default; *nearest* and
*random* policies are there to compare.

**Robot traffic** (CubeFlow, PodSwarm, StackPilot, AisleMate, SortHub's robot sorter). Routing is direction-aware A* (turns cost time).
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

## The seven systems in detail

### CubeFlow — cube storage

![Floor view: robots on the grid, pick ports, pack stations and the outbound dock](docs/screenshots/floor.png)

| | |
|---|---|
| ![Control room with KPIs, live grid map, workstation status and trend charts](docs/screenshots/control-room.png) | ![X-ray view of every bin in the grid, coloured by ABC velocity class](docs/screenshots/xray-abc.png) |
| **Control room:** KPIs, live grid map, port status and trends | **X-ray + ABC:** every bin in the grid, coloured by velocity class |
| ![Close-up of robots digging and delivering bins to the pick ports](docs/screenshots/closeup.png) | ![GS1 logistics label with SSCC barcode](docs/screenshots/shipping-label.png) |
| **Close-up:** robots digging (winch depth shown) and pick ports | **Shipping label:** GS1 logistics label with SSCC |
| ![CubeFlow in 3D: the aluminium grid with every bin, robots on the rails and the pick ports](docs/screenshots/cube-3d.png) | ![Close-up in 3D: robots on the grid top, one lowering its winch into a stack](docs/screenshots/cube-3d-closeup.png) |
| **3D:** the grid with every bin, robots on the rails, ports and packing | **3D close-up:** robots on the rails; winch tapes go down into the stacks |

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
| ![PodSwarm in 3D: shelving pods, drive units and the pick stations](docs/screenshots/pod-3d.png) | ![Close-up in 3D: a pick station with two presentation points, the operator between them](docs/screenshots/pod-3d-closeup.png) |
| **3D:** pods in their blocks, robots carrying pods to the stations | **3D close-up:** a station with two presentation points and the light curtain |

**Floor & pods.** A floor of 1.2 m cells: storage blocks two cells deep, highways between them, a
two presentation points with their queue lanes at each station and chargers on the back wall. Each pod has four faces of
shelves with fabric bins; one SKU is spread over many pods.

**Robots.** Drive units turn on the spot to change direction (90° in 1.5 s) and lift a pod in 1.5 s.
An empty robot may drive under stored pods (*tunnelling*, can be switched off); a robot carrying a pod
keeps to highways and empty cells.

**Stations.** Each station has two presentation points with the operator standing between them,
each fed by its own short queue lane from one side. While the operator works the pod at one point, the
next pod is already standing at the other, so there is no gap while a robot drives off and the next one
moves up. In the simulation this gap cost about a third of each station's time with one point.
*Presentation points per station* in the settings switches back to one point with a single lane.
A pod joins the lane of the point fewer robots are heading for and moves up in order. At the station the robot
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
| ![RailRunner in 3D: racking with a shuttle on every level, lift towers and the stations](docs/screenshots/rail-3d.png) | ![Close-up in 3D: lift platforms at the aisle fronts and the one-way pre-zone loop to the stations](docs/screenshots/rail-3d-closeup.png) |
| **3D:** the racking, cyan lift towers at the aisle fronts and the stations | **3D close-up:** orange shuttles on every level, a lift and the conveyors |

**Racking.** Aisles of racking with totes single deep on both sides, several levels high. The two
front bays of each level are buffers: outbound on the left, inbound on the right.

**Shuttles and lifts.** Every level of every aisle has its own shuttle. It drives to a tote, pulls it
with its load handler, drives to the aisle front and drops it in the level's outbound buffer, waiting
if the buffer is full. The buffers are short conveyors that roll totes between the shuttle and the
lift. The aisle's lift has a platform on each side: it collects totes from the outbound buffers and
rolls them off onto the aisle's outfeed; on the way back it takes the tote at the head of the infeed
up to an inbound buffer, and it combines a put-away and a retrieval on the same level when it can.
Travel uses acceleration and braking for both.

**Conveyor and storage policy.** The pre-zone is a one-way loop at station height: the near line runs
past the aisles, the far line past the stations, so no belt carries totes both ways and no line
crosses another. Each aisle has an outfeed on the left and an infeed on the right; each station
takes totes off the far line and puts them back on it. Totes queue behind each other on the belts,
give way where lines meet, and a station presents the next tote only once the last one has rolled
off.
Totes are routed late, as on a real recirculating loop: just before a turn-off the control checks
for room on the spur. A tote for a full station stays on the loop and goes round again (totes that
have been round go first next time); a returning tote whose infeed is full goes to the next aisle
with room, or round again. Totes going round give way where others join the loop. No more totes
are released for a station while one for it is going round, machines send nothing out once the
loop is three quarters full, and stations hold a finished tote once it is nine tenths full, so the
loop never fills up and locks.
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
| ![SkyStack in 3D: high racking with an orange stacker crane in each aisle](docs/screenshots/sky-3d.png) | ![Walk mode in 3D: looking down an aisle at a crane between full racks](docs/screenshots/sky-3d-closeup.png) |
| **3D:** high racking with a crane per aisle on its rails | **3D walk mode:** down an aisle, the crane's mast and carriage between the racks |

SkyStack uses the same racking, storage policy and conveyor as RailRunner, with one stacker crane per
aisle instead of shuttles and lifts.

**Crane.** The crane drives along a floor rail while its carriage moves up or down the mast, each with
its own speed and acceleration, so a trip takes the longer of the two. After arriving it settles,
then the forks go out for a fixed fork cycle per tote. The load handler holds two totes.

**Cycles.** Every cycle starts and ends at the I/O point in front of the aisle, where the forks
reach sideways onto the conveyors: returning totes queue on the infeed on the right, retrieved totes
leave on the outfeed on the left, each in line with its position on the load handler. A single command stores or retrieves; a dual command stores first and then retrieves
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
| ![StackPilot in 3D: shelving aisles, robots with tall masts and the stations in front](docs/screenshots/acr-3d.png) | ![Close-up in 3D: a robot handing totes onto a station's conveyor, its return conveyor alongside](docs/screenshots/acr-3d-closeup.png) |
| **3D:** shelving, robots with masts, queue lanes and stations | **3D close-up:** robots with back shelves, the handler on the mast |

StackPilot stores totes in racking like RailRunner and SkyStack, but its machines are battery robots
on a floor grid, with the same routing and charging as PodSwarm.

**Floor.** Aisles one robot wide between single-deep shelving, a cross aisle two cells wide behind and
in front of the racking, a corridor and a column of parking spots and chargers on the right. Each
station has a short queue lane and a handover point. The robot puts totes onto a conveyor in front of
it that feeds the station, one at a time as there is room; totes leaving the station roll back on a
conveyor that ends beside the handover point. A tote another station also needs rides there on a
robot.

**Robot.** A drive unit with a mast, a tote handler and a column of back shelves (8 by default). The
robot only lifts or handles a tote while standing still, and blocks its aisle cell meanwhile. At a
stop the handler runs up the mast at mast speed, takes or puts a tote (8 s) and comes back down.

**Trips.** A trip loads the totes waiting on a station's return conveyor, stores them in free
positions near the trip's retrievals, takes up to a shelf-full of totes that one station needs (the
most urgent first, then the ones closest to it) and hands them over at that station, 2 s per tote. A
trip waits for at least 4 totes unless the oldest has waited 25 s. No more robots head for a station
than its lane holds, so a queue never spills into the cross aisle; a robot with a batch waits at its
last stop until there is room (in a one-way aisle, or on another station's lane, it drives to the
parking column first, so it never holds up the robots behind it).

**Swapping at the handover point.** A station whose return conveyor is full cannot present its next
tote, and the robot that would empty that conveyor may be queueing behind the one delivering. So a
robot at the handover point that cannot put its totes onto the full infeed takes returning totes off
the return conveyor onto its free shelves; its next trip stores them, or carries them to the station
that wants them. Without this the system gridlocked above about 400 orders per hour; now it holds
about 550 order lines per hour under any load.

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

### AisleMate — robots alongside pickers

![AisleMate: shelving aisles with robots waiting at the shelves, pickers beside them and the stations in front](docs/screenshots/amr-floor.png)

| | |
|---|---|
| ![Close-up of the aisles: robots carrying order totes, pickers picking into them](docs/screenshots/amr-closeup.png) | ![AisleMate control room: picker utilization, robot waits for pickers, lines per stop and the floor map](docs/screenshots/amr-control.png) |
| **Close-up:** robots with order totes on two decks wait beside the shelves; pickers walk up and pick into them | **Control room:** picker utilization, how long robots wait for a picker, lines per stop |
| ![AisleMate in 3D: rows of shelving, robots in the aisles and the induct stations in front](docs/screenshots/amr-3d.png) | ![Close-up in 3D: a picker at a robot waiting beside the shelf, its tablet lit](docs/screenshots/amr-3d-closeup.png) |
| **3D:** shelving, robots, pickers and the stations | **3D close-up:** a picker at a robot, the tablet showing what to pick |

AisleMate is not goods-to-person: the shelving stays, people still pick, and robots take over the
walking with a cart. It shows what a warehouse gets from robots without new storage, and how the
balance between robots and pickers decides the throughput.

**Floor.** Rows of shelving with aisles two cells wide, so a robot waiting at a shelf leaves room
to pass; a cross-aisle at the back and the front, parking rows along the front and back walls and
chargers on the back wall. A shelf bay is one stock location with 4 levels of 2 slots. Induct &
drop-off stations sit at the front, each with a short queue lane, the operator and a rack of order
totes staged for the robots; a goods-in station is on the right.

**Robots.** A drive unit with two decks for 4 order totes and a tablet on a mast. A robot takes up
to 4 orders staged at a station (it leaves with fewer once the oldest has waited 30 s) and drives an
S-shaped route past the locations of their lines, one stop per location. At each stop it waits,
tablet lit, until a picker has worked it. After the last stop it queues at a station: the operator
takes the full totes off onto the packing conveyor (3.5 s each) and, if orders are staged there,
puts the next batch on in the same visit.

**Pickers.** People walking at 1.1 m/s who do not reserve floor cells. With zone picking (the
default) the aisles are split over the pickers; a picker takes the stop in their zone that has waited
longest, also stops a robot is still driving to, so they meet it there, and an idle picker helps in
a zone where robots are waiting. Per stop: 1.5 s to scan the location, then per line 1 s, 3.2 s per
unit and 1 s to confirm.

**Putaway.** The goods-in operator loads received cases onto a robot, which drives a putaway tour
of up to 6 locations; at each stop a picker puts the goods away.

**Storage policy.** Locations do not move, so the choice is where to pick a line from: a location
already on a stop for that station first, then one in an aisle with little work waiting, then one
near the stations. That spreads the work over the picker zones.

**KPIs.** Picker utilization and metres walked, how long a robot waits for a picker per stop, lines
per stop and the robots' time split. With the default 10 robots and 6 pickers the site picks about
560 order lines per hour, keeping up with 300 orders per hour; robots spend about a third of their
time waiting for pickers, which is normal for this kind of system. Not modelled yet: pickers
following a robot through the aisle, pick carts, picker breaks.

### SortHub — parcel sorter

![SortHub: small robots on a raised deck carrying parcels from the inducts and tipping them through holes into the bags below](docs/screenshots/sort-robots.png)

| | |
|---|---|
| ![The tilt-tray loop: inducts, trays carrying parcels and chutes with bags along both sides](docs/screenshots/sort-tray.png) | ![SortHub control room: sort rate, overflow, rejects, bags, robot utilization and the induct cards](docs/screenshots/sort-control.png) |
| **Tilt-tray loop**, the other sorter: trays tip parcels into the chutes along both sides | **Control room:** sort and induct rates, overflow, rejects, bags and the inducts |
| ![The robot sorter in 3D: the deck with its holes, the robots and the induct platforms](docs/screenshots/sort-robots-3d.png) | ![The tilt-tray loop in 3D](docs/screenshots/sort-tray-3d.png) |
| **3D:** the robot deck, the bags hanging below it | **3D:** the tilt-tray loop, its chutes and bags |

SortHub is a parcel hub rather than a store: there is no stock and no order flow, only a stream of
parcels to sort. Its side panel has its own tabs: chutes with their bags, the parcel stream with its
destinations, and the settings. The sorter is a setting (the robot sorter by default), so both
kinds can be compared on the same stream.

**Parcels.** 3600 parcels per hour arrive, each for one of 28 destinations; a few destinations take
most of the volume. At each of 4 inducts an operator scans a parcel (2.4 s) and puts it on the
sorter, scanning the next one meanwhile. 2 % of labels cannot be read and go to the reject chute.

**Chutes and bags.** One chute per destination, a second (third …) for the busiest, and a reject
chute. Every chute ends in a bag of 30 parcels; 2 bag workers walk to full bags and change them
(25 s). While a bag is full or being changed, its chute takes nothing.

**Tilt-tray loop.** Trays 1 m apart run round at 2 m/s. An induct puts its parcel on the next empty
tray; at a chute of the parcel's destination with room the tray tilts and the parcel slides in.
With its chutes full the parcel goes round again, and after 3 laps to the reject chute.

**Robot sorter.** 45 small robots on a raised deck, a hole above each chute's bag. A robot queues at
an induct, takes the parcel and drives to the nearest chute of its destination with room, where it
tips the parcel in; with all of them full the parcel goes to the overflow (reject) chute. The deck
has one-way streets between the holes, robots never stop inside a crossing, inducts are
pass-throughs onto a northbound street, and robots with nothing to do park along the back, next to
the chargers. Without those rules the fleet locked itself up within an hour or two; with them it
runs at any load. Up to about 70 robots fit the default deck.

**KPIs.** Sort and induct rates, parcels waiting to be inducted, recirculation (tray) or overflow
(robots), rejects, bags changed and full chutes, induct utilization, and tray occupancy or the
robots' time split. With the defaults both sorters keep up with 3600 parcels per hour; the
tilt-tray recirculates about 2–3 % of parcels, and the robot sorter keeps up with 45 robots
spending about a third of their time waiting at the inducts. Above that, two bag workers become the
limit for both.

## Development

```
index.html, css/landing.css, js/landing/   landing page and simulation previews
cubeflow.html, podswarm.html, railrunner.html, skystack.html, stackpilot.html, aislemate.html,
sorthub.html
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
js/amr/     AisleMate: config, floor, sim (batches, routes, stops, pickers), render, ui
js/sort/    SortHub: config, sim (parcels, inducts, chutes, tray loop, robot deck, bag workers),
            render, render3d, ui (its own tiles, tabs and settings)
test/run.js headless soak test with invariant checks:  node test/run.js [hours] [seed] [cube|pod|shuttle|crane|acr|amr|sort]
test/golden.js  regression check (npm test): runs every type for 2 h, seed 7, plus a few
            non-default settings (nearest putaway, robot arm stations, automated decanting,
            packing machines, no tunnelling, one-tote crane handler,
            one-way aisles, no picker zones, robot sorter), and compares a fingerprint of stock, fleet, orders and KPIs
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
