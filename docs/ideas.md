# DarkStore feature ideas

This is the list of possible next features for DarkStore. Items are numbered so they can be referred to by number.

DarkStore currently has five storage types: CubeFlow (cube AS/RS), PodSwarm (pod robots), RailRunner (shuttle AS/RS), SkyStack (stacker crane AS/RS) and StackPilot (case-handling robots).

## Around the existing storage types

### 1. Automated picking at the station

**Status:** Built: robot pick stations in Settings (CubeFlow, PodSwarm, RailRunner, SkyStack, StackPilot), with operator assist or routing at release.

A robot arm picks instead of the operator. It is slower per item and fails on some products (soft, shiny, heavy), so a person handles the exceptions. This mostly changes how pick time and errors are worked out in the existing station model.

Answers: how many picks a day can an arm really take over?

### 2. Automated packing and order consolidation

**Status:** Packing machines built (auto-baggers and box-making machines, in Settings). Order consolidation still open: it needs orders split over several stations first.

Auto-bagging and box-making machines, plus a sorter that combines totes from several stations into one order. Packing currently caps the default PodSwarm site at about 700 lines/h.

### 3. Automated unloading and decanting at goods-in

**Status:** Built: automated goods-in stations in Settings (robotic decanting cells, operator for items they cannot tip).

A machine opens cartons and tips goods into totes instead of a person. A variation on the existing goods-in model.

### 4. Storage across two levels

**Status:** Idea

A mezzanine with a lift between floors, as real cube and pod sites do when floor space runs out. This introduces the lift as a new bottleneck.

## New types for the landing page

### 5. Autonomous mobile robots working alongside pickers

**Status:** Built as AisleMate (`aislemate.html`)

Locus / 6 River style: pickers walk through ordinary shelving and robots carry the order totes to them. The most common entry-level automation, and a useful contrast with goods-to-person. Can reuse the robot floor, routing and charging code.

### 6. A sorting system

**Status:** Built as SortHub (`sorthub.html`): tilt-tray loop and robot sorter, a setting.

A tilt-tray loop or a floor of small sorting robots: a high-volume parcel or item sorter, often placed after storage. Key questions are recirculation and how many chutes. The recirculation logic of the SkyStack/RailRunner pre-zone loop can carry over.

### 7. Pallet handling

**Status:** Idea

An automated pallet crane store (an extension of SkyStack), or autonomous forklifts moving pallets between goods-in, storage and loading.

### 8. A pallet store with pallet shuttles

**Status:** Idea

Denser than SkyStack. RailRunner's code fits it closely.

## Across the whole warehouse

### 9. Comparing the systems on the same order profile

**Status:** Idea

Run the same orders, product range and target lines/h through every storage type, and compare floor space, robot count, cost and throughput. The simulators already share orders, stock and stations, so this mainly needs one comparison page.

### 10. Peak days and failures

**Status:** Idea

A Black Friday order surge, a robot breaking down, a lost charger, an operator break. Shows how robust each system is, not just how fast.

### 11. Dispatching parcels to the hub

**Status:** Idea

Connect SortHub to the storage simulations: their packed parcels feed the sorter instead of going straight onto one truck, and leave by carrier or route from several dock doors. Realistic (fulfilment centre → sortation → carriers) without needing a new storage type.

### 12. Cost and payback

**Status:** Idea

Rough capital and labour costs per system and per automation (robot arms, decanting cells, packing machines, robots, pickers). The control room shows the cost per order line, so a question like "is a robot arm worth it?" gets an answer. Pairs naturally with 9.

### 13. Learning mode and guided scenarios

**Status:** Idea

Short challenges with a goal, such as "the pick stations are starving: fix it with the settings" or "reach 4000 parcels/h with the fewest robots". Makes the teaching purpose of the simulator explicit.

### 14. Save and share a scenario

**Status:** Idea

The settings encoded in the page URL, so a link opens exactly the setup you are looking at. Small, and makes comparisons easy to share.

### 15. Shifts and labour

**Status:** Idea

Operators, pickers and bag workers with shifts, breaks and different speeds. Several bottlenecks found so far were people rather than machines (pickers in AisleMate, bag workers in SortHub), so this makes the people side as real as the robots.

### 16. Tilt-tray control room

**Status:** Idea

With SortHub's tilt-tray loop the control room's fleet chart and table stay empty: there are no robots. Show tray occupancy there instead. Small, but the gap is visible today.

## More types for the landing page

### 17. Climbing robots in racking

**Status:** Idea

Robots drive on the floor and climb straight up the racking to fetch a tote (Exotec Skypod style). Sits between StackPilot and RailRunner: the climb is fast, but a climbing robot blocks its column. Already noted as not modelled yet in StackPilot.

### 18. Vertical lift modules and carousels

**Status:** Idea

Tall cabinets whose trays come to a hatch where an operator picks: the classic small-parts system in factories, pharmacies and spare-parts stores. The simplest new type.

### 19. Pick-to-light flow racks

**Status:** Idea

Carton flow racks along a conveyor; order totes move from zone to zone and lights show what to pick in each. The traditional high-throughput setup, a good baseline against goods-to-person.

### 20. Micro-fulfilment store

**Status:** Idea

A small cube or shuttle in the back of a supermarket, picking online orders for collection and delivery, with a ready-for-collection buffer and time slots. Reuses CubeFlow; what changes is the demand, with peaks around collection times.

### 21. Cold store and freezer

**Status:** Idea

A variant setting rather than a new mechanism: slower robots, shorter battery life, people working in short shifts. Fits with 15.

## Visuals

### 22. Lights-out mode in 3D

**Status:** Idea

Day and night lighting: in lights-out mode only the robots' status lights and the stations are lit, which makes the DarkStore name literal. Cheap in three.js, high impact.

### 23. Follow an order or a parcel

**Status:** Idea

Click an order and the camera follows it from release through picking, packing and the truck, or a parcel through the sorter. Good for demos and teaching.

### 24. Heat overlays in 3D

**Status:** Idea

Traffic, waiting and bag fill as a coloured layer on the 3D floor, as the isometric view already has for some types.

### 25. Better people

**Status:** Idea

Walking animation for pickers and bag workers (they glide now), operators turning to face their work, hi-vis colours by role.

### 26. Smoother robots in 3D

**Status:** Idea

Robots turn on the spot by snapping. Animate the turn, and add small details up close (wheels, lidar, status LEDs) so they read as real machines.

### 27. Mini-map in 3D

**Status:** Idea

A small top-down map in a corner showing where the camera is, helpful once you have walked into an aisle.

## Suggested order

Built so far: 1, 2 (packing machines), 3, 5 (AisleMate) and 6 (SortHub). Next: 10, because every system now runs only on a calm, steady day, and a surge or a breakdown shows which ones cope. 16 is a quick fix to fold in along the way. Then 9 with 12, which together answer "which system, and is it worth it?". 9 is on hold for now. For impact against effort, 22 (lights-out mode) is the best visual; 17 (climbing robots) the most interesting new type.
