import { StrategicSolver, type StrategicRequest, type StrategicResponse } from "./strategicSolver.ts";

let solver: StrategicSolver | undefined;
self.onmessage = (event: MessageEvent<StrategicRequest>) => {
  const { id, width, masks, cell, lastAttempt } = event.data;
  let response: StrategicResponse;
  try {
    if (solver?.width !== width) solver = new StrategicSolver(width);
    response = { id, decision: solver.decide(masks, cell, lastAttempt) };
  } catch (error) {
    response = { id, error: error instanceof Error ? error.message : "Strategy evaluation failed." };
  }
  self.postMessage(response);
};
