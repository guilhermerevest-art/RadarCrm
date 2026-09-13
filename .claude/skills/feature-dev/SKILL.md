# Feature Development Plugin

A comprehensive, structured workflow for feature development with specialized agents for codebase exploration, architecture design, and quality review.

## Command: `/feature-dev`

Launches a guided feature development workflow with 7 distinct phases.

**Usage:**
```bash
/feature-dev Add user authentication with OAuth
```

Or simply:
```bash
/feature-dev
```

## The 7-Phase Workflow

### Phase 1: Discovery
Understand what needs to be built - clarifies the feature request

### Phase 2: Codebase Exploration
Launches `code-explorer` agents to analyze existing code and patterns

### Phase 3: Clarifying Questions
Fill in gaps and resolve ambiguities (waits for your answers)

### Phase 4: Architecture Design
Design multiple implementation approaches with `code-architect` agents

### Phase 5: Implementation
Build the feature following chosen architecture (waits for approval)

### Phase 6: Quality Review
Launches `code-reviewer` agents to check for bugs, quality issues

### Phase 7: Summary
Document what was accomplished and suggested next steps

## Agents

### `code-explorer`
Deeply analyzes existing codebase features by tracing execution paths

### `code-architect`
Designs feature architectures and implementation blueprints

### `code-reviewer`
Reviews code for bugs, quality issues, and project conventions (confidence ≥80)

## When to Use

**Use for:**
- New features that touch multiple files
- Features requiring architectural decisions
- Complex integrations with existing code
- Features where requirements are somewhat unclear

**Don't use for:**
- Single-line bug fixes
- Trivial changes
- Well-defined, simple tasks
- Urgent hotfixes

## Tips

- Be specific in your feature request for fewer clarifying questions
- Trust the process - each phase builds on the previous
- Don't skip phases - each serves a purpose
- Use for learning - exploration teaches about your codebase
