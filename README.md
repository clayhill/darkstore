# DarkStore — a warehouse automation simulator

**Try it live: [clayhill.github.io/darkstore](https://clayhill.github.io/darkstore/)**

![Landing page: choose one of the thirteen simulations](docs/screenshots/landing.png)

DarkStore simulates the automated heart of an e-commerce warehouse in your browser. Pick one of thirteen
systems and watch robots, operators and orders move through it in real time: totes and bins
fetched from storage, picked at stations, packed, labelled and loaded onto a truck. Every system runs
the same order flow, so you can compare how they behave under the same demand.

## The idea

In a **goods-to-person** warehouse nobody walks the aisles. Machines bring storage units (bins,
totes or whole shelves) to a station, where an operator picks the items into order totes. What sets
the systems apart is how they store goods and fetch them; everything around the storage is the same.
Seven of the fourteen systems work this way. AisleMate is the common first step towards it: people
still pick from ordinary shelving, and robots carry the order totes to them. ZoneHop turns it round:
the order tote travels past the stock, as in a pharmacy wholesaler's. SortHub is not a store at all
but a parcel sorter, the kind of hub parcels go through after the warehouse. FloorStack puts a
whole fulfilment centre in one building of three floors: storage, picking and the dock above each
other, linked by spiral conveyors and lifts. PocketFlow hangs every item of a fashion webshop in a
pocket on an overhead rail, where returns wait to be sold again and a sequencer drops each order in
turn at the packer. CaseCraft supplies supermarkets: robot arms break down suppliers' pallets, bots
store every case in a dense structure, and robot arms stack the cases into stable mixed pallets for
each store. RoboValet leaves the warehouse: an automated car park,
where the same kind of lifts and robots store cars instead of totes.

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

**The fourteen systems**

| Simulation | System | Storage unit | What moves | Worth watching |
|---|---|---|---|---|
| [**CubeFlow**](https://clayhill.github.io/darkstore/cubeflow.html) | Cube storage AS/RS | Bins stacked in a grid | Robots on top of the grid, digging bins out | Dig ratio, buried fast movers |
| [**PodSwarm**](https://clayhill.github.io/darkstore/podswarm.html) | Pod robots | Shelving pods on the floor | Robots carrying whole pods to stations | Hit rate per pod visit |
| [**RailRunner**](https://clayhill.github.io/darkstore/railrunner.html) | Shuttle AS/RS | Totes in racking | A shuttle per level, a lift per aisle | The lift as the bottleneck |
| [**SkyStack**](https://clayhill.github.io/darkstore/skystack.html) | Stacker crane AS/RS | Totes in high racking | One crane per aisle | Cycle times against FEM 9.851 |
| [**StackPilot**](https://clayhill.github.io/darkstore/stackpilot.html) | Case-handling robots (ACR) | Totes on shelving | Robots collecting batches of totes | Totes per trip, aisle traffic |
| [**AisleMate**](https://clayhill.github.io/darkstore/aislemate.html) | Robots alongside pickers (collaborative AMRs) | Goods on ordinary shelving | Robots with order totes, pickers walking to them | Robot waits for pickers, picker utilization |
| [**RackRider**](https://clayhill.github.io/darkstore/rackrider.html) | Climbing robots | Totes in tall racking | Robots that drive, climb the racking and present the tote at the station | Climbing blocks the aisle, the robot as the conveyor |
| [**DeepLane**](https://clayhill.github.io/darkstore/deeplane.html) | Pallet shuttle AS/RS | Pallets in deep lanes, one SKU per lane | A carrier with a satellite per level, a lift per block | Last in, first out lanes, the lift as the bottleneck |
| [**ZoneHop**](https://clayhill.github.io/darkstore/zonehop.html) | Pharmacy wholesale: A-frame and zone picking | Small boxes in A-frame channels, flow racks, carousels and shelving | Order totes on a conveyor loop, past the zones their order needs | A-frame refills, zone skipping, totes that miss their van |
| [**SortHub**](https://clayhill.github.io/darkstore/sorthub.html) | Parcel sorter: robot sorter or tilt-tray loop | Parcels, sorted into bags | Small robots on a deck, or trays round a loop | Recirculation, chutes and bag changes, tray against robot |
| [**FloorStack**](https://clayhill.github.io/darkstore/floorstack.html) | Multi-storey fulfilment: storage, picking and the dock on three floors | Totes in a shuttle store on the first floor | Totes up a spiral to the pick stations and back down, parcels down two floors to a sorter, roll cages to the trucks | The links between the floors as the bottleneck, spirals against lifts |
| [**PocketFlow**](https://clayhill.github.io/darkstore/pocketflow.html) | Fashion e-commerce through an overhead pocket sorter | One item in each pocket, on storage rails | Pockets on a friction rail: storage rails, a two-pass matrix sequencer, pack stations where they open | Returns sold again from the pockets, pockets sent round to dig them out, the sequencer |
| [**CaseCraft**](https://clayhill.github.io/darkstore/casecraft.html) | Mixed-case pallet DC: depalletising, case bots, palletising robots | Cases on shelves in a structure of 14 levels | Robot arms, bots on every level's deck and in its aisles, lifts that bring cases down in build order | The pallet planner (heavy at the bottom, nothing heavy on crisps), cases in sequence, how full a pallet gets |
| [**RoboValet**](https://clayhill.github.io/darkstore/robovalet.html) | Automated car park: cabins, car lifts and flat robots | Cars in bays on five levels | Robots that slide under a car and carry it sideways, lifts between the floors, drivers queueing and waiting | The morning queue in the street, the 17:00 rush in the lobby, the cabins as the bottleneck |

The specs behind each system are in [`specs/`](specs/README.txt): `common.txt` holds the rules shared
by every type, and `cube.txt`, `pod.txt`, `shuttle.txt`, `crane.txt`, `acr.txt`, `climb.txt`, `pallet.txt`, `amr.txt`,
`pharma.txt`, `sort.txt`, `tower.txt`, `pocket.txt`, `case.txt` and `park.txt` describe the fourteen systems.

## Run

The live version runs at **https://clayhill.github.io/darkstore/** (GitHub Pages, updated on every
push to `main`).

To run it locally, open `index.html` in Safari (or any modern browser). It has no build step and no
dependencies, so double-clicking the file works. Only the 3D view needs a network connection: it loads
three.js from a CDN the first time it is opened. `index.html` is the landing
page; each simulation has its own page: `cubeflow.html`, `podswarm.html`, `railrunner.html`,
`skystack.html`, `stackpilot.html`, `rackrider.html`, `deeplane.html`, `aislemate.html`, `zonehop.html`,
`sorthub.html`, `floorstack.html`, `pocketflow.html`, `casecraft.html` and `robovalet.html`.

**In a simulation**

- Drag to pan, scroll or pinch to zoom, **Shift-drag** (or right-drag) to tilt the view from almost level
  to nearly top-down, **space** to pause, **Esc** to close panels.
- Switch between the **Floor** view, the **Control room** and a **Split** of both; run at 1× to 120×.
- **Share a setup:** the page address holds every setting you changed and the view, so a link opens
  exactly the setup you are looking at (same settings and seed, so the same run). **Copy link** in
  the Settings tab copies it; for example `podswarm.html?robots=20&pickPorts=4&view=control`.
- **Disruptions** (top of the Settings tab): hit the running warehouse with an order surge, a robot or
  machine breaking down, a charger fault or an operator going on a break, or let robots fail at
  random. See how each system copes, and how long it takes to catch up.
- Click robots, machines, storage, stations, pack stations or the dock to inspect them.
- **3D**: a free 3D view of the whole warehouse, in all eleven systems. Drag to
  orbit, right-drag or Shift-drag to pan, scroll to zoom, **WASD** or the arrow keys to move and
  **Q**/**E** to turn, **R**/**F** to move the camera up or down. **Walk** puts you on the floor at eye height (drag to look around, Shift to
  go faster). Double-click a robot, shuttle or crane to follow it; **Esc** or panning lets it go. In the
  racking systems the **Levels** slider works in 3D too; X-ray works in CubeFlow's 3D view. The
  warehouse stands in a hall with windows, columns and roof lamps. The walls on your side drop to a
  kerb so you can see in. **Lights out** switches the hall lights off: the robots keep working in the
  dark, and only the stations, packing and the dock stay lit. The **Camera** menu rides along: **Robot
  cam** sits on the front of a robot and looks where it drives (across the grid top, under a pod, on a
  crane's carriage), **Chase** follows just behind one, **Stations** visits the work places, **Orbit**
  turns slowly round the warehouse, and **Ambient tour** cycles through them all like a screensaver.
  **Follow an order** stays with one order from release to the truck: the robot or machine fetching
  its stock, the storage unit on its way to the station, the pick into the order tote, the tote on the
  conveyor, the pack bench, the labelled parcel and the truck, with a panel that says what is
  happening and how far the order is; then it moves on to the next order. **Follow in 3D** on any
  order starts it with that order. In SortHub it follows a parcel from the feed belt through the
  induct, on a tray or a robot, into its chute.
  **N** picks the next robot, station or order; any drag, scroll or key gives the camera back. Up close the
  machines behave like real ones: status lights fade between states and breathe while a robot waits,
  a crane's mast sways after braking (the forks wait for it to settle), PodSwarm pods rock when their
  robot starts, stops or turns, and cranes, shuttles and lifts ramp their speed up and down smoothly.
  The operators' screens show the live job: what to pick or decant, how many, from which compartment
  (or pod face, shelf and pocket) into which put-wall slot, for which order and customer; pack benches
  show the order, its address and carrier; AisleMate robots' tablets tell the picker what to pick
  where and into which tote. Readable up close in 3D, and in the floor view when zoomed in.
- **People** each have their own look, in a hi-vis vest that says what they do: orange at the pick
  stations, green at goods-in and on refills, lime for pickers, sky blue at packing, yellow for bag
  workers and dock loaders, red for technicians, white for supervisors. Pickers, bag workers and
  refill operators walk where they go, legs and arms swinging; operators turn between the pick and
  the put.
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
orders shipped, fleet utilization split into working, waiting, idle, charging and down, the order
cycle time and the orders in process, plus its own KPIs (see below). Bottleneck alerts flag traffic
hotspots, starved or blocked stations, backorders, tote shortage and low battery.

**Disruptions.** A calm, steady day shows how fast a system is; a bad day shows how robust it is.
From the Settings tab you can start an order surge (2.5× as many orders for 30 minutes, as on Black
Friday), break down a robot or machine, take a charger out of service or send an operator on a
break; random breakdowns are a rate per hour. A broken robot stands where it stopped until it is
repaired (10 minutes), with its light flashing red and a technician in a red vest at work beside it,
and the others route round it or wait behind it;
a broken crane or lift takes its aisle out, and on the tilt-tray loop the whole sorter stops. A
station whose operator is on a break turns its stack light red, shows it on its screen and gets no
new orders. The control room lists each disruption with the time left, shades a surge on the
throughput chart and marks the others along its bottom, and the time split shows the machines that
are down. With the defaults every system works off the backlog once the disruptions are over.

| | |
|---|---|
| ![PodSwarm's control room on a bad day: an order surge shaded on the throughput chart, robots broken down, a charger out of service and an operator on a break in the alerts](docs/screenshots/disruptions.png) | ![Follow an order in CubeFlow's 3D view: the panel with the order's stages and the robot carrying its bin, marked with a yellow pin](docs/screenshots/follow-order.png) |
| **Disruptions:** a surge, two robots down, a charger fault and an operator break | **Follow an order:** the 3D camera stays with one order from release to the truck |

**Time model.** The simulation advances in fixed 100 ms ticks and also has a small discrete-event
queue. Rendering interpolates between ticks. Speed runs from 1× to 120×; a tick costs well under a
millisecond.

## The fourteen systems in detail

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

**Mobile robots instead of the loop.** A setting in Scenario (Transport to the stations) replaces the
pre-zone loop with roller-top robots, as many real systems do. The lift puts a tote on a short stand
in front of its aisle; a robot takes it to its station's infeed and, often, takes the station's next
outgoing tote straight back to an aisle's infeed stand or on to the next station. The robots drive a
floor of their own: a highway two lanes each way, joined at both ends and by crossings, a queue lane
and two handover cells per station, parking spots and chargers. With four robots per station the
default site picks about as many lines per hour as with the loop; fewer robots are the limit, more
only add traffic. The control room adds robot utilization, the share of driving done empty, paired
trips and how long totes wait on the stands; a robot that breaks down in front of a stand blocks
that aisle until it is repaired. SkyStack has the same setting (specs/prezone-robots.txt).

| | |
|---|---|
| ![RailRunner with mobile robots: stands at the aisle fronts, a two-lane highway each way and the stations' queue lanes](docs/screenshots/rail-robots.png) | ![Close-up in 3D: roller-top robots carrying totes between the stands and the stations](docs/screenshots/rail-robots-3d.png) |
| **Robots:** stands, highway, queue lanes and handover cells in front of the stations | **3D close-up:** roller-top robots with totes, the stands and a station |

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
aisle instead of shuttles and lifts, and the same choice of mobile robots instead of the loop.

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
put wall. Not modelled yet: double-deep storage. Robots that climb the racking are RackRider.

### RackRider — climbing robots

![RackRider: tall racking with aisles one robot wide, robots climbing the rack faces, queue lanes and the station frames](docs/screenshots/climb-floor.png)

| | |
|---|---|
| ![Close-up: a robot high up the racking taking a tote, others queueing for the stations](docs/screenshots/climb-closeup.png) | ![RackRider control room: robot cycles, the climb's share of a cycle and the floor map](docs/screenshots/climb-control.png) |
| **Close-up:** a robot up the racking, its pinions lit while it climbs | **Control room:** cycles per hour, how a cycle splits, aisle waits |
| ![RackRider in 3D: tall racking, robots on the floor and up the rack faces, and the stations](docs/screenshots/climb-3d.png) | ![Close-up in 3D: a climbing robot with its tote between the side towers](docs/screenshots/climb-3d-closeup.png) |
| **3D:** the racking, the station frames and the robots | **3D close-up:** a robot on the rack face, its arm sliding a tote out |

**Racking and robots.** StackPilot's racking, but taller (twenty levels, 8.4 m) and without masts:
the robots climb it themselves, as Exotec's Skypods do. A robot carries one tote. It drives into the
aisle beside the tote, grips the rack uprights and climbs straight up at 1.5 m/s, takes the tote
with its telescopic arm and climbs down. While it climbs it blocks its cell of the aisle, so the
robots behind it wait; neighbouring aisles run in opposite directions.

**Stations without conveyors.** The robot queues in the station's lane, drives into the station's
frame and climbs to working height to present the tote to the operator itself, and waits while the
lines are picked; if another station wants the tote meanwhile, it goes there next. Then it puts the
tote away in a free position (fast movers low and near the stations) and is free for the next one.

**KPIs.** Robot cycles per hour, how a cycle splits into driving, climbing, the arm, presenting and
waiting, aisle waits and how many robots are up the racking. The **robot cam** in 3D rides on top of
a robot, up the racking and down again.

### DeepLane — pallet shuttle store

![DeepLane: two blocks of deep pallet lanes with a carrier on every level, lifts at the front, the pallet conveyor loop and the stations](docs/screenshots/pallet-floor.png)

| | |
|---|---|
| ![Close-up: carriers on every level with their satellites, the lifts and pallets on their way to the stations](docs/screenshots/pallet-closeup.png) | ![DeepLane control room: lift utilization, carrier cycles, pallets stored and a levels-by-blocks map](docs/screenshots/pallet-control.png) |
| **Close-up:** carriers and their satellites, a lift at the front of each block | **Control room:** lift utilization, carrier cycles, pallets stored, received and emptied |
| ![DeepLane in 3D: the pallet racking, the lift towers, the conveyor loop and the receiving dock](docs/screenshots/pallet-3d.png) | ![Close-up in 3D: deep lanes of pallets on their rails, carriers on every level and the lift](docs/screenshots/pallet-3d-closeup.png) |
| **3D:** the blocks, the receiving dock on the left and the empty-pallet stacker | **3D close-up:** pallets in their lanes, the carriers' rails along the transfer aisle |

**Racking.** Blocks of deep lanes on both sides of a transfer aisle, six pallets deep and six levels
high by default. Each lane holds one SKU and is filled from the back, so it works last in, first out:
only the pallet nearest the transfer aisle can be taken, and a pallet put away goes in front of the
others. The two lanes nearest the lift on each side of a level hold the level buffers.

**Carriers, satellites and lifts.** Every level of every block has a carrier with a satellite on
board. The carrier drives along the transfer aisle to a lane; the satellite drives in under the
pallets, lifts the front one off the rails and brings it back, and the carrier takes it to the
level's outbound buffer. As in RailRunner (whose code DeepLane builds on), the block's lift brings it
down to the pallet conveyor loop, which carries it to a station, and returning pallets go the other
way. The lift is the bottleneck: one pallet at a time, with long transfers.

**Lanes and stock.** Only stock at the front of a lane can be reserved. An order line the front
pallets cannot fill on their own takes all a front pallet has left and goes on with the pallet behind
it, which is fetched once the one in front has gone. A returning pallet goes in front of pallets of
its own SKU or into an empty lane, never in front of a pallet a station is waiting for, and lanes its
SKU already has come first, so SKUs do not spread over many half-empty lanes.

**Pallets in and out.** Received goods arrive as new full pallets at the receiving dock on the left
of the loop; the conveyor takes each one past the goods-in station, where it is checked and labelled,
and on into the store. A pallet picked empty leaves the loop to the empty-pallet stacker on the
right instead of going back.

**KPIs.** Lift utilization, carrier cycles per hour, and pallets stored, received and emptied. With
the defaults (70 orders an hour) the lifts run at about two thirds and the stations wait on them.
Not modelled yet: lanes open at both ends (first in, first out), carriers that change level and
full-pallet orders.

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

### ZoneHop — pharmacy wholesale

![ZoneHop: the A-frame with its flow racks and the shuttle store at the back, order start past its end, the conveyor loop with the pick-to-light zones and the carousels, the RF shelving, the closing line and the route lanes with the vans](docs/screenshots/zone-floor.png)

| | |
|---|---|
| ![Close-up: the A-frame, the loop and the pick-to-light zones with their operators](docs/screenshots/zone-closeup.png) | ![ZoneHop control room: totes out, lines per hour, the A-frame's share, recirculation, merge wait, vans and the zone cards](docs/screenshots/zone-control.png) |
| **Close-up:** totes leave the A-frame and turn off the loop into the zones they need | **Control room:** the conveyor map with every tote, zone cards with how often each is skipped |
| ![ZoneHop in 3D: the loop, the zones, the carousels, the RF shelving and the vans at their doors](docs/screenshots/zone-3d.png) | ![The A-frame in 3D: white channels on its steep faces, the flow racks of reserve bins either side, the shuttle store in front and order start past its end](docs/screenshots/zone-3d-closeup.png) |
| **3D:** the whole system, from the A-frame to the vans | **3D close-up:** the A-frame, each channel's stack going down as it dispenses |

ZoneHop is not goods-to-person: nothing travels to a picker, the order tote travels past the stock.
It is the system a pharmacy wholesaler uses to deliver many small orders to pharmacies several times
a day. Its side panel has its own Zones and Routes tabs; orders and stock use the shared ones.

**Orders.** Pharmacies on 12 routes order 8 to 30 lines at a time, 250 orders an hour on average, in
waves: slow just after a tour of vans has left, up to 1.6 times as fast just before the next one.
An order is due on the first van of its route that leaves at least 20 minutes after it came in.

**Order start and the A-frame.** The de-stacker feeds an empty tote and a printer labels it (4 s),
the order due first first. Order start is past the end of the A-frame: the tote's first stop is the
hopper under the end of the A-frame's belt, where it waits only when its order has A-frame lines.
The A-frame has 240 channels on two steep faces, each holding one fast mover, and a belt between
them with a 1.2 m window per order. As the window passes a channel holding one of its products, the
dispenser ejects the units into it (0.25 s each); at the end of the belt the window slides through
the hopper into the order's tote, and without its tote the belt stops. Two refill operators walk the
walkways either side and refill channels at 20 units, the one that runs out first first: they take
the product's bin from the flow rack behind them, set it on the ledge at the foot of the A-frame,
fill the channel from it (30 s in all) and put the empty bin on the rack's return lane. A shuttle
store (3 aisles, a shuttle on each of 10 levels, a lift at each end of an aisle) sends a new bin to
the lane for every bin taken, on a conveyor round to the back of the flow racks, and takes the
empty ones back: the shuttle drives to the bin and brings it to the lift, which comes up to meet it
(2 m/s, 1.5 m/s, 2 s for each handover). A line whose channel is empty goes short, and the tote goes to the completion zone.

**The loop and the zones.** The tote rides a loop and turns into every zone its order has lines
in, and only those: three pick-to-light zones with a flow rack wall behind the operator (2 s a line,
1.2 s a unit, the location lit with its quantity; the first is also the completion zone) and a
zone with two horizontal carousels, which turn the shorter way round to the next shelf while the
operator picks from the other one. A spur holds 4 totes; with it full the tote goes round again.
Order start holds while the loop is three quarters full. Products are slotted by units a day: the
fastest that fit the A-frame go there, the next ones to pick-to-light (shared out so each zone has
about as many lines), then the carousels, the long tail to the RF shelving. Zone stock is topped up
after 15 minutes: the bin comes out of the shuttle store's east lifts to the replenishment point by
the zones and comes back empty once the location is topped up.

**RF shelving and the merge.** Three RF pickers take the slow movers of a batch of up to 8 orders,
walk an S-shaped route through the shelving with a tote per order on their cart (8 s a line) and
put the totes on the belt to the merge. The merge is a put-to-light station: an order tote waits in
a lane of its rack (three levels of eight) until all the order's totes are in, the light under the
lane amber while its RF tote is still on the way and green once the order is complete. The RF totes
wait in their own lane on the other side of the operator, who brings the order tote to the merge
position, lifts the RF tote over it and tips it in (6 s), or sends it along when it does not fit,
and stacks the empty RF tote on a dolly.

**Closing line, sorter and vans.** A check-weigher (1 % go to a manual check), a document inserter,
a lidding machine and a label printer with an SSCC per tote; the shipping sorter diverts each tote
into its route's lane, where totes stack five high. A van leaves every two hours, a route every
90 s, with up to 60 totes; it brings the empty totes of its trip back 90 minutes later, and the
tote-emptying machine tips them and stacks them for the de-stacker. 1000 totes circulate.

**Disruptions.** The breakdown button jams one of the busiest A-frame channels: its lines go short
to completion until it is freed. A break can hit a refill operator, an RF picker or a zone operator.

**KPIs.** Order totes out and lines per hour, the A-frame's share of the units, empty channels and
refills waiting, loop fill and recirculation, merge wait, zone utilization and zone skipping, totes
in the lanes and per van, orders that missed their van, and a time split of the totes (being picked,
queued, moving, at the merge). With the defaults ZoneHop picks about 4700 lines and 245 totes an
hour; the A-frame dispenses two thirds of the units, the pick-to-light operators are 35–40 % busy,
the carousel zone is skipped by 60 % of the totes, about 15 % of the totes go round the loop once
more, and no order misses its van. The tote cam rides an order tote from order start to its lane;
Follow an order follows its window on the A-frame, its totes, the merge and its van.

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
robots' time split. With the tilt-tray loop the control room shows the trays where the other systems
show their fleet: a chart of trays carrying, going round again, heading for the reject chute and
empty, the loaded trays in the table, and every tray on the map. With the defaults both sorters keep up with 3600 parcels per hour; the
tilt-tray recirculates about 2–3 % of parcels, and the robot sorter keeps up with 45 robots
spending about a third of their time waiting at the inducts. Above that, two bag workers become the
limit for both.

### FloorStack — multi-storey fulfilment

![FloorStack in 3D: the building cut open on its south side, the pick stations and packing on the second floor, the shuttle store on the first, goods-in and the canteen on the ground floor, and the parcel spiral dropping two floors at the east end](docs/screenshots/tower-3d.png)

| | |
|---|---|
| ![The first floor alone: the shuttle store with its aisle lifts, the conveyor loop in front, the spiral up to the pick stations on the left and the spiral down on the right, and the tote lift to goods-in](docs/screenshots/tower-3d-store.png) | ![The ground floor from the north: the sorter high along the wall, chutes dropping parcels into roll cages, and a truck per carrier backed up to its dock door](docs/screenshots/tower-3d-dock.png) |
| **First floor:** the store, with the spirals up to the pick stations and back down | **Ground floor:** the sorter, roll cages and a truck per carrier |
| ![Follow an order: the operator at Pick 2 picks from the order's tote, which came up from the store a floor below; the spiral down and packing beyond](docs/screenshots/tower-follow.png) | ![FloorStack's control room: totes up and down between the floors, the tote lift, parcels sorted, trucks out, and the station cards](docs/screenshots/tower-control.png) |
| **Follow an order:** its tote up the spiral to the station, its parcel down to the truck | **Control room:** the links between the floors, the sorter and the trucks next to RailRunner's tiles |

FloorStack puts a whole fulfilment centre into one building of three floors, as where land is dear:
the store on the first floor, the pick stations and packing on the second, goods-in, a parcel
sorter and the trucks on the ground floor. It has no floor view: three floors on top of each other only read in
3D, so the page opens there (R and F, or Page Up and Page Down, move the camera up and down a
floor). Everything that goes from the store to a station and
back changes floors on the way, so the links between the floors are the new bottleneck. The
Floors slider (top left) shows the building up to a floor, or one floor alone.

**The store and its loop.** The first floor is RailRunner's shuttle store (6 aisles, 8 levels, a
shuttle per level, a lift per aisle). In front of the aisles a one-way loop: the near line runs
west past every aisle's outfeed and infeed, on past the tote lift and the foot of the spiral up;
the far line comes back east. The aisle lifts send no more totes out while the loop is 70 % full.
A tote turns off at the link to its station's floor, or goes round again when there is no room.

**Up and down.** A spiral conveyor carries the totes up to the second floor (a ride of about 46 s)
and another one back down; in the settings they can be a tote lift each way instead. Upstairs a
station line runs past the four pick stations, a spur into each; a tote that finds its spur full
goes round. Done at a station, a tote goes on to the next station that wants it or back down,
where it gets its storage position. Ten totes may be on their way to a station (six in
RailRunner), because the way up is long; a tote on its way back that a station asks for meanwhile
goes there instead of into the racking.

**Goods-in.** A tote lift with room for two totes links the store with the two goods-in stations
on the ground floor. Suppliers' trucks dock at the west doors; a pallet mover takes their pallets
to the staging lanes and on to the stations, which work through a pallet's cartons.

**Parcels and the dock.** Packed parcels drop two floors down the parcel spiral onto a sorter loop
that runs high along the north wall. Each carrier has a dock door with two chutes; a parcel slides
into the roll cage under an open chute of its carrier. A full cage closes its chute until the
door's loader has pushed it into the truck and brought an empty one. A truck takes eight cages and
leaves when full or at its carrier's departure time; the next one brings the empty cages back.

**People.** The station operators take their breaks in the canteen on the ground floor, one
after the other: they step over the takeaway conveyor behind them, walk to the goods lift, ride
it down and sit down at a table; the station stops until they are back. Loaders push roll cages,
the pallet mover drives a pallet jack, and two supervisors watch the screens in the glass
control room upstairs.

**KPIs.** On top of RailRunner's: totes per hour up and down, how full the spirals are or how busy
the lifts, totes waiting at their foot, the tote lift, recirculation on every floor, parcels
sorted, cages and trucks. With the defaults (400 orders an hour) FloorStack picks about 830 lines
an hour and keeps up; the pick stations are about 40 % busy and wait for totes nearly half the
time, because the way up is long. With a tote lift each way instead of the spirals the lifts are
97 % busy, about 1200 totes an hour go round the first floor's loop because the way up is full,
and the building falls behind at about 430 lines an hour. Follow an order follows its totes up
from the store and its parcel down to the truck.

### PocketFlow — fashion pocket sorter

![PocketFlow in 3D: the overhead rails with their pockets, the storage rails and the sequencer's two banks across the main loop, the loading stations and returns desk at the west end, the pack stations with their pocket buffers in front](docs/screenshots/pocket-3d.png)

| | |
|---|---|
| ![A loading station: the rail comes down to chest height, an opener holds the pocket's mouth open and the operator puts in an item from a tote of picked items](docs/screenshots/pocket-load.png) | ![A pack station: the batch's pockets wait in order on the spur winding over it and open one after the other over the table, where the packer packs each order as its last item arrives](docs/screenshots/pocket-pack.png) |
| **Loading:** one item per pocket, at chest height | **Packing:** the pockets open over the table in order |
| ![Follow an order: its items picked into a tote at a loading station, then pockets, storage, the sequencer and the pack station](docs/screenshots/pocket-follow.png) | ![PocketFlow's control room: orders shipped, order to parcel, items sold from returns, pockets sent round, the rails on the map with every pocket in the colour of its state, and the batches in the sequencer](docs/screenshots/pocket-control.png) |
| **Follow an order:** from the shelving through its pockets to the parcel | **Control room:** the rails with every pocket, the batches in the sequencer |

PocketFlow is fashion e-commerce through an overhead pocket sorter. Orders are small (most of one or
two items) and about 40 % of what is sold comes back, so every item travels alone, in a pocket
hanging from a friction-driven rail. Pickers pick from shelving into totes for the loading stations;
returns that can be sold again come from the returns desk. An operator puts each item into an empty
pocket, held open at chest height where the rail comes down. Like FloorStack it is shown in 3D only.

**Storage and returns.** The pockets wait on storage rails across the main loop. A rail is first
in, first out, so an order's pocket goes behind pockets of older orders, where it is in nobody's way
when its turn comes. Returns wait on rails of their own as stock: a new order takes a return of its
article instead of having it picked, and about a quarter of everything sold never goes back to the
shelving. The price is moving pockets: a taken return is usually deep in a stock rail, and every
pocket in front of it has to go round the loop. Sweeping a stock rail once it holds several taken
returns costs far fewer moves than one each; it still comes to about two pockets sent round per item.

**The sequencer.** Once every item of an order is in storage, the order can go into a batch of up to
64 pockets for one pack station. The sequencer is two banks of eight lines and does a radix sort on
rails: pass 1 puts each pocket in bank A's line by the last digit of its place in the batch; the
lines are emptied one after the other into bank B by the first digit; emptied in turn again, the
pockets leave in exact order. A line lights up while it is being emptied. Over the pack station the
pockets open one after the other, and the packer packs each order as its last item drops.

**The numbers.** With 380 orders an hour the system keeps up: about 720 items an hour into pockets,
about 12 minutes from order to parcel. Turn returns off and the pockets are never sent round; double
them and the stock rails fill up. Try a smaller sequencer, fewer storage rails or other sweep
thresholds; Pocket cam rides a pocket round the loop.

### CaseCraft — mixed-case pallet DC

![CaseCraft in 3D: the structure of fourteen levels with its deck side open, the input and output lifts, the depalletising cells and the tunnel in front of the west half, the palletising cells, the wrapper and the stores' trucks at the south doors](docs/screenshots/case-3d.png)

| | |
|---|---|
| ![Level 9 alone: the shelves of sixteen aisles with cases of every print, the deck with its two lanes, bots driving along it and parked in their pockets](docs/screenshots/case-level.png) | ![A palletiser: the arm sets a case on a mixed pallet; the inspector shows the pallet's plan from the side, the cases placed so far and the rest in outline](docs/screenshots/case-pallet.png) |
| **A level:** bots on the deck and in the aisles, every case in its gap | **Palletising:** case by case, as planned |
| ![Follow a case: released for a pallet, waiting on its level's transfer shelf at the output lift for its turn](docs/screenshots/case-follow.png) | ![CaseCraft's control room: cases in and out, pallet fill, store orders, the structure on the map, the cells with the palletisers' time waiting for their next case](docs/screenshots/case-control.png) |
| **Follow a case:** from the supplier's pallet to the store's truck | **Control room:** cases in and out, pallet fill, the cells |

CaseCraft is a distribution centre for supermarkets. Suppliers deliver pallets of one product; a
store orders a few hundred cases of many products and wants them on mixed pallets it can wheel
straight into its aisles. A forklift unloads the suppliers' trucks onto a pallet conveyor, and a
robot arm in each depalletising cell takes the cases off one by one. A tunnel measures each case and
gives it its place. Like FloorStack it is shown in 3D only, and the Floors slider shows the levels
up to one, or one alone.

**The structure.** Fourteen levels of sixteen short aisles, shelves on both sides. A shelf is one
long plank: a case takes as much of it as it is wide, and a new case goes into the gap it fits best,
fast movers near the deck. On every level three bots drive along a deck with two lanes, one each
way, and into the aisles, where they reach under a case with their arms. A bot needs its aisle to
itself and reserves the stretch of lane it drives before it leaves; a bot that cannot go on waits in
its own parking pocket, so nothing locks up. Input lifts bring cases up to every level's transfer
shelves; each output lift serves one palletiser.

**Sequencing and the pallet planner.** A store order is planned into pallets as it comes in. Each
case gets its place where it ends up lowest, standing on at least three quarters of its base, and
only on cases that can carry it: crisps and toilet paper take nothing heavier than 5 kg. The
palletiser releases its pallet's cases in build order; the bots bring each to its output lift on
whatever level it is stored, and the lift takes them down in exactly that order, three at a time.
The arm stacks each where the plan says; the next places show as ghosts. Pallets are stretch-wrapped,
labelled and conveyed into the store's truck, which leaves when the order is complete.

**The numbers.** With 9 store orders an hour the DC handles about 2,200 cases an hour in and out:
about 55 store pallets an hour, some 40 cases each, 1.4 m high and a bit over half full; an order is
on its truck about 45 minutes after it came in. The output lifts are the busiest machines. Try the
build orders (stable, by store aisle, or a blend of both), fewer bots per level, or nearest instead
of best-fit storage; Follow a case follows one in or out, and Robot cam rides a bot.

### RoboValet — automated car park

![RoboValet in 3D at 08:30: the car park cut open on its south and west sides, five levels of parked cars, the cabins on the street with cars driving in, the lobby under its sign and the morning queue in the street](docs/screenshots/park-3d.png)

| | |
|---|---|
| ![Level 2 alone from above: bays with their numbers and the robots' floor markers, a robot carrying a car sideways down the aisle, the lift shafts at the back](docs/screenshots/park-level.png) | ![The lobby at 17:30: drivers waiting on the benches under the screen that lists their cars on the way down](docs/screenshots/park-lobby.png) |
| **A level:** a robot carries a car sideways down the aisle to its bay | **The evening rush:** drivers wait in the lobby for their cars |
| ![Follow a car: a saloon queueing in the street, with the panel showing where it is in its journey](docs/screenshots/park-follow.png) | ![RoboValet's control room at 17:30: driver wait and retrieval time, the street queue, the cabins held for cars on their way down, and the floors two by two with each bay coloured by how long its car has been in](docs/screenshots/park-control.png) |
| **Follow a car:** from the street through a cabin and a lift to its bay, or back out | **Control room:** waits, queues, the cabins, lifts and robots, every bay on the map |

RoboValet is an automated car park on five levels above a ground floor: the warehouse machinery
moving cars instead of totes. A driver drives into one of four entry/exit cabins on the street,
gets out, confirms at the terminal and walks off. Behind each cabin is a car lift, and a ground
robot carries the car across into it. On every level one robot takes the car off the lift and
parks it. Like FloorStack it is shown in 3D only, and the Floors slider shows the levels up to one,
or one alone.

**The robots.** A parking robot is a flat AGV, 12 cm high, that slides under a car, swings out
four pairs of arms round its tyres and lifts it a few centimetres. It moves sideways as easily as
forwards, so it carries cars sideways along the aisle and into their bays, and turns a car on the
spot. Robots never leave their floor and the lifts carry only the car, so there is no traffic
between robots; with no people upstairs, the levels are only 2.4 m high and have no ramps or
lights (Lights out shows them as they are).

**Coming back.** A driver returning walks into the lobby, pays at a kiosk and waits; 30 % order
the car in the app four minutes ahead. A free cabin whose lift is free too is held for the car:
the level robot fetches it and turns it round on the way, so it comes down facing the street;
the ground robot sets it in the cabin; the driver walks over and drives off. A lift takes one job
at a time and is booked only when it is free, which keeps everything free of deadlocks.

**The day.** The simulation starts at 06:00 with 40 residents' cars parked overnight. 120
commuters arrive around 08:15 and leave around 17:15; visitors come through the day. In the
morning a short queue forms in the street. In the evening rush drivers wait about 4 to 5 minutes
on average and the slowest tenth about 8, with nearly every cabin held for a car on its way down:
the cabins, not the robots, are the bottleneck. More app users, more cabins, or parking cars by
how long they stay (short stays near the lifts) shorten the wait; Call a car (Cars tab) brings any
car down now, and Follow a car follows one in or out.

## Development

```
index.html, css/landing.css, js/landing/   landing page and simulation previews
cubeflow.html, podswarm.html, railrunner.html, skystack.html, stackpilot.html, deeplane.html,
aislemate.html, zonehop.html, sorthub.html, floorstack.html, pocketflow.html, casecraft.html,
robovalet.html
            one line each: js/boot.js builds the shared page for that type and
            loads its scripts; css/style.css styles it
js/core/    util (RNG, heap), barcode (GS1 encoders), config (shared defaults)
js/sim/     shared engine: inventory (IMS), router (fleet manager), mover (fleet member base),
            robot (battery robot state machine, shared tasks such as driving through a
            station's queue lane), floor (cells, traffic heat and queue lanes of every robot
            floor), machine (shuttles, lifts, cranes), ports, orders (OMS, packing, dock),
            kpi, sim (loop, layout), rack (tote slots, seeding and conveyors of every racking
            type), prezone (racking with the stations in front of the aisles, pre-zone conveyor
            paths and putaway: RailRunner, SkyStack and DeepLane), totebots (mobile robots
            instead of the pre-zone loop: their floor, tasks and dispatch), belts (conveyor
            networks of belts that may climb: ZoneHop, FloorStack; PocketFlow's rails), disrupt (surges,
            breakdowns, charger faults, breaks)
js/render/  iso (shared isometric view: camera, input, primitives, robot overlays), stations
            (warehouse floor, stations, packing, dock), control (SCADA map + charts),
            rack (see-through racking), prezone (pre-zone conveyor, levels × aisles picking)
js/ui/      ui (panels, inspector, labels, scanning), rack (rack inspector for both rack types),
            share (the scenario in the page URL)
js/cube/    CubeFlow: config, grid, tasks (dig, store, restack), sim (seeding, dispatch,
            slotting), render, ui (KPI tiles, settings, stack inspector)
js/pod/     PodSwarm: config, floor, sim (dispatch, tasks, pod faces), render, ui
js/shuttle/ RailRunner: config, sim (shuttles, lifts, dispatch), render, ui
js/crane/   SkyStack: config, sim (crane cycles, crane-time storage policy, FEM 9.851), render, ui
js/acr/     StackPilot: config, sim (floor, trips, batching, aisle locking), render, ui
js/climb/   RackRider: config, sim (climbing, presenting at the station, on StackPilot's floor
            and racking), render, render3d, ui
js/pallet/  DeepLane: config, sim (lanes, carriers and satellites on RailRunner's machines,
            receiving and empty pallets), render, render3d, ui
js/amr/     AisleMate: config, floor, sim (batches, routes, stops, pickers), render, ui
js/zone/    ZoneHop: config, sim (orders with routes, A-frame,
            zones, RF, merge, closing line, sorter, vans, tote return), render, render3d, ui
js/sort/    SortHub: config, sim (parcels, inducts, chutes, tray loop, robot deck, bag workers),
            render, render3d, ui (its own tiles, tabs and settings)
js/tower/   FloorStack: config, building (where everything stands on the three floors), sim
            (belts and links between the floors on RailRunner's store, routing, tote lifts),
            docks (parcel spiral, sorter, roll cages, trucks, suppliers' pallets), people
            (walking, breaks, the goods lift), render, render3d, ui
js/pocket/  PocketFlow: config, sim (the rails on the shared belt network, stations, orders and
            returns, storage and stock rails, the two-pass sequencer), render (a placeholder: 3D
            only), render3d (rails, pockets, stations, the pocket cam), ui (tiles, Orders, Pockets
            and Returns tabs, order, pocket and rail inspectors)
js/case/    CaseCraft: config, sim (the structure, shelves and gaps, bots with lane and aisle
            reservations, lifts, robot arms, conveyors, the pallet planner, inbound and stores'
            orders, the doors), render (a placeholder: 3D only), render3d (the structure, bots,
            lifts, articulated arms, pallets, trucks), ui (tiles, Stores, Pallets and Stock tabs,
            order, pallet, case, product and shelf inspectors)
js/park/    RoboValet: config, sim (the building, cabins, robots and lifts on the shared machines,
            drivers, the day's demand, bay policies), render (a placeholder: 3D only), render3d
            (the car park, cars, robots, lifts, drivers, the street), ui (tiles, Cars and
            Levels tabs, car, bay and cabin inspectors)
test/run.js headless soak test with invariant checks:  node test/run.js [hours] [seed] [cube|pod|shuttle|crane|acr|climb|pallet|amr|zone|sort|tower|pocket|case|park] [settings JSON]
test/golden.js  regression check (npm test): runs every type for 2 h, seed 7, plus a few
            non-default settings (nearest putaway, robot arm stations, automated decanting,
            packing machines, no tunnelling, one-tote crane handler,
            one-way aisles, no picker zones, robot sorter, small pallets, transport robots, lifts between
            FloorStack's floors, cars parked by stay, a pocket sorter without returns, store pallets built by store aisle), and compares a fingerprint of stock, fleet, orders and KPIs
            with test/golden/<run>.txt
```

A refactor must leave `npm test` passing. A change that is meant to alter behaviour updates the
golden files with `node test/golden.js --update`, and the diff of those files goes in the same commit.

## Disclaimer

DarkStore is a simulation and teaching tool. It is not control software for real robots or storage
systems, and it must not be used as such. It is inspired by cube-storage, pod-robot, shuttle, stacker
crane, case-handling robot and pocket sorter systems and automated car parks in general and is not affiliated with, endorsed by or derived
from any vendor of such systems. All company names, addresses, products and barcodes in the
simulation are fictional.

## License

Licensed under the [Apache License, Version 2.0](LICENSE). Unless required by applicable law or agreed
to in writing, the software is distributed on an "AS IS" basis, without warranties or conditions of
any kind.
