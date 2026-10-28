# Blue Surf tools

Local client for one person's Blue Surf session, plus the skills and rules that harnesses load for the engineering workflow around it.

## Language

**Harness**:
Cursor, Codex, or Claude Code. Each one loads skills and rules from its own configuration.
_Avoid_: agent, IDE, tool

**Blue Surf skills**:
The skills that talk to Surf and Obsidian: ticket, sprint, sprint-review, move, and mine.
_Avoid_: Surf commands, the CLI

**Matt Pocock skills**:
The external engineering skills the router sends work to, such as grill, spec, implement, and review (from mattpocock/skills — treat as immutable). **functional-test** is a Blue Surf skill in this repo, orchestrated by **bluesurf-ticket** after implement.
_Avoid_: the workflow, the skill pack

**Managed section**:
The part of a harness rules file that setup owns and replaces on the next run.
_Avoid_: the rules file

**Setup**:
This machine's skills, rules, and Surf session for the harnesses you use.
_Avoid_: bootstrap
