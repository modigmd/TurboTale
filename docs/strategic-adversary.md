# Strategic adversary

The final board uses a separate policy and inference engine, not WorstCaseOracle or a subclass. Hidden monster arrangements are represented by one bit mask per interior row. No particular complete arrangement is committed in advance.

## Legal knowledge

A perfect matching between monster rows and columns represents a legal board. One dummy row accounts for the unused column. After finding a matching, orient matched edges column-to-row and unmatched edges row-to-column. A matched edge or an edge on an alternating cycle can occur in some legal arrangement; strongly connected components identify these edges. Removing all unsupported edges gives the exact possible-monster masks. A zero bit therefore means logically guaranteed safe, not merely probable.

Safe and monster observations shrink this set of arrangements. Every chosen answer has a nonempty matching, so all observations remain consistent with a single fixed board. The observations are separate from logical inference and visual queries; inferred-safe unvisited cells keep their closed-box artwork.

## Exact value

Let V(K) be the minimum worst-case number of future monster hits required from knowledge K. The current position has a visited-safe trail back to the top, so using the top safe component loses no information or movement opportunity. Movement length is not the objective.

V(K)=0 precisely when guaranteed-safe cells connect the top and bottom. To test V(K)<=1, examine unknown cells bordering that component. A probe is admissible only when its monster outcome leaves a guaranteed-safe crossing. Simulate an admissible safe outcome and repeat. Additional safe information cannot make a strategy harder, so the order of admissible probes does not affect the result. Reaching the bottom proves V<=1; having no admissible first probe disproves it. If neither test succeeds, V=2 by the IMO three-attempt upper bound. Already-known monsters and extra safe information cannot make that original strategy harder.

For a requested unknown cell, compare V(safe child) with 1+V(monster child), discarding impossible outcomes. Choose the larger value and choose safe on equality. With one attempt remaining, a legal monster ends the game immediately. This punishes mistakes through legal outcomes; it does not grade against one prescribed path or refuse a valid crossing.

## Execution

The pure solver runs in a module Web Worker. Each request contains a snapshot of the knowledge masks; its result is committed only to the active run. Duplicate steps are dropped while a decision is pending. Disposing a run terminates its worker and invalidates outstanding replies. Errors leave position, attempts, and observations unchanged, permitting a retry. No timeout substitutes a greedy answer. The worker cache is limited to 4,096 entries; frontier ordering changes evaluation cost, not the value.

## Sources and validation

- [Official IMO 2024 solutions, C4](https://www.imo-official.org/assets/documents/problems/2024/IMO2024SL.pdf): the three-attempt strategy and lower bound.
- [Bebras 2017 Hidden seeds](https://github.com/France-ioi/bebras-tasks/blob/master/bebras/2017/2017-FR-04-faulty-wire/index.html): adversarial answers preserve the larger possible hiding region.
- [Bebras 2018 Treasure](https://github.com/France-ioi/bebras-tasks/blob/master/bebras/2018/2018-FR-05-treasure/task.js): a distinct example with explicit strategy grading. TurboTale does not adopt that extra win condition.

The implementation is original; these sources guide the mathematical rules and interaction approach. Tests independently enumerate all 24 legal 4×5 boards and all 1,415 observation-definable knowledge states, comparing values and decisions with exhaustive recursive minimax. Full-size tests exercise all 24 first-entry columns, both edge strategies, repeated bad guesses, history consistency, cache limits, and asynchronous cancellation/retry.
