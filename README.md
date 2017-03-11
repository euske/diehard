# Die Hard

A simplistic die designing game.

 * https://games.tabesugi.net/diehard/index.html

How to Play
-----------
 * Drag and drop the components. Double click to rotate.
   You have to fit everything within the die. Also all the connectors have to be
   wired properly. (Wiring is automatic.)
 * More bits = Bigger Register Unit, Control Unit and ALUs.
 * More registers = Bigger Register Unit and Control Unit.
 * More ALUs = Bigger Control Unit.
 * Longer wiring = Lower clock and more power-hungry.

Notice
------
The constants are set roughly to the 1970's technology (for now).
They could be changed as the technology advances,
and other kinds of components (Interrupt Controller or Cache)
could be added.

Prerequisites
-------------
 * TypeScript - http://www.typescriptlang.org/
 * d3.js - http://d3js.org/
 * npm-d3 - https://github.com/types/npm-d3/
