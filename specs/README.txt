DarkStore - specs
=================

The simulator should eventually cover several kinds of warehouse
automation, most of them goods-to-person. Each kind gets its own spec. The
parts that every kind shares (time model, orders, inventory, workstations,
output) are written down once, in common.txt.

  common.txt    shared rules, read this first
  cube.txt      cube storage: bins stacked in a grid, robots on top
                (implemented as CubeFlow)
  shuttle.txt   shuttle AS/RS: aisles of racking, a shuttle per level, lifts
                (implemented as RailRunner)
  pod.txt       pod robots: floor robots that carry whole shelving units
                (the Kiva-style system, implemented as PodSwarm)
  acr.txt       case-handling robots: floor robots with a mast that pick
                totes from ordinary shelving, several per trip
                (implemented as StackPilot)
  crane.txt     stacker crane AS/RS: one crane per aisle, mini-load (totes)
                or unit-load (pallets) (mini-load implemented as SkyStack)
  climb.txt     climbing robots: the second variant of acr.txt, robots that
                climb the racking and present the tote themselves
                (implemented as RackRider)
  pallet.txt    pallet shuttle store: deep lanes, a carrier with a satellite
                per level, lifts (implemented as DeepLane)
  sort.txt      parcel sorter: a tilt-tray loop or a robot sorter sorting a
                parcel stream into chutes (no stock; implemented as SortHub)
  pharma.txt    pharmacy wholesale: order totes travel past an A-frame and
                picking zones to a closing line and route lanes (not
                goods-to-person; implemented as ZoneHop)
  amr.txt       robots alongside pickers: people still pick from ordinary
                shelving, robots carry the order totes to them (not
                goods-to-person; implemented as AisleMate)
  tower.txt     a multi-storey building: a shuttle store, picking and the
                dock on three floors, linked by spirals and lifts
                (implemented as FloorStack)
  prezone-robots.txt
                a variant of shuttle.txt, crane.txt and pallet.txt: mobile
                robots instead of the pre-zone conveyor loop between the
                racking and the stations (in RailRunner and SkyStack)

Each type spec follows the same outline:

  1. Overview         what the system looks like
  2. Layout           how storage is addressed in the model
  3. Equipment        what moves, and how fast
  4. Retrieval        how a storage unit gets from its location to a station
  5. Traffic          what can block what
  6. Storage policy   where units go when they come back
  7. Output           numbers on top of the common ones
  8. Parameters       defaults to start with

The numbers under Parameters are typical values for the kind of system, good
enough for a first model. They are not taken from any one product.
