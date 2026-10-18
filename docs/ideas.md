# DarkStore feature ideas

This is the list of possible next features for DarkStore. Items are numbered so they can be referred to by number.

DarkStore currently has five storage types: CubeFlow (cube AS/RS), PodSwarm (pod robots), RailRunner (shuttle AS/RS), SkyStack (stacker crane AS/RS) and StackPilot (case-handling robots).

## Around the existing storage types

### 1. Automated picking at the station

**Status:** Idea

A robot arm picks instead of the operator. It is slower per item and fails on some products (soft, shiny, heavy), so a person handles the exceptions. This mostly changes how pick time and errors are worked out in the existing station model.

Answers: how many picks a day can an arm really take over?

### 2. Automated packing and order consolidation

**Status:** Packing machines built (auto-baggers and box-making machines, in Settings). Order consolidation still open: it needs orders split over several stations first.

Auto-bagging and box-making machines, plus a sorter that combines totes from several stations into one order. Packing currently caps the default PodSwarm site at about 700 lines/h.

### 3. Automated unloading and decanting at goods-in

**Status:** Idea

A machine opens cartons and tips goods into totes instead of a person. A variation on the existing goods-in model.

### 4. Storage across two levels

**Status:** Idea

A mezzanine with a lift between floors, as real cube and pod sites do when floor space runs out. This introduces the lift as a new bottleneck.

## New types for the landing page

### 5. Autonomous mobile robots working alongside pickers

**Status:** Built as AisleMate (`aislemate.html`)

Locus / 6 River style: pickers walk through ordinary shelving and robots carry the order totes to them. The most common entry-level automation, and a useful contrast with goods-to-person. Can reuse the robot floor, routing and charging code.

### 6. A sorting system

**Status:** Idea

A tilt-tray loop or a floor of small sorting robots: a high-volume parcel or item sorter, often placed after storage. Key questions are recirculation and how many chutes. The recirculation logic of the SkyStack/RailRunner pre-zone loop can carry over.

### 7. Pallet handling

**Status:** Idea

An automated pallet crane store (an extension of SkyStack), or autonomous forklifts moving pallets between goods-in, storage and loading.

### 8. A pallet store with pallet shuttles

**Status:** Idea

Denser than SkyStack. RailRunner's code fits it closely.

## Across the whole warehouse

### 9. Comparing the five types on the same order profile

**Status:** Idea

Run the same orders, product range and target lines/h through every type, and compare floor space, robot count, cost and throughput. The simulators already share orders, stock and stations, so this mainly needs one comparison page.

### 10. Peak days and failures

**Status:** Idea

A Black Friday order surge, a robot breaking down, a lost charger, an operator break. Shows how robust each system is, not just how fast.

## Suggested order

Do 9 first, because it uses the most of what is already built. Then 2, because it removes a real throughput limit. 5, the most familiar real-world system that was missing, is now built as AisleMate.
