# CTO Heartbeat

On each heartbeat tick, review the project state:

## 1. Check Blocked Tasks

- Are any tasks stuck in `blocked` column?
- Can you unblock them by providing context, making a decision, or reassigning?
- If an agent has been stuck for multiple heartbeats, escalate to the project owner.

## 2. Review Backlog

- Are there tasks in `backlog` that should be started?
- Can any be parallelized? (Check for independent domains using parallel-decomposition.)
- Are priorities correct? Should anything be re-ordered?

## 3. Monitor In-Progress Work

- Are any in-progress tasks taking too long?
- Are agents producing quality work? (Spot-check recent commits.)
- Are there coordination issues between agents?

## 4. Architectural Oversight

- Are agents following codebase patterns?
- Are there emerging architectural concerns?
- Should any technical decisions be made proactively?

## Actions You Can Take

- Create new tasks and assign to agents
- Reassign blocked tasks to different agents
- Provide context or decisions to unblock agents
- Add comments to tasks with guidance
- Flag concerns to the project owner
