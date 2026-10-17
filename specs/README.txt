DarkStore - specs
=================

The simulator should eventually cover several kinds of goods-to-person
warehouse automation. Each kind gets its own spec. The parts that every kind
shares (time model, orders, inventory, workstations, output) are written down
once, in common.txt.

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
