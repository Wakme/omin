import type { ExecutionState } from "../types/index.js";

const VALID_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
  idle: ["executing"],
  executing: ["idle", "error"],
  error: ["idle", "executing"],
};

export class StateMachine {
  private states = new Map<string, ExecutionState>();

  get(id: string): ExecutionState {
    return this.states.get(id) ?? "idle";
  }

  transition(id: string, to: ExecutionState): ExecutionState {
    const from = this.get(id);
    if (!VALID_TRANSITIONS[from].includes(to)) {
      throw new Error(`Invalid transition: ${from} -> ${to}`);
    }
    this.states.set(id, to);
    return to;
  }

  init(id: string, state: ExecutionState = "idle"): void {
    this.states.set(id, state);
  }

  delete(id: string): void {
    this.states.delete(id);
  }
}
